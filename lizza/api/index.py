import hashlib, os, redis, math, smtplib, base64, json
from email.mime.text import MIMEText
from typing import Optional 
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, File, UploadFile, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy.exc import IntegrityError

try:
    from .database import SessionLocal, User, EmployeeLocation, OfficeLocation, init_db, cipher
except ImportError:
    from database import SessionLocal, User, EmployeeLocation, OfficeLocation, init_db, cipher

app = FastAPI()
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True) if redis_url else None
init_db()
PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

# --- SCHEMAS ---
class AuthRequest(BaseModel): 
    email: str
    password: str

class PasswordChange(BaseModel): 
    email: str
    old_password: str
    new_password: str

class LocationCreate(BaseModel): 
    name: str
    lat: float
    lon: float
    radius: int

# --- HELPERS ---
def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def get_secure_hash(password: str, salt: str):
    return hashlib.sha256((password + salt + PEPPER).encode()).hexdigest()

def process_upload_base64(upload_file: UploadFile, max_size_mb: int = 5) -> str:
    if not upload_file or not upload_file.filename: return None
    content = upload_file.file.read()
    if len(content) > max_size_mb * 1024 * 1024:
        raise HTTPException(400, detail="File too large")
    return f"data:{upload_file.content_type};base64,{base64.b64encode(content).decode('utf-8')}"

def send_onboarding_email(to_email, full_name, temp_password, login_email):
    user = os.environ.get("SMTP_USER") 
    pw = os.environ.get("SMTP_PASS")
    host = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    if not user or not pw: return False
    try:
        body = f"Hello {full_name},\n\nYour account is verified.\nEmail: {login_email}\nPassword: {temp_password}"
        msg = MIMEText(body)
        msg['Subject'], msg['From'], msg['To'] = "LIZZA - Verification Successful", user, to_email
        with smtplib.SMTP(host, 587) as server:
            server.starttls()
            server.login(user, pw)
            server.sendmail(user, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"Email Error: {e}")
        return False

# --- AUTH & PROFILE ---
@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user or get_secure_hash(data.password, user.salt) != user.password:
        raise HTTPException(401, detail="Invalid credentials")
    if not user.is_verified and user.user_type != 'admin':
        raise HTTPException(403, detail="Pending Admin Verification")
    return {"user_id": user.id, "user": user.full_name, "user_type": user.user_type, "force_password_change": not user.is_password_changed}

@app.get("/api/user/profile")
def get_user_profile(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id, "full_name": user.full_name, "email": user.email, "user_type": user.user_type,
        "blockchain_id": user.blockchain_id, "shift_start": user.shift_start, "shift_end": user.shift_end,
        "is_verified": user.is_verified, "location_id": user.location_id, "is_present": user.is_present
    }

@app.post("/api/change-password")
def change_password(data: PasswordChange, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user: raise HTTPException(404, detail="User not found")
    if get_secure_hash(data.old_password, user.salt) != user.password:
        raise HTTPException(401, detail="Current password incorrect")
    user.password = get_secure_hash(data.new_password, user.salt)
    user.is_password_changed = True
    db.commit()
    return {"status": "success"}

# --- MANAGER DASHBOARD ROUTES ---
@app.post("/api/manager/add-employee")
async def add_employee(
    first_name: str = Form(...), 
    last_name: str = Form(...), 
    personal_email: str = Form(...),
    phone_number: str = Form(...), 
    dob: str = Form(...), 
    designation: str = Form(...), 
    department: str = Form(...), 
    aadhar_number: str = Form(...),
    pan_number: str = Form(...), 
    manager_id: int = Form(...), 
    location_id: Optional[int] = Form(None),
    # Use 0.0 as default to prevent validation errors on empty experience fields
    experience_years: Optional[float] = Form(0.0), 
    profile_photo: UploadFile = File(None), 
    filled_form: UploadFile = File(None), 
    db: Session = Depends(get_db)
):
    # Normalize email and generate temp password
    base_email = f"{first_name.lower()}.{last_name.lower()}@lizza.com"
    
    try:
        initial_pw = datetime.strptime(dob, "%Y-%m-%d").strftime("%d%m%Y")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Date of Birth format. Use YYYY-MM-DD.")

    salt = hashlib.sha256(base_email.encode()).hexdigest()[:16]
    
    new_user = User(
        first_name=first_name, 
        last_name=last_name, 
        full_name=f"{first_name} {last_name}",
        email=base_email, 
        personal_email=personal_email, 
        phone_number=phone_number,
        password=get_secure_hash(initial_pw, salt), 
        salt=salt, 
        user_type="employee", 
        manager_id=manager_id, 
        location_id=location_id, 
        is_verified=False, 
        dob=dob,
        designation=designation, 
        department=department,
        experience_years=experience_years,
        aadhar_enc=cipher.encrypt(aadhar_number.encode()).decode(),
        pan_enc=cipher.encrypt(pan_number.encode()).decode(),
        profile_photo_path=process_upload_base64(profile_photo),
        filled_form_path=process_upload_base64(filled_form, 2)
    )
    
    db.add(new_user)
    db.commit()
    return {"status": "success", "official_email": base_email}

@app.get("/api/manager/my-employees")
def get_my_employees(manager_id: int, db: Session = Depends(get_db)):
    return db.query(User).filter(User.manager_id == manager_id).all()

@app.get("/api/manager/live-tracking")
def get_manager_live_tracking(manager_id: int, db: Session = Depends(get_db)):
    team = db.query(User).filter(User.manager_id == manager_id, User.is_verified == True).all()
    results = []
    for m in team:
        coords = r.get(f"loc:{m.email}") if r else None
        lat, lon = (None, None)
        if coords:
            try:
                parts = coords.split(',')
                lat, lon = float(parts[0]), float(parts[1])
            except: pass
        results.append({"email": m.email, "name": m.full_name, "lat": lat, "lon": lon, "present": m.is_present})
    return results

@app.websocket("/ws/tracking/{manager_id}")
async def websocket_tracking(websocket: WebSocket, manager_id: int):
    await websocket.accept()
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect: pass

# --- ADMIN ROUTES ---
@app.post("/api/admin/verify-employee")
def verify_employee(target_email: str, admin_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == target_email).first()
    if not user: raise HTTPException(404, "User not found")
    user.blockchain_id = f"LZ-{hashlib.sha256(user.email.encode()).hexdigest()[:10]}".upper()
    user.is_verified = True
    db.commit()
    send_onboarding_email(user.personal_email, user.full_name, user.dob.replace("-",""), user.email)
    return {"status": "success"}

@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)):
    return db.query(User).all()

@app.get("/api/admin/locations")
def get_locations(db: Session = Depends(get_db)): 
    return db.query(OfficeLocation).all()

@app.post("/api/admin/add-location")
def add_location(data: LocationCreate, db: Session = Depends(get_db)):
    db.add(OfficeLocation(**data.dict()))
    db.commit()
    return {"message": "Location Added"}

@app.get("/api/admin/live-tracking")
def get_live_tracking(admin_email: str, db: Session = Depends(get_db)):
    users = db.query(User).filter(User.is_verified == True).all()
    results = []
    for u in users:
        coords = r.get(f"loc:{u.email}") if r else None
        lat, lon = (None, None)
        if coords:
            try:
                parts = coords.split(',')
                lat, lon = float(parts[0]), float(parts[1])
            except: pass
        results.append({"email": u.email, "name": u.full_name, "lat": lat, "lon": lon, "present": u.is_present})
    return results

@app.post("/api/admin/update-employee-inline")
def update_employee_inline(data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.get("email")).first()
    if not user: raise HTTPException(404, "User not found")
    user.location_id = data.get("location_id")
    user.shift_start = data.get("shift_start")
    user.shift_end = data.get("shift_end")
    user.user_type = data.get("user_type")
    db.commit()
    return {"status": "updated"}

@app.delete("/api/admin/delete-employee/{user_id}")
def delete_employee(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user: db.delete(user); db.commit()
    return {"status": "deleted"}

@app.delete("/api/admin/delete-location/{loc_id}")
def delete_location(loc_id: int, db: Session = Depends(get_db)):
    loc = db.query(OfficeLocation).filter(OfficeLocation.id == loc_id).first()
    if loc: db.delete(loc); db.commit()
    return {"status": "deleted"}

# --- USER & LOCATION TRACKING ---
def get_distance(lat1, lon1, lat2, lon2):
    R = 6371000 
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or not user.location_id: return {"status": "error"}
    office = db.query(OfficeLocation).filter(OfficeLocation.id == user.location_id).first()
    if r: r.set(f"loc:{email}", f"{lat},{lon}", ex=60)
    
    is_inside = get_distance(lat, lon, office.lat, office.lon) <= office.radius
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")

    if is_inside:
        grace_end = (datetime.strptime(user.shift_start, "%H:%M") + timedelta(minutes=15)).strftime("%H:%M")
        if not user.is_present and user.shift_start <= now_str <= grace_end:
            user.is_present = True
            db.commit()
            return {"is_inside": True, "status": "normal", "message": "Marked Present"}
        return {"is_inside": True, "status": "normal", "message": "On Duty"}
    
    return {"is_inside": False, "status": "warning", "message": "Outside Geofence"}
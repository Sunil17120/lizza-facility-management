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

def process_upload_base64(upload_file: UploadFile, max_size_mb: int = 5) -> str:
    if not upload_file or not upload_file.filename: return None
    content = upload_file.file.read()
    if len(content) > max_size_mb * 1024 * 1024:
        raise HTTPException(400, detail="File too large")
    return f"data:{upload_file.content_type};base64,{base64.b64encode(content).decode('utf-8')}"

# --- EMAIL SERVICE ---
SMTP_USER = os.environ.get("SMTP_USER", "your-email@gmail.com")
SMTP_PASS = os.environ.get("SMTP_PASS", "your-app-password")

def send_onboarding_email(to_email, full_name, temp_password, login_email):
    body = f"Hello {full_name},\n\nYour account is verified.\nEmail: {login_email}\nPassword: {temp_password}"
    msg = MIMEText(body)
    msg['Subject'], msg['From'], msg['To'] = "LIZZA - Verification Successful", SMTP_USER, to_email
    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls(); server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
        return True
    except: return False

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def get_secure_hash(password: str, salt: str):
    return hashlib.sha256((password + salt + PEPPER).encode()).hexdigest()

class AuthRequest(BaseModel): email: str; password: str
class PasswordChange(BaseModel): email: str; old_password: str; new_password: str
class LocationCreate(BaseModel): name: str; lat: float; lon: float; radius: int

# --- GENERAL ROUTES ---
@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user or get_secure_hash(data.password, user.salt) != user.password:
        raise HTTPException(401, detail="Invalid credentials")
    if not user.is_verified and user.user_type != 'admin':
        raise HTTPException(403, detail="Pending Admin Verification")
    return {"user_id": user.id, "user": user.full_name, "user_type": user.user_type, "force_password_change": not user.is_password_changed}

@app.post("/api/manager/add-employee")
async def add_employee(
    first_name: str = Form(...), last_name: str = Form(...), personal_email: str = Form(...),
    phone_number: str = Form(...), dob: str = Form(...), father_name: str = Form(None),
    mother_name: str = Form(None), blood_group: str = Form(None), emergency_contact: str = Form(None),
    designation: str = Form(...), department: str = Form(...), experience_years: float = Form(0.0),
    prev_company: str = Form(None), prev_role: str = Form(None), aadhar_number: str = Form(...),
    pan_number: str = Form(...), manager_id: int = Form(...), user_type: str = Form("employee"),
    location_id: Optional[int] = Form(None), shift_start: str = Form("09:00"), shift_end: str = Form("18:00"),
    profile_photo: UploadFile = File(None), aadhar_photo: UploadFile = File(None), pan_photo: UploadFile = File(None),
    filled_form: UploadFile = File(None), db: Session = Depends(get_db)
):
    base_email = f"{first_name.lower()}.{last_name.lower()}@lizza.com"
    initial_password = datetime.strptime(dob, "%Y-%m-%d").strftime("%d%m%Y")
    salt = hashlib.sha256(base_email.encode()).hexdigest()[:16]
    
    new_user = User(
        first_name=first_name, last_name=last_name, full_name=f"{first_name} {last_name}",
        email=base_email, personal_email=personal_email, phone_number=phone_number,
        password=get_secure_hash(initial_password, salt), salt=salt, user_type=user_type, 
        manager_id=manager_id, location_id=location_id,
        is_verified=False, dob=dob, father_name=father_name, mother_name=mother_name, 
        blood_group=blood_group, emergency_contact=emergency_contact, designation=designation, 
        department=department, experience_years=experience_years, prev_company=prev_company, prev_role=prev_role,
        aadhar_enc=cipher.encrypt(aadhar_number.encode()).decode(),
        pan_enc=cipher.encrypt(pan_number.encode()).decode(),
        profile_photo_path=process_upload_base64(profile_photo),
        aadhar_photo_path=process_upload_base64(aadhar_photo),
        pan_photo_path=process_upload_base64(pan_photo),
        filled_form_path=process_upload_base64(filled_form, 2)
    )
    db.add(new_user); db.commit()
    return {"status": "success"}

@app.post("/api/admin/verify-employee")
def verify_employee(target_email: str, admin_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == target_email).first()
    bc_hash = hashlib.sha256(f"{user.email}{datetime.utcnow()}".encode()).hexdigest()
    user.blockchain_id = f"LZ-{bc_hash[:10]}".upper()
    user.is_verified = True
    db.commit()
    send_onboarding_email(user.personal_email, user.full_name, user.dob.replace("-",""), user.email)
    return {"status": "success", "id": user.blockchain_id}

@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)):
    return db.query(User).all()

@app.get("/api/admin/employee-doc")
def get_doc(email: str, doc_type: str, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.email == email).first()
    return {"data": getattr(u, f"{doc_type}_path")}

# --- LOCATION MONITORING LOGIC (RESTORED) ---
def get_distance(lat1, lon1, lat2, lon2):
    R = 6371000 
    phi1, phi2, dphi, dlambda = math.radians(lat1), math.radians(lat2), math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or not user.location_id: raise HTTPException(status_code=404, detail="User or office not found")
    office = db.query(OfficeLocation).filter(OfficeLocation.id == user.location_id).first()
    if r: r.set(f"loc:{email}", f"{lat},{lon}", ex=60)
    is_inside = get_distance(lat, lon, office.lat, office.lon) <= office.radius
    
    now_utc = datetime.utcnow(); now_ist = now_utc + timedelta(hours=5, minutes=30); now_str = now_ist.strftime("%H:%M")
    status_response = {"is_inside": is_inside, "status": "normal", "message": "On Duty", "warning_seconds": 0}

    if is_inside:
        if r: r.delete(f"oob:{email}")
        grace_end = (datetime.strptime(user.shift_start, "%H:%M") + timedelta(minutes=15)).strftime("%H:%M")
        if not user.is_present:
            if now_str >= user.shift_start and now_str <= grace_end: user.is_present = True; status_response["message"] = "Marked Present"
        db.commit()
        return status_response
    return status_response

@app.get("/api/admin/locations")
def get_locations(db: Session = Depends(get_db)): return db.query(OfficeLocation).all()

@app.post("/api/admin/add-location")
def add_location(data: LocationCreate, db: Session = Depends(get_db)):
    db.add(OfficeLocation(**data.dict()))
    db.commit()
    return {"message": "Location Added"}
@app.get("/api/user/profile")
def get_user_profile(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "user_type": user.user_type,
        "blockchain_id": user.blockchain_id,
        "shift_start": user.shift_start,
        "shift_end": user.shift_end,
        "is_verified": user.is_verified,
        "location_id": user.location_id
    }
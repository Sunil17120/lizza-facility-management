import hashlib, os, redis, math, smtplib, base64, requests
from email.mime.text import MIMEText
from typing import Optional 
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import extract 
from pydantic import BaseModel
from datetime import datetime, timedelta
from .database import SessionLocal, User, OfficeLocation, FieldVisitLog, init_db, cipher

app = FastAPI()
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True) if redis_url else None
init_db()
PEPPER = os.environ.get("SECRET_PEPPER", "change_me")

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

def process_upload_base64(upload_file: UploadFile) -> str:
    if not upload_file: return None
    content = upload_file.file.read()
    return f"data:{upload_file.content_type};base64,{base64.b64encode(content).decode('utf-8')}"

def upload_to_cloud(upload_file: UploadFile) -> str:
    if not upload_file: return None
    try:
        image_bytes = upload_file.file.read()
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        res = requests.post("https://api.imgbb.com/1/upload", data={"key": os.environ.get("IMGBB_API_KEY"), "image": encoded_image}).json()
        return res["data"]["url"] if res.get("success") else None
    except: return None

def send_onboarding_email(to_email, full_name, temp_password, login_email):
    user, pw, host = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS"), os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    if not user or not pw: return False
    try:
        msg = MIMEText(f"Hello {full_name},\n\nYour account is verified.\nEmail: {login_email}\nPassword: {temp_password}")
        msg['Subject'], msg['From'], msg['To'] = "LIZZA - Verification Successful", user, to_email
        with smtplib.SMTP(host, 587) as server:
            server.starttls(); server.login(user, pw); server.sendmail(user, to_email, msg.as_string()) 
        return True
    except: return False

def get_distance(lat1, lon1, lat2, lon2):
    R = 6371000 
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# --- AUTH & PROFILE ---
@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user or get_secure_hash(data.password, user.salt) != user.password: raise HTTPException(401, "Invalid credentials")
    if not user.is_verified and user.user_type != 'admin': raise HTTPException(403, "Pending Admin Verification")
    return {"user_id": user.id, "user": user.full_name, "user_type": user.user_type, "force_password_change": not user.is_password_changed}

@app.get("/api/user/profile")
def get_user_profile(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(404, "User not found")
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "user_type": user.user_type, "blockchain_id": user.blockchain_id, "shift_start": user.shift_start, "shift_end": user.shift_end, "is_verified": user.is_verified, "location_id": user.location_id, "is_present": user.is_present}

@app.post("/api/change-password")
def change_password(data: PasswordChange, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if get_secure_hash(data.old_password, user.salt) != user.password: raise HTTPException(401, "Current password incorrect")
    user.password, user.is_password_changed = get_secure_hash(data.new_password, user.salt), True
    db.commit()
    return {"status": "success"}

# --- ONBOARDING & MANAGER ROUTES ---
@app.post("/api/manager/add-employee")
async def add_employee(first_name: str=Form(...), last_name: str=Form(...), personal_email: str=Form(...), phone_number: str=Form(...), dob: str=Form(...), designation: str=Form(...), manager_id: int=Form(...), user_type: str=Form("employee"), aadhar_number: str=Form(...), pan_number: str=Form(...), profile_photo: UploadFile=File(None), filled_form: UploadFile=File(None), db: Session=Depends(get_db)):
    base_email = f"{first_name.lower()}.{last_name.lower()}@lizza.com"
    try: initial_pw = datetime.strptime(dob, "%Y-%m-%d").strftime("%d%m%Y") 
    except: initial_pw = datetime.strptime(dob, "%d-%m-%Y").strftime("%d%m%Y")
    salt = hashlib.sha256(base_email.encode()).hexdigest()[:16]
    
    new_user = User(
        full_name=f"{first_name} {last_name}", email=base_email, personal_email=personal_email, phone_number=phone_number, password=get_secure_hash(initial_pw, salt), salt=salt, user_type=user_type, manager_id=manager_id, is_verified=False, dob=dob, designation=designation,
        aadhar_enc=cipher.encrypt(aadhar_number.encode()).decode(), pan_enc=cipher.encrypt(pan_number.encode()).decode(),
        profile_photo_path=upload_to_cloud(profile_photo), filled_form_path=process_upload_base64(filled_form)
    )
    db.add(new_user); db.commit()
    return {"status": "success", "official_email": base_email}

@app.get("/api/manager/my-employees")
def get_my_employees(manager_id: int, db: Session = Depends(get_db)): return db.query(User).filter(User.manager_id == manager_id).all()

# --- ADMIN ROUTES ---
@app.post("/api/admin/verify-employee")
def verify_employee(target_email: str, admin_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == target_email).first()
    user.blockchain_id, user.is_verified = f"LZ-{hashlib.sha256(user.email.encode()).hexdigest()[:10]}".upper(), True
    db.commit()
    send_onboarding_email(user.personal_email, user.full_name, user.dob.replace("-",""), user.email)
    return {"status": "success"}

@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)): return db.query(User).all()

@app.get("/api/admin/locations")
def get_locations(db: Session = Depends(get_db)): return db.query(OfficeLocation).all()

@app.post("/api/admin/add-location")
def add_location(data: LocationCreate, db: Session = Depends(get_db)):
    db.add(OfficeLocation(**data.dict())); db.commit()
    return {"message": "Location Added"}

@app.put("/api/admin/update-location/{loc_id}")
def update_location_endpoint(loc_id: int, data: LocationCreate, db: Session = Depends(get_db)):
    loc = db.query(OfficeLocation).filter(OfficeLocation.id == loc_id).first()
    loc.name, loc.lat, loc.lon, loc.radius = data.name, data.lat, data.lon, data.radius
    db.commit()
    return {"status": "updated"}

@app.get("/api/admin/live-tracking")
def get_live_tracking(admin_email: str, db: Session = Depends(get_db)):
    users = db.query(User).filter(User.is_verified == True).all()
    results = []
    for u in users:
        coords, lat, lon = r.get(f"loc:{u.email}") if r else None, None, None
        if coords:
            try: lat, lon = float(coords.split(',')[0]), float(coords.split(',')[1])
            except: pass
        results.append({"email": u.email, "name": u.full_name, "lat": lat, "lon": lon, "present": u.is_present})
    return results

@app.post("/api/admin/update-employee-inline")
def update_employee_inline(data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.get("email")).first()
    user.location_id, user.shift_start, user.shift_end, user.user_type = data.get("location_id"), data.get("shift_start"), data.get("shift_end"), data.get("user_type")
    if "manager_id" in data: user.manager_id = data.get("manager_id")
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

@app.get("/api/admin/proxy-image")
def proxy_image(url: str):
    res = requests.get(url)
    return {"base64": f"data:{res.headers['Content-Type']};base64,{base64.b64encode(res.content).decode()}"}

# --- UNIFIED FIELD OPERATIONS ---
@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, current_site_id: Optional[int] = None, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower()).first()
    if not user: return {"status": "error"}
    r.set(f"loc:{email}", f"{lat},{lon}", ex=10) # Live Redis sync (5-10 sec)
    now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    
    if user.user_type == 'field_officer':
        active = db.query(FieldVisitLog).filter(FieldVisitLog.officer_id == user.id, FieldVisitLog.exit_time == None).first()
        if current_site_id:
            if not active:
                db.add(FieldVisitLog(officer_id=user.id, site_id=current_site_id, entry_time=now))
            elif active.site_id != current_site_id:
                active.exit_time = now
                db.add(FieldVisitLog(officer_id=user.id, site_id=current_site_id, entry_time=now))
        elif active:
            active.exit_time = now
        db.commit()
        return {"is_inside": True if current_site_id else False}

    office = db.query(OfficeLocation).filter(OfficeLocation.id == user.location_id).first()
    if office:
        is_inside = get_distance(lat, lon, office.lat, office.lon) <= office.radius
        if is_inside and not user.is_present:
            user.is_present = True
            db.commit()
        return {"is_inside": is_inside}
    return {"status": "ok"}

@app.post("/api/field-officer/log-visit")
async def log_site_visit(email: str=Form(...), location_id: int=Form(...), purpose: str=Form(...), remarks: str=Form(""), photo: UploadFile=File(...), db: Session=Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower()).first()
    log = db.query(FieldVisitLog).filter(FieldVisitLog.officer_id == user.id, FieldVisitLog.site_id == location_id, FieldVisitLog.exit_time == None).first()
    if not log: raise HTTPException(400, "Must be inside geofence to upload photo.")
    log.photo_path, log.purpose, log.remarks = upload_to_cloud(photo), purpose, remarks
    log.photo_time = datetime.utcnow() + timedelta(hours=5, minutes=30)
    db.commit()
    return {"status": "success"}

@app.get("/api/admin/reports/unified-logs")
def get_unified_logs(month: int, year: int, officer_id: Optional[int] = None, location_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(FieldVisitLog, User, OfficeLocation).join(User).join(OfficeLocation)
    query = query.filter(extract('month', FieldVisitLog.entry_time) == month, extract('year', FieldVisitLog.entry_time) == year)
    if officer_id: query = query.filter(FieldVisitLog.officer_id == officer_id)
    if location_id: query = query.filter(FieldVisitLog.site_id == location_id)
    return [{
        "date": l.entry_time.strftime("%Y-%m-%d"), "officer_name": u.full_name, "officer_email": u.email, "site_name": loc.name,
        "entry": l.entry_time.strftime("%I:%M:%S %p"), "photo_at": l.photo_time.strftime("%I:%M:%S %p") if l.photo_time else "No Photo",
        "exit": l.exit_time.strftime("%I:%M:%S %p") if l.exit_time else "Still Inside",
        "purpose": l.purpose or "-", "photo_url": l.photo_path
    } for l, u, loc in query.all()]
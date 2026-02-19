import hashlib
import os
import redis
import math
import json
import smtplib
import shutil # NEW: For file saving
from email.mime.text import MIMEText
from typing import Optional 
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles # NEW: To serve uploaded files
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
if redis_url:
    r = redis.from_url(redis_url, decode_responses=True)
else:
    r = None 

init_db()

PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

# --- FILE UPLOAD SETUP ---
UPLOAD_DIR = "uploads"
os.makedirs(os.path.join(UPLOAD_DIR, "profiles"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "documents"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

def save_upload_file(upload_file: UploadFile, subfolder: str, prefix: str) -> str:
    if not upload_file or not upload_file.filename:
        return None
    ext = upload_file.filename.split('.')[-1]
    filename = f"{prefix}_{datetime.now().strftime('%Y%m%d%H%M%S')}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, subfolder, filename)
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return f"/{filepath}"

# --- EMAIL CONFIGURATION ---
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = 587
SMTP_USER = os.environ.get("SMTP_USER", "your-email@gmail.com")
SMTP_PASS = os.environ.get("SMTP_PASS", "your-app-password")

def send_onboarding_email(to_email, full_name, temp_password, login_email):
    subject = "Welcome to LIZZA - Your Login Credentials"
    body = f"""Dear {full_name},
    
Welcome to the team! Your account has been securely created.
    
Login Details:
--------------------------------
Portal URL: https://your-app-url.com
Official Email: {login_email}
Temporary Password: {temp_password}
--------------------------------
    
IMPORTANT: For security, you are required to change your password immediately upon first login.
    
Regards,
HR & Admin Team
"""
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = SMTP_USER
        msg['To'] = to_email
        if "your-app-password" in SMTP_PASS:
            print(f"\n[MOCK EMAIL SENT TO {to_email}]\n{body}\n")
            return True
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"Email sending failed: {e}")
        return False

# --- SCHEMAS ---

class AuthRequest(BaseModel):
    email: str
    password: str

class LocationCreate(BaseModel):
    name: str
    lat: float
    lon: float
    radius: int
class PasswordChange(BaseModel):
    email: str
    old_password: str
    new_password: st

# --- UTILITIES ---

def get_distance(lat1, lon1, lat2, lon2):
    R = 6371000 
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, manager_id: str):
        await websocket.accept()
        if manager_id not in self.active_connections:
            self.active_connections[manager_id] = []
        self.active_connections[manager_id].append(websocket)

    def disconnect(self, websocket: WebSocket, manager_id: str):
        if manager_id in self.active_connections:
            self.active_connections[manager_id].remove(websocket)

    async def broadcast(self, manager_id: str, message: dict):
        if manager_id in self.active_connections:
            for connection in self.active_connections[manager_id]:
                await connection.send_json(message)

ws_manager = ConnectionManager()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_secure_hash(password: str, salt: str):
    final_payload = password + salt + PEPPER
    return hashlib.sha256(final_payload.encode()).hexdigest()

# --- GENERAL ROUTES ---

@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if get_secure_hash(data.password, user.salt) == user.password:
        return {
            "message": "Login successful",
            "user": user.full_name,
            "user_type": user.user_type,
            "user_id": user.id,
            "force_password_change": not user.is_password_changed
        }
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.get("/api/user/profile")
def get_user_profile(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "full_name": user.full_name,
        "email": user.email,
        "user_type": user.user_type,
        "shift_start": user.shift_start,
        "shift_end": user.shift_end,
        "blockchain_id": user.blockchain_id,
        "profile_photo": user.profile_photo_path
    }

# --- ADMIN & MANAGER ROUTES ---

# NEW: Converted to handle FormData instead of raw JSON for file uploads
@app.post("/api/manager/add-employee")
async def add_employee(
    first_name: str = Form(...),
    last_name: str = Form(...),
    personal_email: str = Form(...),
    dob: str = Form(...),
    father_name: str = Form(None),
    mother_name: str = Form(None),
    blood_group: str = Form(None),
    emergency_contact: str = Form(None),
    designation: str = Form(...),
    department: str = Form(...),
    experience_years: float = Form(0.0),
    prev_company: str = Form(None),
    prev_role: str = Form(None),
    aadhar_number: str = Form(...),
    pan_number: str = Form(...),
    manager_id: int = Form(...),
    user_type: str = Form("employee"),
    location_id: Optional[int] = Form(None),
    shift_start: str = Form("09:00"),
    shift_end: str = Form("18:00"),
    profile_photo: UploadFile = File(None),
    aadhar_photo: UploadFile = File(None),
    pan_photo: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    manager = db.query(User).filter(User.id == manager_id).first()
    if not manager:
        manager = db.query(User).filter(User.user_type == 'admin').first()
    if not manager:
        raise HTTPException(status_code=400, detail="Manager invalid and NO Admins found.")

    base_email = f"{first_name.lower()}.{last_name.lower()}@lizza.com"
    if db.query(User).filter(User.email == base_email).first():
        import random
        base_email = f"{first_name.lower()}.{last_name.lower()}{random.randint(10,99)}@lizza.com"

    try:
        dob_obj = datetime.strptime(dob, "%Y-%m-%d")
        initial_password = dob_obj.strftime("%d%m%Y")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid DOB format. Use YYYY-MM-DD")

    salt = hashlib.sha256(base_email.encode()).hexdigest()[:16]
    hashed_pw = get_secure_hash(initial_password, salt)
    
    aadhar_encrypted = cipher.encrypt(aadhar_number.encode()).decode()
    pan_encrypted = cipher.encrypt(pan_number.encode()).decode()

    # Save files securely
    file_prefix = base_email.split('@')[0]
    prof_path = save_upload_file(profile_photo, "profiles", f"prof_{file_prefix}")
    aadhar_path = save_upload_file(aadhar_photo, "documents", f"aadhar_{file_prefix}")
    pan_path = save_upload_file(pan_photo, "documents", f"pan_{file_prefix}")

    blockchain_hash = hashlib.sha256(f"{base_email}{datetime.utcnow()}".encode()).hexdigest()
    full_name_combined = f"{first_name} {last_name}"
    
    new_user = User(
        first_name=first_name, last_name=last_name, full_name=full_name_combined,
        email=base_email, personal_email=personal_email, password=hashed_pw,
        user_type=user_type, manager_id=manager.id, 
        location_id=location_id if location_id else None,
        blockchain_id=f"LIZZA-{blockchain_hash[:10]}".upper(),
        shift_start=shift_start, shift_end=shift_end, salt=salt, is_password_changed=False,
        
        dob=dob, father_name=father_name, mother_name=mother_name, 
        blood_group=blood_group, emergency_contact=emergency_contact,
        designation=designation, department=department, experience_years=experience_years,
        prev_company=prev_company, prev_role=prev_role,
        
        aadhar_enc=aadhar_encrypted, pan_enc=pan_encrypted,
        profile_photo_path=prof_path, aadhar_photo_path=aadhar_path, pan_photo_path=pan_path
    )
    
    try:
        db.add(new_user)
        db.commit()
        send_onboarding_email(personal_email, full_name_combined, initial_password, base_email)
        return {"status": "success", "blockchain_id": new_user.blockchain_id, "official_email": base_email}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Integrity Error: Duplicate Email.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip()).first()
    if not admin or admin.user_type.lower() != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = db.query(User).all()
    return [{
        "id": u.id, "full_name": u.full_name, "email": u.email,
        "user_type": u.user_type, "shift_start": u.shift_start, "shift_end": u.shift_end,
        "blockchain_id": u.blockchain_id, "location_id": u.location_id, "is_present": u.is_present
    } for u in users]

@app.get("/api/admin/locations")
def get_locations(db: Session = Depends(get_db)):
    return db.query(OfficeLocation).all()

@app.post("/api/admin/add-location")
def add_location(data: LocationCreate, db: Session = Depends(get_db)):
    new_loc = OfficeLocation(**data.dict())
    db.add(new_loc)
    db.commit()
    return {"message": "Location Added"}

@app.post("/api/admin/update-employee")
def update_employee(target_email: str, admin_email: str, data: dict, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip()).first()
    if not admin or admin.user_type.lower() != 'admin':
        raise HTTPException(status_code=403, detail="Forbidden")

    user = db.query(User).filter(User.email == target_email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.full_name = data.get('full_name', user.full_name)
    user.email = data.get('new_email', user.email)
    user.shift_start = data.get('shift_start', user.shift_start)
    user.shift_end = data.get('shift_end', user.shift_end)
    user.user_type = data.get('user_type', user.user_type)
    loc_id = data.get('location_id')
    user.location_id = int(loc_id) if loc_id and str(loc_id).isdigit() else None
    
    db.commit()
    return {"message": "Update successful"}

@app.delete("/api/admin/delete-employee")
def delete_employee(target_email: str = Query(...), admin_email: str = Query(...), db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip()).first()
    if not admin or admin.user_type.lower() != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")

    user = db.query(User).filter(User.email == target_email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        try:
            if r:
                r.delete(f"loc:{target_email.lower().strip()}")
                r.delete(f"oob:{target_email.lower().strip()}") 
        except Exception: pass 
        
        db.query(EmployeeLocation).filter(EmployeeLocation.user_id == user.id).delete()
        db.query(User).filter(User.manager_id == user.id).update({"manager_id": None})
        db.delete(user)
        db.commit()
        return {"status": "success", "message": f"Employee {target_email} deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.delete("/api/admin/delete-location/{loc_id}")
def delete_location(loc_id: int, admin_email: str, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip()).first()
    if not admin or admin.user_type.lower() != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")

    location = db.query(OfficeLocation).filter(OfficeLocation.id == loc_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    db.query(User).filter(User.location_id == loc_id).update({"location_id": None})
    db.delete(location)
    db.commit()
    return {"message": "Location deleted"}

@app.get("/api/admin/live-tracking")
def get_live_tracking(admin_email: str, db: Session = Depends(get_db)):
    if not r: return []
    keys = r.keys("loc:*")
    locations = []
    for key in keys:
        email = key.split(":")[1]
        raw_data = r.get(key)
        if raw_data:
            lat_lon = raw_data.split(",")
            user = db.query(User).filter(User.email == email).first()
            display_name = user.full_name if user else email.split("@")[0]
            locations.append({"email": email, "lat": float(lat_lon[0]), "lon": float(lat_lon[1]), "name": display_name})
    return locations

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or not user.location_id: raise HTTPException(status_code=404, detail="User or office not found")
    
    office = db.query(OfficeLocation).filter(OfficeLocation.id == user.location_id).first()
    
    if r:
        r.set(f"loc:{email}", f"{lat},{lon}")
        r.expire(f"loc:{email}", 60)

    dist = get_distance(lat, lon, office.lat, office.lon)
    is_inside = dist <= office.radius
    
    if user.manager_id:
        await ws_manager.broadcast(str(user.manager_id), {
            "email": user.email, "name": user.full_name, "lat": lat, "lon": lon,
            "present": is_inside, "status": "inside" if is_inside else "outside"
        })
    
    now_utc = datetime.utcnow()
    now_ist = now_utc + timedelta(hours=5, minutes=30) 
    now_str = now_ist.strftime("%H:%M")
    
    status_response = {"is_inside": is_inside, "status": "normal", "message": "On Duty", "warning_seconds": 0}

    if is_inside:
        if r: r.delete(f"oob:{email}")
        shift_dt = datetime.strptime(user.shift_start, "%H:%M")
        grace_end = (shift_dt + timedelta(minutes=15)).strftime("%H:%M")
        
        if not user.is_present:
            if now_str >= user.shift_start and now_str <= grace_end:
                user.is_present = True
                status_response["message"] = "Marked Present"
            elif now_str > grace_end: status_response["message"] = "Inside Zone (Late)"
        else: status_response["message"] = "Present & Inside Zone"
        db.commit()
        return status_response
    else:
        if not user.is_present:
             status_response["status"] = "outside"
             status_response["message"] = "Outside Geofence"
             return status_response

        if r:
            oob_key = f"oob:{email}"
            first_out_time = r.get(oob_key)
            if not first_out_time:
                r.set(oob_key, now_utc.isoformat())
                status_response["status"] = "warning"
                status_response["message"] = "Return to Zone!"
                status_response["warning_seconds"] = 300 
            else:
                fmt = "%Y-%m-%dT%H:%M:%S.%f"
                try:
                    start_t = datetime.strptime(first_out_time, fmt)
                    elapsed = (now_utc - start_t).total_seconds()
                    remaining = 300 - elapsed
                    if remaining <= 0:
                        user.is_present = False 
                        db.commit()
                        r.delete(oob_key) 
                        status_response["status"] = "violation"
                        status_response["message"] = "Marked Absent (Geofence Violation)"
                    else:
                        status_response["status"] = "warning"
                        status_response["warning_seconds"] = int(remaining)
                except ValueError: r.delete(oob_key) 
        return status_response

@app.websocket("/ws/tracking/{manager_id}")
async def websocket_endpoint(websocket: WebSocket, manager_id: str):
    await ws_manager.connect(websocket, manager_id)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, manager_id)

@app.get("/api/manager/my-employees")
def get_manager_employees(manager_id: int, db: Session = Depends(get_db)):
    employees = db.query(User).filter(User.manager_id == manager_id).all()
    return [{
        "id": u.id, "full_name": u.full_name, "email": u.email,
        "location_id": u.location_id, "shift_start": u.shift_start, "shift_end": u.shift_end,
        "is_present": u.is_present, "blockchain_id": u.blockchain_id
    } for u in employees]
@app.post("/api/change-password")
def change_password(data: PasswordChange, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Verify Old Password matches what is in the database
    if get_secure_hash(data.old_password, user.salt) != user.password:
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    # Generate new hash and update user record
    user.password = get_secure_hash(data.new_password, user.salt)
    user.is_password_changed = True # This removes the force-change flag
    db.commit()
    
    return {"message": "Password updated successfully"}
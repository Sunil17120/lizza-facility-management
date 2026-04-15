import hashlib, os, redis, math, smtplib, base64, json, requests, calendar
from email.mime.text import MIMEText
from typing import Optional 
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import extract 
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy.exc import IntegrityError
import pyzipper
import io
import xml.etree.ElementTree as ET
import cv2
import numpy as np
import zlib
import zxingcpp

try:
    from .database import SessionLocal, User, EmployeeLocation, OfficeLocation, SiteVisit,SiteStay, init_db, cipher
except ImportError:
    from database import SessionLocal, User, EmployeeLocation, OfficeLocation, SiteVisit, SiteStay,init_db, cipher

app = FastAPI()
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True) if redis_url else None
init_db()
PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

# --- TIMEZONE & SHIFT HELPERS ---
def convert_utc_to_ist(utc_dt):
    if not utc_dt: return None
    if utc_dt.tzinfo is not None: utc_dt = utc_dt.replace(tzinfo=None)
    return utc_dt + timedelta(hours=5, minutes=30)

def is_time_between(start_str, end_str, check_str):
    """Handles time comparisons, including overnight shifts crossing midnight."""
    if not start_str or not end_str: return False
    if start_str <= end_str:
        return start_str <= check_str <= end_str
    else: # Shift crosses midnight (e.g., 22:00 to 06:00)
        return start_str <= check_str or check_str <= end_str

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

def upload_to_cloud(upload_file: UploadFile) -> str:
    if not upload_file or not upload_file.filename: 
        return None
    try:
        image_bytes = upload_file.file.read()
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        
        url = "https://api.imgbb.com/1/upload"
        payload = {"key": os.environ.get("IMGBB_API_KEY"), "image": encoded_image}
        
        response = requests.post(url, data=payload)
        res_data = response.json()
        if res_data.get("success"): return res_data["data"]["url"]
        return None
    except Exception as e:
        print(f"Cloud upload error: {e}")
        return None

def send_onboarding_email(to_email, full_name, temp_password, login_email):
    user = os.environ.get("SMTP_USER") 
    pw = os.environ.get("SMTP_PASS")
    host = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    if not user or not pw: return False
    try:
        body = f"Hello {full_name},\n\nYour account is verified.\nEmail: {login_email}\nPassword: Date of Birth"
        msg = MIMEText(body)
        msg['Subject'], msg['From'], msg['To'] = "LIZZA - Verification Successful", user, to_email
        with smtplib.SMTP(host, 587) as server:
            server.starttls()
            server.login(user, pw)
            server.sendmail(user, to_email, msg.as_string()) 
        return True
    except Exception as e:
        return False

def get_distance(lat1, lon1, lat2, lon2):
    R = 6371000 
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
def safe_encrypt(data: str) -> str:
    """Safely encrypts data if it exists, otherwise returns None."""
    if not data or str(data).strip() == "" or data == "null" or data == "undefined":
        return None
    return cipher.encrypt(str(data).encode()).decode()
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

# --- MANAGER & ONBOARDING ---
@app.post("/api/manager/add-employee")
async def add_employee(
    # Core
    first_name: str = Form(...), last_name: str = Form(...), phone_number: str = Form(...), 
    dob: str = Form(...), designation: str = Form(...), kyc_mode: str = Form(...),
    
    # Optional Details & Med
    personal_email: str = Form(None), gender: str = Form(None), marital_status: str = Form(None), 
    identity_mark: str = Form(None), father_name: str = Form(None), mother_name: str = Form(None), 
    blood_group: str = Form(None), height: str = Form(None), caste: str = Form(None), 
    category: str = Form(None), religion: str = Form(None), nationality: str = Form(None), 
    medical_remarks: str = Form(None), unit_name: str = Form(None),
    
    # Addresses
    perm_address: str = Form(None), perm_state: str = Form(None), perm_pin: str = Form(None), perm_mobile: str = Form(None),
    temp_address: str = Form(None), temp_state: str = Form(None), temp_pin: str = Form(None), temp_mobile: str = Form(None),
    
    # JSON Arrays
    languages_json: str = Form(None), education_json: str = Form(None), experience_json: str = Form(None), 
    family_json: str = Form(None), references_json: str = Form(None),
    
    # Financial & ID
    bank_name: str = Form(None), account_number: str = Form(None), ifsc_code: str = Form(None),
    aadhar_number: str = Form(None), pan_number: str = Form(None), voter_id: str = Form(None), 
    driving_licence: str = Form(None), passport_no: str = Form(None),
    
    # Work settings
    department: str = Form("Operations"), manager_id: int = Form(1), 
    location_id: Optional[int] = Form(None), shift_start: Optional[str] = Form(None), shift_end: Optional[str] = Form(None),
    
    # Files
    profile_photo: UploadFile = File(None), aadhar_photo: UploadFile = File(None),
    pan_photo: UploadFile = File(None), voter_photo: UploadFile = File(None),
    dl_photo: UploadFile = File(None), passport_photo: UploadFile = File(None),
    fingerprints_left: UploadFile = File(None), fingerprints_right: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    base_email = f"{first_name.strip().replace(' ', '').lower()}.{last_name.strip().replace(' ', '').lower()}@lizza.com"
    try:
        dt_obj = datetime.strptime(dob, "%Y-%m-%d")
        initial_pw = dt_obj.strftime("%d%m%Y") 
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    salt = hashlib.sha256(base_email.encode()).hexdigest()[:16]

    # Upload files to Cloud
    profile_url = upload_to_cloud(profile_photo)
    aadhar_url = upload_to_cloud(aadhar_photo) if kyc_mode == 'without_aadhaar' else None
    pan_url = upload_to_cloud(pan_photo)
    voter_url = upload_to_cloud(voter_photo)
    dl_url = upload_to_cloud(dl_photo)
    passport_url = upload_to_cloud(passport_photo)
    left_fp_url = upload_to_cloud(fingerprints_left) if kyc_mode == 'without_aadhaar' else None
    right_fp_url = upload_to_cloud(fingerprints_right) if kyc_mode == 'without_aadhaar' else None

    new_user = User(
        first_name=first_name, last_name=last_name, full_name=f"{first_name} {last_name}",
        email=base_email, personal_email=personal_email, phone_number=phone_number,
        password=get_secure_hash(initial_pw, salt), salt=salt, user_type="employee", 
        manager_id=manager_id, location_id=location_id, is_verified=False, dob=dob,
        gender=gender, marital_status=marital_status, identity_mark=identity_mark,
        father_name=father_name, mother_name=mother_name, blood_group=blood_group,
        height=height, caste=caste, category=category, religion=religion, nationality=nationality, 
        medical_remarks=medical_remarks, unit_name=unit_name, designation=designation, department=department, kyc_mode=kyc_mode,
        
        # Addresses
        perm_address=perm_address, perm_state=perm_state, perm_pin=perm_pin, perm_mobile=perm_mobile,
        temp_address=temp_address, temp_state=temp_state, temp_pin=temp_pin, temp_mobile=temp_mobile,
        
        # JSON Data
        languages_json=languages_json, education_json=education_json, experience_json=experience_json, 
        family_json=family_json, references_json=references_json,
        
        # Encrypted Data
        aadhar_enc=safe_encrypt(aadhar_number), pan_enc=safe_encrypt(pan_number),
        account_number_enc=safe_encrypt(account_number), voter_id_enc=safe_encrypt(voter_id),
        driving_licence_enc=safe_encrypt(driving_licence), passport_no_enc=safe_encrypt(passport_no),
        bank_name=bank_name, ifsc_code=ifsc_code,
        
        # Photo Paths
        profile_photo_path=profile_url, aadhar_photo_path=aadhar_url,
        pan_photo_path=pan_url, voter_photo_path=voter_url, dl_photo_path=dl_url, passport_photo_path=passport_url,
        fingerprints_left_path=left_fp_url, fingerprints_right_path=right_fp_url,
        
        shift_start=shift_start if shift_start else None, shift_end=shift_end if shift_end else None
    )
    
    db.add(new_user)
    db.commit()
    
    return {"status": "success", "official_email": base_email, "message": "Employee registered successfully."}

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

@app.put("/api/admin/update-location/{loc_id}")
def update_location_endpoint(loc_id: int, data: LocationCreate, db: Session = Depends(get_db)):
    loc = db.query(OfficeLocation).filter(OfficeLocation.id == loc_id).first()
    if not loc: raise HTTPException(404, "Location not found")
    loc.name, loc.lat, loc.lon, loc.radius = data.name, data.lat, data.lon, data.radius
    db.commit(); return {"status": "updated"}

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
    user.location_id, user.shift_start, user.shift_end, user.user_type = data.get("location_id"), data.get("shift_start"), data.get("shift_end"), data.get("user_type")
    if "manager_id" in data: user.manager_id = data.get("manager_id")
    db.commit(); return {"status": "updated"}

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

# --- FIELD OFFICER & REPORTING ROUTES ---
@app.post("/api/field-officer/log-visit")
async def log_site_visit(
    email: str = Form(...), location_id: int = Form(...), purpose: str = Form(...), remarks: str = Form(""),
    lat: float = Form(...), lon: float = Form(...), photo: UploadFile = File(...), db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or user.user_type != 'field_officer': raise HTTPException(403, "Unauthorized")
    site = db.query(OfficeLocation).filter(OfficeLocation.id == location_id).first()
    if not site: raise HTTPException(404, "Site not found")

    distance = get_distance(lat, lon, site.lat, site.lon)
    if distance > site.radius: raise HTTPException(400, f"Geotag validation failed. You are {int(distance)}m away from the site. Must be within {site.radius}m.")

    photo_url = upload_to_cloud(photo)
    visit = SiteVisit(officer_id=user.id, location_id=site.id, purpose=purpose, remarks=remarks, photo_path=photo_url)
    db.add(visit); db.commit()
    return {"status": "success", "message": "Visit logged and geotag verified."}

@app.get("/api/field-officer/my-visits")
def get_my_visits(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(404, "User not found")
    visits = db.query(SiteVisit, OfficeLocation).join(OfficeLocation).filter(SiteVisit.officer_id == user.id).order_by(SiteVisit.visit_time.desc()).all()
    return [{
        "site_name": loc.name, "purpose": v.purpose, "remarks": v.remarks, 
        "visit_time": convert_utc_to_ist(v.visit_time).strftime("%d-%b-%Y %I:%M %p") if v.visit_time else "N/A", 
        "photo_url": v.photo_path
    } for v, loc in visits]

@app.get("/api/admin/reports/monthly-field-visits")
def get_monthly_field_visits(
    month: int, year: int, officer_id: Optional[int] = None, location_id: Optional[int] = None, db: Session = Depends(get_db)
):
    _, last_day = calendar.monthrange(year, month)
    start_utc = datetime(year, month, 1, 0, 0, 0) - timedelta(hours=5, minutes=30)
    end_utc = datetime(year, month, last_day, 23, 59, 59) - timedelta(hours=5, minutes=30)

    query = db.query(SiteVisit, User, OfficeLocation).join(User, SiteVisit.officer_id == User.id).join(OfficeLocation, SiteVisit.location_id == OfficeLocation.id)
    query = query.filter(SiteVisit.visit_time >= start_utc, SiteVisit.visit_time <= end_utc)
    if officer_id: query = query.filter(SiteVisit.officer_id == officer_id)
    if location_id: query = query.filter(SiteVisit.location_id == location_id)
    
    results = query.order_by(SiteVisit.visit_time.asc()).all()
    report_data = []
    
    for v, u, loc in results:
        ist_time = convert_utc_to_ist(v.visit_time)
        stay = db.query(SiteStay).filter(SiteStay.officer_id == v.officer_id, SiteStay.location_id == v.location_id, SiteStay.entry_time <= v.visit_time).order_by(SiteStay.entry_time.desc()).first()

        entry_str, exit_str, duration_str = "N/A", "N/A", "N/A"
        if stay and (stay.exit_time is None or stay.exit_time >= v.visit_time):
            entry_ist = convert_utc_to_ist(stay.entry_time)
            entry_str = entry_ist.strftime("%I:%M %p") if entry_ist else "N/A"
            if stay.exit_time:
                exit_ist = convert_utc_to_ist(stay.exit_time)
                exit_str = exit_ist.strftime("%I:%M %p")
                hours, remainder = divmod((stay.exit_time - stay.entry_time).total_seconds(), 3600)
                duration_str = f"{int(hours)}h {int(remainder // 60)}m"
            else:
                exit_str, duration_str = "Active", "In Progress"

        report_data.append({
            "visit_id": v.id, "date": ist_time.strftime("%d-%b-%Y") if ist_time else "N/A", "time": ist_time.strftime("%I:%M %p") if ist_time else "N/A",
            "officer_id": u.blockchain_id or f"EMP-{u.id}", "officer_name": u.full_name, "site_id": loc.id, "site_name": loc.name,
            "entry_time": entry_str, "exit_time": exit_str, "duration": duration_str, "purpose": v.purpose, "remarks": v.remarks,
            "photo": v.photo_path, "excel_photo": f'=IMAGE("{v.photo_path}", "Visit Photo", 0)' if v.photo_path else "No Photo"
        })
    return report_data

# --- USER & LOCATION TRACKING ---
@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: return {"status": "error", "message": "User not found"}
    
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")

    # ==========================================
    # STRICT PRIVACY GATE: EMPLOYEES & MANAGERS
    # ==========================================
    if user.user_type in ['employee', 'manager']:
        # If they are completely outside their duty hours
        if not user.shift_start or not user.shift_end or not is_time_between(user.shift_start, user.shift_end, now_str):
            # 1. Wipe their location from the Admin map to protect privacy
            if r: r.delete(f"loc:{email}")
            
            # 2. Return an off_duty status so the frontend dashboard pauses tracking
            return {"is_inside": False, "status": "off_duty", "message": "Off Duty - Location tracking paused."}

    # 1. Update Live Location in Redis for Admin Map 
    if r:
        if user.is_present: r.set(f"loc:{email}", f"{lat},{lon}", ex=43200) # 12 hours
        else: r.set(f"loc:{email}", f"{lat},{lon}", ex=360)   # 6 minutes buffer
    
    # --- FIELD OFFICER LOGIC ---
    if user.user_type == 'field_officer':
        now_utc = datetime.utcnow()
        offices = db.query(OfficeLocation).all()
        current_site = next((o for o in offices if get_distance(lat, lon, o.lat, o.lon) <= o.radius), None)
        active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()

        if current_site:
            if not active_stay or active_stay.location_id != current_site.id:
                if active_stay: active_stay.exit_time = now_utc
                db.add(SiteStay(officer_id=user.id, location_id=current_site.id, entry_time=now_utc))
                db.commit()
        else:
            if active_stay: active_stay.exit_time = now_utc; db.commit()
                
        return {"is_inside": current_site is not None, "status": "normal", "message": "Location Updated"}

    # --- REGULAR EMPLOYEE LOGIC ---
    if not user.location_id or not user.shift_start: return {"is_inside": True, "status": "normal", "message": "Location Updated"}

    office = db.query(OfficeLocation).filter(OfficeLocation.id == user.location_id).first()
    is_inside = get_distance(lat, lon, office.lat, office.lon) <= office.radius
    
    grace_end_dt = datetime.strptime(user.shift_start, "%H:%M") + timedelta(minutes=15)
    grace_end_str = grace_end_dt.strftime("%H:%M")

    # A. 15-MINUTE ATTENDANCE LOGIC
    if is_inside:
        if r: r.delete(f"out_time:{email}")
        if not user.is_present and is_time_between(user.shift_start, grace_end_str, now_str):
            user.is_present = True; db.commit()
            return {"is_inside": True, "status": "normal", "message": "Attendance Marked Present"}
        return {"is_inside": True, "status": "inside", "message": "Inside Geofence"}

    # B. 5-MINUTE OUT-OF-BOUNDS VIOLATION LOGIC
    else:
        if user.is_present:
            out_since = r.get(f"out_time:{email}") if r else None
            if not out_since:
                if r: r.set(f"out_time:{email}", datetime.utcnow().timestamp())
                return {"is_inside": False, "status": "warning", "warning_seconds": 300}
            else:
                elapsed = int(datetime.utcnow().timestamp() - float(out_since))
                remaining = 300 - elapsed
                if remaining <= 0:
                    user.is_present = False; db.commit()
                    if r: r.delete(f"out_time:{email}")
                    return {"is_inside": False, "status": "violation", "message": "Violation: Marked Absent"}
                return {"is_inside": False, "status": "warning", "warning_seconds": remaining}
    
    return {"is_inside": False, "status": "outside", "message": "Outside Geofence"}

# --- e-KYC EXTRACTION (Kept intact) ---
@app.post("/api/manager/extract-ekyc")
async def extract_ekyc(file: UploadFile = File(...), share_code: str = Form(...)):
    try:
        zip_bytes = await file.read()
        with pyzipper.AESZipFile(io.BytesIO(zip_bytes)) as z:
            z.setpassword(share_code.encode('utf-8'))
            xml_filename = z.namelist()[0]
            with z.open(xml_filename) as xml_file: xml_content = xml_file.read()
                
        root = ET.fromstring(xml_content)
        for elem in root.iter():
            if '}' in elem.tag: elem.tag = elem.tag.split('}', 1)[1]
                
        poi, pht = root.find('.//Poi'), root.find('.//Pht')
        if poi is None: raise HTTPException(400, "Invalid UIDAI XML format.")
            
        name = poi.attrib.get('name', '')
        try: dob_formatted = datetime.strptime(poi.attrib.get('dob', ''), "%d-%m-%Y").strftime("%Y-%m-%d")
        except: dob_formatted = poi.attrib.get('dob', '')
            
        name_parts = name.split(' ', 1)
        photo_base64 = f"data:image/jpeg;base64,{pht.text}" if (pht is not None and pht.text) else ""
        ref_id = root.attrib.get('referenceId', '')
        
        return {"status": "success", "data": { "firstName": name_parts[0], "lastName": name_parts[1] if len(name_parts) > 1 else '', "dob": dob_formatted, "photo": photo_base64, "aadhar_reference": f"XXXX-XXXX-{ref_id[0:4] if ref_id else 'XXXX'}" }}
    except RuntimeError as e:
        if 'password' in str(e).lower(): raise HTTPException(400, "Incorrect 4-Digit Share Code.")
        raise HTTPException(400, "Failed to unlock ZIP. Ensure it is a valid UIDAI file.")
    except Exception as e:
        raise HTTPException(500, "Failed to process e-KYC XML data.")
@app.post("/api/manager/extract-qr")
async def extract_qr(file: UploadFile = File(...)):
    try:
        # 1. Read the uploaded image
        image_bytes = await file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file. Please upload a clear photo.")
        
        # 2. Decode using industrial-grade ZXing instead of OpenCV
        barcodes = zxingcpp.read_barcodes(img)
        
        if len(barcodes) == 0:
            raise HTTPException(status_code=400, detail="No QR code found. Ensure the QR is well-lit without glare and fills the box.")
            
        # Extract the text from the first barcode found
        qr_text = barcodes[0].text.strip()

        # ==========================================================
        # SCENARIO A: AADHAAR SECURE QR (Modern Plastic PVC Cards)
        # ==========================================================
        if qr_text.isdigit() and len(qr_text) > 500:
            try:
                qr_int = int(qr_text)
                qr_bytes = qr_int.to_bytes((qr_int.bit_length() + 7) // 8, byteorder='big')
                
                start_idx = qr_bytes.find(b'\x1f\x8b\x08')
                if start_idx == -1:
                    raise ValueError("Invalid Aadhaar signature format")
                    
                compressed_data = qr_bytes[start_idx:]
                decompressed = zlib.decompress(compressed_data, zlib.MAX_WBITS | 32)
                
                parts = decompressed.split(b'\xff')
                
                name = parts[2].decode('utf-8', errors='ignore') if len(parts) > 2 else ""
                dob_raw = parts[3].decode('utf-8', errors='ignore') if len(parts) > 3 else ""
                gender_raw = parts[4].decode('utf-8', errors='ignore') if len(parts) > 4 else ""
                care_of = parts[5].decode('utf-8', errors='ignore') if len(parts) > 5 else ""

                try: 
                    dob_formatted = datetime.strptime(dob_raw, "%d-%m-%Y").strftime("%Y-%m-%d")
                except: 
                    dob_formatted = dob_raw

                name_parts = name.strip().split(' ')
                first_name = name_parts[0]
                last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''
                father_name = care_of.replace('S/O', '').replace('D/O', '').replace('C/O', '').replace(':', '').strip()
                
                return {
                    "status": "success", 
                    "data": { 
                        "firstName": first_name, "lastName": last_name, "dob": dob_formatted, 
                        "gender": "Male" if gender_raw == 'M' else "Female" if gender_raw == 'F' else gender_raw,
                        "fatherName": father_name, "aadhar_reference": "XXXX-XXXX-VERIFIED"
                    }
                }
            except Exception as e:
                print(f"Secure QR Error: {e}")
                raise HTTPException(status_code=400, detail="Detected Aadhaar QR, but failed to decrypt it. The QR might be damaged.")

        # ==========================================================
        # SCENARIO B: OLD XML FORMAT (e-Aadhaar PDF Printouts)
        # ==========================================================
        else:
            try:
                root = ET.fromstring(qr_text)
                attribs = root.attrib
                
                name_parts = attribs.get('name', '').strip().split(' ', 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else ''
                
                try: dob_formatted = datetime.strptime(attribs.get('dob', ''), "%d/%m/%Y").strftime("%Y-%m-%d")
                except: 
                    try: dob_formatted = datetime.strptime(attribs.get('dob', ''), "%Y-%m-%d").strftime("%Y-%m-%d")
                    except: dob_formatted = attribs.get('dob', '')

                uid = attribs.get('uid', '')
                masked_aadhar = f"XXXX-XXXX-{uid[-4:]}" if len(uid) >= 4 else "XXXX"

                return {
                    "status": "success", 
                    "data": { 
                        "firstName": first_name, "lastName": last_name, "dob": dob_formatted, 
                        "gender": "Male" if attribs.get('gender') == 'M' else "Female" if attribs.get('gender') == 'F' else attribs.get('gender', ''),
                        "fatherName": attribs.get('co', '').replace('S/O', '').replace('D/O', '').replace('C/O', '').strip(),
                        "aadhar_reference": masked_aadhar 
                    }
                }
                
            except ET.ParseError:
                raise HTTPException(status_code=400, detail="The scanned QR Code is not a valid Aadhaar format.")

    except HTTPException:
        raise 
    except Exception as e:
        print(f"Unexpected Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while processing image.")
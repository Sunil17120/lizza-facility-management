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

try:
    from .database import SessionLocal, User, EmployeeLocation, OfficeLocation, SiteVisit,SiteStay, init_db, cipher
except ImportError:
    from database import SessionLocal, User, EmployeeLocation, OfficeLocation, SiteVisit, SiteStay,init_db, cipher

app = FastAPI()
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True) if redis_url else None
init_db()
PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

# --- TIMEZONE ADDITION HELPER ---
def convert_utc_to_ist(utc_dt):
    """Manually adds 5 hours and 30 minutes to a UTC datetime."""
    if not utc_dt:
        return None
    # Strip tzinfo just in case, then add 5 hours and 30 minutes
    if utc_dt.tzinfo is not None:
        utc_dt = utc_dt.replace(tzinfo=None)
    return utc_dt + timedelta(hours=5, minutes=30)

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

def upload_to_cloud(upload_file: UploadFile) -> str:
    if not upload_file or not upload_file.filename: 
        return None
        
    try:
        image_bytes = upload_file.file.read()
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        
        url = "https://api.imgbb.com/1/upload"
        payload = {
            "key": os.environ.get("IMGBB_API_KEY"),
            "image": encoded_image
        }
        
        response = requests.post(url, data=payload)
        res_data = response.json()
        
        if res_data.get("success"):
            return res_data["data"]["url"]
            
        print("ImgBB Upload Failed:", res_data)
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
        print(f"Email Error: {e}")
        return False

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
    first_name: str = Form(...), 
    last_name: str = Form(...), 
    personal_email: str = Form(...),
    phone_number: str = Form(...), 
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
    shift_start: Optional[str] = Form(None),
    shift_end: Optional[str] = Form(None),
    profile_photo: UploadFile = File(None), 
    aadhar_photo: UploadFile = File(None), 
    pan_photo: UploadFile = File(None), 
    filled_form: UploadFile = File(None), 
    db: Session = Depends(get_db)
):
    base_email = f"{first_name.strip().replace(' ', '').lower()}.{last_name.strip().replace(' ', '').lower()}@lizza.com"
    
    try:
        dt_obj = datetime.strptime(dob, "%Y-%m-%d")
        initial_pw = dt_obj.strftime("%d%m%Y") 
    except ValueError:
        try:
            dt_obj = datetime.strptime(dob, "%d-%m-%Y")
            initial_pw = dt_obj.strftime("%d%m%Y")
        except:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    salt = hashlib.sha256(base_email.encode()).hexdigest()[:16]
    
    if user_type == 'field_officer':
        shift_start = None
        shift_end = None
        location_id = None
        
    if not shift_start: shift_start = None
    if not shift_end: shift_end = None

    new_user = User(
        first_name=first_name, last_name=last_name, full_name=f"{first_name} {last_name}",
        email=base_email, personal_email=personal_email, phone_number=phone_number,
        password=get_secure_hash(initial_pw, salt), salt=salt, user_type=user_type, 
        manager_id=manager_id, location_id=location_id, is_verified=False, dob=dob,
        father_name=father_name, mother_name=mother_name, blood_group=blood_group,
        emergency_contact=emergency_contact, designation=designation, department=department,
        experience_years=experience_years, prev_company=prev_company, prev_role=prev_role,
        aadhar_enc=cipher.encrypt(aadhar_number.encode()).decode(),
        pan_enc=cipher.encrypt(pan_number.encode()).decode(),
        profile_photo_path=upload_to_cloud(profile_photo),
        aadhar_photo_path=upload_to_cloud(aadhar_photo),
        pan_photo_path=upload_to_cloud(pan_photo),
        filled_form_path=process_upload_base64(filled_form, 2),
        shift_start=shift_start, shift_end=shift_end
    )
    db.add(new_user); db.commit()
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
    loc.name = data.name
    loc.lat = data.lat
    loc.lon = data.lon
    loc.radius = data.radius
    db.commit()
    return {"status": "updated"}

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
    
    if "manager_id" in data:
        user.manager_id = data.get("manager_id")
        
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

# --- FIELD OFFICER & REPORTING ROUTES ---
@app.post("/api/field-officer/log-visit")
async def log_site_visit(
    email: str = Form(...),
    location_id: int = Form(...),
    purpose: str = Form(...),
    remarks: str = Form(""),
    lat: float = Form(...),
    lon: float = Form(...),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or user.user_type != 'field_officer':
        raise HTTPException(403, "Unauthorized")

    site = db.query(OfficeLocation).filter(OfficeLocation.id == location_id).first()
    if not site:
        raise HTTPException(404, "Site not found")

    distance = get_distance(lat, lon, site.lat, site.lon)
    if distance > site.radius:
        raise HTTPException(400, f"Geotag validation failed. You are {int(distance)}m away from the site. Must be within {site.radius}m.")

    # Upload the live photo to ImgBB
    photo_url = upload_to_cloud(photo)
    
    visit = SiteVisit(officer_id=user.id, location_id=site.id, purpose=purpose, remarks=remarks, photo_path=photo_url)
    db.add(visit)
    db.commit()
    return {"status": "success", "message": "Visit logged and geotag verified."}

@app.get("/api/field-officer/my-visits")
def get_my_visits(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(404, "User not found")
    
    visits = db.query(SiteVisit, OfficeLocation).join(OfficeLocation).filter(SiteVisit.officer_id == user.id).order_by(SiteVisit.visit_time.desc()).all()
    
    return [{
        "site_name": loc.name, 
        "purpose": v.purpose, 
        "remarks": v.remarks, 
        # Manually convert UTC to IST
        "visit_time": convert_utc_to_ist(v.visit_time).strftime("%d-%b-%Y %I:%M %p") if v.visit_time else "N/A", 
        "photo_url": v.photo_path
    } for v, loc in visits]

@app.get("/api/admin/reports/monthly-field-visits")
def get_monthly_field_visits(
    month: int, year: int, officer_id: Optional[int] = None, 
    location_id: Optional[int] = None, db: Session = Depends(get_db)
):
    _, last_day = calendar.monthrange(year, month)
    start_ist = datetime(year, month, 1, 0, 0, 0)
    end_ist = datetime(year, month, last_day, 23, 59, 59)

    start_utc = start_ist - timedelta(hours=5, minutes=30)
    end_utc = end_ist - timedelta(hours=5, minutes=30)

    query = db.query(SiteVisit, User, OfficeLocation)\
              .join(User, SiteVisit.officer_id == User.id)\
              .join(OfficeLocation, SiteVisit.location_id == OfficeLocation.id)
    
    query = query.filter(SiteVisit.visit_time >= start_utc, SiteVisit.visit_time <= end_utc)
    
    if officer_id: query = query.filter(SiteVisit.officer_id == officer_id)
    if location_id: query = query.filter(SiteVisit.location_id == location_id)
    
    results = query.order_by(SiteVisit.visit_time.asc()).all()
    
    report_data = []
    for v, u, loc in results:
        ist_time = convert_utc_to_ist(v.visit_time)
        
        # --- NEW: Find the matching automated SiteStay for this visit ---
        # Get the most recent entry that happened before or during this photo upload
        stay = db.query(SiteStay).filter(
            SiteStay.officer_id == v.officer_id,
            SiteStay.location_id == v.location_id,
            SiteStay.entry_time <= v.visit_time
        ).order_by(SiteStay.entry_time.desc()).first()

        entry_str, exit_str, duration_str = "N/A", "N/A", "N/A"

        # Validate that the visit actually happened during this stay
        if stay and (stay.exit_time is None or stay.exit_time >= v.visit_time):
            entry_ist = convert_utc_to_ist(stay.entry_time)
            entry_str = entry_ist.strftime("%I:%M %p") if entry_ist else "N/A"
            
            if stay.exit_time:
                exit_ist = convert_utc_to_ist(stay.exit_time)
                exit_str = exit_ist.strftime("%I:%M %p")
                diff = stay.exit_time - stay.entry_time
                hours, remainder = divmod(diff.total_seconds(), 3600)
                minutes, _ = divmod(remainder, 60)
                duration_str = f"{int(hours)}h {int(minutes)}m"
            else:
                exit_str = "Active"
                duration_str = "In Progress"

        report_data.append({
            "visit_id": v.id,
            "date": ist_time.strftime("%d-%b-%Y") if ist_time else "N/A",
            "time": ist_time.strftime("%I:%M %p") if ist_time else "N/A",
            "officer_id": u.blockchain_id or f"EMP-{u.id}",
            "officer_name": u.full_name,
            "site_id": loc.id,
            "site_name": loc.name,
            
            # Merged Data
            "entry_time": entry_str,
            "exit_time": exit_str,
            "duration": duration_str,
            
            "purpose": v.purpose,
            "remarks": v.remarks,
            "photo": v.photo_path,
            "excel_photo": f'=IMAGE("{v.photo_path}", "Visit Photo", 0)' if v.photo_path else "No Photo"
        })
    return report_data

# --- USER & LOCATION TRACKING ---
@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: 
        return {"status": "error", "message": "User not found"}
    
    # 1. Update Live Location in Redis for Admin Map 
    if r:
        if user.is_present:
            r.set(f"loc:{email}", f"{lat},{lon}", ex=43200) # 12 hours
        else:
            r.set(f"loc:{email}", f"{lat},{lon}", ex=360)   # 6 minutes buffer
    
    # --- FIELD OFFICER LOGIC ---
    if user.user_type == 'field_officer':
        now_utc = datetime.utcnow()
        offices = db.query(OfficeLocation).all()
        current_site = None

        for office in offices:
            if get_distance(lat, lon, office.lat, office.lon) <= office.radius:
                current_site = office
                break

        active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()

        if current_site:
            if not active_stay:
                new_stay = SiteStay(officer_id=user.id, location_id=current_site.id, entry_time=now_utc)
                db.add(new_stay)
                db.commit()
            elif active_stay.location_id != current_site.id:
                active_stay.exit_time = now_utc
                new_stay = SiteStay(officer_id=user.id, location_id=current_site.id, entry_time=now_utc)
                db.add(new_stay)
                db.commit()
        else:
            if active_stay:
                active_stay.exit_time = now_utc
                db.commit()
                
        return {"is_inside": current_site is not None, "status": "normal", "message": "Location Updated"}

    # --- REGULAR EMPLOYEE LOGIC (15min and 5min logic) ---
    if not user.location_id or not user.shift_start:
        return {"is_inside": True, "status": "normal", "message": "Location Updated"}

    office = db.query(OfficeLocation).filter(OfficeLocation.id == user.location_id).first()
    is_inside = get_distance(lat, lon, office.lat, office.lon) <= office.radius
    
    # Convert UTC to IST for time-based comparisons
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")

    # A. 15-MINUTE ATTENDANCE LOGIC
    # Check if user is inside during the first 15 mins of their shift
    shift_start_dt = datetime.strptime(user.shift_start, "%H:%M")
    grace_end_dt = shift_start_dt + timedelta(minutes=15)
    grace_end_str = grace_end_dt.strftime("%H:%M")

    if is_inside:
        # Clear any existing violation timers in Redis since they are back inside
        if r:
            r.delete(f"out_time:{email}")
            
        if not user.is_present and user.shift_start <= now_str <= grace_end_str:
            user.is_present = True
            db.commit()
            return {"is_inside": True, "status": "normal", "message": "Attendance Marked Present"}
        
        return {"is_inside": True, "status": "inside", "message": "Inside Geofence"}

    # B. 5-MINUTE (300s) OUT-OF-BOUNDS VIOLATION LOGIC
    else:
        # Only track violations for users who have already checked in
        if user.is_present:
            out_since = r.get(f"out_time:{email}") if r else None
            
            if not out_since:
                # First time they are seen outside, start the clock
                if r:
                    r.set(f"out_time:{email}", datetime.utcnow().timestamp())
                return {"is_inside": False, "status": "warning", "warning_seconds": 300}
            else:
                # Calculate how long they've been out
                elapsed = int(datetime.utcnow().timestamp() - float(out_since))
                remaining = 300 - elapsed
                
                if remaining <= 0:
                    # 5 minutes finished -> Mark Absent
                    user.is_present = False
                    db.commit()
                    if r:
                        r.delete(f"out_time:{email}")
                    return {"is_inside": False, "status": "violation", "message": "Violation: Marked Absent"}
                
                return {"is_inside": False, "status": "warning", "warning_seconds": remaining}
    
    return {"is_inside": False, "status": "outside", "message": "Outside Geofence"}
    
@app.post("/api/manager/extract-ekyc")
async def extract_ekyc(
    file: UploadFile = File(...),
    share_code: str = Form(...)
):
    try:
        # 1. Read the uploaded ZIP file into memory
        zip_bytes = await file.read()
        
        # 2. Extract using pyzipper to handle UIDAI's AES encryption
        with pyzipper.AESZipFile(io.BytesIO(zip_bytes)) as z:
            # Set the 4-digit share code as the password
            z.setpassword(share_code.encode('utf-8'))
            
            # UIDAI zip contains exactly one XML file
            xml_filename = z.namelist()[0]
            
            with z.open(xml_filename) as xml_file:
                xml_content = xml_file.read()
                
        # 3. Parse the XML
        root = ET.fromstring(xml_content)
        
        # Strip namespaces to make searching reliable across different UIDAI versions
        for elem in root.iter():
            if '}' in elem.tag:
                elem.tag = elem.tag.split('}', 1)[1]
                
        # 4. Locate Demographic data and Photo
        poi = root.find('.//Poi')
        pht = root.find('.//Pht')
        
        if poi is None:
            raise HTTPException(400, "Invalid UIDAI XML format.")
            
        # Extract attributes safely
        name = poi.attrib.get('name', '')
        dob = poi.attrib.get('dob', '') # Usually DD-MM-YYYY
        
        # Convert UIDAI DOB to HTML Input format (YYYY-MM-DD)
        try:
            dob_obj = datetime.strptime(dob, "%d-%m-%Y")
            dob_formatted = dob_obj.strftime("%Y-%m-%d")
        except:
            dob_formatted = dob
            
        # Split name into first and last
        name_parts = name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        # Extract photo (it is stored as Base64 text inside the <Pht> tag)
        photo_base64 = pht.text if pht is not None else ""
        if photo_base64:
            photo_base64 = f"data:image/jpeg;base64,{photo_base64}"
            
        # UIDAI Offline XML purposefully does NOT contain the full ID number.
        # It provides a reference ID where the first 4 digits usually match the last 4 of the ID.
        reference_id = root.attrib.get('referenceId', '')
        last_4 = reference_id[0:4] if reference_id else "XXXX"
        
        return {
            "status": "success",
            "data": {
                "firstName": first_name,
                "lastName": last_name,
                "dob": dob_formatted,
                "photo": photo_base64,
                "aadhar_reference": f"XXXX-XXXX-{last_4}"
            }
        }
        
    except RuntimeError as e:
        if 'Bad password' in str(e) or 'password required' in str(e):
            raise HTTPException(400, "Incorrect 4-Digit Share Code.")
        print(f"Extraction Error: {e}")
        raise HTTPException(400, "Failed to unlock ZIP. Ensure it is a valid UIDAI file and the code is correct.")
    except Exception as e:
        print(f"e-KYC Parsing Error: {e}")
        raise HTTPException(500, "Failed to process e-KYC XML data.")
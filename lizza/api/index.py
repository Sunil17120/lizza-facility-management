import hashlib, os, math, smtplib, base64, json, requests, calendar, re
import httpx 
from email.mime.text import MIMEText
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, Query, File, UploadFile, Form, Request
from sqlalchemy.orm import Session
from sqlalchemy import extract, text, desc
from pydantic import BaseModel
from datetime import datetime, timedelta
import pyzipper
import io
import xml.etree.ElementTree as ET
import cv2
import numpy as np
import zlib
import zxingcpp
from fastapi.middleware.cors import CORSMiddleware
from upstash_redis import Redis as UpstashRedis
import firebase_admin
from firebase_admin import credentials, messaging

from .database import engine, SessionLocal, User, EmployeeLocation, OfficeLocation, SiteVisit, SiteStay, ShiftLog, FieldOfficerRoute, init_db, cipher
with engine.connect() as conn:
    conn.execute(text("""
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shift_logs' AND column_name='total_break_seconds') THEN 
                ALTER TABLE shift_logs ADD COLUMN total_break_seconds INTEGER DEFAULT 0; 
                ALTER TABLE shift_logs ADD COLUMN break_start_time TIMESTAMP;
                ALTER TABLE shift_logs ADD COLUMN is_on_break BOOLEAN DEFAULT FALSE;
            END IF; 
        END $$;
    """))
    conn.commit()

firebase_env = os.environ.get("FIREBASE_CREDENTIALS")
firebase_available = False
cred = None

def _parse_firebase_credentials(raw_value: str):
    if not raw_value:
        return None
    try:
        # Attempt direct JSON load
        return json.loads(raw_value)
    except json.JSONDecodeError:
        try:
            # Attempt base64 decoding if it's encoded
            decoded = base64.b64decode(raw_value).decode("utf-8")
            return json.loads(decoded)
        except Exception:
            return None
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], # Include OPTIONS here
    allow_headers=["*"],
)

class SafeRedisClient:
    def __init__(self, client):
        self._client = client

    def __bool__(self):
        return bool(self._client)

    def get(self, key):
        if not self._client: return None
        return self._client.get(key)

    def set(self, key, value, ex=None):
        if not self._client: return None
        return self._client.set(key, value, ex=ex)

    def delete(self, *keys):
        if not self._client: return None
        return self._client.delete(*keys)

upstash_url = os.environ.get("Redis_url_KV_REST_API_URL")
upstash_token = os.environ.get("Redis_url_KV_REST_API_TOKEN")

redis_client = UpstashRedis(url=upstash_url, token=upstash_token) if upstash_url else None
r = SafeRedisClient(redis_client)
init_db()

PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

def parse_iso_timestamp(ts_str: Optional[str]) -> datetime:
    if not ts_str: return datetime.utcnow()
    clean_ts = ts_str.replace('Z', '+00:00')
    return datetime.fromisoformat(clean_ts).replace(tzinfo=None)

def convert_utc_to_ist(utc_dt):
    if not utc_dt: return None
    if utc_dt.tzinfo is not None: utc_dt = utc_dt.replace(tzinfo=None)
    return utc_dt + timedelta(hours=5, minutes=30)

def get_distance(lat1, lon1, lat2, lon2):
    R = 6371000 
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def get_site_at_location(lat, lon, db):
    offices = db.query(OfficeLocation).all()
    for office in offices:
        lat_diff = office.radius / 111320.0
        lon_diff = office.radius / (111320.0 * max(0.000001, math.cos(math.radians(office.lat))))
        if abs(lat - office.lat) > lat_diff or abs(lon - office.lon) > lon_diff:
            continue
        distance = get_distance(lat, lon, office.lat, office.lon)
        if distance <= office.radius:
            return office
    return None

def safe_decrypt(encrypted_data: str) -> str:
    if not encrypted_data or str(encrypted_data).strip() == "" or encrypted_data in ["null", "undefined"]:
        return "N/A"
    from .database import cipher
    return cipher.decrypt(str(encrypted_data).encode()).decode()

def safe_encrypt(data: str) -> str:
    if not data or str(data).strip() == "" or data == "null" or data == "undefined":
        return None
    return cipher.encrypt(str(data).encode()).decode()

def get_secure_hash(password: str, salt: str):
    return hashlib.sha256((password + salt + PEPPER).encode()).hexdigest()

def upload_to_cloud(upload_file: UploadFile) -> str:
    if not upload_file or not upload_file.filename: return None
    image_bytes = upload_file.file.read()
    encoded_image = base64.b64encode(image_bytes).decode('utf-8')
    url = "https://api.imgbb.com/1/upload"
    payload = {"key": os.environ.get("IMGBB_API_KEY"), "image": encoded_image}
    response = requests.post(url, data=payload)
    res_data = response.json()
    if res_data.get("success"): return res_data["data"]["url"]
    return None

def send_push_notification(token: str, title: str, body: str, data: dict = None):
    if not token or not firebase_available:
        return False
    data_payload = {"title": title, "body": body}
    if isinstance(data, dict):
        data_payload.update(data)

    message = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        android=messaging.AndroidConfig(priority='high', notification=messaging.AndroidNotification(sound='default', default_vibrate_timings=True)),
        apns=messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(sound='default', content_available=True))),
        data=data_payload,
        token=token,
    )
    messaging.send(message)
    return True

def send_onboarding_email(to_email, full_name, temp_password, login_email):
    user = os.environ.get("SMTP_USER") 
    pw = os.environ.get("SMTP_PASS")
    host = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    if not user or not pw: return False
    
    body = f"Hello {full_name},\n\nYour account is verified.\nEmail: {login_email}\nPassword: Date of Birth"
    msg = MIMEText(body)
    msg['Subject'], msg['From'], msg['To'] = "LIZZA - Verification Successful", user, to_email
    
    server = smtplib.SMTP(host, 587)
    server.starttls()
    server.login(user, pw)
    server.sendmail(user, to_email, msg.as_string()) 
    server.quit()
    return True

async def get_address_from_coords(lat: float, lng: float) -> str:
    url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=18&addressdetails=1"
    headers = {"User-Agent": "LizzaFacilityManagement/1.0"}
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)
        data = response.json()
        return data.get("display_name", "Address not found")

async def get_snapped_route(coordinates_list: list) -> list:
    coords_string = ";".join([f"{lng},{lat}" for lat, lng in coordinates_list])
    url = f"https://router.project-osrm.org/route/v1/driving/{coords_string}?overview=full&geometries=geojson"
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        data = response.json()
        snapped_coords = data["routes"][0]["geometry"]["coordinates"]
        return [{"lat": coord[1], "lng": coord[0]} for coord in snapped_coords]

def get_db():
    db = SessionLocal()
    yield db
    db.close()

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

class CheckAction(BaseModel):
    email: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    timestamp: Optional[str] = None
    actionType: Optional[str] = None

class DayShiftAction(BaseModel):
    email: str
    action: str
    timestamp: str

class FCMTokenUpdate(BaseModel):
    email: str
    fcm_token: str

class LogoutNotify(BaseModel):
    email: str

class PingPayload(BaseModel):
    user_id: int
    lat: float
    lng: float

@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user or get_secure_hash(data.password, user.salt) != user.password:
        raise HTTPException(401, detail="Invalid credentials")
    if not user.is_verified and user.user_type != 'admin':
        raise HTTPException(403, detail="Pending Admin Verification")
    return {"user_id": user.id, "user": user.full_name, "user_type": user.user_type, "force_password_change": not user.is_password_changed}

@app.post("/api/user/update-fcm-token")
def update_fcm_token(data: FCMTokenUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if user:
        user.fcm_token = data.fcm_token
        db.commit()
        return {"status": "success"}
    raise HTTPException(404, "User not found")

@app.post("/api/user/send-logout-notification")
def send_logout_notification(data: LogoutNotify, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    token = getattr(user, 'fcm_token', None)
    if not token:
        return {"status": "no_token"}
    ok = send_push_notification(token, "Signed out", "You have been signed out of the app.", data={"type": "logout"})
    if ok:
        return {"status": "sent", "token": token}
    return {"status": "failed", "token": token}

@app.get("/api/user/profile")
def get_user_profile(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    from .database import Attendance
    open_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
    
    return {
        "id": user.id, "full_name": user.full_name, "email": user.email, "user_type": user.user_type,
        "blockchain_id": user.blockchain_id, "shift_start": user.shift_start, "shift_end": user.shift_end,
        "is_verified": user.is_verified, "location_id": user.location_id, "is_present": user.is_present,
        "checked_in": open_att is not None,
        "checkin_time": open_att.checkin_time.isoformat() + "Z" if open_att else None,
        "active_location_id": open_att.location_id if open_att else None
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

@app.get("/api/shift/current")
def get_current_shift(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    
    active_shift = db.query(ShiftLog).filter(ShiftLog.user_id == user.id, ShiftLog.logout_time == None).first()
    if not active_shift:
        return {"is_active": False}
        
    return {
        "is_active": True,
        "shift_id": active_shift.shift_id,
        "login_time": active_shift.login_time.isoformat() + "Z",
        "is_on_break": active_shift.is_on_break,
        "break_start_time": active_shift.break_start_time.isoformat() + "Z" if active_shift.break_start_time else None,
        "total_break_seconds": active_shift.total_break_seconds
    }

@app.post("/api/shift/day-action")
def day_shift_action(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email")
    action = payload.get("action")
    
    # Parse the exact time from the device to prevent timing drift
    action_time_str = payload.get("timestamp")
    # Use this safer version
    if action_time_str:
    # Parse the string and ensure it's a naive datetime object
        action_time = datetime.fromisoformat(action_time_str.replace("Z", "+00:00")).replace(tzinfo=None)
    else:
        action_time = datetime.utcnow()
    
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: return {"status": "error"}
    
    shift = db.query(ShiftLog).filter(ShiftLog.user_id == user.id, ShiftLog.logout_time == None).first()
    
    if action == "START" and not shift:
        shift_id = f"SFT_{user.id}_{action_time.strftime('%Y%m%d%H%M')}"
        db.add(ShiftLog(user_id=user.id, shift_id=shift_id, shift_date=action_time, login_time=action_time, current_status="ON_DUTY", total_break_minutes=0, total_break_seconds=0))
    elif shift:
        if action == "BREAK":
            shift.current_status = "ON_BREAK"
            shift.is_on_break = True
            shift.break_start_time = action_time
        elif action == "RESUME":
            shift.current_status = "ON_DUTY"
            shift.is_on_break = False
            if shift.break_start_time:
                break_duration = (action_time - shift.break_start_time).total_seconds()
                shift.total_break_seconds += int(break_duration)
                shift.break_start_time = None
        elif action == "END":
            shift.current_status = "OFF_DUTY"
            shift.logout_time = action_time
            if shift.is_on_break and shift.break_start_time:
                break_duration = (action_time - shift.break_start_time).total_seconds()
                shift.total_break_seconds += int(break_duration)
            shift.is_on_break = False
            
    db.commit()
    return {"status": "success"}

@app.post("/api/location/ping")
async def record_location_ping(payload: dict, db: Session = Depends(get_db)):
    # 1. Get the user from the email provided in the payload
    email = payload.get("email")
    user = db.query(User).filter(User.email == email).first()
    
    if not user:
        return {"status": "error", "message": "User not found"}

    # 2. Find the active shift for THIS specific user
    active_shift = db.query(ShiftLog).filter(
        ShiftLog.user_id == user.id, 
        ShiftLog.logout_time == None
    ).order_by(desc(ShiftLog.login_time)).first()
    
    if not active_shift:
        return {"status": "ignored", "reason": "No active shift"}

    # 3. Save the ping
    new_route = FieldOfficerRoute(
        user_id=user.id,
        shift_id=active_shift.shift_id,
        latitude=payload.get("lat"),
        longitude=payload.get("lon"),
        activity_state=payload.get("activity_state", "TRAVELING"),
        ping_timestamp=datetime.utcnow()
    )
    db.add(new_route)
    db.commit()
    return {"status": "success"}
@app.get("/api/routes/summary/{shift_id}")
async def get_shift_route_summary(shift_id: str, db: Session = Depends(get_db)):
    points = db.query(FieldOfficerRoute).filter(FieldOfficerRoute.shift_id == shift_id).order_by(FieldOfficerRoute.ping_timestamp.asc()).all()
    
    raw_coordinates = []
    formatted_coordinates = []
    site_stays = []
    
    current_stay = None
    total_travel_seconds = 0
    total_stay_seconds = 0
    
    for i in range(len(points)):
        pt = points[i]
        raw_coordinates.append((float(pt.latitude), float(pt.longitude)))
        formatted_coordinates.append({
            "lat": float(pt.latitude),
            "lng": float(pt.longitude),
            "time": pt.ping_timestamp.isoformat(),
            "state": pt.activity_state
        })
        
        if i > 0:
            time_delta = (pt.ping_timestamp - points[i-1].ping_timestamp).total_seconds()
            if pt.activity_state == "TRAVELING":
                total_travel_seconds += time_delta
            else:
                total_stay_seconds += time_delta

        if pt.activity_state == "AT_SITE":
            if current_stay is None:
                current_stay = { "latitude": float(pt.latitude), "longitude": float(pt.longitude), "arrival": pt.ping_timestamp, "departure": pt.ping_timestamp }
            else:
                current_stay["departure"] = pt.ping_timestamp
        else:
            if current_stay is not None:
                stay_duration_minutes = int((current_stay["departure"] - current_stay["arrival"]).total_seconds() / 60)
                address = await get_address_from_coords(current_stay["latitude"], current_stay["longitude"])
                site_stays.append({
                    "lat": current_stay["latitude"], "lng": current_stay["longitude"], "address": address,
                    "arrival": current_stay["arrival"].strftime("%I:%M %p"), "departure": current_stay["departure"].strftime("%I:%M %p"),
                    "duration_mins": stay_duration_minutes if stay_duration_minutes > 0 else 5
                })
                current_stay = None

    if current_stay is not None:
        stay_duration_minutes = int((current_stay["departure"] - current_stay["arrival"]).total_seconds() / 60)
        address = await get_address_from_coords(current_stay["latitude"], current_stay["longitude"])
        site_stays.append({
            "lat": current_stay["latitude"], "lng": current_stay["longitude"], "address": address,
            "arrival": current_stay["arrival"].strftime("%I:%M %p"), "departure": current_stay["departure"].strftime("%I:%M %p"),
            "duration_mins": stay_duration_minutes if stay_duration_minutes > 0 else 5
        })

    snapped_path = await get_snapped_route(raw_coordinates) if len(raw_coordinates) >= 2 else formatted_coordinates

    return {
        "shift_id": shift_id,
        "original_pings": formatted_coordinates,
        "snapped_route_path": snapped_path,
        "site_stays": site_stays,
        "metrics": {
            "total_travel_hours": round(total_travel_seconds / 3600, 2),
            "total_stay_hours": round(total_stay_seconds / 3600, 2)
        }
    }

@app.get("/api/admin/employee-route/{user_id}")
async def get_employee_today_route(user_id: int, db: Session = Depends(get_db)):
    active_shift = db.query(ShiftLog).filter(ShiftLog.user_id == user_id, ShiftLog.logout_time == None).order_by(desc(ShiftLog.login_time)).first()
    if not active_shift:
        active_shift = db.query(ShiftLog).filter(ShiftLog.user_id == user_id).order_by(desc(ShiftLog.login_time)).first()
    if not active_shift:
        raise HTTPException(404, "No route tracking data found for this user today.")
    return await get_shift_route_summary(active_shift.shift_id, db)

@app.post("/api/manager/add-employee")
async def add_employee(
    first_name: str = Form(...), last_name: str = Form(...), phone_number: str = Form(...), 
    personal_email: str = Form(...), dob: str = Form(...), designation: str = Form(...), 
    kyc_mode: str = Form(...), userType: str = Form("employee"), 
    gender: Optional[str] = Form(None), marital_status: Optional[str] = Form(None), 
    identity_mark: Optional[str] = Form(None), father_name: Optional[str] = Form(None), 
    mother_name: Optional[str] = Form(None), blood_group: Optional[str] = Form(None), 
    height: Optional[str] = Form(None), caste: Optional[str] = Form(None), 
    category: Optional[str] = Form(None), religion: Optional[str] = Form(None), 
    nationality: Optional[str] = Form(None), medical_remarks: Optional[str] = Form(None), 
    unit_name: Optional[str] = Form(None),
    perm_address: Optional[str] = Form(None), perm_state: Optional[str] = Form(None), 
    perm_pin: Optional[str] = Form(None), perm_mobile: Optional[str] = Form(None),
    temp_address: Optional[str] = Form(None), temp_state: Optional[str] = Form(None), 
    temp_pin: Optional[str] = Form(None), temp_mobile: Optional[str] = Form(None),
    languages_json: Optional[str] = Form(None), education_json: Optional[str] = Form(None), 
    experience_json: Optional[str] = Form(None), family_json: Optional[str] = Form(None), 
    references_json: Optional[str] = Form(None),
    bank_name: Optional[str] = Form(None), account_number: Optional[str] = Form(None), 
    ifsc_code: Optional[str] = Form(None), aadhar_number: Optional[str] = Form(None), 
    pan_number: Optional[str] = Form(None), voter_id: Optional[str] = Form(None), 
    driving_licence: Optional[str] = Form(None), passport_no: Optional[str] = Form(None),
    department: Optional[str] = Form("Operations"), manager_id: Optional[int] = Form(None),
    location_id: Optional[int] = Form(None), shift_start: Optional[str] = Form(None), shift_end: Optional[str] = Form(None),
    profile_photo: Optional[UploadFile] = File(None), aadhar_photo: Optional[UploadFile] = File(None),
    pan_photo: Optional[UploadFile] = File(None), voter_photo: Optional[UploadFile] = File(None),
    dl_photo: Optional[UploadFile] = File(None), passport_photo: Optional[UploadFile] = File(None),
    fingerprints_left: Optional[UploadFile] = File(None), fingerprints_right: Optional[UploadFile] = File(None),
    bank_passbook: Optional[UploadFile] = File(None),
    extra_files: Optional[List[UploadFile]] = File(None), extra_docs_info: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    if not phone_number.isdigit() or len(phone_number) != 10:
        raise HTTPException(status_code=422, detail="Primary Mobile Number must be exactly 10 digits.")
    email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    if not re.match(email_regex, personal_email):
        raise HTTPException(status_code=422, detail="Invalid Personal Email format.")
    if kyc_mode == 'without_aadhaar' and aadhar_number:
        if not aadhar_number.isdigit() or len(aadhar_number) != 12:
            raise HTTPException(status_code=422, detail="Aadhaar Number must be exactly 12 digits.")

    base_email = f"{first_name.strip().replace(' ', '').lower()}.{last_name.strip().replace(' ', '').lower()}@lizza.com"
    dt_obj = datetime.strptime(dob, "%Y-%m-%d")
    initial_pw = dt_obj.strftime("%d%m%Y") 
    salt = hashlib.sha256(base_email.encode()).hexdigest()[:16]

    profile_url = upload_to_cloud(profile_photo)
    aadhar_url = upload_to_cloud(aadhar_photo)
    pan_url = upload_to_cloud(pan_photo)
    voter_url = upload_to_cloud(voter_photo)
    dl_url = upload_to_cloud(dl_photo)
    passport_url = upload_to_cloud(passport_photo)
    left_fp_url = upload_to_cloud(fingerprints_left) if kyc_mode == 'without_aadhaar' else None
    right_fp_url = upload_to_cloud(fingerprints_right) if kyc_mode == 'without_aadhaar' else None
    passbook_url = upload_to_cloud(bank_passbook) 

    final_extra_docs = []
    if extra_docs_info and extra_files:
        docs_info = json.loads(extra_docs_info)
        for file in extra_files:
            matched_info = next((info for info in docs_info if info.get("originalName") == file.filename), None)
            if matched_info:
                uploaded_url = upload_to_cloud(file)
                if uploaded_url:
                    final_extra_docs.append({"title": matched_info.get("title", "Untitled Document"), "path": uploaded_url})
    extra_documents_json_str = json.dumps(final_extra_docs) if final_extra_docs else None

    new_user = User(
        first_name=first_name, last_name=last_name, full_name=f"{first_name} {last_name}",
        email=base_email, personal_email=personal_email, phone_number=phone_number,
        password=get_secure_hash(initial_pw, salt), salt=salt, 
        user_type=userType, manager_id=manager_id, location_id=location_id, is_verified=False, dob=dob,
        gender=gender, marital_status=marital_status, identity_mark=identity_mark,
        father_name=father_name, mother_name=mother_name, blood_group=blood_group,
        height=height, caste=caste, category=category, religion=religion, nationality=nationality, 
        medical_remarks=medical_remarks, unit_name=unit_name, designation=designation, department=department, kyc_mode=kyc_mode,
        perm_address=perm_address, perm_state=perm_state, perm_pin=perm_pin, perm_mobile=perm_mobile,
        temp_address=temp_address, temp_state=temp_state, temp_pin=temp_pin, temp_mobile=temp_mobile,
        languages_json=languages_json, education_json=education_json, experience_json=experience_json, 
        family_json=family_json, references_json=references_json, extra_documents_json=extra_documents_json_str, 
        aadhar_enc=safe_encrypt(aadhar_number), pan_enc=safe_encrypt(pan_number),
        account_number_enc=safe_encrypt(account_number), voter_id_enc=safe_encrypt(voter_id),
        driving_licence_enc=safe_encrypt(driving_licence), passport_no_enc=safe_encrypt(passport_no),
        bank_name=bank_name, ifsc_code=ifsc_code,
        profile_photo_path=profile_url, aadhar_photo_path=aadhar_url,
        pan_photo_path=pan_url, voter_photo_path=voter_url, dl_photo_path=dl_url, passport_photo_path=passport_url,
        fingerprints_left_path=left_fp_url, fingerprints_right_path=right_fp_url, bank_passbook_path=passbook_url, 
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
            parts = coords.split(',')
            lat, lon = float(parts[0]), float(parts[1])
        results.append({"email": m.email, "name": m.full_name, "lat": lat, "lon": lon, "present": m.is_present})
    return results

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
            parts = coords.split(',')
            lat, lon = float(parts[0]), float(parts[1])
        
        site_name = None
        if lat and lon:
            site = get_site_at_location(lat, lon, db)
            site_name = site.name if site else None
        
        results.append({
            "user_id": u.id, "email": u.email, "name": u.full_name, "user_type": u.user_type,
            "lat": lat, "lon": lon, "present": u.is_present, "site_name": site_name,
            "manager_id": u.manager_id, "last_ping": r.get(f"ping_time:{u.email}") if r else None
        })
    return results

@app.post("/api/admin/update-employee-inline")
def update_employee_inline(data: dict, db: Session = Depends(get_db)):
    user_id = data.get("id")
    if user_id: user = db.query(User).filter(User.id == user_id).first()
    else: user = db.query(User).filter(User.email == data.get("email")).first()
    if not user: raise HTTPException(404, "User not found")
    
    if "full_name" in data: user.full_name = data.get("full_name")
    if "email" in data: user.email = data.get("email")
    if "phone_number" in data: user.phone_number = data.get("phone_number")
    if "personal_email" in data: user.personal_email = data.get("personal_email")
    if "dob" in data: user.dob = data.get("dob")
    
    if "designation" in data: user.designation = data.get("designation")
    if "department" in data: user.department = data.get("department")
    if "user_type" in data: user.user_type = data.get("user_type")
    if "location_id" in data: user.location_id = data.get("location_id")
    if "manager_id" in data: user.manager_id = data.get("manager_id")
    if "shift_start" in data: user.shift_start = data.get("shift_start")
    if "shift_end" in data: user.shift_end = data.get("shift_end")

    if "perm_address" in data: user.perm_address = data.get("perm_address")
    if "perm_state" in data: user.perm_state = data.get("perm_state")
    if "perm_pin" in data: user.perm_pin = data.get("perm_pin")
    if "perm_mobile" in data: user.perm_mobile = data.get("perm_mobile")
    if "temp_address" in data: user.temp_address = data.get("temp_address")
    if "temp_state" in data: user.temp_state = data.get("temp_state")
    if "temp_pin" in data: user.temp_pin = data.get("temp_pin")
    if "temp_mobile" in data: user.temp_mobile = data.get("temp_mobile")

    if "bank_name" in data: user.bank_name = data.get("bank_name")
    if "ifsc_code" in data: user.ifsc_code = data.get("ifsc_code")
    
    if data.get("account_number_raw") and data.get("account_number_raw").strip() != "": user.account_number_enc = safe_encrypt(data.get("account_number_raw"))
    if data.get("aadhar_raw") and data.get("aadhar_raw").strip() != "": user.aadhar_enc = safe_encrypt(data.get("aadhar_raw"))
    if data.get("pan_raw") and data.get("pan_raw").strip() != "": user.pan_enc = safe_encrypt(data.get("pan_raw"))
    if data.get("voter_id_raw") and data.get("voter_id_raw").strip() != "": user.voter_id_enc = safe_encrypt(data.get("voter_id_raw"))
    if data.get("dl_raw") and data.get("dl_raw").strip() != "": user.driving_licence_enc = safe_encrypt(data.get("dl_raw"))

    db.commit()
    return {"status": "updated"}

@app.delete("/api/admin/delete-employee/{user_id}")
def delete_employee(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Employee not found.")
    if user.user_type == 'admin' or user.email == 'admin@lizza.com':
        raise HTTPException(status_code=403, detail="Security protocol prevents deleting the Super Admin account.")
    db.query(User).filter(User.manager_id == user_id).update({"manager_id": None})
    db.query(EmployeeLocation).filter(EmployeeLocation.user_id == user_id).delete()
    db.query(SiteVisit).filter(SiteVisit.officer_id == user_id).delete()
    db.query(SiteStay).filter(SiteStay.officer_id == user_id).delete()
    from .database import Attendance
    db.query(Attendance).filter(Attendance.user_id == user_id).delete()
    db.execute(text("DELETE FROM field_visit_logs WHERE officer_id = :uid"), {"uid": user_id})
    db.delete(user)
    db.commit()
    return {"status": "success", "message": "Employee and all related records deleted."}

@app.delete("/api/admin/delete-location/{loc_id}")
def delete_location(loc_id: int, db: Session = Depends(get_db)):
    loc = db.query(OfficeLocation).filter(OfficeLocation.id == loc_id).first()
    if loc: 
        db.delete(loc)
        db.commit()
    return {"status": "deleted"}

@app.delete("/api/admin/delete-visit/{visit_id}")
def delete_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = db.query(SiteVisit).filter(SiteVisit.id == visit_id).first()
    if not visit: raise HTTPException(status_code=404, detail="Visit not found")
    db.delete(visit)
    db.commit()
    return {"status": "success"}

@app.delete("/api/admin/delete-attendance/{attendance_id}")
def delete_attendance(attendance_id: int, db: Session = Depends(get_db)):
    from .database import Attendance
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not att: raise HTTPException(status_code=404, detail="Attendance record not found")
    if att.checkout_time is None:
        user = db.query(User).filter(User.id == att.user_id).first()
        if user: user.is_present = False
    db.delete(att)
    db.commit()
    return {"status": "success"}

@app.post("/api/user/native-webhook")
async def handle_native_webhook(request: Request, db: Session = Depends(get_db)):
    # 1. Parse the incoming JSON
    data = await request.json()
    
    # 2. Normalize the payload to match what record_location_ping expects
    # Your webhook might be sending 'location' nested object, so handle both cases
    loc_data = data.get("location", data)
    
    payload = {
        "email": request.headers.get("x-user-email") or data.get("email"),
        "lat": loc_data.get("latitude") or loc_data.get("lat"),
        "lon": loc_data.get("longitude") or loc_data.get("lon"),
        "activity_state": "TRAVELING"
    }
    
    # 3. Pass it to the function we just unified
    return await record_location_ping(payload, db)

@app.post("/api/user/sync-offline-locations")
async def sync_offline_locations(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email")
    locations = payload.get("locations", [])
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    
    if not user: return {"status": "error"}
    
    for loc in locations:
        lat = float(loc.get("lat"))
        lon = float(loc.get("lon"))
        timestamp_str = loc.get("timestamp")
        
        # Crucial: Must extract exact moment the phone recorded the GPS ping
        ping_time = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))[:19]
        
        db.add(FieldOfficerRoute(
            user_id=user.id,
            latitude=lat,
            longitude=lon,
            ping_timestamp=ping_time,
            activity_state="SYNCED"
        ))
        
        current_site = get_site_at_location(lat, lon, db)
        
        if current_site:
            if user.user_type == 'field_officer':
                active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
                if not active_stay:
                    db.add(SiteStay(officer_id=user.id, location_id=current_site.id, entry_time=ping_time))
            else:
                open_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
                if not open_att:
                    db.add(Attendance(user_id=user.id, checkin_time=ping_time, date=ping_time, location_id=current_site.id))
    
    db.commit()
    return {"status": "success"}

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: return {"status": "error", "message": "User not found"}
    
    now_utc = datetime.utcnow()
    current_site = get_site_at_location(lat, lon, db)
    from .database import Attendance

    if r:
        r.set(f"loc:{email}", f"{lat},{lon}", ex=86400)

    if current_site:
        if r: 
            r.set(f"last_inside_time:{email}", now_utc.isoformat(), ex=86400)
            r.set(f"ping_time:{email}", now_utc.isoformat(), ex=86400)

        open_attendance = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
        
        if open_attendance and open_attendance.location_id != current_site.id:
            open_attendance.checkout_time = now_utc
            open_attendance.duration_seconds = int((now_utc - open_attendance.checkin_time).total_seconds())
            
            old_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
            if old_stay: old_stay.exit_time = now_utc
            
            open_attendance = None 
        
        if not open_attendance:
            attendance = Attendance(user_id=user.id, checkin_time=now_utc, date=now_utc, location_id=current_site.id)
            user.is_present = True
            db.add(attendance)
            
            if user.user_type == 'field_officer':
                db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).update({"exit_time": now_utc})
                db.add(SiteStay(officer_id=user.id, location_id=current_site.id, entry_time=now_utc))
                
            db.commit()
            if getattr(user, 'fcm_token', None): send_push_notification(user.fcm_token, "✅ Auto Check-In Done", f"You are inside {current_site.name} and have been checked in.")
        else:
            if not user.is_present:
                user.is_present = True

            if user.user_type == 'field_officer':
                open_stays = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).all()
                has_current = False
                
                for stay in open_stays:
                    if stay.location_id == current_site.id:
                        has_current = True
                    else:
                        stay.exit_time = now_utc
                        
                if not has_current:
                    db.add(SiteStay(officer_id=user.id, location_id=current_site.id, entry_time=now_utc))
                    
            db.commit()
    else:
        if r: r.set(f"ping_time:{email}", now_utc.isoformat(), ex=86400)

        open_attendance = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
        
        if open_attendance or user.is_present:
            last_inside_str = r.get(f"last_inside_time:{email}")
            last_inside_time = datetime.fromisoformat(last_inside_str) if last_inside_str else now_utc
            
            if (now_utc - last_inside_time).total_seconds() / 60.0 >= 15.0:
                if open_attendance:
                    open_attendance.checkout_time = now_utc
                    open_attendance.duration_seconds = int((now_utc - open_attendance.checkin_time).total_seconds())
                
                active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
                if active_stay:
                    active_stay.exit_time = now_utc
                
                if user.user_type != 'field_officer':
                    user.is_present = False
                    
                db.commit()
                if getattr(user, 'fcm_token', None) and user.user_type != 'field_officer': 
                    send_push_notification(user.fcm_token, "🚪 Auto Check-Out", "You left the site boundary.")
                if r: r.delete(f"last_inside_time:{email}")

    return { "is_inside": current_site is not None, "status": "inside" if current_site is not None else "outside", "message": "Inside Geofence" if current_site is not None else "Outside Geofence", "site_name": current_site.name if current_site else None }

@app.post("/api/user/checkin")
def user_checkin(data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.get("email").lower().strip()).first()
    if not user: return {"status": "error"}
    
    action_time_str = data.get("timestamp")
    action_time = (
    datetime.fromisoformat(
        action_time_str.replace("Z", "+00:00")
    )
    if action_time_str
    else datetime.utcnow()
)
    site = get_site_at_location(data.get("lat"), data.get("lon"), db)
    if not site: return {"status": "error", "message": "Not within geofence"}

    user.is_present = True
    user.location_id = site.id
    
    if user.user_type == 'field_officer':
        db.add(SiteStay(officer_id=user.id, location_id=site.id, entry_time=action_time))
    else:
        db.add(Attendance(user_id=user.id, checkin_time=action_time, date=action_time, location_id=site.id))
        
    db.commit()
    return {"status": "success"}

@app.post("/api/user/checkout")
def user_checkout(data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.get("email").lower().strip()).first()
    if not user: return {"status": "error"}
    
    action_time_str = data.get("timestamp")
    action_time = datetime.fromisoformat(action_time_str.replace("Z", "+00:00"))[:19] if action_time_str else datetime.utcnow()
    
    user.is_present = False
    
    if user.user_type == 'field_officer':
        active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
        if active_stay:
            active_stay.exit_time = action_time
    else:
        open_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
        if open_att:
            open_att.checkout_time = action_time
            open_att.duration_seconds = int((action_time - open_att.checkin_time).total_seconds())
            
    db.commit()
    return {"status": "success"}

@app.get("/api/cron/auto-checkout")
def cron_auto_checkout(db: Session = Depends(get_db)):
    from .database import Attendance
    now_utc = datetime.utcnow()
    active_users = db.query(User).filter(User.is_present == True).all()
    swept_users = []
    
    for user in active_users:
        last_ping_str = r.get(f"ping_time:{user.email}")
        warning_key = f"warning_sent:{user.email}"
        warning_sent = r.get(warning_key) if r else None
        
        if last_ping_str:
            last_ping_time = datetime.fromisoformat(last_ping_str)
            minutes_since_last_ping = (now_utc - last_ping_time).total_seconds() / 60.0
        else:
            minutes_since_last_ping = float('inf')

        if minutes_since_last_ping >= 30 and not warning_sent:
            if getattr(user, 'fcm_token', None):
                send_push_notification(
                    token=user.fcm_token,
                    title="⚠️ Location Paused",
                    body="We haven't received your location update. Please open the app if you are moving."
                )
            if r:
                r.set(warning_key, '1', ex=3600)

        open_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
        force_checkout = False
        checkout_timestamp = now_utc

        if open_att:
            hours_since_checkin = (now_utc - open_att.checkin_time).total_seconds() / 3600.0
            
            if hours_since_checkin >= 14.0:
                force_checkout = True
                checkout_timestamp = now_utc
            
            elif minutes_since_last_ping >= 60.0:
                force_checkout = True
                checkout_timestamp = last_ping_time if last_ping_str else now_utc
        
        if force_checkout:
            if open_att:
                open_att.checkout_time = checkout_timestamp
                open_att.duration_seconds = int((open_att.checkout_time - open_att.checkin_time).total_seconds())
                
            active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
            if active_stay: 
                active_stay.exit_time = checkout_timestamp
                
            user.is_present = False
            db.commit()
            
            if getattr(user, 'fcm_token', None):
                send_push_notification(
                    token=user.fcm_token, 
                    title="⏱️ Shift Automatically Closed", 
                    body="Your shift was closed due to inactivity or reaching maximum duty hours."
                )
                
            if r:
                r.delete(f"ping_time:{user.email}")
                r.delete(f"last_inside_time:{user.email}")
                r.delete(warning_key)
                r.delete(f"loc:{user.email}")
                
            swept_users.append(user.email)
            
    return {"status": "success", "message": "Cron sweep complete", "auto_checked_out": swept_users}

@app.post("/api/field-officer/log-visit")
async def log_site_visit(
    email: str = Form(...), location_id: int = Form(...), purpose: str = Form(...), 
    photo_details: str = Form(...), 
    lat: float = Form(...), lon: float = Form(...), timestamp: str = Form(None), 
    photos: List[UploadFile] = File(...), 
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or user.user_type != 'field_officer': raise HTTPException(403, "Unauthorized")
    site = db.query(OfficeLocation).filter(OfficeLocation.id == location_id).first()
    if not site: raise HTTPException(404, "Site not found")

    distance = get_distance(lat, lon, site.lat, site.lon)
    if distance > site.radius: raise HTTPException(400, f"Geotag validation failed. You are {int(distance)}m away from the site.")

    now_utc = parse_iso_timestamp(timestamp)
    
    active_stay = db.query(SiteStay).filter(
        SiteStay.officer_id == user.id, 
        SiteStay.location_id == site.id,
        SiteStay.entry_time <= now_utc,
        (SiteStay.exit_time == None) | (SiteStay.exit_time >= now_utc)
    ).first()
    
    if not active_stay:
        raise HTTPException(400, "You must Check-In at the site before uploading a visit photo.")

    photo_urls = []
    for photo in photos:
        url = upload_to_cloud(photo)
        if url:
            photo_urls.append(url)

    details_list = json.loads(photo_details)
    combined_evidence = []
    
    for i in range(len(photo_urls)):
        detail = details_list[i] if i < len(details_list) else ""
        combined_evidence.append({"url": photo_urls[i], "details": detail})

    final_remarks = json.dumps(combined_evidence)
    final_photo_path = ",".join(photo_urls)

    visit = SiteVisit(officer_id=user.id, location_id=site.id, purpose=purpose, remarks=final_remarks, photo_path=final_photo_path, visit_time=now_utc)
    db.add(visit)
    db.commit()
    
    return {"status": "success", "message": f"{len(photo_urls)} Visit photos logged and geotag verified."}

@app.get("/api/field-officer/my-visits")
def get_my_visits(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(404, "User not found")
    visits = db.query(SiteVisit, OfficeLocation).join(OfficeLocation).filter(SiteVisit.officer_id == user.id).order_by(SiteVisit.visit_time.desc()).all()
    
    result = []
    for v, loc in visits:
        display_remarks = v.remarks
        if v.remarks.startswith('['):
            parsed_remarks = json.loads(v.remarks)
            display_remarks = " | ".join([item.get('details', '') for item in parsed_remarks])

        result.append({
            "site_name": loc.name, "purpose": v.purpose, "remarks": display_remarks, 
            "visit_time": convert_utc_to_ist(v.visit_time).strftime("%d-%b-%Y %I:%M %p") if v.visit_time else "N/A", 
            "photo_url": v.photo_path
        })
    return result

@app.get("/api/admin/reports/monthly-field-visits")
def get_monthly_field_visits(month: int, year: int, officer_id: Optional[int] = None, location_id: Optional[int] = None, user_type: Optional[str] = None, db: Session = Depends(get_db)):
    _, last_day = calendar.monthrange(year, month)
    start_utc = datetime(year, month, 1, 0, 0, 0) - timedelta(hours=5, minutes=30)
    end_utc = datetime(year, month, last_day, 23, 59, 59) - timedelta(hours=5, minutes=30)

    query = db.query(SiteVisit, User, OfficeLocation).join(User, SiteVisit.officer_id == User.id).join(OfficeLocation, SiteVisit.location_id == OfficeLocation.id)
    query = query.filter(SiteVisit.visit_time >= start_utc, SiteVisit.visit_time <= end_utc)
    if officer_id: query = query.filter(SiteVisit.officer_id == officer_id)
    if location_id: query = query.filter(SiteVisit.location_id == location_id)
    if user_type: query = query.filter(User.user_type == user_type)
    
    results = query.order_by(SiteVisit.visit_time.asc()).all()
    report_data = []
    
    for v, u, loc in results:
        ist_time = convert_utc_to_ist(v.visit_time)
        stay = db.query(SiteStay).filter(SiteStay.officer_id == v.officer_id, SiteStay.location_id == v.location_id, SiteStay.entry_time <= v.visit_time + timedelta(minutes=5)).order_by(SiteStay.entry_time.desc()).first()

        entry_str, exit_str, duration_str = "N/A", "N/A", "N/A"
        if stay and (stay.exit_time is None or stay.exit_time >= v.visit_time - timedelta(minutes=5)):
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
            "photo": v.photo_path, "excel_photo": f'=IMAGE("{v.photo_path.split(",")[0] if v.photo_path else ""}", "Visit Photo", 0)' if v.photo_path else "No Photo"
        })
    return report_data

@app.get("/api/admin/reports/monthly-attendance")
def get_monthly_attendance(
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[int] = None,
    location_id: Optional[int] = None,
    user_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if start_date or end_date:
        if start_date:
            start_utc = parse_iso_timestamp(start_date)
        elif month and year:
            start_utc = datetime(year, month, 1, 0, 0, 0) - timedelta(hours=5, minutes=30)
        else:
            raise HTTPException(status_code=400, detail="start_date or month/year required")

        if end_date:
            end_utc = parse_iso_timestamp(end_date)
            if len(end_date) <= 10 and 'T' not in end_date:
                end_utc = datetime.fromisoformat(end_date) + timedelta(hours=23, minutes=59, seconds=59)
        elif month and year:
            _, last_day = calendar.monthrange(year, month)
            end_utc = datetime(year, month, last_day, 23, 59, 59) - timedelta(hours=5, minutes=30)
        else:
            raise HTTPException(status_code=400, detail="end_date or month/year required")
    else:
        if month is None or year is None:
            raise HTTPException(status_code=400, detail="month and year are required")
        _, last_day = calendar.monthrange(year, month)
        start_utc = datetime(year, month, 1, 0, 0, 0) - timedelta(hours=5, minutes=30)
        end_utc = datetime(year, month, last_day, 23, 59, 59) - timedelta(hours=5, minutes=30)

    from .database import Attendance
    query = db.query(Attendance, User, OfficeLocation).join(User, Attendance.user_id == User.id).outerjoin(OfficeLocation, Attendance.location_id == OfficeLocation.id)
    query = query.filter(Attendance.date >= start_utc, Attendance.date <= end_utc)
    if user_id: query = query.filter(User.id == user_id)
    if location_id: query = query.filter(Attendance.location_id == location_id)
    if user_type: query = query.filter(User.user_type == user_type)
    results = query.order_by(Attendance.date.asc()).all()

    report_data = []
    for att, u, loc in results:
        checkin_ist = convert_utc_to_ist(att.checkin_time)
        checkout_ist = convert_utc_to_ist(att.checkout_time)
        duration_str = 'N/A'
        if att.duration_seconds is not None:
            hours, remainder = divmod(att.duration_seconds, 3600)
            duration_str = f"{int(hours)}h {int(remainder // 60)}m"
        report_data.append({
            "attendance_id": att.id, "date": checkin_ist.strftime("%d-%b-%Y") if checkin_ist else "N/A",
            "employee_id": u.blockchain_id or f"EMP-{u.id}", "employee_name": u.full_name, "user_type": u.user_type,
            "site_name": loc.name if loc else 'N/A', "checkin_time": checkin_ist.strftime("%I:%M %p") if checkin_ist else "N/A",
            "checkout_time": checkout_ist.strftime("%I:%M %p") if checkout_ist else "N/A", "duration": duration_str,
        })
    return report_data

@app.post("/api/manager/extract-ekyc")
async def extract_ekyc(file: UploadFile = File(...), share_code: str = Form(...)):
    zip_bytes = await file.read()
    with pyzipper.AESZipFile(io.BytesIO(zip_bytes)) as z:
        z.setpassword(share_code.encode('utf-8'))
        xml_filename = z.namelist()[0]
        with z.open(xml_filename) as xml_file: xml_content = xml_file.read()
            
    root = ET.fromstring(xml_content)
    for elem in root.iter():
        if '}' in elem.tag: elem.tag = elem.tag.split('}', 1)[1]
            
    poi, pht = root.find('.//Poi'), root.find('.//Pht')
    name = poi.attrib.get('name', '')
    dob_val = poi.attrib.get('dob', '')
    if "-" in dob_val: dob_formatted = datetime.strptime(dob_val, "%d-%m-%Y").strftime("%Y-%m-%d")
    else: dob_formatted = dob_val
        
    name_parts = name.split(' ', 1)
    photo_base64 = f"data:image/jpeg;base64,{pht.text}" if (pht is not None and pht.text) else ""
    ref_id = root.attrib.get('referenceId', '')
    
    return {"status": "success", "data": { "firstName": name_parts[0], "lastName": name_parts[1] if len(name_parts) > 1 else '', "dob": dob_formatted, "photo": photo_base64, "aadhar_reference": f"XXXX-XXXX-{ref_id[0:4] if ref_id else 'XXXX'}" }}

@app.post("/api/manager/extract-qr")
async def extract_qr(file: UploadFile = File(...)):
    image_bytes = await file.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    barcodes = zxingcpp.read_barcodes(img)
    qr_text = barcodes[0].text.strip()

    if qr_text.isdigit() and len(qr_text) > 500:
        qr_int = int(qr_text)
        qr_bytes = qr_int.to_bytes((qr_int.bit_length() + 7) // 8, byteorder='big')
        start_idx = qr_bytes.find(b'\x1f\x8b\x08')
        compressed_data = qr_bytes[start_idx:]
        decompressed = zlib.decompress(compressed_data, zlib.MAX_WBITS | 32)
        parts = decompressed.split(b'\xff')
        str_parts = [p.decode('utf-8', errors='ignore').strip() for p in parts]

        gender_idx = -1
        for idx, val in enumerate(str_parts):
            if val in ['M', 'F', 'T'] and idx >= 2:
                gender_idx = idx
                break
        
        if gender_idx != -1:
            name_raw = str_parts[gender_idx - 2]
            dob_raw = str_parts[gender_idx - 1]
            gender_raw = str_parts[gender_idx]
            care_of = str_parts[gender_idx + 1] if len(str_parts) > gender_idx + 1 else ""
        else:
            name_raw = str_parts[2] if len(str_parts) > 2 else ""
            dob_raw = str_parts[3] if len(str_parts) > 3 else ""
            gender_raw = str_parts[4] if len(str_parts) > 4 else ""
            care_of = str_parts[5] if len(str_parts) > 5 else ""

        name_parts = name_raw.strip().split(' ')
        first_name = name_parts[0]
        last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''
        
        if "-" in dob_raw: dob_formatted = datetime.strptime(dob_raw, "%d-%m-%Y").strftime("%Y-%m-%d")
        else: dob_formatted = dob_raw

        father_name = care_of.replace('S/O', '').replace('D/O', '').replace('C/O', '').replace(':', '').strip()
        return { "status": "success", "data": { "firstName": first_name, "lastName": last_name, "dob": dob_formatted, "gender": "Male" if gender_raw == 'M' else "Female" if gender_raw == 'F' else gender_raw, "fatherName": father_name, "aadhar_reference": "XXXX-XXXX-VERIFIED" } }
    else:
        root = ET.fromstring(qr_text)
        attribs = root.attrib
        name_parts = attribs.get('name', '').strip().split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        dob_val = attribs.get('dob', '')
        if "/" in dob_val: dob_formatted = datetime.strptime(dob_val, "%d/%m/%Y").strftime("%Y-%m-%d")
        elif "-" in dob_val: dob_formatted = datetime.strptime(dob_val, "%Y-%m-%d").strftime("%Y-%m-%d")
        else: dob_formatted = dob_val

        uid = attribs.get('uid', '')
        masked_aadhar = f"XXXX-XXXX-{uid[-4:]}" if len(uid) >= 4 else "XXXX"
        return { "status": "success", "data": { "firstName": first_name, "lastName": last_name, "dob": dob_formatted, "gender": "Male" if attribs.get('gender') == 'M' else "Female" if attribs.get('gender') == 'F' else attribs.get('gender', ''), "fatherName": attribs.get('co', '').replace('S/O', '').replace('D/O', '').replace('C/O', '').strip(), "aadhar_reference": masked_aadhar } }

@app.get("/api/test-fcm")
def test_fcm(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if user and user.fcm_token:
        send_push_notification(user.fcm_token, "Test Title", "Test Message Body")
        return {"status": "sent", "token_exists": True}
    return {"status": "failed", "reason": "User not found or no FCM token"}

@app.get("/api/admin/employee-dossier/{user_id}")
def get_decrypted_dossier(user_id: int, admin_email: str, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip(), User.user_type == 'admin').first()
    if not admin: raise HTTPException(403, "Unauthorized. Only admins can view decrypted dossiers.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(404, "Employee not found.")
        
    user_data = {c.name: getattr(user, c.name) for c in user.__table__.columns}
    user_data['aadhar_raw'] = safe_decrypt(user.aadhar_enc)
    user_data['pan_raw'] = safe_decrypt(user.pan_enc)
    user_data['account_number_raw'] = safe_decrypt(user.account_number_enc)
    user_data['voter_id_raw'] = safe_decrypt(user.voter_id_enc)
    user_data['dl_raw'] = safe_decrypt(user.driving_licence_enc)
    user_data['passport_raw'] = safe_decrypt(user.passport_no_enc)
    
    user_data.pop('password', None)
    user_data.pop('salt', None)
    
    return {"status": "success", "data": user_data}
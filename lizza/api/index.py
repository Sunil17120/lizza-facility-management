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

from .database import engine, SessionLocal, User, EmployeeLocation, OfficeLocation, SiteVisit, SiteStay, ShiftLog, FieldOfficerRoute, Attendance, init_db, cipher

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
    if not raw_value: return None
    if raw_value.startswith('{'):
        return json.loads(raw_value)
    
    decoded = base64.b64decode(raw_value).decode("utf-8")
    if decoded.startswith('{'):
        return json.loads(decoded)
    return None

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], 
    allow_headers=["*"],
)

class SafeRedisClient:
    def __init__(self, client): self._client = client
    def __bool__(self): return bool(self._client)
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

def get_cached_locations(redis_client, db_session):
    cached = redis_client.get("all_locations")
    if cached and str(cached).startswith('['):
        return json.loads(cached)
        
    locs = db_session.query(OfficeLocation).all()
    loc_list = [{"id": l.id, "name": l.name, "lat": l.lat, "lon": l.lon, "radius": l.radius} for l in locs]
    redis_client.set("all_locations", json.dumps(loc_list), ex=86400) 
    return loc_list

class MockOffice:
    def __init__(self, d):
        self.id = d["id"]
        self.name = d["name"]
        self.lat = d["lat"]
        self.lon = d["lon"]
        self.radius = d["radius"]

def get_site_at_location(lat, lon, r_client, db):
    offices = get_cached_locations(r_client, db)
    for office in offices:
        dist = get_distance(lat, lon, office["lat"], office["lon"])
        if dist <= office.get("radius", 200):
            return MockOffice(office)
    return None

def safe_decrypt(encrypted_data: str) -> str:
    if not encrypted_data or str(encrypted_data).strip() == "" or encrypted_data in ["null", "undefined"]: return "N/A"
    return cipher.decrypt(str(encrypted_data).encode()).decode()

def safe_encrypt(data: str) -> str:
    if not data or str(data).strip() == "" or data == "null" or data == "undefined": return None
    return cipher.encrypt(str(data).encode()).decode()

def get_secure_hash(password: str, salt: str): return hashlib.sha256((password + salt + PEPPER).encode()).hexdigest()

def upload_to_cloud(upload_file: UploadFile) -> str:
    if not upload_file or not upload_file.filename: return None
    image_bytes = upload_file.file.read()
    encoded_image = base64.b64encode(image_bytes).decode('utf-8')
    url = "https://api.imgbb.com/1/upload"
    payload = {"key": os.environ.get("IMGBB_API_KEY"), "image": encoded_image}
    response = requests.post(url, data=payload)
    res_json = response.json()
    if isinstance(res_json, dict) and res_json.get("success"): 
        return res_json["data"]["url"]
    return None

def send_push_notification(token: str, title: str, body: str, data: dict = None):
    if not token or not firebase_available: return False
    data_payload = {"title": title, "body": body}
    if isinstance(data, dict): data_payload.update(data)
    message = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        android=messaging.AndroidConfig(priority='high', notification=messaging.AndroidNotification(sound='default', default_vibrate_timings=True)),
        apns=messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(sound='default', content_available=True))),
        data=data_payload, token=token,
    )
    messaging.send(message)
    return True

async def get_snapped_route(coordinates_list: list) -> list:
    max_coords = 50
    if len(coordinates_list) > max_coords:
        sampled_coords = coordinates_list[::len(coordinates_list) // max_coords]
    else:
        sampled_coords = coordinates_list
    coords_string = ";".join([f"{lng},{lat}" for lat, lng in sampled_coords])
    url = f"https://router.project-osrm.org/route/v1/driving/{coords_string}?overview=full&geometries=geojson"
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        if response.status_code != 200: return []
        data = response.json()
        if not data.get("routes"): return []
        return [{"lat": coord[1], "lng": coord[0]} for coord in data["routes"][0]["geometry"]["coordinates"]]

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
        if isinstance(data, dict):
            return data.get("display_name", "Address not found")
        return "Address not found"

def get_db():
    db = SessionLocal()
    yield db
    db.close()

class AuthRequest(BaseModel): email: str; password: str
class LocationCreate(BaseModel): name: str; lat: float; lon: float; radius: int
class FCMTokenUpdate(BaseModel): email: str; fcm_token: str
class LogoutNotify(BaseModel): email: str
class PasswordChange(BaseModel): email: str; old_password: str; new_password: str

@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user or get_secure_hash(data.password, user.salt) != user.password: raise HTTPException(401, "Invalid credentials")
    if not user.is_verified and user.user_type != 'admin': raise HTTPException(403, "Pending Admin Verification")
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
    if not user: raise HTTPException(status_code=404, detail="User not found")
    token = getattr(user, 'fcm_token', None)
    if not token: return {"status": "no_token"}
    ok = send_push_notification(token, "Signed out", "You have been signed out of the app.", data={"type": "logout"})
    return {"status": "sent" if ok else "failed", "token": token}

@app.get("/api/user/profile")
def get_user_profile(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(404, "User not found")
    open_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
    return {
        "id": user.id, "full_name": user.full_name, "email": user.email, "user_type": user.user_type,
        "blockchain_id": user.blockchain_id, "shift_start": user.shift_start, "shift_end": user.shift_end,
        "is_verified": user.is_verified, "location_id": user.location_id, "is_present": user.is_present,
        "checked_in": open_att is not None, "checkin_time": open_att.checkin_time.isoformat() + "Z" if open_att else None,
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
    if not user: raise HTTPException(404, "User not found")
    
    active_shift = db.query(ShiftLog).filter(ShiftLog.user_id == user.id, ShiftLog.logout_time == None).first()
    if not active_shift: return {"is_active": False}
        
    now_utc = datetime.utcnow()
    attendances = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkin_time >= active_shift.login_time).all()
    
    stay_seconds = 0
    for att in attendances:
        if att.checkout_time: stay_seconds += (att.checkout_time - att.checkin_time).total_seconds()
        else: stay_seconds += (now_utc - att.checkin_time).total_seconds()
            
    elapsed_duty = (now_utc - active_shift.login_time).total_seconds() - active_shift.total_break_seconds
    if active_shift.is_on_break and active_shift.break_start_time:
        elapsed_duty -= (now_utc - active_shift.break_start_time).total_seconds()
        
    travel_seconds = max(0, elapsed_duty - stay_seconds)

    return {
        "is_active": True, "shift_id": active_shift.shift_id,
        "login_time": active_shift.login_time.isoformat() + "Z", "is_on_break": active_shift.is_on_break,
        "break_start_time": active_shift.break_start_time.isoformat() + "Z" if active_shift.break_start_time else None,
        "total_break_seconds": active_shift.total_break_seconds, "travel_seconds": int(travel_seconds) 
    }

@app.post("/api/shift/day-action")
def day_shift_action(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email")
    action = payload.get("action")
    action_time_str = payload.get("timestamp")
    action_time = datetime.fromisoformat(action_time_str.replace("Z", "+00:00")).replace(tzinfo=None) if action_time_str else datetime.utcnow()
    
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: return {"status": "error"}
    
    shift = db.query(ShiftLog).filter(ShiftLog.user_id == user.id, ShiftLog.logout_time == None).first()
    
    if action == "START" and not shift:
        shift_id = f"SFT_{user.id}_{action_time.strftime('%Y%m%d%H%M')}"
        db.add(ShiftLog(user_id=user.id, shift_id=shift_id, shift_date=action_time, login_time=action_time, current_status="ON_DUTY", total_break_seconds=0))
        
        # Field Officers daily attendance is marked when shift starts
        if user.user_type == 'field_officer':
            db.add(Attendance(user_id=user.id, checkin_time=action_time, date=action_time))
            user.is_present = True
            
        r.set(f"active_shift:{email}", f"{shift_id}|{user.id}", ex=43200)
        
    elif shift:
        if action == "BREAK":
            shift.current_status = "ON_BREAK"
            shift.is_on_break = True
            shift.break_start_time = action_time
        elif action == "RESUME":
            shift.current_status = "ON_DUTY"
            shift.is_on_break = False
            if shift.break_start_time:
                shift.total_break_seconds += int((action_time - shift.break_start_time).total_seconds())
                shift.break_start_time = None
        elif action == "END":
            shift.current_status = "OFF_DUTY"
            shift.logout_time = action_time
            if shift.is_on_break and shift.break_start_time:
                shift.total_break_seconds += int((action_time - shift.break_start_time).total_seconds())
            shift.is_on_break = False
            
            # Close Field Officer daily attendance
            if user.user_type == 'field_officer':
                att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
                if att:
                    att.checkout_time = action_time
                    att.duration_seconds = int((action_time - att.checkin_time).total_seconds())
                user.is_present = False
                
            r.delete(f"active_shift:{email}")
            
    db.commit()
    return {"status": "success"}

@app.post("/api/location/ping")
async def record_location_ping(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email")
    user = db.query(User).filter(User.email == email).first()
    if not user: return {"status": "error", "message": "User not found"}

    # STRICT PRIVACY LOCK: Instantly reject background pings from normal employees
    if user.user_type != 'field_officer':
        return {"status": "ignored", "reason": "Normal employees are not background tracked."}

    active_shift = db.query(ShiftLog).filter(
        ShiftLog.user_id == user.id, 
        ShiftLog.logout_time == None
    ).order_by(desc(ShiftLog.login_time)).first()
    
    if not active_shift: return {"status": "ignored", "reason": "No active shift"}

    ts_str = payload.get("timestamp")
    ping_time = parse_iso_timestamp(ts_str) if ts_str else datetime.utcnow()

    new_route = FieldOfficerRoute(
        user_id=user.id,
        shift_id=active_shift.shift_id,
        latitude=payload.get("lat"),
        longitude=payload.get("lon"),
        activity_state=payload.get("activity_state", "TRAVELING"),
        ping_timestamp=ping_time
    )
    db.add(new_route)
    db.commit()
    return {"status": "success"}

@app.get("/api/admin/employee-route/{user_id}")
async def get_employee_today_route(user_id: int, db: Session = Depends(get_db)):
    active_shift = db.query(ShiftLog).filter(ShiftLog.user_id == user_id, ShiftLog.logout_time == None).order_by(desc(ShiftLog.login_time)).first()
    if not active_shift:
        active_shift = db.query(ShiftLog).filter(ShiftLog.user_id == user_id).order_by(desc(ShiftLog.login_time)).first()
    if not active_shift: 
        raise HTTPException(404, "No route tracking data found for this user today.")
        
    points = db.query(FieldOfficerRoute).filter(FieldOfficerRoute.shift_id == active_shift.shift_id).order_by(FieldOfficerRoute.ping_timestamp.asc()).all()
    
    # 1. Expand the Time Window (Look 4 hours into the past to catch early check-ins)
    window_start = active_shift.login_time - timedelta(hours=4)
    
    stays = db.query(SiteStay, OfficeLocation).join(OfficeLocation, SiteStay.location_id == OfficeLocation.id).filter(
        SiteStay.officer_id == user_id, 
        SiteStay.entry_time >= window_start
    ).all()
    
    visits = db.query(SiteVisit).filter(
        SiteVisit.officer_id == user_id, 
        SiteVisit.visit_time >= window_start
    ).all()
    
    formatted_stays = []
    total_stay_seconds = 0
    
    for stay, loc in stays:
        # Skip if the stay happened after the shift entirely ended
        if active_shift.logout_time and stay.entry_time > active_shift.logout_time:
            continue
            
        exit_t = stay.exit_time or (active_shift.logout_time if active_shift.logout_time else datetime.utcnow())
        
        # Calculate perfectly avoiding timezone negatives
        dur_sec = (exit_t - stay.entry_time).total_seconds()
        if dur_sec < 0:
            dur_sec = 0
            
        total_stay_seconds += dur_sec
        
        # Search for evidence logged within 15 mins of this specific geofence stay
        matching_visits = [v for v in visits if v.location_id == loc.id and (stay.entry_time - timedelta(minutes=15)) <= v.visit_time <= (exit_t + timedelta(minutes=15))]
        
        formatted_stays.append({
            "lat": loc.lat, 
            "lng": loc.lon, 
            "radius": loc.radius or 200, 
            "name": loc.name,
            "arrival": convert_utc_to_ist(stay.entry_time).strftime("%I:%M %p"),
            "departure": convert_utc_to_ist(stay.exit_time).strftime("%I:%M %p") if stay.exit_time else "Active",
            "duration_mins": int(dur_sec // 60),
            "has_log": len(matching_visits) > 0
        })
        
    # 2. Perfect Metric Subtractions
    now_t = active_shift.logout_time or datetime.utcnow()
    duty_sec = (now_t - active_shift.login_time).total_seconds() - active_shift.total_break_seconds
    if duty_sec < 0: 
        duty_sec = 0
    
    if active_shift.is_on_break and active_shift.break_start_time:
        break_dur = (datetime.utcnow() - active_shift.break_start_time).total_seconds()
        if break_dur > 0:
            duty_sec = max(0, duty_sec - break_dur)
        
    travel_sec = max(0, duty_sec - total_stay_seconds)
    
    raw_coords = [(float(p.latitude), float(p.longitude)) for p in points]
    snapped = await get_snapped_route(raw_coords) if len(raw_coords) >= 2 else [{"lat": c[0], "lng": c[1]} for c in raw_coords]

    return {
        "shift_id": active_shift.shift_id,
        "metrics": {
            "total_duty_hours": round(duty_sec / 3600, 2),
            "total_travel_hours": round(travel_sec / 3600, 2),
            "total_stay_hours": round(total_stay_seconds / 3600, 2),
            "total_break_hours": round(active_shift.total_break_seconds / 3600, 2)
        },
        "site_stays": formatted_stays,
        "snapped_route_path": snapped
    }

@app.get("/api/admin/locations")
def get_locations(db: Session = Depends(get_db)): 
    return get_cached_locations(r, db)

@app.post("/api/admin/add-location")
def add_location(data: LocationCreate, db: Session = Depends(get_db)):
    db.add(OfficeLocation(**data.dict()))
    db.commit()
    r.delete("all_locations")
    return {"message": "Location Added"}

@app.put("/api/admin/update-location/{loc_id}")
def update_location_endpoint(loc_id: int, data: LocationCreate, db: Session = Depends(get_db)):
    loc = db.query(OfficeLocation).filter(OfficeLocation.id == loc_id).first()
    if not loc: raise HTTPException(404, "Location not found")
    loc.name, loc.lat, loc.lon, loc.radius = data.name, data.lat, data.lon, data.radius
    db.commit()
    r.delete("all_locations")
    return {"status": "updated"}

@app.delete("/api/admin/delete-location/{loc_id}")
def delete_location(loc_id: int, db: Session = Depends(get_db)):
    loc = db.query(OfficeLocation).filter(OfficeLocation.id == loc_id).first()
    if loc: 
        db.delete(loc)
        db.commit()
        r.delete("all_locations")
    return {"status": "deleted"}

@app.post("/api/user/sync-offline-locations")
async def sync_offline_locations(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email")
    locations = payload.get("locations", [])
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: return {"status": "error"}
    
    for loc in locations:
        # Parses the timestamp as a string first, formats it, and removes timezone to make it naive
        raw_ts = str(loc.get("timestamp")).replace("Z", "+00:00")
        ping_time = datetime.fromisoformat(raw_ts).replace(tzinfo=None)
        
        db.add(FieldOfficerRoute(user_id=user.id, latitude=float(loc.get("lat")), longitude=float(loc.get("lon")), ping_timestamp=ping_time, activity_state="SYNCED"))
        
        current_site = get_site_at_location(float(loc.get("lat")), float(loc.get("lon")), r, db)
        if current_site:
            if user.user_type == 'field_officer':
                active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
                if not active_stay: db.add(SiteStay(officer_id=user.id, location_id=current_site.id, entry_time=ping_time))
            else:
                open_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
                if not open_att: db.add(Attendance(user_id=user.id, checkin_time=ping_time, date=ping_time, location_id=current_site.id))
    
    db.commit()
    return {"status": "success"}

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: return {"status": "error", "message": "User not found"}
    now_utc = datetime.utcnow()
    current_site = get_site_at_location(lat, lon, r, db)

    r.set(f"loc:{email}", f"{lat},{lon}", ex=86400)

    if current_site:
        r.set(f"last_inside_time:{email}", now_utc.isoformat(), ex=86400)
        r.set(f"ping_time:{email}", now_utc.isoformat(), ex=86400)
        
        if user.user_type == 'field_officer':
            open_stays = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).all()
            has_current = False
            for stay in open_stays:
                if stay.location_id == current_site.id: has_current = True
                else: stay.exit_time = now_utc
            if not has_current:
                db.add(SiteStay(officer_id=user.id, location_id=current_site.id, entry_time=now_utc))
        else:
            open_attendance = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
            if open_attendance and open_attendance.location_id != current_site.id:
                open_attendance.checkout_time = now_utc
                open_attendance.duration_seconds = int((now_utc - open_attendance.checkin_time).total_seconds())
                open_attendance = None 
            if not open_attendance:
                db.add(Attendance(user_id=user.id, checkin_time=now_utc, date=now_utc, location_id=current_site.id))
                user.is_present = True
                user.checked_in = True
                user.active_location_id = current_site.id
        db.commit()
    else:
        r.set(f"ping_time:{email}", now_utc.isoformat(), ex=86400)
        
        last_inside_str = r.get(f"last_inside_time:{email}")
        last_inside_time = datetime.fromisoformat(last_inside_str) if last_inside_str else now_utc
        
        if (now_utc - last_inside_time).total_seconds() / 60.0 >= 15.0:
            if user.user_type == 'field_officer':
                active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
                if active_stay: active_stay.exit_time = now_utc
            else:
                open_attendance = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
                if open_attendance:
                    open_attendance.checkout_time = now_utc
                    open_attendance.duration_seconds = int((now_utc - open_attendance.checkin_time).total_seconds())
                user.is_present = False
                user.checked_in = False
                user.active_location_id = None
            db.commit()
            r.delete(f"last_inside_time:{email}")

    return { "is_inside": current_site is not None, "site_name": current_site.name if current_site else None }

@app.post("/api/user/checkin")
def user_checkin(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email")
    location_id = payload.get("location_id")
    action_time_str = payload.get("timestamp")
    action_time = parse_iso_timestamp(action_time_str) if action_time_str else datetime.utcnow()

    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: raise HTTPException(404, "User not found")
    
    if user.user_type == 'field_officer':
        active_shift = db.query(ShiftLog).filter(ShiftLog.user_id == user.id, ShiftLog.logout_time == None).first()
        if not active_shift: raise HTTPException(400, "No active shift")
        db.add(SiteStay(officer_id=user.id, location_id=location_id, entry_time=action_time))
        user.active_location_id = location_id
    else:
        existing = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
        if existing: return {"status": "success", "message": "Already checked in"}
        db.add(Attendance(user_id=user.id, location_id=location_id, checkin_time=action_time, date=action_time))
        user.checked_in = True
        user.active_location_id = location_id
        user.is_present = True

    db.commit()
    return {"status": "success"}

@app.post("/api/user/checkout")
def user_checkout(payload: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.get("email").lower().strip()).first()
    if not user: raise HTTPException(404, "User not found")

    action_time_str = payload.get("timestamp")
    action_time = parse_iso_timestamp(action_time_str) if action_time_str else datetime.utcnow()
    
    if user.user_type == 'field_officer':
        active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
        if active_stay: active_stay.exit_time = action_time
        user.active_location_id = None
    else:
        active_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).order_by(desc(Attendance.checkin_time)).first()
        if active_att:
            active_att.checkout_time = action_time
            active_att.duration_seconds = int((action_time - active_att.checkin_time).total_seconds())
        user.checked_in = False
        user.active_location_id = None
        user.is_present = False

    db.commit()
    return {"status": "success"}

@app.post("/api/field-officer/log-visit")
async def log_site_visit(
    email: str = Form(...), location_id: int = Form(...), purpose: str = Form(...), 
    photo_details: str = Form(...), lat: float = Form(...), lon: float = Form(...), 
    timestamp: str = Form(None), photos: List[UploadFile] = File(...), db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    site = db.query(OfficeLocation).filter(OfficeLocation.id == location_id).first()
    now_utc = parse_iso_timestamp(timestamp)
    
    # 1. SOFT VALIDATION: If not checked in, try to auto-checkin to fix 400 errors
    active_stay = db.query(SiteStay).filter(
        SiteStay.officer_id == user.id, 
        SiteStay.location_id == site.id, 
        SiteStay.exit_time == None
    ).first()
    
    if not active_stay:
        # Create a retroactive stay if they forgot to check in
        new_stay = SiteStay(officer_id=user.id, location_id=site.id, entry_time=now_utc - timedelta(minutes=1))
        db.add(new_stay)
        db.commit()
        active_stay = new_stay

    # 2. Process Photos
    photo_urls = [upload_to_cloud(photo) for photo in photos if photo]
    details_list = json.loads(photo_details)
    combined = [{"url": photo_urls[i], "details": details_list[i] if i < len(details_list) else ""} for i in range(len(photo_urls))]
    
    # 3. Save Log
    db.add(SiteVisit(
        officer_id=user.id, 
        location_id=site.id, 
        purpose=purpose, 
        remarks=json.dumps(combined), 
        photo_path=",".join(filter(None, photo_urls)), 
        visit_time=now_utc
    ))
    db.commit()
    return {"status": "success"}

@app.get("/api/field-officer/my-visits")
def get_my_visits(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user: return []
    visits = db.query(SiteVisit, OfficeLocation).join(OfficeLocation).filter(SiteVisit.officer_id == user.id).order_by(SiteVisit.visit_time.desc()).all()
    
    result = []
    for v, loc in visits:
        display_remarks = v.remarks
        if v.remarks and v.remarks.startswith('['):
            if '"details"' in v.remarks:
                parsed = json.loads(v.remarks)
                display_remarks = " | ".join([item.get('details', '') for item in parsed])
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

@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)):
    return db.query(User).all()

@app.get("/api/admin/live-tracking")
async def get_live_tracking(admin_email: str = None, db: Session = Depends(get_db)):
    employees = db.query(User).filter(User.user_type.in_(['field_officer', 'employee'])).all()
    live_data = []
    
    for emp in employees:
        emp_data = {
            "user_id": emp.id,
            "email": emp.email,
            "name": emp.full_name,
            "user_type": emp.user_type,
            "present": emp.is_present,
            "lat": None,
            "lon": None
        }

        if emp.user_type == 'field_officer':
            # Field Officers use the active shift route
            active_shift = db.query(ShiftLog).filter(
                ShiftLog.user_id == emp.id,
                ShiftLog.logout_time == None
            ).first()

            if active_shift:
                emp_data["present"] = True
                latest_ping = db.query(FieldOfficerRoute).filter(
                    FieldOfficerRoute.shift_id == active_shift.shift_id
                ).order_by(desc(FieldOfficerRoute.ping_timestamp)).first()
                
                if latest_ping:
                    emp_data["lat"] = latest_ping.latitude
                    emp_data["lon"] = latest_ping.longitude
        else:
            # STRICT PRIVACY LOCK: Normal employees only appear if physically present
            if emp.is_present and r:
                coords = r.get(f"loc:{emp.email}")
                if coords:
                    try:
                        lat, lon = coords.split(',')
                        emp_data["lat"] = float(lat)
                        emp_data["lon"] = float(lon)
                    except:
                        pass

        live_data.append(emp_data)
        
    return live_data

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
    db.query(Attendance).filter(Attendance.user_id == user_id).delete()
    db.execute(text("DELETE FROM field_visit_logs WHERE officer_id = :uid"), {"uid": user_id})
    db.delete(user)
    db.commit()
    return {"status": "success", "message": "Employee and all related records deleted."}

@app.delete("/api/admin/delete-visit/{visit_id}")
def delete_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = db.query(SiteVisit).filter(SiteVisit.id == visit_id).first()
    if not visit: raise HTTPException(status_code=404, detail="Visit not found")
    db.delete(visit)
    db.commit()
    return {"status": "success"}

@app.delete("/api/admin/delete-attendance/{attendance_id}")
def delete_attendance(attendance_id: int, db: Session = Depends(get_db)):
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
    data = await request.json()
    loc_data = data.get("location", data)
    payload = {
        "email": request.headers.get("x-user-email") or data.get("email"),
        "lat": loc_data.get("latitude") or loc_data.get("lat"),
        "lon": loc_data.get("longitude") or loc_data.get("lon"),
        "timestamp": loc_data.get("timestamp"),
        "activity_state": "TRAVELING"
    }
    return await record_location_ping(payload, db)

@app.get("/api/cron/auto-checkout")
def cron_auto_checkout(db: Session = Depends(get_db)):
    now_utc = datetime.utcnow()
    # Find users who are physically checked into a site right now
    active_users = db.query(User).filter(User.active_location_id != None).all()
    swept_users = []
    
    for user in active_users:
        last_ping_str = r.get(f"ping_time:{user.email}")
        
        if last_ping_str:
            # Format string from Redis, replace Z, and strip timezone to make it offset-naive
            raw_ts = str(last_ping_str).replace("Z", "+00:00")
            last_ping_time = datetime.fromisoformat(raw_ts).replace(tzinfo=None)
            
            minutes_since_last_ping = (now_utc - last_ping_time).total_seconds() / 60.0
            checkout_timestamp = last_ping_time
        else:
            minutes_since_last_ping = float('inf')
            checkout_timestamp = now_utc

        force_checkout = False
        
        # Rule 1: No ping for 60 minutes
        if minutes_since_last_ping >= 60.0:
            force_checkout = True

        # Rule 2: Exceeded maximum site stay (14 hours)
        if not force_checkout:
            if user.user_type == 'field_officer':
                active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
                if active_stay and (now_utc - active_stay.entry_time).total_seconds() / 3600.0 >= 14.0:
                    force_checkout = True
                    checkout_timestamp = now_utc
            else:
                active_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).order_by(desc(Attendance.checkin_time)).first()
                if active_att and (now_utc - active_att.checkin_time).total_seconds() / 3600.0 >= 14.0:
                    force_checkout = True
                    checkout_timestamp = now_utc

        if force_checkout:
            if user.user_type == 'field_officer':
                active_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
                if active_stay: 
                    active_stay.exit_time = checkout_timestamp
            else:
                active_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).order_by(desc(Attendance.checkin_time)).first()
                if active_att:
                    active_att.checkout_time = checkout_timestamp
                    active_att.duration_seconds = int((checkout_timestamp - active_att.checkin_time).total_seconds())
                user.is_present = False
                
            user.checked_in = False
            user.active_location_id = None
            db.commit()
            
            if r:
                r.delete(f"last_inside_time:{user.email}")
                r.delete(f"loc:{user.email}")
                
            swept_users.append(user.email)
            
    return {"status": "success", "message": "Cron sweep complete", "auto_checked_out_sites": swept_users}

@app.get("/api/admin/reports/monthly-attendance")
def get_monthly_attendance(
    month: Optional[int] = None, year: Optional[int] = None, start_date: Optional[str] = None,
    end_date: Optional[str] = None, user_id: Optional[int] = None, location_id: Optional[int] = None,
    user_type: Optional[str] = None, db: Session = Depends(get_db)
):
    if start_date or end_date:
        if start_date: start_utc = parse_iso_timestamp(start_date)
        elif month and year: start_utc = datetime(year, month, 1, 0, 0, 0) - timedelta(hours=5, minutes=30)
        else: raise HTTPException(status_code=400, detail="start_date or month/year required")

        if end_date:
            end_utc = parse_iso_timestamp(end_date)
            if len(end_date) <= 10 and 'T' not in end_date:
                end_utc = datetime.fromisoformat(end_date) + timedelta(hours=23, minutes=59, seconds=59)
        elif month and year:
            _, last_day = calendar.monthrange(year, month)
            end_utc = datetime(year, month, last_day, 23, 59, 59) - timedelta(hours=5, minutes=30)
        else: raise HTTPException(status_code=400, detail="end_date or month/year required")
    else:
        if month is None or year is None: raise HTTPException(status_code=400, detail="month and year are required")
        _, last_day = calendar.monthrange(year, month)
        start_utc = datetime(year, month, 1, 0, 0, 0) - timedelta(hours=5, minutes=30)
        end_utc = datetime(year, month, last_day, 23, 59, 59) - timedelta(hours=5, minutes=30)

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
    dob_formatted = datetime.strptime(dob_val, "%d-%m-%Y").strftime("%Y-%m-%d") if "-" in dob_val else dob_val
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
        dob_formatted = datetime.strptime(dob_raw, "%d-%m-%Y").strftime("%Y-%m-%d") if "-" in dob_raw else dob_raw
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
@app.get("/api/admin/manual-sweep")
def manual_database_sweep(db: Session = Depends(get_db)):
    
    now_utc = datetime.utcnow()
    cutoff_time = now_utc - timedelta(hours=12)

    # --- LOGIC-ONLY TIME FINDER ---
    def get_last_known_time(user_id, fallback_time):
        user = db.query(User).filter(User.id == user_id).first()
        if not user: return fallback_time
            
        last_time = fallback_time
        
        # 1. Search Database Route Logs (Field Officers)
        last_ping = db.query(FieldOfficerRoute).filter(
            FieldOfficerRoute.user_id == user_id
        ).order_by(desc(FieldOfficerRoute.ping_timestamp)).first()
        
        if last_ping and last_ping.ping_timestamp:
            last_time = last_ping.ping_timestamp
        
        # 2. Search Redis Memory Logs (Normal Employees)
        if r:
            redis_time_str = r.get(f"ping_time:{user.email}")
            if redis_time_str and isinstance(redis_time_str, str):
                clean_ts = redis_time_str.replace('Z', '+00:00')
                redis_time = datetime.fromisoformat(clean_ts).replace(tzinfo=None)
                if redis_time > last_time:
                    last_time = redis_time
                    
        # 3. Security: Prevent future time paradoxes
        if last_time > now_utc: 
            return now_utc
            
        return last_time

    # 1. Close Ghost Master Shifts (> 12 hours)
    open_shifts = db.query(ShiftLog).filter(ShiftLog.logout_time == None, ShiftLog.login_time < cutoff_time).all()
    for shift in open_shifts:
        checkout_time = get_last_known_time(shift.user_id, now_utc)
        
        # Prevent negative durations if last ping was from a previous day
        if checkout_time < shift.login_time:
            checkout_time = shift.login_time + timedelta(minutes=5)
            
        shift.logout_time = checkout_time
        shift.current_status = "OFF_DUTY"
        shift.is_on_break = False

    # 2. Close Ghost Site Stays (> 12 hours)
    open_stays = db.query(SiteStay).filter(SiteStay.exit_time == None, SiteStay.entry_time < cutoff_time).all()
    for stay in open_stays:
        checkout_time = get_last_known_time(stay.officer_id, now_utc)
        if checkout_time < stay.entry_time:
            checkout_time = stay.entry_time + timedelta(minutes=5)
            
        stay.exit_time = checkout_time

    # 3. Close Ghost Attendances (> 12 hours)
    open_atts = db.query(Attendance).filter(Attendance.checkout_time == None, Attendance.checkin_time < cutoff_time).all()
    for att in open_atts:
        checkout_time = get_last_known_time(att.user_id, now_utc)
        if checkout_time < att.checkin_time:
            checkout_time = att.checkin_time + timedelta(minutes=5)
            
        att.checkout_time = checkout_time
        att.duration_seconds = int((checkout_time - att.checkin_time).total_seconds())

    # 4. Sweep and Reset Users
    users_to_reset = db.query(User).filter(
        (User.is_present == True) | (User.checked_in == True) | (User.active_location_id != None)
    ).all()
    
    swept_users = []
    for user in users_to_reset:
        has_att = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.checkout_time == None).first()
        has_stay = db.query(SiteStay).filter(SiteStay.officer_id == user.id, SiteStay.exit_time == None).first()
        has_shift = db.query(ShiftLog).filter(ShiftLog.user_id == user.id, ShiftLog.logout_time == None).first()
        
        if not has_att and not has_stay and not has_shift:
            user.is_present = False
            user.checked_in = False
            user.active_location_id = None
            swept_users.append(user.email)
            
            # Obliterate stuck Redis memory keys
            if r:
                r.delete(f"active_shift:{user.email}")
                r.delete(f"loc:{user.email}")
                r.delete(f"ping_time:{user.email}")
                r.delete(f"last_inside_time:{user.email}")
                r.delete(f"warning_sent:{user.email}")

    db.commit()
    
    return {
        "status": "success",
        "message": "Manual Database Sweep Completed Successfully.",
        "metrics": {
            "ghost_site_stays_closed": len(open_stays),
            "ghost_attendances_closed": len(open_atts),
            "ghost_shifts_closed": len(open_shifts),
            "total_users_reset": len(swept_users),
            "users_affected": swept_users
        }
    }
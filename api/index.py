import hashlib
import os
import redis
import math
import json
from typing import Optional 
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy.exc import IntegrityError

# --- 1. DATABASE IMPORTS & INIT ---
try:
    from .database import SessionLocal, User, EmployeeLocation, OfficeLocation, init_db
except ImportError:
    from database import SessionLocal, User, EmployeeLocation, OfficeLocation, init_db

app = FastAPI()

# Redis Configuration
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
if redis_url:
    r = redis.from_url(redis_url, decode_responses=True)
else:
    r = None 
    print("WARNING: Redis not connected. Live tracking features will not work.")

init_db()

PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

# --- 2. SCHEMAS ---

class StaffCreate(BaseModel):
    full_name: str
    email: str
    password: str
    manager_id: int
    shift_start: str = "09:00"
    shift_end: str = "18:00"
    user_type: str = "employee"
    location_id: Optional[int] = None 

class AuthRequest(BaseModel):
    email: str
    password: str
    full_name: str = None

class LocationCreate(BaseModel):
    name: str
    lat: float
    lon: float
    radius: int

# --- 3. UTILITIES ---

def get_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # Earth radius in meters
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

# --- 4. GENERAL ROUTES ---

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
            "user_id": user.id
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
        "blockchain_id": user.blockchain_id
    }

# --- 5. ADMIN & MANAGER ROUTES ---

@app.post("/api/manager/add-employee")
def add_employee(data: StaffCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="An employee with this email already exists.")

    manager = db.query(User).filter(User.id == data.manager_id).first()
    if not manager:
        manager = db.query(User).filter(User.user_type == 'admin').first()
    
    if not manager:
        raise HTTPException(status_code=400, detail=f"Manager ID {data.manager_id} invalid and NO Admins found.")

    final_manager_id = manager.id
    blockchain_hash = hashlib.sha256(f"{data.email}{datetime.utcnow()}".encode()).hexdigest()
    salt = hashlib.sha256(data.email.encode()).hexdigest()[:16]
    
    new_user = User(
        full_name=data.full_name,
        email=data.email.lower().strip(),
        password=get_secure_hash(data.password, salt),
        user_type=data.user_type, 
        manager_id=final_manager_id, 
        location_id=data.location_id if data.location_id else None,
        blockchain_id=f"LIZZA-{blockchain_hash[:10]}".upper(),
        shift_start=data.shift_start,
        shift_end=data.shift_end,
        salt=salt
    )
    
    try:
        db.add(new_user)
        db.commit()
        return {"status": "success", "blockchain_id": new_user.blockchain_id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Integrity Error: Duplicate Blockchain ID or Email.")
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
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "user_type": u.user_type,
        "shift_start": u.shift_start,
        "shift_end": u.shift_end,
        "blockchain_id": u.blockchain_id,
        "location_id": u.location_id,
        "is_present": u.is_present
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
                r.delete(f"oob:{target_email.lower().strip()}") # Clear any active warnings
        except Exception:
            pass 
        
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
def get_live_tracking(admin_email: str, db: Session = Depends(get_db)): # <--- 1. Add 'db' here
    if not r:
        return []
    
    keys = r.keys("loc:*")
    locations = []
    
    for key in keys:
        email = key.split(":")[1]
        raw_data = r.get(key)
        
        if raw_data:
            lat_lon = raw_data.split(",")
            
            # --- 2. QUERY DATABASE FOR REAL NAME ---
            user = db.query(User).filter(User.email == email).first()
            
            # If user exists, use their stored full_name. Otherwise fall back to email.
            display_name = user.full_name if user else email.split("@")[0]

            locations.append({
                "email": email, 
                "lat": float(lat_lon[0]), 
                "lon": float(lat_lon[1]), 
                "name": display_name  # <--- 3. Send the real name
            })
            
    return locations

# --- 6. CRITICAL: UPDATED LOCATION ENDPOINT WITH TIMERS ---

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or not user.location_id:
        raise HTTPException(status_code=404, detail="User or office not found")
    
    office = db.query(OfficeLocation).filter(OfficeLocation.id == user.location_id).first()
    
    # 1. Update Live Location in Redis for Admin Map
    if r:
        r.set(f"loc:{email}", f"{lat},{lon}")
        # Set expiry to 60s so stale data disappears
        r.expire(f"loc:{email}", 60)

    # 2. Check Geofence
    dist = get_distance(lat, lon, office.lat, office.lon)
    is_inside = dist <= office.radius
    
    # Time calculations
    now_utc = datetime.utcnow()
    # Assuming IST (UTC+5:30)
    now_ist = now_utc + timedelta(hours=5, minutes=30) 
    now_str = now_ist.strftime("%H:%M")
    
    status_response = {
        "is_inside": is_inside,
        "status": "normal",
        "message": "On Duty",
        "warning_seconds": 0
    }

    # --- SCENARIO A: INSIDE GEOFENCE ---
    if is_inside:
        # 1. Clear any "Out of Bounds" warning timer
        if r: r.delete(f"oob:{email}")
        
        # 2. Check-in Logic (15 min grace period)
        shift_dt = datetime.strptime(user.shift_start, "%H:%M")
        grace_end = (shift_dt + timedelta(minutes=15)).strftime("%H:%M")
        
        # If not yet present, valid time, and inside -> Mark Present
        if not user.is_present:
            if now_str >= user.shift_start and now_str <= grace_end:
                user.is_present = True
                status_response["message"] = "Marked Present"
            elif now_str > grace_end:
                 status_response["message"] = "Inside Zone (Late)"
        else:
            status_response["message"] = "Present & Inside Zone"
        
        db.commit()
        return status_response

    # --- SCENARIO B: OUTSIDE GEOFENCE ---
    else:
        # If they were never present, just return outside status
        if not user.is_present:
             status_response["status"] = "outside"
             status_response["message"] = "Outside Geofence"
             return status_response

        # If they ARE present, start the 5-minute violation timer
        if r:
            oob_key = f"oob:{email}"
            first_out_time = r.get(oob_key)
            
            if not first_out_time:
                # Start Timer: Record when they first left
                r.set(oob_key, now_utc.isoformat())
                status_response["status"] = "warning"
                status_response["message"] = "Return to Zone!"
                status_response["warning_seconds"] = 300 # 5 mins start
            else:
                # Calculate elapsed time
                fmt = "%Y-%m-%dT%H:%M:%S.%f"
                try:
                    start_t = datetime.strptime(first_out_time, fmt)
                    elapsed = (now_utc - start_t).total_seconds()
                    remaining = 300 - elapsed
                    
                    if remaining <= 0:
                        # VIOLATION: Exceeded 5 mins
                        user.is_present = False # Mark Absent
                        db.commit()
                        r.delete(oob_key) # Reset timer
                        status_response["status"] = "violation"
                        status_response["message"] = "Marked Absent (Geofence Violation)"
                    else:
                        # WARNING: Counting down
                        status_response["status"] = "warning"
                        status_response["warning_seconds"] = int(remaining)
                except ValueError:
                    r.delete(oob_key) # Reset on error

        return status_response

@app.websocket("/ws/tracking/{manager_id}")
async def websocket_endpoint(websocket: WebSocket, manager_id: str):
    await ws_manager.connect(websocket, manager_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, manager_id)
@app.get("/api/manager/my-employees")
def get_manager_employees(manager_id: int, db: Session = Depends(get_db)):
    # Fetch employees where manager_id matches
    employees = db.query(User).filter(User.manager_id == manager_id).all()
    
    return [{
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "location_id": u.location_id,
        "shift_start": u.shift_start,
        "shift_end": u.shift_end,
        "is_present": u.is_present,
        "blockchain_id": u.blockchain_id
    } for u in employees]
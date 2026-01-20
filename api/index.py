import hashlib
import os
import redis
import math
import json
from typing import Optional  # <--- FIX 1: Added Import
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
# Handle case where Redis URL might be missing in local dev
if redis_url:
    r = redis.from_url(redis_url, decode_responses=True)
else:
    # Mock Redis for local testing if env var is missing
    print("Warning: REDIS_URL not found. Redis features will fail.")
    r = None

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
    location_id: Optional[int] = None  # <--- FIX 2: Explicitly allow None/Null

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
    # FIX 3: Robust Error Handling
    
    # Check duplicate email
    existing_user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="An employee with this email already exists.")

    # Check manager existence
    manager_exists = db.query(User).filter(User.id == data.manager_id).first()
    if not manager_exists:
        raise HTTPException(status_code=400, detail=f"Manager ID {data.manager_id} not found.")

    blockchain_hash = hashlib.sha256(f"{data.email}{datetime.utcnow()}".encode()).hexdigest()
    salt = hashlib.sha256(data.email.encode()).hexdigest()[:16]
    
    new_user = User(
        full_name=data.full_name,
        email=data.email.lower().strip(),
        password=get_secure_hash(data.password, salt),
        user_type=data.user_type, 
        manager_id=data.manager_id,
        location_id=data.location_id, # Can be None now
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
        "location_id": u.location_id 
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
        # Clear redis cache
        if r:
            try:
                r.delete(f"loc:{target_email.lower().strip()}")
            except Exception:
                pass 
        
        # Delete dependent location history
        db.query(EmployeeLocation).filter(EmployeeLocation.user_id == user.id).delete()
        
        # Unhook subordinates
        db.query(User).filter(User.manager_id == user.id).update({"manager_id": None})
        
        db.delete(user)
        db.commit()
        return {"status": "success", "message": f"Employee {target_email} deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or not user.location_id:
        raise HTTPException(status_code=404, detail="User or office location not found")
    
    office = db.query(OfficeLocation).filter(OfficeLocation.id == user.location_id).first()
    
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")
    
    dist = get_distance(lat, lon, office.lat, office.lon)
    is_inside = dist <= office.radius
    
    shift_dt = datetime.strptime(user.shift_start, "%H:%M")
    grace_period = (shift_dt + timedelta(minutes=15)).strftime("%H:%M")
    
    if now_str <= grace_period and is_inside:
        user.is_present = True
    elif not is_inside:
        user.is_present = False
        
    db.commit()

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
def get_live_tracking(admin_email: str):
    if not r:
        return []
    keys = r.keys("loc:*")
    locations = []
    for key in keys:
        email = key.split(":")[1]
        raw_data = r.get(key)
        if raw_data:
            lat_lon = raw_data.split(",")
            locations.append({
                "email": email, "lat": float(lat_lon[0]), "lon": float(lat_lon[1]), "name": email.split("@")[0]
            })
    return locations

@app.websocket("/ws/tracking/{manager_id}")
async def websocket_endpoint(websocket: WebSocket, manager_id: str):
    await ws_manager.connect(websocket, manager_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, manager_id)
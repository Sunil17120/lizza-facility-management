import hashlib
import os
import redis
import math  # Required for geofencing distance calculations
import json
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect # FIX: Added missing WebSocket classes
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta

# Handle local vs production imports for database
try:
    from .database import SessionLocal, User, EmployeeLocation, init_db
except ImportError:
    from database import SessionLocal, User, EmployeeLocation, init_db

# Initialize FastAPI only once
app = FastAPI()

# Redis Configuration for live tracking
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True)

# Initialize Database tables
init_db()

PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

# --- UTILITIES ---

def get_distance(lat1, lon1, lat2, lon2):
    """Calculates distance in meters between two coordinates."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

class ConnectionManager:
    """Handles WebSocket lifecycle for real-time manager updates."""
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

# --- SCHEMAS ---

class StaffCreate(BaseModel):
    full_name: str
    email: str
    password: str
    manager_id: int
    shift_start: str
    shift_end: str

class AuthRequest(BaseModel):
    email: str
    password: str
    full_name: str = None

# Database Session Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_secure_hash(password: str, salt: str):
    """Secure password hashing logic."""
    final_payload = password + salt + PEPPER
    return hashlib.sha256(final_payload.encode()).hexdigest()

# --- ROUTES ---

@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    """Handles secure user login."""
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
    """Retrieves user profile for dashboard."""
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

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(get_db)):
    """Updates location, checks geofence, and marks attendance."""
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")
    
    # 1. Geofencing
    dist = get_distance(lat, lon, user.office_lat, user.office_lon)
    is_inside = dist <= user.fence_radius
    
    # 2. 15-minute Attendance logic
    shift_dt = datetime.strptime(user.shift_start, "%H:%M")
    grace_period = (shift_dt + timedelta(minutes=15)).strftime("%H:%M")
    
    if now_str <= grace_period and is_inside:
        user.is_present = True
    elif not is_inside:
        user.is_present = False # Marked absent if outside fence
        
    db.commit()
    
    # 3. Broadcast to assigned manager via WebSocket
    if user.manager_id:
        payload = {"name": user.full_name, "lat": lat, "lon": lon, "present": user.is_present}
        await ws_manager.broadcast(str(user.manager_id), payload)
        
    return {"is_inside": is_inside, "is_present": user.is_present, "system_time": now_str}

@app.post("/api/manager/add-employee")
def add_employee(data: StaffCreate, db: Session = Depends(get_db)):
    """Manager-only route to onboard staff with Blockchain ID."""
    blockchain_hash = hashlib.sha256(f"{data.email}{datetime.utcnow()}".encode()).hexdigest()
    
    # Generate salt for the new employee
    salt = hashlib.sha256(data.email.encode()).hexdigest()[:16]
    
    new_user = User(
        full_name=data.full_name,
        email=data.email.lower().strip(),
        password=get_secure_hash(data.password, salt),
        user_type="employee",
        manager_id=data.manager_id,
        blockchain_id=f"LIZZA-{blockchain_hash[:10]}".upper(),
        shift_start=data.shift_start,
        shift_end=data.shift_end,
        salt=salt
    )
    db.add(new_user)
    db.commit()
    return {"status": "success", "blockchain_id": new_user.blockchain_id}

@app.websocket("/ws/tracking/{manager_id}")
async def websocket_endpoint(websocket: WebSocket, manager_id: str):
    """Real-time tracking feed for managers."""
    await ws_manager.connect(websocket, manager_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, manager_id)
# --- ADMIN ROUTES ---

@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)):
    """Fetches all users for the admin table."""
    # Security check: Ensure requester is an admin
    admin = db.query(User).filter(User.email == admin_email.lower().strip()).first()
    if not admin or admin.user_type.lower() != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = db.query(User).all()
    # Convert SQLAlchemy objects to dicts for JSON serialization
    return [{
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "user_type": u.user_type,
        "shift_start": u.shift_start,
        "shift_end": u.shift_end,
        "blockchain_id": u.blockchain_id
    } for u in users]

@app.get("/api/admin/live-tracking")
def get_live_tracking(admin_email: str):
    """Fetches all active location keys from Redis for the admin map."""
    # Use pattern to find all location keys
    keys = r.keys("loc:*")
    locations = []
    for key in keys:
        email = key.split(":")[1]
        raw_data = r.get(key)
        if raw_data:
            lat_lon = raw_data.split(",")
            locations.append({
                "email": email,
                "lat": float(lat_lon[0]),
                "lon": float(lat_lon[1]),
                "name": email.split("@")[0]
            })
    return locations

@app.post("/api/admin/update-employee")
def update_employee(target_email: str, admin_email: str, data: dict, db: Session = Depends(get_db)):
    """Allows Admin to update user roles and shifts."""
    admin = db.query(User).filter(User.email == admin_email.lower().strip()).first()
    if not admin or admin.user_type.lower() != 'admin':
        raise HTTPException(status_code=403, detail="Forbidden")

    user = db.query(User).filter(User.email == target_email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.email = data.get('new_email', user.email)
    user.shift_start = data.get('shift_start', user.shift_start)
    user.shift_end = data.get('shift_end', user.shift_end)
    user.user_type = data.get('user_type', user.user_type)
    
    db.commit()
    return {"message": "Update successful"}

@app.post("/api/admin/set-office")
def set_office(admin_email: str, data: dict, db: Session = Depends(get_db)):
    """Updates global geofence settings for all employees."""
    admin = db.query(User).filter(User.email == admin_email.lower().strip()).first()
    if not admin or admin.user_type.lower() != 'admin':
        raise HTTPException(status_code=403, detail="Forbidden")

    # Sync geofence for all users
    db.query(User).update({
        "office_lat": data['lat'],
        "office_lon": data['lon'],
        "fence_radius": data['radius']
    })
    db.commit()
    return {"status": "Office geofence updated"}
class LocationCreate(BaseModel):
    name: str
    lat: float
    lon: float
    radius: int

@app.get("/api/admin/locations")
def get_locations(db: Session = Depends(get_db)):
    return db.query(OfficeLocation).all()

@app.post("/api/admin/add-location")
def add_location(data: LocationCreate, db: Session = Depends(get_db)):
    new_loc = OfficeLocation(**data.dict())
    db.add(new_loc)
    db.commit()
    return {"message": "Location Added"}
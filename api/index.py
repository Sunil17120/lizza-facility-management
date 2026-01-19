import hashlib
import os
import redis
import math  # FIX: Essential for get_distance function
import json
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta

# Handle local vs production imports for database
try:
    from .database import SessionLocal, User, EmployeeLocation, init_db
except ImportError:
    from database import SessionLocal, User, EmployeeLocation, init_db

# Single app initialization
app = FastAPI()

# Redis Setup
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True)

# Ensure tables exist
init_db()

PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

# --- UTILITIES ---

def get_distance(lat1, lon1, lat2, lon2):
    """Calculates the distance in meters between two GPS coordinates."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

class ConnectionManager:
    """Manages real-time WebSocket connections for managers."""
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

# Database Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_secure_hash(password: str, salt: str):
    """Security hashing for login."""
    final_payload = password + salt + PEPPER
    return hashlib.sha256(final_payload.encode()).hexdigest()

# --- ROUTES ---

@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    """Handles member login."""
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
    """Fetches user details including shift and blockchain ID."""
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
    """Validates geofence, marks attendance, and broadcasts to managers."""
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")
    
    # 1. Geofence Distance Calculation
    dist = get_distance(lat, lon, user.office_lat, user.office_lon)
    is_inside = dist <= user.fence_radius
    
    # 2. 15-Minute Attendance Logic
    shift_dt = datetime.strptime(user.shift_start, "%H:%M")
    grace_period = (shift_dt + timedelta(minutes=15)).strftime("%H:%M")
    
    if now_str <= grace_period and is_inside:
        user.is_present = True
    elif not is_inside:
        user.is_present = False # Marked absent if they leave the fence
        
    db.commit()
    
    # 3. Cache in Redis for live tracking
    if is_inside:
        r.setex(f"loc:{user.email}", 300, f"{lat},{lon}")
    
    # 4. WebSocket Broadcast to Manager
    if user.manager_id:
        payload = {"name": user.full_name, "lat": lat, "lon": lon, "present": user.is_present}
        await ws_manager.broadcast(str(user.manager_id), payload)
        
    return {"is_inside": is_inside, "is_present": user.is_present, "system_time": now_str}

@app.post("/api/manager/add-employee")
def add_employee(data: StaffCreate, db: Session = Depends(get_db)):
    """Creates a new employee with a Blockchain ID."""
    blockchain_hash = hashlib.sha256(f"{data.email}{datetime.utcnow()}".encode()).hexdigest()
    
    # Simple salt derivation for the new user
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
    """WebSocket endpoint for managers to receive live staff updates."""
    await ws_manager.connect(websocket, manager_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, manager_id)
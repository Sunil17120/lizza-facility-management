import hashlib
import os
import redis
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta

try:
    from .database import SessionLocal, User, EmployeeLocation, init_db
except ImportError:
    from database import SessionLocal, User, EmployeeLocation, init_db

app = FastAPI()
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True)
init_db()

PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")
app = FastAPI()
def get_distance(lat1, lon1, lat2, lon2):
    R = 6371000 # Meters
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
        if manager_id not in self.active_connections: self.active_connections[manager_id] = []
        self.active_connections[manager_id].append(websocket)
    def disconnect(self, websocket: WebSocket, manager_id: str):
        self.active_connections[manager_id].remove(websocket)
    async def broadcast(self, manager_id: str, message: dict):
        if manager_id in self.active_connections:
            for connection in self.active_connections[manager_id]:
                await connection.send_json(message)

ws_manager = ConnectionManager()
class StaffCreate(BaseModel):
    full_name: str
    email: str
    password: str
    manager_id: int
    shift_start: str
    shift_end: str
class AuthRequest(BaseModel):
    full_name: str = None
    email: str
    password: str

class UpdateUserRequest(BaseModel):
    new_email: str
    shift_start: str
    shift_end: str
    user_type: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
def generate_derived_salt(email: str, name: str):
    """Generates a unique salt based on user identity."""
    identity_string = (email.lower() + name.lower()).encode()
    return hashlib.sha256(identity_string).hexdigest()[:16]

def get_secure_hash(password: str, salt: str):
    """Hashes password with salt and pepper."""
    # Ensure PEPPER is defined or fetched from env
    PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")
    final_payload = password + salt + PEPPER
    return hashlib.sha256(final_payload.encode()).hexdigest()

# --- AUTHENTICATION ---
@app.post("/api/signup")
def signup(data: AuthRequest, db: Session = Depends(get_db)):
    
   
    existing_user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    salt = generate_derived_salt(data.email, data.full_name)
    hashed_password = get_secure_hash(data.password, salt)
    
    new_user = User(
        full_name=data.full_name,
        email=data.email.lower().strip(),
        password=hashed_password,
        salt=salt,
        user_type="employee"  # Default role
    )
    db.add(new_user)
    db.commit()
    return {"message": "Account created successfully"}


  
@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    # 1. Find user by email (cleaned)
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # 2. Use the salt stored in the database for THIS user
    # If this field is empty in your DB, login will fail.
    salt = user.salt 
    
    # 3. Hash the incoming password and compare
    if get_secure_hash(data.password, salt) == user.password:
        return {
            "message": "Login successful",
            "user": user.full_name,
            "user_type": user.user_type
        }
    
    # 4. If hash doesn't match, return 401
    raise HTTPException(status_code=401, detail="Invalid email or password")

# --- USER & TRACKING ---
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
        "shift_end": user.shift_end
    }

@app.post("/api/user/update-location")
def update_location(email: str, lat: str, lon: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate IST correctly
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")
    
    # FIX: Shift crossing midnight logic
    start, end = user.shift_start, user.shift_end
    is_on_shift = (start <= now_str <= end) if start <= end else (now_str >= start or now_str <= end)
    
    if is_on_shift:
        r.setex(f"loc:{user.email}", 300, f"{lat},{lon}")
        loc = db.query(EmployeeLocation).filter(EmployeeLocation.user_id == user.id).first()
        if not loc:
            loc = EmployeeLocation(user_id=user.id, latitude=lat, longitude=lon)
            db.add(loc)
        else:
            loc.latitude, loc.longitude = lat, lon
        db.commit()
        
    return {"on_shift": is_on_shift, "system_time": now_str}

# --- ADMIN ---
@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip(), User.user_type == "admin").first()
    if not admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return db.query(User).all()

@app.post("/api/admin/update-employee")
def update_employee(target_email: str, admin_email: str, data: UpdateUserRequest, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip(), User.user_type == "admin").first()
    if not admin:
        raise HTTPException(status_code=403, detail="Unauthorized")
    user = db.query(User).filter(User.email == target_email.lower().strip()).first()
    if user:
        user.email, user.shift_start, user.shift_end, user.user_type = data.new_email.lower(), data.shift_start, data.shift_end, data.user_type.lower()
        db.commit()
    return {"message": "Success"}

@app.get("/api/admin/live-tracking")
def get_live_tracking(admin_email: str, db: Session = Depends(get_db)):
    # Verify Admin status
    admin = db.query(User).filter(User.email == admin_email.lower().strip(), User.user_type == "admin").first()
    if not admin: 
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    active_users = []
    # 1. Get ALL keys starting with 'loc:' from Redis
    keys = r.keys("loc:*") 
    
    for key in keys:
        # 2. Extract email from the key (format is loc:email@example.com)
        key_str = key.decode() if isinstance(key, bytes) else key
        email = key_str.split(":")[1]
        
        # 3. Get coordinates and decode if necessary
        raw_val = r.get(key_str)
        val_str = raw_val.decode() if isinstance(raw_val, bytes) else raw_val
        coords = val_str.split(",")
        
        # 4. Fetch user details to get the name for the map popup
        user = db.query(User).filter(User.email == email).first()
        if user:
            active_users.append({
                "name": user.full_name,
                "email": email,
                "lat": coords[0],
                "lon": coords[1]
            })
            
    # Returns a list of ALL on-duty employees currently in Redis
    return active_users
# --- ROUTES ---
@app.websocket("/ws/tracking/{manager_id}")
async def websocket_endpoint(websocket: WebSocket, manager_id: str):
    await ws_manager.connect(websocket, manager_id)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, manager_id)

@app.post("/api/manager/add-employee")
def add_employee(data: StaffCreate, db: Session = Depends(SessionLocal)):
    # Simulate Blockchain ID Generation
    blockchain_hash = hashlib.sha256(f"{data.email}{datetime.utcnow()}".encode()).hexdigest()
    
    new_user = User(
        full_name=data.full_name,
        email=data.email.lower(),
        password=hashlib.sha256(data.password.encode()).hexdigest(), # Simplified for demo
        user_type="employee",
        manager_id=data.manager_id,
        blockchain_id=f"LIZZA-{blockchain_hash[:10]}".upper(),
        shift_start=data.shift_start,
        shift_end=data.shift_end
    )
    db.add(new_user)
    db.commit()
    return {"status": "success", "blockchain_id": new_user.blockchain_id}

@app.post("/api/user/update-location")
async def update_location(email: str, lat: float, lon: float, db: Session = Depends(SessionLocal)):
    user = db.query(User).filter(User.email == email).first()
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")
    
    # 1. Geofence Check
    dist = get_distance(lat, lon, user.office_lat, user.office_lon)
    is_inside = dist <= user.fence_radius
    
    # 2. 15-min Presence Logic
    shift_dt = datetime.strptime(user.shift_start, "%H:%M")
    grace_period = (shift_dt + timedelta(minutes=15)).strftime("%H:%M")
    
    if now_str <= grace_period and is_inside:
        user.is_present = True
    elif not is_inside:
        user.is_present = False # Marked absent if outside
        
    db.commit()
    
    # 3. Broadcast to Manager via WebSocket
    if user.manager_id:
        payload = {"name": user.full_name, "lat": lat, "lon": lon, "present": user.is_present}
        await ws_manager.broadcast(str(user.manager_id), payload)
        
    return {"is_inside": is_inside, "is_present": user.is_present}
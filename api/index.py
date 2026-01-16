import hashlib
import os
import redis
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta

# Improved import logic for Vercel's directory structure
try:
    from .database import SessionLocal, User, EmployeeLocation, init_db
except ImportError:
    from database import SessionLocal, User, EmployeeLocation, init_db

app = FastAPI()

# Redis Configuration
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True)

# Run table creation once during the serverless function "warm start"
init_db()

PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

# Pydantic Models for Request Validation
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

# Security Helpers
def generate_derived_salt(email: str, name: str):
    identity_string = (email.lower() + name.lower()).encode()
    return hashlib.sha256(identity_string).hexdigest()[:16]

def get_secure_hash(password: str, salt: str):
    final_payload = password + salt + PEPPER
    return hashlib.sha256(final_payload.encode()).hexdigest()

# --- AUTHENTICATION ENDPOINTS ---

@app.post("/api/signup")
def signup(data: AuthRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email.lower().strip()).first():
        raise HTTPException(status_code=400, detail="User already exists")
    
    salt = generate_derived_salt(data.email, data.full_name)
    hashed_password = get_secure_hash(data.password, salt)
    
    new_user = User(
        full_name=data.full_name,
        email=data.email.lower().strip(),
        password=hashed_password,
        salt=salt
    )
    db.add(new_user)
    db.commit()
    return {"message": "Account secured and created successfully"}

@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    salt = generate_derived_salt(user.email, user.full_name)
    if get_secure_hash(data.password, salt) == user.password:
        return {
            "message": "Login successful", 
            "user": user.full_name,
            "user_type": user.user_type
        }
    
    raise HTTPException(status_code=401, detail="Invalid credentials")

# --- USER ENDPOINTS ---

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
    
    # Calculate current time in IST (UTC+5:30)
    now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    now_str = now_ist.strftime("%H:%M")
    
    is_on_shift = user.shift_start <= now_str <= user.shift_end
    
    if is_on_shift:
        # Real-time tracking in Redis (5-minute expiry)
        r.setex(f"loc:{user.email}", 300, f"{lat},{lon}")
        
        # Persistent storage in PostgreSQL
        loc = db.query(EmployeeLocation).filter(EmployeeLocation.user_id == user.id).first()
        if not loc:
            loc = EmployeeLocation(user_id=user.id, latitude=lat, longitude=lon)
            db.add(loc)
        else:
            loc.latitude = lat
            loc.longitude = lon
        db.commit()
        
    return {"on_shift": is_on_shift}

# --- ADMIN ENDPOINTS ---

@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip(), User.user_type == "admin").first()
    if not admin:
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
    
    return db.query(User).all()

@app.post("/api/admin/update-employee")
def update_employee(target_email: str, admin_email: str, data: UpdateUserRequest, db: Session = Depends(get_db)):
    # Verify Admin status
    admin = db.query(User).filter(User.email == admin_email.lower().strip(), User.user_type == "admin").first()
    if not admin:
        raise HTTPException(status_code=403, detail="Unauthorized")

    user = db.query(User).filter(User.email == target_email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Restrict modifying other admins for security
    if user.user_type == "admin" and user.email != admin_email:
        raise HTTPException(status_code=400, detail="Cannot modify other admin accounts")

    # Apply updates
    user.email = data.new_email.lower().strip()
    user.shift_start = data.shift_start
    user.shift_end = data.shift_end
    user.user_type = data.user_type.lower()
    
    db.commit()
    return {"message": "Employee updated successfully"}

@app.get("/api/admin/live-tracking")
def get_live_tracking(admin_email: str, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.email == admin_email.lower().strip(), User.user_type == "admin").first()
    if not admin: 
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    active_users = []
    keys = r.keys("loc:*")
    for key in keys:
        email = key.split(":")[1]
        coords = r.get(key).split(",")
        user = db.query(User).filter(User.email == email).first()
        if user:
            active_users.append({
                "name": user.full_name,
                "email": email,
                "lat": coords[0],
                "lon": coords[1]
            })
    return active_users
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
  
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    salt = generate_derived_salt(user.email, user.full_name)
    if get_secure_hash(data.password, salt) != user.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    return {
        "message": "Login successful",
        "user": user.full_name,
        "user_type": user.user_type
    }

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
    admin = db.query(User).filter(User.email == admin_email.lower().strip(), User.user_type == "admin").first()
    if not admin: raise HTTPException(status_code=403, detail="Unauthorized")
    active_users = []
    keys = r.keys("loc:*")
    for key in keys:
        key_str = key.decode() if isinstance(key, bytes) else key
        email = key_str.split(":")[1]
        raw_val = r.get(key_str)
        val_str = raw_val.decode() if isinstance(raw_val, bytes) else raw_val
        coords = val_str.split(",")
        user = db.query(User).filter(User.email == email).first()
        if user:
            active_users.append({"name": user.full_name, "email": email, "lat": coords[0], "lon": coords[1]})
    return active_users
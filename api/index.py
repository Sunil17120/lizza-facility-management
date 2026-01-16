import hashlib
import os
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
import redis
# Improved import logic for Vercel's directory structure
try:
    from .database import SessionLocal, User, init_db
except ImportError:
    from database import SessionLocal, User, init_db
now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
now = now_ist.strftime("%H:%M")
app = FastAPI()
redis_url = os.environ.get("REDIS_URL") or os.environ.get("KV_URL")
r = redis.from_url(redis_url, decode_responses=True)
# Run table creation once during the serverless function "warm start"
init_db()

PEPPER = os.environ.get("SECRET_PEPPER", "change_me_in_vercel_settings")

class AuthRequest(BaseModel):
    full_name: str = None
    email: str
    password: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def generate_derived_salt(email: str, name: str):
    identity_string = (email.lower() + name.lower()).encode()
    return hashlib.sha256(identity_string).hexdigest()[:16]

def get_secure_hash(password: str, salt: str):
    final_payload = password + salt + PEPPER
    return hashlib.sha256(final_payload.encode()).hexdigest()

@app.post("/api/signup")
def signup(data: AuthRequest, db: Session = Depends(get_db)):
    # Removed init_db() from here for performance
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="User already exists")
    
    salt = generate_derived_salt(data.email, data.full_name)
    hashed_password = get_secure_hash(data.password, salt)
    
    new_user = User(
        full_name=data.full_name,
        email=data.email,
        password=hashed_password,
        salt=salt
    )
    db.add(new_user)
    db.commit()
    return {"message": "Account secured and created successfully"}

@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    salt = generate_derived_salt(user.email, user.full_name)
    if get_secure_hash(data.password, salt) == user.password:
        return {"message": "Login successful", "user": user.full_name}
    
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.get("/api/admin/employees")
def get_all_employees(admin_email: str, db: Session = Depends(get_db)):
    # Verify the requester is an admin
    admin = db.query(User).filter(User.email == admin_email, User.user_type == "admin").first()
    if not admin:
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
    
    employees = db.query(User).all()
    return employees

@app.post("/api/admin/update-role")
def update_user_role(target_email: str, new_type: str, admin_email: str, db: Session = Depends(get_db)):
    admin = db.query(User).filter(
        User.email == admin_email.lower().strip(), 
        User.user_type == "admin"
    ).first()
    
    if not admin:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    user = db.query(User).filter(User.email == target_email.lower().strip()).first()
    if user:
        user.user_type = new_type.lower() # Store role in lowercase for consistency
        db.commit()
        return {"message": f"User {target_email} updated to {new_type}"}
    raise HTTPException(status_code=404, detail="User not found")
@app.get("/api/user/profile")
def get_user_profile(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "full_name": user.full_name,
        "email": user.email,
        "user_type": user.user_type
    }
@app.post("/api/user/update-location")
def update_location(email: str, lat: str, lon: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if currently in shift hours
    now = datetime.now().strftime("%H:%M")
    is_on_shift = user.shift_start <= now <= user.shift_end
    
    if is_on_shift:
        # Update Redis for real-time tracking (expires in 5 mins)
        r.setex(f"loc:{user.email}", 300, f"{lat},{lon}")
        
        # Update Database for persistence
        loc = db.query(EmployeeLocation).filter(EmployeeLocation.user_id == user.id).first()
        if not loc:
            loc = EmployeeLocation(user_id=user.id, latitude=lat, longitude=lon)
            db.add(loc)
        else:
            loc.latitude = lat
            loc.longitude = lon
        db.commit()
    return {"on_shift": is_on_shift}

@app.get("/api/admin/live-tracking")
def get_live_tracking(admin_email: str, db: Session = Depends(get_db)):
    # Verify Admin
    admin = db.query(User).filter(User.email == admin_email, User.user_type == "admin").first()
    if not admin: raise HTTPException(status_code=403)
    
    active_users = []
    keys = r.keys("loc:*")
    for key in keys:
        email = key.decode().split(":")[1]
        coords = r.get(key).decode().split(",")
        user = db.query(User).filter(User.email == email).first()
        active_users.append({
            "name": user.full_name,
            "email": email,
            "lat": coords[0],
            "lon": coords[1]
        })
    return active_users
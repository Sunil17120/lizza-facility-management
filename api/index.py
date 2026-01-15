import hashlib
import os
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

# Improved import logic for Vercel's directory structure
try:
    from .database import SessionLocal, User, init_db
except ImportError:
    from database import SessionLocal, User, init_db

app = FastAPI()

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
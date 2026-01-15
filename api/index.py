import hashlib
import os
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import SessionLocal, User, init_db # Assuming database.py exists
from pydantic import BaseModel

app = FastAPI()

# Pepper stored in Vercel Environment Variables
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

# Requirement: Salt derived from Identity
def generate_derived_salt(email: str, name: str):
    identity_string = (email.lower() + name.lower()).encode()
    return hashlib.sha256(identity_string).hexdigest()[:16]

# SHA-256 with Salt and Pepper
def get_secure_hash(password: str, salt: str):
    final_payload = password + salt + PEPPER
    return hashlib.sha256(final_payload.encode()).hexdigest()

@app.post("/api/signup")
def signup(data: AuthRequest, db: Session = Depends(get_db)):
    init_db() # Ensure tables exist
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="User already exists")
    
    salt = generate_derived_salt(data.email, data.full_name)
    hashed_password = get_secure_hash(data.password, salt)
    
    new_user = User(
        full_name=data.full_name,
        email=data.email,
        password=hashed_password,
        salt=salt # Stored for verification
    )
    db.add(new_user)
    db.commit()
    return {"message": "Account secured and created successfully"}

@app.post("/api/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Recalculate salt and hash to verify
    salt = generate_derived_salt(user.email, user.full_name)
    if get_secure_hash(data.password, salt) == user.password:
        return {"message": "Login successful", "user": user.full_name}
    
    raise HTTPException(status_code=401, detail="Invalid credentials")
import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Float, Boolean, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from cryptography.fernet import Fernet 

# --- SECURITY CONFIG ---
ENCRYPTION_KEY = os.environ.get("DATA_KEY", Fernet.generate_key().decode())
cipher = Fernet(ENCRYPTION_KEY)

DATABASE_URL = os.environ.get("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    
    # 1. Professional Identity 
    full_name = Column(String) 
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True) 
    personal_email = Column(String, nullable=True) 
    phone_number = Column(String, nullable=True) # NEW: Phone Number
    
    # 2. Personal & Family Details
    dob = Column(String, nullable=True) 
    father_name = Column(String, nullable=True)
    mother_name = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    
    # 3. Security
    password = Column(String) 
    salt = Column(String)
    is_password_changed = Column(Boolean, default=False) 
    
    # 4. Hierarchy & Role
    user_type = Column(String, default="employee") 
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    location_id = Column(Integer, ForeignKey("office_locations.id"), nullable=True)
    blockchain_id = Column(String, unique=True, nullable=True)
    
    # 5. Professional & Experience Details
    designation = Column(String, nullable=True)
    department = Column(String, nullable=True)
    experience_years = Column(Float, default=0.0)
    prev_company = Column(String, nullable=True)
    prev_role = Column(String, nullable=True)
    
    # 6. Sensitive Data (Encrypted Storage)
    aadhar_enc = Column(String, nullable=True) 
    pan_enc = Column(String, nullable=True)
    
    # 7. Document Paths 
    profile_photo_path = Column(String, nullable=True)
    aadhar_photo_path = Column(String, nullable=True)
    pan_photo_path = Column(String, nullable=True)
    
    # 8. Shift & Status
    is_present = Column(Boolean, default=False)
    shift_start = Column(String, default="09:00")
    shift_end = Column(String, default="18:00")
    created_at = Column(DateTime, default=datetime.utcnow)

class EmployeeLocation(Base):
    __tablename__ = "employee_locations"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    latitude = Column(String)
    longitude = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class OfficeLocation(Base):
    __tablename__ = "office_locations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    lat = Column(Float)
    lon = Column(Float)
    radius = Column(Integer, default=200)

def init_db():
    Base.metadata.create_all(bind=engine)
    
    columns_to_add = [
        ("first_name", "VARCHAR"),
        ("last_name", "VARCHAR"),
        ("personal_email", "VARCHAR"),
        ("phone_number", "VARCHAR"), # NEW: Added to migration
        ("dob", "VARCHAR"),
        ("father_name", "VARCHAR"),
        ("mother_name", "VARCHAR"),
        ("blood_group", "VARCHAR"),
        ("emergency_contact", "VARCHAR"),
        ("designation", "VARCHAR"),
        ("department", "VARCHAR"),
        ("experience_years", "FLOAT DEFAULT 0.0"),
        ("prev_company", "VARCHAR"),
        ("prev_role", "VARCHAR"),
        ("aadhar_enc", "VARCHAR"),
        ("pan_enc", "VARCHAR"),
        ("profile_photo_path", "VARCHAR"),
        ("aadhar_photo_path", "VARCHAR"),
        ("pan_photo_path", "VARCHAR"),
        ("is_password_changed", "BOOLEAN DEFAULT FALSE"),
        ("location_id", "INTEGER")
    ]
    
    with engine.connect() as conn:
        for col_name, col_type in columns_to_add:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                conn.commit()
            except Exception:
                conn.rollback()
                try:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                except Exception:
                    conn.rollback()
                    pass
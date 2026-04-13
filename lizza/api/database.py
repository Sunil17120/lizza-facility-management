import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Float, Boolean, text, Text
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
    phone_number = Column(String, nullable=True)
    
    # 2. Personal & Medical Details
    dob = Column(String, nullable=True) 
    gender = Column(String, nullable=True)
    marital_status = Column(String, nullable=True)
    father_name = Column(String, nullable=True)
    mother_name = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)
    identity_mark = Column(String, nullable=True)
    height = Column(String, nullable=True)
    caste = Column(String, nullable=True)
    category = Column(String, nullable=True)
    religion = Column(String, nullable=True)
    nationality = Column(String, nullable=True)
    medical_remarks = Column(Text, nullable=True)
    
    # 3. Address Details
    perm_address = Column(Text, nullable=True)
    perm_state = Column(String, nullable=True)
    perm_pin = Column(String, nullable=True)
    perm_mobile = Column(String, nullable=True)
    temp_address = Column(Text, nullable=True)
    temp_state = Column(String, nullable=True)
    temp_pin = Column(String, nullable=True)
    temp_mobile = Column(String, nullable=True)

    # 4. JSON Array Data (Stores the dynamic tables)
    languages_json = Column(Text, nullable=True)
    education_json = Column(Text, nullable=True)
    experience_json = Column(Text, nullable=True)
    family_json = Column(Text, nullable=True)
    references_json = Column(Text, nullable=True)
    
    # 5. Security & Verification
    password = Column(String) 
    salt = Column(String)
    is_password_changed = Column(Boolean, default=False) 
    is_verified = Column(Boolean, default=False) 
    kyc_mode = Column(String, default="aadhaar_xml") 
    
    # 6. Hierarchy & Role
    user_type = Column(String, default="employee") 
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    location_id = Column(Integer, ForeignKey("office_locations.id"), nullable=True)
    blockchain_id = Column(String, unique=True, nullable=True) # LFM ID
    unit_name = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    department = Column(String, nullable=True)
    
    # 7. Sensitive Data (ENCRYPTED)
    aadhar_enc = Column(String, nullable=True) 
    pan_enc = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    ifsc_code = Column(String, nullable=True)
    account_number_enc = Column(String, nullable=True)
    voter_id_enc = Column(String, nullable=True)
    driving_licence_enc = Column(String, nullable=True)
    passport_no_enc = Column(String, nullable=True)
    
    # 8. Document Paths (UPLOADS)
    profile_photo_path = Column(Text, nullable=True)
    aadhar_photo_path = Column(Text, nullable=True)
    pan_photo_path = Column(Text, nullable=True)
    voter_photo_path = Column(Text, nullable=True)
    dl_photo_path = Column(Text, nullable=True)
    passport_photo_path = Column(Text, nullable=True)
    fingerprints_left_path = Column(Text, nullable=True)
    fingerprints_right_path = Column(Text, nullable=True)
    
    # 9. Status
    is_present = Column(Boolean, default=False)
    shift_start = Column(String, nullable=True) 
    shift_end = Column(String, nullable=True)   
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

# NEW: Site Visit model for Field Officers
class SiteVisit(Base):
    __tablename__ = "site_visits"
    id = Column(Integer, primary_key=True, index=True)
    officer_id = Column(Integer, ForeignKey("users.id"))
    location_id = Column(Integer, ForeignKey("office_locations.id"))
    purpose = Column(String)
    remarks = Column(Text, nullable=True)
    photo_path = Column(Text) # Will store the Base64 image
    visit_time = Column(DateTime, default=datetime.utcnow)
class SiteStay(Base):
    __tablename__ = "site_stays"
    id = Column(Integer, primary_key=True, index=True)
    officer_id = Column(Integer, ForeignKey("users.id"))
    location_id = Column(Integer, ForeignKey("office_locations.id"))
    entry_time = Column(DateTime, default=datetime.utcnow)
    exit_time = Column(DateTime, nullable=True)

def init_db():
    Base.metadata.create_all(bind=engine)
    columns_to_add = [
        ("first_name", "VARCHAR"), ("last_name", "VARCHAR"), ("personal_email", "VARCHAR"),
        ("phone_number", "VARCHAR"), ("dob", "VARCHAR"), ("father_name", "VARCHAR"),
        ("mother_name", "VARCHAR"), ("blood_group", "VARCHAR"), ("emergency_contact", "VARCHAR"),
        ("designation", "VARCHAR"), ("department", "VARCHAR"), ("experience_years", "FLOAT"),
        ("prev_company", "VARCHAR"), ("prev_role", "VARCHAR"), ("aadhar_enc", "VARCHAR"), ("pan_enc", "VARCHAR"),
        ("profile_photo_path", "TEXT"), ("aadhar_photo_path", "TEXT"), ("pan_photo_path", "TEXT"),
        ("filled_form_path", "TEXT"), ("is_verified", "BOOLEAN DEFAULT FALSE"),
        ("is_password_changed", "BOOLEAN DEFAULT FALSE"), ("location_id", "INTEGER")
    ]
    with engine.connect() as conn:
        for col_name, col_type in columns_to_add:
            try:
                conn.execute(text(f"UPDATE users SET is_verified = True WHERE email = 'admin@lizza.com'"))
                conn.commit()
            except Exception:
                conn.rollback()
                try:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                except Exception:
                    conn.rollback()
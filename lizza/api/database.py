import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Float, Boolean, text, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from datetime import datetime
from cryptography.fernet import Fernet 
import base64
import hashlib

PEPPER = os.environ.get("SECRET_PEPPER", "lizza_super_secret_fallback_key")
FERNET_KEY = base64.urlsafe_b64encode(hashlib.sha256(PEPPER.encode()).digest())
cipher = Fernet(FERNET_KEY)
DATABASE_URL = os.environ.get("DATABASE_URL")

connect_args = {}
if DATABASE_URL and DATABASE_URL.startswith("postgres"):
    connect_args = {"sslmode": "require"}

engine = create_engine(
    DATABASE_URL,
    pool_size=20,          
    max_overflow=10,       
    pool_timeout=30,       
    pool_recycle=1800,     
    connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    
    full_name = Column(String) 
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True) 
    personal_email = Column(String, nullable=True) 
    phone_number = Column(String, nullable=True)
    
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
    
    perm_address = Column(Text, nullable=True)
    perm_state = Column(String, nullable=True)
    perm_pin = Column(String, nullable=True)
    perm_mobile = Column(String, nullable=True)
    temp_address = Column(Text, nullable=True)
    temp_state = Column(String, nullable=True)
    temp_pin = Column(String, nullable=True)
    temp_mobile = Column(String, nullable=True)

    languages_json = Column(Text, nullable=True)
    education_json = Column(Text, nullable=True)
    experience_json = Column(Text, nullable=True)
    family_json = Column(Text, nullable=True)
    references_json = Column(Text, nullable=True)
    
    password = Column(String) 
    salt = Column(String)
    is_password_changed = Column(Boolean, default=False) 
    is_verified = Column(Boolean, default=False) 
    kyc_mode = Column(String, default="aadhaar_xml") 
    
    user_type = Column(String, default="employee") 
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    location_id = Column(Integer, ForeignKey("office_locations.id"), nullable=True)
    blockchain_id = Column(String, unique=True, nullable=True) 
    unit_name = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    department = Column(String, nullable=True)
    uniform_details = Column(String, nullable=True)
    onboarded_by_email = Column(String, nullable=True)
    
    aadhar_enc = Column(String, nullable=True) 
    pan_enc = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    ifsc_code = Column(String, nullable=True)
    account_number_enc = Column(String, nullable=True)
    voter_id_enc = Column(String, nullable=True)
    driving_licence_enc = Column(String, nullable=True)
    passport_no_enc = Column(String, nullable=True)
    
    profile_photo_path = Column(Text, nullable=True)
    aadhar_photo_path = Column(Text, nullable=True)
    pan_photo_path = Column(Text, nullable=True)
    voter_photo_path = Column(Text, nullable=True)
    dl_photo_path = Column(Text, nullable=True)
    passport_photo_path = Column(Text, nullable=True)
    fingerprints_left_path = Column(Text, nullable=True)
    fingerprints_right_path = Column(Text, nullable=True)
    bank_passbook_path = Column(Text, nullable=True) 
    filled_form_path = Column(Text, nullable=True)
    
    is_present = Column(Boolean, default=False)
    shift_start = Column(String, nullable=True) 
    shift_end = Column(String, nullable=True)   
    experience_years = Column(Float, nullable=True)
    prev_company = Column(String, nullable=True)
    prev_role = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    extra_documents_json = Column(Text, nullable=True)
    
    fcm_token = Column(String, nullable=True)
    checked_in = Column(Boolean, default=False)
    active_location_id = Column(Integer, ForeignKey("office_locations.id"), nullable=True)

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

class SiteVisit(Base):
    __tablename__ = "site_visits"
    id = Column(Integer, primary_key=True, index=True)
    officer_id = Column(Integer, ForeignKey("users.id"))
    location_id = Column(Integer, ForeignKey("office_locations.id"))
    purpose = Column(String)
    remarks = Column(Text, nullable=True)
    photo_path = Column(Text) 
    visit_time = Column(DateTime, default=datetime.utcnow)

class SiteStay(Base):
    __tablename__ = "site_stays"
    id = Column(Integer, primary_key=True, index=True)
    officer_id = Column(Integer, ForeignKey("users.id"))
    location_id = Column(Integer, ForeignKey("office_locations.id"))
    entry_time = Column(DateTime, default=datetime.utcnow)
    exit_time = Column(DateTime, nullable=True)

class Attendance(Base):
    __tablename__ = "attendances"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    location_id = Column(Integer, ForeignKey("office_locations.id"), nullable=True)
    checkin_time = Column(DateTime, default=datetime.utcnow)
    checkout_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    date = Column(DateTime, default=datetime.utcnow)

class ShiftLog(Base):
    __tablename__ = "shift_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    shift_id = Column(String, unique=True, index=True)
    shift_date = Column(DateTime, default=datetime.utcnow)
    login_time = Column(DateTime, default=datetime.utcnow)
    logout_time = Column(DateTime, nullable=True)
    current_status = Column(String, default="ON_DUTY")
    total_break_minutes = Column(Integer, default=0) 
    total_break_seconds = Column(Integer, default=0)
    break_start_time = Column(DateTime, nullable=True)
    is_on_break = Column(Boolean, default=False)
    path_image_url = Column(Text, nullable=True)

class FieldOfficerRoute(Base):
    __tablename__ = "field_officer_routes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    shift_id = Column(String, index=True) 
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    activity_state = Column(String(50), nullable=False) 
    ping_timestamp = Column(DateTime, default=datetime.utcnow, index=True)

class TaskAssignment(Base):
    __tablename__ = "task_assignments"
    id = Column(Integer, primary_key=True, index=True)
    officer_id = Column(Integer, ForeignKey("users.id"))
    location_id = Column(Integer, ForeignKey("office_locations.id"))
    assigned_date = Column(String, index=True) 
    task_list_json = Column(Text) 
    status = Column(String, default="PENDING") 
    completion_data_json = Column(Text, nullable=True) 
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UniformInventory(Base):
    __tablename__ = "uniform_inventory"
    id = Column(Integer, primary_key=True, index=True)
    item_category = Column(String) 
    size = Column(String)          
    quantity = Column(Integer, default=0)

class UniformIssueLog(Base):
    __tablename__ = "uniform_issue_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    item_category = Column(String)
    size_issued = Column(String)
    issued_at = Column(DateTime, default=datetime.utcnow)
    issued_by = Column(String)

class UniformRequest(Base):
    __tablename__ = "uniform_requests"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    requested_by_email = Column(String) 
    request_type = Column(String) 
    item_details = Column(String) 
    status = Column(String, default="PENDING_ADMIN") 
    assigned_fo_email = Column(String, nullable=True) 
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        def add_col(table, col, ctype):
            conn.execute(text(f"""
                DO $$ 
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                 WHERE table_name='{table}' AND column_name='{col}') THEN
                        ALTER TABLE {table} ADD COLUMN {col} {ctype};
                    END IF;
                END $$;
            """))
            conn.commit()

        add_col("users", "checked_in", "BOOLEAN DEFAULT FALSE")
        add_col("users", "active_location_id", "INTEGER")
        add_col("users", "uniform_details", "VARCHAR")
        add_col("users", "onboarded_by_email", "VARCHAR")
        add_col("shift_logs", "total_break_seconds", "INTEGER DEFAULT 0")
        add_col("shift_logs", "break_start_time", "TIMESTAMP")
        add_col("shift_logs", "is_on_break", "BOOLEAN DEFAULT FALSE")
        add_col("shift_logs", "path_image_url", "TEXT")

        conn.execute(text("UPDATE users SET is_verified = True WHERE email = 'admin@lizza.com'"))
        
        conn.execute(text("""
            INSERT INTO uniform_inventory (item_category, size, quantity) 
            SELECT 'Shirt', 'M', 50 WHERE NOT EXISTS (SELECT 1 FROM uniform_inventory WHERE item_category='Shirt' AND size='M');
        """))
        conn.commit()
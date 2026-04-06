import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Float, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from cryptography.fernet import Fernet 

ENCRYPTION_KEY = os.environ.get("DATA_KEY", Fernet.generate_key().decode())
cipher = Fernet(ENCRYPTION_KEY)

DATABASE_URL = os.environ.get("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String) 
    email = Column(String, unique=True, index=True) 
    personal_email = Column(String, nullable=True) 
    phone_number = Column(String, nullable=True)
    dob = Column(String, nullable=True) 
    password = Column(String) 
    salt = Column(String)
    is_password_changed = Column(Boolean, default=False) 
    is_verified = Column(Boolean, default=False) 
    user_type = Column(String, default="employee") 
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    location_id = Column(Integer, ForeignKey("office_locations.id"), nullable=True)
    blockchain_id = Column(String, unique=True, nullable=True)
    designation = Column(String, nullable=True)
    department = Column(String, nullable=True)
    aadhar_enc = Column(String, nullable=True) 
    pan_enc = Column(String, nullable=True)
    profile_photo_path = Column(Text, nullable=True)
    filled_form_path = Column(Text, nullable=True) 
    is_present = Column(Boolean, default=False)
    shift_start = Column(String, nullable=True) 
    shift_end = Column(String, nullable=True)   

class OfficeLocation(Base):
    __tablename__ = "office_locations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    lat = Column(Float)
    lon = Column(Float)
    radius = Column(Integer, default=200)

class FieldVisitLog(Base):
    __tablename__ = "field_visit_logs"
    id = Column(Integer, primary_key=True, index=True)
    officer_id = Column(Integer, ForeignKey("users.id"))
    site_id = Column(Integer, ForeignKey("office_locations.id"))
    entry_time = Column(DateTime)
    photo_time = Column(DateTime, nullable=True)
    exit_time = Column(DateTime, nullable=True)
    purpose = Column(String, nullable=True)
    remarks = Column(Text, nullable=True)
    photo_path = Column(Text, nullable=True)

def init_db():
    Base.metadata.create_all(bind=engine)
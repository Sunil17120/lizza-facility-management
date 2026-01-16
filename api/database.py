import os  # FIX: Added missing import
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# 1. Setup the Database URL (Ensure this is in your Vercel Env Vars)
DATABASE_URL = os.environ.get("DATABASE_URL")

# 2. Create the Engine and Session
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 3. DEFINE BASE (This is what was missing)
Base = declarative_base()
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String)
    email = Column(String, unique=True, index=True)
    password = Column(String) 
    salt = Column(String)     
    user_type = Column(String, server_default="employee", default="employee") 
    # Add shift fields
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

# 3. FIX: Add this function back so index.py can import it
def init_db():
    Base.metadata.create_all(bind=engine)
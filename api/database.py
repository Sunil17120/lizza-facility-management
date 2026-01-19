import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Float, Boolean, text # FIX: 'text' must be here
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = os.environ.get("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String)
    email = Column(String, unique=True, index=True)
    password = Column(String) 
    salt = Column(String)     
    user_type = Column(String, default="employee") 
    
    # Hierarchy & Blockchain
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    blockchain_id = Column(String, unique=True, nullable=True)
    is_present = Column(Boolean, default=False)
    
    location_id = Column(Integer, ForeignKey("office_locations.id"), nullable=True)
    
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

# Modify User class in database.py


def init_db():
    # 1. Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # 2. Migration: Force add columns using raw SQL
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS office_lat"))
        conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS office_lon"))
        conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS fence_radius"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS office_locations (
                id SERIAL PRIMARY KEY,
                name VARCHAR UNIQUE,
                lat DOUBLE PRECISION,
                lon DOUBLE PRECISION,
                radius INTEGER DEFAULT 200
            )
        """))
        conn.execute(text(" ALTER TABLE users ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES office_locations(id)"))
        conn.commit()
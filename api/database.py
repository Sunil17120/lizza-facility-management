# database.py updates
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

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
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from datetime import datetime

# Vercel provides the POSTGRES_URL environment variable
DATABASE_URL = os.environ.get('POSTGRES_URL')
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Added pooling parameters for better serverless performance
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Verifies connection health before use
    pool_size=5,         # Maximum persistent connections
    max_overflow=10      # Allowed temporary extra connections
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String)
    email = Column(String, unique=True, index=True)
    password = Column(String) 
    salt = Column(String)     
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from app.routers import auth, contacts, conversations, ws
from app.services.otp_service import DUMMY_OTP
from app.database import SessionLocal
from app.models import Message

def cleanup_expired_messages():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        expired = db.query(Message).filter(Message.expires_at != None, Message.expires_at <= now).all()
        if expired:
            for msg in expired:
                db.delete(msg)
            db.commit()
    except Exception as e:
        print(f"Error deleting expired messages: {e}")
    finally:
        db.close()

async def delete_expired_messages():
    while True:
        await asyncio.to_thread(cleanup_expired_messages)
        await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Dummy OTP for all users: {DUMMY_OTP}")
    task = asyncio.create_task(delete_expired_messages())
    yield
    task.cancel()

app = FastAPI(title="Signal Clone API", lifespan=lifespan)

# Allow frontend to access the API
frontend_url = os.getenv("FRONTEND_URL")
origins = ["http://localhost:3000"]
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(contacts.router)
app.include_router(conversations.router)
app.include_router(ws.router)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/health")
def health_check():
    return {"status": "ok"}


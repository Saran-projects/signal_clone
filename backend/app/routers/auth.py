from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import jwt
import re

from app.database import get_db
from app.models import User, OtpCode
from app.services.otp_service import generate_otp, deliver_otp, DUMMY_OTP
from app.auth_deps import get_current_user, get_temp_token_phone, get_jwt_secret

router = APIRouter(prefix="/auth", tags=["auth"])

class RequestOtp(BaseModel):
    phone: str = Field(..., min_length=8, max_length=15)
    purpose: str

    @property
    def is_valid_phone(self):
        return re.match(r"^\+?\d{8,14}$", self.phone) is not None

class VerifyOtp(BaseModel):
    phone: str
    code: str
    purpose: str

class CompleteProfile(BaseModel):
    display_name: str
    avatar_url: str | None = None

def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": int(expire.timestamp())})
    encoded_jwt = jwt.encode(to_encode, get_jwt_secret(), algorithm="HS256")
    return encoded_jwt

@router.post("/request-otp")
def request_otp(req: RequestOtp, db: Session = Depends(get_db)):
    if not req.is_valid_phone:
        raise HTTPException(status_code=400, detail="Invalid phone format")
    if req.purpose not in ["register", "login"]:
        raise HTTPException(status_code=400, detail="Invalid purpose")
        
    user = db.query(User).filter(User.phone == req.phone).first()
    if req.purpose == "register" and user:
        raise HTTPException(status_code=409, detail="account already exists")
    if req.purpose == "login" and not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    cooldown_cutoff = now - timedelta(seconds=60)
    
    recent_otp = db.query(OtpCode).filter(
        OtpCode.phone == req.phone,
        OtpCode.purpose == req.purpose,
        OtpCode.consumed == False
    ).order_by(OtpCode.created_at.desc()).first()

    if recent_otp:
        created_at = recent_otp.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
            
        if created_at >= cooldown_cutoff:
            retry_after = 60 - int((now - created_at).total_seconds())
            return JSONResponse(status_code=429, content={"error": "cooldown", "retry_after": max(1, retry_after)})

    code = generate_otp()
    expires_at = now + timedelta(minutes=10)
    
    new_otp = OtpCode(
        phone=req.phone,
        code=code,
        purpose=req.purpose,
        expires_at=expires_at,
        attempts=0,
        consumed=False
    )
    db.add(new_otp)
    db.commit()
    
    deliver_otp(req.phone, code)
    
    return {
        "message": "otp_sent", 
        "expires_in": 600, 
        "dev_hint": DUMMY_OTP
    }

@router.post("/verify-otp")
def verify_otp(req: VerifyOtp, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    
    otp_record = db.query(OtpCode).filter(
        OtpCode.phone == req.phone,
        OtpCode.purpose == req.purpose,
        OtpCode.consumed == False
    ).order_by(OtpCode.created_at.desc()).first()
    
    if not otp_record:
        return JSONResponse(status_code=400, content={"error": "expired_or_not_found"})
        
    expires_at = otp_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        
    if expires_at < now:
        return JSONResponse(status_code=400, content={"error": "expired_or_not_found"})
        
    if otp_record.attempts >= 5:
        return JSONResponse(status_code=400, content={"error": "too_many_attempts"})
        
    if otp_record.code != req.code:
        otp_record.attempts += 1
        db.commit()
        if otp_record.attempts >= 5:
            return JSONResponse(status_code=400, content={"error": "too_many_attempts"})
        return JSONResponse(status_code=400, content={"error": "invalid_code", "attempts_remaining": 5 - otp_record.attempts})
        
    otp_record.consumed = True
    db.commit()
    
    if req.purpose == "register":
        temp_token = create_access_token({"phone": req.phone, "scope": "profile_setup"}, timedelta(minutes=15))
        return {"verified": True, "next_step": "profile_setup", "temp_token": temp_token}
    else:
        user = db.query(User).filter(User.phone == req.phone).first()
        access_token = create_access_token({"user_id": user.id, "phone": user.phone}, timedelta(days=7))
        return {
            "verified": True,
            "access_token": access_token,
            "user": {
                "id": user.id,
                "phone": user.phone,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "status": user.status
            }
        }

@router.post("/complete-profile")
def complete_profile(req: CompleteProfile, phone: str = Depends(get_temp_token_phone), db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.phone == phone).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="account already exists")

    user = User(
        phone=phone,
        display_name=req.display_name,
        avatar_url=req.avatar_url
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    access_token = create_access_token({"user_id": user.id, "phone": user.phone}, timedelta(days=7))
    return {
        "access_token": access_token,
        "user": {
            "id": user.id,
            "phone": user.phone,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "status": user.status
        }
    }

@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "phone": user.phone,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "status": user.status
    }

@router.post("/logout")
def logout():
    return {"message": "logged out"}

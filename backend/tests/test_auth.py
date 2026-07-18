import pytest
from datetime import datetime, timedelta, timezone
from app.models import OtpCode, User

def test_register_flow(client, db):
    # Request OTP
    resp = client.post("/auth/request-otp", json={"phone": "+919876543210", "purpose": "register"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "otp_sent"
    assert data["dev_hint"] == "123456"

    # Verify OTP
    resp = client.post("/auth/verify-otp", json={"phone": "+919876543210", "code": "123456", "purpose": "register"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["verified"] is True
    assert data["next_step"] == "profile_setup"
    assert "temp_token" in data
    
    # Complete Profile
    temp_token = data["temp_token"]
    resp = client.post(
        "/auth/complete-profile", 
        json={"display_name": "Test User"},
        headers={"Authorization": f"Bearer {temp_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["display_name"] == "Test User"
    assert data["user"]["phone"] == "+919876543210"
    
    # Check ME route
    access_token = data["access_token"]
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert resp.status_code == 200
    assert resp.json()["phone"] == "+919876543210"

def test_login_flow(client, db):
    # Pre-create user
    user = User(phone="+1234567890", display_name="Login User")
    db.add(user)
    db.commit()

    # Request OTP
    resp = client.post("/auth/request-otp", json={"phone": "+1234567890", "purpose": "login"})
    assert resp.status_code == 200
    data = resp.json()

    # Verify OTP
    resp = client.post("/auth/verify-otp", json={"phone": "+1234567890", "code": "123456", "purpose": "login"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["verified"] is True
    assert "access_token" in data
    assert data["user"]["phone"] == "+1234567890"

def test_wrong_code(client, db):
    client.post("/auth/request-otp", json={"phone": "+1111111111", "purpose": "register"})
    resp = client.post("/auth/verify-otp", json={"phone": "+1111111111", "code": "000000", "purpose": "register"})
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_code"
    assert resp.json()["attempts_remaining"] == 4

def test_expired_code(client, db):
    client.post("/auth/request-otp", json={"phone": "+2222222222", "purpose": "register"})
    
    # manually expire it
    otp = db.query(OtpCode).first()
    otp.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    resp = client.post("/auth/verify-otp", json={"phone": "+2222222222", "code": "123456", "purpose": "register"})
    assert resp.status_code == 400
    assert resp.json()["error"] == "expired_or_not_found"

def test_cooldown(client, db):
    resp1 = client.post("/auth/request-otp", json={"phone": "+3333333333", "purpose": "register"})
    assert resp1.status_code == 200
    
    resp2 = client.post("/auth/request-otp", json={"phone": "+3333333333", "purpose": "register"})
    assert resp2.status_code == 429
    assert resp2.json()["error"] == "cooldown"
    assert "retry_after" in resp2.json()

def test_lockout(client, db):
    client.post("/auth/request-otp", json={"phone": "+4444444444", "purpose": "register"})
    
    for i in range(5):
        resp = client.post("/auth/verify-otp", json={"phone": "+4444444444", "code": "000000", "purpose": "register"})
        if i < 4:
            assert resp.status_code == 400
            assert resp.json()["error"] == "invalid_code"
        else:
            assert resp.status_code == 400
            assert resp.json()["error"] == "too_many_attempts"

    # Subsequent request should also be locked out
    resp = client.post("/auth/verify-otp", json={"phone": "+4444444444", "code": "123456", "purpose": "register"})
    assert resp.status_code == 400
    assert resp.json()["error"] == "too_many_attempts"

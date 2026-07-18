import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DUMMY_OTP = "123456"

def generate_otp() -> str:
    return DUMMY_OTP

def deliver_otp(phone: str, code: str) -> None:
    print(f"[DEV OTP] {phone}: {code}")

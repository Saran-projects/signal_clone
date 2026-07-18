from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import User
from app.routers.auth import create_access_token
from datetime import timedelta

def setup_db():
    db = SessionLocal()
    
    u1 = db.query(User).filter(User.phone == "+111").first()
    if not u1:
        u1 = User(phone="+111", display_name="Alice WS")
        u2 = User(phone="+222", display_name="Bob WS")
        db.add_all([u1, u2])
        db.commit()
        db.refresh(u1)
        db.refresh(u2)
    else:
        u2 = db.query(User).filter(User.phone == "+222").first()
        
    u1_data = {"id": u1.id, "phone": u1.phone}
    u2_data = {"id": u2.id, "phone": u2.phone}
    db.close()
    return u1_data, u2_data

def main():
    u1, u2 = setup_db()
    
    t1 = create_access_token({"user_id": u1["id"], "phone": u1["phone"]}, timedelta(days=1))
    t2 = create_access_token({"user_id": u2["id"], "phone": u2["phone"]}, timedelta(days=1))
    
    with TestClient(app) as client:
        # Create conversation between Alice and Bob
        res = client.post("/conversations/", json={"participant_phone": "+222"}, headers={"Authorization": f"Bearer {t1}"})
        if res.status_code != 200:
            print("Failed to create conversation:", res.json())
            return
        conv_id = res.json()["id"]
        
        print(f"Conversation ID: {conv_id}")
        print("Connecting Bob and Alice to WebSocket...")
        
        with client.websocket_connect(f"/ws?token={t1}") as ws1:
            with client.websocket_connect(f"/ws?token={t2}") as ws2:
                print("--- Sending message from Alice to Bob ---")
                ws1.send_json({
                    "type": "send_message",
                    "conversation_id": conv_id,
                    "content": "Hello Bob!"
                })
                
                msg1_echo = ws1.receive_json()
                print("Alice echo:", msg1_echo)
                
                # Because Bob was connected, Alice should also get a receipt_update immediately
                msg1_receipt = ws1.receive_json()
                print("Alice immediate receipt:", msg1_receipt)
                
                msg2 = ws2.receive_json()
                print("Bob received:", msg2)
                
                msg_id = msg2["message"]["id"]
                
                print("\n--- Bob is replying ---")
                ws2.send_json({
                    "type": "send_message",
                    "conversation_id": conv_id,
                    "content": "Hi Alice!",
                    "reply_to_message_id": msg_id
                })
                
                msg2_echo = ws2.receive_json()
                print("Bob echo:", msg2_echo)
                
                msg2_receipt = ws2.receive_json()
                print("Bob immediate receipt:", msg2_receipt)
                
                msg1_reply = ws1.receive_json()
                print("Alice received reply:", msg1_reply)

if __name__ == "__main__":
    main()

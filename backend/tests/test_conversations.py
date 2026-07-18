import pytest
from app.models import User, Contact, Conversation, ConversationParticipant, Message
from app.routers.auth import create_access_token
from datetime import timedelta

def test_contacts(client, db):
    u1 = User(phone="+111", display_name="User 1")
    u2 = User(phone="+222", display_name="User 2")
    db.add_all([u1, u2])
    db.commit()
    
    token = create_access_token({"user_id": u1.id, "phone": u1.phone}, timedelta(days=1))
    headers = {"Authorization": f"Bearer {token}"}
    
    # Add contact
    res = client.post("/contacts/", json={"phone": "+222"}, headers=headers)
    assert res.status_code == 200
    
    # Add self (fail)
    res = client.post("/contacts/", json={"phone": "+111"}, headers=headers)
    assert res.status_code == 400
    
    # List contacts
    res = client.get("/contacts/", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["display_name"] == "User 2"

def test_conversations(client, db):
    u1 = User(phone="+333", display_name="User A")
    u2 = User(phone="+444", display_name="User B")
    db.add_all([u1, u2])
    db.commit()
    
    token = create_access_token({"user_id": u1.id, "phone": u1.phone}, timedelta(days=1))
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create 1:1
    res = client.post("/conversations/", json={"participant_phone": "+444"}, headers=headers)
    assert res.status_code == 200
    conv_id = res.json()["id"]
    
    # Re-create returns same ID
    res = client.post("/conversations/", json={"participant_phone": "+444"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["id"] == conv_id
    
    # List conversations
    res = client.get("/conversations/", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["name"] == "User B"
    assert data[0]["is_group"] == False
    
    # Get messages (empty)
    res = client.get(f"/conversations/{conv_id}/messages", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 0
    
    # Search conversations
    res = client.get("/conversations/search?q=user", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1

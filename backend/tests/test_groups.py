import pytest
from app.models import User
from app.routers.auth import create_access_token
from datetime import timedelta

@pytest.fixture
def test_users(db):
    u1 = User(phone="+111", display_name="Creator")
    u2 = User(phone="+222", display_name="Admin1")
    u3 = User(phone="+333", display_name="Admin2")
    u4 = User(phone="+444", display_name="Member1")
    db.add_all([u1, u2, u3, u4])
    db.commit()
    return [u1, u2, u3, u4]

def get_token(u):
    return create_access_token({"user_id": u.id, "phone": u.phone}, timedelta(days=1))

def test_group_permissions(client, db, test_users):
    u1, u2, u3, u4 = test_users
    t1 = get_token(u1)
    t2 = get_token(u2)
    t3 = get_token(u3)
    t4 = get_token(u4)
    
    # Creator creates group
    res = client.post("/conversations/group", json={"name": "My Group", "member_phones": ["+222", "+333", "+444"]}, headers={"Authorization": f"Bearer {t1}"})
    assert res.status_code == 200
    conv_id = res.json()["id"]
    
    # Creator promotes u2, u3 to admin
    client.patch(f"/conversations/{conv_id}/members/{u2.id}", json={"role": "admin"}, headers={"Authorization": f"Bearer {t1}"})
    client.patch(f"/conversations/{conv_id}/members/{u3.id}", json={"role": "admin"}, headers={"Authorization": f"Bearer {t1}"})
    
    # Test: Admin cannot remove another admin (u2 tries to remove u3)
    res = client.delete(f"/conversations/{conv_id}/members/{u3.id}", headers={"Authorization": f"Bearer {t2}"})
    assert res.status_code == 403
    
    # Test: Admin cannot promote anyone (u2 tries to promote u4)
    res = client.patch(f"/conversations/{conv_id}/members/{u4.id}", json={"role": "admin"}, headers={"Authorization": f"Bearer {t2}"})
    assert res.status_code == 403
    
    # Test: No one can remove the creator (try as admin)
    res = client.delete(f"/conversations/{conv_id}/members/{u1.id}", headers={"Authorization": f"Bearer {t2}"})
    assert res.status_code == 403
    
    # Test: No one can remove the creator (try as creator targeting self)
    res = client.delete(f"/conversations/{conv_id}/members/{u1.id}", headers={"Authorization": f"Bearer {t1}"})
    assert res.status_code == 403
    
    # Test: Creator leaving with an admin present transfers to that admin
    res = client.post(f"/conversations/{conv_id}/leave", headers={"Authorization": f"Bearer {t1}"})
    assert res.status_code == 200
    
    # Check members, new creator should be u2 (joined earlier than u3)
    res = client.get(f"/conversations/{conv_id}/members", headers={"Authorization": f"Bearer {t2}"})
    members = res.json()
    new_creator = next(m for m in members if m["role"] == "creator")
    assert new_creator["user_id"] == u2.id
    
def test_group_creator_leave_member_transfer(client, db, test_users):
    u1, u2, u3, u4 = test_users
    t1 = get_token(u1)
    
    res = client.post("/conversations/group", json={"name": "Only Members", "member_phones": ["+444"]}, headers={"Authorization": f"Bearer {t1}"})
    conv_id = res.json()["id"]
    
    # Creator leaves
    client.post(f"/conversations/{conv_id}/leave", headers={"Authorization": f"Bearer {t1}"})
    
    # Member u4 should be creator
    t4 = get_token(u4)
    res = client.get(f"/conversations/{conv_id}/members", headers={"Authorization": f"Bearer {t4}"})
    members = res.json()
    assert members[0]["role"] == "creator"
    
def test_group_creator_leave_last_participant(client, db, test_users):
    u1 = test_users[0]
    t1 = get_token(u1)
    
    res = client.post("/conversations/group", json={"name": "Solo", "member_phones": []}, headers={"Authorization": f"Bearer {t1}"})
    conv_id = res.json()["id"]
    
    # Creator leaves
    res = client.post(f"/conversations/{conv_id}/leave", headers={"Authorization": f"Bearer {t1}"})
    assert res.status_code == 200

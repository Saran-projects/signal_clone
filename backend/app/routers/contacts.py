from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Contact
from app.auth_deps import get_current_user

router = APIRouter(prefix="/contacts", tags=["contacts"])

class AddContactRequest(BaseModel):
    phone: str

@router.get("")
def get_contacts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contacts = db.query(Contact).filter(Contact.owner_id == current_user.id).all()
    result = []
    for c in contacts:
        contact_user = c.contact_user
        result.append({
            "id": contact_user.id,
            "display_name": contact_user.display_name,
            "avatar_url": contact_user.avatar_url,
            "status": contact_user.status,
            "last_seen": contact_user.last_seen,
            "phone": contact_user.phone
        })
    return result

@router.post("")
def add_contact(req: AddContactRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    target_user = db.query(User).filter(User.phone == req.phone).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself as a contact")
        
    existing_contact = db.query(Contact).filter(
        Contact.owner_id == current_user.id,
        Contact.contact_user_id == target_user.id
    ).first()
    
    if existing_contact:
        raise HTTPException(status_code=409, detail="Contact already exists")
        
    new_contact = Contact(owner_id=current_user.id, contact_user_id=target_user.id)
    db.add(new_contact)
    db.commit()
    
    return {"message": "Contact added"}

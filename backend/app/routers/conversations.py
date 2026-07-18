from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, File, UploadFile
import os
import uuid
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.models import (
    User, Conversation, ConversationParticipant, 
    Message, MessageReceipt, MessageReaction, Contact
)
from app.auth_deps import get_current_user
from datetime import datetime, timezone
from app.routers.ws import insert_system_message_bg

router = APIRouter(prefix="/conversations", tags=["conversations"])

class CreateConversationRequest(BaseModel):
    participant_phone: str

class CreateGroupRequest(BaseModel):
    name: str
    member_phones: List[str]

class AddMemberRequest(BaseModel):
    phone: str

class UpdateMemberRoleRequest(BaseModel):
    role: str

class ReactionRequest(BaseModel):
    emoji: str

class UpdateTimerRequest(BaseModel):
    disappears_after_seconds: Optional[int]

@router.get("")
def list_conversations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    participant_rows = db.query(ConversationParticipant).filter(
        ConversationParticipant.user_id == current_user.id
    ).all()
    
    conv_ids = [p.conversation_id for p in participant_rows]
    
    if not conv_ids:
        return []
        
    conversations = db.query(Conversation).filter(
        Conversation.id.in_(conv_ids)
    ).order_by(Conversation.last_message_at.desc().nulls_last(), Conversation.created_at.desc()).all()
    
    result = []
    
    for conv in conversations:
        me_part = next((p for p in conv.participants if p.user_id == current_user.id), None)
        
        removed_by_dict = None
        if me_part and me_part.removed_by_id:
            removed_by_user = db.query(User).get(me_part.removed_by_id)
            if removed_by_user:
                removed_by_dict = {"id": removed_by_user.id, "name": removed_by_user.display_name}
        
        membership = {
            "is_active": me_part.left_at is None and me_part.removed_by_id is None if me_part else False,
            "left_at": me_part.left_at if me_part else None,
            "removed_by": removed_by_dict
        }
        
        unread_count = db.query(MessageReceipt).join(Message).filter(
            MessageReceipt.user_id == current_user.id,
            MessageReceipt.status != "read",
            Message.conversation_id == conv.id
        ).count()
        
        last_message = db.query(Message).filter(
            Message.conversation_id == conv.id
        ).order_by(Message.created_at.desc()).first()
        
        last_msg_dict = None
        if last_message:
            last_msg_dict = {
                "content": last_message.content,
                "sender_id": last_message.sender_id,
                "created_at": last_message.created_at
            }
            
        conv_item = {
            "id": conv.id,
            "is_group": conv.is_group,
            "name": conv.name,
            "avatar_url": None,
            "last_message": last_msg_dict,
            "unread_count": unread_count,
            "membership": membership
        }
        
        if not conv.is_group:
            other_part = next((p for p in conv.participants if p.user_id != current_user.id), None)
            if other_part:
                other_user = db.query(User).get(other_part.user_id)
                conv_item["name"] = other_user.display_name
                conv_item["avatar_url"] = other_user.avatar_url
                is_contact = db.query(Contact).filter(
                    Contact.owner_id == current_user.id,
                    Contact.contact_user_id == other_user.id
                ).first() is not None

                conv_item["other_participant"] = {
                    "id": other_user.id,
                    "status": other_user.status,
                    "last_seen": other_user.last_seen,
                    "phone": other_user.phone,
                    "is_contact": is_contact
                }
        
        result.append(conv_item)
        
    return result

@router.post("")
def create_1v1_conversation(req: CreateConversationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if req.participant_phone == current_user.phone:
        raise HTTPException(status_code=400, detail="Cannot start conversation with yourself")
        
    target_user = db.query(User).filter(User.phone == req.participant_phone).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    my_1v1_convs = db.query(Conversation.id).join(ConversationParticipant).filter(
        Conversation.is_group == False,
        ConversationParticipant.user_id == current_user.id
    ).subquery()
    
    existing_conv_id = db.query(ConversationParticipant.conversation_id).filter(
        ConversationParticipant.conversation_id.in_(my_1v1_convs),
        ConversationParticipant.user_id == target_user.id
    ).scalar()
    
    if existing_conv_id:
        conv = db.query(Conversation).get(existing_conv_id)
        return {"message": "Conversation exists", "id": conv.id}
        
    new_conv = Conversation(is_group=False)
    db.add(new_conv)
    db.commit()
    db.refresh(new_conv)
    
    part1 = ConversationParticipant(conversation_id=new_conv.id, user_id=current_user.id, role="member")
    part2 = ConversationParticipant(conversation_id=new_conv.id, user_id=target_user.id, role="member")
    db.add_all([part1, part2])
    db.commit()
    
    return {"message": "Conversation created", "id": new_conv.id}

@router.get("/{id}/messages")
def get_messages(id: int, before: Optional[int] = Query(None), limit: int = Query(50), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id
    ).first()
    
    if not me_part:
        raise HTTPException(status_code=403, detail="Not a participant in this conversation")
        
    query = db.query(Message).filter(Message.conversation_id == id)
    
    # Filter out expired messages
    now = datetime.now(timezone.utc)
    query = query.filter((Message.expires_at == None) | (Message.expires_at > now))
    
    if before:
        before_msg = db.query(Message).get(before)
        if before_msg:
            query = query.filter(Message.created_at < before_msg.created_at)
            
    messages = query.order_by(Message.created_at.desc()).limit(limit).all()
    messages.reverse()
    
    result = []
    for msg in messages:
        sender = db.query(User).get(msg.sender_id)
        
        if msg.sender_id == current_user.id:
            all_receipts = db.query(MessageReceipt).filter(MessageReceipt.message_id == msg.id).all()
            if not all_receipts:
                computed_status = "sent"
            else:
                statuses = [r.status for r in all_receipts]
                if all(s == "read" for s in statuses):
                    computed_status = "read"
                elif all(s in ["delivered", "read"] for s in statuses):
                    computed_status = "delivered"
                else:
                    computed_status = "sent"
        else:
            receipt = db.query(MessageReceipt).filter(
                MessageReceipt.message_id == msg.id,
                MessageReceipt.user_id == current_user.id
            ).first()
            computed_status = receipt.status if receipt else "sent"

        reply_to = None
        if msg.reply_to_message_id:
            parent = db.query(Message).get(msg.reply_to_message_id)
            if parent:
                parent_sender = db.query(User).get(parent.sender_id)
                reply_to = {
                    "id": parent.id,
                    "sender_name": parent_sender.display_name if parent_sender else "Unknown",
                    "content_snippet": parent.content[:60] if parent.content else ""
                }
                
        result.append({
            "id": msg.id,
            "content": msg.content,
            "message_type": msg.message_type,
            "created_at": msg.created_at,
            "sender": {
                "id": sender.id,
                "display_name": sender.display_name
            } if sender else None,
            "receipt_status": computed_status,
            "reply_to": reply_to,
            "reactions": [{"user_id": r.user_id, "emoji": r.emoji} for r in msg.reactions]
        })
        
    return result

@router.post("/{id}/timer")
def update_timer(id: int, req: UpdateTimerRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id
    ).first()
    
    if not me_part or (me_part.left_at is not None) or (me_part.removed_by_id is not None):
        raise HTTPException(status_code=403, detail="Not an active participant")
        
    conv = db.query(Conversation).get(id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    conv.disappears_after_seconds = req.disappears_after_seconds
    db.commit()
    
    # Broadcast a system message about timer update
    timer_msg = f"Disappearing messages set to {req.disappears_after_seconds} seconds" if req.disappears_after_seconds else "Disappearing messages disabled"
    # insert_system_message_bg(...) would be ideal here if imported
    
    return {"message": "Timer updated"}

from app.routers.ws import manager, get_active_participants

@router.post("/{id}/messages/{msg_id}/reactions")
async def add_reaction(id: int, msg_id: int, req: ReactionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify participation
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id
    ).first()
    if not me_part or me_part.left_at or me_part.removed_by_id:
        raise HTTPException(status_code=403, detail="Not an active participant")
        
    msg = db.query(Message).filter(Message.id == msg_id, Message.conversation_id == id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    existing = db.query(MessageReaction).filter(
        MessageReaction.message_id == msg_id,
        MessageReaction.user_id == current_user.id,
        MessageReaction.emoji == req.emoji
    ).first()
    
    if not existing:
        reaction = MessageReaction(message_id=msg_id, user_id=current_user.id, emoji=req.emoji)
        db.add(reaction)
        db.commit()
        
        # Broadcast
        active_users = get_active_participants(db, id)
        payload = {
            "type": "reaction_added",
            "conversation_id": id,
            "message_id": msg_id,
            "user_id": current_user.id,
            "emoji": req.emoji
        }
        for uid in active_users:
            if uid in manager.active_connections:
                await manager.broadcast_to_user(uid, payload)
                
    return {"message": "Reaction added"}

@router.delete("/{id}/messages/{msg_id}/reactions/{emoji}")
async def remove_reaction(id: int, msg_id: int, emoji: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reaction = db.query(MessageReaction).filter(
        MessageReaction.message_id == msg_id,
        MessageReaction.user_id == current_user.id,
        MessageReaction.emoji == emoji
    ).first()
    
    if reaction:
        db.delete(reaction)
        db.commit()
        
        active_users = get_active_participants(db, id)
        payload = {
            "type": "reaction_removed",
            "conversation_id": id,
            "message_id": msg_id,
            "user_id": current_user.id,
            "emoji": emoji
        }
        for uid in active_users:
            if uid in manager.active_connections:
                await manager.broadcast_to_user(uid, payload)
                
    return {"message": "Reaction removed"}

@router.post("/{id}/messages/image")
async def upload_image(id: int, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id
    ).first()
    
    if not me_part or me_part.left_at or me_part.removed_by_id:
        raise HTTPException(status_code=403, detail="Not an active participant")
        
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join("uploads", filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
        
    file_url = f"/uploads/{filename}"
    
    now = datetime.now(timezone.utc)
    new_msg = Message(
        conversation_id=id,
        sender_id=current_user.id,
        content=file_url,
        message_type="image",
        created_at=now
    )
    
    conv = db.query(Conversation).get(id)
    if conv:
        conv.last_message_at = now
        if conv.disappears_after_seconds:
            from datetime import timedelta
            new_msg.expires_at = now + timedelta(seconds=conv.disappears_after_seconds)
            
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    
    active_users = get_active_participants(db, id)
    for uid in active_users:
        if uid == current_user.id:
            continue
        receipt = MessageReceipt(message_id=new_msg.id, user_id=uid, status="sent", updated_at=now)
        db.add(receipt)
        if uid in manager.active_connections:
            receipt.status = "delivered"
    db.commit()
    
    payload = {
        "type": "new_message",
        "message": {
            "id": new_msg.id,
            "content": new_msg.content,
            "created_at": new_msg.created_at.isoformat(),
            "sender": {
                "id": current_user.id,
                "display_name": current_user.display_name
            },
            "receipt_status": "sent",
            "message_type": "image",
            "reply_to": None
        }
    }
    
    for uid in active_users:
        if uid in manager.active_connections:
            await manager.broadcast_to_user(uid, payload)
            
    return {"message": "Image uploaded"}

@router.get("/search")
def search_conversations(q: str = Query(..., min_length=1), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    all_convs = list_conversations(db, current_user)
    q_lower = q.lower()
    
    filtered_convs = []
    for conv in all_convs:
        if conv["name"] and q_lower in conv["name"].lower():
            filtered_convs.append(conv)
            
    return filtered_convs

@router.post("/group")
def create_group(req: CreateGroupRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_conv = Conversation(is_group=True, name=req.name)
    db.add(new_conv)
    db.commit()
    db.refresh(new_conv)
    
    part = ConversationParticipant(conversation_id=new_conv.id, user_id=current_user.id, role="creator")
    db.add(part)
    
    failed_phones = []
    for phone in req.member_phones:
        u = db.query(User).filter(User.phone == phone).first()
        if u:
            existing = db.query(ConversationParticipant).filter(
                ConversationParticipant.conversation_id == new_conv.id,
                ConversationParticipant.user_id == u.id
            ).first()
            if not existing:
                p = ConversationParticipant(conversation_id=new_conv.id, user_id=u.id, role="member")
                db.add(p)
        else:
            failed_phones.append(phone)
            
    db.commit()
    
    # Send system message using background task so it gets broadcast to all connected users
    insert_system_message_bg(
        background_tasks,
        new_conv.id,
        f"{current_user.display_name} created the group '{req.name}'",
        db
    )
    
    return {"id": new_conv.id, "failed_phones": failed_phones}

@router.get("/{id}/members")
def get_group_members(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id,
        ConversationParticipant.left_at.is_(None)
    ).first()
    
    if not me_part:
        raise HTTPException(status_code=403, detail="Not an active participant")
        
    participants = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.left_at.is_(None)
    ).all()
    
    result = []
    for p in participants:
        u = db.query(User).get(p.user_id)
        result.append({
            "user_id": u.id,
            "display_name": u.display_name,
            "phone": u.phone,
            "avatar_url": u.avatar_url,
            "status": u.status,
            "role": p.role,
            "joined_at": p.joined_at
        })
    return result

@router.post("/{id}/members")
def add_group_member(id: int, req: AddMemberRequest, bg_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id,
        ConversationParticipant.left_at.is_(None)
    ).first()
    
    if not me_part or me_part.role not in ["creator", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to add members")
        
    target_user = db.query(User).filter(User.phone == req.phone).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    existing = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == target_user.id,
        ConversationParticipant.left_at.is_(None)
    ).first()
    
    if existing:
        raise HTTPException(status_code=409, detail="Already a member")
        
    past_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == target_user.id
    ).first()
    
    if past_part:
        past_part.left_at = None
        past_part.removed_by_id = None
        past_part.role = "member"
    else:
        new_part = ConversationParticipant(conversation_id=id, user_id=target_user.id, role="member")
        db.add(new_part)
        
    db.commit()
    
    bg_tasks.add_task(insert_system_message_bg, id, f"{current_user.display_name} added {target_user.display_name}")
    return {"message": "Member added"}

@router.delete("/{id}/members/{user_id}")
def remove_group_member(id: int, user_id: int, bg_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id,
        ConversationParticipant.left_at.is_(None)
    ).first()
    
    if not me_part:
        raise HTTPException(status_code=403, detail="Not an active participant")
        
    target_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == user_id,
        ConversationParticipant.left_at.is_(None)
    ).first()
    
    if not target_part:
        raise HTTPException(status_code=404, detail="Target is not an active member")
        
    if target_part.role == "creator":
        raise HTTPException(status_code=403, detail="Cannot remove the creator")
        
    if me_part.role == "member":
        raise HTTPException(status_code=403, detail="Members cannot remove others")
        
    if me_part.role == "admin" and target_part.role == "admin":
        raise HTTPException(status_code=403, detail="Admins cannot remove other admins")
        
    from datetime import datetime, timezone
    target_part.left_at = datetime.now(timezone.utc)
    target_part.removed_by_id = current_user.id
    db.commit()
    
    target_user = db.query(User).get(user_id)
    bg_tasks.add_task(insert_system_message_bg, id, f"{current_user.display_name} removed {target_user.display_name}")
    return {"message": "Member removed"}

@router.patch("/{id}/members/{user_id}")
def update_member_role(id: int, user_id: int, req: UpdateMemberRoleRequest, bg_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id,
        ConversationParticipant.left_at.is_(None)
    ).first()
    
    if not me_part or me_part.role != "creator":
        raise HTTPException(status_code=403, detail="Only creator can update roles")
        
    target_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == user_id,
        ConversationParticipant.left_at.is_(None)
    ).first()
    
    if not target_part:
        raise HTTPException(status_code=404, detail="Target is not an active member")
        
    if target_part.role == "creator":
        raise HTTPException(status_code=400, detail="Cannot change creator's role")
        
    target_part.role = req.role
    db.commit()
    
    target_user = db.query(User).get(user_id)
    action = "made" if req.role == "admin" else "removed"
    role_str = "an admin" if req.role == "admin" else "as admin"
    msg = f"{current_user.display_name} {action} {target_user.display_name} {role_str}"
    bg_tasks.add_task(insert_system_message_bg, id, msg)
    return {"message": "Role updated"}

@router.post("/{id}/leave")
def leave_group(id: int, bg_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me_part = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id,
        ConversationParticipant.user_id == current_user.id,
        ConversationParticipant.left_at.is_(None)
    ).first()
    
    if not me_part:
        raise HTTPException(status_code=403, detail="Not an active participant")
        
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    
    me_part.left_at = now
    
    bg_tasks.add_task(insert_system_message_bg, id, f"{current_user.display_name} left the group")
    
    if me_part.role == "creator":
        new_owner = db.query(ConversationParticipant).filter(
            ConversationParticipant.conversation_id == id,
            ConversationParticipant.left_at.is_(None),
            ConversationParticipant.role == "admin"
        ).order_by(ConversationParticipant.joined_at.asc()).first()
        
        if not new_owner:
            new_owner = db.query(ConversationParticipant).filter(
                ConversationParticipant.conversation_id == id,
                ConversationParticipant.left_at.is_(None),
                ConversationParticipant.role == "member"
            ).order_by(ConversationParticipant.joined_at.asc()).first()
            
        if new_owner:
            new_owner.role = "creator"
            new_owner_user = db.query(User).get(new_owner.user_id)
            bg_tasks.add_task(insert_system_message_bg, id, f"{new_owner_user.display_name} is now the group creator")
            
    db.commit()
    return {"message": "Left the group"}

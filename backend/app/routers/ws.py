import json
import jwt
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from collections import defaultdict
from typing import Dict, List

from app.database import get_db, SessionLocal
from app.models import User, Contact, Conversation, ConversationParticipant, Message, MessageReceipt
from app.auth_deps import get_jwt_secret

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_user(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                await connection.send_json(message)

manager = ConnectionManager()

def get_active_participants(db: Session, conversation_id: int) -> List[int]:
    participants = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == conversation_id,
        ConversationParticipant.left_at.is_(None)
    ).all()
    return [p.user_id for p in participants]

async def broadcast_presence(user_id: int, status: str, last_seen: datetime | None, db: Session):
    contacts = db.query(Contact).filter(Contact.contact_user_id == user_id).all()
    owner_ids = [c.owner_id for c in contacts]
    
    presence_msg = {
        "type": "presence_update",
        "user_id": user_id,
        "status": status,
        "last_seen": last_seen.isoformat() if last_seen else None
    }
    
    for oid in owner_ids:
        if oid in manager.active_connections:
            await manager.broadcast_to_user(oid, presence_msg)

async def insert_system_message(conversation_id: int, content: str, db: Session):
    now = datetime.now(timezone.utc)
    new_msg = Message(
        conversation_id=conversation_id,
        sender_id=None,
        content=content,
        message_type="system",
        created_at=now
    )
    db.add(new_msg)
    
    # Update last message timestamp
    conv = db.query(Conversation).get(conversation_id)
    if conv:
        conv.last_message_at = now
        if conv.disappears_after_seconds:
            from datetime import timedelta
            new_msg.expires_at = now + timedelta(seconds=conv.disappears_after_seconds)
            
    db.commit()
    db.refresh(new_msg)
    
    active_users = get_active_participants(db, conversation_id)
    
    for uid in active_users:
        receipt = MessageReceipt(message_id=new_msg.id, user_id=uid, status="sent", updated_at=now)
        db.add(receipt)
        if uid in manager.active_connections:
            receipt.status = "delivered"
    db.commit()
    
    msg_payload = {
        "type": "new_message",
        "message": {
            "id": new_msg.id,
            "content": new_msg.content,
            "created_at": new_msg.created_at.isoformat(),
            "sender": None,
            "receipt_status": "sent",
            "reply_to": None
        }
    }
    
    for uid in active_users:
        await manager.broadcast_to_user(uid, msg_payload)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
        user_id = payload.get("user_id")
        if not user_id:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return
        
    await manager.connect(websocket, user_id)
    
    db = SessionLocal()
    try:
        user = db.query(User).get(user_id)
        if user:
            user.status = "online"
            db.commit()
            
        await broadcast_presence(user_id, "online", None, db)
        
        # Mark pending receipts as delivered
        pending_receipts = db.query(MessageReceipt).filter(
            MessageReceipt.user_id == user_id,
            MessageReceipt.status == "sent"
        ).all()
        
        if pending_receipts:
            from collections import defaultdict
            msg_updates = defaultdict(list)
            
            for r in pending_receipts:
                r.status = "delivered"
                r.updated_at = datetime.now(timezone.utc)
                msg_updates[r.message.sender_id].append(r.message)
            db.commit()
            
            for sender_id, msgs in msg_updates.items():
                if sender_id and sender_id in manager.active_connections:
                    for msg in msgs:
                        all_receipts = db.query(MessageReceipt).filter(MessageReceipt.message_id == msg.id).all()
                        statuses = [r.status for r in all_receipts]
                        if all(s == "read" for s in statuses):
                            agg = "read"
                        elif all(s in ["delivered", "read"] for s in statuses):
                            agg = "delivered"
                        else:
                            agg = "sent"
                            
                        await manager.broadcast_to_user(sender_id, {
                            "type": "receipt_update",
                            "message_id": msg.id,
                            "user_id": user_id,
                            "status": agg
                        })
        
        while True:
            data = await websocket.receive_text()
            try:
                event = json.loads(data)
            except:
                continue
                
            event_type = event.get("type")
            conv_id = event.get("conversation_id")
            
            if not conv_id:
                continue
                
            if event_type == "send_message":
                content = event.get("content")
                reply_to_id = event.get("reply_to_message_id")
                
                active_users = get_active_participants(db, conv_id)
                if user_id not in active_users:
                    continue 
                    
                now = datetime.now(timezone.utc)
                new_msg = Message(
                    conversation_id=conv_id,
                    sender_id=user_id,
                    content=content,
                    message_type="text",
                    reply_to_message_id=reply_to_id,
                    created_at=now
                )
                db.add(new_msg)
                
                # Update last message timestamp
                conv = db.query(Conversation).get(conv_id)
                if conv:
                    conv.last_message_at = now
                    if conv.disappears_after_seconds:
                        from datetime import timedelta
                        new_msg.expires_at = now + timedelta(seconds=conv.disappears_after_seconds)
                    
                db.commit()
                db.refresh(new_msg)
                
                delivered_to = []
                
                for uid in active_users:
                    if uid == user_id:
                        continue
                    receipt = MessageReceipt(message_id=new_msg.id, user_id=uid, status="sent", updated_at=now)
                    db.add(receipt)
                    
                    if uid in manager.active_connections:
                        receipt.status = "delivered"
                        delivered_to.append(uid)
                        
                db.commit()
                
                reply_to_obj = None
                if reply_to_id:
                    parent = db.query(Message).get(reply_to_id)
                    if parent:
                        parent_sender = db.query(User).get(parent.sender_id) if parent.sender_id else None
                        reply_to_obj = {
                            "id": parent.id,
                            "sender_name": parent_sender.display_name if parent_sender else "System",
                            "content_snippet": parent.content[:60] if parent.content else ""
                        }
                        
                sender_user = db.query(User).get(user_id)
                msg_payload = {
                    "type": "new_message",
                    "message": {
                        "id": new_msg.id,
                        "content": new_msg.content,
                        "created_at": new_msg.created_at.isoformat(),
                        "sender": {
                            "id": sender_user.id,
                            "display_name": sender_user.display_name
                        },
                        "receipt_status": "sent",
                        "message_type": "text",
                        "reply_to": reply_to_obj
                    }
                }
                
                for uid in active_users:
                    if uid == user_id:
                        continue
                    await manager.broadcast_to_user(uid, msg_payload)
                    
                other_users_count = len(active_users) - 1
                if other_users_count > 0 and len(delivered_to) == other_users_count:
                    msg_payload["message"]["receipt_status"] = "delivered"
                else:
                    msg_payload["message"]["receipt_status"] = "sent"
                    
                await manager.broadcast_to_user(user_id, msg_payload)
                
                for uid in delivered_to:
                    await manager.broadcast_to_user(user_id, {
                        "type": "receipt_update",
                        "message_id": new_msg.id,
                        "user_id": uid,
                        "status": "delivered"
                    })
                    
            elif event_type == "typing":
                is_typing = event.get("is_typing", False)
                active_users = get_active_participants(db, conv_id)
                if user_id in active_users:
                    sender_user = db.query(User).get(user_id)
                    user_name = sender_user.display_name if sender_user else "Someone"
                    typing_payload = {
                        "type": "typing",
                        "conversation_id": conv_id,
                        "user_id": user_id,
                        "user_name": user_name,
                        "is_typing": is_typing
                    }
                    for uid in active_users:
                        if uid != user_id:
                            await manager.broadcast_to_user(uid, typing_payload)
                            
            elif event_type == "mark_read":
                up_to = event.get("up_to_message_id")
                if not up_to:
                    continue
                    
                receipts = db.query(MessageReceipt).join(Message).filter(
                    MessageReceipt.user_id == user_id,
                    MessageReceipt.status != "read",
                    Message.conversation_id == conv_id,
                    Message.id <= up_to
                ).all()
                
                updated_messages = []
                for r in receipts:
                    r.status = "read"
                    r.updated_at = datetime.now(timezone.utc)
                    updated_messages.append(r.message)
                db.commit()
                
                for msg in updated_messages:
                    if msg.sender_id and msg.sender_id in manager.active_connections:
                        all_receipts = db.query(MessageReceipt).filter(MessageReceipt.message_id == msg.id).all()
                        statuses = [r.status for r in all_receipts]
                        if all(s == "read" for s in statuses):
                            agg = "read"
                        elif all(s in ["delivered", "read"] for s in statuses):
                            agg = "delivered"
                        else:
                            agg = "sent"

                        await manager.broadcast_to_user(msg.sender_id, {
                            "type": "receipt_update",
                            "message_id": msg.id,
                            "user_id": user_id,
                            "status": agg
                        })

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
        now = datetime.now(timezone.utc)
        user = db.query(User).get(user_id)
        if user:
            user.status = "offline"
            user.last_seen = now
            db.commit()
        await broadcast_presence(user_id, "offline", now, db)
    finally:
        db.close()

def insert_system_message_bg(conversation_id: int, content: str):
    import asyncio
    db = SessionLocal()
    try:
        asyncio.run(insert_system_message(conversation_id, content, db))
    finally:
        db.close()


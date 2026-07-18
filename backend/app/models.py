from typing import List, Optional
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Integer, Text, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String)
    avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="offline")
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    contacts_owned: Mapped[List["Contact"]] = relationship("Contact", foreign_keys="[Contact.owner_id]", back_populates="owner")
    contacts_of: Mapped[List["Contact"]] = relationship("Contact", foreign_keys="[Contact.contact_user_id]", back_populates="contact_user")
    
    participants: Mapped[List["ConversationParticipant"]] = relationship("ConversationParticipant", foreign_keys="[ConversationParticipant.user_id]", back_populates="user")
    removed_participants: Mapped[List["ConversationParticipant"]] = relationship("ConversationParticipant", foreign_keys="[ConversationParticipant.removed_by_id]", back_populates="removed_by")

    messages_sent: Mapped[List["Message"]] = relationship("Message", back_populates="sender")
    message_receipts: Mapped[List["MessageReceipt"]] = relationship("MessageReceipt", back_populates="user")


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String, index=True)
    code: Mapped[str] = mapped_column(String)
    purpose: Mapped[str] = mapped_column(String) # "register" | "login"
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Contact(Base):
    __tablename__ = "contacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    contact_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("owner_id", "contact_user_id", name="uq_contact_owner_user"),
    )

    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id], back_populates="contacts_owned")
    contact_user: Mapped["User"] = relationship("User", foreign_keys=[contact_user_id], back_populates="contacts_of")


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    is_group: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    disappears_after_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True, nullable=True)

    participants: Mapped[List["ConversationParticipant"]] = relationship("ConversationParticipant", back_populates="conversation")
    messages: Mapped[List["Message"]] = relationship("Message", back_populates="conversation")


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String, default="member") # "creator" | "admin" | "member"
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    removed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="participants")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="participants")
    removed_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[removed_by_id], back_populates="removed_participants")


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    sender_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    message_type: Mapped[str] = mapped_column(String, default="text") # "text" | "system"
    reply_to_message_id: Mapped[Optional[int]] = mapped_column(ForeignKey("messages.id"), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
    sender: Mapped[Optional["User"]] = relationship("User", back_populates="messages_sent")
    
    replies: Mapped[List["Message"]] = relationship("Message", back_populates="reply_to_message")
    reply_to_message: Mapped[Optional["Message"]] = relationship("Message", remote_side=[id], back_populates="replies")
    
    receipts: Mapped[List["MessageReceipt"]] = relationship("MessageReceipt", back_populates="message")
    reactions: Mapped[List["MessageReaction"]] = relationship("MessageReaction", back_populates="message")

class MessageReaction(Base):
    __tablename__ = "message_reactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    emoji: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_msg_user_emoji"),
    )

    message: Mapped["Message"] = relationship("Message", back_populates="reactions")
    user: Mapped["User"] = relationship("User")

class MessageReceipt(Base):
    __tablename__ = "message_receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String, default="sent") # "sent" | "delivered" | "read"
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    message: Mapped["Message"] = relationship("Message", back_populates="receipts")
    user: Mapped["User"] = relationship("User", back_populates="message_receipts")

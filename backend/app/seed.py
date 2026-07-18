import os
import sys
from datetime import datetime, timedelta, timezone

# Add the parent directory to sys.path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, Base, engine
from app.models import User, Contact, Conversation, ConversationParticipant, Message, MessageReceipt

def seed_db():
    print("Seeding database...")
    db = SessionLocal()
    try:
        # 1. Create Users
        users_data = [
            {"phone": "+91987654320", "display_name": "Alice Cooper"},
            {"phone": "+91987654321", "display_name": "Bob Marley"},
            {"phone": "+91987654322", "display_name": "Charlie Chaplin"},
            {"phone": "+91987654323", "display_name": "David Beckham"},
            {"phone": "+91987654324", "display_name": "Eva Longoria"},
            {"phone": "+91987654325", "display_name": "Frank Sinatra"}
        ]
        
        users = []
        for u in users_data:
            user = db.query(User).filter(User.phone == u["phone"]).first()
            if not user:
                user = User(
                    phone=u["phone"],
                    display_name=u["display_name"],
                    avatar_url=f"https://api.dicebear.com/7.x/avataaars/svg?seed={u['display_name'].replace(' ', '')}",
                    status="offline",
                    last_seen=datetime.now(timezone.utc) - timedelta(hours=2)
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"Created user: {user.display_name}")
            else:
                print(f"User already exists: {user.display_name}")
            users.append(user)
            
        alice, bob, charlie, david, eva, frank = users

        # 2. Setup Contacts (bidirectional between all seeded users)
        for i, owner in enumerate(users):
            for j, contact_user in enumerate(users):
                if i == j:
                    continue
                existing = db.query(Contact).filter(
                    Contact.owner_id == owner.id,
                    Contact.contact_user_id == contact_user.id
                ).first()
                if not existing:
                    contact = Contact(owner_id=owner.id, contact_user_id=contact_user.id)
                    db.add(contact)
        db.commit()
        print("Contacts populated.")

        # 3. Helper to create 1v1 conversations and populate messages
        def get_or_create_1v1(user1, user2):
            # Check if 1v1 conversation already exists
            my_1v1_convs = db.query(Conversation.id).join(ConversationParticipant).filter(
                Conversation.is_group == False,
                ConversationParticipant.user_id == user1.id
            ).subquery()
            
            existing_conv_id = db.query(ConversationParticipant.conversation_id).filter(
                ConversationParticipant.conversation_id.in_(my_1v1_convs),
                ConversationParticipant.user_id == user2.id
            ).scalar()
            
            if existing_conv_id:
                return db.query(Conversation).get(existing_conv_id), False
            
            conv = Conversation(is_group=False)
            db.add(conv)
            db.commit()
            db.refresh(conv)
            
            p1 = ConversationParticipant(conversation_id=conv.id, user_id=user1.id, role="member")
            p2 = ConversationParticipant(conversation_id=conv.id, user_id=user2.id, role="member")
            db.add_all([p1, p2])
            db.commit()
            return conv, True

        # Conversation 1: Alice & Bob (18 messages)
        conv1, created1 = get_or_create_1v1(alice, bob)
        if created1:
            print("Creating messages for Alice & Bob conversation...")
            now = datetime.now(timezone.utc)
            messages_conv1 = [
                (bob, "Hey Alice! Are you free to chat?", now - timedelta(hours=5)),
                (alice, "Hey Bob! Yes, what's up?", now - timedelta(hours=4, minutes=58)),
                (bob, "I wanted to ask you about the design of the Signal clone. It looks really nice!", now - timedelta(hours=4, minutes=55)),
                (alice, "Thanks! I put a lot of work into the animations and dark mode theme.", now - timedelta(hours=4, minutes=52)),
                (bob, "Yeah, the glassmorphism layout is super cool.", now - timedelta(hours=4, minutes=50)),
                (alice, "Have you tested the WebSocket messaging?", now - timedelta(hours=4, minutes=45)),
                (bob, "Not yet, I'm setting up my dev environment now.", now - timedelta(hours=4, minutes=40)),
                (alice, "Let me know when you're online and we can test it.", now - timedelta(hours=4, minutes=38)),
                (bob, "Will do! By the way, are we using SQLite for production or Postgres?", now - timedelta(hours=3)),
                (alice, "SQLite for local development, Postgres for staging/production.", now - timedelta(hours=2, minutes=58)),
                (bob, "Okay, that makes sense.", now - timedelta(hours=2, minutes=55)),
                (alice, "Did you see the new avatar presets in the profile setup?", now - timedelta(hours=2, minutes=50)),
                (bob, "Yes! The gradient designs are gorgeous.", now - timedelta(hours=2, minutes=45)),
                (alice, "Awesome.", now - timedelta(hours=2, minutes=40)),
            ]
            
            db_messages = []
            for sender, content, ts in messages_conv1:
                msg = Message(conversation_id=conv1.id, sender_id=sender.id, content=content, created_at=ts)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                db_messages.append(msg)
                
                # Add receipts
                other_user = bob if sender.id == alice.id else alice
                receipt = MessageReceipt(message_id=msg.id, user_id=other_user.id, status="read", updated_at=ts + timedelta(minutes=2))
                db.add(receipt)
                db.commit()
                
            # Now add replies
            # Reply 1: Bob replies to Message index 11 (Did you see the new avatar presets...)
            msg_reply_1 = Message(
                conversation_id=conv1.id, 
                sender_id=bob.id, 
                content="I really like the orange-to-purple gradient one!", 
                reply_to_message_id=db_messages[11].id,
                created_at=now - timedelta(hours=1)
            )
            db.add(msg_reply_1)
            db.commit()
            db.refresh(msg_reply_1)
            db.add(MessageReceipt(message_id=msg_reply_1.id, user_id=alice.id, status="read", updated_at=now - timedelta(minutes=50)))
            db_messages.append(msg_reply_1)

            # Reply 2: Alice replies to Reply 1
            msg_reply_2 = Message(
                conversation_id=conv1.id, 
                sender_id=alice.id, 
                content="Same! That one is my absolute favorite too.", 
                reply_to_message_id=msg_reply_1.id,
                created_at=now - timedelta(minutes=45)
            )
            db.add(msg_reply_2)
            db.commit()
            db.refresh(msg_reply_2)
            db.add(MessageReceipt(message_id=msg_reply_2.id, user_id=bob.id, status="delivered", updated_at=now - timedelta(minutes=43)))
            db_messages.append(msg_reply_2)

            # A couple of unread/delivered messages at the end
            msg_unread_1 = Message(
                conversation_id=conv1.id, 
                sender_id=bob.id, 
                content="Are we meeting tomorrow to review the tasks?", 
                created_at=now - timedelta(minutes=10)
            )
            db.add(msg_unread_1)
            db.commit()
            db.refresh(msg_unread_1)
            db.add(MessageReceipt(message_id=msg_unread_1.id, user_id=alice.id, status="delivered", updated_at=now - timedelta(minutes=9)))

            msg_unread_2 = Message(
                conversation_id=conv1.id, 
                sender_id=bob.id, 
                content="Ping me when you get a chance.", 
                created_at=now - timedelta(minutes=2)
            )
            db.add(msg_unread_2)
            db.commit()
            db.refresh(msg_unread_2)
            db.add(MessageReceipt(message_id=msg_unread_2.id, user_id=alice.id, status="sent", updated_at=now - timedelta(minutes=2)))

            # Update conversation last message timestamp
            conv1.last_message_at = now - timedelta(minutes=2)
            db.commit()

        # Conversation 2: Alice & Charlie (16 messages)
        conv2, created2 = get_or_create_1v1(alice, charlie)
        if created2:
            print("Creating messages for Alice & Charlie conversation...")
            now = datetime.now(timezone.utc)
            messages_conv2 = [
                (alice, "Hey Charlie, did you check the DB models?", now - timedelta(days=1, hours=3)),
                (charlie, "Yes, they look solid. Simple and clean schema.", now - timedelta(days=1, hours=2, minutes=55)),
                (alice, "Perfect. We added message receipts today.", now - timedelta(days=1, hours=2, minutes=50)),
                (charlie, "Oh nice! Are receipts status: sent, delivered, read?", now - timedelta(days=1, hours=2, minutes=45)),
                (alice, "Yes, exactly. Driven by websocket events.", now - timedelta(days=1, hours=2, minutes=40)),
                (charlie, "Excellent, that will give a real-time messaging feel.", now - timedelta(days=1, hours=2, minutes=30)),
                (alice, "Exactly. We're using standard status checks in UI.", now - timedelta(days=1, hours=2, minutes=20)),
                (charlie, "What about typing indicators?", now - timedelta(days=1, hours=1)),
                (alice, "Yes, we will send typing events on keyup and clear them after 3s of inactivity.", now - timedelta(hours=23)),
                (charlie, "Nice! Will test this out.", now - timedelta(hours=22)),
                (alice, "I'll upload the seeded SQLite database so you can test immediately.", now - timedelta(hours=5)),
                (charlie, "Great, thanks Alice!", now - timedelta(hours=4, minutes=50)),
                (alice, "Are you online now?", now - timedelta(hours=2)),
                (charlie, "Yes, I am. Ready to verify.", now - timedelta(hours=1, minutes=50)),
                (alice, "Perfect. Sending test messages now...", now - timedelta(minutes=30)),
                (charlie, "Received! Looks fantastic.", now - timedelta(minutes=28)),
            ]
            for sender, content, ts in messages_conv2:
                msg = Message(conversation_id=conv2.id, sender_id=sender.id, content=content, created_at=ts)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                
                other_user = charlie if sender.id == alice.id else alice
                receipt = MessageReceipt(message_id=msg.id, user_id=other_user.id, status="read", updated_at=ts + timedelta(minutes=1))
                db.add(receipt)
                
            conv2.last_message_at = now - timedelta(minutes=28)
            db.commit()

        # Conversation 3: Bob & Charlie (15 messages)
        conv3, created3 = get_or_create_1v1(bob, charlie)
        if created3:
            print("Creating messages for Bob & Charlie conversation...")
            now = datetime.now(timezone.utc)
            messages_conv3 = [
                (bob, "Hey Charlie!", now - timedelta(days=2)),
                (charlie, "Hey Bob, what's up?", now - timedelta(days=2, hours=1)),
                (bob, "Are you working on the React components today?", now - timedelta(days=2, hours=2)),
                (charlie, "Yeah, coding the Sidebar and ConversationListItem components.", now - timedelta(days=2, hours=3)),
                (bob, "Sweet, can you make sure we format timestamps nicely?", now - timedelta(days=2, hours=4)),
                (charlie, "Yes, we have a helper to show 2:34 PM for today, 'Yesterday', and short dates.", now - timedelta(days=2, hours=5)),
                (bob, "Superb. What about the unread count badge?", now - timedelta(days=2, hours=6)),
                (charlie, "Done. Blue circle with white text.", now - timedelta(days=2, hours=7)),
                (bob, "Awesome! Love the Signal aesthetic.", now - timedelta(days=2, hours=8)),
                (charlie, "Me too. It's very clean and minimalist.", now - timedelta(days=2, hours=9)),
                (bob, "Hey, do you know how to run the seeds?", now - timedelta(hours=12)),
                (charlie, "Yes, python -m app.seed", now - timedelta(hours=11, minutes=50)),
                (bob, "Awesome, running it now.", now - timedelta(hours=11, minutes=45)),
                (charlie, "Let me know if you run into any issues.", now - timedelta(hours=10)),
                (bob, "Will do!", now - timedelta(hours=9)),
            ]
            for sender, content, ts in messages_conv3:
                msg = Message(conversation_id=conv3.id, sender_id=sender.id, content=content, created_at=ts)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                
                other_user = charlie if sender.id == bob.id else bob
                receipt = MessageReceipt(message_id=msg.id, user_id=other_user.id, status="read", updated_at=ts + timedelta(minutes=5))
                db.add(receipt)
                
            conv3.last_message_at = now - timedelta(hours=9)
            db.commit()

        # 4. Group Conversations
        # Group A: creator (Alice) + 2 admins (Bob, Charlie) + 2 members (David, Eva)
        group_a = db.query(Conversation).filter(Conversation.is_group == True, Conversation.name == "Signal Dev Team").first()
        if not group_a:
            print("Creating Group A: Signal Dev Team...")
            group_a = Conversation(is_group=True, name="Signal Dev Team")
            db.add(group_a)
            db.commit()
            db.refresh(group_a)
            
            # Add participants
            p_alice = ConversationParticipant(conversation_id=group_a.id, user_id=alice.id, role="creator")
            p_bob = ConversationParticipant(conversation_id=group_a.id, user_id=bob.id, role="admin")
            p_charlie = ConversationParticipant(conversation_id=group_a.id, user_id=charlie.id, role="admin")
            p_david = ConversationParticipant(conversation_id=group_a.id, user_id=david.id, role="member")
            p_eva = ConversationParticipant(conversation_id=group_a.id, user_id=eva.id, role="member")
            db.add_all([p_alice, p_bob, p_charlie, p_david, p_eva])
            db.commit()
            
            # Messages and system messages
            now = datetime.now(timezone.utc)
            group_a_events = [
                # (sender, content, type, ts)
                (None, "Alice Cooper created this group", "system", now - timedelta(days=3)),
                (None, "Alice Cooper added Bob Marley and Charlie Chaplin", "system", now - timedelta(days=3, hours=1)),
                (None, "Alice Cooper made Bob Marley an admin", "system", now - timedelta(days=3, hours=2)),
                (None, "Alice Cooper made Charlie Chaplin an admin", "system", now - timedelta(days=3, hours=3)),
                (alice, "Hey team, welcome to the dev group!", "text", now - timedelta(days=2)),
                (bob, "Thanks Alice! Excited to build this project.", "text", now - timedelta(days=2, hours=1)),
                (charlie, "Hey everyone!", "text", now - timedelta(days=2, hours=2)),
                (None, "Alice Cooper added David Beckham", "system", now - timedelta(days=1)),
                (alice, "David is joining us to help with CSS styling.", "text", now - timedelta(days=1, hours=1)),
                (david, "Hey guys! Happy to help.", "text", now - timedelta(days=1, hours=2)),
                (None, "Alice Cooper added Eva Longoria", "system", now - timedelta(hours=12)),
                (eva, "Hello! Nice to meet you all.", "text", now - timedelta(hours=11)),
                (alice, "Let's align on tasks in layout.tsx. Post updates here.", "text", now - timedelta(hours=2)),
            ]
            
            for sender, content, m_type, ts in group_a_events:
                msg = Message(
                    conversation_id=group_a.id,
                    sender_id=sender.id if sender else None,
                    content=content,
                    message_type=m_type,
                    created_at=ts
                )
                db.add(msg)
                db.commit()
                db.refresh(msg)
                
                # Add receipts for all active users
                active_users = [alice, bob, charlie, david, eva]
                for u in active_users:
                    if sender and u.id == sender.id:
                        continue
                    receipt = MessageReceipt(message_id=msg.id, user_id=u.id, status="read", updated_at=ts + timedelta(minutes=10))
                    db.add(receipt)
            
            group_a.last_message_at = now - timedelta(hours=2)
            db.commit()
            print("Group A seeded successfully.")

        # Group B: creator (Alice) + one left (Bob) + one removed (Charlie)
        group_b = db.query(Conversation).filter(Conversation.is_group == True, Conversation.name == "Old Project Group").first()
        if not group_b:
            print("Creating Group B: Old Project Group...")
            group_b = Conversation(is_group=True, name="Old Project Group")
            db.add(group_b)
            db.commit()
            db.refresh(group_b)
            
            now = datetime.now(timezone.utc)
            
            # Add participants
            # Alice: active creator
            p_alice = ConversationParticipant(conversation_id=group_b.id, user_id=alice.id, role="creator")
            # Bob: left (left_at set, removed_by_id None)
            p_bob = ConversationParticipant(
                conversation_id=group_b.id, 
                user_id=bob.id, 
                role="member",
                left_at=now - timedelta(days=1),
                removed_by_id=None
            )
            # Charlie: removed by Alice (left_at set, removed_by_id set to Alice's id)
            p_charlie = ConversationParticipant(
                conversation_id=group_b.id, 
                user_id=charlie.id, 
                role="member",
                left_at=now - timedelta(hours=6),
                removed_by_id=alice.id
            )
            # David: active member
            p_david = ConversationParticipant(conversation_id=group_b.id, user_id=david.id, role="member")
            
            db.add_all([p_alice, p_bob, p_charlie, p_david])
            db.commit()
            
            # Messages and system messages
            group_b_events = [
                (None, "Alice Cooper created this group", "system", now - timedelta(days=5)),
                (alice, "Starting the old workspace project.", "text", now - timedelta(days=4)),
                (bob, "I'm working on the design system layout.", "text", now - timedelta(days=4, hours=1)),
                (charlie, "I will write backend models.", "text", now - timedelta(days=4, hours=2)),
                (None, "Bob Marley left the group", "system", now - timedelta(days=1)),
                (alice, "Charlie, please stick to the guidelines.", "text", now - timedelta(hours=8)),
                (None, "Alice Cooper removed Charlie Chaplin", "system", now - timedelta(hours=6)),
                (alice, "David is joining us to clean up the backend.", "text", now - timedelta(hours=2)),
            ]
            
            for sender, content, m_type, ts in group_b_events:
                msg = Message(
                    conversation_id=group_b.id,
                    sender_id=sender.id if sender else None,
                    content=content,
                    message_type=m_type,
                    created_at=ts
                )
                db.add(msg)
                db.commit()
                db.refresh(msg)
                
                # Add receipts for users who were in the group at message time
                for u in [alice, bob, charlie, david]:
                    if sender and u.id == sender.id:
                        continue
                    receipt = MessageReceipt(message_id=msg.id, user_id=u.id, status="read", updated_at=ts + timedelta(minutes=5))
                    db.add(receipt)
            
            group_b.last_message_at = now - timedelta(hours=2)
            db.commit()
            print("Group B seeded successfully.")

        # Print Seed summary
        print("\n" + "="*50)
        print("SEEDING COMPLETE! Summary of 6 seeded users:")
        print("="*50)
        for u in users:
            print(f"Name: {u.display_name:<16} | Phone: {u.phone:<13} | OTP: 123456")
        print("="*50)
        
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()

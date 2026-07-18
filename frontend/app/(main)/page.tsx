"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import ChatHeader from "@/components/ChatHeader";
import MessageBubble from "@/components/MessageBubble";
import MessageInput from "@/components/MessageInput";
import { getAuthHeaders, formatMessageTime } from "@/utils/helpers";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/Avatar";
import GroupInfoPanel from "@/components/GroupInfoPanel";
import {
  MessageSquare,
  Phone,
  CircleDot,
  Laptop,
  Settings,
  LogOut,
  Lock,
  Bell,
  Palette,
  X,
  Sparkles,
  Wifi,
  WifiOff,
  UserCheck,
  ArrowLeft
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Message {
  id: number;
  content: string;
  isOutgoing: boolean;
  time: string;
  senderName?: string;
  messageType?: "text" | "system" | "image";
  receiptStatus?: "sending" | "sent" | "delivered" | "read";
  replyTo?: {
    id: number;
    sender_name: string;
    content_snippet: string;
  } | null;
  reactions?: { user_id: number; emoji: string }[];
}

interface Conversation {
  id: number;
  name: string;
  avatar_url: string | null;
  timestamp_formatted: string;
  unread_count: number;
  last_message: {
    content: string;
    sender_id: number | null;
    created_at: string;
  } | null;
  other_participant?: {
    id: number;
    status: string;
    last_seen: string | null;
    is_contact?: boolean;
    phone?: string;
  } | null;
  is_group: boolean;
  disappears_after_seconds?: number | null;
  membership?: {
    is_active: boolean;
    left_at: string | null;
    removed_by: { id: number; name: string } | null;
  } | null;
}

interface Toast {
  id: number;
  conversationId: number;
  title: string;
  content: string;
}

type MainView = "chats" | "calls" | "stories" | "devices" | "settings";
type SettingsSection = "privacy" | "notifications" | "appearance" | null;

export default function RootChatPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { sendMessage, sendTyping, markRead, status: wsStatus } = useWebSocket();

  // Navigation state
  const [currentView, setCurrentView] = useState<MainView>("chats");
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>(null);

  // Chat panel states
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);

  // Replies & scroll logic
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Typing indicators state: Record<conversationId, typistUserName>
  const [typingStatus, setTypingStatus] = useState<Record<number, string | null>>({});
  const typingTimeoutsRef = useRef<Record<number, NodeJS.Timeout>>({});

  // Toast notifications state
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Fetch all conversations
  const fetchConversations = useCallback(async (query = "") => {
    try {
      const url = query.trim()
        ? `${API}/conversations/search?q=${encodeURIComponent(query.trim())}`
        : `${API}/conversations/`;

      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) {
          document.cookie = "access_token=; path=/; max-age=0";
          window.location.href = "/";
          return;
        }
        const errorText = await res.text().catch(() => "");
        throw new Error(`Failed to fetch conversations: ${res.status} ${errorText}`);
      }
      const data = await res.json();

      // Format timestamps for display
      const formatted: Conversation[] = data.map((c: any) => ({
        ...c,
        timestamp_formatted: c.last_message
          ? formatMessageTime(c.last_message.created_at)
          : "",
      }));

      setConversations(formatted);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (convId: number) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${API}/conversations/${convId}/messages`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();

      const mapped: Message[] = data.map((m: any) => ({
        id: m.id,
        content: m.content,
        isOutgoing: m.sender ? m.sender.id === user?.id : false,
        time: formatMessageTime(m.created_at),
        senderName: m.sender ? m.sender.display_name : "System",
        messageType: m.message_type || "text",
        receiptStatus: m.receipt_status || "sent",
        replyTo: m.reply_to,
        reactions: m.reactions || []
      }));

      setMessages(mapped);
      
      // Mark as read after loading messages
      if (mapped.length > 0) {
        const incoming = mapped.filter((m) => !m.isOutgoing);
        if (incoming.length > 0) {
          const lastIncoming = incoming[incoming.length - 1];
          markRead(convId, lastIncoming.id);
        }
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    } finally {
      setLoadingMessages(false);
    }
  }, [user, markRead]);

  // Load conversations on query or mount
  useEffect(() => {
    if (!searchQuery.trim()) {
      fetchConversations();
      return;
    }

    const delayDebounce = setTimeout(() => {
      fetchConversations(searchQuery);
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, fetchConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when conversation is switched
  useEffect(() => {
    if (activeChatId !== null) {
      fetchMessages(activeChatId);
      // Reset unread count locally
      setConversations((prev) =>
        prev.map((c) => (c.id === activeChatId ? { ...c, unread_count: 0 } : c))
      );
    } else {
      setMessages([]);
    }
    setReplyingTo(null);
    setIsGroupInfoOpen(false); // Close group info when switching chats
  }, [activeChatId, fetchMessages]);

  // Handle container scrolling
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    setIsAutoScrollEnabled(isAtBottom);
  };

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Scroll when messages modify
  useEffect(() => {
    if (isAutoScrollEnabled && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isAutoScrollEnabled, scrollToBottom]);

  // WebSocket event listeners
  // 1. New Message
  useWebSocket("new_message", (data: any) => {
    const serverMsg = data.message;
    const convId = serverMsg.conversation_id || activeChatId; // fallback in case
    
    // Refresh conversation list to get latest message snippet and sort order
    fetchConversations(searchQuery);

    if (activeChatId === convId && currentView === "chats") {
      // Append incoming message or replace our optimistic one
      setMessages((prev) => {
        const isSelf = serverMsg.sender && serverMsg.sender.id === user?.id;
        
        if (isSelf) {
          // Replace our first "sending" optimistic message
          const sendingIndex = prev.findIndex((m) => m.receiptStatus === "sending");
          if (sendingIndex !== -1) {
            const updated = [...prev];
            updated[sendingIndex] = {
              id: serverMsg.id,
              content: serverMsg.content,
              isOutgoing: true,
              time: formatMessageTime(serverMsg.created_at),
              senderName: serverMsg.sender ? serverMsg.sender.display_name : "Me",
              receiptStatus: serverMsg.receipt_status || "sent",
              messageType: serverMsg.message_type || "text",
              replyTo: serverMsg.reply_to
            };
            return updated;
          }
        }
        
        // Prevent duplicate appending
        if (prev.some((m) => m.id === serverMsg.id)) {
          return prev;
        }

        // Add real new message
        return [
          ...prev,
          {
            id: serverMsg.id,
            content: serverMsg.content,
            isOutgoing: isSelf,
            time: formatMessageTime(serverMsg.created_at),
            senderName: serverMsg.sender ? serverMsg.sender.display_name : "System",
            messageType: serverMsg.sender ? "text" : "system",
            receiptStatus: serverMsg.receipt_status || "sent",
            replyTo: serverMsg.reply_to
          }
        ];
      });

      // Send read receipt if we are currently looking at this focused conversation
      if (document.hasFocus() && serverMsg.sender && serverMsg.sender.id !== user?.id) {
        markRead(convId, serverMsg.id);
      }
    } else {
      // Message is for another conversation - trigger Toast
      const isSelf = serverMsg.sender && serverMsg.sender.id === user?.id;
      if (!isSelf) {
        const senderName = serverMsg.sender ? serverMsg.sender.display_name : "System";
        const toastItem: Toast = {
          id: Date.now(),
          conversationId: convId,
          title: senderName,
          content: serverMsg.content
        };
        setToasts((prev) => [...prev, toastItem]);
        // Auto-remove toast after 4s
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toastItem.id));
        }, 4000);
      }
    }
  });

  // 2. Receipt Updates
  useWebSocket("receipt_update", (data: any) => {
    const { message_id, status } = data;
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === message_id ? { ...msg, receiptStatus: status } : msg
      )
    );
  });

  // 3. Typing events
  useWebSocket("typing", (data: any) => {
    const { conversation_id, user_name, is_typing } = data;
    if (is_typing) {
      setTypingStatus((prev) => ({ ...prev, [conversation_id]: user_name }));
      
      if (typingTimeoutsRef.current[conversation_id]) {
        clearTimeout(typingTimeoutsRef.current[conversation_id]);
      }
      
      typingTimeoutsRef.current[conversation_id] = setTimeout(() => {
        setTypingStatus((prev) => ({ ...prev, [conversation_id]: null }));
      }, 3000);
    } else {
      setTypingStatus((prev) => ({ ...prev, [conversation_id]: null }));
      if (typingTimeoutsRef.current[conversation_id]) {
        clearTimeout(typingTimeoutsRef.current[conversation_id]);
      }
    }
  });

  // 4. Presence update
  useWebSocket("presence_update", (data: any) => {
    const { user_id, status } = data;
    setConversations((prev) =>
      prev.map((c) => {
        if (!c.is_group && c.other_participant && c.other_participant.id === user_id) {
          return {
            ...c,
            other_participant: {
              id: c.other_participant.id,
              last_seen: c.other_participant.last_seen,
              status: status
            }
          };
        }
        return c;
      })
    );
  });

  // Mark read when focusing/opening window
  useEffect(() => {
    const handleFocus = () => {
      if (activeChatId !== null && messages.length > 0) {
        const incoming = messages.filter((m) => !m.isOutgoing);
        if (incoming.length > 0) {
          const lastIncoming = incoming[incoming.length - 1];
          markRead(activeChatId, lastIncoming.id);
        }
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [activeChatId, messages, markRead]);

  // 4. Reaction Added
  useWebSocket("reaction_added", (data: any) => {
    if (activeChatId === data.conversation_id) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === data.message_id) {
            const reactions = m.reactions || [];
            // Add if not exists
            if (!reactions.some((r) => r.user_id === data.user_id && r.emoji === data.emoji)) {
              return { ...m, reactions: [...reactions, { user_id: data.user_id, emoji: data.emoji }] };
            }
          }
          return m;
        })
      );
    }
  });

  // 5. Reaction Removed
  useWebSocket("reaction_removed", (data: any) => {
    if (activeChatId === data.conversation_id) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === data.message_id) {
            const reactions = m.reactions || [];
            return {
              ...m,
              reactions: reactions.filter((r) => !(r.user_id === data.user_id && r.emoji === data.emoji)),
            };
          }
          return m;
        })
      );
    }
  });

  // Send message function (Optimistic Send)
  const handleSendMessage = async (text: string) => {
    if (activeChatId === null) return;

    const tempId = Date.now();
    const now = new Date();
    
    // Build optimistic message
    const optimisticMsg: Message = {
      id: tempId,
      content: text,
      isOutgoing: true,
      time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      senderName: "Me",
      messageType: "text",
      receiptStatus: "sending",
      replyTo: replyingTo ? {
        id: replyingTo.id,
        sender_name: replyingTo.senderName || "Unknown",
        content_snippet: replyingTo.content.substring(0, 60),
      } : null
    };

    // Append locally
    setMessages((prev) => [...prev, optimisticMsg]);
    setIsAutoScrollEnabled(true);

    // Send via WebSocket
    sendMessage(activeChatId, text, replyingTo?.id);
    
    // Clear reply state
    setReplyingTo(null);
  };



  const handleAddReaction = async (msgId: number, emoji: string) => {
    if (activeChatId === null) return;
    try {
      await fetch(`${API}/conversations/${activeChatId}/messages/${msgId}/reactions`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emoji }),
      });
    } catch (err) {
      console.error("Failed to add reaction", err);
    }
  };

  const handleRemoveReaction = async (msgId: number, emoji: string) => {
    if (activeChatId === null) return;
    try {
      await fetch(`${API}/conversations/${activeChatId}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.error("Failed to remove reaction", err);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (activeChatId === null) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = document.cookie.match(/(?:^|; )access_token=([^;]*)/)?.[1];
      await fetch(`${API}/conversations/${activeChatId}/messages/image`, {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: formData,
      });
    } catch (err) {
      console.error("Failed to upload image", err);
    }
  };

  const handleAddUnknownContact = async (phone: string) => {
    try {
      const res = await fetch(`${API}/contacts/`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone })
      });
      if (res.ok) {
        fetchConversations(searchQuery);
      }
    } catch (err) {
      console.error("Failed to add unknown contact", err);
    }
  };
  
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Reply/Quote scrolling action
  const handleReplyClick = (id: number) => {
    const element = document.getElementById(`message-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("bg-blue-500/20", "dark:bg-[#3A76F0]/20", "glow-pulse");
      setTimeout(() => {
        element.classList.remove("bg-blue-500/20", "dark:bg-[#3A76F0]/20", "glow-pulse");
      }, 1500);
    }
  };

  const handleConversationCreated = (id: number) => {
    setActiveChatId(id);
    setCurrentView("chats");
    fetchConversations();
  };

  const selectedChat = activeChatId !== null ? conversations.find((c) => c.id === activeChatId) : null;
  const isParticipantActive = selectedChat?.is_group
    ? selectedChat.membership?.is_active ?? true
    : true;

  return (
    <main className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      
      {/* Toast Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => {
              setActiveChatId(t.conversationId);
              setCurrentView("chats");
              setToasts((prev) => prev.filter((item) => item.id !== t.id));
            }}
            className="bg-sidebar-bg border border-border-color text-text-primary px-4.5 py-3 rounded-xl shadow-2xl flex flex-col cursor-pointer hover:bg-input-bg transition-all w-72 animate-slide-in relative select-none"
          >
            <div className="flex justify-between items-start gap-2">
              <span className="font-semibold text-[13.5px] truncate">{t.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts((prev) => prev.filter((item) => item.id !== t.id));
                }}
                className="text-text-secondary hover:text-text-primary transition-colors text-[10px] w-4 h-4 flex items-center justify-center bg-black/30 rounded-full"
              >
                ✕
              </button>
            </div>
            <span className="text-text-secondary text-xs truncate mt-1">{t.content}</span>
          </div>
        ))}
      </div>

      {/* 1. Left-most Narrow Vertical Navigation Bar */}
      <div className="w-[68px] h-full bg-nav-sidebar-bg border-r border-border-color flex flex-col items-center justify-between py-4 flex-shrink-0 select-none">
        
        {/* Top: Profile Avatar */}
        <button
          onClick={() => {
            setCurrentView("settings");
            setActiveSettingsSection("appearance");
          }}
          className="relative group outline-none"
          title="Profile & Settings"
        >
          <Avatar src={user?.avatar_url || null} name={user?.display_name || ""} size={10} className="border-2 border-border-color group-hover:border-blue-500 transition-all cursor-pointer" />
          <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-nav-sidebar-bg" />
        </button>

        {/* Middle Navigation Tabs */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => setCurrentView("chats")}
            className={`p-3 rounded-xl transition-all duration-200 ${
              currentView === "chats"
                ? "bg-[#3A76F0] text-white"
                : "text-text-secondary hover:bg-input-bg hover:text-text-primary"
            }`}
            title="Chats"
          >
            <MessageSquare className="w-5.5 h-5.5" />
          </button>
          
          <button
            onClick={() => setCurrentView("calls")}
            className={`p-3 rounded-xl transition-all duration-200 ${
              currentView === "calls"
                ? "bg-[#3A76F0] text-white"
                : "text-text-secondary hover:bg-input-bg hover:text-text-primary"
            }`}
            title="Calls"
          >
            <Phone className="w-5.5 h-5.5" />
          </button>

          <button
            onClick={() => setCurrentView("stories")}
            className={`p-3 rounded-xl transition-all duration-200 ${
              currentView === "stories"
                ? "bg-[#3A76F0] text-white"
                : "text-text-secondary hover:bg-input-bg hover:text-text-primary"
            }`}
            title="Stories"
          >
            <CircleDot className="w-5.5 h-5.5" />
          </button>

          <button
            onClick={() => setCurrentView("devices")}
            className={`p-3 rounded-xl transition-all duration-200 ${
              currentView === "devices"
                ? "bg-[#3A76F0] text-white"
                : "text-text-secondary hover:bg-input-bg hover:text-text-primary"
            }`}
            title="Linked Devices"
          >
            <Laptop className="w-5.5 h-5.5" />
          </button>
        </div>

        {/* Bottom: Settings & Logout */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-center mb-1" title={
            wsStatus === "connected" ? "Connected" : wsStatus === "connecting" ? "Connecting..." : "Disconnected"
          }>
            {wsStatus === "connected" ? (
              <Wifi className="w-4.5 h-4.5 text-green-500" />
            ) : wsStatus === "connecting" ? (
              <Wifi className="w-4.5 h-4.5 text-yellow-500 animate-pulse" />
            ) : (
              <WifiOff className="w-4.5 h-4.5 text-red-500" />
            )}
          </div>

          <button
            onClick={() => {
              setCurrentView("settings");
              setActiveSettingsSection("appearance");
            }}
            className={`p-3 rounded-xl transition-all duration-200 ${
              currentView === "settings"
                ? "bg-[#3A76F0] text-white"
                : "text-text-secondary hover:bg-input-bg hover:text-text-primary"
            }`}
            title="Settings"
          >
            <Settings className="w-5.5 h-5.5" />
          </button>

          <button
            onClick={logout}
            className="p-3 text-text-secondary hover:bg-red-950/20 hover:text-red-500 rounded-xl transition-all duration-200"
            title="Log Out"
          >
            <LogOut className="w-5.5 h-5.5" />
          </button>
        </div>

      </div>

      {/* 2. Middle Panel: Depends on navigation */}
      <div
        className={`w-full md:w-[320px] lg:w-[380px] h-full flex-shrink-0 ${
          (currentView === "chats" && activeChatId !== null) ||
          (currentView === "settings" && activeSettingsSection !== null) ? "hidden md:block" : "block"
        }`}
      >
        
        {currentView === "chats" && (
          <Sidebar
            activeId={activeChatId}
            onSelect={(id) => setActiveChatId(id)}
            conversations={conversations}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onConversationCreated={handleConversationCreated}
            onLogout={logout}
          />
        )}

        {currentView === "calls" && (
          <div className="w-full h-full flex flex-col bg-sidebar-bg border-r border-border-color p-4">
            <h2 className="text-xl font-bold text-text-primary mb-4 select-none">Calls</h2>
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <Phone className="w-8 h-8 text-text-secondary mb-2" />
              <p className="text-sm font-medium text-text-primary">No recent calls</p>
            </div>
          </div>
        )}

        {currentView === "stories" && (
          <div className="w-full h-full flex flex-col bg-sidebar-bg border-r border-border-color p-4">
            <h2 className="text-xl font-bold text-text-primary mb-4 select-none">Stories</h2>
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <CircleDot className="w-8 h-8 text-text-secondary mb-2" />
              <p className="text-sm font-medium text-text-primary">No stories found</p>
            </div>
          </div>
        )}

        {currentView === "devices" && (
          <div className="w-full h-full flex flex-col bg-sidebar-bg border-r border-border-color p-4">
            <h2 className="text-xl font-bold text-text-primary mb-4 select-none">Devices</h2>
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <Laptop className="w-8 h-8 text-text-secondary mb-2" />
              <p className="text-sm font-medium text-text-primary">Linked Devices</p>
            </div>
          </div>
        )}

        {currentView === "settings" && (
          <div className="w-full h-full flex flex-col bg-sidebar-bg border-r border-border-color">
            <div className="p-4 border-b border-border-color">
              <h2 className="text-xl font-bold text-text-primary select-none">Settings</h2>
            </div>
            
            <div className="flex-1 p-2 space-y-1 overflow-y-auto">
              <button
                onClick={() => setActiveSettingsSection("appearance")}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left ${
                  activeSettingsSection === "appearance"
                    ? "bg-input-bg text-text-primary"
                    : "text-text-secondary hover:bg-input-bg/50 hover:text-text-primary"
                }`}
              >
                <Palette className="w-5 h-5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Appearance</p>
                </div>
              </button>

              <button
                onClick={() => setActiveSettingsSection("privacy")}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left ${
                  activeSettingsSection === "privacy"
                    ? "bg-input-bg text-text-primary"
                    : "text-text-secondary hover:bg-input-bg/50 hover:text-text-primary"
                }`}
              >
                <Lock className="w-5 h-5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Privacy</p>
                </div>
              </button>

              <button
                onClick={() => setActiveSettingsSection("notifications")}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left ${
                  activeSettingsSection === "notifications"
                    ? "bg-input-bg text-text-primary"
                    : "text-text-secondary hover:bg-input-bg/50 hover:text-text-primary"
                }`}
              >
                <Bell className="w-5 h-5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Notifications</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Right main detail pane */}
      <div
        className={`flex-1 flex flex-col h-full bg-chat-bg relative ${
          (currentView === "chats" && activeChatId === null) ||
          (currentView === "settings" && activeSettingsSection === null) ? "hidden md:flex" : "flex"
        }`}
      >
        
        {currentView === "chats" && (
          selectedChat ? (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0">
                <ChatHeader
                  name={selectedChat.name}
                  avatar={selectedChat.avatar_url}
                  status={
                    typingStatus[selectedChat.id]
                      ? `${typingStatus[selectedChat.id]} is typing...`
                      : selectedChat.is_group 
                      ? `${selectedChat.membership?.is_active ? "Active" : "Inactive"} Group` 
                      : selectedChat.other_participant?.status || "offline"
                  }
                  isGroup={selectedChat.is_group}
                  disappearsAfterSeconds={selectedChat.disappears_after_seconds}
                  onClick={selectedChat.is_group ? () => setIsGroupInfoOpen(true) : undefined}
                  onBack={() => setActiveChatId(null)}
                />

                {!selectedChat.is_group && selectedChat.other_participant && selectedChat.other_participant.is_contact === false && (
                  <div className="bg-sidebar-bg border-b border-border-color p-3 flex items-center justify-between shadow-sm z-10 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-text-primary">Sender not in contacts</span>
                        <span className="text-xs text-text-secondary">{selectedChat.other_participant.phone}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        if (selectedChat.other_participant?.phone) {
                          handleAddUnknownContact(selectedChat.other_participant.phone);
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer shrink-0 ml-4"
                    >
                      Add to Contacts
                    </button>
                  </div>
                )}

                {wsStatus !== "connected" && (
                  <div className="bg-yellow-100 dark:bg-yellow-950/20 border-b border-yellow-200 dark:border-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs py-2 px-4 text-center font-medium animate-pulse flex items-center justify-center gap-1.5 select-none shrink-0">
                    <WifiOff className="w-3.5 h-3.5" />
                    {wsStatus === "connecting"
                      ? "Connecting to server..."
                      : "Connection lost. Attempting to reconnect..."}
                  </div>
                )}

                <div
                  ref={messagesContainerRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto p-4 md:p-6 bg-chat-bg space-y-1.5"
                >
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full text-text-secondary text-sm">
                      Loading messages...
                    </div>
                  ) : messages.length > 0 ? (
                    messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        id={msg.id}
                        content={msg.content}
                        isOutgoing={msg.isOutgoing}
                        time={msg.time}
                        messageType={msg.messageType}
                        receiptStatus={msg.receiptStatus}
                        replyTo={msg.replyTo}
                        onReplyAction={
                          isParticipantActive
                            ? () => setReplyingTo(msg)
                            : undefined
                        }
                        onReplyClick={handleReplyClick}
                        isTyping={false}
                        systemMessage={msg.messageType === "system"}
                        showSenderName={selectedChat?.is_group && !msg.isOutgoing}
                        reactions={msg.reactions}
                        currentUserId={user?.id}
                        onAddReaction={handleAddReaction}
                        onRemoveReaction={handleRemoveReaction}
                        onImageClick={(url) => setFullscreenImage(url)}
                      />
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-full text-text-secondary text-sm">
                      No messages yet. Say hello!
                    </div>
                  )}
                  <div ref={messageEndRef} />
                </div>

                <MessageInput
                  onSendMessage={handleSendMessage}
                  onImageUpload={handleImageUpload}
                  onTyping={(isTyping) => activeChatId !== null && sendTyping(activeChatId, isTyping)}
                  replyingTo={
                    replyingTo
                      ? {
                          id: replyingTo.id,
                          sender_name: replyingTo.senderName || "Unknown",
                          content_snippet: replyingTo.content,
                        }
                      : null
                  }
                  onCancelReply={() => setReplyingTo(null)}
                  isParticipantActive={isParticipantActive}
                  removedBy={selectedChat.membership?.removed_by}
                />
              </div>

              {isGroupInfoOpen && selectedChat && selectedChat.is_group && (
                <div className="flex flex-col flex-shrink-0 z-20 absolute right-0 inset-y-0 shadow-2xl transition-transform transform translate-x-0 w-full md:w-auto">
                  <GroupInfoPanel
                    conversationId={selectedChat.id}
                    initialTimer={selectedChat.disappears_after_seconds}
                    onClose={() => setIsGroupInfoOpen(false)}
                    onTimerChange={(val) => {
                      setConversations(prev => prev.map(c => c.id === selectedChat.id ? { ...c, disappears_after_seconds: val } : c));
                    }}
                    onLeaveGroup={() => {
                      setIsGroupInfoOpen(false);
                      fetchConversations(searchQuery);
                      setActiveChatId(null);
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 bg-chat-bg">
              <div className="w-20 h-20 bg-input-bg rounded-3xl mb-4 flex items-center justify-center text-text-secondary border border-border-color shadow-sm">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-[16px] font-semibold text-text-primary mb-1">
                Select a chat to start messaging
              </h3>
            </div>
          )
        )}

        {currentView === "settings" && (
          <div className="flex-1 bg-chat-bg overflow-y-auto p-6 md:p-10 select-none">
            
            {/* Empty State on Desktop */}
            {activeSettingsSection === null && (
              <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center h-full">
                <div className="w-20 h-20 bg-input-bg rounded-3xl mb-4 flex items-center justify-center text-text-secondary border border-border-color shadow-sm">
                  <Settings className="w-8 h-8" />
                </div>
                <h3 className="text-[16px] font-semibold text-text-primary mb-1">
                  Select a setting to view details
                </h3>
              </div>
            )}

            {activeSettingsSection && (
              <div className="md:hidden mb-6">
                <button
                  onClick={() => setActiveSettingsSection(null)}
                  className="flex items-center text-blue-500 font-medium text-sm gap-1 hover:text-blue-600 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" /> Back to Settings
                </button>
              </div>
            )}

            {activeSettingsSection === "appearance" && (
              <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
                <div>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <Palette className="w-5 h-5 text-blue-500" />
                    Appearance Settings
                  </h3>
                </div>
                <div className="p-4 bg-sidebar-bg/60 border border-border-color rounded-2xl shadow-sm flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">Application Theme</h4>
                    <p className="text-xs text-text-secondary mt-1">Switch between light and dark modes.</p>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="relative inline-flex h-6.5 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-blue-500/80 transition-colors duration-200 ease-in-out focus:outline-none"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        theme === "dark" ? "translate-x-5.5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {activeSettingsSection === "privacy" && (
              <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
                <div>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <Lock className="w-5 h-5 text-blue-500" />
                    Privacy Settings
                  </h3>
                </div>
                
                <div className="space-y-3">
                  <div className="p-4 bg-sidebar-bg/60 border border-border-color rounded-2xl shadow-sm flex items-center justify-between gap-4 opacity-70">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">Read Receipts</h4>
                      <p className="text-xs text-text-secondary mt-1">Let others know when you have read their messages.</p>
                    </div>
                    <button className="relative inline-flex h-6.5 w-12 flex-shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-500/50 transition-colors duration-200 ease-in-out focus:outline-none">
                      <span className="pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out translate-x-5.5" />
                    </button>
                  </div>

                  <div className="p-4 bg-sidebar-bg/60 border border-border-color rounded-2xl shadow-sm flex items-center justify-between gap-4 opacity-70">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">Typing Indicators</h4>
                      <p className="text-xs text-text-secondary mt-1">Show when you are typing a message.</p>
                    </div>
                    <button className="relative inline-flex h-6.5 w-12 flex-shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-500/50 transition-colors duration-200 ease-in-out focus:outline-none">
                      <span className="pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out translate-x-5.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSettingsSection === "notifications" && (
              <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
                <div>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-500" />
                    Notification Settings
                  </h3>
                </div>
                
                <div className="space-y-3">
                  <div className="p-4 bg-sidebar-bg/60 border border-border-color rounded-2xl shadow-sm flex items-center justify-between gap-4 opacity-70">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">Message Notifications</h4>
                      <p className="text-xs text-text-secondary mt-1">Show alerts for new messages.</p>
                    </div>
                    <button className="relative inline-flex h-6.5 w-12 flex-shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-500/50 transition-colors duration-200 ease-in-out focus:outline-none">
                      <span className="pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out translate-x-5.5" />
                    </button>
                  </div>

                  <div className="p-4 bg-sidebar-bg/60 border border-border-color rounded-2xl shadow-sm flex items-center justify-between gap-4 opacity-70">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">Sound</h4>
                      <p className="text-xs text-text-secondary mt-1">Play sounds for incoming messages.</p>
                    </div>
                    <button className="relative inline-flex h-6.5 w-12 flex-shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-500/50 transition-colors duration-200 ease-in-out focus:outline-none">
                      <span className="pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out translate-x-5.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(currentView === "calls" || currentView === "stories" || currentView === "devices") && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-chat-bg select-none text-center">
            <div className="w-24 h-24 bg-sidebar-bg rounded-full flex items-center justify-center border border-border-color text-blue-500 shadow-md mb-6 relative animate-bounce">
              {currentView === "calls" && <Phone className="w-10 h-10" />}
              {currentView === "stories" && <CircleDot className="w-10 h-10" />}
              {currentView === "devices" && <Laptop className="w-10 h-10" />}
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">
              Coming soon
            </h3>
          </div>
        )}

        {/* Fullscreen Image Viewer */}
        {fullscreenImage && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
            <button
              onClick={() => setFullscreenImage(null)}
              className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img src={fullscreenImage} className="max-w-full max-h-full object-contain" alt="Fullscreen" />
          </div>
        )}
      </div>
    </main>
  );
}

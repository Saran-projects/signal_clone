import React, { useState, useEffect } from "react";
import { Search, SquarePen, UserPlus, X, Loader2, Users, LogOut } from "lucide-react";
import ConversationListItem from "./ConversationListItem";
import Avatar from "./Avatar";
import NewGroupModal from "./NewGroupModal";
import { getAuthHeaders } from "@/utils/helpers";

const API = "http://localhost:8000";

const COUNTRY_CODES = [
  { label: "🇺🇸 +1",  value: "+1" },
  { label: "🇬🇧 +44", value: "+44" },
  { label: "🇮🇳 +91", value: "+91" },
  { label: "🇨🇦 +1",  value: "+1" },
  { label: "🇦🇺 +61", value: "+61" },
  { label: "🇩🇪 +49", value: "+49" },
  { label: "🇫🇷 +33", value: "+33" },
  { label: "🇧🇷 +55", value: "+55" },
];

interface SidebarProps {
  activeId: number | null;
  onSelect: (id: number) => void;
  conversations: any[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onConversationCreated: (id: number) => void;
  onLogout?: () => void;
}

interface Contact {
  id: number;
  display_name: string;
  avatar_url: string | null;
  status: string;
  phone?: string; // We'll need the phone to create a conversation
}

export default function Sidebar({
  activeId,
  onSelect,
  conversations,
  searchQuery,
  onSearchChange,
  onConversationCreated,
  onLogout,
}: SidebarProps) {
  // Modal states
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isNewConvOpen, setIsNewConvOpen] = useState(false);

  // Form & Loader states
  const [addCountryCode, setAddCountryCode] = useState("+91");
  const [addPhone, setAddPhone] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Show Toast helper
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch contacts on modal open
  useEffect(() => {
    if (isNewConvOpen) {
      setLoadingContacts(true);
      fetch(`${API}/contacts`, { headers: getAuthHeaders() })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch contacts");
          return res.json();
        })
        .then((data) => {
          setContacts(data);
        })
        .catch(() => {
          showToast("Failed to load contacts", "error");
        })
        .finally(() => {
          setLoadingContacts(false);
        });
    }
  }, [isNewConvOpen]);

  // Handle Add Contact
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addPhone.trim()) return;

    setAddingContact(true);
    try {
      const fullPhone = `${addCountryCode}${addPhone.trim()}`;
      const res = await fetch(`${API}/contacts/`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ phone: fullPhone }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to add contact");
      }

      showToast("Contact added successfully!", "success");
      setAddPhone("");
      setIsAddContactOpen(false);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setAddingContact(false);
    }
  };

  // Handle Select Contact for New Conversation
  const handleSelectContact = async (contact: Contact) => {
    try {
      // We need the phone of the contact user
      if (!contact.phone) {
        throw new Error("Contact phone is missing");
      }

      const res = await fetch(`${API}/conversations/`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ participant_phone: contact.phone }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to start conversation");
      }

      // Navigates to the result (existing or new)
      onConversationCreated(data.id);
      setIsNewConvOpen(false);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-sidebar-bg border-r border-border-color relative">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-lg transition-all duration-300 transform translate-y-0 ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Sidebar Header */}
      <div className="p-4 flex items-center justify-between gap-3 flex-shrink-0 select-none">
        <h1 className="text-xl font-bold text-text-primary tracking-wide">Chats</h1>
        <div className="flex items-center gap-1">
          {/* Add Contact Icon */}
          <button
            onClick={() => setIsAddContactOpen(true)}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-input-bg rounded-xl transition-all duration-200"
            title="Add Contact"
          >
            <UserPlus className="w-5 h-5" />
          </button>
          {/* New Group Icon */}
          <button
            onClick={() => setIsNewGroupOpen(true)}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-input-bg rounded-xl transition-all duration-200"
            title="New Group"
          >
            <Users className="w-5 h-5" />
          </button>
          {/* New Conversation Icon */}
          <button
            onClick={() => setIsNewConvOpen(true)}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-input-bg rounded-xl transition-all duration-200"
            title="New Conversation"
          >
            <SquarePen className="w-5 h-5" />
          </button>
          {/* Logout Icon (visible mainly on mobile where sidebar is hidden) */}
          <button
            onClick={onLogout}
            className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-950/20 rounded-xl transition-all duration-200"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="relative flex items-center bg-input-bg rounded-xl focus-within:bg-input-bg/80 transition-colors duration-200">
          <Search className="absolute left-3 w-4 h-4 text-text-secondary pointer-events-none" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent text-text-primary text-[14px] rounded-xl pl-9 pr-4 py-2 outline-none placeholder-text-secondary/50"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-1 py-1 space-y-1">
        {conversations.length > 0 ? (
          conversations.map((conv) => (
            <ConversationListItem
              key={conv.id}
              id={conv.id}
              name={conv.name}
              avatar={conv.avatar_url}
              lastMessage={conv.last_message?.content || "No messages yet"}
              timestamp={conv.timestamp_formatted || ""}
              unreadCount={conv.unread_count}
              status={conv.other_participant?.status || "offline"}
              active={activeId === conv.id}
              onClick={() => onSelect(conv.id)}
            />
          ))
        ) : (
          <div className="text-center text-gray-500 text-sm mt-8">
            No conversations found
          </div>
        )}
      </div>

      {/* Conversations List */}

      {/* Add Contact Modal Inline */}
      {isAddContactOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-sidebar-bg border border-border-color rounded-2xl w-full max-w-xs p-6 relative shadow-2xl">
            <button onClick={() => setIsAddContactOpen(false)} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-[17px] font-semibold text-white mb-4">Add Contact</h3>
            <form onSubmit={handleAddContact} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                  PHONE NUMBER
                </label>
                <div className="flex gap-2">
                  <select
                    value={addCountryCode}
                    onChange={(e) => setAddCountryCode(e.target.value)}
                    className="shrink-0 bg-input-bg text-text-primary rounded-xl px-3 py-2.5 text-sm outline-none border border-border-color focus:border-blue-500 transition-colors"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.label} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value.replace(/\D/g, ""))}
                    className="flex-1 min-w-0 bg-input-bg border border-border-color focus:border-blue-500 text-text-primary text-sm rounded-xl px-4.5 py-2.5 outline-none placeholder-text-secondary/70 transition-all"
                    maxLength={10}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={addingContact}
                className="w-full bg-[#3A76F0] hover:bg-[#2F6EE5] text-white text-sm font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {addingContact ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Contact"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* New Conversation Modal (Search Contacts) */}
      {isNewConvOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex md:items-center justify-center pt-20 md:pt-0 pb-0 md:p-4">
          <div className="bg-sidebar-bg border-t md:border border-border-color rounded-t-2xl md:rounded-2xl w-full md:max-w-sm md:mx-auto max-h-[80%] flex flex-col relative shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-border-color flex items-center justify-between shrink-0">
              <h3 className="text-base font-semibold text-text-primary">New Chat</h3>
              <button onClick={() => setIsNewConvOpen(false)} className="text-text-secondary hover:text-text-primary p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contacts List */}
            <div className="flex-1 overflow-y-auto p-2 min-h-[250px]">
              {loadingContacts ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500 text-sm">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  Loading contacts...
                </div>
              ) : contacts.length > 0 ? (
                contacts.map((contact) => {
                  const initials = contact.display_name
                    ? contact.display_name.substring(0, 2).toUpperCase()
                    : "?";
                  return (
                    <div
                      key={contact.id}
                      onClick={() => handleSelectContact(contact)}
                      className="flex items-center gap-3 p-3.5 cursor-pointer rounded-xl hover:bg-input-bg text-text-primary transition-all select-none"
                    >
                      <div className="relative">
                        {contact.avatar_url ? (
                          <Avatar src={contact.avatar_url} name={contact.display_name} size={10} className="cursor-pointer hover:opacity-80 transition-opacity" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-[13px] font-bold">
                            {initials}
                          </div>
                        )}
                        {contact.status === "online" && (
                          <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-sidebar-bg" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[14px] font-medium truncate text-text-primary">
                          {contact.display_name}
                        </h4>
                        <p className="text-xs text-text-secondary truncate">{contact.phone}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-text-secondary text-sm py-10">
                  No contacts found. Please add contacts first.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {isNewGroupOpen && (
        <NewGroupModal
          onClose={() => setIsNewGroupOpen(false)}
          onSuccess={(convId) => {
            setIsNewGroupOpen(false);
            onConversationCreated(convId);
          }}
        />
      )}
    </div>
  );
}

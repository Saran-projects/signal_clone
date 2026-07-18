import React, { useState, useEffect } from "react";
import { X, Loader2, Users } from "lucide-react";
import Avatar from "./Avatar";
import { getAuthHeaders } from "@/utils/helpers";

const API = "http://localhost:8000";

interface NewGroupModalProps {
  onClose: () => void;
  onSuccess: (conversationId: number) => void;
}

interface Contact {
  id: number;
  display_name: string;
  avatar_url: string | null;
  status: string;
  phone: string;
}

export default function NewGroupModal({ onClose, onSuccess }: NewGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/contacts`, { headers: getAuthHeaders() })
      .then((res) => res.json())
      .then((data) => {
        setContacts(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load contacts", err);
        setError("Failed to load contacts");
        setLoading(false);
      });
  }, []);

  const toggleContact = (phone: string) => {
    const next = new Set(selectedPhones);
    if (next.has(phone)) {
      next.delete(phone);
    } else {
      next.add(phone);
    }
    setSelectedPhones(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedPhones.size === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API}/conversations/group`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: groupName.trim(),
          member_phones: Array.from(selectedPhones),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create group");

      onSuccess(data.id);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-sidebar-bg border border-border-color rounded-2xl w-full max-w-md p-6 relative shadow-2xl flex flex-col max-h-[85vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-secondary hover:text-text-primary"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="text-[19px] font-semibold text-text-primary">New Group</h3>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700/50 text-red-400 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="mb-5">
            <label className="block text-xs text-text-secondary mb-1.5 font-medium uppercase tracking-wider">
              Group Name
            </label>
            <input
              type="text"
              placeholder="e.g. Weekend Trip"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full bg-input-bg border border-transparent focus:border-blue-500 text-text-primary text-sm rounded-xl px-4.5 py-3 outline-none placeholder-gray-500 transition-all"
              required
              maxLength={50}
            />
          </div>

          <label className="block text-xs text-text-secondary mb-2 font-medium uppercase tracking-wider">
            Select Members ({selectedPhones.size})
          </label>
          
          <div className="flex-1 overflow-y-auto mb-5 -mx-2 px-2 space-y-1 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-text-secondary animate-spin" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center text-text-secondary text-sm py-8">
                No contacts available. Add contacts first!
              </div>
            ) : (
              contacts.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => contact.phone && toggleContact(contact.phone)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                    selectedPhones.has(contact.phone) ? "bg-border-color/50" : "hover:bg-border-color/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar src={contact.avatar_url} name={contact.display_name} size={10} />
                    <div>
                      <div className="text-[14.5px] font-medium text-text-primary">{contact.display_name}</div>
                      <div className="text-[12px] text-text-secondary">{contact.phone}</div>
                    </div>
                  </div>
                  
                  {/* Custom Checkbox */}
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                    selectedPhones.has(contact.phone) ? "bg-blue-500 border-blue-500" : "border-border-color"
                  }`}>
                    {selectedPhones.has(contact.phone) && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || !groupName.trim() || selectedPhones.size === 0}
            className="w-full bg-[#3A76F0] hover:bg-[#2F6EE5] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14.5px] font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Group"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

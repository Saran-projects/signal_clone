import React, { useState, useEffect } from "react";
import { X, Crown, Shield, UserMinus, ShieldAlert, ShieldCheck, UserPlus, LogOut, Loader2 } from "lucide-react";
import Avatar from "./Avatar";
import { getAuthHeaders } from "@/utils/helpers";
import { useAuth } from "@/context/AuthContext";

const API = "http://localhost:8000";

interface GroupMember {
  user_id: number;
  display_name: string;
  phone: string;
  avatar_url: string | null;
  status: string;
  role: "creator" | "admin" | "member";
  joined_at: string;
}

interface GroupInfoPanelProps {
  conversationId: number;
  initialTimer?: number | null;
  onClose: () => void;
  onLeaveGroup: () => void;
  onTimerChange?: (seconds: number | null) => void;
}

export default function GroupInfoPanel({ conversationId, initialTimer, onClose, onLeaveGroup, onTimerChange }: GroupInfoPanelProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Member Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchMembers = () => {
    setLoading(true);
    fetch(`${API}/conversations/${conversationId}/members`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch members");
        return res.json();
      })
      .then((data) => {
        setMembers(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const me = members.find((m) => m.user_id === user?.id);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addPhone.trim()) return;
    setAdding(true);
    setAddError(null);

    try {
      const res = await fetch(`${API}/conversations/${conversationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ phone: addPhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to add member");
      
      setIsAddOpen(false);
      setAddPhone("");
      fetchMembers(); // refresh
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: number) => {
    if (!confirm("Remove this member from the group?")) return;
    try {
      const res = await fetch(`${API}/conversations/${conversationId}/members/${userId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to remove");
      fetchMembers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateRole = async (userId: number, role: "admin" | "member") => {
    if (!confirm(`Make this user ${role === "admin" ? "an admin" : "a regular member"}?`)) return;
    try {
      const res = await fetch(`${API}/conversations/${conversationId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      fetchMembers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLeave = async () => {
    if (!confirm("Are you sure you want to leave this group?")) return;
    try {
      const res = await fetch(`${API}/conversations/${conversationId}/leave`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to leave");
      onLeaveGroup();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="absolute top-0 right-0 w-full md:w-[320px] lg:w-[380px] h-full bg-sidebar-bg border-l border-border-color flex flex-col shadow-xl z-30 animate-slide-in flex-shrink-0">
      <div className="h-16 border-b border-border-color flex items-center justify-between px-4 bg-sidebar-bg flex-shrink-0">
        <h2 className="text-[15px] font-semibold text-text-primary">Group Info</h2>
        <button onClick={onClose} className="p-2 text-text-secondary hover:text-text-primary hover:bg-input-bg rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
          </div>
        ) : error ? (
          <div className="text-red-400 text-sm text-center py-4">{error}</div>
        ) : (
          <>
            {/* Members Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Members ({members.length})
                </h3>
                {me && (me.role === "creator" || me.role === "admin") && (
                  <button
                    onClick={() => setIsAddOpen(true)}
                    className="text-blue-500 hover:bg-blue-500/10 p-1.5 rounded-full transition-colors"
                    title="Add Member"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Timer Setting (Visible to Admin/Creator) */}
              {me && (me.role === "creator" || me.role === "admin") && (
                <div className="flex items-center justify-between mb-4 px-2 py-3 bg-input-bg/50 border border-border-color rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">Disappearing msgs</span>
                  </div>
                  <select 
                    className="bg-sidebar-bg text-xs text-text-secondary rounded-lg px-2 py-1 outline-none border border-border-color focus:border-blue-500"
                    value={initialTimer || ""}
                    onChange={async (e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      try {
                        await fetch(`${API}/conversations/${conversationId}/timer`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                          body: JSON.stringify({ disappears_after_seconds: val })
                        });
                        if (onTimerChange) onTimerChange(val);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  >
                    <option value="">Off</option>
                    <option value="30">30 seconds</option>
                    <option value="300">5 minutes</option>
                    <option value="3600">1 hour</option>
                  </select>
                </div>
              )}

              <div className="space-y-1">
                {members.map((m) => {
                  const isCreator = m.role === "creator";
                  const isAdmin = m.role === "admin";
                  const canRemove = 
                    me?.role === "creator" && !isCreator && m.user_id !== me.user_id ||
                    me?.role === "admin" && m.role === "member";
                  
                  const canMakeAdmin = me?.role === "creator" && m.role === "member";
                  const canRemoveAdmin = me?.role === "creator" && m.role === "admin";

                  return (
                    <div key={m.user_id} className="group flex items-center justify-between p-2 rounded-xl hover:bg-input-bg transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar src={m.avatar_url} name={m.display_name} size={9} />
                        <div className="flex flex-col">
                          <span className="text-[14px] text-text-primary font-medium flex items-center gap-1.5">
                            {m.display_name} {m.user_id === user?.id && <span className="text-text-secondary font-normal">(You)</span>}
                            {isCreator && <Crown className="w-3.5 h-3.5 text-yellow-500" title="Creator" />}
                            {isAdmin && <Shield className="w-3.5 h-3.5 text-blue-500" title="Admin" />}
                          </span>
                          <span className="text-[12px] text-text-secondary">{m.phone}</span>
                        </div>
                      </div>

                      {/* Action Menu (Visible on Hover) */}
                      {(canRemove || canMakeAdmin || canRemoveAdmin) && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                          {canMakeAdmin && (
                            <button onClick={() => handleUpdateRole(m.user_id, "admin")} className="p-1.5 text-text-secondary hover:text-blue-500 hover:bg-blue-500/10 rounded-full" title="Make Admin">
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          )}
                          {canRemoveAdmin && (
                            <button onClick={() => handleUpdateRole(m.user_id, "member")} className="p-1.5 text-text-secondary hover:text-orange-500 hover:bg-orange-500/10 rounded-full" title="Remove as Admin">
                              <ShieldAlert className="w-4 h-4" />
                            </button>
                          )}
                          {canRemove && (
                            <button onClick={() => handleRemove(m.user_id)} className="p-1.5 text-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-full" title="Remove Member">
                              <UserMinus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leave Group Action */}
            <div className="pt-4 border-t border-border-color">
              <button
                onClick={handleLeave}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-950/20 text-red-500 font-semibold text-sm hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Leave Group
              </button>
            </div>
          </>
        )}
      </div>

      {/* Add Member Modal Inline */}
      {isAddOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-sidebar-bg border border-border-color rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <button onClick={() => setIsAddOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-semibold text-text-primary mb-4">Add Member</h3>
            
            {addError && <div className="mb-3 text-xs text-red-400 bg-red-950/30 p-2 rounded-lg">{addError}</div>}
            
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Phone number (+1...)"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-text-secondary/70 mb-4"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={adding}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add to Group"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

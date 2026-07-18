"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PRESET_AVATARS = [
  { id: "blue",    bg: "bg-blue-600",    initials: "" },
  { id: "purple",  bg: "bg-purple-600",  initials: "" },
  { id: "pink",    bg: "bg-pink-600",    initials: "" },
  { id: "rose",    bg: "bg-rose-500",    initials: "" },
  { id: "amber",   bg: "bg-amber-500",   initials: "" },
  { id: "green",   bg: "bg-emerald-600", initials: "" },
  { id: "teal",    bg: "bg-teal-500",    initials: "" },
  { id: "indigo",  bg: "bg-indigo-600",  initials: "" },
];

export default function ProfileSetupPage() {
  const router = useRouter();
  const { tempToken, setTempToken, login } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("blue");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tempToken) router.push("/phone-entry");
  }, [tempToken, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempToken) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/auth/complete-profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tempToken}`,
        },
        body: JSON.stringify({
          display_name: displayName.trim(),
          avatar_url: selectedAvatar, // just the color key for now
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? "Could not save profile."); return; }

      setTempToken(null);
      await login(data.access_token);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  // Compute initials from displayName for avatar preview
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const selectedStyle = PRESET_AVATARS.find((a) => a.id === selectedAvatar);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* Avatar preview */}
          <div
            className={`w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold ${selectedStyle?.bg ?? "bg-blue-600"}`}
          >
            {initials || "?"}
          </div>
          <h1 className="text-2xl font-bold text-white">Set up profile</h1>
          <p className="text-gray-400 mt-1 text-sm">How should we show your name?</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            required
            maxLength={50}
            className="w-full bg-[#2C2C2E] text-white rounded-xl px-4 py-3 outline-none border border-gray-700 focus:border-[#3A76F0] transition-colors placeholder-gray-500 text-[15px]"
          />

          {/* Avatar color picker */}
          <div>
            <p className="text-sm text-gray-400 mb-3">Choose an avatar color</p>
            <div className="grid grid-cols-4 gap-3">
              {PRESET_AVATARS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAvatar(a.id)}
                  className={`w-full aspect-square rounded-2xl ${a.bg} flex items-center justify-center text-white font-bold text-lg transition-all ${
                    selectedAvatar === a.id
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#121212] scale-105"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {selectedAvatar === a.id ? "✓" : ""}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || displayName.trim().length < 1}
            className="w-full py-3 rounded-xl bg-[#3A76F0] text-white font-semibold text-[15px] hover:bg-[#2960D4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Saving…" : "Done"}
          </button>
        </form>
      </div>
    </div>
  );
}

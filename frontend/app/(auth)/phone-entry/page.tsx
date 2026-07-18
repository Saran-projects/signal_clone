"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export default function PhoneEntryPage() {
  const router = useRouter();
  const { setTempToken } = useAuth();

  const [isLogin, setIsLogin] = useState(false);
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback((seconds: number) => {
    setCooldown(seconds);
    timerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    setError(null);
    setLoading(true);

    const fullPhone = `${countryCode}${phone}`;

    try {
      const res = await fetch(`${API}/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, purpose: isLogin ? "login" : "register" }),
      });

      const data = await res.json();

      if (res.status === 429) {
        const retry = parseInt(res.headers.get("Retry-After") ?? "60", 10);
        startCooldown(retry || 60);
        setError(`Too many requests — wait ${retry || 60}s before trying again.`);
        return;
      }
      if (!res.ok) {
        setError(data.detail ?? "Something went wrong.");
        return;
      }

      // Navigate to OTP entry, carry state via sessionStorage (ephemeral)
      sessionStorage.setItem(
        "otp_state",
        JSON.stringify({ phone: fullPhone, purpose: isLogin ? "login" : "register", dev_hint: data.dev_hint ?? null })
      );
      router.push("/otp-entry");
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] px-6">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-[#3A76F0] rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-5.52-4.48-10-10-10zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isLogin ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            {isLogin ? "Sign in with your phone number" : "Enter your phone number to get started"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Phone input */}
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="bg-[#2C2C2E] text-white rounded-xl px-3 py-3 text-sm outline-none border border-gray-700 focus:border-[#3A76F0] transition-colors"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.label} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="Phone number"
              maxLength={10}
              required
              className="flex-1 bg-[#2C2C2E] text-white rounded-xl px-4 py-3 outline-none border border-gray-700 focus:border-[#3A76F0] transition-colors placeholder-gray-500 text-[15px]"
            />
          </div>

          {/* Error / cooldown */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
              {cooldown > 0 && (
                <span className="ml-2 font-bold text-red-300">({cooldown}s)</span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || cooldown > 0 || phone.length !== 10}
            className="w-full py-3 rounded-xl bg-[#3A76F0] text-white font-semibold text-[15px] hover:bg-[#2960D4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Sending…" : cooldown > 0 ? `Wait ${cooldown}s` : "Continue"}
          </button>
        </form>

        <button
          onClick={() => { setIsLogin((v) => !v); setError(null); }}
          className="mt-6 w-full text-center text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span className="text-[#3A76F0] font-medium">{isLogin ? "Sign up" : "Log in"}</span>
        </button>
      </div>
    </div>
  );
}

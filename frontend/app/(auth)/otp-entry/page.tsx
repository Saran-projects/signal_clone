"use client";
import { useEffect, useState, useRef, useCallback, ClipboardEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const API = "http://localhost:8000";
const CODE_LEN = 6;

// ─── Dev hint display ──────────────────────────────────────────────────────────
// To remove dev hints in production: delete this component and the devHint prop
function DevHint({ hint }: { hint: string | null }) {
  if (!hint) return null;
  return (
    <p className="text-center text-xs text-gray-500 mt-3">
      Dev mode: use{" "}
      <span className="font-mono text-gray-400 tracking-widest">{hint}</span>
    </p>
  );
}

export default function OtpEntryPage() {
  const router = useRouter();
  const { login, setTempToken } = useAuth();

  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState<"register" | "login">("register");
  const [devHint, setDevHint] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(Array(CODE_LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read OTP state from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem("otp_state");
    if (!raw) { router.push("/phone-entry"); return; }
    const s = JSON.parse(raw);
    setPhone(s.phone ?? "");
    setPurpose(s.purpose ?? "register");
    setDevHint(s.dev_hint ?? null);
    startCooldown(60);
    inputsRef.current[0]?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCooldown = useCallback((secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(secs);
    timerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Box input handlers ────────────────────────────────────────────────────
  const handleChange = (idx: number, val: string) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = ch;
    setCode(next);
    if (ch && idx < CODE_LEN - 1) inputsRef.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LEN);
    const next = [...code];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    inputsRef.current[Math.min(pasted.length, CODE_LEN - 1)]?.focus();
  };

  // ── Verify ────────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    const codeStr = code.join("");
    if (codeStr.length < CODE_LEN) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: codeStr, purpose }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? "Invalid code."); return; }

      if (purpose === "register") {
        setTempToken(data.temp_token);
        router.push("/profile-setup");
      } else {
        await login(data.access_token);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  // auto-submit when all boxes filled
  useEffect(() => {
    if (code.every(Boolean)) handleVerify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Resend ────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      const res = await fetch(`${API}/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose }),
      });
      const data = await res.json();
      if (res.ok) {
        setDevHint(data.dev_hint ?? null);
        sessionStorage.setItem("otp_state", JSON.stringify({ phone, purpose, dev_hint: data.dev_hint ?? null }));
        startCooldown(60);
        setCode(Array(CODE_LEN).fill(""));
        inputsRef.current[0]?.focus();
      }
    } catch { /* silent */ }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] px-6">
      <div className="w-full max-w-sm text-center">
        {/* Back */}
        <button
          onClick={() => router.push("/phone-entry")}
          className="absolute top-6 left-6 text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>

        <div className="w-16 h-16 bg-[#3A76F0] rounded-2xl mx-auto mb-6 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white">Enter code</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Code sent to <span className="text-gray-200 font-medium">{phone}</span>
        </p>

        {/* 6-box input */}
        <div className="flex justify-center gap-3 mt-8">
          {code.map((ch, idx) => (
            <input
              key={idx}
              ref={(el) => { inputsRef.current[idx] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={ch}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              className="w-11 h-14 text-center text-2xl font-bold bg-[#2C2C2E] text-white rounded-xl border border-gray-700 focus:border-[#3A76F0] outline-none transition-colors caret-transparent"
            />
          ))}
        </div>

        {/* Dev hint — single prop, easy to delete */}
        <DevHint hint={devHint} />

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={loading || code.join("").length < CODE_LEN}
          className="mt-6 w-full py-3 rounded-xl bg-[#3A76F0] text-white font-semibold text-[15px] hover:bg-[#2960D4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Verifying…" : "Verify"}
        </button>

        {/* Resend */}
        <div className="mt-5 text-sm text-gray-500">
          Didn&apos;t get a code?{" "}
          {cooldown > 0 ? (
            <span className="text-gray-600">Resend in <span className="text-gray-400">{cooldown}s</span></span>
          ) : (
            <button onClick={handleResend} className="text-[#3A76F0] hover:text-[#6ea0f7] transition-colors font-medium">
              Resend code
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

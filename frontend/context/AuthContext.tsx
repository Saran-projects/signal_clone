"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

const API = "http://localhost:8000";

export interface User {
  id: number;
  phone: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  /** Held in memory only — never written to disk */
  tempToken: string | null;
  setTempToken: (t: string | null) => void;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

const AUTH_ROUTES = [
  "/phone-entry",
  "/otp-entry",
  "/profile-setup",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tempToken, setTempToken] = useState<string | null>(null);

  const hydrateUser = useCallback(async (token: string): Promise<User | null> => {
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const login = useCallback(
    async (token: string) => {
      setCookie("access_token", token);
      const u = await hydrateUser(token);
      setUser(u);
      router.push("/");
    },
    [hydrateUser, router]
  );

  const logout = useCallback(() => {
    deleteCookie("access_token");
    setUser(null);
    router.push("/phone-entry");
  }, [router]);

  // On mount: read cookie → hydrate or redirect
  useEffect(() => {
    const token = getCookie("access_token");
    if (!token) {
      setIsLoading(false);
      if (!AUTH_ROUTES.some((r) => pathname?.startsWith(r))) {
        router.push("/phone-entry");
      }
      return;
    }
    hydrateUser(token).then((u) => {
      if (u) {
        setUser(u);
        if (AUTH_ROUTES.some((r) => pathname?.startsWith(r))) {
          router.push("/");
        }
      } else {
        deleteCookie("access_token");
        router.push("/phone-entry");
      }
      setIsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, tempToken, setTempToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

"use client";

import React, { createContext, useContext, useState, useEffect, useLayoutEffect, ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextProps {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextProps | null>(null);

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function ThemeProvider({ children, initialTheme = "dark" }: { children: ReactNode; initialTheme?: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Sync state on mount in case it is different from cookie
  useEffect(() => {
    const savedTheme = getCookie("theme") as Theme | null;
    if (savedTheme && savedTheme !== theme) {
      setTheme(savedTheme);
    }
  }, [theme]);

  // Apply theme to document element
  // useLayoutEffect ensures the DOM class is updated synchronously before the browser paints the re-rendered React tree
  const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    const root = window.document.documentElement;
    
    // Temporarily disable transitions on all elements to prevent the "waterfall" color flicker
    const css = document.createElement("style");
    css.type = "text/css";
    css.appendChild(
      document.createTextNode(
        `* {
          -webkit-transition: none !important;
          -moz-transition: none !important;
          -o-transition: none !important;
          -ms-transition: none !important;
          transition: none !important;
        }`
      )
    );
    document.head.appendChild(css);

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    
    setCookie("theme", theme);

    // Force a reflow so the class application happens without transitions
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    window.getComputedStyle(css).opacity;
    
    // Re-enable transitions immediately after
    document.head.removeChild(css);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

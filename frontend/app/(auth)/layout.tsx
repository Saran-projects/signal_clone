import React from "react";

// (auth) group layout — no extra chrome, just render children
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}


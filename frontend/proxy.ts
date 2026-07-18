import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_PAGES = ["/phone-entry", "/otp-entry", "/profile-setup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("access_token")?.value;

  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  // No token → send to phone-entry (unless already there)
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL("/phone-entry", request.url));
  }

  // Has token → don't let them back on auth pages
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};


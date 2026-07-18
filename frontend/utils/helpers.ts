/**
 * Helper to retrieve authentication headers dynamically from document cookies.
 */
export function getAuthHeaders(): Record<string, string> {
  if (typeof document === "undefined") {
    return {
      "Content-Type": "application/json",
      "Authorization": "",
    };
  }
  const token = document.cookie.match(/(?:^|; )access_token=([^;]*)/)?.[1];
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

/**
 * Format timestamp in Signal Desktop style:
 * - "2:34 PM" if today
 * - "Yesterday" if yesterday
 * - Else short date (e.g. "Jul 17")
 */
export function formatMessageTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    
    // Create dates representing the start of today and yesterday
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (msgDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } else if (msgDate.getTime() === yesterday.getTime()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  } catch {
    return "";
  }
}

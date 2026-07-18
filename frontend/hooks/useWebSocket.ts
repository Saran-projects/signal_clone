import { useEffect } from "react";
import { useWebSocketContext } from "@/context/WebSocketContext";

/**
 * Custom hook to interface with the application-wide WebSocket.
 * 
 * Usage:
 * - Register for an event:
 *   useWebSocket("new_message", (data) => { ... });
 * 
 * - Perform actions:
 *   const { sendMessage, sendTyping, markRead, status } = useWebSocket();
 */
export function useWebSocket(eventType?: string, callback?: (data: any) => void) {
  const ws = useWebSocketContext();

  useEffect(() => {
    if (!eventType || !callback) return;
    
    const unsubscribe = ws.addEventListener(eventType, callback);
    return () => {
      unsubscribe();
    };
  }, [eventType, callback, ws]);

  return ws;
}

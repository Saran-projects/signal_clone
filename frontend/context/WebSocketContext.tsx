"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface WebSocketContextProps {
  status: ConnectionStatus;
  sendMessage: (conversationId: number, content: string, replyToMessageId?: number | null) => void;
  sendTyping: (conversationId: number, isTyping: boolean) => void;
  markRead: (conversationId: number, upToMessageId: number) => void;
  addEventListener: (type: string, callback: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextProps | null>(null);

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const listenersRef = useRef<Record<string, Set<(data: any) => void>>>({});

  // Helper to add event listeners
  const addEventListener = useCallback((type: string, callback: (data: any) => void) => {
    if (!listenersRef.current[type]) {
      listenersRef.current[type] = new Set();
    }
    listenersRef.current[type].add(callback);
    return () => {
      listenersRef.current[type].delete(callback);
    };
  }, []);

  // Helper to trigger registered event listeners
  const triggerEvent = useCallback((type: string, data: any) => {
    if (listenersRef.current[type]) {
      listenersRef.current[type].forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in WebSocket event listener for type ${type}:`, err);
        }
      });
    }
  }, []);

  // Connect function
  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const token = getCookie("access_token");
    if (!token) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type;
        if (type) {
          triggerEvent(type, data);
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onclose = (event) => {
      setStatus("disconnected");
      socketRef.current = null;

      // Don't reconnect on clean/intentional closes (code 1000 or 1001)
      if (event.code === 1000 || event.code === 1001) return;

      // Only reconnect if the user is still authenticated
      if (user) {
        const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoffDelay);
      }
    };

    ws.onerror = () => {
      // The browser fires a generic Event (not an Error) on WS errors.
      // The real reason is visible in the Network tab → WS frames.
      // onclose will fire immediately after and handle reconnection.
      ws.close();
    };
  }, [user, triggerEvent]);

  // Connect or disconnect based on auth state
  useEffect(() => {
    if (user) {
      connect();
    } else {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setStatus("disconnected");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user, connect]);

  // Expose WebSocket actions
  const sendMessage = useCallback((conversationId: number, content: string, replyToMessageId?: number | null) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "send_message",
        conversation_id: conversationId,
        content,
        reply_to_message_id: replyToMessageId || null
      }));
    } else {
      console.warn("WebSocket not connected. Cannot send message.");
    }
  }, []);

  const sendTyping = useCallback((conversationId: number, isTyping: boolean) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "typing",
        conversation_id: conversationId,
        is_typing: isTyping
      }));
    }
  }, []);

  const markRead = useCallback((conversationId: number, upToMessageId: number) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "mark_read",
        conversation_id: conversationId,
        up_to_message_id: upToMessageId
      }));
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ status, sendMessage, sendTyping, markRead, addEventListener }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within WebSocketProvider");
  }
  return context;
}

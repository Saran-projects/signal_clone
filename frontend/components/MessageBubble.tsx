import React from "react";
import { Reply, Check, CheckCheck, Clock, SmilePlus } from "lucide-react";

export interface Reaction {
  user_id: number;
  emoji: string;
}

interface MessageBubbleProps {
  id: number;
  content: string;
  isOutgoing: boolean;
  time: string;
  senderName?: string;
  isOwn?: boolean;
  messageType?: "text" | "system" | "image";
  receiptStatus?: "sent" | "delivered" | "read" | "sending";
  replyTo?: {
    id: number;
    sender_name: string;
    content_snippet: string;
  } | null;
  onReplyAction?: () => void;
  onReplyClick?: (id: number) => void;
  isTyping?: boolean;
  systemMessage?: boolean;
  showSenderName?: boolean;
  reactions?: Reaction[];
  currentUserId?: number;
  onAddReaction?: (id: number, emoji: string) => void;
  onRemoveReaction?: (id: number, emoji: string) => void;
  onImageClick?: (url: string) => void;
}

export default function MessageBubble({
  id,
  content,
  isOutgoing,
  time,
  senderName,
  isOwn,
  messageType = "text",
  receiptStatus = "sent",
  replyTo,
  onReplyAction,
  onReplyClick,
  isTyping,
  systemMessage,
  showSenderName,
  reactions = [],
  currentUserId,
  onAddReaction,
  onRemoveReaction,
  onImageClick,
}: MessageBubbleProps) {
  if (messageType === "system") {
    return (
      <div className="flex justify-center my-3 px-4 select-none">
        <div className="bg-black/5 dark:bg-[#1C1C1E]/50 backdrop-blur-sm border border-border-color text-xs text-text-primary/90 px-3.5 py-1.5 rounded-full text-center max-w-[85%] font-medium">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      id={`message-${id}`}
      className={`flex w-full group relative ${
        isOutgoing ? "justify-end" : "justify-start"
      } mb-2.5 transition-colors duration-300`}
    >
      <div
        className={`flex items-end gap-2 max-w-[75%] ${
          isOutgoing ? "flex-row-reverse" : "flex-row"
        }`}
      >
        <div className="flex flex-col items-start w-full">
          {/* Sender Name for Group Chats (Incoming only) */}
          {showSenderName && !isOwn && !systemMessage && senderName && (
            <div className="text-[12px] font-medium text-text-secondary ml-3 mb-1">
              {senderName}
            </div>
          )}

          {/* Message Bubble Container */}
          <div
            className={`flex flex-col rounded-2xl shadow-sm text-[14.5px] leading-relaxed overflow-hidden border border-transparent ${
              isOutgoing
                ? "bg-[#3A76F0] text-white rounded-br-none"
                : "bg-bubble-incoming text-bubble-incoming-text rounded-bl-none"
            }`}
          >
            {/* Quoted Reply Preview Strip */}
            {replyTo && (
              <div
                onClick={() => onReplyClick?.(replyTo.id)}
                className={`px-3 py-1.5 text-xs border-l-2 cursor-pointer transition-all ${
                  isOutgoing
                    ? "bg-blue-600/40 hover:bg-blue-600/60 border-white/60 text-blue-100"
                    : "bg-black/5 hover:bg-black/10 dark:bg-[#2C2C2E] dark:hover:bg-[#3A3A3C] border-blue-500 text-text-primary"
                } border-t-0 border-r-0 border-b-0`}
              >
                <div className="font-semibold truncate mb-0.5">
                  {replyTo.sender_name || "Original message"}
                </div>
                <div className="truncate text-opacity-90">
                  {replyTo.content_snippet || "Original message"}
                </div>
              </div>
            )}

            {/* Bubble content */}
            <div className="px-4 py-2.5">
              {messageType === "image" ? (
                <img 
                  src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${content}`} 
                  alt="Attachment" 
                  className="max-w-[220px] max-h-[300px] object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => onImageClick?.(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${content}`)}
                />
              ) : (
                <p className="whitespace-pre-wrap break-words">{content}</p>
              )}

              {/* Timestamp & Status Ticks */}
              <div
                className={`flex items-center gap-1 mt-1 text-[10px] select-none font-normal justify-end ${
                  isOutgoing ? "text-blue-100" : "text-text-secondary"
                }`}
              >
                <span>{time}</span>

                {/* Receipts checks */}
                {isOutgoing && (
                  <span className="flex-shrink-0">
                    {receiptStatus === "sending" && (
                      <Clock className="w-3 h-3 text-blue-200/70 animate-pulse" />
                    )}
                    {receiptStatus === "sent" && (
                      <Check className="w-3.5 h-3.5 text-blue-200/70" />
                    )}
                    {receiptStatus === "delivered" && (
                      <CheckCheck className="w-3.5 h-3.5 text-blue-200/70" />
                    )}
                    {receiptStatus === "read" && (
                      <CheckCheck className="w-3.5 h-3.5 text-[#4e95ff] fill-[#4e95ff]" />
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Reactions */}
          {reactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isOutgoing ? 'self-end mr-2' : 'self-start ml-2'}`}>
              {Array.from(new Set(reactions.map((r) => r.emoji))).map((emoji) => {
                const count = reactions.filter((r) => r.emoji === emoji).length;
                const hasReacted = reactions.some((r) => r.emoji === emoji && r.user_id === currentUserId);
                return (
                  <button
                    key={emoji}
                    onClick={() => hasReacted ? onRemoveReaction?.(id, emoji) : onAddReaction?.(id, emoji)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border shadow-sm ${
                      hasReacted
                        ? "bg-blue-500/20 border-blue-500/50 text-blue-500 cursor-pointer"
                        : "bg-sidebar-bg border-border-color text-text-primary"
                    }`}
                  >
                    {emoji} <span className="text-[10px] opacity-80">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions (visible on hover) */}
        {!isTyping && (onReplyAction || onAddReaction) && (
          <div className={`opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all flex-shrink-0 ${isOutgoing ? "mr-1" : "ml-1"}`}>
            {onReplyAction && (
              <button
                onClick={onReplyAction}
                className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-border-color/50 rounded-full transition-all"
                title="Reply"
              >
                <Reply className="w-4 h-4" />
              </button>
            )}
            {onAddReaction && (
              <div className="relative group/picker">
                <button
                  className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-border-color/50 rounded-full transition-all"
                  title="React"
                >
                  <SmilePlus className="w-4 h-4" />
                </button>
                <div className="absolute hidden group-hover/picker:flex bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1C1C1E] border border-gray-800 rounded-full shadow-xl p-1 gap-1 z-50">
                  {["👍", "❤️", "😂", "😮", "😢", "🔥"].map(emoji => (
                    <button key={emoji} className="hover:bg-border-color/50 rounded-full p-1.5 transition-colors text-base" onClick={() => onAddReaction(id, emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

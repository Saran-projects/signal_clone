import React, { useState, useRef } from "react";
import { Plus, Smile, Mic, Send, X } from "lucide-react";

interface MessageInputProps {
  onSendMessage?: (text: string) => void;
  onImageUpload?: (file: File) => void;
  onTyping?: (isTyping: boolean) => void;
  replyingTo?: {
    id: number;
    sender_name: string;
    content_snippet: string;
  } | null;
  onCancelReply?: () => void;
  isParticipantActive?: boolean;
  removedBy?: {
    id: number;
    name: string;
  } | null;
}

export default function MessageInput({
  onSendMessage,
  onImageUpload,
  onTyping,
  replyingTo,
  onCancelReply,
  isParticipantActive = true,
  removedBy,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onImageUpload) {
        onImageUpload(e.target.files[0]);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    if (onTyping) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => onTyping(false), 3000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (onSendMessage) {
      onSendMessage(text);
    }
    if (onTyping) {
      onTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
    setText("");
  };

  if (!isParticipantActive) {
    return (
      <div className="p-4 bg-background border-t border-border-color flex items-center justify-center text-center select-none flex-shrink-0">
        <div className="w-full max-w-md py-3.5 px-6 bg-red-500/10 border border-red-500/20 text-red-600 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400 rounded-xl text-sm font-medium shadow-md">
          {removedBy ? (
            <span>You were removed from this group by <strong className="font-semibold">{removedBy.name}</strong></span>
          ) : (
            <span>You left this group</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-sidebar-bg border-t border-border-color flex-shrink-0 flex flex-col w-full">
      {/* Replying Preview Strip */}
      {replyingTo && (
        <div className="px-4 py-2 bg-black/5 dark:bg-black/40 border-b border-border-color flex items-center justify-between gap-3 text-xs">
          <div className="border-l-2 border-blue-500 pl-3 py-0.5 truncate flex-1">
            <span className="font-semibold text-text-primary block">
              Replying to {replyingTo.sender_name}
            </span>
            <span className="text-text-secondary truncate block">
              {replyingTo.content_snippet}
            </span>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 hover:bg-input-bg rounded-full text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="p-4 flex items-center gap-3 w-full"
      >
        {/* Plus (Attachment) Button */}
        <input 
          type="file" 
          ref={fileInputRef} 
          hidden 
          accept="image/*" 
          onChange={handleImageChange} 
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-input-bg rounded-full transition-all duration-150 flex-shrink-0"
        >
          <Plus className="w-5 h-5" />
        </button>

        {/* Input container */}
        <div className="flex-1 flex items-center gap-2 bg-input-bg hover:bg-border-color rounded-2xl px-4 py-2 transition-colors duration-150">
          <input
            type="text"
            value={text}
            onChange={handleChange}
            placeholder="New Message"
            className="flex-1 bg-transparent text-text-primary text-[14.5px] outline-none placeholder-text-secondary/70"
          />

          {/* Emoji Button */}
          <button
            type="button"
            className="text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
          >
            <Smile className="w-5 h-5" />
          </button>
        </div>

        {/* Mic or Send Button */}
        {text.trim() ? (
          <button
            type="submit"
            className="p-2.5 bg-[#3A76F0] hover:bg-[#2F6EE5] text-white rounded-full transition-all duration-150 flex-shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            className="p-2.5 text-text-secondary hover:text-text-primary hover:bg-input-bg rounded-full transition-all duration-150 flex-shrink-0"
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </form>
    </div>
  );
}


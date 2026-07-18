import React from "react";
import Avatar from "./Avatar";

interface ConversationListItemProps {
  id: number;
  name: string;
  avatar: string | null;
  lastMessage: string;
  timestamp: string;
  unreadCount?: number;
  active?: boolean;
  status?: string; // "online" | "offline"
  onClick?: () => void;
}

export default function ConversationListItem({
  name,
  avatar,
  lastMessage,
  timestamp,
  unreadCount,
  active,
  status,
  onClick,
}: ConversationListItemProps) {
  // Select color preset based on name if no avatar_url
  const initials = name ? name.substring(0, 2).toUpperCase() : "?";
  
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3.5 mx-2 my-1 cursor-pointer rounded-xl transition-all duration-150 select-none ${
        active
          ? "bg-blue-500/10 dark:bg-[#2C2C2E] text-text-primary"
          : "hover:bg-input-bg text-text-primary"
      }`}
    >
      {/* Avatar Container with Online Status Dot */}
      <div className="relative flex-shrink-0">
        <Avatar src={avatar} name={name} size={11} />
        
        {/* Status Indicator Dot */}
        {status === "online" && (
          <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-black" />
        )}
      </div>

      {/* Message Info */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-0.5">
          <h3 className="text-[14.5px] font-medium truncate">{name}</h3>
          <span
            className={`text-xs flex-shrink-0 ml-2 ${
              active ? "text-text-primary/80" : "text-text-secondary"
            }`}
          >
            {timestamp}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <p
            className={`text-[13px] truncate pr-2 ${
              active ? "text-text-primary/90" : "text-text-secondary"
            }`}
          >
            {lastMessage}
          </p>
          {unreadCount && unreadCount > 0 ? (
            <span className="bg-[#3A76F0] text-white text-[11px] font-semibold px-2 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0">
              {unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

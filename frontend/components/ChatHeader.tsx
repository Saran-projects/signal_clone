import React from "react";
import { Phone, Video, MoreVertical, ArrowLeft, TimerReset } from "lucide-react";
import Avatar from "./Avatar";

interface ChatHeaderProps {
  name: string;
  avatar: string | null;
  status: string;
  isGroup?: boolean;
  disappearsAfterSeconds?: number | null;
  onClick?: () => void;
  onBack?: () => void;
}

export default function ChatHeader({
  name,
  avatar,
  status,
  isGroup,
  disappearsAfterSeconds,
  onClick,
  onBack,
}: ChatHeaderProps) {
  const initials = name ? name.substring(0, 2).toUpperCase() : "?";
  
  return (
    <div 
      onClick={onClick}
      className={`h-16 border-b border-border-color bg-sidebar-bg flex items-center justify-between px-4 flex-shrink-0 select-none ${
        onClick ? "cursor-pointer hover:bg-input-bg transition-colors" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Back Button (Mobile Only) */}
        {onBack && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            className="md:hidden p-2 -ml-2 text-text-secondary hover:text-text-primary hover:bg-input-bg rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* Avatar Container with Online Status Dot */}
        <div className="relative">
          <Avatar src={avatar} name={name} size={10} />
          
          {status === "online" && (
            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-black" />
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[14.5px] font-medium text-white leading-tight">
              {name}
            </h2>
            {disappearsAfterSeconds && (
              <TimerReset className="w-3.5 h-3.5 text-gray-400" />
            )}
          </div>
          <p className="text-[11px] text-gray-400 font-normal">
            {status}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3.5 text-gray-400">
        <button className="p-2 hover:text-white hover:bg-[#1C1C1E] rounded-xl transition-all duration-150">
          <Video className="w-4.5 h-4.5" />
        </button>
        <button className="p-2 hover:text-white hover:bg-[#1C1C1E] rounded-xl transition-all duration-150">
          <Phone className="w-4.5 h-4.5" />
        </button>
        <button className="p-2 hover:text-white hover:bg-[#1C1C1E] rounded-xl transition-all duration-150">
          <MoreVertical className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
}

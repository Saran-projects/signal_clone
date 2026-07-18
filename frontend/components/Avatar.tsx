import React from "react";

interface AvatarProps {
  src: string | null;
  name: string;
  size?: number; // Tailwind size class number (e.g. 11 for w-11 h-11)
  className?: string;
}

export default function Avatar({ src, name, size = 11, className = "" }: AvatarProps) {
  // If no name is provided, default to '?'
  const initials = name ? name.substring(0, 2).toUpperCase() : "?";

  // Check if src is a URL (starts with http or data:)
  const isUrl = src && (src.startsWith("http") || src.startsWith("data:"));
  
  // If src is provided but not a URL, it might be a color class (e.g. 'blue', 'pink') from our preset picker
  // So we map it to a tailwind background color. If not matched, we fallback to bg-blue-600.
  let bgColorClass = "bg-blue-600";
  if (src && !isUrl) {
    if (src === "blue") bgColorClass = "bg-blue-600";
    else if (src === "purple") bgColorClass = "bg-purple-600";
    else if (src === "pink") bgColorClass = "bg-pink-600";
    else if (src === "rose") bgColorClass = "bg-rose-500";
    else if (src === "amber") bgColorClass = "bg-amber-500";
    else if (src === "green") bgColorClass = "bg-emerald-600";
    else if (src === "teal") bgColorClass = "bg-teal-500";
    else if (src === "indigo") bgColorClass = "bg-indigo-600";
  }

  const dimensionClasses = `w-${size} h-${size}`;
  const fontSize = size >= 24 ? "3xl" : size >= 16 ? "xl" : size >= 12 ? "base" : "sm";

  if (isUrl) {
    return (
      <img
        src={src}
        alt={name}
        className={`${dimensionClasses} rounded-full object-cover bg-gray-800 flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${dimensionClasses} rounded-full flex items-center justify-center text-white font-bold select-none flex-shrink-0 text-${fontSize} ${bgColorClass} ${className}`}
    >
      {initials}
    </div>
  );
}

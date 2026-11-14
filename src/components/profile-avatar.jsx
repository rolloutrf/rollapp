import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { highlightedMood } from "../../shared/profile-mood.js";
import "./profile-mood.css";

export function Avatar({ user, moodLevel = user?.publicMood, size = "md", className = "", style, ...props }) {
  const avatarUrl = user?.avatarUrl || user?.avatar_url || "";
  const initials = (user?.name || "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const mood = highlightedMood(moodLevel);
  const shadcnSize = size === "sm" ? "sm" : ["lg", "xl"].includes(size) ? "lg" : "default";
  const appSizeClass = { sm: "!size-9", md: "!size-12", lg: "!size-[var(--avatar-lg-size)]", xl: "!size-[var(--avatar-xl-size)]" }[size] || "";
  return (
    <ShadcnAvatar
      size={shadcnSize}
      className={`avatar avatar--${size} ${appSizeClass} ${className}`}
      {...props}
      data-profile-mood={mood?.level}
      style={mood ? { ...style, "--profile-mood-color": mood.color } : style}
    >
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="avatar--fallback">{initials}</AvatarFallback>
    </ShadcnAvatar>
  );
}

import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { moodAt } from "../../shared/profile-mood.js";
import "./profile-mood.css";

export function Avatar({ user, size = "md", className = "", style, ...props }) {
  const avatarUrl = user?.avatarUrl || user?.avatar_url || "";
  const initials = (user?.name || "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const mood = moodAt(user?.publicMood);
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

export function ProfileMoodCaption({ level }) {
  const mood = moodAt(level);
  if (!mood) return null;
  return <span className="profile-mood-caption" style={{ "--profile-mood-color": mood.color }}>
    <span className="profile-mood-dot" aria-hidden="true" />
    Настроение: {mood.label.toLocaleLowerCase("ru-RU")}
  </span>;
}

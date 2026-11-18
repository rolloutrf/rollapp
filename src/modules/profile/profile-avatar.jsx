import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function avatarInitials(user) {
  return (user?.name || "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function Avatar({ user, size = "md", className = "", ...props }) {
  const avatarUrl = user?.avatarUrl || user?.avatar_url || "";
  const initials = avatarInitials(user);
  const shadcnSize = size === "sm" ? "sm" : ["lg", "xl"].includes(size) ? "lg" : "default";
  const appSizeClass = { sm: "!size-9", md: "!size-12", lg: "!size-[var(--avatar-lg-size)]", xl: "!size-[var(--avatar-xl-size)]" }[size] || "";
  return (
    <ShadcnAvatar
      role="img"
      aria-label={user?.name || "Профиль"}
      size={shadcnSize}
      className={`avatar avatar--${size} ${appSizeClass} ${className}`}
      {...props}
    >
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="avatar--fallback" aria-hidden="true">{initials}</AvatarFallback>
    </ShadcnAvatar>
  );
}

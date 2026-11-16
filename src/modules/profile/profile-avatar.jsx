import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Avatar({ user, size = "md", className = "", ...props }) {
  const avatarUrl = user?.avatarUrl || user?.avatar_url || "";
  const initials = (user?.name || "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const shadcnSize = size === "sm" ? "sm" : ["lg", "xl"].includes(size) ? "lg" : "default";
  const appSizeClass = { sm: "!size-9", md: "!size-12", lg: "!size-[var(--avatar-lg-size)]", xl: "!size-[var(--avatar-xl-size)]" }[size] || "";
  return (
    <ShadcnAvatar
      size={shadcnSize}
      className={`avatar avatar--${size} ${appSizeClass} ${className}`}
      {...props}
    >
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="avatar--fallback">{initials}</AvatarFallback>
    </ShadcnAvatar>
  );
}

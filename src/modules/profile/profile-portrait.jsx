import { Avatar } from "@/modules/profile/profile-avatar.jsx";

export function ProfilePortrait({ user }) {
  return (
    <span className="profile-portrait">
      <Avatar user={user} size="xl" className="wishes-page__hero-avatar" />
    </span>
  );
}

import { Avatar } from "@/modules/profile/profile-avatar.jsx";

export function ProfilePortrait({ user, moodLevel }) {
  return (
    <span className="profile-portrait">
      <Avatar user={user} moodLevel={moodLevel} size="xl" className="wishes-page__hero-avatar" />
    </span>
  );
}

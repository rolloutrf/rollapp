import { useSession } from "@/modules/auth/session.jsx";
import { useSphereSharing } from "@/modules/access/sphere-sharing.jsx";
import { moodAt, NEUTRAL_MOOD_LEVEL } from "../../../shared/modules/profile/profile-mood.js";

export function tileMoodStyle(level) {
  const mood = moodAt(level) ?? moodAt(NEUTRAL_MOOD_LEVEL);
  return { "--list-tile-accent": mood.color };
}

export function useProfileTileMood(level) {
  const user = useSession()?.user;
  const access = useSphereSharing();
  // A public page explicitly passes null when the owner has no visible mood.
  if (level !== undefined) return tileMoodStyle(level);
  const profileLevel = access.active && !access.isOwner
    ? access.owner?.publicMood
    : user?.moodLevel ?? user?.publicMood;
  return tileMoodStyle(profileLevel);
}

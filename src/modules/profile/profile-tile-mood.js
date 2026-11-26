import { useSession } from "@/modules/auth/session.jsx";
import { useSphereSharing } from "@/modules/access/sphere-sharing.jsx";
import { moodAt, NEUTRAL_MOOD_LEVEL } from "../../../shared/modules/profile/profile-mood.js";

export function tileMoodStyle(level) {
  const mood = moodAt(level) ?? moodAt(NEUTRAL_MOOD_LEVEL);
  return {
    "--list-tile-accent": mood.color,
    ...(mood.level === NEUTRAL_MOOD_LEVEL && { "--list-tile-saturation": 0 }),
  };
}

export function useProfileTileMood(level) {
  const user = useSession()?.user;
  const access = useSphereSharing();
  // A public page explicitly passes null when the owner has no visible mood.
  if (level !== undefined) return tileMoodStyle(level);
  const shared = access.active && !access.isOwner;
  const profile = shared ? access.owner : user;
  if (profile?.accountType === "business") return tileMoodStyle(null);
  return tileMoodStyle(shared ? profile?.publicMood : profile?.moodLevel ?? profile?.publicMood);
}

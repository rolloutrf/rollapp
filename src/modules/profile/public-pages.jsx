import { useParams, Navigate, useLocation } from "react-router-dom";
import { useSession } from "../auth/session.jsx";
import { LoadingScreen } from "../shell/page-feedback.jsx";
import { api } from "../runtime/api.js";
import { ProfilePublications } from "@/modules/profile/profile-publications.jsx";
import { renamedProfileLocation } from "../../../shared/modules/profile/profile-links.js";
import { useAsync } from "../shell/use-async.jsx";
import { AppShell } from "../shell/app-shell.jsx";

export function PublicBookingPage() {
  const { username } = useParams();
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  return <ProfilePublicationsPage key={`${username}:${user?.id || ""}`} section="calendar" username={username} user={user} />;
}

export function ProfilePublicationsPage({ section, username, user, returnTo, showIntro }) {
  const location = useLocation();
  const endpoint = `/profile/${encodeURIComponent(username)}/${section}`;
  const { data, loading, error, reload } = useAsync(() => api.get(endpoint), [endpoint]);
  if (data && data.profile.username !== username && !returnTo) {
    return <Navigate to={renamedProfileLocation(location, username, data.profile.username)} replace />;
  }
  const page = <ProfilePublications {...{ section, endpoint, username, user, data, loading, error, reload, returnTo, showIntro }} />;
  if (returnTo) return page;
  return user
    ? <AppShell friendsContext={!data?.isOwner} collectionChrome>{page}</AppShell>
    : <div className="app-layout app-layout--dark"><main className="app-main app-main--with-profile">{page}</main></div>;
}

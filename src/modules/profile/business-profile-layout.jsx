import { Navigate, Outlet, useLocation, useMatch } from "react-router-dom";
import { PROFILE_SPACES, matchesProfileAddress, publicProfileRoute } from "../../../shared/modules/profile/profile-links.js";
import { safeNextPath } from "../auth/auth.js";
import { useSession } from "../auth/session.jsx";
import { APP_BUSINESS_ACCESS_PATH } from "../shell/app-routing.js";
import { AppShell } from "../shell/app-shell.jsx";
import { APP_HOME } from "../shell/home-path.jsx";
import { LoadingScreen } from "../shell/page-feedback.jsx";
import { PublicProfileHero } from "./public-profile-hero.jsx";

const businessProfileContext = { businessProfile: true };

export function BusinessProfileLayout() {
  const location = useLocation();
  const { pathname, search, hash } = location;
  const { user, loading } = useSession();
  const clients = Boolean(useMatch(APP_BUSINESS_ACCESS_PATH));
  const profileSection = useMatch("/:username/:space?");
  const route = publicProfileRoute(pathname);
  const ownsRoute = profileSection && matchesProfileAddress(user, route?.username);

  if (loading) return <LoadingScreen />;
  if (clients) {
    if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(pathname + search + hash))}`} replace />;
    if (user.accountType !== "business") return <Navigate to={APP_HOME} replace />;
  } else if (!ownsRoute || user?.accountType !== "business") {
    return <Outlet />;
  }

  const requestedSpace = route?.space || new URLSearchParams(search).get("tab");
  const activeSpace = PROFILE_SPACES.includes(requestedSpace) ? requestedSpace : user.sellerSpace || "products";
  return (
    <AppShell collectionChrome>
      <div className="app-page app-page--collection wishes-page public-collection-page" data-public-collection>
        <div className="app-shell-chrome-spacer" aria-hidden="true" />
        <PublicProfileHero key={user.id} profile={user} user={user} isOwner businessStorefront
          activeSpace={activeSpace} publication={route?.publication} clients={clients} />
        <Outlet context={businessProfileContext} />
      </div>
    </AppShell>
  );
}

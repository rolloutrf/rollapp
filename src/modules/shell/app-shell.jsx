import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { StoryAvatar } from "@/modules/profile/story-avatar.jsx";
import { useLocation } from "react-router-dom";
import { FriendLocationReporter } from "@/modules/map/friend-location-reporter.jsx";
import { Button as ShadcnButton } from "@/components/ui/button";
import { useProfileEditor } from "../profile/profile-editor.jsx";
import { AppBrandSpacer } from "./app-chrome.jsx";
import { wishlistSpace } from "@/modules/wishlist/wishlist-business.jsx";
import { PRIVATE_NOTES_PATH } from "@/components/private-notes";
import { APP_WISH_CATALOG_PATH } from "./app-routing.js";
import { SphereSharingProvider, sphereScopeFromLocation } from "../access/sphere-sharing.jsx";
import { useSession } from "../auth/session.jsx";
import { isFriendsDirectoryPath, SERVICE_TABS } from "./service-menu.jsx";
import { WishlistSectionNavigation } from "../wishlist/wish-navigation.jsx";
import { PrivateSphereNavigation } from "./private-sphere-navigation.jsx";
import { PersistentProfileHero } from "../profile/profile-hero.jsx";

export function AppProfileButton({ user, compact = false }) {
  const { openProfileEditor } = useProfileEditor();
  const location = useLocation();
  const storiesEnabled = /^\/app\/friends(?:\/|$)/.test(location.pathname);
  return <div className="flex min-w-0 items-center gap-2">
    {storiesEnabled ? <StoryAvatar user={user} own onEditProfile={openProfileEditor}><Avatar user={user} size="sm" className="!size-8" /></StoryAvatar>
      : <ShadcnButton type="button" variant="ghost" size="icon" className="rounded-full" aria-label={`Редактировать профиль ${user.name}`} onClick={openProfileEditor}><Avatar user={user} size="sm" className="!size-8" /></ShadcnButton>}
    {!compact && <ShadcnButton type="button" variant="ghost" className="app-user-profile h-12 min-w-0 rounded-xl px-3" aria-label={`Редактировать профиль ${user.name}`} onClick={openProfileEditor}>
      <span className="app-user-profile__copy flex min-w-0 flex-col items-start"><strong className="max-w-full truncate text-sm leading-4">{user.name}</strong><span className="max-w-full truncate text-xs leading-4 text-muted-foreground">@{user.username}</span></span>
    </ShadcnButton>}
  </div>;
}

function FriendsTopbar({ user }) {
  return (
    <header className="friends-topbar" aria-label="Панель приложения">
      <AppBrandSpacer />
      <div className="friends-topbar__account">
        <AppProfileButton user={user} compact />
      </div>
    </header>
  );
}

export function AppShell({ children, friendsContext = false, collectionChrome = false, wishlistChrome = false }) {
  const { user } = useSession();
  const location = useLocation();
  const friendsRoute = friendsContext || isFriendsDirectoryPath(location.pathname);
  const wishesRoute = location.pathname.startsWith("/app/wishes");
  const catalogRoute = location.pathname === APP_WISH_CATALOG_PATH;
  const businessRoute = location.pathname.startsWith("/app/business");
  const rollsRoute = location.pathname.startsWith("/app/rolls");
  const planningRoute = location.pathname === "/app/planning";
  const messengerRoute = location.pathname.startsWith("/app/messenger");
  const diskNotesRoute = location.pathname === PRIVATE_NOTES_PATH;
  const notesRoute = planningRoute && new URLSearchParams(location.search).get("tab") === "notes";
  const planningLayout = notesRoute ? "app-layout--planning-notes" : planningRoute ? "app-layout--planning" : "";
  const sphereScope = sphereScopeFromLocation(location.pathname, location.search, SERVICE_TABS)
    || (wishesRoute && user?.accountType === "personal" ? { sphere: "wishlist", section: wishlistSpace(location.search) } : null);
  return (
    <SphereSharingProvider currentUser={user} scope={sphereScope} search={location.search}>
      {user && <FriendLocationReporter key={user.id} userId={user.id} />}
      <div className={`app-layout app-layout--dark ${planningLayout} ${friendsRoute ? "app-layout--friends" : ""}`}>
        <main className={`app-main ${(!friendsRoute && !diskNotesRoute) || collectionChrome ? "app-main--with-profile" : ""} ${wishesRoute || collectionChrome || wishlistChrome ? "app-main--wishes" : ""}`}>
          {!collectionChrome && !planningRoute && <div className="app-shell-chrome-spacer" aria-hidden="true" />}
          {wishlistChrome ? <PersistentProfileHero user={user} wishlistChrome sectionNavigation={<WishlistSectionNavigation user={user} />} /> : !collectionChrome && !catalogRoute && !businessRoute && !rollsRoute && !planningRoute && !messengerRoute && !diskNotesRoute && <PersistentProfileHero user={user} sectionNavigation={<PrivateSphereNavigation user={user} />} />}
          {children}
        </main>
      </div>
    </SphereSharingProvider>
  );
}

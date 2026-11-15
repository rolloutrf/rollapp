import { StoryAvatar } from "@/modules/profile/story-avatar.jsx";
import { Link, useLocation, useMatch } from "react-router-dom";
import { Eye, ShoppingBag } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { useSphereSharing } from "../access/sphere-sharing.jsx";
import { APP_HOME } from "../shell/home-path.jsx";
import { useProfileEditor } from "./profile-editor.jsx";
import { ProfilePortrait } from "./profile-portrait.jsx";
import { AppFriendsLink } from "../social/friends-link.jsx";
import { ownedSphereCatalogPath } from "../catalog-marketplace/catalog-page-header.jsx";
import { WishlistSectionNavigation } from "../wishlist/wish-navigation.jsx";

export function PersistentProfileHero({ user, wishlistChrome = false }) {
  const { openProfileEditor } = useProfileEditor();
  const location = useLocation();
  const wishlistPage = useMatch(APP_HOME);
  const access = useSphereSharing();
  const profile = !wishlistChrome && access.active && access.owner
    ? access.owner
    : user;
  const moodLevel = profile.id === user.id ? user.moodLevel ?? user.publicMood : profile.publicMood;
  const editable = !access.active || access.isOwner;
  const catalogPath = access.sphere === "career" && access.section === "contacts"
    ? null
    : ownedSphereCatalogPath(user, access, location);
  return (
    <section className="wishes-page__hero persistent-profile-hero" data-persistent-profile aria-labelledby="persistent-profile-name">
      <div className="wishes-page__identity wishes-page__identity--readonly">
        <div className="sphere-share-avatars">
          {/^\/app\/friends(?:\/|$)/.test(location.pathname) ? <StoryAvatar user={profile} own={editable} onEditProfile={openProfileEditor}>
            <ProfilePortrait user={profile} moodLevel={moodLevel} />
          </StoryAvatar> : editable ? <ShadcnButton type="button" variant="ghost" className="persistent-profile-hero__avatar-button h-auto min-h-0 rounded-full p-0 active:translate-y-0" aria-label={`Редактировать профиль ${profile.name}`} title="Редактировать профиль" onClick={openProfileEditor}>
            <ProfilePortrait user={profile} moodLevel={moodLevel} />
          </ShadcnButton> : <ProfilePortrait user={profile} moodLevel={moodLevel} />}
          {catalogPath && (
            <ControlBar as="nav" className="sphere-share-avatars__people" aria-label="Бизнес-каталог">
              <Link to={catalogPath} data-control-icon aria-label="Открыть каталог брендов" title="Каталог брендов"
                className={buttonVariants({ variant: "outline", size: "icon" })}>
                <ShoppingBag aria-hidden="true" />
              </Link>
            </ControlBar>
          )}
        </div>
        <div className="wishes-page__hero-copy">
          <h1 id="persistent-profile-name">{profile.name}</h1>
          {(wishlistChrome || wishlistPage) && editable && <AppFriendsLink memberNumber={profile.memberNumber} />}
          {wishlistChrome && <WishlistSectionNavigation user={user} />}
        </div>
        {access.readOnly && <Badge variant="secondary" className="sphere-share-readonly-badge"><Eye aria-hidden="true" />Только чтение</Badge>}
      </div>
    </section>
  );
}

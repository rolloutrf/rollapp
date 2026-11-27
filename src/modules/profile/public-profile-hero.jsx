import { useNavigate } from "react-router-dom";
import { ControlBar } from "@/components/control-bar";
import { PageActionButton } from "@/components/page-action-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContactCardButton } from "../contacts/contact-card-dialog.jsx";
import { BusinessGiftAction } from "../loyalty/gift-cards.jsx";
import { AppFriendsLink } from "../social/friends-link.jsx";
import { APP_BUSINESS_ACCESS_PATH } from "../shell/app-routing.js";
import { publicPublicationPath, publicSpacePath } from "../../../shared/modules/profile/profile-links.js";
import { ProfilePortrait } from "./profile-portrait.jsx";
import { useProfileEditor } from "./profile-editor.jsx";
import { ProfilePublicationLinks } from "./profile-publications.jsx";

export function PublicProfileHero({
  profile, user, isOwner, shared = false, businessStorefront = false, activeSpace,
  publication, publicationListId, clients = false, relationship, onFollow, isFollowing, ownListPath,
}) {
  const navigate = useNavigate();
  const { openProfileEditor } = useProfileEditor();
  const business = !shared && profile.accountType === "business";
  const ownerSections = businessStorefront && isOwner;
  const tab = new URLSearchParams({ tab: activeSpace });
  const storefront = publicSpacePath(profile, activeSpace);
  return (
    <section
      className={cn("wishes-page__hero public-collection-page__hero", !isOwner && "friend-profile-page__hero")}
      data-friend-profile={!isOwner && !shared ? "" : undefined}
      aria-labelledby="public-profile-name"
    >
      <div className="wishes-page__identity friend-profile-page__identity">
        {isOwner ? <Button
          type="button"
          variant="ghost"
          className={cn("h-auto min-h-0 rounded-full p-0", !business && "persistent-profile-hero__avatar-button hover:bg-transparent dark:hover:bg-transparent active:translate-y-0")}
          aria-label={`Редактировать профиль ${profile.name}`}
          title={business ? undefined : "Редактировать профиль"}
          onClick={openProfileEditor}
        >
          <ProfilePortrait user={profile} />
        </Button> : <ProfilePortrait user={profile} />}
        <div className="wishes-page__hero-copy">
          <h1 id="public-profile-name">{profile.name}</h1>
          {isOwner && <AppFriendsLink memberNumber={profile.memberNumber} />}
          {business && profile.bio?.trim() && (
            <div className="typeset typeset-rollapp max-w-full">
              <p className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">{profile.bio}</p>
            </div>
          )}
        </div>
      </div>
      {relationship}
      <ControlBar
        className={cn("page-actions wishes-page__hero-actions", !shared && "horizontal-action-scroller", !isOwner && "friend-profile-page__actions")}
        role="group"
        aria-label={businessStorefront ? "Действия с бизнес-профилем" : isOwner ? "Действия со списком желаний" : "Действия с профилем"}
      >
        {business && <BusinessGiftAction business={profile} user={user} />}
        {ownerSections && <>
          <PageActionButton variant={clients ? "default" : "outline"} to={`${APP_BUSINESS_ACCESS_PATH}?${tab}`} aria-current={clients ? "page" : undefined}>Клиенты</PageActionButton>
          <PageActionButton variant={!clients && !publication ? "default" : "outline"} to={storefront} aria-current={!clients && !publication ? "page" : undefined}>Витрина</PageActionButton>
        </>}
        {ownListPath && <PageActionButton onClick={() => navigate(ownListPath)}>Открыть мой список</PageActionButton>}
        {onFollow && <PageActionButton
          variant={isFollowing ? "secondary" : "default"}
          className="min-w-[180px]"
          type="button"
          aria-pressed={isFollowing}
          onClick={onFollow}
        >{isFollowing ? "Отписаться" : "Подписаться"}</PageActionButton>}
        <ContactCardButton key={profile.username} profile={profile} canSign={isOwner} />
        {!shared && <ProfilePublicationLinks activeSection={publication}
          toSection={section => `${publicPublicationPath(profile, section)}?${tab}`}
          state={{ publicationListId }}
          manageCalendar={isOwner && business}
          onlySections={activeSpace === "products" ? null : ["calendar"]} />}
      </ControlBar>
    </section>
  );
}

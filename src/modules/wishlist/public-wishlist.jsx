import { useId, useEffect, useState, useContext, useRef } from "react";
import { WishCard } from "../card/wish-card.jsx";
import { GroupDialog } from "@/components/group-dialog";
import { WishGroupHeader } from "@/components/wish-group-fundraiser";
import { useWishReorder } from "@/modules/wishlist/use-wish-reorder.js";
import {
  wishCountNoun,
  isGeneralList,
  listDisplayTitle,
  orderWishListsForNavigation,
  resolveVisibleListSelection,
  shouldShowListNavigation,
  shouldShowUnsortedList,
  UNSORTED_LIST_TITLE,
} from "../categories/list-navigation.js";
import { buildWishGroupGridItems, filterWishGroups } from "./wish-groups.js";
import { useToast } from "../shell/toast.jsx";
import { WishGroupTile } from "./wish-group.jsx";
import { sharePageUrl } from "../../applications/location.js";
import { AddFab } from "@/components/add-fab";
import { WishlistBusinessManager, WishlistBusinessListing } from "@/modules/wishlist/wishlist-business.jsx";
import { canManageWishlistSpace } from "../../../shared/modules/wishlist/wishlist-business.js";
import { ContactCardButton } from "@/modules/contacts/contact-card-dialog.jsx";
import { PageActionButton } from "@/components/page-action-button";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Gift, Heart, ListPlus, LoaderCircle } from "lucide-react";
import { api } from "../runtime/api.js";
import { ControlBar } from "@/components/control-bar";
import { BusinessGiftAction, BusinessGiftCertificates } from "@/modules/loyalty/gift-cards.jsx";
import { ProfilePublicationLinks } from "@/modules/profile/profile-publications.jsx";
import { cn } from "@/lib/utils";
import { BusinessMarketplacePage } from "@/modules/catalog-marketplace/business-marketplace-page.jsx";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { WishListNavigation } from "@/modules/categories/wish-list-navigation.jsx";
import { useIsMobile } from "@/hooks/use-mobile";
import { filterWishesWithoutList } from "./wish-lists.js";
import {
  publicProfilePath,
  publicSpacePath,
  publicListPath,
  publicPublicationPath,
  publicBookingPath,
  profilePublicationSection,
  renamedProfileLocation,
} from "../../../shared/modules/profile/profile-links.js";
import { CollectionNavigationContext } from "../categories/collection-navigation.jsx";
import { APP_HOME } from "../shell/home-path.jsx";
import { SPACE_IDS, listSpace, wishBelongsToSpace, wishSpaceId } from "../categories/wish-spaces.jsx";
import { useAsync } from "../shell/use-async.jsx";
import { useSession } from "../auth/session.jsx";
import { useProfileEditor } from "../profile/profile-editor.jsx";
import { ProfilePortrait } from "../profile/profile-portrait.jsx";
import { useGlobalShareHandler } from "../shell/global-share.jsx";
import { EmptyState, LoadingScreen } from "../shell/page-feedback.jsx";
import { AppFriendsLink } from "../social/friends-link.jsx";
import { AppShell } from "../shell/app-shell.jsx";
import { WishDetailsModal } from "../card/wish-details.jsx";
import { ListModal, WishModal } from "./wish-editor.jsx";
import { ProfilePublicationsPage } from "../profile/public-pages.jsx";

export function SharedWishes({ wishes, profile, onOpen, onChanged }) {
  const titleId = useId();
  if (!wishes.length) return null;
  return <section className="page-stack min-w-0" aria-labelledby={titleId}>
    <h2 id={titleId} className="font-semibold">Совместные со мной</h2>
    <div className="wish-grid">
      {wishes.map((wish) => <WishCard key={wish.id} wish={wish} profile={profile} onChanged={onChanged} onOpen={(opener) => onOpen(wish.id, opener)} />)}
    </div>
  </section>;
}

export function PublicWishGrid({ wishes, allWishes, groups = [], detailsOpen = false, initialGroupId = null, visibleLimit, ownerCollection, onReorder, onOpen, viewerId, ...cardProps }) {
  const [openedGroupId, setOpenedGroupId] = useState(initialGroupId);
  useEffect(() => { setOpenedGroupId(initialGroupId); }, [initialGroupId]);
  const openedGroup = groups.find((group) => group.id === openedGroupId);
  const toast = useToast();
  const { gridRef, orderedWishes, cardProps: dragProps, suppressClickRef, saving } = useWishReorder({
    wishes: allWishes,
    visibleWishes: wishes,
    enabled: ownerCollection && groups.length === 0,
    onSave: onReorder,
    onError: (error) => toast(error.message || "Не удалось сохранить порядок желаний", "error"),
  });
  const openedGroupWishes = openedGroup ? orderedWishes.filter((wish) => openedGroup.wishIds.includes(wish.id)) : [];
  const renderWish = (wish) => <WishCard
    key={wish.id}
    {...cardProps}
    {...dragProps(wish.id)}
    wish={wish}
    onOpen={(opener) => { if (!suppressClickRef.current) onOpen(wish.id, opener, openedGroupId); }}
    onEdit={ownerCollection ? () => cardProps.onEdit(wish.id) : undefined}
    onCreateList={ownerCollection ? () => cardProps.onCreateList(wish.id) : undefined}
  />;
  return <>
    <div className="wish-grid" ref={gridRef} aria-busy={saving || undefined}>
      {buildWishGroupGridItems({ wishes: orderedWishes, groups }).slice(0, visibleLimit).map((item) => item.type === "group"
        ? <WishGroupTile key={item.id} group={item.group} wishes={item.wishes} onOpen={() => setOpenedGroupId(item.id)} />
        : renderWish(item.wish))}
    </div>
    {openedGroup && <GroupDialog onClose={() => setOpenedGroupId(null)} suspended={detailsOpen} className="wish-group-open" aria-label={`Группа «${openedGroup.title}»`}>
      <WishGroupHeader
        group={openedGroup}
        viewerId={viewerId}
        shareToken={cardProps.shareToken}
        description={`${openedGroupWishes.length} ${wishCountNoun(openedGroupWishes.length)}`}
      />
      <div className="wish-grid">{openedGroupWishes.map(renderWish)}</div>
    </GroupDialog>}
  </>;
}

export function PublicProfile({ shared = false }) {
  const params = useParams();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: sessionLoading } = useSession();
  const { openProfileEditor, wishlistVersion } = useProfileEditor();
  const toast = useToast();
  const globalShareRef = useGlobalShareHandler();
  const { setCollection } = useContext(CollectionNavigationContext);
  const endpoint = shared ? "/shared/" + params.token : "/profile/" + params.username;
  const viewerId = user?.id;
  const { data, loading, error, reload, updateData } = useAsync(async () => ({
    ...await api.get(endpoint), requestEndpoint: endpoint, viewerId,
  }), [endpoint, user, wishlistVersion]);
  const publication = profilePublicationSection(params.space);
  const publicationListId = publication ? location.state?.publicationListId : null;
  const selected = shared ? "all" : params.listId || publicationListId || (params.wishId ? location.state?.listId : null) || "all";
  const requestedSpace = (!publication && params.space) || new URLSearchParams(location.search).get("tab") || (params.wishId ? location.state?.collectionSpace : null);
  const defaultSpace = !shared && data?.profile?.accountType === "business" ? data.profile.sellerSpace : null;
  const selectedSpace = SPACE_IDS.includes(requestedSpace) ? requestedSpace : SPACE_IDS.includes(defaultSpace) ? defaultSpace : "products";
  const [selectedWishId, setSelectedWishId] = useState(params.wishId || null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const listSettingsTriggerRef = useRef(null);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [wishModalSpace, setWishModalSpace] = useState("products");
  const [visibleLimit, setVisibleLimit] = useState(20);
  const loadMoreRef = useRef(null);
  const lastWishOpenerRef = useRef(null);

  useEffect(() => { setSelectedWishId(params.wishId || null); }, [params.wishId, endpoint]);
  useEffect(() => { setVisibleLimit(20); }, [selected, selectedSpace, endpoint]);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisibleLimit((value) => value + 20);
    }, { rootMargin: "500px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleLimit, data, selected, selectedSpace, publication]);

  useEffect(() => {
    const lists = shared ? [data?.list].filter(Boolean) : data?.lists || [];
    const list = lists.find((item) => item.id === (params.listId || publicationListId)) || (shared ? data?.list : null);
    const wish = [...(data?.wishes || []), ...(data?.sharedWishes || [])].find((item) => item.id === params.wishId);
    setCollection({ pathname: location.pathname, space: list ? listSpace(list) : wish ? wishSpaceId(wish, lists) : selectedSpace });
    return () => setCollection(null);
  }, [data, params.listId, params.wishId, publicationListId, shared, selectedSpace, location.pathname, setCollection]);

  useEffect(() => {
    if (shared || loading || data?.requestEndpoint !== endpoint || !data?.profile?.username || !params.username || params.username === data.profile.username) return;
    navigate(renamedProfileLocation(location, params.username, data.profile.username), { replace: true, state: location.state });
  }, [data?.profile?.username, data?.requestEndpoint, endpoint, loading, shared, params.username, location, navigate]);

  const renderCollectionState = ({ title, text, returnPath = APP_HOME, returnLabel = "В приложение", friendsContext = !shared }) => {
    const page = <div className="app-page wishes-page public-collection-page" data-public-collection-state>
      <div className="app-shell-chrome-spacer" aria-hidden="true" />
      <EmptyState
        icon={Gift}
        title={title}
        text={text}
        action={<Link to={returnPath} className={buttonVariants()}>{returnLabel}</Link>}
      />
    </div>;
    if (user) return <AppShell friendsContext={friendsContext} collectionChrome>{page}</AppShell>;
    return <div className="app-layout app-layout--dark public-collection-shell"><main className="app-main app-main--with-profile app-main--wishes">{page}</main></div>;
  };

  if (loading || sessionLoading || (data && (data.requestEndpoint !== endpoint || data.viewerId !== viewerId))) return <LoadingScreen />;
  if (error && !data && publication) return <ProfilePublicationsPage key={publication} section={publication} username={params.username} user={user} />;
  if (error && !data) return renderCollectionState({ title: "Такой список не нашёлся", text: error.message });

  const lists = shared ? [data.list] : data.lists;
  const visibleWishes = data.isOwner
    ? data.wishes
    : data.wishes.filter((wish) => wish.status === "active");
  const sharedWishes = data.isOwner && !shared ? data.sharedWishes || [] : [];
  const detailWishes = [...visibleWishes, ...sharedWishes];
  const routeWish = params.wishId ? detailWishes.find((wish) => wish.id === params.wishId) : null;
  const routeList = lists.find((list) => list.id === selected) || (routeWish && !location.state?.collectionPath ? lists.find((list) => !isGeneralList(list) && routeWish.listIds.includes(list.id)) : null);
  const routeSelectedList = routeList && !isGeneralList(routeList) ? routeList : null;
  const activeSpace = routeSelectedList ? listSpace(routeSelectedList) : routeWish ? wishSpaceId(routeWish, lists) : selectedSpace;
  const spaceSharedWishes = sharedWishes.filter((wish) => wish.space === activeSpace);
  const navigationLists = shared ? lists : orderWishListsForNavigation(lists.filter((list) => !isGeneralList(list) && listSpace(list) === activeSpace));
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const spaceWishes = shared ? visibleWishes : visibleWishes.filter((wish) => wishBelongsToSpace(wish, listsById, activeSpace));
  const unlistedWishes = shared ? spaceWishes : filterWishesWithoutList(spaceWishes, lists.filter((list) => !isGeneralList(list)));
  const ownerCollection = data.isOwner && !shared;
  const showAllCollection = shared || shouldShowUnsortedList(unlistedWishes.length) || navigationLists.length === 0;
  const selectedValue = resolveVisibleListSelection(routeSelectedList?.id || "all", navigationLists, showAllCollection);
  const selectedList = navigationLists.find((list) => list.id === selectedValue) || null;
  const wishes = shared
    ? visibleWishes
    : selectedValue === "all"
      ? unlistedWishes
      : spaceWishes.filter((wish) => wish.listIds.includes(selectedValue));
  const selectedWish = selectedWishId ? detailWishes.find((wish) => wish.id === selectedWishId) : null;
  const editingWish = editingWishId ? data.wishes.find((wish) => wish.id === editingWishId) : null;
  const invalidSelection = (params.space && !publication && !SPACE_IDS.includes(params.space)) || (!shared && params.listId && !routeList) || (params.wishId && !selectedWish);
  if (invalidSelection) {
    const notFoundTitle = params.wishId ? "Желание не найдено" : "Список не найден";
    const returnPath = shared ? `/s/${params.token}` : publicProfilePath(data.profile.username);
    return renderCollectionState({
      title: notFoundTitle,
      text: "Ссылка устарела или доступ к этой странице ограничен.",
      returnPath,
      returnLabel: "Вернуться к профилю",
      friendsContext: !data.isOwner && !shared,
    });
  }
  const wishCountForList = (listId) => visibleWishes.filter((wish) => wish.listIds.includes(listId)).length;
  const profileBasePath = shared ? `/s/${params.token}` : publicProfilePath(data.profile.username);
  const currentCollectionPath = shared
    ? profileBasePath
    : params.wishId && location.state?.collectionPath?.startsWith(`${profileBasePath}/`)
      ? location.state.collectionPath
      : selectedList && (params.listId || params.wishId || publicationListId)
        ? publicListPath(data.profile.username, selectedList.id)
        : publicSpacePath(data.profile.username, activeSpace);

  const selectCollection = (value) => {
    setSelectedWishId(null);
    if (shared) return;
    navigate(value === "all" ? publicSpacePath(data.profile.username, activeSpace) : publicListPath(data.profile.username, value));
  };

  const openWish = (id, opener = null, groupId = null) => {
    lastWishOpenerRef.current = opener;
    setSelectedWishId(id);
    navigate(`${profileBasePath}/wishes/${encodeURIComponent(id)}`, { state: { listId: selectedList?.id, collectionSpace: activeSpace, collectionPath: currentCollectionPath, groupId } });
  };

  const closeWish = () => {
    const wishId = selectedWishId;
    const opener = lastWishOpenerRef.current;
    setSelectedWishId(null);
    const destination = location.state?.fromWishlistBoard ? `${APP_HOME}?tab=${activeSpace}` : currentCollectionPath;
    navigate(destination, { replace: true, state: { groupId: location.state?.groupId } });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const fallback = [...document.querySelectorAll(".wish-card__open")].find((element) => element.dataset.wishId === wishId);
      const target = opener?.isConnected ? opener : fallback;
      target?.focus();
      lastWishOpenerRef.current = null;
    }));
  };

  const follow = async () => {
    if (!user) return navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
    try {
      const result = await api.post("/profile/" + data.profile.username + "/follow", {});
      toast(result.following ? "Вы подписались" : "Подписка отменена");
      reload();
    } catch (followError) {
      toast(followError.message, "error");
    }
  };

  const share = async () => {
    if (publication) {
      await navigator.clipboard.writeText(sharePageUrl(publication === "calendar" ? publicBookingPath(data.profile.username) : publicPublicationPath(data.profile.username, publication)));
      toast("Ссылка скопирована");
      return;
    }
    if (selectedList?.privacy === "private") {
      toast("Приватный список виден только вам", "error");
      return;
    }
    const path = selectedList?.privacy === "link" && selectedList.shareToken
      ? `/s/${selectedList.shareToken}`
      : currentCollectionPath;
    await navigator.clipboard.writeText(sharePageUrl(path));
    toast("Ссылка скопирована");
  };
  globalShareRef.current = share;

  const editWish = (id) => {
    if (!data.isOwner) return;
    setSelectedWishId(null);
    setEditingWishId(id);
    navigate(currentCollectionPath, { replace: true });
  };

  const createListForWish = (id) => {
    if (!data.isOwner || shared) return;
    setSelectedWishId(null);
    setListModal({ attachWishId: id });
    navigate(currentCollectionPath, { replace: true });
  };

  const saveProfileList = async (saved) => {
    const editingList = Boolean(listModal?.id);
    const attachWishId = listModal?.attachWishId;
    let attached = true;
    setListModal(null);
    if (saved?.id && attachWishId) {
      try {
        await api.post(`/wishes/${encodeURIComponent(attachWishId)}/lists/${encodeURIComponent(saved.id)}`, {});
        toast(`Желание добавлено в новый список «${saved.title}»`);
      } catch (listError) {
        attached = false;
        toast(listError.message, "error");
      }
    }
    await reload({ background: editingList });
    if (!editingList && saved?.id && attached && !shared) selectCollection(saved.id);
  };
  const openListSettings = (id, trigger) => {
    const list = navigationLists.find((entry) => entry.id === id);
    if (!list) return;
    listSettingsTriggerRef.current = trigger;
    setListModal(list);
  };
  const deleteProfileList = async () => {
    setListModal(null);
    if (selectedValue === listModal.id) selectCollection("all");
    await reload({ background: true });
  };

  const profileVisitor = !data.isOwner;
  const relationshipBlock = profileVisitor && !shared && <dl className="wishes-page__friend-links friend-profile-page__stats" aria-label="Связи профиля">
      <div><dt>Подписки</dt><dd>{data.followingCount}</dd></div>
      <div><dt>Подписчики</dt><dd>{data.followersCount}</dd></div>
    </dl>;
  const businessProfile = !shared && data.profile.accountType === "business";
  const businessStorefront = businessProfile && !params.listId && !params.wishId;
  const sellerProfile = businessStorefront && data.profile.businessCategory === "seller";
  const sellerSpace = activeSpace;
  const managesStorefront = sellerProfile && data.isOwner && user?.id === data.profile.id
    && canManageWishlistSpace(user, sellerSpace);
  const moodLevel = data.isOwner && data.profile.id === user?.id ? user.moodLevel ?? user.publicMood : data.profile.publicMood;
  const identity = (
    <div className="wishes-page__identity friend-profile-page__identity">
      {data.isOwner ? <ShadcnButton
        type="button"
        variant="ghost"
        className={cn("h-auto min-h-0 rounded-full p-0", !businessProfile && "persistent-profile-hero__avatar-button hover:bg-transparent dark:hover:bg-transparent active:translate-y-0")}
        aria-label={`Редактировать профиль ${data.profile.name}`}
        title={businessProfile ? undefined : "Редактировать профиль"}
        onClick={openProfileEditor}
      >
        <ProfilePortrait user={data.profile} moodLevel={moodLevel} />
      </ShadcnButton> : <ProfilePortrait user={data.profile} moodLevel={moodLevel} />}
      {businessProfile && <BusinessGiftAction business={data.profile} user={user} />}
      <div className="wishes-page__hero-copy">
        <h1 id="public-profile-name">{data.profile.name}</h1>
        {data.isOwner && <AppFriendsLink memberNumber={data.profile.memberNumber} />}
        {businessProfile && <span className="text-muted-foreground">Бизнес-аккаунт</span>}
        {businessProfile && data.profile.bio?.trim() && (
          <div className="typeset typeset-rollapp max-w-full">
            <p className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">{data.profile.bio}</p>
          </div>
        )}
      </div>
    </div>
  );
  if (isMobile && selectedWish && !editingWish) {
    return <WishDetailsModal screen wish={selectedWish} owner={data.isOwner && !selectedWish.sharedBy} profile={data.profile} lists={lists} wishes={data.wishes} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onEdit={ownerCollection ? () => editWish(selectedWish.id) : undefined} onCreateList={ownerCollection ? () => createListForWish(selectedWish.id) : undefined} onClose={closeWish} />;
  }
  const collectionPage = <div className={`app-page wishes-page public-collection-page ${profileVisitor ? "friend-profile-page" : ""}`} data-public-collection>
    <div className="app-shell-chrome-spacer" aria-hidden="true" />

    <section className={`wishes-page__hero public-collection-page__hero ${profileVisitor ? "friend-profile-page__hero" : ""}`} data-friend-profile={profileVisitor && !shared ? "" : undefined} aria-labelledby="public-profile-name">
      {identity}
      {relationshipBlock}
      <ControlBar className={`page-actions wishes-page__hero-actions ${!shared ? "horizontal-action-scroller" : ""} ${profileVisitor ? "friend-profile-page__actions" : ""}`} role="group" aria-label={businessStorefront ? "Действия с бизнес-профилем" : data.isOwner ? "Действия со списком желаний" : "Действия с профилем"}>
        {businessStorefront && data.isOwner ? <>
          <PageActionButton variant="outline" to="/app/business/access">Клиенты</PageActionButton>
        </> : ownerCollection ? null : data.isOwner && shared
          ? <PageActionButton onClick={() => navigate(publicListPath(data.profile.username, data.list.id))}>Открыть мой список</PageActionButton>
          : <PageActionButton
            variant={data.isFollowing ? "secondary" : "default"}
            className="min-w-[180px]"
            type="button"
            aria-pressed={data.isFollowing}
            onClick={follow}
          >{data.isFollowing ? "Отписаться" : "Подписаться"}</PageActionButton>}
        <ContactCardButton key={data.profile.username} profile={data.profile} canSign={data.isOwner} />
        {!shared && <ProfilePublicationLinks activeSection={publication}
          toSection={section => `${publicPublicationPath(data.profile.username, section)}?${new URLSearchParams({ tab: activeSpace })}`}
          state={{ publicationListId: routeSelectedList?.id }} />}
      </ControlBar>
    </section>

    {businessStorefront && !publication && <div className="page-stack">
      <BusinessGiftCertificates business={data.profile} user={user} />
      <section className="page-stack rollapp-body" aria-label="Товары и предложения бизнеса">
        {managesStorefront
          ? <WishlistBusinessManager user={user} space={sellerSpace} />
          : sellerProfile && <WishlistBusinessListing key={`${data.profile.username}:${sellerSpace}`} space={sellerSpace} business={data.profile.username} publicProfile />}
        <BusinessMarketplacePage key={`${data.profile.username}:${user?.id}`} user={user} businessUsername={data.profile.username} kind="store" hideEmpty={sellerProfile} />
      </section>
    </div>}

    {ownerCollection && !publication && !businessStorefront && <AddFab actions={[
      { label: "Добавить желание", onSelect: () => { setWishModalSpace(activeSpace); setWishModalOpen(true); } },
      { label: "Новый список", icon: ListPlus, onSelect: () => setListModal({}) },
    ]} />}
    {!publication && !businessStorefront && shouldShowListNavigation({ shared, listCount: navigationLists.length, unlistedCount: unlistedWishes.length }) && <WishListNavigation
      value={selectedValue}
      className={`public-collection-tabs ${profileVisitor ? "friend-profile-tabs" : ""}`}
      items={shared ? [] : navigationLists.map((list) => ({ id: list.id, title: listDisplayTitle(list), count: wishCountForList(list.id), privateList: ownerCollection && list.privacy === "private" }))}
      leadingItem={showAllCollection ? { title: shared ? listDisplayTitle(data.list) : UNSORTED_LIST_TITLE, count: unlistedWishes.length } : null}
      orderScope={ownerCollection && user?.id && data.profile.id === user.id ? `${user.id}:${activeSpace}` : null}
      onSelect={(id) => {
        if (id) selectCollection(id);
      }}
      onSettings={ownerCollection ? openListSettings : undefined}
      onOrderError={() => toast("Не удалось сохранить порядок списков", "error")}
    />}

    {publication && <ProfilePublicationsPage key={`${data.profile.username}:${user?.id || ""}:${publication}`}
      section={publication} username={data.profile.username} user={user} returnTo={currentCollectionPath} />}
    {!publication && !businessStorefront && (wishes.length
      ? <><PublicWishGrid
        key={`${endpoint}:${activeSpace}:${selectedValue}`}
        wishes={wishes}
        allWishes={data.wishes}
        detailsOpen={Boolean(selectedWish)}
        initialGroupId={location.state?.groupId || null}
        groups={filterWishGroups({ groups: data.groups, listId: shared ? data.list.id : selectedList?.id || lists.find(isGeneralList)?.id, selectedSpace: activeSpace, scopeBySpace: !selectedList, visibleWishIds: new Set(wishes.map((wish) => wish.id)) })}
        visibleLimit={visibleLimit}
        ownerCollection={ownerCollection}
        viewerId={user?.id}
        owner={data.isOwner}
        profile={data.profile}
        lists={lists}
        shareToken={shared ? params.token : ""}
        onChanged={() => reload({ background: true })}
        onOpen={openWish}
        onEdit={editWish}
        onCreateList={(wishId) => setListModal({ attachWishId: wishId })}
        onReorder={async (wishIds) => {
          await api.patch("/wishes/reorder", { wishIds });
          const positions = new Map(wishIds.map((id, index) => [id, index]));
          updateData((current) => ({ ...current, wishes: [...current.wishes].sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity)) }));
        }}
      />{visibleLimit < wishes.length && <div className="wish-load-more" ref={loadMoreRef}><LoaderCircle className="spin" /><span>Загружаем ещё желания…</span></div>}</>
      : !spaceSharedWishes.length && <EmptyState icon={Heart} title="В этом списке пока пусто" text={ownerCollection ? "Добавьте то, что действительно порадует." : "Загляните чуть позже — новая мечта наверняка появится."} />)}
    {!publication && !businessStorefront && <SharedWishes wishes={spaceSharedWishes} profile={data.profile} onOpen={openWish} onChanged={() => reload({ background: true })} />}
    {selectedWish && <WishDetailsModal wish={selectedWish} owner={data.isOwner && !selectedWish.sharedBy} profile={data.profile} lists={lists} wishes={data.wishes} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onEdit={ownerCollection ? () => editWish(selectedWish.id) : undefined} onCreateList={ownerCollection ? () => createListForWish(selectedWish.id) : undefined} onClose={closeWish} />}
    {editingWish && <WishModal wish={editingWish} space={activeSpace} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}
    {listModal && <ListModal list={listModal.id ? listModal : null} listsCount={lists.length} space={activeSpace} onClose={() => setListModal(null)} onSaved={saveProfileList} onDeleted={deleteProfileList} returnFocusRef={listModal.id ? listSettingsTriggerRef : undefined} />}
    {wishModalOpen && <WishModal space={wishModalSpace} initialListId={selectedList?.id} onClose={() => setWishModalOpen(false)} onSaved={() => { setWishModalOpen(false); reload(); }} />}
  </div>;

  if (user) return <AppShell friendsContext={!data.isOwner && !shared} collectionChrome>{collectionPage}</AppShell>;
  return <div className="app-layout app-layout--dark public-collection-shell"><main className="app-main app-main--with-profile app-main--wishes">{collectionPage}</main></div>;
}

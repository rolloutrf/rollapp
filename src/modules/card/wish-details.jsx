import { PurchasePlanMenuItem, WishPurchasePlan } from "../wishlist/wish-purchase-plan.jsx";
import { merchantProductUrl } from "../../../shared/modules/catalog-marketplace/product-links.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Gift,
  Hand,
  Heart,
  Link2,
  ListPlus,
  LockKeyhole,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ContentPage, ContentPageActions } from "@/components/content-page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MarketplaceOffers } from "@/modules/assistant/marketplace-offers.jsx";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { isGeneralList, listDisplayTitle } from "../categories/list-navigation.js";
import { publicWishPath } from "../../../shared/modules/profile/profile-links.js";
import { wishCardImageSources } from "../wishlist/wish-preview.jsx";
import { WishlistSnippetImage } from "./wishlist-snippet.jsx";
import { formatMoney } from "./price.jsx";
import { isYandexMapsUrl, formatEventDate } from "../wishlist/wish-form-data.jsx";
import { participantCountLabel } from "../catalog-marketplace/wish-catalog.jsx";
import { listSpace, wishSpaceId } from "../categories/wish-spaces.jsx";
import { useWishActions } from "../wishlist/wish-actions.jsx";
import { WishSaleMenuItem } from "./wish-card.jsx";
import { GiftSuggestionPeople } from "../assistant/gift-suggestions.jsx";
import { WishDeleteAlert } from "../wishlist/wish-delete-alert.jsx";
import { MediaNotesPanel } from "../wishlist/media-notes.jsx";
import { ScreenNavigation } from "../shell/screen-navigation.jsx";

const EMPTY_LISTS = Object.freeze([]);

export function WishDetailsModal({ wish, screen = false, owner = false, profile, shareToken = "", lists = EMPTY_LISTS, giftSuggestion = null, onChanged, onEdit, onCreateList, onClose }) {
  const isMobile = useIsMobile();
  const sharedBy = wish.sharedBy;
  const resolvedSpace = wishSpaceId(wish, lists);
  const offerWish = useMemo(
    () => ({ ...wish, space: resolvedSpace, url: merchantProductUrl(wish.url) }),
    [resolvedSpace, wish],
  );
  const categoryLists = useMemo(() => lists.filter((list) => !isGeneralList(list)), [lists]);
  const visibleLists = useMemo(() => categoryLists.filter((list) => listSpace(list) === resolvedSpace), [categoryLists, resolvedSpace]);
  const normalizeListIds = useCallback((ids = []) => categoryLists.filter((list) => ids.includes(list.id)).map((list) => list.id), [categoryLists]);
  const [listsOpen, setListsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [plannedWishId, setPlannedWishId] = useState(null);
  const canPlanPurchase = owner && !shareToken && wish.status === "active";
  const planOpen = canPlanPurchase && plannedWishId === wish.id;
  const [selectedListIds, setSelectedListIds] = useState(() => normalizeListIds(wish.listIds));
  const listMutationRef = useRef(false);
  const { busy, reserve, remove, leave, fulfilled, share, save, update, repeat } = useWishActions({
    wish,
    profile,
    lists,
    shareToken,
    onChanged,
    onDeleted: onClose,
  });
  const reservationUnavailable = wish.reservationCount > 0 && !wish.allowMultiple && !wish.reservedByMe;
  const secretListMembership = lists.some((list) => list.privacy === "private" && wish.listIds?.includes(list.id));
  const linkedLists = categoryLists.filter((list) => selectedListIds.includes(list.id));
  const linkedListNames = linkedLists.map(listDisplayTitle);
  const listLabel = linkedListNames.length > 1 ? `${linkedListNames[0]} +${linkedListNames.length - 1}` : linkedListNames[0] || "Без списка";
  const listTitleText = linkedListNames.join(", ") || "Без списка";
  const previewImage = wishCardImageSources(wish);

  useEffect(() => {
    if (!listMutationRef.current) setSelectedListIds(normalizeListIds(wish.listIds));
  }, [wish.id, wish.listIds, normalizeListIds]);

  useEffect(() => {
    if (!listsOpen && !menuOpen) return undefined;
    const closeTransientMenus = () => {
      setListsOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener("resize", closeTransientMenus);
    return () => window.removeEventListener("resize", closeTransientMenus);
  }, [listsOpen, menuOpen]);

  const toggleList = async (list) => {
    if (busy || listMutationRef.current) return;
    const previousIds = [...selectedListIds];
    const selected = previousIds.includes(list.id);
    const nextIds = selected
      ? previousIds.filter((id) => id !== list.id)
      : [...previousIds, list.id];
    listMutationRef.current = true;
    setSelectedListIds(nextIds);
    const updatedWish = await update(
      { listIds: nextIds },
      selected ? `Желание убрано из списка «${listDisplayTitle(list)}»` : `Желание добавлено в список «${listDisplayTitle(list)}»`,
    );
    setSelectedListIds(updatedWish ? normalizeListIds(updatedWish.listIds) : previousIds);
    listMutationRef.current = false;
  };

  const renderListPickerBody = () => <>
    <div className="card-menu__lists-head">
      <strong>Списки</strong>
      {onCreateList && <DropdownMenuItem className="card-menu__create-list" disabled={busy} onClick={onCreateList}><ListPlus /> Новый список</DropdownMenuItem>}
    </div>
    <div className="card-menu__list-scroll">
      {visibleLists.length ? visibleLists.map((list) => {
        const selected = selectedListIds.includes(list.id);
        return <DropdownMenuCheckboxItem
          key={list.id}
          className={`card-menu__list-row min-h-12 gap-2.5 px-2 py-1.5 [&_[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden ${selected ? "is-selected" : ""}`}
          checked={selected}
          disabled={busy}
          closeOnClick={false}
          onCheckedChange={() => toggleList(list)}
        >
          <span className="card-menu__list-title">
            {listDisplayTitle(list)}
            {list.privacy !== "public" && <small className="card-menu__list-privacy" aria-hidden="true">
              {list.privacy === "private" ? <LockKeyhole /> : list.privacy === "link" ? <Link2 /> : <Users />}
            </small>}
          </span>
          <Checkbox
            checked={selected}
            readOnly
            tabIndex={-1}
            role="presentation"
            aria-hidden="true"
            className="pointer-events-none ml-auto"
          />
        </DropdownMenuCheckboxItem>;
      }) : <p className="card-menu__lists-empty">В этом пространстве пока нет списков.</p>}
    </div>
  </>;

  if (isMobile && !screen) {
    return <ScreenNavigation to={shareToken ? `/s/${encodeURIComponent(shareToken)}/wishes/${encodeURIComponent(wish.id)}` : publicWishPath(profile, wish.id)} />;
  }
  const Title = screen ? "h1" : DrawerTitle;
  const Description = screen ? "p" : DrawerDescription;
  const mobilePage = screen && isMobile;
  const marketplacePrimary = mobilePage && owner && ["products", "food", "transport"].includes(resolvedSpace);
  const reservationLabel = wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать";
  const reservationText = mobilePage ? (wish.reservedByMe ? "Ваша бронь" : reservationUnavailable ? "Занято" : "Забронировать") : reservationLabel;
  const fulfillmentLabel = wish.status === "fulfilled" ? "Вернуть в активные" : "Отметить исполненным";
  const fulfillmentText = !screen || mobilePage ? (wish.status === "fulfilled" ? "В активные" : "Исполнить") : fulfillmentLabel;
  const ActionBar = screen ? ContentPageActions : DrawerFooter;
  const renderActions = (primaryAction) => (
          <ActionBar
            data-slot="wish-actions"
            className={screen ? "mx-auto flex w-full max-w-(--layout-compact-width) min-w-0 flex-nowrap items-center gap-2" : undefined}
            role="group"
            aria-label="Действия с желанием"
          >
            {sharedBy ? <ShadcnButton type="button" className="min-w-0 flex-1" variant="destructive" disabled={busy} onClick={leave}>Убрать с доски</ShadcnButton> : <>
            {primaryAction ?? <>
            {!owner && <ShadcnButton className="h-12 min-w-0 flex-1" disabled={busy || wish.status !== "active" || reservationUnavailable} aria-label={mobilePage ? (wish.reservedByMe ? "Ваша бронь: снять бронирование" : reservationUnavailable ? "Занято: желание уже забронировано" : "Забронировать") : reservationLabel} aria-busy={busy || undefined} onClick={reserve}>{busy ? <Spinner /> : !mobilePage && <Gift />}{reservationText}</ShadcnButton>}
            {!owner && !mobilePage && <ShadcnButton data-control-icon className={`size-12 shrink-0 ${wish.likedByMe ? "" : "text-destructive"}`} variant={wish.likedByMe ? "default" : "outline"} size="icon" disabled={busy || wish.likedByMe} aria-label={wish.likedByMe ? "Желание уже в вашем общем списке" : "Лайкнуть и добавить в общий список"} title={wish.likedByMe ? "Уже в вашем списке" : "Добавить к себе"} onClick={save}><Heart fill={wish.likedByMe ? "currentColor" : "none"} /></ShadcnButton>}
            {owner && <ShadcnButton className="h-12 min-w-0 flex-1" variant={screen && !mobilePage ? "outline" : "default"} disabled={busy} aria-label={mobilePage && wish.status !== "fulfilled" ? "Исполнить желание: отметить исполненным" : fulfillmentLabel} aria-busy={busy || undefined} onClick={fulfilled}>{busy ? <Spinner /> : <PackageCheck />}{fulfillmentText}</ShadcnButton>}
            </>}
            {!screen && owner && <ShadcnButton data-control-icon type="button" variant="destructive" size="icon" aria-label="Удалить желание" title="Удалить желание" aria-haspopup="dialog" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" /></ShadcnButton>}
            <DropdownMenu open={menuOpen} onOpenChange={(open) => {
              setMenuOpen(open);
              if (open) setListsOpen(false);
            }}>
              <DropdownMenuTrigger
                render={<ShadcnButton data-control-icon variant="outline" size="icon" className="size-12 shrink-0" />}
                aria-label={`Опции желания «${wish.title}»`}
                title="Опции желания"
              ><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent
                id={`wish-detail-menu-${wish.id}`}
                className="max-h-[calc(100dvh-12px)] w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
                align="end"
                sideOffset={4}
                aria-label={`Действия с желанием «${wish.title}»`}
              >
                <DropdownMenuGroup>
                  {!owner && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy || wish.status !== "active" || reservationUnavailable} onClick={reserve}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</DropdownMenuItem>}
                  {!owner && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy || wish.likedByMe} onClick={save}><Heart fill={wish.likedByMe ? "currentColor" : "none"} /> {wish.likedByMe ? "Уже в вашем списке" : "Лайкнуть и добавить к себе"}</DropdownMenuItem>}
                  {owner && wish.status === "fulfilled" ? <>
                    <WishSaleMenuItem wish={wish} space={resolvedSpace} disabled={busy} />
                    <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={fulfilled}><RotateCcw /> Не исполнено</DropdownMenuItem>
                    <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={repeat}><Plus /> Загадать ещё раз</DropdownMenuItem>
                    {onEdit && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
                  </> : owner && <>
                    {canPlanPurchase && <PurchasePlanMenuItem disabled={busy} onSelect={() => setPlannedWishId(wish.id)} />}
                    <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={fulfilled}><Check /> Исполнено</DropdownMenuItem>
                    {onEdit && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
                    {secretListMembership
                      ? <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled><LockKeyhole /> Секретное в списке</DropdownMenuItem>
                      : <DropdownMenuItem
                        className="min-h-12 gap-2 px-3 py-2 text-base"
                        disabled={busy}
                        onClick={() => {
                          const nextPrivacy = wish.privacy === "private" ? "inherit" : "private";
                          update(
                            { privacy: nextPrivacy },
                            nextPrivacy === "private" ? "Желание стало секретным" : "Желание снова видно друзьям",
                          );
                        }}
                      >
                        {wish.privacy === "private" ? <Eye /> : <EyeOff />}
                        {wish.privacy === "private" ? "Сделать видимым" : "Сделать секретным"}
                      </DropdownMenuItem>}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="card-menu__submenu-trigger min-h-12 gap-2 px-3 py-2 text-base" disabled={busy}><ListPlus /> <span>Добавить в список</span></DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        id={`wish-detail-action-lists-${wish.id}`}
                        className="max-h-[calc(100dvh-12px)] w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12"
                        sideOffset={4}
                        aria-label={`Списки желания «${wish.title}»`}
                      >
                        {renderListPickerBody()}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>}
                  {(!owner || wish.status !== "fulfilled") && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
                  {!owner && merchantProductUrl(wish.url) && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={merchantProductUrl(wish.url)} target="_blank" rel="noreferrer" />}><ExternalLink /> {isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Открыть магазин"}</DropdownMenuItem>}
                  {!owner && wish.fundraisingUrl && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink /> Перейти к сбору</DropdownMenuItem>}
                  {screen && owner && <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            </>}
          </ActionBar>
  );
  const detailsContent = (
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 [&>*]:shrink-0">
          <Card data-slot="wish-media" className="mx-auto w-full max-w-(--layout-compact-width) relative overflow-hidden p-0">
            <WishlistSnippetImage
              {...previewImage}
              className="block h-auto w-full"
              placeholderClassName="grid aspect-[4/3] w-full place-items-center text-muted-foreground [&>svg]:size-6"
              alt={`Фото желания «${wish.title}»`}
            />
            {wish.status === "fulfilled" && <Badge variant="secondary" className="absolute left-3 top-3"><Check data-icon="inline-start" aria-hidden="true" />Исполнено</Badge>}
          </Card>

          <DrawerHeader className="mx-auto w-full max-w-(--layout-compact-width) p-0 text-left!">
            <Title className={screen ? "text-2xl font-semibold" : undefined}><span className="sr-only">Желание: </span>{wish.title}</Title>
            {(sharedBy || wish.participants?.length > 0) && <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Users className="size-4 shrink-0" aria-hidden="true" /><span className="break-words">Совместное желание · {sharedBy ? sharedBy.name : wish.participants.map((person) => person.name).join(", ")}</span></span>}
            {(wish.vehicleMake || wish.vehicleModel) && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Car className="size-4" aria-hidden="true" />{[wish.vehicleMake, wish.vehicleModel].filter(Boolean).join(" ")}</span>}
            {(wish.price != null || wish.eventDate) && <div data-slot="wish-price-row" className="w-full">
              {wish.price != null && <strong data-slot="wish-price" className="whitespace-nowrap tabular-nums text-3xl leading-none font-semibold sm:text-4xl">{formatMoney(wish.price, wish.currency)}</strong>}
              {wish.eventDate && <span data-slot="wish-event-date" className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{formatEventDate(wish.eventDate)}</span>}
            </div>}
            <Description className={screen ? "text-muted-foreground" : undefined}>{wish.description || "Автор пока не добавил описание — иногда желание говорит само за себя."}</Description>
          </DrawerHeader>

          {owner && resolvedSpace === "media" && <MediaNotesPanel wish={wish} />}

          {!sharedBy && <div data-slot="wish-toolbar" className="mx-auto flex w-full max-w-(--layout-compact-width) min-w-0 items-center gap-2">
            {owner
              ? <DropdownMenu open={listsOpen} onOpenChange={(open) => {
                  setListsOpen(open);
                  if (open) setMenuOpen(false);
                }}>
                  <DropdownMenuTrigger
                    render={<ShadcnButton variant="outline" className="h-12 min-w-0 flex-1 justify-between" />}
                    aria-label={`Изменить списки желания. Сейчас: ${listTitleText}`}
                  >
                    <span className="truncate">{listLabel}</span>{listsOpen ? <X /> : <ChevronDown />}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    id={`wish-detail-lists-${wish.id}`}
                    className="max-h-[calc(100dvh-12px)] max-w-(--available-width) rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12"
                    align="start"
                    sideOffset={4}
                    aria-label={`Списки желания «${wish.title}»`}
                  >
                    {renderListPickerBody()}
                  </DropdownMenuContent>
                </DropdownMenu>
              : <Badge variant="secondary" className="max-w-full truncate">{listLabel}</Badge>}

          </div>}

          {owner && wish.status === "fulfilled" && giftSuggestion && <Card className="mx-auto w-full max-w-(--layout-compact-width) gap-3 p-4">
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold">Кому это ещё подарить</h3>
              <p className="text-sm text-muted-foreground">Это желание сейчас есть у {participantCountLabel(giftSuggestion.participantCount)}.</p>
            </div>
            <GiftSuggestionPeople suggestion={giftSuggestion} />
          </Card>}

          {["products", "food", "transport"].includes(resolvedSpace) && <MarketplaceOffers wish={offerWish} owner={owner} formatPrice={formatMoney} compactAction={marketplacePrimary} renderAction={marketplacePrimary ? renderActions : undefined} />}

          {merchantProductUrl(wish.url) && (sharedBy || !["products", "food"].includes(resolvedSpace)) && <a href={merchantProductUrl(wish.url)} target="_blank" rel="noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-(--layout-compact-width)" })}>{isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Где купить"} <ExternalLink data-icon="inline-end" aria-hidden="true" /></a>}
          {wish.fundraisingUrl && <a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-(--layout-compact-width)" })}>Перейти к сбору <ExternalLink data-icon="inline-end" aria-hidden="true" /></a>}

          {screen && !marketplacePrimary && renderActions()}

          {!owner && !sharedBy && <Alert className="mx-auto w-full max-w-(--layout-compact-width)"><Hand /><AlertDescription>Если вы решили исполнить это желание, обязательно забронируйте его, чтобы никто другой не подарил то же самое.</AlertDescription></Alert>}
          </div>
  );
  return <>
    {screen ? <ContentPage title="Желание" onBack={onClose} className="wish-item-page">{detailsContent}</ContentPage> : <Drawer open modal={!planOpen} disablePointerDismissal={planOpen} showSwipeHandle swipeDirection="right" onOpenChange={(open) => { if (!open && !planOpen) onClose(); }}>
      <DrawerContent className="wish-details-dialog app-drawer--compact">
        <DrawerClose render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10" size="icon-sm" />}><X /><span className="sr-only">Закрыть</span></DrawerClose>
        {detailsContent}
        {renderActions()}
      </DrawerContent>
    </Drawer>}
      {deleteOpen && <WishDeleteAlert open wish={wish} busy={busy} onOpenChange={setDeleteOpen} onConfirm={async () => { if (await remove()) setDeleteOpen(false); }} />}
      {planOpen && <WishPurchasePlan key={wish.id} wish={wish} onClose={() => setPlannedWishId(null)}
        onSaved={() => { Promise.resolve(onChanged?.()).catch(() => {}); }} />}
    </>;
}

import { PurchasePlanMenuItem } from "../wishlist/wish-purchase-plan.jsx";
import {
  LayoutGrid,
  PackagePlus,
  Tag,
  Archive,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  ListPlus,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  Trash2,
  Ungroup,
  Users,
} from "lucide-react";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { wishSalesPath } from "@/modules/wishlist/wishlist-business.jsx";
import { canManageWishSales } from "../../../shared/modules/wishlist/wishlist-business.js";
import { Link } from "react-router-dom";
import { useSession } from "../auth/session.jsx";
import { merchantProductUrl } from "../../../shared/modules/catalog-marketplace/product-links.js";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton } from "@/components/ui/button";
import { WishlistSnippet } from "@/modules/card/wishlist-snippet.jsx";
import { isGeneralList, listDisplayTitle } from "../categories/list-navigation.js";
import { wishPreviewImageUrl } from "../../../shared/modules/media-import/kinopoisk.js";
import { retailerPreviewImageUrl } from "../../../shared/modules/media-import/retailer-previews.js";
import { isVideoUrl } from "../../../shared/modules/media-import/video-links.js";
import { formatMoney } from "./price.jsx";
import { isYandexMapsUrl, formatEventDate } from "../wishlist/wish-form-data.jsx";
import { listSpace, wishSpaceId } from "../categories/wish-spaces.jsx";
import { useWishActions } from "../wishlist/wish-actions.jsx";
import { WishDeleteAlert } from "../wishlist/wish-delete-alert.jsx";

const placeSnippetAddress = (description = "") => String(description)
  .split(/\s+[•·]\s+/u, 1)[0]
  .trim();

function WishGroupingSubmenu({ wish, groups = [], busy = false, onCreate, onAdd }) {
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger className="card-menu__submenu-trigger min-h-12 gap-2 px-3 py-2 text-base" disabled={busy}>
      <PackagePlus /> <span>Добавить в группу</span>
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent
      id={`wish-groups-${wish.id}`}
      className="w-70 max-w-(--available-width) rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12"
      sideOffset={4}
      aria-label={`Группы для желания «${wish.title}»`}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel className="px-2 py-2 text-sm">Группы</DropdownMenuLabel>
        <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={onCreate}>
          <PackagePlus /> Обернуть в группу
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {groups.length > 0 && <DropdownMenuSeparator />}
      <div className="max-h-[22.75rem] overflow-y-auto overscroll-contain">
        {groups.map((group) => <DropdownMenuItem
          key={group.id}
          className="min-h-12 gap-2 px-3 py-2 text-base"
          disabled={busy}
          onClick={() => onAdd(group.id)}
        >
          <LayoutGrid />
          <span className="min-w-0 flex-1 truncate">{group.title}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{group.wishIds?.length || 0}</span>
        </DropdownMenuItem>)}
      </div>
    </DropdownMenuSubContent>
  </DropdownMenuSub>;
}

export function WishSaleMenuItem({ wish, space, disabled }) {
  const { user } = useSession();
  if (!canManageWishSales(user, space)) return null;
  return <DropdownMenuItem
    className="min-h-12 gap-2 px-3 py-2 text-base"
    disabled={disabled}
    render={<Link to={wishSalesPath(space, wish.id)} />}
  ><Tag aria-hidden="true" /> Выставить на продажу</DropdownMenuItem>;
}

export function WishCard({ wish, owner = false, onChanged, onOpen, onEdit, onPlanPurchase, onCreateList, groupOptions = [], onCreateGroup, onAddToGroup, onRemoveFromGroup, groupBusy = false, profile, lists = [], shareToken = "", draggable = false, nativeDraggable = draggable, dragGroupId = "", onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, onPointerDown, isDropTarget = false, isDragging = false }) {
  const [menu, setMenu] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [removingFromGroup, setRemovingFromGroup] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState(() => [...(wish.listIds || [])]);
  const listMutationRef = useRef(false);
  const { busy, remove, leave, fulfilled, share, save, update, repeat } = useWishActions({ wish, profile, lists, shareToken, onChanged });
  const interactionBusy = busy || grouping || removingFromGroup || groupBusy;
  const categoryLists = lists.filter((list) => !isGeneralList(list));
  const cardSpace = wishSpaceId(wish, lists);
  const visibleLists = categoryLists.filter((list) => listSpace(list) === cardSpace);
  const placeAddress = cardSpace === "places" ? placeSnippetAddress(wish.description) : "";
  const secretListMembership = lists.some((list) => list.privacy === "private" && wish.listIds?.includes(list.id));
  const previewImageUrl = wishPreviewImageUrl(wish);
  const videoPreview = isVideoUrl(wish.url);

  useEffect(() => {
    if (!listMutationRef.current) setSelectedListIds([...(wish.listIds || [])]);
  }, [wish.id, wish.listIds]);
  useEffect(() => {
    if (groupBusy) setMenu(false);
  }, [groupBusy]);

  const closeMenu = () => {
    setMenu(false);
  };

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
    setSelectedListIds(updatedWish ? [...(updatedWish.listIds || [])] : previousIds);
    listMutationRef.current = false;
  };

  const removeFromGroup = async () => {
    if (!onRemoveFromGroup || interactionBusy) return;
    setRemovingFromGroup(true);
    try {
      await onRemoveFromGroup();
    } finally {
      setRemovingFromGroup(false);
    }
  };

  const runGroupAction = async (action) => {
    if (!action || interactionBusy) return;
    setGrouping(true);
    try {
      await action();
    } finally {
      setGrouping(false);
    }
  };

  return (
    <>
    <WishlistSnippet
      title={wish.title}
      price={[
        wish.price != null ? formatMoney(wish.price, wish.currency) : "",
        wish.eventDate ? formatEventDate(wish.eventDate) : "",
      ].filter(Boolean).join(" · ")}
      imageUrl={previewImageUrl}
      fallbackImageUrl={retailerPreviewImageUrl(wish.url)}
      video={videoPreview}
      mediaBadge={wish.status === "fulfilled" && (
        <Badge variant="secondary"><Check data-icon="inline-start" aria-hidden="true" />Исполнено</Badge>
      )}
      openButton={onOpen && {
        draggable: nativeDraggable,
        "data-wish-id": wish.id,
        "aria-label": `Открыть желание «${wish.title}»`,
        "aria-haspopup": "dialog",
        onClick: (event) => { closeMenu(); onOpen(event.currentTarget); },
      }}
      beforeMedia={draggable && <span className="wish-card__drag-handle" data-wish-drag-handle draggable={nativeDraggable} aria-hidden="true"><GripVertical /></span>}
      data-group-wish-id={wish.id}
      data-wish-group-id={dragGroupId || undefined}
      draggable={nativeDraggable}
      aria-busy={groupBusy || undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPointerDown={onPointerDown}
      className={cn(
        cardSpace === "places" && "wish-card--place",
        wish.status === "fulfilled" && "is-fulfilled",
        draggable && "is-draggable",
        isDropTarget && "is-group-target",
        isDragging && "is-dragging",
      )}
      address={placeAddress}
      details={(wish.sharedBy || wish.participants?.length > 0) && (
        <span className="flex min-w-0 items-center gap-1"><Users className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{wish.sharedBy?.name || "Совместное"}</span></span>
      )}
      menu={(
          <DropdownMenu open={menu} onOpenChange={setMenu}>
            <DropdownMenuTrigger
              render={<ShadcnButton type="button" variant="ghost" size="icon" className="wish-card__menu-trigger size-9 active:translate-y-0" disabled={interactionBusy} />}
              aria-label={`Опции желания «${wish.title}»`}
              aria-controls={menu ? `wish-menu-${wish.id}` : undefined}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={`wish-menu-${wish.id}`}
              align="end"
              sideOffset={8}
              className="wish-card-actions-menu w-70 rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
              aria-label={`Действия с желанием «${wish.title}»`}
            >
              {!owner && !wish.sharedBy && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={save}><Archive /> Сохранить к себе</DropdownMenuItem>}
              {owner && wish.status === "fulfilled" ? <>
                <WishSaleMenuItem wish={wish} space={cardSpace} disabled={interactionBusy} />
                <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={fulfilled}><RotateCcw /> Не исполнено</DropdownMenuItem>
                <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={repeat}><Plus /> Загадать ещё раз</DropdownMenuItem>
                {onEdit && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
              </> : owner && <>
                {wish.status === "active" && onPlanPurchase && <PurchasePlanMenuItem disabled={busy} onSelect={onPlanPurchase} />}
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
              </>}
              {owner && <DropdownMenuSub>
                <DropdownMenuSubTrigger className="card-menu__submenu-trigger min-h-12 gap-2 px-3 py-2 text-base" disabled={busy}>
                  <ListPlus /> <span>Добавить в список</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  id={`wish-lists-${wish.id}`}
                  className="wish-card-lists-menu w-70 rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
                  aria-label={`Списки желания «${wish.title}»`}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="px-2 py-2 text-sm">Списки</DropdownMenuLabel>
                    {onCreateList && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={onCreateList}><ListPlus /> Новый список</DropdownMenuItem>}
                  </DropdownMenuGroup>
                  {(onCreateList || visibleLists.length > 0) && <DropdownMenuSeparator />}
                  <div className="max-h-[22.75rem] overflow-y-auto overscroll-contain">
                    {visibleLists.length ? visibleLists.map((list) => {
                      const selected = selectedListIds.includes(list.id);
                      return <DropdownMenuCheckboxItem
                        key={list.id}
                        className={`wish-card-list-item min-h-14 gap-2.5 px-2 py-1.5 pr-8 text-base ${selected ? "is-selected" : ""}`}
                        checked={selected}
                        disabled={busy}
                        closeOnClick={false}
                        onCheckedChange={() => toggleList(list)}
                      >
                        <span className="wish-card-list-icon grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden="true"><ListPlus /></span>
                        <span className="min-w-0 flex-1 truncate">
                          {listDisplayTitle(list)}
                          {list.privacy !== "public" && <small className="ml-1 inline-flex align-middle text-muted-foreground" aria-hidden="true">
                            {list.privacy === "private" ? <LockKeyhole /> : list.privacy === "link" ? <Link2 /> : <Users />}
                          </small>}
                        </span>
                      </DropdownMenuCheckboxItem>;
                    }) : <p className="px-2 py-6 text-center text-xs text-muted-foreground">В этом пространстве пока нет списков.</p>}
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>}
              {owner && onCreateGroup && <WishGroupingSubmenu
                wish={wish}
                groups={groupOptions}
                busy={interactionBusy}
                onCreate={() => runGroupAction(onCreateGroup)}
                onAdd={(groupId) => runGroupAction(() => onAddToGroup?.(groupId))}
              />}
              {owner && onRemoveFromGroup && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={interactionBusy} onClick={removeFromGroup}>{removingFromGroup || groupBusy ? <LoaderCircle className="spin" /> : <Ungroup />} Убрать из группы</DropdownMenuItem>
              </>}
              {!wish.sharedBy && (!owner || wish.status !== "fulfilled") && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
              {!owner && merchantProductUrl(wish.url) && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={merchantProductUrl(wish.url)} target="_blank" rel="noreferrer" />}><ExternalLink /> {isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Открыть магазин"}</DropdownMenuItem>}
              {!owner && wish.fundraisingUrl && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink /> Перейти к сбору</DropdownMenuItem>}
              {wish.sharedBy && <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={leave}><LogOut /> Убрать с доски</DropdownMenuItem>}
              {owner && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
      )}
    />
    {deleteOpen && <WishDeleteAlert open wish={wish} busy={busy} onOpenChange={setDeleteOpen} onConfirm={async () => { if (await remove()) setDeleteOpen(false); }} />}
    </>
  );
}

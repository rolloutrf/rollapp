import { sharePageUrl } from "../../applications/location.js";
import { AddFab } from "@/components/add-fab";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Heart, ListPlus } from "lucide-react";
import { api } from "../runtime/api.js";
import { createCardDragPreview, guardDragClick } from "../../lib/card-drag-preview.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button as ShadcnButton } from "@/components/ui/button";
import { WishListNavigation } from "@/modules/categories/wish-list-navigation.jsx";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  isGeneralList,
  listDisplayTitle,
  orderWishListsForNavigation,
  resolveVisibleListSelection,
  shouldShowListNavigation,
  shouldShowUnsortedList,
  UNSORTED_LIST_TITLE,
} from "../categories/list-navigation.js";
import { useSphereSharing } from "../access/sphere-sharing.jsx";
import {
  buildWishGroupGridItems,
  disbandWishGroupFromDashboard,
  filterWishGroups,
  moveWishGroupInDashboard,
  moveWishGroupToTarget,
} from "./wish-groups.js";
import { filterWishesWithoutList } from "./wish-lists.js";
import { GROUP_INTENT_DELAY_MS } from "../../lib/card-order.js";
import {
  moveWishToTargetPosition,
  moveWishWithinSubset,
  reorderScopeWishIds,
  resolveWishHoverMode,
  wishRectOverlapRatio,
} from "./wish-order.js";
import {
  publicSpacePath,
  publicListPath,
  publicWishPath,
  publicPublicationPath,
  publicBookingPath,
  profilePublicationSection,
} from "../../../shared/modules/profile/profile-links.js";
import { requestPreviewBackfill } from "./wish-preview.jsx";
import { scheduleDocumentScrollUnlock } from "../shell/document-scroll.jsx";
import { attachWishesToDashboardList } from "./wish-form-data.jsx";
import { SPACE_IDS, listSpace, wishBelongsToSpace } from "../categories/wish-spaces.jsx";
import { useAsync } from "../shell/use-async.jsx";
import { useSession } from "../auth/session.jsx";
import { useToast } from "../shell/toast.jsx";
import { useProfileEditor } from "../profile/profile-editor.jsx";
import { useGlobalShareHandler } from "../shell/global-share.jsx";
import { EmptyState, LoadingScreen } from "../shell/page-feedback.jsx";
import { wishlistPublicationPath, WishesProfileControls } from "./wish-navigation.jsx";
import { WishCard } from "../card/wish-card.jsx";
import { SharedWishes } from "./public-wishlist.jsx";
import { WishGroupTile, WishGroupDialog } from "./wish-group.jsx";
import { GiftSuggestionsPanel } from "../assistant/gift-suggestions.jsx";
import { WishDetailsModal } from "../card/wish-details.jsx";
import { ListModal, WishModal } from "./wish-editor.jsx";
import { ProfilePublicationsPage } from "../profile/public-pages.jsx";

export function WishesPage({ onAdd, version }) {
  const { user } = useSession();
  const { isOwner } = useSphereSharing();
  const { wishlistVersion } = useProfileEditor();
  const location = useLocation();
  const navigate = useNavigate();
  const publication = isOwner && user?.username ? profilePublicationSection(new URLSearchParams(location.search).get("publication")) : null;
  const toast = useToast();
  const globalShareRef = useGlobalShareHandler();
  const isMobile = useIsMobile();
  const viewerId = user?.id;
  const { data, loading, error, reload, updateData } = useAsync(async () => ({
    ...await api.get("/dashboard"), viewerId,
  }), [version, wishlistVersion, viewerId]);
  const { data: giftSuggestionData, reload: reloadGiftSuggestions } = useAsync(() => api.get("/gift-suggestions"), [version]);
  const [selected, setSelected] = useState("all");
  const [selectedSpace, setSelectedSpace] = useState(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return SPACE_IDS.includes(tab) ? tab : "products";
  });
  const [selectedWishId, setSelectedWishId] = useState(null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const listSettingsTriggerRef = useRef(null);
  const [draggedWishId, setDraggedWishId] = useState(null);
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [orderedWishIds, setOrderedWishIds] = useState([]);
  const [openedGroupId, setOpenedGroupId] = useState(null);
  const groupOpenerRef = useRef(null);
  const [removingGroupId, setRemovingGroupId] = useState(null);
  const pointerDragRef = useRef(null);
  const pointerTimerRef = useRef(null);
  const reorderTimerRef = useRef(null);
  const reorderTargetRef = useRef(null);
  const pointerListenerCleanupRef = useRef(null);
  const pointerAutoScrollFrameRef = useRef(null);
  const pointerAutoScrollTimeRef = useRef(null);
  const groupTimerRef = useRef(null);
  const hoverTargetRef = useRef(null);
  const armedDropTargetRef = useRef(null);
  const lastReorderTargetRef = useRef(null);
  const orderedWishIdsRef = useRef([]);
  const dragInitialOrderRef = useRef([]);
  const flipPositionsRef = useRef(new Map());
  const pointerGhostRef = useRef(null);
  const pointerGhostSizeRef = useRef({ width: 0, height: 0 });
  const suppressOpenRef = useRef(false);
  const clickGuardCleanupRef = useRef(null);
  const dragSessionRef = useRef(false);
  const dragSourceWishIdRef = useRef(null);
  const dragSourceGroupRef = useRef(null);
  const dragScopeRef = useRef(null);
  const orderDirtyRef = useRef(false);
  const pendingOrderRef = useRef(null);
  const orderPersistingRef = useRef(false);
  const deferredAuthoritativeOrderRef = useRef(null);
  const removingGroupIdRef = useRef(null);
  const cancelDragRef = useRef(null);
  useLayoutEffect(() => { cancelDragRef.current?.(); }, [selectedSpace, selected, openedGroupId, user?.id, publication]);
  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    const nextSpace = SPACE_IDS.includes(tab) ? tab : "products";
    if (nextSpace === selectedSpace) return;
    setSelectedSpace(nextSpace);
    setSelected("all");
    setOpenedGroupId(null);
  }, [location.search, selectedSpace]);
  const wishOrderKey = (data?.wishes || []).map((wish) => wish.id).join("\0");
  useEffect(() => {
    if (selectedWishId || editingWishId || listModal || openedGroupId) return undefined;
    return scheduleDocumentScrollUnlock();
  }, [selectedWishId, editingWishId, listModal, openedGroupId]);
  useEffect(() => {
    if (data?.wishes) {
      const ids = data.wishes.map((wish) => wish.id);
      if (dragSessionRef.current || orderPersistingRef.current) {
        deferredAuthoritativeOrderRef.current = ids;
        return;
      }
      orderedWishIdsRef.current = ids;
      setOrderedWishIds(ids);
    }
  }, [wishOrderKey]);
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const request = requestPreviewBackfill(user.id);
    request.promise
      .then((result) => {
        if (cancelled || result.updated <= 0 || request.refreshClaimed) return;
        request.refreshClaimed = true;
        void reload({ background: true }).catch(() => { request.refreshClaimed = false; });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, reload]);
  useEffect(() => () => {
    clearTimeout(pointerTimerRef.current);
    clearTimeout(reorderTimerRef.current);
    clearTimeout(groupTimerRef.current);
    cancelAnimationFrame(pointerAutoScrollFrameRef.current);
    pointerListenerCleanupRef.current?.();
    clickGuardCleanupRef.current?.();
    const drag = pointerDragRef.current; pointerDragRef.current = null;
    if (drag?.captureTarget.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId);
    pointerGhostRef.current?.remove();
  }, []);
  useLayoutEffect(() => {
    if (!flipPositionsRef.current.size) return;
    const cards = document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id], .wishes-page > .wish-grid [data-group-id], .wish-group-open > .wish-grid [data-group-wish-id]");
    cards.forEach((card) => {
      const key = card.dataset.groupWishId ? `wish:${card.dataset.groupWishId}` : `group:${card.dataset.groupId}`;
      const previous = flipPositionsRef.current.get(key);
      if (!previous || card.dataset.groupWishId === draggedWishId || card.dataset.groupId === draggedGroupId) return;
      const next = card.getBoundingClientRect();
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      card.animate(
        [{ transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: 330, easing: "cubic-bezier(.2,.82,.2,1)" },
      );
    });
    flipPositionsRef.current = new Map();
  }, [orderedWishIds, draggedWishId, draggedGroupId]);
  const orderIndex = new Map(orderedWishIds.map((id, index) => [id, index]));
  const dashboardWishes = data?.wishes || [];
  const dashboardLists = data?.lists || [];
  const visibleWishes = [...dashboardWishes]
    .sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const listsById = new Map(dashboardLists.map((list) => [list.id, list]));
  const allCategoryLists = dashboardLists.filter((list) => !isGeneralList(list));
  const categoryLists = orderWishListsForNavigation(allCategoryLists.filter((list) => listSpace(list) === selectedSpace));
  const generalList = dashboardLists.find(isGeneralList) || null;
  const spaceWishes = visibleWishes.filter((wish) => wishBelongsToSpace(wish, listsById, selectedSpace));
  const unlistedWishes = filterWishesWithoutList(spaceWishes, allCategoryLists);
  const selectedValue = resolveVisibleListSelection(
    selected,
    categoryLists,
    shouldShowUnsortedList(unlistedWishes.length),
  );
  const groupingListId = selectedValue === "all" ? generalList?.id : selectedValue;
  const wishCountForList = (listId) => spaceWishes.filter((wish) => wish.listIds.includes(listId)).length;
  const wishes = selectedValue === "all" ? unlistedWishes : spaceWishes.filter((wish) => wish.listIds.includes(selectedValue));
  const groups = filterWishGroups({
    groups: data?.groups,
    listId: groupingListId,
    selectedSpace,
    scopeBySpace: selectedValue === "all",
    visibleWishIds: new Set(wishes.map((wish) => wish.id)),
  });
  const groupedWishIds = new Set(groups.flatMap((group) => group.wishIds));
  const ungroupedWishes = wishes.filter((wish) => !groupedWishIds.has(wish.id));
  const openedGroup = groups.find((group) => group.id === openedGroupId) || null;
  const openedGroupWishes = openedGroup ? wishes.filter((wish) => openedGroup.wishIds.includes(wish.id)) : [];
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const gridItems = buildWishGroupGridItems({ wishes, groups });
  const selectedList = categoryLists.find((list) => list.id === selectedValue) || null;
  const groupMoveTargets = [
    ...(generalList && groupingListId !== generalList.id ? [{ ...generalList, title: UNSORTED_LIST_TITLE }] : []),
    ...categoryLists.filter((list) => list.id !== groupingListId),
  ];
  const sharedWishes = data?.sharedWishes || [];
  const spaceSharedWishes = sharedWishes.filter((wish) => wish.space === selectedSpace);
  const selectedWish = selectedWishId ? [...dashboardWishes, ...sharedWishes].find((wish) => wish.id === selectedWishId) : null;
  const editingWish = editingWishId ? dashboardWishes.find((wish) => wish.id === editingWishId) : null;
  const giftSuggestions = (giftSuggestionData?.items || []).filter((item) => item.space === selectedSpace);
  const selectedWishSuggestion = selectedWishId
    ? (giftSuggestionData?.items || []).find((item) => item.wishId === selectedWishId)
    : null;
  useEffect(() => {
    if (selected !== selectedValue) {
      setSelected(selectedValue);
      setOpenedGroupId(null);
    }
  }, [selected, selectedValue]);
  useEffect(() => {
    if (!openedGroupId) return undefined;
    if (!openedGroup) {
      setOpenedGroupId(null);
    }
  }, [openedGroupId, openedGroup?.id]);
  const profileControls = <WishesProfileControls selectedSpace={selectedSpace} />;
  const wishlistPath = wishlistPublicationPath(selectedSpace);
  const publicationContent = publication && <ProfilePublicationsPage key={`${user.id}:${user.username}:${publication}`} section={publication}
    username={user.username} user={user} returnTo={wishlistPath} showIntro={publication !== "calendar"} />;
  const loadError = error && <Alert variant="destructive" className="not-typeset rollapp-body">
    <AlertTitle>Не удалось загрузить Вишлист</AlertTitle>
    <AlertDescription className="grid gap-3">{error.message}<ShadcnButton type="button" variant="outline" onClick={() => reload({ background: Boolean(data) }).catch(() => {})}>Повторить</ShadcnButton></AlertDescription>
  </Alert>;
  if (data && data.viewerId !== viewerId) return <LoadingScreen compact />;
  const share = async () => {
    if (publication) {
      await navigator.clipboard.writeText(sharePageUrl(publication === "calendar" ? publicBookingPath(user.username) : publicPublicationPath(user.username, publication)));
      toast("Ссылка скопирована");
      return;
    }
    if (selectedValue === "secret" || selectedList?.privacy === "private") {
      toast("Приватный список виден только вам", "error");
      return;
    }
    const url = selectedValue === "all"
      ? sharePageUrl(publicSpacePath(user.username, selectedSpace))
      : selectedList?.privacy === "link"
        ? sharePageUrl(`/s/${selectedList.shareToken}`)
        : sharePageUrl(publicListPath(user.username, selectedList?.id));
    await navigator.clipboard.writeText(url);
    toast("Ссылка на список скопирована");
  };
  globalShareRef.current = share;
  if (loading || (error && !data)) {
    return <div className="app-page wishes-page">{profileControls}{publicationContent || (loading ? <LoadingScreen compact /> : loadError)}</div>;
  }
  const editWish = (id) => { setSelectedWishId(null); setEditingWishId(id); };
  const refreshWishes = () => Promise.all([
    reload({ background: true }),
    reloadGiftSuggestions({ background: true }),
  ]);
  const saveList = async (saved) => {
    const editingList = Boolean(listModal?.id);
    const attachWishId = listModal?.attachWishId;
    let attached = true;
    setListModal(null);
    if (saved?.id && attachWishId) {
      try {
        await api.post(`/wishes/${encodeURIComponent(attachWishId)}/lists/${encodeURIComponent(saved.id)}`, {});
        toast(`Желание добавлено в новый список «${saved.title}»`);
      } catch (error) {
        attached = false;
        toast(error.message, "error");
      }
    }
    await reload({ background: editingList });
    if (!editingList && saved?.id && attached) setSelected(saved.id);
  };
  const openListSettings = (id, trigger) => {
    const list = categoryLists.find((entry) => entry.id === id);
    if (!list) return;
    listSettingsTriggerRef.current = trigger;
    setListModal(list);
  };
  const deleteList = async () => {
    setListModal(null);
    if (selectedValue === listModal.id) setSelected("all");
    await reload({ background: true });
  };
  const clearGroupIntent = () => {
    clearTimeout(groupTimerRef.current);
    groupTimerRef.current = null;
    hoverTargetRef.current = null;
    armedDropTargetRef.current = null;
    setDropTarget(null);
  };
  const clearReorderIntent = () => {
    clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = null;
    reorderTargetRef.current = null;
  };
  const captureGridPositions = () => {
    const positions = new Map();
    document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id], .wishes-page > .wish-grid [data-group-id], .wish-group-open > .wish-grid [data-group-wish-id]").forEach((card) => {
      const key = card.dataset.groupWishId ? `wish:${card.dataset.groupWishId}` : `group:${card.dataset.groupId}`;
      positions.set(key, card.getBoundingClientRect());
    });
    flipPositionsRef.current = positions;
  };
  const removePointerGhost = () => {
    pointerGhostRef.current?.remove();
    pointerGhostRef.current = null;
    pointerGhostSizeRef.current = { width: 0, height: 0 };
  };
  const createPointerGhost = (source, clientX, clientY) => {
    removePointerGhost();
    const rect = source.getBoundingClientRect();
    const ghost = createCardDragPreview(source, "wish-card--drag-preview");
    ghost.style.setProperty("--drag-width", `${rect.width}px`);
    ghost.style.setProperty("--drag-x", `${rect.left}px`);
    ghost.style.setProperty("--drag-y", `${rect.top}px`);
    document.body.appendChild(ghost);
    pointerGhostRef.current = ghost;
    pointerGhostSizeRef.current = { width: rect.width, height: rect.height, offsetX: clientX - rect.left, offsetY: clientY - rect.top };
  };
  const movePointerGhost = (clientX, clientY) => {
    const ghost = pointerGhostRef.current;
    if (!ghost) return;
    const { offsetX, offsetY } = pointerGhostSizeRef.current;
    ghost.style.setProperty("--drag-x", `${clientX - offsetX}px`);
    ghost.style.setProperty("--drag-y", `${clientY - offsetY}px`);
  };
  const persistOrder = (ids) => {
    pendingOrderRef.current = ids;
    if (orderPersistingRef.current) return;
    orderPersistingRef.current = true;
    void (async () => {
      let restoreAuthoritativeOrder = false;
      while (pendingOrderRef.current) {
        const nextOrder = pendingOrderRef.current;
        pendingOrderRef.current = null;
        try {
          await api.patch("/wishes/reorder", { wishIds: nextOrder });
          restoreAuthoritativeOrder = false;
        } catch (error) {
          toast(error.message, "error");
          restoreAuthoritativeOrder = true;
          const fresh = await api.get("/dashboard").catch(() => null);
          if (fresh?.wishes) {
            deferredAuthoritativeOrderRef.current = fresh.wishes.map((wish) => wish.id);
          }
        }
      }
      orderPersistingRef.current = false;
      if (restoreAuthoritativeOrder && !dragSessionRef.current && Array.isArray(deferredAuthoritativeOrderRef.current)) {
        orderedWishIdsRef.current = [...deferredAuthoritativeOrderRef.current];
        setOrderedWishIds(orderedWishIdsRef.current);
        deferredAuthoritativeOrderRef.current = null;
      } else if (!restoreAuthoritativeOrder) {
        deferredAuthoritativeOrderRef.current = null;
      }
    })();
  };
  const reorderWish = (sourceId, targetId, targetKind = "wish") => {
    const targetKey = `${targetKind}:${targetId}`;
    if (!sourceId || !targetId || sourceId === targetId || lastReorderTargetRef.current === targetKey) return;
    const dragScope = dragScopeRef.current;
    const targetGroup = targetKind === "group" ? groupsById.get(targetId) : null;
    if (targetKind === "group" && (dragScope?.kind !== "list" || !dragScope.wishIds.has(sourceId) || !targetGroup)) return;
    const next = targetGroup
      ? moveWishGroupToTarget(orderedWishIdsRef.current, [sourceId], targetGroup.wishIds)
      : dragScope?.wishIds
        ? moveWishWithinSubset(orderedWishIdsRef.current, dragScope.wishIds, sourceId, targetId)
        : moveWishToTargetPosition(orderedWishIdsRef.current, sourceId, targetId);
    if (next === orderedWishIdsRef.current) return;
    lastReorderTargetRef.current = targetKey;
    orderDirtyRef.current = true;
    orderedWishIdsRef.current = next;
    captureGridPositions();
    setOrderedWishIds(next);
  };
  const queueWishReorder = (sourceId, targetId, targetKind = "wish", pointerDrag = null) => {
    const target = `${targetKind}:${targetId}`;
    if (reorderTargetRef.current === target) return;
    clearReorderIntent();
    reorderTargetRef.current = target;
    reorderTimerRef.current = setTimeout(() => {
      if (!dragSessionRef.current || dragSourceWishIdRef.current !== sourceId
        || pointerDragRef.current !== pointerDrag || reorderTargetRef.current !== target
        || (pointerDrag && pointerDrag.hoverTarget !== `reorder:${target}`)) return;
      reorderWish(sourceId, targetId, targetKind);
    }, 120);
  };
  const reorderGroup = (sourceGroupId, target) => {
    if (!sourceGroupId || !target?.id) return;
    const targetKey = `${target.kind}:${target.id}`;
    if (sourceGroupId === target.id || lastReorderTargetRef.current === targetKey) return;
    const sourceGroup = groupsById.get(sourceGroupId);
    const targetWishIds = target.kind === "group"
      ? groupsById.get(target.id)?.wishIds
      : [target.id];
    const next = moveWishGroupToTarget(orderedWishIdsRef.current, sourceGroup?.wishIds, targetWishIds);
    if (next === orderedWishIdsRef.current) return;
    lastReorderTargetRef.current = targetKey;
    orderDirtyRef.current = true;
    orderedWishIdsRef.current = next;
    captureGridPositions();
    setOrderedWishIds(next);
  };
  const reorderWishToGroup = (sourceId, groupId) => {
    const scope = dragScopeRef.current;
    const target = groupsById.get(groupId);
    const targetKey = `group:${groupId}`;
    if (scope?.kind !== "list" || !scope.wishIds.has(sourceId) || !target || lastReorderTargetRef.current === targetKey) return;
    const next = moveWishGroupToTarget(orderedWishIdsRef.current, [sourceId], target.wishIds);
    if (next === orderedWishIdsRef.current) return;
    lastReorderTargetRef.current = targetKey;
    orderDirtyRef.current = true;
    orderedWishIdsRef.current = next;
    captureGridPositions();
    setOrderedWishIds(next);
  };
  const groupHoverMode = (element, clientX, clientY) => resolveWishHoverMode({
    groupingEnabled: Boolean(groupingListId),
    rect: element?.querySelector('.wish-group-tile__preview')?.getBoundingClientRect() || element?.getBoundingClientRect(),
    clientX, clientY,
  });
  const armGroupIntent = (target) => {
    if (hoverTargetRef.current === target) return;
    clearTimeout(groupTimerRef.current);
    hoverTargetRef.current = target;
    armedDropTargetRef.current = null;
    setDropTarget(null);
    groupTimerRef.current = setTimeout(() => {
      groupTimerRef.current = null;
      if (!dragSessionRef.current || hoverTargetRef.current !== target) return;
      armedDropTargetRef.current = target;
      setDropTarget(target);
      navigator.vibrate?.(12);
    }, GROUP_INTENT_DELAY_MS);
  };
  const beginDragSession = (wishId, group = null) => {
    const scopeWishIds = reorderScopeWishIds(
      group ? wishes : ungroupedWishes,
      group ? group.wishIds : null,
    );
    dragSessionRef.current = true; orderDirtyRef.current = false;
    dragSourceWishIdRef.current = wishId;
    dragSourceGroupRef.current = null;
    dragScopeRef.current = group
      ? { kind: "group", groupId: group.id, wishIds: scopeWishIds }
      : { kind: "list", groupId: null, wishIds: scopeWishIds };
    dragInitialOrderRef.current = [...orderedWishIdsRef.current];
    setDraggedWishId(wishId); lastReorderTargetRef.current = null;
  };
  const beginGroupDragSession = (group) => {
    if (!group) return;
    dragSessionRef.current = true; orderDirtyRef.current = false;
    dragSourceWishIdRef.current = null;
    dragSourceGroupRef.current = group;
    dragScopeRef.current = { kind: "grid-group", groupId: group.id, wishIds: new Set(group.wishIds || []) };
    dragInitialOrderRef.current = [...orderedWishIdsRef.current];
    setDraggedGroupId(group.id); lastReorderTargetRef.current = null;
  };
  const startNativeDrag = (event, wishId, group = null) => {
    if (pointerDragRef.current) {
      event.preventDefault();
      return;
    }
    if (!event.target.closest?.(".wish-card__open, [data-wish-drag-handle]")) {
      event.preventDefault();
      return;
    }
    if (!event.dataTransfer) return;
    beginDragSession(wishId, group);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", wishId);
    const rect = event.currentTarget.getBoundingClientRect();
    const preview = createCardDragPreview(event.currentTarget, "wish-card--native-preview");
    preview.setAttribute("aria-hidden", "true");
    preview.style.width = `${rect.width}px`;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, event.clientX - rect.left, event.clientY - rect.top);
    requestAnimationFrame(() => preview.remove());
  };
  const startNativeGroupDrag = (event, group) => {
    if (pointerDragRef.current) {
      event.preventDefault();
      return;
    }
    if (!event.target.closest?.(".wish-group-tile__open, [data-wish-group-drag-handle]")) {
      event.preventDefault();
      return;
    }
    if (!event.dataTransfer) return;
    beginGroupDragSession(group);
    suppressOpenRef.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", group.id);
    const rect = event.currentTarget.getBoundingClientRect();
    const preview = createCardDragPreview(event.currentTarget, "wish-card--native-preview wish-group-tile--native-preview");
    preview.setAttribute("aria-hidden", "true");
    preview.style.width = `${rect.width}px`;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, event.clientX - rect.left, event.clientY - rect.top);
    requestAnimationFrame(() => preview.remove());
  };
  const finishDrag = ({ persist = true, restore = false } = {}) => {
    clearReorderIntent();
    const activeSession = dragSessionRef.current;
    const shouldRestoreOrder = activeSession && restore && orderDirtyRef.current && dragInitialOrderRef.current.length > 0;
    const orderToPersist = [...orderedWishIdsRef.current];
    const shouldPersistOrder = activeSession && persist && !restore && orderDirtyRef.current;
    const deferredAuthoritativeOrder = deferredAuthoritativeOrderRef.current;
    const shouldApplyDeferredOrder = activeSession && !shouldPersistOrder && Array.isArray(deferredAuthoritativeOrder);
    if (shouldApplyDeferredOrder) {
      captureGridPositions();
      orderedWishIdsRef.current = [...deferredAuthoritativeOrder];
      setOrderedWishIds(orderedWishIdsRef.current);
      deferredAuthoritativeOrderRef.current = null;
    } else if (shouldRestoreOrder) {
      captureGridPositions();
      orderedWishIdsRef.current = [...dragInitialOrderRef.current];
      setOrderedWishIds(orderedWishIdsRef.current);
    }
    dragSessionRef.current = false; orderDirtyRef.current = false;
    dragSourceWishIdRef.current = null;
    dragSourceGroupRef.current = null;
    dragScopeRef.current = null;
    dragInitialOrderRef.current = [];
    stopPointerAutoScroll(); clearGroupIntent(); removePointerGhost(); setDraggedWishId(null); setDraggedGroupId(null); lastReorderTargetRef.current = null;
    if (shouldPersistOrder) {
      deferredAuthoritativeOrderRef.current = null;
      void persistOrder(orderToPersist);
    }
  };
  const allowNativeWishDrop = (event, wishId, targetGroupId = null) => {
    const sourceWishId = dragSourceWishIdRef.current;
    const sourceGroup = dragSourceGroupRef.current;
    const dragScope = dragScopeRef.current;
    if (dragScope?.kind === "grid-group") {
      if (!dragSessionRef.current || !sourceGroup || targetGroupId || dragScope.wishIds.has(wishId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      reorderGroup(sourceGroup.id, { kind: "wish", id: wishId });
      clearGroupIntent();
      return;
    }
    const validTarget = dragScope?.kind === "group"
      ? dragScope.groupId === targetGroupId && dragScope.wishIds.has(wishId)
      : !targetGroupId;
    if (!dragSessionRef.current || !sourceWishId || !dragScope || !validTarget) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (sourceWishId === wishId) {
      clearReorderIntent();
      if (hoverTargetRef.current) clearGroupIntent();
      lastReorderTargetRef.current = null;
      return;
    }
    if (dragScope.kind === "group") {
      reorderWish(sourceWishId, wishId);
    } else if (groupingListId) {
      const hoverMode = resolveWishHoverMode({
        groupingEnabled: true,
        rect: event.currentTarget.querySelector(".wish-card__image")?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect(),
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (hoverMode === "group") {
        clearReorderIntent();
        armGroupIntent(`wish:${wishId}`);
      } else {
        clearGroupIntent();
        queueWishReorder(sourceWishId, wishId);
      }
    } else reorderWish(sourceWishId, wishId);
  };
  const allowNativeGroupDrop = (event, groupId) => {
    const sourceGroup = dragSourceGroupRef.current;
    if (dragScopeRef.current?.kind === "grid-group") {
      if (!dragSessionRef.current || !sourceGroup || sourceGroup.id === groupId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      reorderGroup(sourceGroup.id, { kind: "group", id: groupId });
      clearGroupIntent();
      return;
    }
    if (!dragSessionRef.current || !dragSourceWishIdRef.current || dragScopeRef.current?.kind !== "list") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const hoverMode = resolveWishHoverMode({
      groupingEnabled: true,
      rect: event.currentTarget.querySelector(".wish-group-tile__preview")?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect(),
      clientX: event.clientX,
      clientY: event.clientY,
    });
    if (hoverMode === "group") {
      clearReorderIntent();
      armGroupIntent(`group:${groupId}`);
    } else {
      clearGroupIntent();
      queueWishReorder(dragSourceWishIdRef.current, groupId, "group");
    }
  };
  const leaveNativeDropTarget = (event) => {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom) return;
    clearReorderIntent();
    clearGroupIntent();
  };
  const createGroup = async (sourceWishId, targetWishId = null) => {
    finishDrag({ persist: false, restore: true });
    if (!sourceWishId || sourceWishId === targetWishId || !groupingListId) return false;
    const wishIds = [sourceWishId, targetWishId].filter(Boolean);
    try {
      const { group } = await api.post(`/lists/${groupingListId}/groups`, { wishIds, space: selectedSpace });
      updateData((current) => {
        const linked = attachWishesToDashboardList(current, groupingListId, group.wishIds);
        return {
          ...linked,
          groups: [...(linked.groups || []).filter((item) => item.id !== group.id), group],
        };
      });
      toast("Группа создана");
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) { toast(error.message, "error"); return false; }
  };
  const addToGroup = async (sourceWishId, groupId) => {
    finishDrag({ persist: false, restore: true });
    if (!sourceWishId || !groupingListId) return false;
    try {
      await api.post(`/lists/${groupingListId}/groups/${groupId}/wishes`, { wishId: sourceWishId });
      updateData((current) => {
        const linked = attachWishesToDashboardList(current, groupingListId, [sourceWishId]);
        return {
          ...linked,
          groups: (linked.groups || []).map((group) => group.id === groupId
            ? { ...group, wishIds: [...new Set([...(group.wishIds || []), sourceWishId])] }
            : group),
        };
      });
      toast("Добавлено в группу");
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) { toast(error.message, "error"); return false; }
  };
  const restoreFocusAfterGroupRemoval = (groupId, wishId) => {
    requestAnimationFrame(() => {
      const closeButton = document.querySelector('.wish-group-open [aria-label="Закрыть группу"]');
      if (closeButton) {
        closeButton.focus();
        return;
      }
      const extractedCard = [...document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id]")]
        .find((card) => card.dataset.groupWishId === wishId);
      const extractedCardButton = extractedCard?.querySelector(".wish-card__open");
      if (extractedCardButton) {
        extractedCardButton.focus();
        return;
      }
      const groupTile = [...document.querySelectorAll(".wishes-page > .wish-grid [data-group-id]")]
        .find((tile) => tile.dataset.groupId === groupId);
      groupTile?.querySelector(".wish-group-tile__open")?.focus();
    });
  };
  const removeWishFromGroup = async (wishId, group) => {
    if (removingGroupIdRef.current) return false;
    removingGroupIdRef.current = group.id;
    setRemovingGroupId(group.id);
    try {
      const result = await api.delete(`/lists/${encodeURIComponent(group.listId)}/groups/${encodeURIComponent(group.id)}/wishes/${encodeURIComponent(wishId)}`);
      updateData((current) => ({
        ...current,
        groups: (current.groups || []).flatMap((currentGroup) => {
          if (currentGroup.id !== group.id) return [currentGroup];
          if (result.dissolved) return [];
          return [{
            ...currentGroup,
            ...(result.group || {}),
            wishIds: result.group?.wishIds || (currentGroup.wishIds || []).filter((id) => id !== wishId),
          }];
        }),
      }));
      if (result.dissolved && openedGroupId === group.id) setOpenedGroupId(null);
      restoreFocusAfterGroupRemoval(group.id, wishId);
      toast(result.dissolved ? "Желание убрано, группа расформирована" : "Желание убрано из группы");
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) {
      restoreFocusAfterGroupRemoval(group.id, wishId);
      toast(error.message || "Не удалось убрать желание из группы", "error");
      return false;
    } finally {
      if (removingGroupIdRef.current === group.id) {
        removingGroupIdRef.current = null;
        setRemovingGroupId(null);
      }
    }
  };
  const renameGroup = async (groupId, listId, title) => {
    try {
      const result = await api.patch(`/lists/${listId}/groups/${groupId}`, { title });
      const savedTitle = result.group?.title || title;
      updateData((current) => ({
        ...current,
        groups: (current.groups || []).map((group) => group.id === groupId ? { ...group, title: savedTitle } : group),
      }));
      toast("Группа переименована");
      return true;
    }
    catch (error) { toast(error.message, "error"); return false; }
  };
  const moveGroup = async (group, targetList) => {
    try {
      const result = await api.post(`/lists/${encodeURIComponent(group.listId)}/groups/${encodeURIComponent(group.id)}/move`, { targetListId: targetList.id });
      updateData((current) => moveWishGroupInDashboard(current, result));
      if (openedGroupId === group.id) setOpenedGroupId(null);
      toast(`Группа перемещена в «${listDisplayTitle(targetList)}»`);
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) {
      toast(error.message || "Не удалось переместить группу", "error");
      return false;
    }
  };
  const disbandGroup = async (groupId, listId) => {
    try {
      await api.delete(`/lists/${listId}/groups/${groupId}`);
      updateData((current) => disbandWishGroupFromDashboard(current, groupId));
      if (openedGroupId === groupId) setOpenedGroupId(null);
      toast("Группа расформирована");
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) {
      toast(error.message || "Не удалось расформировать группу", "error");
      return false;
    }
  };
  const dropNativeOnWish = (event, targetWishId, targetGroupId = null) => {
    event.preventDefault();
    const sourceWishId = dragSourceWishIdRef.current;
    const sourceGroup = dragSourceGroupRef.current;
    const dragScope = dragScopeRef.current;
    if (dragScope?.kind === "grid-group") {
      if (sourceGroup && !targetGroupId && !dragScope.wishIds.has(targetWishId)) reorderGroup(sourceGroup.id, { kind: "wish", id: targetWishId });
      finishDrag();
    } else if (dragScope?.kind === "group") {
      if (dragScope.groupId === targetGroupId && dragScope.wishIds.has(targetWishId)) finishDrag();
      else finishDrag({ persist: false, restore: true });
    } else if (armedDropTargetRef.current === `wish:${targetWishId}`) {
      void createGroup(sourceWishId, targetWishId);
    } else {
      reorderWish(sourceWishId, targetWishId);
      finishDrag();
    }
  };
  const dropNativeOnGroup = (event, groupId) => {
    event.preventDefault();
    const sourceWishId = dragSourceWishIdRef.current;
    const sourceGroup = dragSourceGroupRef.current;
    if (dragScopeRef.current?.kind === "grid-group") {
      if (sourceGroup && sourceGroup.id !== groupId) reorderGroup(sourceGroup.id, { kind: "group", id: groupId });
      finishDrag();
    } else if (dragScopeRef.current?.kind !== "list") finishDrag({ persist: false, restore: true });
    else if (groupHoverMode(event.currentTarget, event.clientX, event.clientY) === "reorder") {
      clearGroupIntent();
      reorderWishToGroup(sourceWishId, groupId);
      finishDrag();
    }
    else if (armedDropTargetRef.current === `group:${groupId}`) void addToGroup(sourceWishId, groupId);
    else {
      reorderWish(sourceWishId, groupId, "group");
      finishDrag();
    }
  };
  const stopPointerAutoScroll = () => {
    if (pointerAutoScrollFrameRef.current !== null) cancelAnimationFrame(pointerAutoScrollFrameRef.current);
    pointerAutoScrollFrameRef.current = null;
    pointerAutoScrollTimeRef.current = null;
  };
  const clearPointerListeners = () => {
    clearReorderIntent();
    stopPointerAutoScroll();
    pointerListenerCleanupRef.current?.();
    pointerListenerCleanupRef.current = null;
  };
  const releasePointerCapture = (drag) => {
    if (!drag) return;
    const captureTarget = drag.captureTarget || drag.source;
    try {
      if (captureTarget.hasPointerCapture?.(drag.pointerId)) captureTarget.releasePointerCapture?.(drag.pointerId);
    } catch {}
  };
  const listenForPointerDrag = () => {
    const move = (event) => movePointerDrag(event);
    const end = (event) => endPointerDrag(event);
    const cancel = (event) => cancelPointerDrag(event);
    const visibility = (event) => { if (document.hidden) cancelPointerDrag(event); };
    const key = (event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelPointerDrag(event); } };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    document.addEventListener("visibilitychange", visibility);
    pointerListenerCleanupRef.current = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  };
  const activatePointerDrag = (drag) => {
    if (!drag || pointerDragRef.current !== drag || drag.active) return;
    try { drag.captureTarget.setPointerCapture?.(drag.pointerId); } catch {}
    drag.active = true;
    clickGuardCleanupRef.current?.();
    clickGuardCleanupRef.current = guardDragClick(suppressOpenRef, drag.pointerId);
    if (drag.kind === "group") beginGroupDragSession(drag.group);
    else beginDragSession(drag.wishId, drag.group);
    createPointerGhost(drag.source, drag.startX, drag.startY);
    startPointerAutoScroll(drag);
    navigator.vibrate?.(18);
  };
  const beginPointerDrag = (event, wishId, group = null) => {
    const pointerType = event.pointerType || "mouse";
    if (!event.isPrimary || event.button !== 0) return;
    if (!event.target.closest?.(".wish-card__open, [data-wish-drag-handle]")) return;
    if (pointerType === "mouse") event.preventDefault();
    if (pointerDragRef.current) return;
    suppressOpenRef.current = false;
    const drag = { wishId, group, pointerId: event.pointerId, pointerType, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, active: false, source: event.currentTarget, captureTarget: event.currentTarget.closest(".wish-grid") || event.currentTarget };
    pointerDragRef.current = drag;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    listenForPointerDrag();
    if (event.target.closest?.("[data-wish-drag-handle]")) {
      event.preventDefault();
      activatePointerDrag(drag);
      return;
    }
    pointerTimerRef.current = setTimeout(() => {
      activatePointerDrag(drag);
    }, 260);
  };
  const beginPointerGroupDrag = (event, group) => {
    const pointerType = event.pointerType || "mouse";
    if (!event.isPrimary || event.button !== 0 || !group) return;
    if (!event.target.closest?.(".wish-group-tile__open, [data-wish-group-drag-handle]")) return;
    if (pointerType === "mouse") event.preventDefault();
    if (pointerDragRef.current) return;
    suppressOpenRef.current = false;
    const drag = { kind: "group", group, pointerId: event.pointerId, pointerType, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, active: false, source: event.currentTarget, captureTarget: event.currentTarget.closest(".wish-grid") || event.currentTarget };
    pointerDragRef.current = drag;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    listenForPointerDrag();
    if (event.target.closest?.("[data-wish-group-drag-handle]")) {
      event.preventDefault();
      activatePointerDrag(drag);
      return;
    }
    pointerTimerRef.current = setTimeout(() => {
      activatePointerDrag(drag);
    }, 260);
  };
  const updatePointerDragPosition = (drag, clientX, clientY) => {
    // Crossing an edge on the way to a card's center is not a reorder intent.
    // Give that edge a short grace period; movement within it keeps the intent.
    movePointerGhost(clientX, clientY);
    const element = document.elementFromPoint(clientX, clientY);
    const pointerGroupTile = element?.closest?.("[data-group-id]");
    const groupId = pointerGroupTile?.dataset.groupId;
    const pointerWishCard = element?.closest?.("[data-group-wish-id]");
    if (drag.kind === "group") {
      const targetGroupId = groupId && groupId !== drag.group.id ? groupId : null;
      const targetWishId = pointerWishCard?.dataset.groupWishId || null;
      if (targetGroupId) {
        const target = `group:${targetGroupId}`;
        if (drag.hoverTarget !== target) {
          drag.hoverTarget = target;
          reorderGroup(drag.group.id, { kind: "group", id: targetGroupId });
        }
        return;
      }
      if (targetWishId && !(drag.group.wishIds || []).includes(targetWishId)) {
        const target = `wish:${targetWishId}`;
        if (drag.hoverTarget !== target) {
          drag.hoverTarget = target;
          reorderGroup(drag.group.id, { kind: "wish", id: targetWishId });
        }
        return;
      }
      drag.hoverTarget = null;
      lastReorderTargetRef.current = null;
      return;
    }
    const dragGroupId = drag.group?.id || null;
    let wishCard = pointerWishCard;
    let overlapGroupTarget = false;
    if (!groupId && !dragGroupId && groupingListId && (!pointerWishCard || pointerWishCard.dataset.groupWishId === drag.wishId)) {
      const draggedImageRect = pointerGhostRef.current?.querySelector(".wish-card__image")?.getBoundingClientRect();
      if (draggedImageRect) {
        let bestOverlap = 0.36;
        document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id]").forEach((candidate) => {
          if (candidate.dataset.groupWishId === drag.wishId || candidate.dataset.wishGroupId) return;
          const candidateImageRect = candidate.querySelector(".wish-card__image")?.getBoundingClientRect();
          const overlap = wishRectOverlapRatio(draggedImageRect, candidateImageRect);
          if (overlap < bestOverlap) return;
          bestOverlap = overlap;
          wishCard = candidate;
          overlapGroupTarget = true;
        });
      }
    }
    const wishId = wishCard?.dataset.groupWishId;
    const targetGroupId = wishCard?.dataset.wishGroupId || null;
    const validWishReorderTarget = wishId
      && wishId !== drag.wishId
      && dragScopeRef.current?.wishIds?.has(wishId)
      && (dragGroupId ? targetGroupId === dragGroupId : !targetGroupId);
    const validGroupReorderTarget = !dragGroupId && groupsById.has(groupId);
    const validReorderTarget = validWishReorderTarget || validGroupReorderTarget;
    const validGroupTarget = validGroupReorderTarget || (wishId
      && wishId !== drag.wishId
      && !dragGroupId
      && !targetGroupId);
    const groupingEnabled = Boolean(groupingListId && validGroupTarget);
    let hoverMode = null;
    if (overlapGroupTarget) hoverMode = "group";
    else if (validReorderTarget) {
      hoverMode = resolveWishHoverMode({
        groupingEnabled,
        rect: validGroupReorderTarget
          ? pointerGroupTile.querySelector(".wish-group-tile__preview")?.getBoundingClientRect() || pointerGroupTile.getBoundingClientRect()
          : wishCard.querySelector(".wish-card__image")?.getBoundingClientRect() || wishCard.getBoundingClientRect(),
        clientX,
        clientY,
      });
    } else if (groupingEnabled) hoverMode = "group";
    const target = dragGroupId
      ? validReorderTarget ? `wish:${wishId}` : null
      : validGroupReorderTarget
        ? `group:${groupId}`
        : groupingListId
          ? validGroupTarget ? `wish:${wishId}` : null
          : validReorderTarget ? `wish:${wishId}` : null;
    const interactionTarget = target && hoverMode ? `${hoverMode}:${target}` : null;
    if (interactionTarget && interactionTarget !== drag.hoverTarget) {
      drag.hoverTarget = interactionTarget;
      if (hoverMode !== "group" || dragGroupId || !groupingListId) {
        clearGroupIntent();
      } else {
        armGroupIntent(target);
      }
    } else if (!target) {
      drag.hoverTarget = null;
      lastReorderTargetRef.current = null;
      clearGroupIntent();
    }
    if (hoverMode === "reorder" && validReorderTarget) {
      const targetId = validGroupReorderTarget ? groupId : wishId;
      const targetKind = validGroupReorderTarget ? "group" : "wish";
      if (groupingEnabled) queueWishReorder(drag.wishId, targetId, targetKind, drag);
      else {
        clearReorderIntent();
        reorderWish(drag.wishId, targetId, targetKind);
      }
    } else clearReorderIntent();
  };
  const startPointerAutoScroll = (drag) => {
    if (pointerAutoScrollFrameRef.current !== null) return;
    const tick = (timestamp) => {
      pointerAutoScrollFrameRef.current = null;
      if (pointerDragRef.current !== drag || !drag.active) return;
      const scrollContainer = drag.source.closest(".wish-group-open") || document.scrollingElement;
      if (!scrollContainer) return;
      const containerRect = scrollContainer === document.scrollingElement
        ? { top: 0, right: window.innerWidth, bottom: window.innerHeight, left: 0 }
        : scrollContainer.getBoundingClientRect();
      if (drag.clientX < containerRect.left || drag.clientX > containerRect.right) {
        pointerAutoScrollTimeRef.current = null;
        return;
      }
      const edgeSize = Math.min(88, Math.max(40, (containerRect.bottom - containerRect.top) / 4));
      const distanceFromTopEdge = containerRect.top + edgeSize - drag.clientY;
      const distanceFromBottomEdge = drag.clientY - (containerRect.bottom - edgeSize);
      let direction = 0;
      let penetration = 0;
      if (distanceFromTopEdge > 0) {
        direction = -1;
        penetration = Math.min(1, distanceFromTopEdge / edgeSize);
      } else if (distanceFromBottomEdge > 0) {
        direction = 1;
        penetration = Math.min(1, distanceFromBottomEdge / edgeSize);
      }
      if (!direction) {
        pointerAutoScrollTimeRef.current = null;
        return;
      }
      const elapsed = pointerAutoScrollTimeRef.current === null
        ? 16
        : Math.min(32, Math.max(0, timestamp - pointerAutoScrollTimeRef.current));
      pointerAutoScrollTimeRef.current = timestamp;
      const pixelsPerSecond = 120 + 780 * penetration * penetration;
      const scrollDelta = direction * pixelsPerSecond * (elapsed / 1000);
      const previousScrollTop = scrollContainer.scrollTop;
      const nextScrollTop = Math.max(
        0,
        Math.min(scrollContainer.scrollHeight - scrollContainer.clientHeight, previousScrollTop + scrollDelta),
      );
      if (nextScrollTop === previousScrollTop) {
        pointerAutoScrollTimeRef.current = null;
        return;
      }
      scrollContainer.scrollTo({ top: nextScrollTop, behavior: "instant" });
      if (scrollContainer.scrollTop === previousScrollTop) {
        pointerAutoScrollTimeRef.current = null;
        return;
      }
      updatePointerDragPosition(drag, drag.clientX, drag.clientY);
      pointerAutoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    pointerAutoScrollFrameRef.current = requestAnimationFrame(tick);
  };
  const movePointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 9) {
      if (drag.pointerType === "mouse") activatePointerDrag(drag);
      else { clearTimeout(pointerTimerRef.current); pointerDragRef.current = null; releasePointerCapture(drag); clearPointerListeners(); return; }
    }
    if (!drag.active) return;
    event.preventDefault();
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    updatePointerDragPosition(drag, event.clientX, event.clientY);
    startPointerAutoScroll(drag);
  };
  const endPointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    if (drag.active && (drag.clientX !== event.clientX || drag.clientY !== event.clientY)) updatePointerDragPosition(drag, event.clientX, event.clientY);
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    pointerDragRef.current = null;
    releasePointerCapture(drag);
    if (!drag.active) return;
    event.preventDefault();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const wishCard = element?.closest?.("[data-group-wish-id]");
    const groupId = element?.closest?.("[data-group-id]")?.dataset.groupId;
    const wishId = wishCard?.dataset.groupWishId;
    const targetGroupId = wishCard?.dataset.wishGroupId || null;
    const insideGrid = element && drag.captureTarget.contains(element);
    if (!insideGrid) { finishDrag({ persist: false, restore: true }); return; }
    if (drag.kind === "group") {
      if (groupId && groupId !== drag.group.id) reorderGroup(drag.group.id, { kind: "group", id: groupId });
      else if (wishId && !(drag.group.wishIds || []).includes(wishId) && !targetGroupId) reorderGroup(drag.group.id, { kind: "wish", id: wishId });
      // A previewed move belongs to the source grid, including its gaps and
      // the thin space exposed by the scaled source placeholder.
      if (orderDirtyRef.current) finishDrag();
      else finishDrag({ persist: false, restore: true });

      return;
    }
    const dragGroupId = drag.group?.id || null;
    const hoverGroupTarget = drag.hoverTarget === `group:${armedDropTargetRef.current}`
      ? armedDropTargetRef.current : null;
    const hoveredGroupId = hoverGroupTarget?.startsWith("group:") ? hoverGroupTarget.slice("group:".length) : null;
    const hoveredWishId = hoverGroupTarget?.startsWith("wish:") ? hoverGroupTarget.slice("wish:".length) : null;
    if (dragGroupId && orderDirtyRef.current) finishDrag();
    else if (dragGroupId) finishDrag({ persist: false, restore: true });
    else if (hoveredGroupId) addToGroup(drag.wishId, hoveredGroupId);
    else if (hoveredWishId && hoveredWishId !== drag.wishId) createGroup(drag.wishId, hoveredWishId);
    else if (groupId && groupsById.has(groupId)) {
      reorderWish(drag.wishId, groupId, "group");
      finishDrag();
    }
    else if (!groupId && !targetGroupId && dragScopeRef.current?.wishIds?.has(wishId) && wishId !== drag.wishId) {
      reorderWish(drag.wishId, wishId);
      finishDrag();
    }
    else if (orderDirtyRef.current) finishDrag();
    else finishDrag({ persist: false, restore: true });

  };
  const cancelPointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    pointerDragRef.current = null;
    releasePointerCapture(drag);
    if (!drag.active) return;
    event.preventDefault();
    finishDrag({ persist: false, restore: true });

  };
  cancelDragRef.current = () => {
    cancelPointerDrag({ preventDefault() {} });
    if (dragSessionRef.current) finishDrag({ persist: false, restore: true });
  };
  const renderWish = (wish, group = null) => {
    const dragEnabled = !group || !removingGroupId;
    return <WishCard key={wish.id} wish={wish} owner profile={user} lists={data.lists} draggable={dragEnabled} nativeDraggable={dragEnabled} dragGroupId={group?.id} groupBusy={Boolean(group && removingGroupId)} groupOptions={group ? [] : groups} onCreateGroup={!group && groupingListId ? () => createGroup(wish.id) : undefined} onAddToGroup={!group && groupingListId ? (groupId) => addToGroup(wish.id, groupId) : undefined} isDragging={draggedWishId === wish.id} isDropTarget={!group && dropTarget === `wish:${wish.id}`} onDragStart={(event) => startNativeDrag(event, wish.id, group)} onDragEnd={() => finishDrag({ persist: false, restore: true })} onDragOver={(event) => allowNativeWishDrop(event, wish.id, group?.id || null)} onDragLeave={leaveNativeDropTarget} onDrop={(event) => dropNativeOnWish(event, wish.id, group?.id || null)} onPointerDown={(event) => { if (!group || !removingGroupId) beginPointerDrag(event, wish.id, group); }} onRemoveFromGroup={group ? () => removeWishFromGroup(wish.id, group) : undefined} onChanged={refreshWishes} onOpen={() => {
    if (suppressOpenRef.current) { suppressOpenRef.current = false; return; }
    setSelectedWishId(wish.id);
  }} onEdit={() => editWish(wish.id)} onCreateList={() => setListModal({ attachWishId: wish.id })} />;
  };
  const renderGroupTile = (group, groupWishes) => <WishGroupTile
    key={group.id}
    group={group}
    wishes={groupWishes}
    moveTargets={groupMoveTargets}
    draggable={!removingGroupId}
    nativeDraggable={!removingGroupId}
    isDragging={draggedGroupId === group.id}
    isDropTarget={dropTarget === `group:${group.id}`}
    onOpen={(event) => {
      if (suppressOpenRef.current) { suppressOpenRef.current = false; return; }
      groupOpenerRef.current = event.currentTarget;
      setOpenedGroupId(group.id);
    }}
    onRename={(title) => renameGroup(group.id, group.listId, title)}
    onMove={(targetList) => moveGroup(group, targetList)}
    onDisband={() => disbandGroup(group.id, group.listId)}
    onDragStart={(event) => startNativeGroupDrag(event, group)}
    onDragEnd={() => {
      finishDrag({ persist: false, restore: true });
      setTimeout(() => { suppressOpenRef.current = false; }, 0);
    }}
    onDragOver={(event) => allowNativeGroupDrop(event, group.id)}
    onDragLeave={leaveNativeDropTarget}
    onDrop={(event) => dropNativeOnGroup(event, group.id)}
    onPointerDown={(event) => { if (!removingGroupId) beginPointerGroupDrag(event, group); }}
  />;
  const renderGridItem = (item) => (
    item.type === "group"
      ? renderGroupTile(item.group, item.wishes)
      : renderWish(item.wish)
  );
  return <div className="app-page wishes-page">
    {profileControls}{loadError}
    {!publication && data && <AddFab actions={[
      { label: "Добавить желание", onSelect: () => onAdd(selectedSpace, selectedList?.id) },
      { label: "Новый список", icon: ListPlus, onSelect: () => setListModal({}) },
    ]} />}
    {!publication && shouldShowListNavigation({ listCount: categoryLists.length, unlistedCount: unlistedWishes.length }) && <WishListNavigation
      value={selectedValue}
      items={categoryLists.map((list) => ({ id: list.id, title: listDisplayTitle(list), count: wishCountForList(list.id), privateList: list.privacy === "private" }))}
      leadingItem={shouldShowUnsortedList(unlistedWishes.length) ? { title: UNSORTED_LIST_TITLE, count: unlistedWishes.length } : null}
      orderScope={viewerId ? `${viewerId}:${selectedSpace}` : null}
      onSelect={(id) => {
        if (id) { setSelected(id); setOpenedGroupId(null); }
      }}
      onSettings={openListSettings}
      onOrderError={() => toast("Не удалось сохранить порядок списков", "error")}
    />}
{publicationContent || <>
<GiftSuggestionsPanel items={giftSuggestions} onOpenWish={setSelectedWishId} />
{openedGroup && <WishGroupDialog
  group={openedGroup}
  viewerId={user.id}
  count={openedGroupWishes.length}
  moveTargets={groupMoveTargets}
  onRename={(title) => renameGroup(openedGroup.id, openedGroup.listId, title)}
  onMove={(list) => moveGroup(openedGroup, list)}
  onDisband={() => disbandGroup(openedGroup.id, openedGroup.listId)}
  finalFocus={groupOpenerRef}
  busy={Boolean(removingGroupId)}
  suspended={Boolean(selectedWish || editingWish || listModal)}
  onClose={() => setOpenedGroupId(null)}
><div className="wish-grid" onLostPointerCapture={cancelPointerDrag}>{openedGroupWishes.map((wish) => renderWish(wish, openedGroup))}</div></WishGroupDialog>}
{wishes.length ? <div className="wish-grid" onLostPointerCapture={cancelPointerDrag}>{gridItems.map(renderGridItem)}</div> : !spaceSharedWishes.length && <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." />}
<SharedWishes wishes={spaceSharedWishes} profile={user} onOpen={(id) => {
  if (isMobile) navigate(publicWishPath(user.username, id), { state: { fromWishlistBoard: true } });
  else setSelectedWishId(id);
}} onChanged={refreshWishes} />
{selectedWish && <WishDetailsModal wish={selectedWish} owner={!selectedWish.sharedBy} profile={user} lists={data.lists} giftSuggestion={selectedWishSuggestion} onChanged={refreshWishes} onEdit={() => editWish(selectedWish.id)} onCreateList={() => { setSelectedWishId(null); setListModal({ attachWishId: selectedWish.id }); }} onClose={() => setSelectedWishId(null)} />}
{editingWish && <WishModal wish={editingWish} space={selectedSpace} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}</>}
{listModal && <ListModal list={listModal.id ? listModal : null} listsCount={data.lists.length} space={selectedSpace} onClose={() => setListModal(null)} onSaved={saveList} onDeleted={deleteList} returnFocusRef={listModal.id ? listSettingsTriggerRef : undefined} />}</div>;
}

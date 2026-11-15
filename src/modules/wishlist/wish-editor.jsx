import { useId, useState, useEffect, useRef } from "react";
import {
  Trash2,
  X,
  CheckCircle2,
  Clapperboard,
  EyeOff,
  Image,
  ListPlus,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { api, sessionFetch } from "../runtime/api.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { canAutofocusForm, useIsMobile } from "@/hooks/use-mobile";
import { SPACE_IDS, SPACES, listSpace } from "../categories/wish-spaces.jsx";
import { useToast } from "../shell/toast.jsx";
import { ProductTitleInput } from "@/modules/catalog-marketplace/product-title-input.jsx";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker.jsx";
import { WishParticipantField } from "@/modules/wishlist/wish-participant-field.jsx";
import { wishParticipantChanges } from "../../../shared/modules/wishlist/wish-participants.js";
import { MobileFormFooter } from "@/components/mobile-form-pages";
import { ControlBar } from "@/components/control-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FullscreenDialog } from "@/components/fullscreen-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { findAssistantWishLists, isGeneralList, listDisplayTitle } from "../categories/list-navigation.js";
import { initialWishListIds } from "./wish-lists.js";
import { isKinopoiskHost, isKinopoiskUrl, kinopoiskContentUrlError, wishPreviewImageUrl } from "../../../shared/modules/media-import/kinopoisk.js";
import { retailerPreview } from "../../../shared/modules/media-import/retailer-previews.js";
import { isVkVideoUrl, isYouTubeUrl } from "../../../shared/modules/media-import/video-links.js";
import { requestRetailerBrowserMetadata } from "../media-import/retailer-browser-import.js";
import { withWishReward } from "../loyalty/wish-reward.jsx";
import { applyRetailerPreviewFallback } from "./wish-preview.jsx";
import {
  WISH_CURRENCIES,
  WISH_CURRENCY_SYMBOLS,
  isProductUrl,
  isYandexMapsUrl,
  uploadedImageIdFromUrl,
  wishFormFrom,
} from "./wish-form-data.jsx";
import { useAsync } from "../shell/use-async.jsx";
import { LoadingScreen } from "../shell/page-feedback.jsx";
import { WishDeleteAlert } from "./wish-delete-alert.jsx";

export function ListModal({ list = null, listsCount = 0, space = "products", onClose, onSaved, onDeleted, returnFocusRef }) {
  const isMobile = useIsMobile();
  const editing = Boolean(list?.id);
  const toast = useToast();
  const titleId = useId();
  const descriptionId = useId();
  const secretListId = useId();
  const secretListDescriptionId = useId();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    title: list?.title || "",
    description: list?.description || "",
    privacy: list?.privacy || "public",
    space: SPACE_IDS.includes(list?.space) ? list.space : (SPACE_IDS.includes(space) ? space : "products"),
  }));
  const submit = async (event) => {
    event.preventDefault();
    if (loading || deleting || deleteOpen) return;
    setLoading(true);
    try {
      const result = editing ? await api.patch(`/lists/${list.id}`, form) : await api.post("/lists", form);
      toast(editing ? "Настройки списка сохранены" : "Новый список создан");
      await onSaved?.(result.list);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const remove = async () => {
    if (!editing || loading || deleting || listsCount <= 1) return;
    setDeleting(true);
    try {
      const result = await api.delete(`/lists/${list.id}`);
      toast(result.reassignedCount ? `Список удалён, ${result.reassignedCount} желаний сохранено` : "Список удалён");
      setDeleteOpen(false);
      await onDeleted?.(result);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setDeleting(false);
    }
  };
  return <>
    <Drawer open mobileDrawer={editing} onOpenChange={(open) => { if (!open && !loading && !deleting) onClose(); }}>
      <DrawerContent className="app-drawer--compact" finalFocus={returnFocusRef}>
        <DrawerClose
          render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10" size="icon-sm" />}
        >
          <X />
          <span className="sr-only">Закрыть</span>
        </DrawerClose>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Изменить список" : "Создать список"}</DrawerTitle>
            <DrawerDescription>{editing ? "Измените название, описание и приватность списка." : "Задайте название, описание и приватность нового списка."}</DrawerDescription>
          </DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={titleId}>Название</FieldLabel>
              <Input id={titleId} autoFocus={canAutofocusForm()} required placeholder="Например, Новоселье" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor={descriptionId}>Описание</FieldLabel>
              <Textarea id={descriptionId} rows={3} placeholder="Расскажите друзьям о списке" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            <Field orientation="horizontal" className="items-center">
              <div className="min-w-0 flex-1">
                <FieldLabel className="cursor-pointer" htmlFor={secretListId}>Секретный список</FieldLabel>
                <FieldDescription id={secretListDescriptionId}>Все желания в этом списке будут видны только вам.</FieldDescription>
              </div>
              <Switch id={secretListId} type="button" aria-describedby={secretListDescriptionId} checked={form.privacy === "private"} disabled={loading} onCheckedChange={(checked) => setForm((current) => ({ ...current, privacy: checked ? "private" : "public" }))} />
            </Field>
          </FieldGroup>
          </div>
          <DrawerFooter>
            <ShadcnButton
              type="submit"
              aria-label={editing ? "Сохранить изменения" : undefined}
              disabled={loading || deleting}
              aria-busy={loading || undefined}
            >
              {loading && <Spinner data-icon="inline-start" />}
              {editing ? (isMobile ? "Сохранить" : "Сохранить изменения") : "Создать список"}
            </ShadcnButton>
            {editing && <ShadcnButton
              data-control-icon=""
              type="button"
              variant="destructive"
              size="icon"
              aria-label="Удалить список"
              title="Удалить список"
              disabled={loading || deleting || listsCount <= 1}
              aria-busy={deleting || undefined}
              onClick={() => setDeleteOpen(true)}
            >
              {deleting ? <Spinner /> : <Trash2 aria-hidden="true" />}
            </ShadcnButton>}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
    {deleteOpen && <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Удалить «{list.title}»?</AlertDialogTitle><AlertDialogDescription>Желания из этого списка останутся в вашем общем списке. Отменить удаление списка не получится.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} aria-busy={deleting || undefined} onClick={remove}>{deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}Удалить</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </>;
}

export function WishModal({ onClose, onSaved, onDeleted, onAfterClose, wish = null, space = "products", initialListId = "", initialDraft = null }) {
  const isMobile = useIsMobile();
  const editing = Boolean(wish?.id);
  const toast = useToast();
  const { data, loading: listsLoading, error: listsError, reload: reloadDashboard } = useAsync(() => api.get("/dashboard"), []);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [imageError, setImageError] = useState("");
  const [listCreatorOpen, setListCreatorOpen] = useState(false);
  const [metadata, setMetadata] = useState({ status: "idle", message: "" });
  const [vehicleCatalog, setVehicleCatalog] = useState({ status: "idle", makes: [], models: [], modelsStatus: "idle" });
  const [form, setForm] = useState(() => wishFormFrom(wish || initialDraft, initialListId));
  const [initialParticipants] = useState(() => wish?.participants || []);
  const [participants, setParticipants] = useState(initialParticipants);
  const autoTimerRef = useRef(null);
  const metadataRequestRef = useRef(0);
  const editedMetadataFieldsRef = useRef(new Set(initialDraft
    ? ["title", "description", "imageUrl", "price", "currency"].filter(field =>
      field === "price" || field === "currency" ? initialDraft.price != null : Boolean(initialDraft[field]))
    : []));
  const imageFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const mutationRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const listCreatorTriggerRef = useRef(null);
  const selectableLists = data?.lists?.filter((list) => !isGeneralList(list)) || [];
  const requestedListName = initialDraft?.listName;
  const matchingLists = findAssistantWishLists(selectableLists, requestedListName);
  const matchedList = matchingLists.length === 1 ? matchingLists[0] : null;
  const [assistantListResolved, setAssistantListResolved] = useState(false);
  useEffect(() => {
    if (!requestedListName || !data || assistantListResolved) return;
    if (matchedList) setForm((current) => ({ ...current, listIds: initialWishListIds(current, matchedList.id) }));
    setAssistantListResolved(true);
  }, [data, matchedList, requestedListName, assistantListResolved]);
  const assistantListPending = Boolean(requestedListName && (listsLoading || listsError || !assistantListResolved));
  const effectiveSpace = (() => {
    if (matchedList) return listSpace(matchedList);
    if (editing) {
      if (SPACE_IDS.includes(wish?.space)) return wish.space;
      if (data?.lists) {
        const listsById = new Map(data.lists.map((list) => [list.id, list]));
        const wishSpace = (wish.listIds || [])
          .map((id) => listsById.get(id))
          .filter((list) => list && !isGeneralList(list))
          .map((list) => listSpace(list))
          .find((spaceId) => SPACE_IDS.includes(spaceId));
        return wishSpace || "products";
      }
    }
    return SPACE_IDS.includes(space) ? space : "products";
  })();
  const visibleLists = selectableLists.filter((list) => listSpace(list) === effectiveSpace);
  const isPlaces = effectiveSpace === "places";
  const isMedia = effectiveSpace === "media";
  const isFood = effectiveSpace === "food";
  const isTransport = effectiveSpace === "transport";
  const browserRetailer = (() => {
    const retailer = retailerPreview(form.url.trim());
    return ["samokat", "lavka", "lenta"].includes(retailer?.id) ? retailer : null;
  })();
  const isYouTube = isMedia && isYouTubeUrl(form.url.trim());
  const isVkVideo = isMedia && isVkVideoUrl(form.url.trim());
  const isVideo = isYouTube || isVkVideo;
  const videoProviderLabel = isVkVideo ? "VK Видео" : "YouTube";
  const isKinopoiskSite = isMedia && isKinopoiskHost(form.url.trim());
  const isKinopoisk = isMedia && isKinopoiskUrl(form.url.trim());
  const formPreviewImageUrl = wishPreviewImageUrl({ imageUrl: form.imageUrl, url: form.url });
  const showEventDate = effectiveSpace === "events"
    || Boolean(wish?.eventDate)
    || form.listIds.some((id) => {
      const list = selectableLists.find((item) => item.id === id);
      return list ? listSpace(list) === "events" : false;
    });
  useEffect(() => {
    if (!data?.lists) return;
    const generalIds = new Set(data.lists.filter(isGeneralList).map((list) => list.id));
    setForm((current) => {
      const nextListIds = current.listIds.filter((id) => !generalIds.has(id));
      return nextListIds.length === current.listIds.length ? current : { ...current, listIds: nextListIds };
    });
  }, [data]);
  useEffect(() => {
    if (!isTransport) {
      setVehicleCatalog({ status: "idle", makes: [], models: [], modelsStatus: "idle" });
      return undefined;
    }
    let active = true;
    setVehicleCatalog((current) => ({ ...current, status: "loading" }));
    api.get("/vehicle-catalog/makes").then(({ makes }) => {
      if (!active) return;
      setVehicleCatalog((current) => ({
        ...current,
        status: "ready",
        makes: Array.isArray(makes) ? makes : [],
      }));
    }).catch(() => {
      if (!active) return;
      setVehicleCatalog({ status: "unavailable", makes: [], models: [], modelsStatus: "idle" });
    });
    return () => { active = false; };
  }, [isTransport]);
  useEffect(() => {
    if (!isTransport || vehicleCatalog.status !== "ready") return undefined;
    const make = form.vehicleMake.trim();
    const knownMake = vehicleCatalog.makes.find((value) => value.localeCompare(make, "ru", { sensitivity: "accent" }) === 0);
    if (!knownMake) {
      setVehicleCatalog((current) => current.models.length || current.modelsStatus !== "idle"
        ? { ...current, models: [], modelsStatus: "idle" }
        : current);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setVehicleCatalog((current) => ({ ...current, modelsStatus: "loading", models: [] }));
      api.get(`/vehicle-catalog/models?make=${encodeURIComponent(knownMake)}`).then(({ models }) => {
        if (!active) return;
        setVehicleCatalog((current) => ({
          ...current,
          modelsStatus: "ready",
          models: Array.isArray(models) ? models : [],
        }));
      }).catch(() => {
        if (!active) return;
        setVehicleCatalog((current) => ({ ...current, modelsStatus: "unavailable", models: [] }));
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.vehicleMake, isTransport, vehicleCatalog.makes, vehicleCatalog.status]);
  const recognize = async (sourceUrl = form.url) => {
    const url = sourceUrl.trim();
    window.clearTimeout(autoTimerRef.current);
    if (!url) { setMetadata({ status: "idle", message: "" }); return false; }
    if (!isProductUrl(url)) { setMetadata({ status: "error", message: "Нужна полная ссылка, начинающаяся с http:// или https://" }); return false; }
    if (isPlaces && !isYandexMapsUrl(url)) { setMetadata({ status: "error", message: "Вставьте ссылку на место из Яндекс Карт" }); return false; }
    const kinopoiskUrlError = isMedia ? kinopoiskContentUrlError(url) : "";
    if (kinopoiskUrlError) {
      setMetadata({ status: "error", message: kinopoiskUrlError, retryable: false });
      return false;
    }
    const requestId = ++metadataRequestRef.current;
    const retailer = retailerPreview(url);
    const usesBrowserHelper = ["samokat", "lavka", "lenta"].includes(retailer?.id);
    setMetadata({ status: "loading", message: isPlaces ? "Ищем название и адрес места в Яндекс Картах…" : isVideo ? `Читаем видео в ${videoProviderLabel}…` : isKinopoisk ? "Загружаем постер с Кинопоиска…" : isMedia ? "Ищем название и обложку…" : isTransport ? "Читаем объявление и определяем марку с моделью…" : usesBrowserHelper ? "Открываем товар в обычном браузере и автоматически забираем фото…" : "Ищем название, фотографию и цену на странице магазина…" });
    try {
      let helperError = null;
      let meta = null;
      if (usesBrowserHelper) {
        try {
          meta = await requestRetailerBrowserMetadata(retailer.id, url);
        } catch (error) {
          helperError = error;
        }
      }
      if (!meta) {
        try {
          meta = await api.post("/metadata", { url });
        } catch (error) {
          if (!isTransport) throw error;
          helperError = error;
          meta = {};
        }
      }
      if (requestId !== metadataRequestRef.current) return false;
      const usesFallbackPreview = meta.previewFallback === true;
      let matchedVehicle = { make: "", model: "" };
      if (isTransport) {
        try {
          const matched = await api.post("/vehicle-catalog/match", {
            title: typeof meta.title === "string" ? meta.title : "",
            description: typeof meta.description === "string" ? meta.description : "",
            url,
          });
          if (requestId !== metadataRequestRef.current) return false;
          matchedVehicle = matched?.vehicle || matchedVehicle;
        } catch {
          // Карточка объявления остаётся доступной для ручного заполнения,
          // если production-справочник автомобилей временно недоступен.
        }
      }
      const values = {
        title: typeof meta.title === "string" ? meta.title.trim() : "",
        description: typeof meta.description === "string" ? meta.description.trim() : "",
        imageUrl: !usesFallbackPreview && typeof meta.imageUrl === "string" ? meta.imageUrl.trim() : "",
        price: meta.price == null || meta.price === "" ? "" : String(meta.price),
        currency: typeof meta.currency === "string" && WISH_CURRENCIES.includes(meta.currency.toUpperCase()) ? meta.currency.toUpperCase() : "",
        vehicleMake: typeof matchedVehicle.make === "string" ? matchedVehicle.make.trim() : "",
        vehicleModel: typeof matchedVehicle.model === "string" ? matchedVehicle.model.trim() : "",
      };
      const foundFields = ["title", "description", "imageUrl", "price", "vehicleMake", "vehicleModel"].filter((field) => values[field] !== "");
      if (foundFields.length === 0 && !usesFallbackPreview) {
        setMetadata({ status: "error", message: isPlaces ? "Не удалось прочитать страницу Яндекс Карт. Заполните карточку вручную." : isVideo ? `Не удалось прочитать видео в ${videoProviderLabel}. Заполните карточку вручную.` : isKinopoisk ? "Не удалось получить постер Кинопоиска. Добавьте изображение вручную." : isMedia ? "Не удалось получить данные и обложку. Добавьте их вручную." : isTransport ? "Не удалось определить автомобиль по объявлению. Марку и модель можно выбрать вручную." : "Магазин не отдал данные товара. Можно повторить попытку или заполнить карточку вручную." });
        return false;
      }
      const appliedFields = Object.keys(values).filter((field) => values[field] !== "" && !editedMetadataFieldsRef.current.has(field));
      setForm((current) => {
        if (current.url.trim() !== url) return current;
        const next = { ...current };
        appliedFields.forEach((field) => { next[field] = values[field]; });
        return next;
      });
      const complete = ["title", "imageUrl", "price"].every((field) => values[field] !== "");
      setMetadata({ status: "success", message: usesFallbackPreview ? (usesBrowserHelper ? (helperError?.code === "helper_unavailable" ? `Нужно один раз подключить помощник Rollapp — после этого фото из «${retailer.label}» будут загружаться автоматически.` : helperError?.message || `${retailer.label} не отдал фото товара.`) : "Магазин не отдал фото товара — показываем превью сервиса. Название и цену можно заполнить вручную.") : isPlaces ? "Название и адрес подставили — проверьте карточку" : isVideo ? `Название и превью видео из ${videoProviderLabel} уже в карточке — осталось всё проверить.` : isKinopoisk ? "Постер Кинопоиска уже в карточке — осталось всё проверить." : appliedFields.length === 0 ? "Данные страницы найдены, а ваши ручные правки оставлены без изменений." : isMedia && values.imageUrl ? "Название и обложка уже в карточке — осталось всё проверить." : isTransport && values.vehicleMake ? `Объявление прочитано: ${[values.vehicleMake, values.vehicleModel].filter(Boolean).join(" ")}. Проверьте марку и модель.` : isTransport ? "Объявление прочитано. Марку и модель можно выбрать вручную." : isFood && complete ? "Название, фото и цена уже в карточке. Цена зависит от адреса и магазина — проверьте её перед сохранением." : complete ? "Название, фото и цена уже в карточке — осталось всё проверить." : "Подставили всё, что удалось найти на странице. Проверьте карточку." });
      return true;
    } catch (error) {
      if (requestId !== metadataRequestRef.current) return false;
      setMetadata({ status: "error", message: error.message || (isPlaces ? "Не удалось прочитать страницу Яндекс Карт. Заполните карточку вручную." : isVideo ? `Не удалось прочитать видео в ${videoProviderLabel}. Заполните карточку вручную.` : isKinopoisk ? "Не удалось получить постер Кинопоиска." : isMedia ? "Не удалось получить обложку по ссылке." : "Не удалось прочитать страницу магазина.") });
      return false;
    }
  };
  useEffect(() => {
    if (editing) return undefined;
    window.clearTimeout(autoTimerRef.current);
    metadataRequestRef.current += 1;
    const url = form.url.trim();
    if (!url || !isProductUrl(url)) { setMetadata({ status: "idle", message: "" }); return undefined; }
    if (isPlaces && !isYandexMapsUrl(url)) { setMetadata({ status: "error", message: "Вставьте ссылку на место из Яндекс Карт" }); return undefined; }
    const kinopoiskUrlError = isMedia ? kinopoiskContentUrlError(url) : "";
    if (kinopoiskUrlError) {
      setMetadata({ status: "error", message: kinopoiskUrlError, retryable: false });
      return undefined;
    }
    setMetadata({ status: "waiting", message: "Ссылка принята — через мгновение заполним карточку." });
    autoTimerRef.current = window.setTimeout(() => { recognize(url); }, 600);
    return () => window.clearTimeout(autoTimerRef.current);
  }, [form.url, editing, isPlaces]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { window.clearTimeout(autoTimerRef.current); metadataRequestRef.current += 1; }, []);
  const updateMetadataField = (field, value) => { editedMetadataFieldsRef.current.add(field); setForm((current) => ({ ...current, [field]: value })); };
  const cleanupUploadedImages = async (keepUrl = "") => {
    const keepId = uploadedImageIdFromUrl(keepUrl);
    const ids = [...uploadedImageIdsRef.current].filter((id) => id !== keepId);
    ids.forEach((id) => uploadedImageIdsRef.current.delete(id));
    await Promise.allSettled(ids.map((id) => api.delete(`/uploads/images/${encodeURIComponent(id)}`)));
  };
  useEffect(() => () => {
    const ids = [...uploadedImageIdsRef.current];
    uploadedImageIdsRef.current.clear();
    ids.forEach((id) => {
      sessionFetch(`/api/uploads/images/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    });
  }, []);
  const uploadImage = async (file) => {
    if (!file || imageUploading || loading || deleting || mutationRef.current) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Подойдёт изображение JPG, PNG или WEBP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError("Изображение должно быть не больше 8 МБ.");
      return;
    }
    setImageUploading(true);
    setImageError("");
    try {
      const result = await api.uploadImage(file);
      uploadedImageIdsRef.current.add(result.id);
      updateMetadataField("imageUrl", result.imageUrl);
    } catch (error) {
      setImageError(error.message || "Не удалось загрузить изображение.");
    } finally {
      setImageUploading(false);
      setImageDropActive(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (mutationRef.current || deleting || imageUploading || assistantListPending) return;
    mutationRef.current = "save";
    setLoading(true);
    try {
      const payload = { ...form, price: form.price === "" ? null : Number(form.price), eventDate: form.eventDate || null };
      if (editing) {
        const { add, remove } = wishParticipantChanges(initialParticipants, participants);
        if (add.length || remove.length) payload.participantChanges = { add, remove };
      } else {
        payload.space = effectiveSpace;
        payload.participantIds = participants.map(({ id }) => id);
      }
      const result = editing ? await api.patch(`/wishes/${wish.id}`, payload) : await api.post("/wishes", payload);
      const savedUploadId = uploadedImageIdFromUrl(result.wish?.imageUrl);
      if (savedUploadId) uploadedImageIdsRef.current.delete(savedUploadId);
      await cleanupUploadedImages(result.wish?.imageUrl || "");
      toast(withWishReward(editing ? "Изменения сохранены" : "Желание добавлено ✦", result.reward));
      await onSaved?.(result.wish);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      mutationRef.current = null;
      setLoading(false);
    }
  };
  const remove = async () => {
    if (mutationRef.current || loading || deleting || imageUploading) return;
    mutationRef.current = "delete";
    setDeleting(true);
    try {
      await api.delete(`/wishes/${wish.id}`);
      toast("Желание удалено");
      if (onDeleted) await onDeleted();
      else onClose();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      mutationRef.current = null;
      setDeleting(false);
    }
  };
  const setListSelected = (id, selected) => setForm((current) => ({
    ...current,
    listIds: selected
      ? (current.listIds.includes(id) ? current.listIds : [...current.listIds, id])
      : current.listIds.filter((item) => item !== id),
  }));
  const metadataNotice = metadata.status !== "idle" && <div className={`metadata-status metadata-status--${metadata.status}`} role="status" aria-live="polite"><span className="metadata-status__icon">{["waiting", "loading"].includes(metadata.status) ? <LoaderCircle className="spin" /> : metadata.status === "success" ? <CheckCircle2 /> : <X />}</span><div><strong>{metadata.status === "waiting" ? "Готовим автозаполнение" : metadata.status === "loading" ? (isPlaces ? "Читаем место в Яндекс Картах" : isVideo ? `Читаем видео в ${videoProviderLabel}` : isKinopoisk ? "Загружаем постер Кинопоиска" : isMedia ? "Загружаем обложку" : isTransport ? "Читаем объявление автомобиля" : "Читаем карточку товара") : metadata.status === "success" ? "Готово" : "Не получилось автоматически"}</strong><span>{metadata.message}</span></div>{metadata.status === "error" && metadata.retryable !== false && form.url && <ShadcnButton variant="ghost" type="button" onClick={() => recognize(form.url)}>Повторить</ShadcnButton>}</div>;
  const requestClose = () => {
    if (loading || deleting || imageUploading || listCreatorOpen || deleteConfirm) return;
    cleanupUploadedImages();
    onClose();
  };
  const cancelDelete = () => {
    if (deleting) return;
    setDeleteConfirm(false);
  };

  const fieldId = (name) => `wish-editor-${name}-${wish?.id || "new"}`;
  const editorContent = <>
        <ControlBar className="contents"><ShadcnButton data-control-icon type="button" variant="ghost" className="wish-editor-screen__close" size="icon" disabled={loading || deleting || imageUploading} onClick={requestClose}>
          <X />
          <span className="sr-only">Закрыть</span>
        </ShadcnButton></ControlBar>
        <form
          className={`wish-editor mx-auto flex w-full flex-col ${editing ? "wish-editor--edit" : "wish-editor--create"}`}
          onSubmit={submit}
          onPaste={(event) => {
            const imageItem = [...(event.clipboardData?.items || [])]
              .find((item) => item.kind === "file" && item.type.startsWith("image/"));
            const imageFile = imageItem?.getAsFile();
            if (!imageFile) return;
            event.preventDefault();
            uploadImage(imageFile);
          }}
        >
          <h2 id={fieldId("dialog-title")} className="sr-only">{editing ? `Редактирование желания «${wish.title}»` : "Создание желания"}</h2>
          <p id={fieldId("dialog-description")} className="sr-only">{editing ? "Обновите информацию, изображение и списки желания." : "Добавьте изображение и заполните основную информацию о желании."}</p>

          <div className="wish-editor-screen__content px-4" aria-label="Поля желания">
            {requestedListName && listsError && <Alert variant="destructive" role="alert">
              <AlertDescription>Не удалось загрузить списки.</AlertDescription>
              <ShadcnButton type="button" variant="outline" onClick={() => void reloadDashboard().catch(() => {})}>Повторить</ShadcnButton>
            </Alert>}
            {requestedListName && data && !matchedList && <p className="m-0" role="status">
              {matchingLists.length ? `Есть несколько списков «${requestedListName}».` : `Список «${requestedListName}» не найден.`} Выберите список в форме или оставьте желание без списка.
            </p>}
            <div className="wish-editor__layout m-0 flex h-auto w-full flex-col gap-4 overflow-visible p-0 pr-3 max-[820px]:pr-0">
          <section className="wish-editor__media h-auto w-full gap-2" aria-label="Фотография желания">
            <div
              className={`wish-editor__image aspect-[4/3] h-auto min-h-0 rounded-lg ${formPreviewImageUrl ? "has-image" : "is-empty"} ${imageDropActive ? "is-dragging" : ""}`}
              aria-busy={imageUploading || undefined}
              role="button"
              tabIndex={imageUploading ? -1 : 0}
              aria-label={formPreviewImageUrl ? "Сменить фотографию желания" : "Добавить фотографию желания"}
              onClick={() => { if (!imageUploading) imageFileRef.current?.click(); }}
              onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !imageUploading) { event.preventDefault(); imageFileRef.current?.click(); } }}
              onDragEnter={(event) => { event.preventDefault(); if (!imageUploading) setImageDropActive(true); }}
              onDragOver={(event) => { event.preventDefault(); if (!imageUploading) setImageDropActive(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setImageDropActive(false); }}
              onDrop={(event) => {
                event.preventDefault();
                setImageDropActive(false);
                uploadImage(event.dataTransfer.files?.[0]);
              }}
            >
              {formPreviewImageUrl
                ? <img src={formPreviewImageUrl} alt={`Фото желания «${form.title || wish?.title || "Новое желание"}»`} referrerPolicy="strict-origin-when-cross-origin" onError={(event) => applyRetailerPreviewFallback(event, form.url)} />
                : <Empty className="wish-editor__image-empty h-full gap-3 rounded-[inherit] border bg-muted/30 p-4 transition-colors max-[380px]:gap-2 max-[380px]:p-3">
                  <EmptyHeader className="gap-1">
                    <EmptyMedia className="mb-1" variant="icon"><Image aria-hidden="true" /></EmptyMedia>
                    <EmptyTitle>{imageUploading ? "Загружаем изображение…" : "Добавить изображение"}</EmptyTitle>
                    <EmptyDescription id={fieldId("image-help")}>JPG, PNG или WEBP · до 8 МБ</EmptyDescription>
                  </EmptyHeader>
                </Empty>}
              <Input
                ref={imageFileRef}
                className="sr-only !size-px"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Загрузить фотографию желания"
                aria-invalid={Boolean(imageError) || undefined}
                aria-describedby={`${fieldId("image-help")}${imageError ? ` ${fieldId("image-error")}` : ""}`}
                onChange={(event) => uploadImage(event.target.files?.[0])}
              />
            </div>
            {imageError && <FieldError id={fieldId("image-error")}>{imageError}</FieldError>}
            {browserRetailer && <p className="text-sm leading-relaxed text-muted-foreground">Фото из «{browserRetailer.label}» загружается автоматически через помощник обычного браузера.</p>}
          </section>

          <section className="wish-editor__panel w-full overflow-visible p-0">
            <div className="wish-editor__scroll flex h-auto w-full flex-col gap-4 overflow-visible p-0 [scrollbar-gutter:auto]">
              <Field className="wish-editor__field">
                <FieldLabel htmlFor={fieldId("title")}>Название</FieldLabel>
                <ProductTitleInput id={fieldId("title")} enabled={effectiveSpace === "products"} disabled={loading || deleting} autoFocus={editing && canAutofocusForm()} required value={form.title} placeholder="Название желания" onValueChange={(value) => updateMetadataField("title", value)} />
              </Field>

              <WishParticipantField participants={participants} onChange={setParticipants} spaceLabel={SPACES.find(({ id }) => id === effectiveSpace)?.label} disabled={loading || deleting} />

              {isTransport && <div className="grid gap-4">
                <Field className="wish-editor__field">
                  <FieldLabel htmlFor={fieldId("vehicleMake")}>Марка</FieldLabel>
                  {vehicleCatalog.status === "unavailable" ? <Input
                    id={fieldId("vehicleMake")}
                    value={form.vehicleMake}
                    placeholder="Например, BMW"
                    autoComplete="off"
                    onChange={(event) => {
                      editedMetadataFieldsRef.current.add("vehicleMake");
                      editedMetadataFieldsRef.current.add("vehicleModel");
                      setForm((current) => ({ ...current, vehicleMake: event.target.value, vehicleModel: "" }));
                    }}
                  /> : <Select
                    value={form.vehicleMake}
                    disabled={vehicleCatalog.status !== "ready"}
                    onValueChange={(value) => {
                      editedMetadataFieldsRef.current.add("vehicleMake");
                      editedMetadataFieldsRef.current.add("vehicleModel");
                      setForm((current) => ({ ...current, vehicleMake: value, vehicleModel: "" }));
                    }}
                  >
                    <SelectTrigger id={fieldId("vehicleMake")} className="w-full" aria-label="Марка автомобиля">
                      <SelectValue>{(value) => value || (vehicleCatalog.status === "loading" ? "Загружаем марки…" : "Выберите марку")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-(--anchor-width)" align="start" alignItemWithTrigger={false}>
                      {form.vehicleMake && !vehicleCatalog.makes.includes(form.vehicleMake) && <SelectItem value={form.vehicleMake}>{form.vehicleMake}</SelectItem>}
                      {vehicleCatalog.makes.map((make) => <SelectItem value={make} key={make}>{make}</SelectItem>)}
                    </SelectContent>
                  </Select>}
                </Field>
                <Field className="wish-editor__field">
                  <FieldLabel htmlFor={fieldId("vehicleModel")}>Модель</FieldLabel>
                  {vehicleCatalog.status === "unavailable" || vehicleCatalog.modelsStatus === "unavailable" ? <Input
                    id={fieldId("vehicleModel")}
                    value={form.vehicleModel}
                    placeholder="Например, X5"
                    autoComplete="off"
                    onChange={(event) => updateMetadataField("vehicleModel", event.target.value)}
                  /> : <Select
                    value={form.vehicleModel}
                    disabled={vehicleCatalog.status !== "ready" || !form.vehicleMake || vehicleCatalog.modelsStatus !== "ready"}
                    onValueChange={(value) => updateMetadataField("vehicleModel", value)}
                  >
                    <SelectTrigger id={fieldId("vehicleModel")} className="w-full" aria-label="Модель автомобиля">
                      <SelectValue>{(value) => value || (vehicleCatalog.modelsStatus === "loading" ? "Загружаем модели…" : form.vehicleMake ? "Выберите модель" : "Сначала выберите марку")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-(--anchor-width)" align="start" alignItemWithTrigger={false}>
                      {form.vehicleModel && !vehicleCatalog.models.includes(form.vehicleModel) && <SelectItem value={form.vehicleModel}>{form.vehicleModel}</SelectItem>}
                      {vehicleCatalog.models.map((model) => <SelectItem value={model} key={model}>{model}</SelectItem>)}
                    </SelectContent>
                  </Select>}
                </Field>
                {(vehicleCatalog.status === "loading" || vehicleCatalog.status === "unavailable" || ["loading", "unavailable"].includes(vehicleCatalog.modelsStatus)) && <p className="m-0 text-sm leading-relaxed text-muted-foreground" role="status" aria-live="polite">
                  {vehicleCatalog.status === "loading" && "Загружаем марки из базы «Авто»…"}
                  {vehicleCatalog.status === "unavailable" && "Справочник «Авто» сейчас недоступен — марку и модель можно ввести вручную."}
                  {vehicleCatalog.status === "ready" && vehicleCatalog.modelsStatus === "loading" && "Загружаем модели выбранной марки…"}
                  {vehicleCatalog.status === "ready" && vehicleCatalog.modelsStatus === "unavailable" && "Модели не загрузились — модель можно ввести вручную."}
                </p>}
              </div>}

              <Field className="wish-editor__field wish-editor__field--link grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel className="col-start-1 row-start-1" htmlFor={fieldId("url")}>{isPlaces ? "Ссылка из Яндекс Карт" : isFood ? "Ссылка на продукт" : "Ссылка"}</FieldLabel>
                <Input className="col-span-2 row-start-2" id={fieldId("url")} autoFocus={!editing && canAutofocusForm()} type="url" inputMode="url" value={form.url} placeholder={isPlaces ? "https://yandex.ru/maps/…" : isFood ? "https://lenta.com/product/…" : isTransport ? "https://auto.ru/cars/used/sale/…" : "https://…"} onChange={(event) => updateMetadataField("url", event.target.value)} />
                <ShadcnButton className="wish-editor__link-action col-start-2 row-start-1 justify-self-end" type="button" variant="ghost" disabled={!form.url.trim() || metadata.status === "loading"} onClick={() => recognize(form.url)}>
                  {metadata.status === "loading" ? <LoaderCircle className="spin" /> : <Sparkles />}
                  <span>{metadata.status === "loading" ? "Заполняем…" : "Заполнить по ссылке"}</span>
                </ShadcnButton>
                {isPlaces && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" /> Ссылка на место из Яндекс Карт — подставим название и адрес</p>}
                {isMedia && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><Clapperboard size={14} aria-hidden="true" /> {isKinopoisk ? "Ссылка на фильм или сериал с Кинопоиска — подставим постер" : isKinopoiskSite ? "Нужна ссылка на карточку фильма или сериала, а не на поиск Кинопоиска" : isVideo ? `Ссылка на видео в ${videoProviderLabel} — подставим название и превью` : "Ссылка на книгу с Bookmate, Альпины или МИФа — подставим название и обложку"}</p>}
                {isFood && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><UtensilsCrossed size={14} aria-hidden="true" /> {browserRetailer ? `${browserRetailer.label} — помощник браузера автоматически подставит название, фото и доступную цену` : "Подставим название, фото и цену для выбранного магазином региона"}</p>}
              </Field>

              {metadataNotice}

              {effectiveSpace === "products" && <Field className="wish-editor__field">
                <FieldLabel htmlFor={fieldId("fundraisingUrl")}>Ссылка на сбор</FieldLabel>
                <Input id={fieldId("fundraisingUrl")} type="url" inputMode="url" pattern="https?://.*" value={form.fundraisingUrl} placeholder="https://…" onChange={(event) => setForm((current) => ({ ...current, fundraisingUrl: event.target.value }))} />
              </Field>}

              <Field className="wish-editor__field wish-editor__field--description">
                <FieldLabel className="sr-only" htmlFor={fieldId("description")}>Описание желания</FieldLabel>
                <Textarea className="resize-none" id={fieldId("description")} rows={3} value={form.description} placeholder="Опишите желание" onChange={(event) => updateMetadataField("description", event.target.value)} />
              </Field>

              <Field className="wish-editor__field wish-editor__field--price grid grid-cols-[minmax(0,1fr)_84px] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel className="col-span-2 row-start-1" htmlFor={fieldId("price")}>Цена</FieldLabel>
                <Input className="col-start-1 row-start-2" id={fieldId("price")} type="number" min="0" step="0.01" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} />
                <Select value={form.currency} onValueChange={(currency) => updateMetadataField("currency", currency)}>
                  <SelectTrigger className="wish-editor__currency col-start-2 row-start-2 w-full" aria-label="Валюта">
                    <SelectValue>{(currency) => WISH_CURRENCY_SYMBOLS[currency] || ""}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="end">
                    {WISH_CURRENCIES.map((currency) => <SelectItem value={currency} key={currency} aria-label={`${WISH_CURRENCY_SYMBOLS[currency]} ${currency}`}>{WISH_CURRENCY_SYMBOLS[currency]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              {showEventDate && <Field className="wish-editor__field wish-editor__field--date">
                <FieldLabel htmlFor={fieldId("eventDate")}>Дата события</FieldLabel>
                <PlanningDatePicker id={fieldId("eventDate")} label="Дата события" clearable value={form.eventDate} onChange={(date) => setForm((current) => ({ ...current, eventDate: date }))} className="w-full justify-between" />
              </Field>}

              <div className="wish-editor__settings flex flex-col gap-2" role="group" aria-label="Настройки желания">
                <Field orientation="horizontal" className="wish-editor__switch-row min-h-12 gap-3 px-0">
                  <EyeOff aria-hidden="true" />
                  <FieldLabel className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={fieldId("private")}>Секретное желание</FieldLabel>
                  <Switch id={fieldId("private")} checked={form.privacy === "private"} onCheckedChange={(checked) => setForm({ ...form, privacy: checked ? "private" : "inherit" })} />
                </Field>
                <Field orientation="horizontal" className="wish-editor__switch-row min-h-12 gap-3 px-0">
                  <LockKeyhole aria-hidden="true" />
                  <FieldLabel className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={fieldId("multiple")}>Многократное бронирование</FieldLabel>
                  <Switch id={fieldId("multiple")} checked={form.allowMultiple} onCheckedChange={(checked) => setForm({ ...form, allowMultiple: checked })} />
                </Field>
              </div>

              <fieldset className="wish-editor__lists">
                <legend className="visually-hidden">Списки желания</legend>
                <div className="wish-editor__lists-head">
                  <strong>Списки</strong>
                  <ShadcnButton ref={listCreatorTriggerRef} type="button" variant="ghost" disabled={loading || deleting} onClick={() => { if (!mutationRef.current) setListCreatorOpen(true); }}><ListPlus /> Новый список</ShadcnButton>
                </div>
                {listsLoading ? <LoadingScreen compact /> : <div className="wish-editor__list-rows">
                  {visibleLists.length ? visibleLists.map((list) => {
                    const selected = form.listIds.includes(list.id);
                    const listSwitchId = fieldId(`list-${list.id}`);
                    return <Field orientation="horizontal" className={`wish-editor__list-row min-h-12 gap-3 rounded-lg py-1.5 ${selected ? "is-selected" : ""}`} key={list.id}>
                      <FieldLabel className="wish-editor__list-title min-w-0 flex-1 cursor-pointer" htmlFor={listSwitchId}>{listDisplayTitle(list)}</FieldLabel>
                      <Switch
                        id={listSwitchId}
                        className="wish-editor__list-switch"
                        checked={selected}
                        onCheckedChange={(checked) => setListSelected(list.id, checked)}
                      />
                    </Field>;
                  }) : <p className="px-2 py-6 text-center text-xs text-muted-foreground">В этом пространстве пока нет списков.</p>}
                </div>}
              </fieldset>
            </div>
          </section>
            </div>
          </div>

          <MobileFormFooter className="wish-editor-screen__footer">
            <ShadcnButton type="submit" disabled={loading || deleting || imageUploading || assistantListPending} aria-busy={loading || undefined} aria-label={editing ? "Обновить" : "Загадать желание"}>
              {loading && <Spinner />}{editing ? "Обновить" : "Загадать желание"}
            </ShadcnButton>
            {editing && <ShadcnButton ref={deleteTriggerRef} type="button" variant="destructive" size="icon" data-control-icon aria-label="Удалить желание" title="Удалить желание" disabled={loading || deleting || imageUploading} onClick={() => { if (!mutationRef.current && !loading && !deleting) setDeleteConfirm(true); }}><Trash2 aria-hidden="true" /></ShadcnButton>}
          </MobileFormFooter>
        </form>
    </>;
  const editorSurface = editing ? <FullscreenDialog
    className="wish-editor-screen"
    id={fieldId("dialog-content")}
    aria-labelledby={fieldId("dialog-title")}
    aria-describedby={fieldId("dialog-description")}
    busy={loading || deleting || imageUploading}
    suspended={listCreatorOpen || deleteConfirm}
    onClose={requestClose}
  >
    {editorContent}
  </FullscreenDialog> : <Drawer
    open
    onAfterClose={onAfterClose}
    modal={!listCreatorOpen}
    disablePointerDismissal={listCreatorOpen}
    showSwipeHandle={!isMobile}
    swipeDirection={isMobile ? "down" : "right"}
    onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}
  >
    <DrawerContent className="wish-editor-drawer app-mobile-screen rollapp-body app-drawer--form">
      <DrawerHeader className="pr-16 text-left!">
        <DrawerTitle>Добавить желание</DrawerTitle>
        <DrawerDescription>Добавьте изображение и заполните основную информацию.</DrawerDescription>
      </DrawerHeader>
      <section id={fieldId("dialog-content")} data-slot="wish-editor-content" className="wish-editor-screen wish-editor-screen--drawer">
        {editorContent}
      </section>
    </DrawerContent>
  </Drawer>;

  return <>
      {editorSurface}
      {editing && deleteConfirm && <WishDeleteAlert open wish={wish} busy={deleting} onOpenChange={cancelDelete} onConfirm={remove} />}
      {listCreatorOpen && <ListModal
        listsCount={data?.lists?.length || 0}
        space={effectiveSpace}
        returnFocusRef={listCreatorTriggerRef}
        onClose={() => setListCreatorOpen(false)}
        onSaved={async (saved) => {
          if (saved?.id) {
            setForm((current) => current.listIds.includes(saved.id)
              ? current
              : { ...current, listIds: [...current.listIds, saved.id] });
          }
          try {
            await reloadDashboard({ background: true });
          } catch {
            toast("Список создан, но перечень не обновился. Откройте редактор ещё раз.", "error");
          }
          setListCreatorOpen(false);
        }}
      />}
    </>;
}

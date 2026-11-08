import { ProductTitleInput } from "@/components/product-title-input";
import { useEffect, useId, useRef, useState } from "react";
import { Camera, Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { ControlBar } from "@/components/control-bar";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

const itemDefaults = { title: "", description: "", brand: "", imageUrl: "", actionUrl: "", price: "", active: true };
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageBytes = 8 * 1024 * 1024;

function listingUrl(value) {
  const url = value.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) throw new Error("Введите ссылку, которая начинается с https:// или http://.");
  try {
    new URL(url);
    return url;
  } catch {
    throw new Error("Проверьте адрес ссылки.");
  }
}

function ItemPhoto({ photo, onChange, disabled, captionId, error, unreadable, onPhotoError, sale }) {
  const picker = useRef(null);
  const [dragging, setDragging] = useState(false);
  const hasFiles = (event) => event.dataTransfer.types.includes("Files");

  return (
    <section className="grid gap-3" aria-labelledby={`${captionId}-heading`}>
      <div className="grid gap-1">
        <h2 id={`${captionId}-heading`} className="font-heading text-xl font-semibold">Фото для обложки</h2>
        <p className="text-xs text-muted-foreground" id={captionId}>
          JPG, PNG или WebP до 8 МБ. {sale ? "Это фото будет видно в объявлении." : "Это фото будет видно в каталоге и на витрине."}
        </p>
      </div>
      <Input
        ref={picker}
        type="file"
        accept={imageTypes.join(",")}
        hidden
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files.length) onChange(event.target.files);
          event.target.value = "";
        }}
      />
      <div
        className="grid min-w-0 gap-3 rounded-2xl border border-dashed bg-muted/25 p-3 transition-colors data-[dragging=true]:border-ring data-[dragging=true]:bg-muted"
        data-dragging={dragging}
        onDragOver={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragging(false);
          if (!disabled) onChange(event.dataTransfer.files);
        }}
      >
        {photo ? (
          <>
            <div className="grid aspect-[16/9] place-items-center overflow-hidden rounded-xl bg-muted">
              {unreadable
                ? <p className="px-3 text-center text-muted-foreground">Фото не открывается</p>
                : <img src={photo} alt="Предпросмотр обложки" className="h-full min-h-0 w-full object-contain" onError={onPhotoError} />}
            </div>
            <ControlBar className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => picker.current.click()} disabled={disabled} aria-describedby={captionId}>
                Заменить фото
              </Button>
              <Button type="button" variant="destructive" size="icon" data-control-icon onClick={() => onChange(null)} disabled={disabled} aria-label="Убрать фото">
                <Trash2 aria-hidden="true" />
              </Button>
            </ControlBar>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-28 w-full flex-col gap-2 whitespace-normal rounded-xl py-4"
            disabled={disabled}
            aria-describedby={captionId}
            onClick={() => picker.current.click()}
          >
            <Camera aria-hidden="true" className="size-6" />
            Добавить фото
            <span className="hidden text-xs font-normal text-muted-foreground md:block">или перетащите сюда</span>
          </Button>
        )}
      </div>
      {error && <FieldError className="text-xs">{error}</FieldError>}
    </section>
  );
}

export function WishlistBusinessItemEditor({ item, space, spaceLabel, published, onClose, onSaved, renderPreview, sale, open = true, onAfterClose }) {
  const isMobile = useIsMobile();
  const prefix = useId();
  const [initial] = useState(() => Object.fromEntries(Object.entries(itemDefaults).map(
    ([key, value]) => [key, item[key] ?? value],
  )));
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null);
  const [localPreview, setLocalPreview] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [unreadableFile, setUnreadableFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [phase, setPhase] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const saveLock = useRef(false);
  const requestId = useRef(null);
  const uploaded = useRef(null);
  const saveErrorRef = useRef(null);
  const titleRef = useRef(null);
  const linkRef = useRef(null);
  const headingRef = useRef(null);
  const isProduct = space === "products";
  const noun = isProduct ? "товар" : "позицию";
  const unreadable = Boolean(file && file === unreadableFile);
  const dirty = Boolean(file) || Object.keys(initial).some((key) => form[key] !== initial[key]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLocalPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (saveError) saveErrorRef.current?.focus();
  }, [saveError]);

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const selectPhoto = (files) => {
    if (!files) {
      setFile(null);
      set("imageUrl", "");
    } else {
      const [next] = files;
      if (files.length !== 1) return setPhotoError("Выберите одно фото для обложки.");
      if (!imageTypes.includes(next.type) || !next.size) return setPhotoError("Выберите фото в формате JPG, PNG или WebP.");
      if (next.size > maxImageBytes) return setPhotoError("Фото весит больше 8 МБ. Выберите файл поменьше.");
      setFile(next);
    }
    setUnreadableFile(null);
    setPhotoError("");
    setSaveError("");
  };

  const close = () => {
    if (saveLock.current) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const save = async (event) => {
    event.preventDefault();
    if (saveLock.current || confirmClose || unreadable) return;
    const errors = {};
    const title = form.title.trim();
    if (!title) errors.title = "Введите название.";
    let actionUrl;
    try {
      actionUrl = listingUrl(form.actionUrl);
    } catch (error) {
      errors.actionUrl = error.message;
    }
    setFieldErrors(errors);
    if (errors.title || errors.actionUrl) {
      (errors.title ? titleRef : linkRef).current?.focus();
      return;
    }

    saveLock.current = true;
    setSaveError("");
    let uploading = false;
    try {
      let imageUrl = form.imageUrl;
      if (file) {
        if (uploaded.current?.file !== file) {
          uploading = true;
          setPhase("uploading");
          const result = await api.uploadImage(file, { signal: AbortSignal.timeout(45_000) });
          if (!result.imageUrl) throw new Error("Сервер не вернул адрес фото.");
          uploaded.current = { file, imageUrl: result.imageUrl };
        }
        imageUrl = uploaded.current.imageUrl;
      }
      uploading = false;
      setPhase("saving");
      const payload = { ...form, title, actionUrl, imageUrl, brand: form.brand.trim(), price: form.price.trim(), description: form.description.trim() };
      const endpoint = `/wishlist-business/${space}/${sale ? "sales" : "items"}`;
      const options = { signal: AbortSignal.timeout(25_000) };
      let result;
      if (item.id) result = await api.patch(`${endpoint}/${encodeURIComponent(item.id)}`, payload, options);
      else if (sale?.wishId) result = await api.post(endpoint, { ...payload, wishId: sale.wishId }, options);
      else {
        requestId.current ??= crypto.randomUUID();
        result = await api.post(endpoint, { ...payload, requestId: requestId.current }, options);
      }
      if (!result.item?.id) throw new Error("Сервер не подтвердил сохранение.");
      const replayChanged = result.replayed && Object.keys(payload).some((key) => result.item[key] !== payload[key]);
      if (replayChanged) {
        toast.info(isProduct ? "Товар уже добавлен" : "Позиция уже добавлена", { description: "Последние правки можно внести в сохранённой карточке." });
      } else {
        toast.success(isProduct ? "Товар сохранён" : "Позиция сохранена");
      }
      onSaved(result.item);
      onClose();
    } catch (error) {
      setSaveError(`${uploading ? "Не удалось загрузить фото." : "Не удалось подтвердить сохранение."} ${error.message}`);
    } finally {
      saveLock.current = false;
      setPhase("");
    }
  };

  const photo = file ? (localPreview?.file === file ? localPreview.url : "") : form.imageUrl;
  const publicItem = published && form.active;
  const submitLabel = item.id
    ? "Сохранить"
    : publicItem ? "Опубликовать" : form.active ? "Добавить" : "Сохранить скрытым";
  const heading = sale
    ? (item.id ? "Редактировать объявление" : sale.wishId ? "Выставить на продажу" : `Добавить ${noun}`)
    : (item.id ? `Редактировать ${noun}` : `Добавить ${noun}`);

  return (
    <>
      <Drawer open={open} onAfterClose={onAfterClose} onOpenChange={(open, details) => {
        if (open) return;
        details?.cancel();
        close();
      }}>
        <DrawerContent
          className="app-drawer--form rollapp-body"
          data-wishlist-item-editor=""
          aria-label={heading}
          initialFocus={headingRef}
        >
          <DrawerHeader className="shrink-0 gap-1 border-b px-(--layout-page-inset) py-4 md:px-6">
            <DrawerDescription className="text-xs text-muted-foreground">{sale ? "Мои продажи" : "Витрина"} · {spaceLabel}</DrawerDescription>
            <DrawerTitle ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold">
              {heading}
            </DrawerTitle>
          </DrawerHeader>
          <form onSubmit={save} noValidate className="form-surface flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-(--layout-page-inset) py-5 md:px-6">
              <ItemPhoto
                photo={photo} onChange={selectPhoto} disabled={Boolean(phase)} captionId={`${prefix}-photo`} sale={Boolean(sale)}
                error={photoError || (unreadable ? "Замените повреждённый файл или уберите фото." : "")}
                unreadable={unreadable} onPhotoError={file ? () => setUnreadableFile(file) : undefined}
              />

              <section aria-labelledby={`${prefix}-details`} className="grid min-w-0 gap-4 border-t pt-5">
                <h2 id={`${prefix}-details`} className="font-heading text-xl font-semibold">Основная информация</h2>
                <Field data-invalid={Boolean(fieldErrors.title)}>
                  <FieldLabel htmlFor={`${prefix}-title`}>Название</FieldLabel>
                  <ProductTitleInput
                    enabled={isProduct} ref={titleRef} id={`${prefix}-title`} required maxLength={160}
                    placeholder={isProduct ? "Кофемашина Dedica" : "Короткое название"}
                    value={form.title} onValueChange={(value) => set("title", value)} disabled={Boolean(phase)}
                    aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? `${prefix}-title-error` : undefined}
                  />
                  {fieldErrors.title && <FieldError id={`${prefix}-title-error`}>{fieldErrors.title}</FieldError>}
                </Field>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`${prefix}-brand`}>Бренд</FieldLabel>
                    <Input id={`${prefix}-brand`} placeholder="Если есть" maxLength={100} value={form.brand} onChange={(event) => set("brand", event.target.value)} disabled={Boolean(phase)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${prefix}-price`}>Цена с валютой</FieldLabel>
                    <Input id={`${prefix}-price`} placeholder="12 900 ₽" maxLength={80} value={form.price} onChange={(event) => set("price", event.target.value)} disabled={Boolean(phase)} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-description`}>Описание</FieldLabel>
                  <Textarea
                    id={`${prefix}-description`} rows={4} maxLength={4000}
                    placeholder={isProduct ? "Расскажите о состоянии, комплектации и особенностях товара" : "Расскажите, что важно знать покупателю"}
                    value={form.description} onChange={(event) => set("description", event.target.value)} disabled={Boolean(phase)}
                    aria-describedby={`${prefix}-description-count`}
                  />
                  <p id={`${prefix}-description-count`} className="text-right text-xs tabular-nums text-muted-foreground">{form.description.length} / 4000</p>
                </Field>
                <Field data-invalid={Boolean(fieldErrors.actionUrl)}>
                  <FieldLabel htmlFor={`${prefix}-link`}>Ссылка на {noun}</FieldLabel>
                  <Input
                    ref={linkRef} id={`${prefix}-link`} type="url" autoCapitalize="none" maxLength={2000}
                    placeholder="https://…" value={form.actionUrl} onChange={(event) => set("actionUrl", event.target.value)} disabled={Boolean(phase)}
                    aria-invalid={Boolean(fieldErrors.actionUrl)} aria-describedby={`${prefix}-link-hint`}
                  />
                  {fieldErrors.actionUrl ? <FieldError id={`${prefix}-link-hint`}>{fieldErrors.actionUrl}</FieldError>
                    : <p id={`${prefix}-link-hint`} className="text-xs text-muted-foreground">Необязательно. Покупатели смогут открыть эту страницу из карточки.</p>}
                </Field>
              </section>

              <section aria-labelledby={`${prefix}-visibility`} className="grid min-w-0 gap-3 border-t pt-5">
                <h2 id={`${prefix}-visibility`} className="font-heading text-xl font-semibold">Видимость</h2>
                <div className="flex min-w-0 items-start justify-between gap-3 rounded-xl border bg-muted/25 p-3">
                  <div className="grid min-w-0 gap-1">
                    <FieldLabel htmlFor={`${prefix}-active`}>{sale ? "Опубликовать объявление" : "Показывать на витрине"}</FieldLabel>
                    <p id={`${prefix}-visibility-hint`} className="text-xs text-muted-foreground">
                      {!form.active ? "Карточка видна только вам." : published ? "Покупатели увидят карточку после сохранения." : "Покупатели увидят карточку после публикации страницы продавца."}
                    </p>
                  </div>
                  <Switch id={`${prefix}-active`} aria-describedby={`${prefix}-visibility-hint`} checked={form.active} onCheckedChange={(value) => set("active", value)} disabled={Boolean(phase)} />
                </div>
                <ControlBar className="flex">
                  <Button
                    type="button" variant="outline" className="w-full" aria-expanded={showPreview} aria-controls={`${prefix}-preview`}
                    onClick={() => setShowPreview((current) => !current)}
                  >
                    {showPreview ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    {showPreview ? "Свернуть предпросмотр" : "Предпросмотр"}
                  </Button>
                </ControlBar>
                <div id={`${prefix}-preview`} hidden={!showPreview}>
                  {showPreview && renderPreview({ ...form, imageUrl: unreadable ? "" : photo })}
                </div>
              </section>
              {saveError && (
                <Alert ref={saveErrorRef} variant="destructive" tabIndex={-1}>
                  <AlertTitle>Не удалось завершить отправку</AlertTitle>
                  <AlertDescription>{saveError} Данные остались в форме. Попробуйте ещё раз.</AlertDescription>
                </Alert>
              )}
              <span role="status" className="sr-only">{phase === "uploading" ? "Загружаем фото" : phase === "saving" ? "Сохраняем карточку" : ""}</span>
            </div>
            <DrawerFooter>
              {!isMobile && <Button type="button" variant="outline" onClick={close} disabled={Boolean(phase)}>Отмена</Button>}
              <Button type="submit" disabled={Boolean(phase) || unreadable}>
                {phase && <Spinner aria-hidden="true" />}
                {phase === "uploading" ? "Загружаем фото…" : phase === "saving" ? "Сохраняем…" : submitLabel}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>Изменения в карточке будут потеряны.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить редактирование</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>Выйти</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

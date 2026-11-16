import { profileNameAddress } from "../../../shared/modules/profile/profile-name-address.js";
import { EXTERNAL_WISHLIST_PROVIDERS, EXTERNAL_WISHLIST_URL_MAX_LENGTH, externalWishlistUrl } from "../../../shared/modules/profile/external-wishlists.js";
import { platformLink } from "../../applications/location.js";
import { localDateKey } from "../../../shared/modules/planning/planning.js";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker.jsx";
import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { MemberNumberBoard } from "./member-number-board.jsx";
import { ProfileMoodSettings } from "@/modules/profile/profile-mood-settings.jsx";
import { ContactCardContent } from "@/modules/contacts/contact-card-dialog.jsx";
import { PageActionButton } from "@/components/page-action-button";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  CircleUserRound,
  Fingerprint,
  Gift,
  Heart,
  LockKeyhole,
  LogOut,
  PackageCheck,
  QrCode,
  RotateCcw,
  Smile,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "../runtime/api.js";
import { ProfileGiftCards } from "@/modules/loyalty/gift-cards.jsx";
import { RollsWallet } from "@/modules/payments/rolls-wallet.jsx";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OpenRouterSettings } from "@/modules/assistant/openrouter-settings.jsx";
import { InvitesManager } from "@/modules/auth/invites-manager.jsx";
import { ProfileAccounts } from "@/modules/profile/profile-accounts.jsx";
import { ProfileMcpKeys } from "@/modules/profile/profile-mcp-keys.jsx";
import { PrivateNotesLink } from "@/components/private-notes";
import { DiskProfileSettings } from "@/modules/profile/disk-profile-settings.jsx";
import { useDiskSyncSettings } from "@/modules/runtime/disk-sync-settings.jsx";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerSectionHeader,
  DrawerTitle,
} from "@/components/form-surface";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { safeNextPath, yandexAuthStartPath } from "../auth/auth.js";
import { APP_ORDERS_PATH } from "../shell/app-routing.js";
import { requestBrowserWishlist } from "../media-import/retailer-browser-import.js";
import { APP_HOME } from "../shell/home-path.jsx";
import { useToast } from "../shell/toast.jsx";
import { useLogout } from "../auth/session.jsx";
import { ROLLS_SERVICE } from "../shell/service-menu.jsx";

const BROWSER_WISHLIST_PROVIDERS = EXTERNAL_WISHLIST_PROVIDERS.filter(({ browserFavoritesUrl }) => browserFavoritesUrl);

export function ProfileSettingsModal({ user, onClose, onSaved, onMoodSaved, onProfileUpdated, onWishlistsImported, finalFocus, diskSyncCallback }) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const logout = useLogout();
  const initialForm = useMemo(() => ({
    name: user.name,
    bio: user.bio || "",
    birthday: user.birthday ? String(user.birthday).slice(0, 10) : "",
  }), [user]);
  const [form, setForm] = useState(initialForm);
  const [initialWishlistLinks, setInitialWishlistLinks] = useState(() => user.wishlistLinks || {});
  const [wishlistLinks, setWishlistLinks] = useState(initialWishlistLinks);
  const [validateWishlistLinks, setValidateWishlistLinks] = useState(false);
  const [importingWishlist, setImportingWishlist] = useState(null);
  const wishlistImportRequest = useRef(null);
  const [browserWishlistStatus, setBrowserWishlistStatus] = useState({});
  const [browserWishlistExtensionError, setBrowserWishlistExtensionError] = useState("");
  useEffect(() => () => {
    wishlistImportRequest.current?.abort();
    wishlistImportRequest.current = null;
  }, [user.id]);
  const [wishlistImportStatus, setWishlistImportStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [yandexEnabled, setYandexEnabled] = useState(null);
  const [yandexDiskBackupEnabled, setYandexDiskBackupEnabled] = useState(false);
  const [yandexDiskSyncEnabled, setYandexDiskSyncEnabled] = useState(false);
  const [yandexDiskProfileEnabled, setYandexDiskProfileEnabled] = useState(false);
  const [diskProfileSaving, setDiskProfileSaving] = useState(false);
  const [openRouterBusy, setOpenRouterBusy] = useState(false);
  const [accountsBusy, setAccountsBusy] = useState(false);
  const [mcpKeysBusy, setMcpKeysBusy] = useState(false);
  const [moodBusy, setMoodBusy] = useState(false);
  const [openRouterDraft, setOpenRouterDraft] = useState({ apiKey: "", modelId: null });
  const [section, setSection] = useState(diskSyncCallback ? "yandex" : null);
  const [rootOpen, setRootOpen] = useState(true);
  const pendingExit = useRef(null);
  const sectionTrigger = useRef(null);
  const sectionHeading = useRef(null);
  const scrollArea = useRef(null);
  const sections = [
    { id: "accounts", title: "Аккаунты", icon: Users },
    { id: "personal", title: "Персональная информация", icon: CircleUserRound },
    { id: "mood", title: "Настроение", icon: Smile },
    { id: "contact-card", title: "Визитка и QR-код", icon: QrCode },
    { id: "wishlists", title: "Внешние вишлисты", icon: Heart },
    ...(user.canInvite ? [{ id: "invites", title: "Инвайты", icon: UserPlus }] : []),
    { id: "openrouter", title: "OpenRouter", icon: LockKeyhole },
    { id: "mcp", title: "Ключи MCP", icon: LockKeyhole },
    { id: "yandex", title: "Yandex ID", icon: Fingerprint },
    { id: "rolls", title: "Финансы", icon: ROLLS_SERVICE.icon },
    { id: "gift-cards", title: "Подарочные карты", icon: Gift },
    { id: "orders", title: "Заказы", icon: PackageCheck, path: APP_ORDERS_PATH },
  ];
  const sectionTitle = sections.find(({ id }) => id === section)?.title;
  const yandexSettingsBlocked = Boolean(loading || imageUploading || loggingOut);
  useLayoutEffect(() => {
    if (isMobile) return;
    if (section) {
      scrollArea.current?.querySelector('[data-slot="scroll-area-viewport"]')?.scrollTo({ top: 0, behavior: "instant" });
      sectionHeading.current?.focus({ preventScroll: true });
    } else sectionTrigger.current?.focus();
  }, [isMobile, section]);
  const imageFileRef = useRef(null);
  const changedWishlists = EXTERNAL_WISHLIST_PROVIDERS.filter(({ id }) => (wishlistLinks[id]?.trim() || "") !== (initialWishlistLinks[id] || ""));
  const savedWishlistProviders = EXTERNAL_WISHLIST_PROVIDERS.filter((provider) => externalWishlistUrl(provider, initialWishlistLinks[provider.id]));
  const profileChanged = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);
  const changed = profileChanged || changedWishlists.length > 0;
  const sourceParams = new URLSearchParams(location.search);
  sourceParams.delete("formScreen");
  sourceParams.delete("diskSync");
  const yandexLinkNext = safeNextPath(`${location.pathname}${sourceParams.size ? `?${sourceParams}` : ""}`);
  const accountReturnPath = safeNextPath(`${location.pathname}${sourceParams.size ? `?${sourceParams}` : ""}${location.hash}`);
  const addAccountHref = `/login?${new URLSearchParams({ add_account: "1", next: accountReturnPath })}`;
  const yandexLinkHref = platformLink(yandexAuthStartPath(yandexLinkNext, { link: true }), window.location);
  const diskSync = useDiskSyncSettings({
    active: section === "yandex" && yandexDiskSyncEnabled && !yandexSettingsBlocked && !changed,
    ownerId: user.id, next: yandexLinkNext, callback: diskSyncCallback, onNavigate: (path) => leaveSettingsFor(path),
  });
  const busy = loading || importingWishlist || imageUploading || loggingOut || openRouterBusy || accountsBusy || mcpKeysBusy || diskProfileSaving || moodBusy || diskSync.busy;
  const yandexLinkBlocked = changed || yandexSettingsBlocked || diskProfileSaving || diskSync.busy;
  useEffect(() => {
    let active = true;
    api.get("/auth/yandex/config")
      .then((config) => {
        if (!active) return;
        setYandexEnabled(Boolean(config.enabled));
        setYandexDiskBackupEnabled(Boolean(config.diskBackupEnabled));
        setYandexDiskSyncEnabled(Boolean(config.diskSyncEnabled));
        setYandexDiskProfileEnabled(Boolean(config.diskProfileEnabled));
      })
      .catch(() => { if (active) setYandexEnabled(false); });
    return () => { active = false; };
  }, []);
  const uploadAvatar = async (file) => {
    if (!file || busy) return;
    if (imageFileRef.current) imageFileRef.current.value = "";
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
    let uploadId;
    try {
      const upload = await api.uploadImage(file);
      uploadId = upload.id;
      const result = await api.patch("/me", { avatarUrl: upload.imageUrl });
      onProfileUpdated(result.user);
      toast("Фото профиля обновлено");
    } catch (error) {
      // A lost response can hide a successful save. Only clean up a rejected upload reference.
      if (uploadId && (error.status === 400 || error.status === 409)) {
        await api.delete(`/uploads/images/${encodeURIComponent(uploadId)}`).catch(() => {});
      }
      setImageError(error.message || "Не удалось обновить фотографию.");
    } finally {
      setImageUploading(false);
    }
  };
  const backToSections = () => {
    if (!busy) setSection(null);
  };
  const close = () => {
    if (busy) return;
    onClose();
  };
  const exitSettings = (afterClose) => {
    if (!isMobile) {
      afterClose(onSaved);
      return;
    }
    // Unwind the native form entries before changing the profile or route.
    pendingExit.current = afterClose;
    if (section) setSection(null);
    else setRootOpen(false);
  };
  const leaveSettingsFor = (path) => exitSettings(() => {
    onClose();
    navigate(path);
  });
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !profileChanged) return;
    const payload = {};
    Object.keys(initialForm).forEach((key) => {
      if (form[key] === initialForm[key]) return;
      payload[key] = key === "birthday" ? form[key] || null : form[key];
    });
    setLoading(true);
    try {
      const result = await api.patch("/me", payload);
      toast("Профиль обновлён");
      exitSettings((saveProfile) => saveProfile(result.user));
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const withWishlistImport = async (kind, run) => {
    if (wishlistImportRequest.current) return;
    const request = new AbortController();
    wishlistImportRequest.current = request;
    setImportingWishlist(kind);
    try {
      const added = await run(request.signal);
      if (!request.signal.aborted && added) onWishlistsImported?.();
    } finally {
      if (wishlistImportRequest.current === request) {
        wishlistImportRequest.current = null;
        setImportingWishlist(null);
      }
    }
  };
  const readLinkedWishlist = async (provider, url, signal) => {
    const { id, importsItems } = provider;
    const setStatus = (message) => setWishlistImportStatus((current) => ({ ...current, [id]: message }));
    setStatus("Загружаем список…");
    try {
      const { added, skipped, partial } = importsItems
        ? await api.post(`/me/wishlist-import/${id}`, undefined, { signal })
        : await importWishlistFromBrowser(id, signal, url);
      signal.throwIfAborted();
      const message = added ? `Добавлено в «Товары»: ${added}.` : skipped ? "Новых позиций среди прочитанных нет." : "Список пуст.";
      setStatus(partial ? `${message} Сервис отдал только первую страницу списка.` : message);
      return added;
    } catch (error) {
      if (!signal.aborted) setStatus(error.message);
      return 0;
    }
  };
  const importWishlistFromBrowser = async (id, signal, url) => {
    const { items } = await requestBrowserWishlist(id, { signal, url });
    signal.throwIfAborted();
    if (!items.length) return { added: 0, skipped: 0 };
    return api.post(`/me/browser-wishlist-import/${id}`, { ownerId: user.id, items, ...(url && { linkedUrl: url }) }, { signal });
  };
  const importWishlists = (providers, links, kind = "save") => withWishlistImport(kind, async (signal) => {
    const direct = providers.filter(({ importsItems }) => importsItems);
    // The browser extension owns one import at a time. Start the independent
    // server readers immediately and run the browser readers in order.
    const directResults = Promise.all(direct.map((provider) => readLinkedWishlist(provider, links[provider.id], signal)));
    let added = 0;
    for (const provider of providers.filter(({ importsItems }) => !importsItems)) {
      if (signal.aborted) break;
      added += await readLinkedWishlist(provider, links[provider.id], signal);
    }
    return added + (await directResults).reduce((sum, count) => sum + count, 0);
  });
  const importBrowserWishlist = (provider) => {
    if (busy) return;
    return withWishlistImport("browser", async (signal) => {
      const setStatus = (text, openStore = false) =>
        setBrowserWishlistStatus((current) => ({ ...current, [provider.id]: { text, openStore } }));
      setStatus("Читаем избранное и списки…");
      try {
        const { added, skipped } = await importWishlistFromBrowser(provider.id, signal);
        signal.throwIfAborted();
        setBrowserWishlistExtensionError("");
        setStatus(added ? `Добавлено в «Товары»: ${added}. Уже было в Rollapp: ${skipped}.`
          : skipped ? "Все найденные товары уже в Rollapp." : "В избранном и списках нет товаров.");
        return added;
      } catch (error) {
        if (!signal.aborted) {
          const missingExtension = error.code === "helper_unavailable";
          setBrowserWishlistExtensionError(missingExtension ? error.message : "");
          setStatus(missingExtension ? "" : error.message, error.code === "marketplace_access_required");
        }
      }
    });
  };
  const submitWishlists = async (event) => {
    event.preventDefault();
    if (busy || !changedWishlists.length) return;
    const invalidWishlist = changedWishlists.find((provider) => wishlistLinks[provider.id]?.trim()
      && !externalWishlistUrl(provider, wishlistLinks[provider.id]));
    if (invalidWishlist) {
      setValidateWishlistLinks(true);
      event.currentTarget.querySelector(`#settings-wishlist-${invalidWishlist.id}`)?.focus();
      return;
    }
    const links = Object.fromEntries(changedWishlists.map((provider) => [
      provider.id, externalWishlistUrl(provider, wishlistLinks[provider.id]),
    ]));
    setLoading(true);
    try {
      const { user: savedUser } = await api.patch("/me", { wishlistLinks: links });
      const savedLinks = savedUser.wishlistLinks || {};
      setInitialWishlistLinks(savedLinks);
      setWishlistLinks(savedLinks);
      setValidateWishlistLinks(false);
      onProfileUpdated(savedUser);
      toast("Внешние вишлисты сохранены");
      const imports = changedWishlists.filter(({ id, importsItems }) => importsItems && links[id] && savedLinks[id]);
      if (imports.length) await importWishlists(imports, savedLinks);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const wishlistsFooter = section === "wishlists" && (
    <DrawerFooter className="mx-auto w-full max-w-full">
      <ShadcnButton type="submit" form="profile-wishlists-form" disabled={!changedWishlists.length || busy} aria-busy={loading || undefined}>
        {loading && <Spinner />}
        Сохранить
      </ShadcnButton>
      <ShadcnButton type="button" variant="outline" size="icon" data-control-icon=""
        aria-label="Обновить все сохранённые вишлисты" title="Обновить все сохранённые вишлисты"
        aria-busy={importingWishlist === "refresh" || undefined} disabled={busy || !savedWishlistProviders.length}
        onClick={() => importWishlists(savedWishlistProviders, initialWishlistLinks, "refresh")}>
        {importingWishlist === "refresh" ? <Spinner aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
      </ShadcnButton>
    </DrawerFooter>
  );
  const menu = <div className="flex flex-col gap-4 px-4 pt-4 pb-1">
    <div className="flex flex-col gap-2" role="group" aria-label="Фото профиля">
      <ShadcnButton
        type="button"
        variant="ghost"
        size="icon"
        className="size-36 self-center cursor-pointer rounded-full border-0 p-0 hover:bg-transparent dark:hover:bg-transparent"
        aria-label="Изменить фото профиля"
        aria-busy={imageUploading || undefined}
        disabled={busy}
        onClick={() => imageFileRef.current?.click()}
      >
        <Avatar user={user} size="xl" className="!size-full" aria-hidden="true" />
      </ShadcnButton>
      <p className="w-full text-center font-semibold wrap-anywhere">{user.name}</p>
      <Input ref={imageFileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAvatar(event.target.files?.[0])} />
      {imageError && <FieldError>{imageError}</FieldError>}
    </div>
    <nav aria-label="Разделы профиля">
      <ul className="divide-y">
        {sections.map(({ id, title, icon: Icon, path }) => <li key={id}>
          <ShadcnButton
            type="button"
            variant="ghost"
            className="h-auto min-h-12 w-full justify-start gap-2 rounded-none px-0 py-3 text-start whitespace-normal hover:bg-transparent hover:text-inherit dark:hover:bg-transparent"
            disabled={busy || (changed && (Boolean(path) || id === "rolls" || id === "gift-cards"))}
            onClick={(event) => {
              if (path) leaveSettingsFor(path);
              else {
                sectionTrigger.current = event.currentTarget;
                setSection(id);
              }
            }}
          >
            <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">{title}</span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </ShadcnButton>
        </li>)}
      </ul>
    </nav>
    {changed && <p className="text-xs text-muted-foreground">Сохраните изменения перед переходом в другой раздел приложения.</p>}
  </div>;
  const sectionBody = section === "personal" ? (
    <form id="profile-editor-form" className="flex flex-col gap-4 px-4 pt-4 pb-1" onSubmit={submit}>
      <FieldGroup className="gap-4">
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="settings-profile-name">{user.accountType === "business" ? "Название бизнеса" : "Имя"}</FieldLabel>
            <Input id="settings-profile-name" required placeholder={user.accountType === "business" ? undefined : "Имя Фамилия"} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="settings-profile-address">Адрес профиля</FieldLabel>
            <InputGroup className="min-w-0">
              <InputGroupAddon align="inline-start" className="shrink-0">
                <InputGroupText className="text-rollapp-body!" aria-hidden="true">роллапп.рф/</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="settings-profile-address"
                className="min-w-0"
                readOnly
                value={form.name === user.name && user.profileSlug ? user.profileSlug : profileNameAddress(form.name, user.accountType)}
              />
            </InputGroup>
            <FieldDescription>Создаётся из имени. Прежние ссылки продолжат работать.</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="settings-profile-bio">{user.accountType === "business" ? "Описание бизнеса" : "О себе"}</FieldLabel>
          <Textarea id="settings-profile-bio" rows={4} maxLength={300} value={form.bio} placeholder={user.accountType === "business" ? undefined : "Что вам нравится?"} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
        </Field>
        <Field className="sm:max-w-[calc(50%-0.5rem)]">
          <FieldLabel htmlFor="settings-profile-birthday">День рождения</FieldLabel>
          <PlanningDatePicker id="settings-profile-birthday" label="День рождения" clearable max={localDateKey(new Date())} value={form.birthday} onChange={(date) => setForm({ ...form, birthday: date })} className="w-full justify-between" />
        </Field>
      </FieldGroup>
      {user.memberNumber ? <MemberNumberBoard number={user.memberNumber} fullWidth /> : (
        <Card className="grid gap-2 p-4">
          <h3>Номер участника</h3>
          <p>Ваш номер ещё не выбран.</p>
          {yandexLinkBlocked
            ? <p>Сохраните или отмените изменения профиля перед выбором номера.</p>
            : <ShadcnButton type="button" variant="outline" className="min-h-(--layout-control-size) rounded-full" onClick={() => exitSettings(() => { onClose(); navigate("/app/member-number"); })}>Получить номер</ShadcnButton>}
        </Card>
      )}
    </form>
  ) : section === "wishlists" ? (
    <form id="profile-wishlists-form" onSubmit={submitWishlists}>
      <section className="grid min-w-0 gap-6 p-4" aria-label={sectionTitle}>
        <section className="grid min-w-0 gap-4" aria-labelledby="settings-wishlist-links-heading">
          <header className="typeset typeset-rollapp">
            <h3 id="settings-wishlist-links-heading">Ссылки на вишлисты</h3>
            <p className="text-muted-foreground">Вставьте ссылки из меню «Поделиться».</p>
          </header>
          <FieldGroup className="gap-4">
            {EXTERNAL_WISHLIST_PROVIDERS.map((provider) => {
              const id = `settings-wishlist-${provider.id}`;
              const value = wishlistLinks[provider.id] || "";
              const invalid = validateWishlistLinks && Boolean(value.trim()) && !externalWishlistUrl(provider, value);
              return (
                <Field key={provider.id} className="min-w-0" data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={id}>{provider.label}</FieldLabel>
                  <Input
                    id={id}
                    className="min-w-0"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={EXTERNAL_WISHLIST_URL_MAX_LENGTH}
                    placeholder="https://"
                    value={value}
                    disabled={busy}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? `${id}-error` : undefined}
                    onChange={(event) => {
                      setWishlistLinks({ ...wishlistLinks, [provider.id]: event.target.value });
                      setWishlistImportStatus((current) => ({ ...current, [provider.id]: "" }));
                    }}
                  />
                  {invalid && <FieldError id={`${id}-error`}>Вставьте HTTPS-ссылку на вишлист {provider.label}.</FieldError>}
                  {initialWishlistLinks[provider.id] && <p role="status" className={cn("text-xs text-muted-foreground", !wishlistImportStatus[provider.id] && "sr-only")}>{wishlistImportStatus[provider.id]}</p>}
                </Field>
              );
            })}
          </FieldGroup>
          <p className="text-xs text-muted-foreground">Кнопка обновления читает сохранённые ссылки. Новые позиции добавляются в «Товары» как приватные. Для Ozon и WB нужно расширение RULAB.</p>
        </section>
        <Accordion className="min-w-0 rounded-xl border bg-card px-3">
          <AccordionItem value="browser-import">
            <AccordionTrigger headerAs="h3" className="min-h-(--layout-control-size) items-center gap-2 px-1 text-rollapp-body! hover:no-underline">
              Импорт из браузера
            </AccordionTrigger>
            <AccordionContent className="px-1 pb-4">
              <div className="grid min-w-0 gap-3">
                <div role="status" className="text-rollapp-body text-muted-foreground">
                  {browserWishlistExtensionError || "Войдите в магазин в Chrome или Comet с расширением Rollapp. Избранное и личные списки добавятся в «Товары» как приватные позиции."}
                </div>
                <ul className="flex flex-wrap gap-2">
                  {BROWSER_WISHLIST_PROVIDERS.map((provider) => (
                    <li key={provider.id}>
                      <PageActionButton
                        type="button"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Импортировать все списки · ${provider.label}`}
                        onClick={() => importBrowserWishlist(provider)}
                      >
                        {provider.label}
                      </PageActionButton>
                    </li>
                  ))}
                </ul>
                {BROWSER_WISHLIST_PROVIDERS.map((provider) => {
                  const status = browserWishlistStatus[provider.id];
                  return (
                    <div key={provider.id} role="status" className={cn("rollapp-body grid min-w-0 gap-1 wrap-anywhere", !status?.text && "sr-only")}>
                      {status?.text && <>
                        <strong>{provider.label}</strong>
                        <span>{status.text}</span>
                        {status.openStore && <a href={provider.browserFavoritesUrl} target="_blank" rel="noopener noreferrer">
                          Открыть избранное в {provider.id === "yandex-market" ? "Яндекс Маркете" : provider.label}
                        </a>}
                      </>}
                    </div>
                  );
                })}
                <PageActionButton to="/rollapp-browser-extension.zip" reloadDocument download data-not-typeset
                  variant="outline" className="w-fit max-w-full whitespace-normal text-center no-underline!">
                  Скачать расширение RULAB
                </PageActionButton>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
      {isMobile && wishlistsFooter}
    </form>
  ) : section === "rolls" ? <RollsWallet key={user.id} user={user} embedded onWishlistsImported={onWishlistsImported} />
    : section === "gift-cards" ? <ProfileGiftCards key={user.id} user={user} onNavigate={leaveSettingsFor} />
    : section === "yandex" ? <div className="grid gap-3 px-4 pt-4">
    <Card className="grid gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{user.hasYandex ? "Подключён к аккаунту — можно входить без пароля." : "Подключите быстрый и безопасный вход через Яндекс."}</p>
        </div>
        {user.hasYandex && <Badge variant="secondary">Подключён</Badge>}
      </div>
      {!user.hasYandex && yandexEnabled === null && <p className="text-sm text-muted-foreground" role="status">Проверяем доступность Yandex ID…</p>}
      {!user.hasYandex && yandexEnabled === false && <p className="text-sm text-muted-foreground">Подключение Yandex ID сейчас недоступно.</p>}
      {!user.hasYandex && yandexEnabled && yandexLinkBlocked && <p className="text-sm text-muted-foreground">Сохраните или отмените изменения профиля перед подключением.</p>}
      {!user.hasYandex && yandexEnabled && yandexDiskSyncEnabled && !yandexLinkBlocked &&
        <a href={yandexLinkHref} className="underline underline-offset-4">Подключить Яндекс ID для входа</a>}
      {user.hasYandex && yandexDiskSyncEnabled && changed &&
        <p className="text-sm text-muted-foreground">Сохраните или отмените изменения профиля перед настройкой синхронизации.</p>}
      {yandexDiskBackupEnabled && (
        <p className="rollapp-body">Если вы разрешите доступ к Диску, Rollapp сохранит копию данных и загруженных файлов в папку ROLLAPP.</p>
      )}
      {user.hasYandex && yandexDiskBackupEnabled && yandexLinkBlocked && (
        <p className="rollapp-body">Сохраните или отмените изменения профиля перед копированием.</p>
      )}
    </Card>
    {yandexDiskSyncEnabled
      ? !changed && diskSync.body
      : !yandexLinkBlocked && <PrivateNotesLink onNavigate={leaveSettingsFor} />}
    {!changed && !yandexSettingsBlocked && (yandexDiskProfileEnabled || user.diskProfile) && <DiskProfileSettings ownerId={user.id} onProfileUpdated={onProfileUpdated} onBusyChange={setDiskProfileSaving} />}
  </div> : null;
  const openRouterSection = section === "openrouter" && (
    <OpenRouterSettings
      key={user.id}
      draft={openRouterDraft}
      onDraftChange={setOpenRouterDraft}
      disabled={loading || imageUploading || loggingOut}
      onBusyChange={setOpenRouterBusy}
    />
  );
  const personalFooter = section === "personal" && (
    <DrawerFooter className="mx-auto w-full max-w-full">
      <ShadcnButton
        type="submit"
        form="profile-editor-form"
        disabled={!profileChanged || busy}
        aria-busy={loading || undefined}
      >
        {loading && <Spinner />}
        Сохранить
      </ShadcnButton>
      <ShadcnButton
        data-control-icon=""
        type="button"
        variant="destructive"
        size="icon"
        aria-label="Выйти на этом устройстве"
        title="Выйти на этом устройстве"
        disabled={busy}
        aria-busy={loggingOut || undefined}
        onClick={async () => {
          if (busy) return;
          setLoggingOut(true);
          const loggedOut = await logout();
          if (!loggedOut) setLoggingOut(false);
        }}
      >
        {loggingOut ? <Spinner /> : <LogOut aria-hidden="true" />}
      </ShadcnButton>
    </DrawerFooter>
  );
  const yandexFooter = section === "yandex" && (
    <DrawerFooter>
      {!yandexDiskSyncEnabled && yandexEnabled && !yandexLinkBlocked && (!user.hasYandex || yandexDiskBackupEnabled) && (user.hasYandex
        ? <a data-slot="button" className={buttonVariants()} href={yandexLinkHref} aria-label="Создать резервную копию на Яндекс Диске">Сделать копию</a>
        : <a data-slot="button" className={buttonVariants()} href={yandexLinkHref} aria-label="Войти с Яндекс ID и подключить его к аккаунту">Подключить Яндекс ID</a>)}
      {yandexDiskSyncEnabled && !changed && !yandexSettingsBlocked && !diskProfileSaving && diskSync.actions}
    </DrawerFooter>
  );
  const desktopSection = !isMobile && section;
  const fullSection = (section === "accounts" && <ProfileAccounts Avatar={Avatar} addHref={addAccountHref} home={APP_HOME}
    changed={changed || Boolean(openRouterDraft.apiKey || openRouterDraft.modelId)}
    blocked={loading || importingWishlist || imageUploading || loggingOut || openRouterBusy}
    onBusyChange={setAccountsBusy} isMobile={isMobile} />)
    || openRouterSection
    || (section === "mood" && <ProfileMoodSettings onSaved={onMoodSaved} onBusyChange={setMoodBusy} />)
    || (section === "mcp" && <ProfileMcpKeys key={user.id} onBusyChange={setMcpKeysBusy} />)
    || (section === "invites" && <InvitesManager key={user.id} />)
    || (section === "contact-card" && <ContactCardContent key={user.username} profile={user} canSign />);
  const sectionOwnsScroll = Boolean(desktopSection && (fullSection || desktopSection === "rolls"));
  return <>
    <Drawer open={rootOpen} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => {
      if (!open) {
        if (desktopSection) backToSections();
        else close();
      }
    }} onAfterClose={() => {
      const exit = pendingExit.current;
      pendingExit.current = null;
      exit?.(onSaved);
    }}>
      <DrawerContent className="profile-settings-dialog rollapp-body app-drawer--form" finalFocus={finalFocus}>
        {!desktopSection && <DrawerClose
          render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10 size-12" size="icon-sm" />}
        >
          <X />
          <span className="sr-only">Закрыть</span>
        </DrawerClose>}
        {desktopSection ? <DrawerSectionHeader title={sectionTitle} titleRef={sectionHeading} borderless={desktopSection === "accounts"} startAction={
          <ShadcnButton data-control-icon="" type="button" variant="outline" size="icon" aria-label="Назад" disabled={busy} onClick={backToSections}>
            <ArrowLeft aria-hidden="true" />
          </ShadcnButton>
        } /> : <DrawerHeader className={cn("mx-auto w-full max-w-full", !isMobile && "h-14 p-0")}>
          {isMobile ? <DrawerTitle>Настройки профиля</DrawerTitle> : <DrawerTitle className="sr-only">Изменить профиль</DrawerTitle>}
          <DrawerDescription className="sr-only">Редактирование данных профиля.</DrawerDescription>
        </DrawerHeader>}
        <ScrollArea ref={scrollArea} hidden={sectionOwnsScroll} className="mx-auto min-h-0 w-full max-w-full flex-1">
          <div hidden={Boolean(desktopSection)}>{menu}</div>
          {desktopSection && !sectionOwnsScroll && sectionBody}
        </ScrollArea>
        {desktopSection ? fullSection || (desktopSection === "rolls" ? sectionBody : personalFooter || wishlistsFooter || yandexFooter) : isMobile && <DrawerFooter />}
      </DrawerContent>
    </Drawer>
    {isMobile && <Drawer open={Boolean(section)} onOpenChange={(open) => { if (!open) backToSections(); }} onAfterClose={() => {
      if (pendingExit.current) setRootOpen(false);
      else requestAnimationFrame(() => {
        const trigger = sectionTrigger.current;
        if (trigger && !trigger.closest("[hidden]")) trigger.focus({ preventScroll: true });
      });
    }}>
      <DrawerContent className="rollapp-body app-drawer--form">
        <DrawerSectionHeader title={sectionTitle} />
        {fullSection || <>
          {sectionBody}
          {section !== "wishlists" && section !== "rolls" && (personalFooter || yandexFooter || <DrawerFooter />)}
        </>}
      </DrawerContent>
    </Drawer>}
  </>;
}

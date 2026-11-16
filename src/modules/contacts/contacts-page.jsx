import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { ContactMeetingNotes } from "@/modules/contacts/contact-meeting-notes.jsx";
import { ContactCompanyInput } from "@/modules/contacts/contact-company-input.jsx";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Link2, Plus, Star, Trash2, X, Building2, ContactRound, NotebookText, Search } from "lucide-react";
import { api, sessionFetch } from "../runtime/api.js";
import { MobileFormFooter } from "@/components/mobile-form-pages";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { canAutofocusForm, useIsMobile } from "@/hooks/use-mobile";
import { uploadedImageIdFromUrl } from "../wishlist/wish-form-data.jsx";
import { useToast } from "../shell/toast.jsx";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/form-surface";
import { useAsync } from "../shell/use-async.jsx";
import { EmptyState, Button, LoadingScreen } from "../shell/page-feedback.jsx";
import { Navigate, useLocation } from "react-router-dom";
import { useSphereSharing } from "../access/sphere-sharing.jsx";
import { sharePageUrl } from "../../applications/location.js";
import { AddFab } from "@/components/add-fab";
import { useContactFeed } from "./use-contact-feed.js";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { sphereSectionPath } from "../../../shared/modules/access/sphere-sharing.js";
import { useGlobalShareHandler } from "../shell/global-share.jsx";

const CONTACT_CATEGORY_LABELS = {
  Analytics: "Аналитика",
  "Business Development": "BizDev",
  CEO: "CEO",
  Coach: "Коучинг",
  Design: "Дизайн",
  Development: "Разработка",
  Editor: "Редактура",
  Founder: "Основатели",
  Government: "Госсектор",
  HR: "HR",
  Investor: "Инвестиции",
  Management: "Управление",
  Marketing: "Маркетинг",
  Product: "Продукт",
  Project: "Проекты",
  PR: "PR",
  Strategy: "Стратегия",
  Tracker: "Трекинг",
};

const CONTACT_ACCENTS = ["#9b72e8", "#5b8def", "#43bd83", "#e66a8f", "#f2a65a", "#49a7a1", "#7d83ea"];

const CONTACT_SOCIAL_PLATFORMS = {
  facebook: { label: "Facebook", mark: "f" },
  linkedin: { label: "LinkedIn", mark: "in" },
  telegram: { label: "Telegram", mark: "TG" },
  instagram: { label: "Instagram", mark: "IG" },
  x: { label: "X", mark: "X" },
  vk: { label: "VK", mark: "VK" },
  website: { label: "Сайт", mark: "↗" },
};

const contactSocialPlatform = (link = {}) => {
  const label = String(link.label || "").trim().toLowerCase();
  let host = "";
  try { host = new URL(link.url).hostname.toLowerCase().replace(/^www\./u, ""); } catch { /* Use the label below. */ }
  if (/facebook|\bfb\b/u.test(label) || /(^|\.)facebook\.com$|(^|\.)fb\.com$/u.test(host)) return "facebook";
  if (/linkedin/u.test(label) || /(^|\.)linkedin\.com$/u.test(host)) return "linkedin";
  if (/telegram|\btg\b/u.test(label) || /(^|\.)(t\.me|telegram\.me|telegram\.org)$/u.test(host)) return "telegram";
  if (/instagram|insta/u.test(label) || /(^|\.)instagram\.com$/u.test(host)) return "instagram";
  if (/^x$|twitter/u.test(label) || /(^|\.)(x\.com|twitter\.com)$/u.test(host)) return "x";
  if (/^vk$|вконтакте|vkontakte/u.test(label) || /(^|\.)(vk\.com|vkontakte\.ru)$/u.test(host)) return "vk";
  return "website";
};

function ContactSocialLink({ link, contactName }) {
  const platform = contactSocialPlatform(link);
  const details = CONTACT_SOCIAL_PLATFORMS[platform];
  const label = platform === "website" && link.label?.trim() ? link.label.trim() : details.label;
  return (
    <a
      className={`contact-social-link contact-social-link--${platform}`}
      href={link.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label}: ${contactName}`}
      title={label}
    >
      <span className="contact-social-link__mark" aria-hidden="true">{details.mark}</span>
      <span className="contact-social-link__label">{label}</span>
    </a>
  );
}

const contactCountNoun = (count) => {
  const lastTwo = Math.abs(count) % 100;
  const last = Math.abs(count) % 10;
  if (last === 1 && lastTwo !== 11) return "контакт";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "контакта";
  return "контактов";
};

const ALL_CONTACT_COMPANIES = "__rollapp_all_contact_companies__";

const ALL_CONTACT_CATEGORIES = "__rollapp_all_contact_categories__";

export const contactAccent = (company = "") => CONTACT_ACCENTS[[...company].reduce((sum, character) => sum + character.codePointAt(0), 0) % CONTACT_ACCENTS.length];

function contactLinkPayload(link) {
  const url = link.url.trim();
  const originalLabel = url === link.originalUrl && link.label?.trim();
  if (originalLabel) return { label: originalLabel, url };
  const platform = contactSocialPlatform({ url });
  if (platform !== "website") return { label: CONTACT_SOCIAL_PLATFORMS[platform].label, url };
  let hostname = "";
  try { hostname = new URL(url).hostname.replace(/^www\./iu, ""); } catch { /* Native URL and API validation handle invalid input. */ }
  return { label: hostname.slice(0, 40) || CONTACT_SOCIAL_PLATFORMS.website.label, url };
}

const contactFormFrom = (contact) => ({
  name: contact?.name || "",
  company: contact?.company || "",
  role: contact?.role || "",
  category: contact?.category || "",
  status: contact?.status || "",
  avatarUrl: contact?.avatarSourceUrl || "",
  links: (contact?.links || []).map((link) => ({ label: link.label || "", url: link.url || "", originalUrl: link.url?.trim() })),
  notes: contact?.notes || "",
});

function ContactAutoLinkText({ text }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s)<>]+)/giu);
  return parts.map((part, index) => /^https?:\/\//iu.test(part)
    ? <a key={`${part}-${index}`} href={part.replace(/[.,;:]+$/u, "")} target="_blank" rel="noreferrer">{part}</a>
    : part);
}

function ContactNotes({ notes }) {
  if (!notes) return <p className="contact-detail__no-notes">В исходной заметке только основные данные контакта.</p>;
  return notes.split(/\n{2,}/u).map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    const heading = trimmed.match(/^#{1,3}\s+(.+?)(?:\n([\s\S]*))?$/u);
    return (
      <div className="contact-detail__note-block" key={`${trimmed.slice(0, 24)}-${index}`}>
        {heading ? <><h3>{heading[1]}</h3>{heading[2] && <p><ContactAutoLinkText text={heading[2]} /></p>}</> : <p><ContactAutoLinkText text={trimmed} /></p>}
      </div>
    );
  });
}

function ContactIdentity({ avatar, name, company }) {
  return (
    <header className="contact-detail__identity">
      {avatar}
      <div className="grid min-w-0 w-full gap-1">
        <h2 className="font-heading text-2xl font-semibold text-balance wrap-anywhere">{name}</h2>
        {company && <p className="text-muted-foreground text-pretty wrap-anywhere">{company}</p>}
      </div>
    </header>
  );
}

export function ContactEditForm({ contact = null, companies = [], favoriteSaving = false, onFavoriteToggle, onSaved, onDeleted }) {
  const toast = useToast();
  const contactFieldId = useId();
  const creating = !contact?.id;
  const [form, setForm] = useState(() => contactFormFrom(contact));
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [avatarResolving, setAvatarResolving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarStatus, setAvatarStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const avatarFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const initialAvatarSourceUrl = contact?.avatarSourceUrl || "";
  const previewAvatarUrl = form.avatarUrl || contact?.avatarUrl || "";
  const busy = saving || deleting || imageUploading || avatarResolving;
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setLinkUrl = (index, url) => setForm((current) => ({
    ...current,
    links: current.links.map((link, linkIndex) => linkIndex === index ? { ...link, url } : link),
  }));
  const removeLink = (index) => setForm((current) => ({
    ...current,
    links: current.links.filter((_, linkIndex) => linkIndex !== index),
  }));
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
  const applyAvatarResult = async (result, message) => {
    const previousId = uploadedImageIdFromUrl(form.avatarUrl);
    if (result.id) uploadedImageIdsRef.current.add(result.id);
    setForm((current) => ({ ...current, avatarUrl: result.imageUrl }));
    setAvatarError("");
    setAvatarStatus(message);
    if (previousId && uploadedImageIdsRef.current.has(previousId) && previousId !== result.id) {
      uploadedImageIdsRef.current.delete(previousId);
      await api.delete(`/uploads/images/${encodeURIComponent(previousId)}`).catch(() => {});
    }
  };
  const uploadAvatar = async (file) => {
    if (!file || saving || deleting || imageUploading) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Подойдёт изображение JPG, PNG или WEBP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError("Изображение должно быть не больше 8 МБ.");
      return;
    }
    setImageUploading(true);
    setAvatarError("");
    setAvatarStatus("");
    try {
      const result = await api.uploadImage(file);
      await applyAvatarResult(result, "Фото загружено вручную");
    } catch (error) {
      setAvatarError(error.message || "Не удалось загрузить фото.");
    } finally {
      setImageUploading(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };
  const socialLinksKey = JSON.stringify(form.links.flatMap((link) => {
    const url = link.url.trim();
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol) || !parsed.pathname.replace(/\//gu, "")) return [];
      const platform = contactSocialPlatform({ url });
      return platform === "website" ? [] : [{ label: CONTACT_SOCIAL_PLATFORMS[platform].label, url }];
    } catch { return []; }
  }));
  useEffect(() => {
    // Keep existing or manually chosen photos. Only resolve complete social URLs.
    if (form.avatarUrl || previewAvatarUrl || imageUploading || saving || deleting || socialLinksKey === "[]") return;
    let active = true;
    const timer = setTimeout(async () => {
      setAvatarResolving(true);
      setAvatarError("");
      setAvatarStatus("Получаем фото из соцсети…");
      try {
        const result = await api.resolveContactAvatar(JSON.parse(socialLinksKey));
        if (!active) {
          if (result.id) await api.delete(`/uploads/images/${encodeURIComponent(result.id)}`).catch(() => {});
          return;
        }
        await applyAvatarResult(result, `Фото получено из ${result.source || "соцсети"}`);
      } catch (error) {
        if (active) {
          setAvatarStatus("");
          setAvatarError(error.message || "Не удалось получить публичное фото из соцсети. Нажмите на фото, чтобы загрузить его вручную.");
        }
      } finally {
        if (active) setAvatarResolving(false);
      }
    }, 650);
    return () => {
      active = false;
      clearTimeout(timer);
      setAvatarResolving(false);
      setAvatarStatus((current) => current === "Получаем фото из соцсети…" ? "" : current);
    };
  }, [socialLinksKey, form.avatarUrl, previewAvatarUrl, imageUploading, saving, deleting]);
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        ...form,
        links: form.links.map(contactLinkPayload),
      };
      const result = creating
        ? await api.post("/contacts", payload)
        : await api.patch(`/contacts/${encodeURIComponent(contact.id)}`, payload);
      const savedUploadId = uploadedImageIdFromUrl(result.contact?.avatarSourceUrl);
      if (savedUploadId) uploadedImageIdsRef.current.delete(savedUploadId);
      await cleanupUploadedImages(result.contact?.avatarSourceUrl || "");
      const initialAvatarId = uploadedImageIdFromUrl(initialAvatarSourceUrl);
      if (initialAvatarId && initialAvatarId !== savedUploadId) {
        await api.delete(`/uploads/images/${encodeURIComponent(initialAvatarId)}`).catch(() => {});
      }
      toast(creating ? "Контакт добавлен" : "Контакт обновлён", "success");
      onSaved(result.contact);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };
  const removeContact = async () => {
    if (creating || deleting) return;
    setDeleting(true);
    setSaveError("");
    try {
      await cleanupUploadedImages();
      await api.delete(`/contacts/${encodeURIComponent(contact.id)}`);
      toast("Контакт удалён", "success");
      onDeleted?.(contact);
    } catch (error) {
      setSaveError(error.message);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };
  const knownCategories = Object.keys(CONTACT_CATEGORY_LABELS);
  const hasCustomCategory = form.category && !knownCategories.includes(form.category);
  const categoryItems = [
    { value: "", label: "Без направления" },
    ...(hasCustomCategory ? [{ value: form.category, label: form.category }] : []),
    ...knownCategories.map((value) => ({ value, label: CONTACT_CATEGORY_LABELS[value] })),
  ];

  return (
    <form className="contact-detail__edit-form" onSubmit={save}>
      <ScrollArea className="contact-detail__scroll">
        <div className="contact-detail__edit-body">
          <div className="contact-detail__profile">
            <ContactIdentity
              name={creating ? (form.name.trim() || "Новый контакт") : contact.name}
              avatar={(
                <ShadcnButton
                  type="button"
                  variant="ghost"
                  className="contact-detail__avatar-picker size-(--contact-detail-avatar-size) rounded-full border-0 p-0 active:translate-y-0"
                  aria-label={previewAvatarUrl ? "Сменить фото контакта" : "Добавить фото контакта"}
                  title={previewAvatarUrl ? "Сменить фото" : "Добавить фото"}
                  aria-busy={imageUploading || avatarResolving || undefined}
                  disabled={saving || deleting || imageUploading}
                  onClick={() => avatarFileRef.current?.click()}
                >
                  <Avatar user={{ name: form.name || contact?.name, avatarUrl: previewAvatarUrl }} size="xl" className="contact-detail__avatar" aria-hidden="true" />
                </ShadcnButton>
              )}
            />
            <Input
              ref={avatarFileRef}
              className="sr-only !size-px"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Загрузить фото контакта"
              onChange={(event) => uploadAvatar(event.target.files?.[0])}
            />
            {(avatarStatus || avatarError) && <p className={`contact-detail__avatar-message${avatarError ? " is-error" : ""}`} role={avatarError ? "alert" : "status"}>{avatarError || avatarStatus}</p>}
          </div>
          <div className="contact-detail__edit-fields">
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-name`}>Имя</FieldLabel>
              <Input id={`${contactFieldId}-name`} value={form.name} maxLength={120} required autoFocus={canAutofocusForm()} onChange={(event) => setField("name", event.target.value)} />
            </Field>
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-company`}>Компания</FieldLabel>
              <ContactCompanyInput id={`${contactFieldId}-company`} companies={companies} value={form.company} maxLength={160} placeholder="Не указана" disabled={busy} onValueChange={(value) => setField("company", value)} />
            </Field>
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-category`}>Направление</FieldLabel>
              <Select items={categoryItems} value={form.category} onValueChange={(value) => setField("category", value ?? "")} disabled={busy}>
                <SelectTrigger id={`${contactFieldId}-category`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {categoryItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-role`}>Должность или роль</FieldLabel>
              <Input id={`${contactFieldId}-role`} value={form.role} maxLength={240} placeholder="Не указана" onChange={(event) => setField("role", event.target.value)} />
            </Field>
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-status`}>Статус</FieldLabel>
              <Input id={`${contactFieldId}-status`} value={form.status} maxLength={80} placeholder="Например, в работе" onChange={(event) => setField("status", event.target.value)} />
            </Field>
          </div>
          <section className="contact-detail__edit-section" aria-labelledby="contact-edit-links-title">
            <h2 id="contact-edit-links-title"><Link2 aria-hidden="true" />Ссылки</h2>
            <div className="contact-detail__edit-links">
              {form.links.map((link, index) => (
                <div className="contact-detail__edit-link" key={index}>
                  <Input aria-label={`Адрес ссылки ${index + 1}`} type="url" value={link.url} maxLength={2000} required placeholder="https://…" onChange={(event) => setLinkUrl(index, event.target.value)} />
                  <ShadcnButton type="button" variant="destructive" size="icon" className="rounded-full" aria-label={`Удалить ссылку ${index + 1}`} onClick={() => removeLink(index)}><Trash2 aria-hidden="true" /></ShadcnButton>
                </div>
              ))}
              {!form.links.length && <p>Ссылок пока нет.</p>}
            </div>
            {form.links.length < 12 && <ShadcnButton type="button" variant="ghost" className="contact-detail__add-link" onClick={() => setForm((current) => ({ ...current, links: [...current.links, { url: "" }] }))}><Plus />Добавить ссылку</ShadcnButton>}
          </section>
          <Field className="contact-detail__edit-notes">
            <FieldLabel htmlFor={`${contactFieldId}-notes`}>Заметки</FieldLabel>
            <Textarea id={`${contactFieldId}-notes`} value={form.notes} maxLength={50000} rows={8} placeholder="Добавьте контекст, договорённости или историю общения" onChange={(event) => setField("notes", event.target.value)} />
          </Field>
          <ContactMeetingNotes notes={contact?.meetingNotes} />
          {saveError && <p className="contact-detail__edit-error" role="alert">{saveError}</p>}
        </div>
      </ScrollArea>
      <MobileFormFooter className="contact-detail__edit-actions">
        {!creating && <ShadcnButton
          data-control-icon
          type="button"
          variant="outline"
          size="icon"
          className="contact-detail__favorite"
          data-favorite={contact.favorite ? "true" : "false"}
          aria-pressed={Boolean(contact.favorite)}
          aria-label={contact.favorite ? `Убрать ${contact.name} из избранного` : `Добавить ${contact.name} в избранное`}
          title={contact.favorite ? "Убрать из избранного" : "Добавить в избранное"}
          disabled={favoriteSaving}
          onClick={onFavoriteToggle}
        >
          {favoriteSaving ? <Spinner /> : <Star fill={contact.favorite ? "currentColor" : "none"} aria-hidden="true" />}
        </ShadcnButton>}
        <ShadcnButton type="submit" disabled={busy}>{saving ? <><Spinner />Сохраняем</> : <><Check />{creating ? "Добавить контакт" : "Сохранить"}</>}</ShadcnButton>
        {!creating && <ShadcnButton data-control-icon type="button" variant="destructive" size="icon" aria-label="Удалить контакт" title="Удалить контакт" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" /></ShadcnButton>}
      </MobileFormFooter>
      {!creating && <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить контакт «{contact.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Контакт исчезнет из вашего списка. Отменить это действие не получится.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} aria-busy={deleting || undefined} onClick={removeContact}>
              {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}Удалить контакт
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </form>
  );
}

function ContactReadView({ contact }) {
  const socialLinks = (contact.links || []).filter((link) => link?.url);
  return (
    <article className="contact-detail__edit-form" aria-label={`Контакт ${contact.name}`}>
      <ContactIdentity
        name={contact.name}
        company={contact.company || "Контакт"}
        avatar={<Avatar user={contact} size="xl" className="contact-detail__avatar" aria-hidden="true" />}
      />
      <div className="contact-detail__edit-fields">
        {contact.role && <div className="contact-detail__edit-field contact-detail__edit-field--wide"><span>Должность или роль</span><strong>{contact.role}</strong></div>}
        {contact.status && <div className="contact-detail__edit-field contact-detail__edit-field--wide"><span>Статус</span><strong>{contact.status}</strong></div>}
      </div>
      {socialLinks.length > 0 && <section className="contact-detail__edit-section" aria-labelledby="contact-read-links-title">
        <h2 id="contact-read-links-title"><Link2 aria-hidden="true" />Ссылки</h2>
        <div className="contact-card__social-links">{socialLinks.map((link, index) => <ContactSocialLink key={`${link.url}-${index}`} link={link} contactName={contact.name} />)}</div>
      </section>}
      <section className="contact-detail__edit-section typeset typeset-rollapp" aria-labelledby="contact-read-notes-title">
        <h2 id="contact-read-notes-title">Заметки</h2>
        <ContactNotes notes={contact.notes} />
        <ContactMeetingNotes notes={contact.meetingNotes} />
      </section>
    </article>
  );
}

export function ContactDetailDrawer({ contactId, companies, onClose, onUpdated, onDeleted, readOnly = false }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const { data, loading, error, reload, updateData } = useAsync(() => api.get(`/contacts/${encodeURIComponent(contactId)}`), [contactId]);
  const contact = data?.contact;
  const accent = contactAccent(contact?.company);
  const toggleFavorite = async () => {
    if (!contact || favoriteSaving) return;
    const favorite = !contact.favorite;
    setFavoriteSaving(true);
    try {
      await api.patch(`/contacts/${encodeURIComponent(contact.id)}/favorite`, { favorite });
      const updatedContact = { ...contact, favorite };
      updateData((current) => ({ ...current, contact: updatedContact }));
      onUpdated?.(updatedContact);
      toast(favorite ? "Контакт добавлен в избранное" : "Контакт удалён из избранного", "success");
    } catch (favoriteError) {
      toast(favoriteError.message, "error");
    } finally {
      setFavoriteSaving(false);
    }
  };
  return (
    <Drawer open showSwipeHandle={isMobile} swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="contact-detail-drawer rollapp-body app-drawer--form" style={{ "--contact-accent": accent }}>
        <DrawerTitle className="sr-only">{contact?.name || "Карточка контакта"}</DrawerTitle>
        <div className="contact-detail__toolbar flex shrink-0 justify-end px-4 pt-4 pb-2">
          <DrawerClose
            render={<ShadcnButton type="button" variant="ghost" size="icon" className="contact-detail__close size-12 rounded-full" />}
            aria-label="Закрыть карточку контакта"
          ><X /></DrawerClose>
        </div>
        {loading ? <LoadingScreen compact /> : error ? (
          <div className="contacts-sphere__empty" role="alert">
            <strong>Не удалось открыть контакт</strong>
            <span>{error.message}</span>
            <Button variant="outline" onClick={() => reload().catch(() => {})}>Попробовать снова</Button>
          </div>
        ) : contact ? (
          readOnly ? <ScrollArea className="contact-detail__scroll"><ContactReadView contact={contact} /></ScrollArea> : <ContactEditForm
              contact={contact}
              companies={companies}
              favoriteSaving={favoriteSaving}
              onFavoriteToggle={toggleFavorite}
              onSaved={(savedContact) => {
                updateData((current) => ({ ...current, contact: savedContact }));
                onUpdated?.(savedContact);
              }}
              onDeleted={onDeleted}
            />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

export function ContactCreateDrawer({ companies, onClose, onCreated }) {
  const isMobile = useIsMobile();
  return (
    <Drawer open showSwipeHandle={isMobile} swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="contact-detail-drawer rollapp-body app-drawer--form" style={{ "--contact-accent": contactAccent("") }}>
        <DrawerTitle className="sr-only">Добавить контакт</DrawerTitle>
        <div className="contact-detail__toolbar flex shrink-0 justify-end px-4 pt-4 pb-2">
          <DrawerClose
            render={<ShadcnButton type="button" variant="ghost" size="icon" className="contact-detail__close size-12 rounded-full" />}
            aria-label="Закрыть добавление контакта"
          ><X /></DrawerClose>
        </div>
        <ContactEditForm companies={companies} onSaved={onCreated} />
      </DrawerContent>
    </Drawer>
  );
}

export function LegacyContactsRedirect() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set("tab", "contacts");
  return <Navigate to={{ pathname: location.pathname.replace("/app/spheres/contacts", "/app/spheres/career"), search: `?${search.toString()}`, hash: location.hash }} replace />;
}

export function ContactsSpherePage() {
  const toast = useToast();
  const access = useSphereSharing();
  const globalShareRef = useGlobalShareHandler();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [company, setCompany] = useState("");
  const [category, setCategory] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [favoriteSavingIds, setFavoriteSavingIds] = useState(() => new Set());
  const loadMoreRef = useRef(null);
  const location = useLocation();
  const [selectedContactId, setSelectedContactId] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [contactsVersion, setContactsVersion] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const query = new URLSearchParams({ pageSize: "48", order: "source" });
  const owner = new URLSearchParams(location.search).get("owner");
  if (owner) query.set("owner", owner);
  if (debouncedSearch) query.set("search", debouncedSearch);
  if (company) query.set("company", company);
  if (category) query.set("category", category);
  if (favoriteOnly) query.set("favorite", "true");
  const { data, loading, loadingMore, error, reload, loadMore, updateData } = useContactFeed(query.toString(), contactsVersion);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !data?.hasMore || loading || loadingMore || error || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "500px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data, loading, loadingMore, error, loadMore]);
  const contacts = data?.contacts || [];
  const companies = data?.facets?.companies || [];
  const categories = data?.facets?.categories || [];
  const hasFilters = Boolean(search || company || category || favoriteOnly);
  const clearFilters = () => { setSearch(""); setDebouncedSearch(""); setCompany(""); setCategory(""); setFavoriteOnly(false); };
  globalShareRef.current = async () => {
    const path = sphereSectionPath({ owner: access.owner, sphere: "career", section: "contacts" });
    try {
      await navigator.clipboard.writeText(sharePageUrl(path));
      toast(access.isOwner ? "Ссылка на раздел скопирована. Открыть её смогут выбранные люди." : "Ссылка на раздел скопирована");
    } catch {
      toast("Не удалось скопировать ссылку", "error");
    }
  };
  const toggleFavorite = async (contact) => {
    if (favoriteSavingIds.has(contact.id)) return;
    const favorite = !contact.favorite;
    setFavoriteSavingIds((current) => new Set(current).add(contact.id));
    try {
      await api.patch(`/contacts/${encodeURIComponent(contact.id)}/favorite`, { favorite });
      updateData((current) => {
        if (!current) return current;
        const nextContacts = current.contacts
          .map((item) => item.id === contact.id ? { ...item, favorite } : item)
          .filter((item) => !favoriteOnly || item.favorite);
        return {
          ...current,
          contacts: nextContacts,
          total: favoriteOnly && !favorite ? Math.max(0, current.total - 1) : current.total,
          favoriteTotal: Math.max(0, Number(current.favoriteTotal || 0) + (favorite ? 1 : -1)),
        };
      });
      toast(favorite ? "Контакт добавлен в избранное" : "Контакт удалён из избранного", "success");
      if (favoriteOnly) await reload({ background: true });
    } catch (favoriteError) {
      toast(favoriteError.message, "error");
    } finally {
      setFavoriteSavingIds((current) => {
        const next = new Set(current);
        next.delete(contact.id);
        return next;
      });
    }
  };

  return (
    <div data-read-only={access.readOnly ? "true" : undefined} className="app-page page-stack sphere-page sphere-page--contacts typeset typeset-rollapp">
      {!access.readOnly && <AddFab actions={[{ label: "Добавить контакт", onSelect: () => setCreatingContact(true) }]} />}
      <section className="contacts-sphere not-typeset" aria-label="Контакты">
        {(contacts.length > 0 || hasFilters) && <div className="contacts-sphere__toolbar">
          <InputGroup className="contacts-sphere__search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput type="search" aria-label="Поиск по контактам" placeholder="Имя, роль, компания или заметка" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-sm" className="contacts-sphere__search-clear rounded-full" aria-label="Очистить поиск" onClick={() => setSearch("")}><X /></InputGroupButton></InputGroupAddon>}
          </InputGroup>
          <div className="contacts-sphere__filters" aria-label="Фильтры контактов">
            <Select value={company || ALL_CONTACT_COMPANIES} onValueChange={(value) => { setCompany(value === ALL_CONTACT_COMPANIES ? "" : value); }}>
              <SelectTrigger className="contacts-sphere__select" aria-label="Компания">
                <SelectValue>{(value) => value === ALL_CONTACT_COMPANIES ? "Все компании" : value}</SelectValue>
              </SelectTrigger>
              <SelectContent className="contacts-sphere__select-content" align="start" alignItemWithTrigger={false}>
                <SelectItem value={ALL_CONTACT_COMPANIES}>Все компании</SelectItem>
                {companies.map((item) => <SelectItem key={item.company} value={item.company}>{item.company} · {item.count}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={category || ALL_CONTACT_CATEGORIES} onValueChange={(value) => { setCategory(value === ALL_CONTACT_CATEGORIES ? "" : value); }}>
              <SelectTrigger className="contacts-sphere__select" aria-label="Категория">
                <SelectValue>{(value) => value === ALL_CONTACT_CATEGORIES ? "Все направления" : (CONTACT_CATEGORY_LABELS[value] || value)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="contacts-sphere__select-content" align="start" alignItemWithTrigger={false}>
                <SelectItem value={ALL_CONTACT_CATEGORIES}>Все направления</SelectItem>
                {categories.map((item) => <SelectItem key={item.category} value={item.category}>{CONTACT_CATEGORY_LABELS[item.category] || item.category} · {item.count}</SelectItem>)}
              </SelectContent>
            </Select>
            <ShadcnButton
              type="button"
              variant="outline"
              className="contacts-sphere__favorite-filter h-[50px] rounded-[15px] px-4"
              data-favorite={favoriteOnly ? "true" : "false"}
              aria-pressed={favoriteOnly}
              onClick={() => { setFavoriteOnly((value) => !value); }}
            >
              <Star fill={favoriteOnly ? "currentColor" : "none"} aria-hidden="true" />
              Избранные{data?.favoriteTotal ? ` · ${data.favoriteTotal}` : ""}
            </ShadcnButton>
            {hasFilters && <ShadcnButton type="button" variant="ghost" className="contacts-sphere__reset h-11 rounded-full px-4" onClick={clearFilters}>Сбросить</ShadcnButton>}
          </div>
        </div>}
        {!loading && !error && contacts.length > 0 && (
          <div className="contacts-sphere__result-meta" aria-live="polite">
            <strong>{data?.total || 0} {contactCountNoun(data?.total || 0)}</strong>
            {data?.total > contacts.length && <span>Показаны {contacts.length} из {data.total}</span>}
          </div>
        )}
        {loading ? <LoadingScreen compact /> : error && (!data || !contacts.length) ? (
          <div className="contacts-sphere__empty" role="alert">
            <strong>Не удалось загрузить контакты</strong>
            <span>{error.message}</span>
            <Button variant="outline" onClick={() => reload().catch(() => {})}>Попробовать снова</Button>
          </div>
        ) : contacts.length ? (
          <>
            <ul className="contacts-grid">
              {contacts.map((contact) => {
                const accent = contactAccent(contact.company);
                const socialLinks = (contact.links || []).filter((link) => link?.url);
                return (
                  <li className="contact-card" style={{ "--contact-accent": accent }} key={contact.id}>
                    <ShadcnButton
                      type="button"
                      variant="ghost"
                      className="contact-card__open"
                      aria-label={`Открыть контакт ${contact.name}`}
                      onClick={() => setSelectedContactId(contact.id)}
                    />
                    <div className="contact-card__body h-auto w-full min-w-0 shrink flex-col items-stretch justify-start gap-0 overflow-hidden rounded-none bg-transparent p-2 text-left whitespace-normal">
                      <div className="contact-card__top w-full min-w-0">
                        <div className="contact-card__avatar-wrap">
                          <Avatar user={contact} size="lg" className="contact-card__avatar" aria-hidden="true" />
                        </div>
                        {contact.category && <span className="contact-card__category-slot"><span className="contact-card__category">{CONTACT_CATEGORY_LABELS[contact.category] || contact.category}</span></span>}
                      </div>
                      <div className="contact-card__identity w-full min-w-0">
                        <div className="contact-card__name-row w-full min-w-0">
                          <strong>{contact.name}</strong>
                        </div>
                        <span className="contact-card__company"><Building2 aria-hidden="true" /><span className="contact-card__company-text">{contact.company}</span></span>
                      </div>
                      <div className="contact-card__bio w-full min-w-0">
                        <span className="contact-card__bio-text">{contact.role || (contact.hasNotes ? "Есть заметки" : "Роль не указана")}</span>
                      </div>
                    </div>
                    {(!access.readOnly || contact.hasNotes || socialLinks.length > 0) && (
                      <footer className="contact-card__footer">
                        {!access.readOnly && <ShadcnButton
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="contact-card__favorite rounded-full"
                          data-favorite={contact.favorite ? "true" : "false"}
                          aria-pressed={Boolean(contact.favorite)}
                          aria-label={contact.favorite ? `Убрать ${contact.name} из избранного` : `Добавить ${contact.name} в избранное`}
                          title={contact.favorite ? "Убрать из избранного" : "Добавить в избранное"}
                          disabled={favoriteSavingIds.has(contact.id)}
                          onClick={() => toggleFavorite(contact)}
                        >
                          {favoriteSavingIds.has(contact.id) ? <Spinner /> : <Star fill={contact.favorite ? "currentColor" : "none"} aria-hidden="true" />}
                        </ShadcnButton>}
                        {(contact.hasNotes || socialLinks.length > 0) && <div className="contact-card__secondary-actions">
                          {contact.hasNotes && <ShadcnButton type="button" variant="ghost" className="contact-card__details h-9 rounded-full px-1" onClick={() => setSelectedContactId(contact.id)}><NotebookText aria-hidden="true" />Заметки</ShadcnButton>}
                          {socialLinks.length > 0 && (
                            <span className="contact-card__social-links" aria-label={`Ссылки ${contact.name}`}>
                              {socialLinks.map((link, index) => <ContactSocialLink key={`${link.url}-${index}`} link={link} contactName={contact.name} />)}
                            </span>
                          )}
                        </div>}
                      </footer>
                    )}
                  </li>
                );
              })}
            </ul>
            {data.hasMore && (
              <div ref={loadMoreRef} className="contacts-load-more" aria-live="polite" aria-busy={loadingMore}>
                {error && <span role="alert">Не удалось загрузить ещё контакты: {error.message}</span>}
                <ShadcnButton type="button" variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? <><Spinner />Загрузка контактов…</> : error ? "Попробовать снова" : "Загрузить ещё"}
                </ShadcnButton>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon={ContactRound}
            title={favoriteOnly ? "В избранном пока нет контактов" : hasFilters ? "Контакты не найдены" : "Контактов пока нет"}
            text={favoriteOnly ? "Нажмите на звезду в карточке контакта, чтобы добавить его сюда." : hasFilters ? "Попробуйте изменить запрос или сбросить фильтры." : access.readOnly ? "Владелец пока не добавил контакты." : "Добавьте первый контакт, чтобы он появился здесь."} />
        )}
      </section>
      {selectedContactId && <ContactDetailDrawer
        readOnly={access.readOnly}
        contactId={selectedContactId}
        companies={companies}
        onClose={() => setSelectedContactId("")}
        onUpdated={() => reload({ background: true }).catch(() => {})}
        onDeleted={() => {
          setSelectedContactId("");
          setContactsVersion((value) => value + 1);
        }}
      />}
      {!access.readOnly && creatingContact && <ContactCreateDrawer
        companies={companies}
        onClose={() => setCreatingContact(false)}
        onCreated={(contact) => {
          setCreatingContact(false);
          clearFilters();
          setSelectedContactId(contact.id);
          setContactsVersion((value) => value + 1);
        }}
      />}
    </div>
  );
}

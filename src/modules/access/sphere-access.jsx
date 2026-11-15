import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../runtime/api.js";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useSphereSharing } from "./sphere-sharing.jsx";
import { useToast } from "../shell/toast.jsx";
import { SERVICE_SWITCHER_ITEMS } from "../shell/service-menu.jsx";
import { SPHERE_SECTION_LABELS, sphereSectionPath, SPHERE_SECTIONS } from "../../../shared/modules/access/sphere-sharing.js";
import { Navigate, Link } from "react-router-dom";
import { APP_HOME } from "../shell/home-path.jsx";
import { useSession } from "../auth/session.jsx";
import { PageActionButton } from "@/components/page-action-button";
import { Search, Users, X, Building2, BriefcaseBusiness } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BusinessPersonalOffers } from "@/components/personal-offers";
import { BusinessRequestScopeFields } from "@/modules/access/business-request-scope-fields.jsx";
import { BusinessClientAccessActions } from "@/modules/access/business-client-access-actions.jsx";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile, canAutofocusForm } from "@/hooks/use-mobile";
import { businessCategoryFor, businessRequestSpheres } from "../../../shared/modules/catalog-marketplace/business-accounts.js";
import { publicSpacePath } from "../../../shared/modules/profile/profile-links.js";
import { contactAccent } from "../contacts/contacts-page.jsx";
import { Checkbox } from "@/components/ui/checkbox";

export function SphereAccessRequestBanner() {
  const access = useSphereSharing();
  const toast = useToast();
  const [savingId, setSavingId] = useState("");
  if (!access.active || access.loading || !access.isOwner || access.requests.length === 0) return null;

  const respond = async (request, decision) => {
    if (savingId) return;
    setSavingId(request.id);
    try {
      await api.post(`/sphere-access-requests/${request.id}/respond`, { decision });
      await access.reload();
      toast(decision === "approved"
        ? `Доступ для ${request.requester.name} открыт`
        : `Запрос от ${request.requester.name} отклонён`, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setSavingId("");
    }
  };

  return (
    <section className="sphere-access-requests rollapp-body" aria-label="Запросы доступа к пространству">
      {access.requests.map((request) => (
        <Card key={request.id} className="sphere-access-request grid">
          <div className="sphere-access-request__person">
            <Avatar user={request.requester} size="sm" className="!size-11" />
            <span>
              <strong>{request.requester.name}</strong>
              <small>Бизнес-аккаунт · @{request.requester.username}</small>
            </span>
          </div>
          <div className="sphere-access-request__copy">
            <strong>Запрашивает доступ к «{request.sphere === "wishlist" && request.section !== "wishlist"
              ? `Вишлист · ${businessSectionLabel(request.section)}`
              : businessSectionLabel(request.section)}»</strong>
            {request.message && <p>{request.message}</p>}
          </div>
          <div className="sphere-access-request__actions">
            <ShadcnButton type="button" variant="destructive" disabled={Boolean(savingId)} onClick={() => respond(request, "declined")}>Отклонить</ShadcnButton>
            <ShadcnButton type="button" disabled={Boolean(savingId)} onClick={() => respond(request, "approved")}>
              {savingId === request.id && <Spinner data-icon="inline-start" />}
              Открыть доступ
            </ShadcnButton>
          </div>
        </Card>
      ))}
    </section>
  );
}

const BUSINESS_REQUEST_STATUS = {
  pending: { label: "Ожидает ответа", variant: "secondary" },
  approved: { label: "Доступ закрыт", variant: "outline" },
  declined: { label: "Отклонён", variant: "destructive" },
  cancelled: { label: "Отменён", variant: "outline" },
};

const businessScopeKey = (ownerId, sphere, section) => JSON.stringify([ownerId, sphere, section]);

const businessSphereLabel = (sphere) => SERVICE_SWITCHER_ITEMS.find((item) => item.id === sphere)?.label || sphere;

export const businessSectionLabel = (section) => SPHERE_SECTION_LABELS[section] || section;

const businessSharePath = ({ owner, sphere, section }) => sphereSectionPath({ ownerUsername: owner.username, sphere, section });

export function BusinessAccessPage() {
  const { user } = useSession();
  if (user?.accountType !== "business") return <Navigate to={APP_HOME} replace />;
  return <BusinessAccessContent key={user.id} user={user} />;
}

function BusinessAccessContent({ user }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const category = businessCategoryFor(user);
  const availableSpheres = businessRequestSpheres(user);
  const initialSphere = availableSpheres[0]?.id || "identity";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [peopleError, setPeopleError] = useState("");
  const [accessData, setAccessData] = useState({ shares: [], requests: [], loading: true, error: "" });
  const accessLoad = useRef(0);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [sphere, setSphere] = useState(initialSphere);
  const [section, setSection] = useState(user.sellerSpace || SPHERE_SECTIONS[initialSphere][0]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState("");

  const loadAccess = useCallback(async () => {
    const load = ++accessLoad.current;
    try {
      const { shares = [], requests = [] } = await api.get("/business-access/requests");
      if (load === accessLoad.current) setAccessData({ shares, requests, loading: false, error: "" });
    } catch (error) {
      if (load === accessLoad.current) setAccessData({ shares: [], requests: [], loading: false, error: error.message });
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams();
    if (debouncedSearch) query.set("search", debouncedSearch);
    setLoadingPeople(true);
    setPeopleError("");
    api.get(`/business-access/users${query.size ? `?${query.toString()}` : ""}`).then((result) => {
      if (current) setPeople(result.people || []);
    }).catch((error) => {
      if (current) setPeopleError(error.message);
    }).finally(() => {
      if (current) setLoadingPeople(false);
    });
    return () => { current = false; };
  }, [debouncedSearch]);

  useEffect(() => {
    void loadAccess();
    window.addEventListener("focus", loadAccess);
    return () => {
      ++accessLoad.current;
      window.removeEventListener("focus", loadAccess);
    };
  }, [loadAccess]);

  const { requests, loading, error } = accessData;
  const fixedSellerSpace = category?.id === "seller" ? user.sellerSpace : null;
  const contactShares = accessData.shares.map((share) => fixedSellerSpace && share.sphere === "wishlist" && share.section === "wishlist"
    ? { ...share, section: fixedSellerSpace }
    : share);
  const shares = [...new Map(contactShares.map((share) => [businessScopeKey(share.owner.id, share.sphere, share.section), share])).values()];
  const sharesByScope = new Map(shares.map((share) => [businessScopeKey(share.owner.id, share.sphere, share.section), share]));
  const activeShareFor = (ownerId, scopeSphere, scopeSection) => sharesByScope.get(businessScopeKey(ownerId, scopeSphere, scopeSection))
    || (scopeSphere === "wishlist" && sharesByScope.get(businessScopeKey(ownerId, "wishlist", "wishlist")));
  const outstanding = requests.filter((request) => !activeShareFor(request.owner.id, request.sphere, request.section));
  const pendingByScope = new Map(outstanding.filter((request) => request.status === "pending")
    .map((request) => [businessScopeKey(request.owner.id, request.sphere, request.section), request]));
  const selectedScope = businessScopeKey(selectedPerson?.id, sphere, section);
  const selectedShare = activeShareFor(selectedPerson?.id, sphere, section);
  const selectedRequest = pendingByScope.get(selectedScope);
  const accessReady = !loading && !error;

  const selectSphere = (nextSphere) => {
    setSphere(nextSphere);
    setSection(SPHERE_SECTIONS[nextSphere][0]);
  };
  const openRequest = (person) => {
    const existing = shares.find((share) => share.owner.id === person.id)
      || outstanding.find((request) => request.owner.id === person.id && request.status === "pending");
    setSelectedPerson(person);
    setSphere(existing?.sphere || initialSphere);
    setSection(existing?.section || user.sellerSpace || SPHERE_SECTIONS[initialSphere][0]);
    setMessage("");
    void loadAccess();
  };
  const sendRequest = async (event) => {
    event.preventDefault();
    if (!selectedPerson || saving || !accessReady || selectedShare || selectedRequest) return;
    setSaving(true);
    try {
      await api.post("/business-access/requests", {
        ownerId: selectedPerson.id,
        sphere,
        section,
        message,
      });
      setSelectedPerson(null);
      await loadAccess();
      toast("Запрос отправлен владельцу пространства", "success");
    } catch (error) {
      toast(error.message, "error");
      if (error.status === 409) await loadAccess();
    } finally {
      setSaving(false);
    }
  };
  const cancelRequest = async (request) => {
    if (cancellingId) return;
    setCancellingId(request.id);
    try {
      await api.delete(`/business-access/requests/${request.id}`);
      await loadAccess();
      toast("Запрос отменён", "success");
    } catch (error) {
      toast(error.message, "error");
      if (error.status === 404) await loadAccess();
    } finally {
      setCancellingId("");
    }
  };
  const accessStatus = loading ? (
    <div className="business-access-page__status" role="status"><Spinner /><span>Загружаем доступы и запросы…</span></div>
  ) : error ? (
    <Alert variant="destructive">
      <AlertTitle>Не удалось загрузить доступы и запросы</AlertTitle>
      <AlertDescription>{error}<ShadcnButton type="button" variant="outline" onClick={loadAccess}>Повторить</ShadcnButton></AlertDescription>
    </Alert>
  ) : null;

  return (
    <div className="app-page business-access-page page-stack page-stack--sections rollapp-body">
      <header className="business-access-page__header typeset typeset-rollapp">
        <h1>Доступ к пространствам клиентов</h1>
        {category && <p>{category.label} · {category.sphereLabel}</p>}
        <p>Открытые владельцами разделы доступны только для чтения. Чтобы получить доступ к другому разделу, найдите пользователя и отправьте запрос.</p>
        {category?.id === "seller" && <PageActionButton to={publicSpacePath(user.username, user.sellerSpace || "products")}>Моя страница</PageActionButton>}
      </header>

      {category?.id !== "seller" && <BusinessPersonalOffers user={user} />}

      <section className="business-access-page__section" aria-labelledby="business-shares-title">
        <div className="typeset typeset-rollapp"><h2 id="business-shares-title">Открытые разделы</h2></div>
        {accessStatus || (shares.length ? (
          <ul className="contacts-grid">
            {shares.map((share) => (
              <BusinessAccessCard key={businessScopeKey(share.owner.id, share.sphere, share.section)} owner={share.owner} scope={share} actions={
                <Link to={businessSharePath(share)} data-slot="button" className={buttonVariants({ variant: "outline" })} aria-label={`Открыть «${businessSectionLabel(share.section)}» — ${share.owner.name}`}><span>Открыть</span></Link>
              } />
            ))}
          </ul>
        ) : <div className="business-access-page__status">У вас пока нет открытых разделов</div>)}
      </section>

      <section className="business-access-page__section" aria-labelledby="business-requests-title">
        <div className="typeset typeset-rollapp"><h2 id="business-requests-title">Мои запросы</h2></div>
        {accessReady && (outstanding.length ? (
          <ul className="contacts-grid">
            {outstanding.map((request) => {
              const status = BUSINESS_REQUEST_STATUS[request.status];
              return (
                <BusinessAccessCard key={request.id} owner={request.owner} scope={request} status={status && <Badge variant={status.variant}>{status.label}</Badge>} actions={request.status === "pending" && (
                  <ShadcnButton type="button" variant="outline" disabled={Boolean(cancellingId)} onClick={() => cancelRequest(request)}>{cancellingId === request.id && <Spinner data-icon="inline-start" />}<span>Отменить</span></ShadcnButton>
                )} />
              );
            })}
          </ul>
        ) : <div className="business-access-page__status">Здесь появятся запросы, по которым сейчас нет доступа</div>)}
      </section>

      <section className="business-access-page__section" aria-labelledby="business-people-title">
        <div className="typeset typeset-rollapp"><h2 id="business-people-title">Пользователи</h2></div>
        <InputGroup className="business-access-page__search">
          <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput type="search" aria-label="Найти пользователя" placeholder="Имя или username" value={search} onChange={(event) => setSearch(event.target.value)} />
          {search && <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-sm" className="rounded-full" aria-label="Очистить поиск" onClick={() => setSearch("")}><X aria-hidden="true" /></InputGroupButton></InputGroupAddon>}
        </InputGroup>
        {loadingPeople ? <div className="business-access-page__status" role="status"><Spinner /><span>Загружаем пользователей…</span></div> : peopleError ? (
          <Alert variant="destructive"><AlertTitle>Не удалось загрузить пользователей</AlertTitle><AlertDescription>{peopleError}</AlertDescription></Alert>
        ) : people.length ? (
          <ul className="contacts-grid" aria-label="Пользователи">
            {people.map((person) => {
              const sections = shares.filter((share) => share.owner.id === person.id);
              const hasPending = outstanding.some((request) => request.owner.id === person.id && request.status === "pending");
              return (
                <BusinessAccessCard key={person.id} owner={person} status={hasPending && <Badge variant="outline">Есть запрос</Badge>} actions={
                  <BusinessClientAccessActions account={user} person={person} sections={sections} onRequest={() => openRequest(person)} />
                } />
              );
            })}
          </ul>
        ) : <div className="business-access-page__status"><Users aria-hidden="true" /><span>Пользователи не найдены</span></div>}
      </section>

      <Drawer open={Boolean(selectedPerson)} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => !open && !saving && setSelectedPerson(null)}>
        <DrawerContent className="rollapp-body app-drawer--form">
          <DrawerClose render={<ShadcnButton className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />} aria-label="Закрыть запрос доступа"><X aria-hidden="true" /></DrawerClose>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>Разделы и доступ</DrawerTitle>
            <DrawerDescription>Выберите раздел, чтобы открыть его или запросить доступ у владельца.</DrawerDescription>
          </DrawerHeader>
          <form className="business-access-form" onSubmit={sendRequest}>
            <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="business-access-form__person"><Avatar user={selectedPerson} size="md" /><span><strong>{selectedPerson?.name}</strong><small>@{selectedPerson?.username}</small></span></div>
            <FieldGroup className="gap-4">
              <BusinessRequestScopeFields account={user} sphere={sphere} section={section} onSphereChange={selectSphere} onSectionChange={setSection} disabled={saving} />
              {accessStatus || (selectedShare ? (
                <p role="status">Доступ открыт для чтения.</p>
              ) : selectedRequest ? (
                <p role="status">Запрос отправлен. Ожидаем ответа владельца.</p>
              ) : (
                <Field><FieldLabel htmlFor="business-access-message">Сообщение <span className="muted">необязательно</span></FieldLabel><Textarea id="business-access-message" maxLength={500} rows={4} placeholder="Объясните, зачем вам нужен доступ" value={message} disabled={saving} onChange={(event) => setMessage(event.target.value)} /></Field>
              ))}
            </FieldGroup>
            </div>
            {accessReady && !selectedRequest && <DrawerFooter>{selectedShare ? (
              <Link
                to={businessSharePath({ owner: selectedShare.owner, sphere, section })}
                replace={isMobile}
                onClick={() => setSelectedPerson(null)}
                data-slot="button"
                className={buttonVariants({ className: "flex-1" })}
              >Открыть</Link>
            ) : (
              <ShadcnButton type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Отправить запрос</ShadcnButton>
            )}</DrawerFooter>}
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function BusinessAccessCard({ owner, scope, status, actions }) {
  return (
    <li className="business-access-card" style={{ "--contact-accent": contactAccent(owner.username || owner.name) }}>
      <div className="business-access-card__body">
        <div className="contact-card__avatar-wrap">
          <Avatar user={owner} size="lg" className="contact-card__avatar" aria-hidden="true" />
        </div>
        <div className="business-access-card__identity">
          <strong>{owner.name}</strong>
          <span className="business-access-card__caption">@{owner.username}</span>
        </div>
        {scope && (
          <div className="business-access-card__scope">
            <span><Building2 aria-hidden="true" /><span>{businessSectionLabel(scope.section)}</span></span>
            {scope.section !== scope.sphere && <span className="business-access-card__caption">{businessSphereLabel(scope.sphere)}</span>}
          </div>
        )}
        {status}
      </div>
      {actions && <footer className="business-access-card__footer">{actions}</footer>}
    </li>
  );
}

export function SphereSharePicker({ open, onOpenChange }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const { sphere, section, isOwner, reload } = useSphereSharing();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const label = SPHERE_SECTION_LABELS[section] || section;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!open || !isOwner || !section) return undefined;
    let current = true;
    const query = new URLSearchParams({ sphere, section });
    if (debouncedSearch) query.set("search", debouncedSearch);
    setPeople([]);
    setLoading(true);
    setError("");
    api.get(`/sphere-shares/candidates?${query.toString()}`).then((result) => {
      if (current) setPeople((result.people || []).filter((person) => person.accountType === "business"));
    }).catch((loadError) => {
      if (current) setError(loadError.message);
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [debouncedSearch, isOwner, open, section, sphere]);

  const toggle = async (person) => {
    if (savingId) return;
    const granted = !person.granted;
    setSavingId(person.id);
    setError("");
    try {
      await api.post("/sphere-shares", {
        viewerId: person.id,
        sphere,
        section: person.granted ? (person.grantSection || section) : section,
        granted,
      });
      setPeople((current) => current.map((item) => item.id === person.id ? { ...item, granted, grantSection: section } : item));
      const refreshed = await api.get(`/sphere-shares/candidates?${new URLSearchParams({ sphere, section, search: debouncedSearch })}`).catch(() => null);
      if (refreshed) setPeople(refreshed.people || []);
      await reload();
      toast(granted
        ? `Доступ к «${label}» для ${person.name} открыт`
        : `Доступ к «${label}» для ${person.name} закрыт`, "success");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingId("");
    }
  };

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(nextOpen) => !savingId && onOpenChange(nextOpen)}>
      <DrawerContent
        className="rollapp-body app-drawer--form"
      >
        <DrawerClose
          render={<ShadcnButton className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={Boolean(savingId)} />}
          aria-label="Закрыть выбор пользователей"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <DrawerHeader className="pr-16 text-left!">
          <DrawerTitle>Доступ к «{label}»</DrawerTitle>
          <DrawerDescription>Выберите бизнес-аккаунты, которым хотите открыть этот раздел для чтения.</DrawerDescription>
        </DrawerHeader>
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <InputGroup className="sphere-share-picker__search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput autoFocus={canAutofocusForm()} type="search" aria-label="Найти бизнес-аккаунт" placeholder="Название или username" value={search} onChange={(event) => setSearch(event.target.value)} />
          </InputGroup>
          {error && <Alert variant="destructive"><AlertTitle>Не удалось изменить доступ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {loading ? <div className="sphere-share-picker__status"><Spinner /><span>Загружаем людей…</span></div> : people.length ? (
            <ul className="sphere-share-picker__list" aria-label={`Бизнес-аккаунты с доступом к «${label}»`}>
              {people.map((person) => (
                <li key={person.id}>
                  <ShadcnButton
                    type="button"
                    variant="ghost"
                    className="sphere-share-picker__person"
                    disabled={Boolean(savingId)}
                    aria-pressed={person.granted}
                    onClick={() => toggle(person)}
                  >
                    <Avatar user={person} size="sm" className="!size-11" />
                    <span><strong>{person.name}</strong><small>@{person.username}{person.grantSection === "wishlist" ? " · Доступ ко всему Вишлисту" : ""}</small></span>
                    {person.accountType === "business" && (
                      <Badge variant="secondary" className="sphere-share-picker__account-type">
                        <BriefcaseBusiness aria-hidden="true" />
                        Бизнес
                      </Badge>
                    )}
                    {savingId === person.id ? <Spinner /> : <Checkbox checked={person.granted} tabIndex={-1} aria-hidden="true" />}
                  </ShadcnButton>
                </li>
              ))}
            </ul>
          ) : <div className="sphere-share-picker__status"><Users /><span>Бизнес-аккаунты не найдены</span></div>}
        </div>
        <DrawerFooter>
          <DrawerClose render={<ShadcnButton className="min-h-12 text-base" type="button" />}>Готово</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

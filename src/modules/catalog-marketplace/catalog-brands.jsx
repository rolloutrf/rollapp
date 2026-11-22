import { EmptyState } from "@/modules/shell/page-feedback.jsx";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Building2, Ellipsis } from "lucide-react";
import { api } from "../runtime/api.js";
import { publicProfilePath, publicSpacePath } from "../../../shared/modules/profile/profile-links.js";
import { APP_WISH_CATALOG_PATH } from "../shell/app-routing.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar as ProfileAvatar } from "../profile/profile-avatar.jsx";
import { profileCardAccent } from "../profile/profile-card-accent.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PageActionButton } from "@/components/page-action-button";
import { cn } from "@/lib/utils";
import { useSphereSharing } from "../access/sphere-sharing.jsx";
import { SPHERE_SECTION_LABELS } from "../../../shared/modules/access/sphere-sharing.js";

export function brandCatalogPath(space) {
  return `${APP_WISH_CATALOG_PATH}?${new URLSearchParams({ source: "brands", tab: space })}`;
}

export const BusinessCatalogContext = createContext(null);
const loadingState = { accounts: [], loading: true, error: null };

export function BusinessCatalogProvider({ space, sphere, children }) {
  const endpoint = sphere ? `/business-catalog/${sphere}` : space ? `/wishlist-business/${space}/accounts` : null;
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!endpoint) return;
    let active = true;
    api.get(endpoint).then(({ accounts }) => {
      if (active) setResult({ endpoint, revision, accounts, loading: false, error: null });
    }).catch((error) => {
      if (active) setResult({ endpoint, revision, accounts: [], loading: false, error });
    });
    return () => { active = false; };
  }, [endpoint, revision]);
  const state = result?.endpoint === endpoint && result.revision === revision ? result : loadingState;
  const updateConsent = (username, granted) => setResult(current => (
    current?.endpoint === endpoint && current.revision === revision
      ? { ...current, accounts: current.accounts.map(account => account.username === username ? { ...account, offerConsent: granted } : account) }
      : current
  ));
  return <BusinessCatalogContext.Provider value={{ ...state, space, sphere, endpoint, updateConsent, retry: () => setRevision(value => value + 1) }}>{children}</BusinessCatalogContext.Provider>;
}

function BusinessAvatar({ account, className }) {
  return <Avatar className={className}>
    <AvatarImage src={account.avatarUrl} alt="" />
    <AvatarFallback><Building2 aria-hidden="true" className="size-1/2" /></AvatarFallback>
  </Avatar>;
}

export function BusinessCatalogSelect({ side = "bottom", fullWidth = false }) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { accounts, space, loading, error } = useContext(BusinessCatalogContext);
  const legacyBrand = new URLSearchParams(search).get("brand");
  return <Select value={legacyBrand ? null : "directory"} onValueChange={(value) => {
    if (value === "directory") navigate(brandCatalogPath(space));
    else if (value) {
      const username = value.slice("account:".length);
      navigate(publicSpacePath(accounts.find(account => account.username === username) || username, space));
    }
  }}>
    <SelectTrigger className="space-select global-service-select" aria-label="Бизнес-аккаунты" disabled={loading || (!legacyBrand && !accounts.length)}>
      <SelectValue>{() => <>{loading ? <Spinner /> : <Building2 aria-hidden="true" />}<span className="space-select__label">{error ? "Бизнес-аккаунты недоступны" : "Бизнес-аккаунты"}</span></>}</SelectValue>
    </SelectTrigger>
    <SelectContent className={cn("space-select__content global-service-select__content w-max min-w-(--anchor-width) max-w-(--available-width)", fullWidth && "app-navigation-popup")} side={side} alignItemWithTrigger={false}>
      <SelectItem value="directory"><Building2 aria-hidden="true" />Все бизнес-аккаунты</SelectItem>
      {accounts.map((account) => <SelectItem key={account.username} value={`account:${account.username}`} className="[&>div:first-child]:min-w-0 [&>div:first-child]:shrink">
        <BusinessAvatar account={account} className="size-6 shrink-0" />
        <span className="min-w-0 truncate">{account.storefrontTitle || account.name}</span>
      </SelectItem>)}
    </SelectContent>
  </Select>;
}

export function BusinessCatalogList() {
  const { accounts, space, sphere, endpoint, loading, error, updateConsent, retry } = useContext(BusinessCatalogContext);
  const access = useSphereSharing();
  const consentHintId = useId();
  if (loading) return <p role="status" className="rollapp-body flex items-center justify-center gap-2"><Spinner />Загружаем бизнес-аккаунты…</p>;
  if (error) return <Alert variant="destructive" className="wish-catalog-page__error">
    <AlertTitle>Не удалось загрузить бизнес-аккаунты</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
    <PageActionButton type="button" variant="outline" onClick={retry}>Повторить</PageActionButton>
  </Alert>;
  const legacyAccounts = access.active && access.isOwner && !access.error
    ? access.people.filter((person, index, people) => people.findIndex(entry => entry.username === person.username) === index &&
        !accounts.some(account => account.username === person.username))
    : [];
  if (!accounts.length && !legacyAccounts.length) return <EmptyState icon={Building2} title="В этом разделе пока нет бизнес-аккаунтов"
    text={sphere ? "Здесь появятся бизнес-аккаунты этой сферы." : "Здесь появятся аккаунты продавцов этого раздела."} />;
  return <>
    {accounts.some(account => typeof account.offerConsent === "boolean") && <p id={consentHintId} className="rollapp-body text-pretty">
      Откройте активные потребности выбранному бренду, чтобы он мог присылать вам предложения.
    </p>}
    <ul className="contacts-grid rollapp-body mx-auto w-full max-w-(--layout-collection-width)" role="list" aria-label="Бизнес-аккаунты">
      {[...accounts, ...legacyAccounts].map(account => <BusinessCatalogAccount key={`${endpoint}:${account.username}`} account={account}
        path={space ? publicSpacePath(account, space) : publicProfilePath(account)} onChange={updateConsent} access={access} consentHintId={consentHintId} />)}
    </ul>
  </>;
}

function BusinessCatalogAccount({ account, path, onChange, access, consentHintId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const consentButton = useRef(null);
  const name = account.storefrontTitle || account.name;
  const canChangeConsent = typeof account.offerConsent === "boolean";
  const grants = access.active && access.isOwner && !access.error
    ? access.people.filter(person => person.username === account.username)
    : [];
  const action = account.offerConsent ? "Закрыть потребности" : "Открыть потребности";

  async function save(operation) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const changeConsent = () => save(async () => {
    const { granted } = await api.post(`/brand-offer-consents/${encodeURIComponent(account.username)}`, { granted: !account.offerConsent });
    onChange(account.username, granted);
  });
  const revokeGrant = (grant) => save(async () => {
    await api.post("/sphere-shares", { viewerId: grant.id, sphere: access.sphere, section: grant.grantSection, granted: false });
    await access.reload({ background: true });
  });
  const focusConsent = (event) => {
    if (!event.ctrlKey || !consentButton.current) return;
    event.preventDefault();
    consentButton.current.focus();
  };
  return <li className="business-catalog-card" style={{ "--contact-accent": profileCardAccent(account.username || name) }}>
    <Link to={path} className="business-catalog-card__profile" aria-label={`Открыть профиль ${name} (@${account.username})`}
      onClick={focusConsent} onContextMenu={focusConsent}>
      <span className="contact-card__avatar-wrap">
        <ProfileAvatar user={account} size="lg" className="contact-card__avatar" aria-hidden="true" />
      </span>
      <span className="business-catalog-card__identity">
        <strong>{name}</strong>
        <span className="text-xs text-muted-foreground wrap-anywhere">@{account.username}</span>
      </span>
    </Link>
    {canChangeConsent && <footer className="business-catalog-card__footer">
      <Button ref={consentButton} type="button" variant={account.offerConsent ? "secondary" : "outline"}
        className="h-auto rounded-full py-2 whitespace-normal" aria-label={`${action} · ${name}`} aria-describedby={consentHintId}
        aria-busy={busy || undefined} disabled={busy} onClick={changeConsent}><span>{action}</span></Button>
    </footer>}
    {grants.length > 0 && <ControlBar className="absolute top-3 right-3 z-10">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" data-control-icon
          aria-label={`Ранее выданные права бренда «${name}»`} />}><Ellipsis aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-max max-w-(--available-width)">
          {grants.map(grant => <DropdownMenuItem key={grant.grantSection} variant="destructive" className="whitespace-normal" disabled={busy}
            onClick={() => revokeGrant(grant)}>Закрыть доступ к «{SPHERE_SECTION_LABELS[grant.grantSection]}»</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </ControlBar>}
    {error && <p role="alert" className="px-2 text-xs text-destructive wrap-anywhere">{error}</p>}
  </li>;
}

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { api } from "../api.js";
import { publicProfilePath, publicSpacePath } from "../../shared/profile-links.js";
import { APP_WISH_CATALOG_PATH } from "../lib/app-routing.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PageActionButton } from "@/components/page-action-button";
import { cn } from "@/lib/utils";

export function brandCatalogPath(space) {
  return `${APP_WISH_CATALOG_PATH}?${new URLSearchParams({ source: "brands", tab: space })}`;
}

const BusinessCatalogContext = createContext(null);
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
  const updateFollowing = (username, following) => setResult(current => (
    current?.endpoint === endpoint && current.revision === revision
      ? { ...current, accounts: current.accounts.map(account => account.username === username ? { ...account, isFollowing: following } : account) }
      : current
  ));
  return <BusinessCatalogContext.Provider value={{ ...state, space, sphere, endpoint, updateFollowing, retry: () => setRevision(value => value + 1) }}>{children}</BusinessCatalogContext.Provider>;
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
    else if (value) navigate(publicSpacePath(value.slice("account:".length), space));
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
  const { accounts, space, sphere, endpoint, loading, error, updateFollowing, retry } = useContext(BusinessCatalogContext);
  if (loading) return <p role="status" className="rollapp-body flex items-center justify-center gap-2"><Spinner />Загружаем бизнес-аккаунты…</p>;
  if (error) return <Alert variant="destructive" className="wish-catalog-page__error">
    <AlertTitle>Не удалось загрузить бизнес-аккаунты</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
    <PageActionButton type="button" variant="outline" onClick={retry}>Повторить</PageActionButton>
  </Alert>;
  if (!accounts.length) return <Empty>
    <EmptyHeader>
      <EmptyTitle>В этом разделе пока нет бизнес-аккаунтов</EmptyTitle>
      <EmptyDescription>{sphere ? "Здесь появятся бизнес-аккаунты этой сферы." : "Здесь появятся аккаунты продавцов этого раздела."}</EmptyDescription>
    </EmptyHeader>
  </Empty>;
  return <ul className="business-catalog-grid rollapp-body mx-auto grid w-full max-w-(--layout-collection-width) gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Бизнес-аккаунты">
    {accounts.map(account => <BusinessCatalogAccount key={`${endpoint}:${account.username}`} account={account}
      path={space ? publicSpacePath(account.username, space) : publicProfilePath(account.username)} onChange={updateFollowing} />)}
  </ul>;
}

function BusinessCatalogAccount({ account, path, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const name = account.storefrontTitle || account.name;
  const label = account.isFollowing ? "Отписаться" : "Подписаться";
  const change = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.post(`/profile/${encodeURIComponent(account.username)}/follow`, { following: !account.isFollowing });
      onChange(account.username, result.following);
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return <li className="business-catalog-card">
    <Link to={path} className="business-catalog-card__profile" aria-label={`Открыть профиль ${name} (@${account.username})`}>
      <BusinessAvatar account={account} className="business-catalog-card__avatar size-(--contact-avatar-size)" />
      <span className="business-catalog-card__identity">
        <strong>{name}</strong>
        <span className="text-xs text-muted-foreground wrap-anywhere">@{account.username}</span>
      </span>
    </Link>
    {typeof account.isFollowing === "boolean" && <footer className="business-catalog-card__footer">
      <PageActionButton type="button" variant="outline" aria-label={`${label} · ${name}`}
        aria-busy={busy || undefined} disabled={busy} onClick={change}>{label}</PageActionButton>
      {error && <p role="alert" className="w-full text-xs text-destructive wrap-anywhere">{error}</p>}
    </footer>}
  </li>;
}

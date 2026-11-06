import { createContext, useContext, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { api } from "../api.js";
import { publicSpacePath } from "../../shared/profile-links.js";
import { APP_WISH_CATALOG_PATH } from "../lib/app-routing.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function brandCatalogPath(space) {
  return `${APP_WISH_CATALOG_PATH}?${new URLSearchParams({ source: "brands", tab: space })}`;
}

const BusinessCatalogContext = createContext(null);
const loadingState = { accounts: [], loading: true, error: null };

export function BusinessCatalogProvider({ space, children }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!space) {
      setResult(null);
      return;
    }
    let active = true;
    setResult(null);
    api.get(`/wishlist-business/${space}/accounts`).then(({ accounts }) => {
      if (active) setResult({ space, accounts, loading: false, error: null });
    }).catch((error) => {
      if (active) setResult({ space, accounts: [], loading: false, error });
    });
    return () => { active = false; };
  }, [space]);
  const state = result && result.space === space ? result : loadingState;
  return <BusinessCatalogContext.Provider value={{ ...state, space }}>{children}</BusinessCatalogContext.Provider>;
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
    <SelectTrigger className="space-select global-service-select rounded-full" aria-label="Бизнес-аккаунты" disabled={loading || (!legacyBrand && !accounts.length)}>
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
  const { accounts, space, loading, error } = useContext(BusinessCatalogContext);
  if (loading) return <p role="status" className="rollapp-body flex items-center justify-center gap-2"><Spinner />Загружаем бизнес-аккаунты…</p>;
  if (error) return <Alert variant="destructive" className="wish-catalog-page__error">
    <AlertTitle>Не удалось загрузить бизнес-аккаунты</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>;
  if (!accounts.length) return <Empty>
    <EmptyHeader>
      <EmptyTitle>В этом разделе пока нет бизнес-аккаунтов</EmptyTitle>
      <EmptyDescription>Здесь появятся аккаунты продавцов этого раздела.</EmptyDescription>
    </EmptyHeader>
  </Empty>;
  return <ul className="rollapp-body mx-auto grid w-full max-w-(--layout-collection-width) gap-3 sm:grid-cols-2" aria-label="Бизнес-аккаунты">
    {accounts.map((account) => <li key={account.username} className="min-w-0">
      <Link to={publicSpacePath(account.username, space)} className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <BusinessAvatar account={account} className="size-10 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium wrap-anywhere">{account.storefrontTitle || account.name}</span>
          <span className="text-xs text-muted-foreground wrap-anywhere">@{account.username}</span>
        </span>
      </Link>
    </li>)}
  </ul>;
}

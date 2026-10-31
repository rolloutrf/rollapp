import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Gift, Sparkles } from "lucide-react";
import { api } from "../api.js";
import { APP_WISH_CATALOG_PATH } from "../lib/app-routing.js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function brandCatalogPath(brand = "", space = "products") {
  const search = new URLSearchParams({ source: "brands", tab: space });
  if (brand) search.set("brand", brand);
  return `${APP_WISH_CATALOG_PATH}?${search}`;
}

function useBrands(space) {
  const [state, setState] = useState({ brands: [], loading: true, error: null });
  useEffect(() => {
    let active = true;
    setState({ brands: [], loading: true, error: null });
    api.get(`/catalog/brands?space=${encodeURIComponent(space)}`).then(({ brands }) => {
      if (active) setState({ brands, loading: false, error: null });
    }).catch((error) => {
      if (active) setState({ brands: [], loading: false, error });
    });
    return () => { active = false; };
  }, [space]);
  return state;
}

function BrandAvatar({ brand, large = false }) {
  return <Avatar className={large ? "size-16" : "size-6"}>
    <AvatarImage src={brand.logoUrl} alt="" />
    <AvatarFallback><Gift aria-hidden="true" className={large ? "size-8" : "size-4"} /></AvatarFallback>
  </Avatar>;
}

export function BrandCatalogSelect({ side = "bottom", fullWidth = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const space = new URLSearchParams(location.search).get("tab") || "products";
  const { brands, loading, error } = useBrands(space);
  const selected = new URLSearchParams(location.search).get("brand") || "";
  const current = brands.find((brand) => brand.slug === selected);
  return <Select value={selected || "recommendations"} onValueChange={(slug) => navigate(brandCatalogPath(slug === "recommendations" ? "" : slug, space))}>
    <SelectTrigger className="space-select global-service-select rounded-full" aria-label="Бренд каталога" title={error?.message || "Бренды"} disabled={loading || Boolean(error)}>
      <SelectValue>{() => <>{loading ? <Spinner /> : current ? <BrandAvatar brand={current} /> : <Sparkles aria-hidden="true" />}<span className="space-select__label">{error ? "Бренды недоступны" : current?.label || (selected ? "Бренд не найден" : "Рекомендации")}</span></>}</SelectValue>
    </SelectTrigger>
    <SelectContent className={cn("space-select__content global-service-select__content w-max min-w-(--anchor-width) max-w-(--available-width)", fullWidth && "app-navigation-popup")} side={side} alignItemWithTrigger={false}>
      <SelectItem value="recommendations"><Sparkles aria-hidden="true" />Рекомендации</SelectItem>
      {brands.map((brand) => <SelectItem key={brand.id} value={brand.slug}><BrandAvatar brand={brand} /><span>{brand.label}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}

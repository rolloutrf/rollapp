import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Gift, Sparkles } from "lucide-react";
import { api } from "../api.js";
import { APP_WISH_CATALOG_PATH } from "../lib/app-routing.js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export function ohMyWishesBrandPath(brand = "") {
  const search = new URLSearchParams({ source: "ohmywishes" });
  if (brand) search.set("brand", brand);
  return `${APP_WISH_CATALOG_PATH}?${search}`;
}

function useBrands() {
  const [state, setState] = useState({ brands: [], loading: true, error: null });
  useEffect(() => {
    let active = true;
    api.get("/catalog/brands").then(({ brands }) => {
      if (active) setState({ brands, loading: false, error: null });
    }).catch((error) => {
      if (active) setState({ brands: [], loading: false, error });
    });
    return () => { active = false; };
  }, []);
  return state;
}

function BrandAvatar({ brand, large = false }) {
  return <Avatar className={large ? "size-16" : "size-6"}>
    <AvatarImage src={brand.logoUrl} alt="" />
    <AvatarFallback><Gift aria-hidden="true" className={large ? "size-8" : "size-4"} /></AvatarFallback>
  </Avatar>;
}

export function OhMyWishesBrandSelect() {
  const location = useLocation();
  const navigate = useNavigate();
  const { brands, loading, error } = useBrands();
  const selected = new URLSearchParams(location.search).get("brand") || "";
  const current = brands.find((brand) => brand.slug === selected);
  return <Select value={selected || "recommendations"} onValueChange={(slug) => navigate(ohMyWishesBrandPath(slug === "recommendations" ? "" : slug))}>
    <SelectTrigger className="space-select global-service-select rounded-full" aria-label="Бренд каталога" title={error?.message || "Бренды"} disabled={loading || Boolean(error)}>
      <SelectValue>{() => <>{loading ? <Spinner /> : current ? <BrandAvatar brand={current} /> : <Sparkles aria-hidden="true" />}<span className="space-select__label">{error ? "Бренды недоступны" : current?.label || (selected ? "Бренд не найден" : "Рекомендации")}</span></>}</SelectValue>
    </SelectTrigger>
    <SelectContent className="space-select__content global-service-select__content w-max min-w-(--anchor-width) max-w-(--available-width)" alignItemWithTrigger={false}>
      <SelectItem value="recommendations"><Sparkles aria-hidden="true" />Рекомендации</SelectItem>
      {brands.map((brand) => <SelectItem key={brand.id} value={brand.slug}><BrandAvatar brand={brand} /><span>{brand.label}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}

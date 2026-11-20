import { Link, useLocation } from "react-router-dom";
import { APP_BUSINESS_ACCESS_PATH } from "./app-routing.js";
import { APP_HOME } from "./home-path.jsx";
import { sphereLink } from "../../applications/location.js";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { serviceSwitcherItemsForUser } from "./service-navigation.js";
import { useSession } from "../auth/session.jsx";
import { SERVICE_SWITCHER_ITEMS, activeServiceFromPath } from "./service-menu.jsx";

export function LogoMark({ className = "logo__mark" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 364 364"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1 8h109v114H1z" fill="currentColor" />
      <path
        d="M321.907 17.031A222.647 79.661 -47.859 1 1 23.133 347.216 222.647 79.661 -47.859 1 1 321.907 17.031ZM118 124h109v115H118Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
      <circle cx="302" cy="294" r="61" fill="currentColor" />
    </svg>
  );
}

function Logo({ className = "" }) {
  return (
    <Link to={APP_HOME} className={`logo ${className}`} aria-label="Rollapp — в приложение">
      <LogoMark />
    </Link>
  );
}

export function SphereSwitcher({ docked = false }) {
  const location = useLocation();
  const { pathname } = location;
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const activeService = activeServiceFromPath(pathname);
  const serviceHref = path => window.Telegram?.WebApp?.initData
    ? path
    : sphereLink(path, window.location);
  const sharedOwner = new URLSearchParams(location.search).get("owner");
  const visibleServices = [
    ...serviceSwitcherItemsForUser(SERVICE_SWITCHER_ITEMS, user),
    ...(user?.accountType === "business"
      ? [{ id: "business-access", label: "Клиенты", path: APP_BUSINESS_ACCESS_PATH, icon: Building2, color: "#8b7cf6" }]
      : []),
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<ShadcnButton data-control-icon className="sphere-switcher__trigger rounded-full" variant="outline" size="icon" type="button" />}
        aria-label="Открыть переключатель сфер"
        title="Сферы"
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
          <rect x="3.25" y="3.25" width="6.5" height="6.5" rx="2.25" />
          <rect x="14.25" y="3.25" width="6.5" height="6.5" rx="2.25" />
          <rect x="3.25" y="14.25" width="6.5" height="6.5" rx="2.25" />
          <rect x="14.25" y="14.25" width="6.5" height="6.5" rx="2.25" />
        </svg>
      </PopoverTrigger>
      <PopoverContent
        className="sphere-switcher__panel app-navigation-popup !rounded-3xl !p-2 max-[560px]:!rounded-2xl"
        align="start"
        side={docked ? "top" : "bottom"}
        sideOffset={10}
      >
        <nav className="sphere-switcher__list" aria-label="Сервисы и сферы Rollapp">
          {visibleServices.map(({ id, label, path, icon: Icon }) => {
            const active = id === activeService && !sharedOwner;
            return (
              <Link data-content-control=""
                key={id}
                to={serviceHref(path)}
                className={buttonVariants({
                  variant: active ? "secondary" : "ghost",
                  className: "sphere-switcher__item !h-auto !min-h-12 !justify-start !gap-4 !font-normal !whitespace-normal !rounded-xl !px-4 !py-3",
                })}
                data-active={active ? "true" : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="sphere-switcher__icon">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </PopoverContent>
    </Popover>
  );
}

export function AppBrand({ showSwitcher = true }) {
  return <div className="app-brand"><Logo className="app-shell-logo" />{showSwitcher && <SphereSwitcher />}</div>;
}

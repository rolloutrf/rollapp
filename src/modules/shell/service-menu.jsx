import { BriefcaseBusiness, Fingerprint, Gift, GraduationCap, HeartPulse, Coins, Columns3, ContactRound } from "lucide-react";
import { APP_HOME } from "./home-path.jsx";
import { APP_STORE_PATH, APP_ASSISTANT_PATH } from "./app-routing.js";
import { IDENTITY_TABS, CAREER_TABS, EDUCATION_TABS, HEALTH_TABS } from "../../../shared/modules/shell/sphere-tabs.js";
import { SPACES } from "../categories/wish-spaces.jsx";
import { publicSpacePath } from "../../../shared/modules/profile/profile-links.js";

export const SERVICE_SWITCHER_ITEMS = [
  { id: "identity", label: "Идентичность", path: "/app/spheres/identity", icon: Fingerprint, color: "#5967f2" },
  { id: "health", label: "Здоровье", path: "/app/spheres/health", icon: HeartPulse, color: "#43bd83" },
  { id: "wishlist", label: "Вишлист", path: APP_HOME, icon: Gift, color: "#f05f4f" },
  { id: "education", label: "Образование", path: "/app/spheres/education", icon: GraduationCap, color: "#f3c64e" },
  { id: "career", label: "Карьера", path: "/app/spheres/career", icon: BriefcaseBusiness, color: "#ff7557" },
];

export const SPHERE_SERVICES = SERVICE_SWITCHER_ITEMS.filter((item) => item.id !== "wishlist");

export const ROLLS_SERVICE = { id: "rolls", label: "Роллы", path: "/app/rolls", icon: Coins, color: "#f3c64e" };

export const PLANNING_SERVICE = { id: "planning", label: "Планирование", path: "/app/planning", icon: Columns3 };

export function isFriendsDirectoryPath(pathname) {
  return pathname === "/app/friends" || pathname.startsWith("/app/friends/");
}

export function activeServiceFromPath(pathname) {
  if (pathname.startsWith("/app/rolls")) return "rolls";
  if (pathname === "/app/planning") return "planning";
  if (pathname.startsWith("/app/business")) return "business-access";
  if (pathname.startsWith("/app/wishes") || pathname === APP_STORE_PATH) return "wishlist";
  if (pathname.startsWith("/s/")) return "wishlist";
  if (isFriendsDirectoryPath(pathname)) return "wishlist";
  if (pathname.startsWith("/app/spheres/contacts")) return "career";
  const sphereId = pathname.match(/^\/app\/spheres\/([^/]+)/)?.[1];
  if (SPHERE_SERVICES.some((sphere) => sphere.id === sphereId)) return sphereId;
  const reserved = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/ideas"];
  if (!reserved.includes(pathname) && !pathname.startsWith("/app/")) return "wishlist";
  return null;
}

export const SERVICE_TABS = {
  wishlist: SPACES,
  identity: IDENTITY_TABS,
  career: CAREER_TABS.map(tab => tab.id === "contacts" ? { ...tab, icon: ContactRound } : tab),
  education: EDUCATION_TABS,
  health: HEALTH_TABS,
};

export function serviceChromeFromPath(pathname) {
  let serviceId = activeServiceFromPath(pathname);
  if (!serviceId && (pathname === "/app" || pathname.startsWith("/s/"))) serviceId = "wishlist";
  if (!serviceId && !["/", "/login", "/register", "/forgot-password", "/reset-password", "/ideas"].includes(pathname) && !pathname.startsWith("/app/")) {
    serviceId = "wishlist";
  }
  if (!serviceId) return null;
  const service = serviceId === "rolls"
      ? ROLLS_SERVICE
    : serviceId === "planning"
      ? PLANNING_SERVICE
    : SERVICE_SWITCHER_ITEMS.find((item) => item.id === serviceId);
  return service ? { ...service, tabs: SERVICE_TABS[serviceId] || [] } : null;
}

export function isAssistantPath(pathname) {
  return pathname.replace(/\/$/, "").toLowerCase() === APP_ASSISTANT_PATH;
}

export function messagesHostPath(user) {
  return user.accountType === "business"
    ? publicSpacePath(user, user.sellerSpace || "products")
    : APP_HOME;
}

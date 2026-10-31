import { WISHLIST_SPACE_IDS } from "./wishlist-business.js";
import { canonicalSphereSection, isSphereSection, SPHERE_SECTIONS } from "./sphere-sharing.js";

export const BUSINESS_CATEGORIES = [
  { id: "psychologist-coach", label: "Психолог / Коуч", sphere: "identity", sphereLabel: "Идентичность" },
  { id: "doctor", label: "Доктор", sphere: "health", sphereLabel: "Здоровье" },
  { id: "seller", label: "Продавец", sphere: "wishlist", sphereLabel: "Вишлист" },
  { id: "teacher", label: "Преподаватель", sphere: "education", sphereLabel: "Образование" },
  { id: "career-consultant", label: "Карьерный консультант", sphere: "career", sphereLabel: "Карьера" },
];

export const BUSINESS_CATEGORY_IDS = BUSINESS_CATEGORIES.map(({ id }) => id);

export function businessCategoryFor(account) {
  return BUSINESS_CATEGORIES.find(({ id }) => id === (account?.businessCategory ?? account?.business_category)) || null;
}

export function businessCategoryForSection(sphere, section) {
  if (!isSphereSection(sphere, section)) return null;
  return BUSINESS_CATEGORIES.find((category) => category.sphere === canonicalSphereSection(sphere, section).sphere) || null;
}

export function canBusinessAccessSection(account, sphere, section) {
  if ((account?.accountType ?? account?.account_type) !== "business" || !isSphereSection(sphere, section)) return false;
  const categoryId = account.businessCategory ?? account.business_category;
  // Existing business accounts keep their consent-based grants. Registration
  // requires a category for every new business account; unknown IDs fail closed.
  if (categoryId == null) return true;
  const sellerSpace = account.sellerSpace ?? account.seller_space;
  if (categoryId === "seller" && sellerSpace && (!WISHLIST_SPACE_IDS.includes(sellerSpace) || (section !== sellerSpace && section !== "wishlist"))) return false;
  return businessCategoryFor(account)?.sphere === canonicalSphereSection(sphere, section).sphere;
}

export function businessRequestSpheres(account) {
  return BUSINESS_CATEGORIES.filter(({ sphere }) => canBusinessAccessSection(account, sphere, sphere === "wishlist" ? (account.sellerSpace ?? account.seller_space ?? "products") : SPHERE_SECTIONS[sphere][0]))
    .map(({ sphere, sphereLabel }) => ({ id: sphere, label: sphereLabel }));
}

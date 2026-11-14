import { Link } from "react-router-dom";
import { businessCategoryFor } from "../../shared/business-accounts.js";
import { SPHERE_SECTION_LABELS, sphereSectionPath } from "../../shared/sphere-sharing.js";
import { Button, buttonVariants } from "@/components/ui/button";

export function BusinessClientAccessActions({ account, person, sections, onRequest }) {
  const fixedSellerSpace = businessCategoryFor(account)?.id === "seller" ? account.sellerSpace : null;
  const exactSellerGrant = fixedSellerSpace && sections.some(
    ({ sphere, section }) => sphere === "wishlist" && section === fixedSellerSpace,
  );
  const fullWishlistGrant = sections.some(({ sphere, section }) => sphere === "wishlist" && section === "wishlist");
  const alreadyGranted = fixedSellerSpace && (exactSellerGrant || fullWishlistGrant);
  const visibleSections = exactSellerGrant
    ? sections.filter(({ sphere, section }) => sphere !== "wishlist" || section !== "wishlist")
    : sections;

  return (
    <>
      {!alreadyGranted && (
        <Button type="button" variant="outline" onClick={onRequest}>
          <span>{sections.length ? "Запросить ещё" : "Запросить доступ"}</span>
        </Button>
      )}
      {sections.length > 0 && (
        <nav className="business-access-person__grants" aria-label={`Доступные разделы пользователя ${person.name}`}>
          <small className="business-access-card__caption">Доступ уже открыт</small>
          <div>
            {visibleSections.map(({ sphere, section }) => {
              const target = sphere === "wishlist" && section === "wishlist" && fixedSellerSpace ? fixedSellerSpace : section;
              return (
                <Link
                  key={`${sphere}:${section}`}
                  to={sphereSectionPath({ ownerUsername: person.username, sphere, section: target })}
                  data-slot="button"
                  className={buttonVariants({ variant: "outline" })}
                >
                  <span>{SPHERE_SECTION_LABELS[target] || target}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}

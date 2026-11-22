import { useSearchParams } from "react-router-dom";
import { PersonalOffers } from "@/components/personal-offers";
import { useSession } from "../auth/session.jsx";
import { wishlistSpace } from "./wishlist-business.jsx";

export function WishlistOffersRoute() {
  const { user } = useSession();
  const [search] = useSearchParams();
  const space = wishlistSpace(search);

  return <section className="app-page app-page--collection page-stack rollapp-body" aria-label="Предложения Вишлиста">
    <PersonalOffers key={`${user.id}:${space}`} user={user} wishlistSpace={space} />
  </section>;
}

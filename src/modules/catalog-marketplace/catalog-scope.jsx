import { wishlistSpace } from "@/modules/wishlist/wishlist-business.jsx";
import { isBrandCatalogSearch } from "../../../shared/modules/catalog-marketplace/catalog-links.js";
import { useLocation } from "react-router-dom";
import { BusinessCatalogProvider } from "@/modules/catalog-marketplace/catalog-brands.jsx";
import { APP_WISH_CATALOG_PATH } from "../shell/app-routing.js";
import { useSession } from "../auth/session.jsx";

export function CatalogBusinessDirectoryScope({ children }) {
  const { pathname, search } = useLocation();
  const { user } = useSession();
  const space = user && pathname === APP_WISH_CATALOG_PATH && isBrandCatalogSearch(search) ? wishlistSpace(search) : null;
  return <BusinessCatalogProvider space={space}>{children}</BusinessCatalogProvider>;
}

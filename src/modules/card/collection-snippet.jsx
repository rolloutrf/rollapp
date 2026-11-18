import { cn } from "@/lib/utils";
import { CollectionSnippetGraphic } from "./collection-snippet-media.jsx";
import { WishlistSnippet } from "./wishlist-snippet.jsx";

// Education and health supply their own metadata and actions to the Wishlist item.
export function CollectionSnippet({ title, media, openButton, status, menu, children }) {
  return <WishlistSnippet
    className="collection-snippet h-full"
    title={title}
    mediaClassName="collection-snippet__media"
    mediaContent={<CollectionSnippetGraphic {...media} />}
    mediaBadge={status}
    openButton={openButton && {
      ...openButton,
      className: cn("collection-snippet__open touch-pan-y", openButton.className),
    }}
    menu={menu && <div className="wish-card__menu-trigger" data-slot="card-action">{menu}</div>}
    details={children}
  />;
}

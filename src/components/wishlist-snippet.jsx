import { useState } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import "./wishlist-snippet.css";

function SnippetImage({ src, fallbackSrc, alt, loading, icon: Icon }) {
  const [failedSources, setFailedSources] = useState([]);
  const imageUrl = [src, fallbackSrc].find((url) => url && !failedSources.includes(url));
  return imageUrl ? (
    <img
      key={imageUrl}
      src={imageUrl}
      alt={alt}
      loading={loading}
      draggable={false}
      referrerPolicy="strict-origin-when-cross-origin"
      onError={() => setFailedSources((current) => [...current, imageUrl])}
    />
  ) : (
    <span className="wish-card__placeholder" aria-hidden="true"><Icon size={36} /></span>
  );
}

export function WishlistSnippet({
  title,
  price,
  imageUrl,
  fallbackImageUrl,
  imageAlt = "",
  imageLoading,
  icon = Gift,
  video = false,
  openButton,
  mediaBadge,
  mediaAction,
  menu,
  beforeMedia,
  address,
  details,
  className,
  ...props
}) {
  return (
    <Card
      {...props}
      data-wishlist-snippet
      data-not-typeset
      className={cn(
        "wish-card gap-0 overflow-visible rounded-none border-0 bg-transparent py-0 shadow-none ring-0",
        video && "wish-card--video",
        className,
      )}
    >
      {openButton && <Button {...openButton} type="button" variant="ghost" className="wish-card__open absolute inset-0 z-[2] h-full w-full min-w-0 rounded-[inherit] border-0 bg-transparent p-0 hover:bg-transparent dark:hover:bg-transparent active:translate-y-0" />}
      {beforeMedia}
      <div className="wish-card__image">
        <SnippetImage
          key={JSON.stringify([imageUrl, fallbackImageUrl])}
          src={imageUrl}
          fallbackSrc={fallbackImageUrl}
          alt={imageAlt}
          loading={imageLoading}
          icon={icon}
        />
        {mediaBadge && <div className="wish-card__media-badge">{mediaBadge}</div>}
        {mediaAction && <div className="wish-card__media-action">{mediaAction}</div>}
      </div>
      <div className="wish-card__body">
        <div className="wish-card__top">
          {price != null && price !== "" && <span>{price}</span>}
          {menu}
        </div>
        <h3 className="wish-card__title" title={title}>{title}</h3>
        {address && <p className="wish-card__place-address">{address}</p>}
        {details && <div className="wish-card__details">{details}</div>}
      </div>
    </Card>
  );
}

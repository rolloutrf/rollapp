import { ArrowUpRight, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import "./gift-certificate.css";

export function giftCertificateReference(id) {
  return id.slice(-6).toUpperCase();
}

export function GiftCertificate({ card, business: previewBusiness, onOpen }) {
  const business = card?.business ?? previewBusiness;
  const reference = card ? giftCertificateReference(card.id) : null;
  const face = <>
    <span className="gift-certificate__kind"><Gift aria-hidden="true" /> Подарочный сертификат</span>
    {onOpen && <ArrowUpRight aria-hidden="true" className="gift-certificate__arrow" />}
    <span className="gift-certificate__issuer text-xl">{business.name}</span>
    {card ? <>
      <span className="gift-certificate__balance"><span>Остаток</span><strong className="text-2xl">{formatRolls(card.balance)}</strong></span>
      <span className="gift-certificate__reference">
        <span className="sr-only">Номер заканчивается на </span>
        <span aria-hidden="true">··· </span>{reference}
      </span>
    </> : <span className="gift-certificate__balance"><span>Предпросмотр</span></span>}
  </>;
  return onOpen
    ? <Button type="button" variant="ghost" className="gift-certificate" onClick={onOpen}
      aria-description="Открыть сертификат">{face}</Button>
    : <article className="gift-certificate" aria-label={card
      ? `Сертификат: ${business.name}, номер заканчивается на ${reference}`
      : `Предпросмотр сертификата · ${business.name}`}>{face}</article>;
}

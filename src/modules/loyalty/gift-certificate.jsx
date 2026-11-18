import { ArrowUpRight, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import "./gift-certificate.css";

export function GiftCertificate({ card, onOpen }) {
  const reference = card.id.slice(-6).toUpperCase();
  const balance = formatRolls(card.balance);
  const face = <>
    <span className="gift-certificate__kind"><Gift aria-hidden="true" /> Подарочный сертификат</span>
    {onOpen && <ArrowUpRight aria-hidden="true" className="gift-certificate__arrow" />}
    <span className="gift-certificate__issuer text-xl">{card.business.name}</span>
    <span className="gift-certificate__balance"><span>Остаток</span><strong className="text-2xl">{balance}</strong></span>
    <span className="gift-certificate__reference">
      <span className="sr-only">Номер заканчивается на </span>
      <span aria-hidden="true">··· </span>{reference}
    </span>
  </>;
  return onOpen
    ? <Button type="button" variant="ghost" className="gift-certificate" onClick={onOpen}
      aria-description="Открыть сертификат">{face}</Button>
    : <article className="gift-certificate" aria-label={`Сертификат: ${card.business.name}, номер заканчивается на ${reference}`}>{face}</article>;
}

import { Check, Dumbbell, FlaskConical, Gift, GraduationCap, Link2, MessagesSquare, Pill, Plus, TicketCheck, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relatedKindLabel } from "@/lib/planning-related-items";

const RELATED_ICONS = { wishlist: Gift, workout: Dumbbell, medication: Pill, "lab-result": FlaskConical, course: GraduationCap, conference: TicketCheck, coaching: MessagesSquare, contact: UserRound };

export function RelatedChoiceCard({ item, selected, onToggle, removable = false, disabled = false, preview = false }) {
  const Icon = RELATED_ICONS[item.kind] || Link2;
  const kindLabel = relatedKindLabel(item.kind);
  const info = item.priceLabel || item.snippet || kindLabel;
  return <Button variant={removable ? "destructive" : "ghost"} type="button" disabled={disabled} className={`planning-related__choice${removable ? " planning-related__choice--selected" : ""}${preview ? " planning-related__choice--preview" : ""}`} title={preview ? item.title : undefined} aria-pressed={removable ? undefined : selected} aria-label={removable ? `Убрать ${item.title}` : undefined} onClick={() => onToggle(item)}>
    <span className="planning-related__choice-media" data-kind={item.kind}>
      {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling.hidden = false; }} />}
      <Icon className="planning-related__choice-fallback" size={26} aria-hidden="true" hidden={Boolean(item.imageUrl)} />
    </span>
    {!preview && <span className="planning-related__choice-body">
      <strong className="planning-related__choice-title">{item.title}</strong>
      <span className="planning-related__choice-info">{info}</span>
      {item.kind !== "wishlist" && info !== kindLabel && <span className="planning-related__choice-kind">{kindLabel}</span>}
    </span>}
    <span className="planning-related__choice-action">{removable ? <X size={20} aria-hidden="true" /> : selected ? <Check size={20} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}</span>
  </Button>;
}

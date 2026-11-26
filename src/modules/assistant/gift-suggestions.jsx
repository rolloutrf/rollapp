import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { Link } from "react-router-dom";
import { publicProfilePath } from "../../../shared/modules/profile/profile-links.js";
import { Gift } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { participantCountLabel } from "../catalog-marketplace/wish-catalog.jsx";

export function GiftSuggestionPeople({ suggestion }) {
  if (!suggestion?.participants?.length) return null;
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Участники">
    {suggestion.participants.map((person) => <Link
      key={person.id}
      to={publicProfilePath(person)}
      className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-border bg-muted/50 py-1 pr-3 pl-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      title={`Открыть профиль ${person.name || person.username}`}
    >
      <Avatar user={person} size="sm" className="!size-8" aria-hidden="true" />
      <span className="truncate text-sm font-medium">{person.name || person.username}</span>
    </Link>)}
    {suggestion.participantCount > suggestion.participants.length && <span className="inline-flex min-h-10 items-center rounded-full bg-muted px-3 text-sm text-muted-foreground">+{suggestion.participantCount - suggestion.participants.length}</span>}
  </div>;
}

export function GiftSuggestionsPanel({ items = [], onOpenWish }) {
  if (!items.length) return null;
  return <section className="mx-auto flex w-full max-w-(--layout-collection-width) flex-col gap-4 rounded-3xl border border-border bg-card p-4 sm:p-5" aria-labelledby="gift-suggestions-title">
    <div className="flex flex-col gap-1">
      <h2 id="gift-suggestions-title" className="text-xl font-semibold">Кому это ещё подарить</h2>
      <p className="text-sm text-muted-foreground">Ваши исполненные желания сейчас есть в публичных вишлистах других участников.</p>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => <Card key={item.wishId} className="gap-3 p-3">
        <ShadcnButton data-content-control="" type="button" variant="ghost" className="h-auto min-w-0 justify-start gap-3 rounded-xl px-0 py-0 text-left hover:bg-transparent" onClick={() => onOpenWish(item.wishId)}>
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
            {item.imageUrl ? <img className="size-full object-cover" src={item.imageUrl} alt="" loading="lazy" /> : <Gift className="size-5" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <strong className="block truncate font-semibold">{item.title}</strong>
            <span className="block text-sm text-muted-foreground">Есть у {participantCountLabel(item.participantCount)}</span>
          </span>
        </ShadcnButton>
        <GiftSuggestionPeople suggestion={item} />
      </Card>)}
    </div>
  </section>;
}

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/modules/runtime/api";
import { addCalendarDays, dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";
import { localDateKey } from "../../../shared/modules/planning/planning.js";
import { formatPurchaseBudget } from "../../../shared/modules/planning/purchase-plan.js";
import { formatEventDate } from "./wish-form-data.jsx";

const checkedLabel = new Intl.DateTimeFormat("ru", { dateStyle: "short", timeStyle: "short" });
const dayLabel = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });
const unconfirmed = {
  "no-link": "Добавьте ссылку на товар в желание.",
  unavailable: "Магазин не ответил на проверку.",
  unconfirmed: "Итог с доставкой не подтверждён.",
};

export function WishNeedOffers({ id, need, plan, selectedId, onSelect, disabled }) {
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  async function compare() {
    if (checking || disabled) return;
    setChecking(true);
    setError("");
    try {
      setResult(await api.post(`/dashboard/purchase-needs/${encodeURIComponent(id)}/compare`, {}));
    } catch (cause) {
      setError(cause.message || "Не удалось проверить предложения");
    } finally {
      setChecking(false);
    }
  }

  const offersById = new Map(result?.offers.map((offer) => [offer.wishId, offer]));
  const date = result && localDateKey(new Date(result.checkedAt));
  const variants = need.variants.map((wish) => {
    const offer = offersById.get(wish.id);
    const quote = offer?.quote;
    const latest = quote?.deliveryDays && addCalendarDays(date, quote.deliveryDays.max);
    const withinBudget = quote && quote.totalMinor <= plan.budgetMinor;
    const meetsDate = need.neededBy && latest ? latest <= need.neededBy : null;
    return { wish, offer, latest, withinBudget, meetsDate };
  });
  if (result) variants.sort((left, right) => {
    const rank = ({ offer, withinBudget, meetsDate }) => !offer?.quote ? 3 : !withinBudget || meetsDate === false ? 2 : need.neededBy && meetsDate === null ? 1 : 0;
    return rank(left) - rank(right)
      || (left.offer?.quote?.totalMinor ?? Infinity) - (right.offer?.quote?.totalMinor ?? Infinity)
      || (left.offer?.quote?.deliveryDays?.max ?? Infinity) - (right.offer?.quote?.deliveryDays?.max ?? Infinity);
  });

  return <section className="grid min-w-0 gap-3" aria-label="Варианты покупки">
    {need.criteria && <p className="wrap-anywhere whitespace-pre-wrap">{need.criteria}</p>}
    {need.neededBy && <p>Получить к <time dateTime={need.neededBy}>{formatEventDate(need.neededBy)}</time></p>}
    <div className="grid gap-2">
      <h3 className="text-lg font-semibold">Варианты</h3>
      {variants.length === 0 && <p className="text-muted-foreground">Добавьте подходящие товары при редактировании потребности.</p>}
      {variants.length > 0 && <Button type="button" variant="outline" className="min-h-12 justify-self-start rounded-full" disabled={checking || disabled} onClick={compare}>
        {checking && <Spinner />}Проверить цены и доставку
      </Button>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {result && <p className="text-xs text-muted-foreground">Проверено <time dateTime={result.checkedAt}>{checkedLabel.format(new Date(result.checkedAt))}</time></p>}
    </div>
    {variants.length > 0 && <ul className="grid min-w-0 gap-2">
      {variants.map(({ wish, offer, latest, withinBudget, meetsDate }) => <li key={wish.id} className="min-w-0">
        <Card size="sm">
          <CardContent className="rollapp-body grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="min-w-0 wrap-anywhere text-lg font-semibold">{wish.title}</h4>
              {need.preferredWishId === wish.id && <Badge variant="secondary">Подошёл раньше</Badge>}
            </div>
            {offer?.quote ? <>
              <p className="wrap-anywhere tabular-nums">{formatPurchaseBudget({ minor: offer.quote.totalMinor, currency: plan.currency })} с доставкой · {offer.quote.store}</p>
              <p className="text-xs text-muted-foreground">
                {latest ? <>Доставка ориентировочно до <time dateTime={latest}>{dayLabel.format(dateFromKey(latest))}</time></> : "Срок доставки не подтверждён"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant={withinBudget ? "secondary" : "destructive"}>{withinBudget ? "В бюджете" : "Выше бюджета"}</Badge>
                {meetsDate !== null && <Badge variant={meetsDate ? "secondary" : "destructive"}>{meetsDate ? "К нужной дате" : "Позже нужной даты"}</Badge>}
              </div>
            </> : offer && <p className="text-xs text-muted-foreground">{unconfirmed[offer.status]}</p>}
            <Button type="button" variant={selectedId === wish.id ? "secondary" : "outline"} className="min-h-12 justify-self-start rounded-full"
              aria-pressed={selectedId === wish.id} aria-label={`Выбрать ${wish.title}`} disabled={disabled}
              onClick={() => onSelect(selectedId === wish.id ? "" : wish.id)}>{selectedId === wish.id ? "Выбран" : "Выбрать"}</Button>
          </CardContent>
        </Card>
      </li>)}
    </ul>}
  </section>;
}

import { Link } from "react-router-dom";
import { PageActionButton } from "@/components/page-action-button";
import { marketplaceOrderAttentionLabels } from "../../../shared/modules/history/marketplace-order-attention.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { APP_ORDERS_PATH } from "../shell/app-routing.js";

const deadline = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export function MarketplaceOrderAttention({ attention }) {
  const entries = Object.entries(marketplaceOrderAttentionLabels).flatMap(([kind, label]) => {
    const summary = attention?.find((entry) => entry.kind === kind && entry.count > 0);
    return summary ? [{ ...summary, label }] : [];
  });
  if (!entries.length) return null;

  return <section aria-label="Действия по заказам" className="grid min-w-0 gap-3 rounded-2xl border bg-card p-4">
    <header className="typeset typeset-rollapp"><h2>Действия по заказам</h2></header>
    <ul className="m-0 grid list-none gap-2 p-0">
      {entries.map(({ kind, count, amount, reviewUntil, label }) => <li key={kind} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <PageActionButton variant="outline" nativeButton={false} role="link"
          render={<Link to={`${APP_ORDERS_PATH}?attention=${kind}`} state={{ ordersFromStore: true }} />}>
          {label} · {count}
        </PageActionButton>
        {kind === "review" && reviewUntil && <span className="wrap-anywhere text-caption text-muted-foreground">
          Ближайший срок · <time dateTime={reviewUntil}>{deadline.format(new Date(reviewUntil))}</time>
        </span>}
        {kind === "claim" && <span className="wrap-anywhere text-caption text-muted-foreground">{formatRolls(BigInt(amount))}</span>}
      </li>)}
    </ul>
  </section>;
}

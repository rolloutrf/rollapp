import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { plannedPurchaseItem } from "../../../shared/modules/planning/purchase-plan.js";
import { api } from "../runtime/api.js";
import { useAsync } from "../shell/use-async.jsx";
import { WishPurchaseCare } from "./wish-purchase-care.jsx";
import { WishPurchaseCollaboration } from "./wish-purchase-collaboration.jsx";
import { WishPurchaseNeed } from "./wish-purchase-need.jsx";
import { WishPurchaseReview } from "./wish-purchase-review.jsx";
import { WishPurchaseHistory } from "./wish-purchase-history.jsx";
import { WishPurchaseSummary } from "./wish-purchase-summary.jsx";
import { WishSubscription } from "./wish-subscription.jsx";

export function WishPurchasesPanel({ viewerId, historyAction }) {
  const { data, error, loading, reload, updateData } = useAsync(() => api.get("/dashboard/purchases"), [viewerId]);
  const [dialog, setDialog] = useState(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const available = Array.isArray(data?.purchasePlans);
  const hasPriceWatches = available && data.purchasePlans.some(({ priceWatch }) => priceWatch);

  useEffect(() => {
    if (!hasPriceWatches) return undefined;
    const refresh = () => { if (!document.hidden) void reload({ background: true }).catch(() => {}); };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [hasPriceWatches, reload]);

  const close = () => setDialog(null);
  const refresh = () => { void reload({ background: true }).catch(() => {}); };
  const openReview = (plan) => setDialog({ type: "review", plan });
  const finishReview = (task, decision) => {
    const purchase = plannedPurchaseItem(task);
    const id = dialog.plan.id;
    if (decision.action === "bought") setHistoryRevision((value) => value + 1);
    updateData((current) => ({ ...current,
      ...(decision.action === "bought" || decision.action === "declined" ? {
        purchaseCollaborations: (current.purchaseCollaborations ?? []).filter((entry) => entry.id !== id),
      } : {}),
      purchasePlans: current.purchasePlans.flatMap((plan) => {
        if (plan.id !== id) return [plan];
        if (task.completed || (!purchase?.replenishment && decision.action !== "postpone")) return [];
        const { priceWatch, ...previous } = plan;
        return [{ ...previous, dueOn: task.dueOn, title: purchase?.title || plan.title,
          ...(purchase?.need && { need: purchase.need }), ...(decision.action !== "replace" && priceWatch && { priceWatch }) }];
      }),
    }));
    if (decision.action !== "replace") close();
    refresh();
  };

  const collaborationPlan = dialog?.type === "collaboration" && data?.purchasePlans?.find(({ id }) => id === dialog.entry.id);

  return <section role="region" aria-label="Покупки" data-wish-purchase-summary=""
    className="@container/purchases grid min-w-0 gap-6">
    <p className="text-muted-foreground">Планы, лимиты и траты в валюте покупки.</p>
    <WishPurchaseHistory revision={historyRevision} onOpen={(id) => setDialog({ type: "care", id })} action={historyAction} />
    {loading && <p role="status" className="flex items-center gap-2 text-muted-foreground"><Spinner />Загружаем покупки…</p>}
    {error && <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>Не удалось загрузить покупки.</span>
        <Button type="button" variant="outline" onClick={refresh}>Повторить загрузку покупок</Button>
      </AlertDescription>
    </Alert>}
    {available && <WishPurchaseSummary plans={data.purchasePlans} subscriptions={data.subscriptions} collaborations={data.purchaseCollaborations}
      onOpen={openReview}
      onEditNeed={(plan) => setDialog({ type: "need", plan })}
      onCollaborate={(entry) => setDialog({ type: "collaboration", entry })}
      onOpenSubscription={(id) => setDialog({ type: "subscription", id })} />}
    {dialog?.type === "review" && <WishPurchaseReview key={dialog.plan.id} purchase={dialog.plan} onClose={close} onSaved={finishReview} onPriceChecked={refresh} />}
    {dialog?.type === "need" && <WishPurchaseNeed key={dialog.plan.id} plan={dialog.plan} wishes={data.wishes} onClose={close} onSaved={refresh} />}
    {dialog?.type === "subscription" && <WishSubscription key={dialog.id} id={dialog.id} onClose={close} onSaved={(_, action) => {
      if (action === "paid") setHistoryRevision((value) => value + 1);
      refresh();
    }} />}
    {dialog?.type === "care" && <WishPurchaseCare key={dialog.id} purchaseId={dialog.id} onClose={close} />}
    {dialog?.type === "collaboration" && <WishPurchaseCollaboration key={dialog.entry.id} entry={dialog.entry} viewerId={viewerId}
      onClose={close} onChanged={(id, next) => updateData((current) => ({ ...current,
        purchaseCollaborations: [...(next ? [next] : []), ...(current.purchaseCollaborations ?? []).filter((item) => item.id !== id)],
      }))} onReview={collaborationPlan ? () => openReview(collaborationPlan) : undefined} />}
  </section>;
}

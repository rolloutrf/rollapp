import React, { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useSearchParams } from "react-router-dom";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { SessionContext } from "@/modules/auth/session";
import { WishCard } from "@/modules/card/wish-card";
import { MarketplaceOffers } from "@/modules/assistant/marketplace-offers.jsx";
import { PlanningDailyTodo } from "@/modules/daily-todo/planning-daily-todo";
import { RollsWallet } from "@/modules/payments/rolls-wallet.jsx";
import { PlanningSpace } from "@/modules/planning/planning-space";
import { ProfileEditorProvider } from "@/modules/profile/profile-editor";
import { ToastContext } from "@/modules/shell/toast";
import { WishPurchasePlan } from "@/modules/wishlist/wish-purchase-plan";
import { WishPurchaseReview } from "@/modules/wishlist/wish-purchase-review";
import { WishesPage } from "@/modules/wishlist/wishes-page.jsx";
import { api } from "@/modules/runtime/api.js";
import { defaultPlanningColumns } from "../../shared/modules/planning/planning.js";
import { nextReplenishmentDate, plannedPurchaseItem } from "../../shared/modules/planning/purchase-plan.js";
import { nextSubscriptionCharge, subscriptionReminderOn, subscriptionTaskId } from "../../shared/modules/planning/subscription-renewal.js";
import { EMPTY_PURCHASE_CARE, PURCHASE_CARE_LABELS, purchaseCareItem, purchaseCareTaskId } from "../../shared/modules/planning/purchase-care.js";
import "../../src/styles.css";
import "../../src/index.css";

const wish = { id: "fixture", title: "Очки для плавания", description: "Для тренировок в бассейне", url: "https://www.ozon.ru/product/goggles-123/", price: 3400, currency: "RUB", status: "active", space: "products", listIds: [] };
const guestWish = { ...wish, id: "guest", title: "Желание друга" };
const replacementWish = { ...wish, id: "replacement", title: "Фильтр для воды", url: "https://www.ozon.ru/product/filter-321/" };
const alternatives = async () => [wish, replacementWish, { ...wish, id: "eur", title: "Товар в евро", currency: "EUR" }];
const empty = { currency: "RUB", dueOn: "", budgetMinor: null };
const emptyMonth = async () => ({ totals: [], limits: [] });
const columns = defaultPlanningColumns();

function ReviewOffers({ wish: offerWish }) {
  return <MarketplaceOffers wish={offerWish} formatPrice={(amount) => `${amount} ₽`} />;
}

function Fixture() {
  useVisualViewport();
  const [search] = useSearchParams();
  const replenishmentMode = search.has("replenishment");
  const [showForm, setShowForm] = useState(false);
  const [plan, setPlan] = useState(() => replenishmentMode ? { currency: "RUB", dueOn: "2026-12-03", budgetMinor: 345050 } : empty);
  const [status, setStatus] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [reviewTask, setReviewTask] = useState(null);
  const failed = useRef(false);
  const failedPurchase = useRef(false);
  const load = useCallback(async () => ({ plan }), [plan]);
  const save = useCallback(async (_wishId, fields) => {
    setAttempts((count) => count + 1);
    if (!failed.current) { failed.current = true; throw new Error("Проверьте соединение и повторите"); }
    setPlan(fields);
    return { plan: fields };
  }, []);
  const productFor = (fields) => fields.replenishment?.wishId === replacementWish.id ? replacementWish : wish;
  const makeTask = (fields) => {
    const { title } = productFor(fields);
    return { id: "fixture-task", title: `${fields.replenishment ? "Пополнить запас" : "Пересмотреть покупку"}: ${title}`, completed: Boolean(fields.review), dueOn: fields.dueOn,
      relatedItems: [{ kind: "wishlist", id: wish.id, title, purchaseBudget: { minor: fields.budgetMinor, currency: fields.currency },
        purchaseReview: fields.review, replenishment: fields.replenishment }] };
  };
  const tasks = plan.dueOn ? [makeTask(plan)] : [];
  const loadReview = useCallback(async () => ({ wish: productFor(plan), plan, review: plan.review || null, revision: "fixture-revision" }), [plan]);
  const saveReview = useCallback(async (_id, decision) => {
    if (decision.action === "bought" && !replenishmentMode && !failedPurchase.current) {
      failedPurchase.current = true;
      throw new Error("Не удалось записать покупку");
    }
    let next;
    switch (decision.action) {
      case "postpone":
        next = { ...plan, dueOn: decision.dueOn };
        break;
      case "skip":
        next = { ...plan, dueOn: nextReplenishmentDate(plan.dueOn, plan.replenishment.intervalDays, decision.skippedOn) };
        break;
      case "replace":
        next = { ...plan, replenishment: { ...plan.replenishment, wishId: decision.wishId } };
        break;
      default:
        next = decision.intervalDays ? { ...plan, dueOn: nextReplenishmentDate(decision.purchasedOn, decision.intervalDays),
          replenishment: { intervalDays: decision.intervalDays, wishId: productFor(plan).id } }
          : { ...plan, review: { outcome: decision.action, amountMinor: decision.amountMinor } };
    }
    setPlan(next);
    return { task: makeTask(next) };
  }, [plan, replenishmentMode]);
  return <SessionContext.Provider value={{ user: { id: "owner", username: "owner" } }}><ToastContext.Provider value={setStatus}><MobileFormPages>
    <main className="app-page rollapp-body">
      {search.has("todo") ? <>
        <Link to={replenishmentMode ? "/__purchase-plan?replenishment" : "/__purchase-plan"}>Мои желания</Link>
        <PlanningDailyTodo tasks={tasks} columns={columns} onCreate={() => {}} onEdit={() => {}} onReview={setReviewTask} />
      </> : <>
        <h1>Мои желания</h1>
        <div className="wish-grid snippet-grid"><WishCard wish={wish} owner onPlanPurchase={() => setShowForm(true)} /><WishCard wish={guestWish} /></div>
        <Link to={`?todo&date=${plan.dueOn || "2026-12-03"}${replenishmentMode ? "&replenishment" : ""}`}>Открыть To Do</Link>
      </>}
      <output aria-label="Результат">{status}</output>
      <output aria-label="Попытки сохранения">{attempts}</output>
    </main>
    {showForm && <WishPurchasePlan wish={wish} onClose={() => setShowForm(false)} load={load} save={save} loadMonth={emptyMonth} />}
    {reviewTask && <WishPurchaseReview purchase={plannedPurchaseItem(reviewTask)} onClose={() => setReviewTask(null)}
      onSaved={(_task, { action }) => { if (action !== "replace") setReviewTask(null); }}
      load={loadReview} save={saveReview} alternatives={alternatives} Offers={ReviewOffers} />}
  </MobileFormPages></ToastContext.Provider></SessionContext.Provider>;
}

let summaryNeedTasks = () => [];

function SummaryFixture() {
  useVisualViewport();
  const [search] = useSearchParams();
  const viewer = search.get("collaborator") || "owner";
  const [reviewTask, setReviewTask] = useState(null);
  const [, saved] = useState(0);
  return <SessionContext.Provider value={{ user: { id: viewer, username: viewer } }}><ToastContext.Provider value={() => {}}><ProfileEditorProvider>
    <div className="app-layout app-layout--dark"><main className="app-main app-main--wishes"><MobileFormPages>
      {search.has("subscription-todo") ? <>
        <Link to="/__purchase-plan?summary">К покупкам</Link>
        <PlanningSpace />
      </> : search.has("need-todo") ? <div className="app-page">
        <Link to="/__purchase-plan?summary">К покупкам</Link>
        <PlanningDailyTodo tasks={summaryNeedTasks()} columns={columns} onCreate={() => {}} onEdit={() => {}} onReview={setReviewTask} />
        {reviewTask && <WishPurchaseReview purchase={plannedPurchaseItem(reviewTask)} onClose={() => setReviewTask(null)}
          onSaved={() => { setReviewTask(null); saved((value) => value + 1); }} />}
      </div> : <>
        {search.has("wishes") ? <>
          <WishesPage key={viewer} version={0} onAdd={() => {}} />
          <Link to="/__purchase-plan?summary">К покупкам</Link>
        </> : <>
          <RollsWallet key={viewer} user={{ id: viewer, username: viewer }} />
          <Link to="?summary&wishes">Открыть Мои желания</Link>
        </>}
        <Link to="?summary&need-todo&date=2026-12-03">Открыть задачи потребностей</Link>
        <Link to="?summary&subscription-todo&tab=todo&date=2026-12-03">Открыть основной To Do</Link>
        <Link to="?summary&collaborator=member">Сеанс участника</Link>
        <Link to="?summary&collaborator=seller">Сеанс продавца</Link>
        <Link to="?summary">Сеанс владельца</Link>
      </>}
    </MobileFormPages></main></div>
  </ProfileEditorProvider></ToastContext.Provider></SessionContext.Provider>;
}

const summaryMode = new URLSearchParams(location.search).has("summary");
if (summaryMode) {
  const records = [
    [wish.id, wish.title, "2026-12-02", "RUB", 340000],
    ["today", "Книга", "2026-12-03", "EUR", 5000],
    ["soon", "Фильтр", "2026-12-04", "RUB", 1010],
    ["end", "Расходники для домашнего фильтра с длинным названием", "2026-12-31", "RUB", 50],
    ["year", "Чемодан", "2027-01-01", "USD", 12000],
    ["old", "Полотенце", "2026-11-30", "EUR", 9990],
    ["cap", "Шапочка", null, "RUB", null],
  ];
  const wishes = records.map(([id, title, , currency]) => ({ ...wish, id, title, currency }));
  const plans = new Map(records.filter(([, , dueOn]) => dueOn).map(([id, title, dueOn, currency, minor]) => [id, { id, title, dueOn, purchaseBudget: { currency, minor } }]));
  const taskForNeed = (saved) => ({ id: `purchase-plan:${saved.id}`, title: `Пересмотреть покупку: ${saved.title}`, dueOn: saved.dueOn,
    completed: false, relatedItems: [{ ...saved, kind: "wishlist" }] });
  summaryNeedTasks = () => [...plans.values()].filter((saved) => saved.need).map(taskForNeed);
  const emptyHistory = new URLSearchParams(location.search).has("empty");
  if (emptyHistory) plans.clear();
  const history = emptyHistory ? [] : [
    { id: "latest", title: "Фильтр для воды", purchasedOn: "2026-12-02", amountMinor: 125000, budgetMinor: 100000, currency: "RUB", changeMinor: 25000 },
    { id: "foreign", title: "Куртка", purchasedOn: "2026-12-01", amountMinor: 12000, budgetMinor: 5000, currency: "EUR", changeMinor: null },
    { id: "no-amount", title: "Настольная лампа", purchasedOn: "2026-12-01", amountMinor: null, budgetMinor: 9000, currency: "GBP", changeMinor: null },
    { id: "no-budget", title: "Мыло", purchasedOn: "2026-12-01", amountMinor: 3500, currency: "CAD", changeMinor: null },
    { id: "previous", title: "Фильтр для воды", purchasedOn: "2026-11-18", amountMinor: 100000, budgetMinor: 95000, currency: "RUB", changeMinor: -5000 },
    { id: "equal", title: "Корм для кошки, упаковка на месяц", purchasedOn: "2026-11-12", amountMinor: 1500, currency: "EUR", changeMinor: 0 },
    { id: "missing", title: "Старая покупка", purchasedOn: null, amountMinor: null, currency: "RUB", changeMinor: null },
    { id: "partial-spend", title: "Мешки для пылесоса", purchasedOn: "2026-11-09", amountMinor: null, budgetMinor: 1000, currency: "RUB", changeMinor: null },
  ];
  let historyFailed = false;
  let monthFailed = !new URLSearchParams(location.search).has("month-error");
  const monthlyLimits = new Map();
  const subscriptions = new Map();
  const careRecords = new Map();
  const receipts = new Map();
  const reminders = new Map();
  const collaborations = new Map();
  const viewerId = () => new URLSearchParams(location.search).get("collaborator") || "owner";
  function collaborationView(id) {
    const record = collaborations.get(id);
    if (!record || !plans.has(id)) return null;
    const viewer = viewerId();
    if (viewer === "owner") return { ...record, role: "owner" };
    const recipient = record.recipients.find(({ id }) => id === viewer);
    if (!recipient) return null;
    if (viewer === "seller") return { id, ownerUsername: "owner", title: record.title, criteria: record.criteria, neededBy: record.neededBy,
      currency: record.currency, role: "seller", city: recipient.city, ownOffer: recipient.offer };
    return { ...record, role: "household", recipients: record.recipients.filter(({ role }) => role === "household") };
  }
  function careView(id) {
    const entry = history.find((entry) => entry.id === id);
    if (!entry) throw new Error("Покупка не найдена");
    const { care = EMPTY_PURCHASE_CARE, revision = null } = careRecords.get(id) ?? {};
    return { purchase: { ...entry, care, revision }, receipt: receipts.get(id) || null,
      reminders: [...reminders.values()].filter((task) => purchaseCareItem(task)?.id === id) };
  }
  function taskForSubscription(item) {
    const { revision, ...fields } = item;
    return { id: subscriptionTaskId("owner", item.id), title: `Пересмотреть подписку: ${item.title}`,
      dueOn: subscriptionReminderOn(item), completed: Boolean(item.stopped), relatedItems: [{ ...fields, kind: "subscription-renewal" }] };
  }

  api.get = async (path) => {
    if (path === "/rolls") return { balance: 100, transactions: [] };
    if (path === "/personal-offers") return { offers: [] };
    if (path === "/dashboard" || path === "/dashboard/purchases") return { wishes: viewerId() === "owner" ? wishes : [], lists: [], groups: [],
      purchasePlans: viewerId() === "owner" ? structuredClone([...plans.values()].reverse()) : [],
      subscriptions: viewerId() === "owner" ? [...subscriptions.values()].filter((item) => !item.stopped) : [],
      purchaseCollaborations: [...collaborations.keys()].map(collaborationView).filter(Boolean) };
    if (path.startsWith("/dashboard/purchase-collaborations/")) return { collaboration: collaborationView(path.split("/")[3]) };
    if (path === "/planning/tasks?space=main") return { tasks: [...[...subscriptions.values()].map(taskForSubscription), ...reminders.values()], columns };
    if (path.startsWith("/dashboard/subscriptions/")) return { subscription: subscriptions.get(path.split("/")[3]) };
    if (path.startsWith("/dashboard/purchase-month?")) {
      if (!monthFailed) { monthFailed = true; throw new Error("Ошибка загрузки бюджета"); }
      const monthPrefix = new URL(path, location.origin).searchParams.get("month") + "-";
      const totals = new Map();
      const openTotals = new Map();
      const totalFor = (currency) => {
        if (!totals.has(currency)) totals.set(currency, { currency, plannedMinor: 0, spentMinor: 0, purchaseCount: 0, missingBudgetCount: 0, missingAmountCount: 0 });
        return totals.get(currency);
      };
      for (const { dueOn, purchaseBudget } of plans.values()) {
        if (!dueOn.startsWith(monthPrefix)) continue;
        totalFor(purchaseBudget.currency).plannedMinor += purchaseBudget.minor;
        openTotals.set(purchaseBudget.currency, (openTotals.get(purchaseBudget.currency) || 0) + purchaseBudget.minor);
      }
      for (const { chargeOn, budgetMinor, currency, stopped } of subscriptions.values()) {
        if (stopped || !chargeOn.startsWith(monthPrefix)) continue;
        totalFor(currency).plannedMinor += budgetMinor;
        openTotals.set(currency, (openTotals.get(currency) || 0) + budgetMinor);
      }
      for (const { purchasedOn, amountMinor, budgetMinor, currency } of history) {
        if (!purchasedOn?.startsWith(monthPrefix)) continue;
        const total = totalFor(currency);
        total.purchaseCount += 1;
        if (amountMinor == null) total.missingAmountCount += 1;
        else total.spentMinor += amountMinor;
        if (budgetMinor == null) total.missingBudgetCount += 1;
        else total.plannedMinor += budgetMinor;
      }
      const limits = [...monthlyLimits.entries()].filter(([key]) => key.startsWith(monthPrefix)).map(([key, minor]) => {
        const currency = key.slice(-3);
        return { currency, minor, openMinor: openTotals.get(currency) || 0, spentMinor: totals.get(currency)?.spentMinor || 0,
          missingAmountCount: totals.get(currency)?.missingAmountCount || 0 };
      });
      return { totals: [...totals.values()].sort((left, right) => left.currency.localeCompare(right.currency)), limits };
    }
    if (path.startsWith("/dashboard/purchase-history/") && path.endsWith("/care")) return careView(decodeURIComponent(path.split("/")[3]));
    if (path.startsWith("/dashboard/purchase-history")) {
      if (!emptyHistory && !historyFailed) { historyFailed = true; throw new Error("Ошибка загрузки"); }
      const cursor = new URL(path, location.origin).searchParams.get("cursor");
      if (cursor) return { items: history.slice(history.findIndex((entry) => entry.id === cursor) + 1), nextCursor: null };
      const firstPage = history.slice(0, 3);
      return { items: firstPage, nextCursor: history.length > 3 ? firstPage.at(-1).id : null };
    }
    if (path === "/gift-suggestions") return { items: [] };
    if (path.endsWith("/marketplace-offers")) return { snapshot: null, aiConfigured: true };
    const id = path.split("/")[2];
    const entry = wishes.find((item) => item.id === id);
    const saved = plans.get(id);
    if (saved?.need && path.endsWith("/purchase-plan/review")) {
      return { wish: null, plan: { dueOn: saved.dueOn, budgetMinor: saved.purchaseBudget.minor, currency: saved.purchaseBudget.currency },
        need: { ...saved.need, variants: wishes.filter((wish) => saved.need.variantIds.includes(wish.id)) }, review: null, revision: saved.revision };
    }
    const plan = { dueOn: saved?.dueOn || "", currency: entry.currency, budgetMinor: saved?.purchaseBudget.minor ?? null,
      priceWatch: saved?.priceWatch, replenishment: saved?.replenishment };
    if (path.endsWith("/purchase-plan/review")) return { wish: entry, plan, review: null, revision: "fixture-review" };
    if (path.endsWith("/purchase-plan")) return { plan, revision: null };
    throw new Error(`Unexpected read: ${path}`);
  };
  api.post = async (path, input) => {
    if (path === "/wishes/backfill-previews") return { updated: 0 };
    if (path.startsWith("/dashboard/purchase-collaborations/")) {
      const id = path.split("/")[3];
      if (input.action === "invite") {
        const plan = plans.get(id);
        const record = collaborations.get(id) ?? { id, ownerUsername: "owner", title: plan.title, criteria: plan.need.criteria, neededBy: plan.need.neededBy,
          budgetMinor: plan.purchaseBudget.minor, currency: plan.purchaseBudget.currency, recipients: [] };
        record.recipients.push({ id: input.username, username: input.username, role: input.role, city: input.city });
        collaborations.set(id, record);
      } else {
        const record = collaborations.get(id);
        const actor = record.recipients.find(({ id }) => id === viewerId());
        switch (input.action) {
          case "claim": record.assignedTo = actor.id; break;
          case "bought": record.bought = true; break;
          case "pledge": actor.pledgeMinor = input.minor; break;
          case "offer": actor.offer = input; break;
          case "revoke": record.recipients = record.recipients.filter(({ id }) => id !== input.recipientId); break;
        }
      }
      return { collaboration: collaborationView(id) };
    }
    if (path.startsWith("/dashboard/purchase-history/")) {
      const id = decodeURIComponent(path.split("/")[3]);
      const { purchase } = careView(id);
      if (path.endsWith("/reminder")) {
        const key = purchaseCareTaskId(id, input.type);
        const task = reminders.get(key);
        if (input.revision !== task.revision) throw new Error("Напоминание изменилось");
        reminders.set(key, { ...task, completed: input.completed, revision: crypto.randomUUID() });
      } else {
        const { revision, ...care } = input;
        if (revision !== purchase.revision) throw new Error("Карточка изменилась");
        careRecords.set(id, { care, revision: crypto.randomUUID() });
        for (const [type, dueOn] of [["warranty", care.warrantyReminderOn], ["maintenance", care.maintenanceOn]]) {
          const key = purchaseCareTaskId(id, type);
          if (dueOn) reminders.set(key, { id: key, title: `${PURCHASE_CARE_LABELS[type]}: ${purchase.title}`, dueOn, completed: false, revision: crypto.randomUUID(),
            relatedItems: [{ id, title: purchase.title, type, kind: "purchase-care" }] });
          else reminders.delete(key);
        }
      }
      return careView(id);
    }
    if (path.startsWith("/dashboard/subscriptions/")) {
      const id = path.split("/")[3];
      const current = subscriptions.get(id);
      if ((current?.revision ?? null) !== input.revision) throw new Error("Подписка изменилась");
      let next;
      if (path.endsWith("/review")) {
        next = input.action === "stop" ? { ...current, stopped: true } : { ...current, chargeOn: nextSubscriptionCharge(current), trial: false };
        if (input.action === "paid") history.unshift({ id: "subscription-charge", title: current.title, purchasedOn: input.purchasedOn,
          amountMinor: input.amountMinor, budgetMinor: current.budgetMinor, currency: current.currency, purchaseType: "subscription" });
      } else {
        next = { ...input, id, anchorDay: Number(input.chargeOn.slice(-2)) };
      }
      next.revision = crypto.randomUUID();
      subscriptions.set(id, next);
      return { task: taskForSubscription(next) };
    }
    if (path === "/dashboard/purchase-month/limit") {
      const key = `${input.month}-${input.currency}`;
      if (input.minor === null) monthlyLimits.delete(key);
      else monthlyLimits.set(key, input.minor);
      return { saved: true };
    }
    if (path.startsWith("/dashboard/purchase-needs/")) {
      const id = path.split("/")[3];
      if (path.endsWith("/compare")) {
        const saved = plans.get(id);
        return { checkedAt: "2026-12-03T12:00:00.000Z", offers: saved.need.variantIds.map((wishId, index) => ({
          wishId, status: "available", quote: { totalMinor: (index + 1) * 100000, store: "example.test",
            deliveryDays: { min: index, max: index + 1 } },
        })) };
      }
      const { title, budgetMinor, dueOn, currency, revision, ...need } = input;
      if ((plans.get(id)?.revision ?? null) !== revision) throw new Error("План изменился");
      const saved = { id, title, dueOn, purchaseBudget: { currency, minor: budgetMinor }, need, revision: crypto.randomUUID() };
      plans.set(id, saved);
      return { task: taskForNeed(saved) };
    }
    const id = path.split("/")[2];
    if (path.endsWith("/price-check")) {
      const saved = plans.get(id);
      const checkedAt = "2026-12-03T12:00:00.000Z";
      const quote = { itemMinor: 70000, deliveryMinor: 5000, totalMinor: 75000, currency: "RUB", store: "www.ozon.ru", url: wish.url };
      const priceWatch = { ...saved.priceWatch, result: { status: "within_budget", checkedAt, quote }, notice: { ...quote, checkedAt } };
      plans.set(id, { ...saved, priceWatch });
      return { priceWatch };
    }
    if (path.endsWith("/purchase-plan/review")) {
      const saved = plans.get(id);
      if (saved.need && input.action === "bought") {
        const selected = wishes.find((wish) => wish.id === input.wishId);
        if (!selected || !saved.need.variantIds.includes(selected.id) || input.suited !== true) throw new Error("Проверьте выбранный вариант");
        history.unshift({ id: "need-purchase", title: selected.title, needTitle: saved.title, purchasedOn: input.purchasedOn,
          amountMinor: input.amountMinor, budgetMinor: saved.purchaseBudget.minor, currency: saved.purchaseBudget.currency, suited: input.suited });
        plans.delete(id);
        return { task: { ...taskForNeed(saved), completed: true } };
      }
      if (input.action === "bought") history.unshift({ id: "just-bought", title: saved.title, purchasedOn: input.purchasedOn,
        amountMinor: input.amountMinor, budgetMinor: saved.purchaseBudget.minor, currency: saved.purchaseBudget.currency, changeMinor: null });
      if (input.intervalDays) {
        const dueOn = nextReplenishmentDate(input.purchasedOn, input.intervalDays);
        const replenishment = { wishId: id, intervalDays: input.intervalDays };
        plans.set(id, { ...saved, dueOn, replenishment });
        wishes.find((item) => item.id === id).status = "fulfilled";
        return { task: { id: `purchase-plan:${id}`, dueOn, completed: false,
          relatedItems: [{ ...saved, kind: "wishlist", replenishment }] } };
      }
      if (input.action === "postpone") plans.set(id, { ...saved, dueOn: input.dueOn });
      else plans.delete(id);
      return { task: { id: `purchase-plan:${id}`, dueOn: input.dueOn || saved.dueOn } };
    }
    if (path.endsWith("/purchase-plan")) {
      const entry = wishes.find((item) => item.id === id);
      const priceWatch = input.priceWatchCountry ? { country: input.priceWatchCountry } : undefined;
      plans.set(id, { id, title: entry.title, dueOn: input.dueOn, purchaseBudget: { currency: input.currency, minor: input.budgetMinor }, priceWatch });
      return { plan: input };
    }
    throw new Error(`Unexpected write: ${path}`);
  };
  api.uploadPurchaseReceipt = async (id, file, version) => {
    careView(id);
    if (file.type !== "application/pdf" || (receipts.get(id)?.version ?? undefined) !== version) throw new Error("Проверьте файл чека");
    const receipt = { filename: file.name, mimeType: file.type, size: file.size, version: crypto.randomUUID() };
    receipts.set(id, receipt);
    return { receipt };
  };
  api.deletePurchaseReceipt = async (id, version) => {
    if (receipts.get(id)?.version !== version) throw new Error("Чек изменился");
    receipts.delete(id);
    return { receipt: null };
  };
}

createRoot(document.getElementById("root")).render(<BrowserRouter>{summaryMode ? <SummaryFixture /> : <Fixture />}</BrowserRouter>);

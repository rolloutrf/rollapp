import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, MoreHorizontal, Replace, RotateCcw, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { MarketplaceOffers } from "@/modules/assistant/marketplace-offers.jsx";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker";
import { api } from "@/modules/runtime/api";
import { merchantProductUrl } from "../../../shared/modules/catalog-marketplace/product-links.js";
import { localDateKey } from "../../../shared/modules/planning/planning.js";
import { formatPurchaseBudget, MAX_REPLENISHMENT_DAYS, nextReplenishmentDate, purchaseBudgetMinor, PURCHASE_REVIEW_LABELS } from "../../../shared/modules/planning/purchase-plan.js";
import { formatEventDate, WISH_CURRENCY_SYMBOLS } from "./wish-form-data.jsx";
import { PurchasePriceStatus } from "./wish-price-watch.jsx";
import { WishNeedOffers } from "./wish-need-offers.jsx";

const reviewPath = (wishId) => `/wishes/${encodeURIComponent(wishId)}/purchase-plan/review`;
const loadReview = (wishId) => api.get(reviewPath(wishId));
const saveReview = (wishId, decision) => api.post(reviewPath(wishId), decision);
const checkPrice = (wishId) => api.post(`/wishes/${encodeURIComponent(wishId)}/purchase-plan/price-check`, {});
const loadAlternatives = async () => (await api.get("/dashboard")).wishes;
const decisionLabels = { bought: "Подтвердить покупку", postpone: "Сохранить дату", declined: "Подтвердить отказ",
  skip: "Пропустить пополнение", replace: "Заменить товар" };
const compactDecisionLabels = { bought: "Подтвердить", declined: "Подтвердить", skip: "Пропустить", replace: "Заменить" };

function OfferList({ wish }) {
  return <MarketplaceOffers wish={{ ...wish, url: merchantProductUrl(wish.url), space: wish.space || "products" }} owner
    formatPrice={(amount, currency = "RUB") => formatPurchaseBudget({ minor: Math.round(amount * 100), currency })} />;
}

export function WishPurchaseReview({ purchase, onClose, onSaved, onPriceChecked, load = loadReview, save = saveReview, check = checkPrice,
  alternatives = loadAlternatives, Offers = OfferList }) {
  const id = useId();
  const [data, setData] = useState(null);
  const [retry, setRetry] = useState(0);
  const [choice, setChoice] = useState(null);
  const [amount, setAmount] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [interval, setIntervalDays] = useState(null);
  const [replacement, setReplacement] = useState("");
  const [replacementOptions, setReplacementOptions] = useState(null);
  const [needWishId, setNeedWishId] = useState(null);
  const [feedback, setFeedback] = useState("unset");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkingPrice, setCheckingPrice] = useState(false);
  const [priceError, setPriceError] = useState("");
  const active = useRef(false);
  const saving = useRef(false);
  const priceRequest = useRef(null);

  useEffect(() => {
    let current = true;
    active.current = true;
    load(purchase.id).then((result) => { if (current) setData(result); })
      .catch((cause) => { if (current) setError(cause); });
    return () => { current = false; active.current = false; };
  }, [load, purchase.id, retry]);

  const reload = () => {
    priceRequest.current = null;
    setCheckingPrice(false);
    setPriceError("");
    setError(null);
    setChoice(null);
    setData(null);
    setRetry((count) => count + 1);
  };
  const plan = data?.plan;
  const review = data?.review;
  const wish = data?.wish;
  const need = data?.need;
  const needWish = need?.variants.find(({ id }) => id === (needWishId ?? need.preferredWishId));
  const replenishment = plan?.replenishment;
  const today = localDateKey(new Date());
  const intervalDays = Number(interval);
  const invalidInterval = interval !== null && (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > MAX_REPLENISHMENT_DAYS);
  const nextDueOn = intervalDays && !invalidInterval ? nextReplenishmentDate(today, intervalDays) : null;
  const skippedDueOn = replenishment ? nextReplenishmentDate(plan.dueOn, replenishment.intervalDays, today) : null;

  useEffect(() => {
    if (choice !== "replace") return;
    let current = true;
    alternatives().then((items) => {
      if (current) setReplacementOptions(items.filter((item) => item.id !== wish?.id && item.currency === plan.currency));
    }).catch((cause) => { if (current) setError(cause); });
    return () => { current = false; };
  }, [choice, alternatives, wish?.id, plan?.currency]);

  const choose = (next) => {
    setError(null);
    setDueOn(data.plan.dueOn);
    if (next === "bought") setIntervalDays(replenishment ? String(replenishment.intervalDays) : null);
    if (next === "replace") {
      setReplacement("");
      setReplacementOptions(null);
    }
    setChoice(next);
  };
  const amountMinor = amount.trim() ? purchaseBudgetMinor(amount, { allowZero: true }) : null;
  const invalidAmount = Boolean(amount.trim()) && amountMinor === null;
  const replacementTitle = replacementOptions?.find((item) => item.id === replacement)?.title;
  const invalidChoice = (choice === "bought" && (invalidAmount || invalidInterval))
    || (choice === "postpone" && (!dueOn || dueOn === plan?.dueOn))
    || (choice === "replace" && !replacementTitle);
  const refreshPrice = async () => {
    const request = {};
    priceRequest.current = request;
    setCheckingPrice(true);
    setPriceError("");
    try {
      const { priceWatch } = await check(purchase.id);
      if (!active.current || priceRequest.current !== request) return;
      setData((current) => current?.revision === data.revision ? { ...current, plan: { ...current.plan, priceWatch } } : current);
      onPriceChecked?.();
    } catch (cause) {
      if (active.current && priceRequest.current === request) setPriceError(cause.message);
    } finally {
      if (active.current && priceRequest.current === request) setCheckingPrice(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (invalidChoice || saving.current || !data || data.review) return;
    if (!choice) { choose(data.wish || need ? "bought" : "declined"); return; }
    saving.current = true;
    setBusy(true);
    setError(null);
    const decision = { action: choice, revision: data.revision };
    if (choice === "bought") {
      decision.amountMinor = amountMinor;
      decision.purchasedOn = today;
      if (needWish) {
        decision.wishId = needWish.id;
        if (feedback !== "unset") decision.suited = feedback === "suited";
      }
      if (interval !== null) decision.intervalDays = intervalDays;
      else if (replenishment) decision.intervalDays = null;
    }
    if (choice === "postpone") decision.dueOn = dueOn;
    if (choice === "skip") decision.skippedOn = today;
    if (choice === "replace") decision.wishId = replacement;
    try {
      const result = await save(purchase.id, decision);
      if (active.current) {
        const nextDate = formatEventDate(result.task.dueOn);
        const messages = { bought: decision.intervalDays ? `Следующее пополнение ${nextDate}` : "Покупка отмечена",
          declined: "План покупки закрыт", postpone: `Покупка перенесена на ${nextDate}`,
          skip: `Следующее пополнение ${nextDate}`, replace: "Товар заменён" };
        toast.success(messages[decision.action]);
        onSaved(result.task, decision);
        if (choice === "replace") reload();
      }
    } catch (cause) {
      if (active.current) setError(cause);
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  };

  const title = need ? purchase.title : wish?.title || purchase.title;
  const budget = plan ? formatPurchaseBudget({ minor: plan.budgetMinor, currency: plan.currency }) : formatPurchaseBudget(purchase.purchaseBudget);
  return <Drawer open disablePointerDismissal={busy} onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form" aria-label="Пересмотр покупки">
      <DrawerHeader className="pr-16 text-left!">
        <DrawerTitle className="wrap-anywhere">{title}</DrawerTitle>
        <DrawerDescription>Бюджет {budget}{plan?.dueOn && ` · ${formatEventDate(plan.dueOn)}`}{replenishment && ` · Интервал ${replenishment.intervalDays} дн.`}</DrawerDescription>
      </DrawerHeader>
      <DrawerClose render={<Button type="button" variant="outline" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть"><X aria-hidden="true" /></DrawerClose>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {error && <Alert variant="destructive"><AlertDescription>{error.message || "Не удалось открыть план покупки"}</AlertDescription></Alert>}
          {error && (!data || error.status === 409) && <Button type="button" variant="outline" onClick={reload}>Обновить план</Button>}
          {!data && !error && <p className="flex items-center gap-2" role="status"><Spinner />Загружаем покупку…</p>}
          {data && !choice && <>
            {review && <p role="status">{PURCHASE_REVIEW_LABELS[review.outcome]}{review.amountMinor != null && ` · ${formatPurchaseBudget({ minor: review.amountMinor, currency: plan.currency })}`}</p>}
            {need && !review ? <>
              <WishNeedOffers key={data.revision} id={purchase.id} need={need} plan={plan} selectedId={needWish?.id} disabled={busy}
                onSelect={(id) => { setNeedWishId(id); setFeedback("unset"); }} />
              {needWish && <Offers wish={needWish} />}
            </> : wish ? <>
              {wish.description && <p className="wrap-anywhere whitespace-pre-wrap">{wish.description}</p>}
              {!review && plan.priceWatch && <PurchasePriceStatus watch={plan.priceWatch} checking={checkingPrice} error={priceError} onCheck={refreshPrice} />}
              <Offers wish={wish} />
            </> : <p>Связанное желание больше недоступно.</p>}
          </>}
          {choice === "bought" && <FieldGroup><Field>
            {need && <FieldDescription>{needWish ? `Товар: ${needWish.title}` : "Покупка по потребности"}</FieldDescription>}
            <FieldLabel htmlFor={`${id}-amount`}>Фактическая сумма, {WISH_CURRENCY_SYMBOLS[plan.currency] || plan.currency}</FieldLabel>
            <Input id={`${id}-amount`} inputMode="decimal" maxLength={12} value={amount} disabled={busy} aria-invalid={invalidAmount}
              onChange={(event) => setAmount(event.target.value)} />
            <FieldDescription>{invalidAmount ? "Введите сумму с точностью до двух знаков после запятой." : "Необязательно"}</FieldDescription>
          </Field>
            {needWish && <Field>
              <FieldLabel htmlFor={`${id}-feedback`}>Товар подошёл?</FieldLabel>
              <Select value={feedback} disabled={busy} onValueChange={setFeedback} items={[
                { value: "unset", label: "Пока не оценивать" }, { value: "suited", label: "Да, запомнить вариант" }, { value: "unsuited", label: "Нет" },
              ]}>
                <SelectTrigger id={`${id}-feedback`} className="w-full min-w-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Пока не оценивать</SelectItem>
                  <SelectItem value="suited">Да, запомнить вариант</SelectItem>
                  <SelectItem value="unsuited">Нет</SelectItem>
                </SelectContent>
              </Select>
            </Field>}
            <Field orientation="horizontal" className="min-h-12 items-center">
              <Switch id={`${id}-replenishment`} checked={interval !== null} disabled={busy} onCheckedChange={(checked) => setIntervalDays(checked ? String(replenishment?.intervalDays || 30) : null)} />
              <FieldLabel htmlFor={`${id}-replenishment`}>Регулярная покупка</FieldLabel>
            </Field>
            {interval !== null && <Field>
              <FieldLabel htmlFor={`${id}-interval`}>Интервал пополнения, дней</FieldLabel>
              <Input id={`${id}-interval`} type="number" inputMode="numeric" min={1} max={MAX_REPLENISHMENT_DAYS}
                value={interval} disabled={busy} aria-invalid={invalidInterval} onChange={(event) => setIntervalDays(event.target.value)} />
              <FieldDescription>{invalidInterval ? `Введите целое число от 1 до ${MAX_REPLENISHMENT_DAYS}.` : `Следующее пополнение ${formatEventDate(nextDueOn)}`}</FieldDescription>
            </Field>}
          </FieldGroup>}
          {choice === "postpone" && <FieldGroup><Field>
            <FieldLabel htmlFor={`${id}-review-date`}>Новая дата пересмотра</FieldLabel>
            <PlanningDatePicker id={`${id}-review-date`} label="Новая дата пересмотра" value={dueOn} onChange={setDueOn} disabled={busy} className="w-full" />
          </Field></FieldGroup>}
          {choice === "declined" && <p>Закрыть этот план покупки?</p>}
          {choice === "skip" && <p>Следующее пополнение появится в To Do {formatEventDate(skippedDueOn)}.</p>}
          {choice === "replace" && <Field>
            {!replacementOptions && !error && <p className="flex items-center gap-2" role="status"><Spinner />Загружаем желания…</p>}
            {replacementOptions?.length === 0 && <p>Добавьте в «Мои желания» другой товар с валютой {plan.currency}, чтобы выбрать его здесь.</p>}
            {replacementOptions?.length > 0 && <>
              <FieldLabel htmlFor={`${id}-replacement`}>Товар из «Моих желаний»</FieldLabel>
              <Select items={replacementOptions.map(({ id: value, title: label }) => ({ value, label }))}
                value={replacement} disabled={busy} onValueChange={setReplacement}>
                <SelectTrigger id={`${id}-replacement`} size="lg" className="w-full min-w-0" title={replacementTitle}>
                  <SelectValue className="min-w-0"><span className="truncate">{replacementTitle || "Выбрать желание"}</span></SelectValue>
                </SelectTrigger>
                <SelectContent>{replacementOptions.map((item) => <SelectItem key={item.id} value={item.id} title={item.title} className="*:first:min-w-0">
                  <span className="truncate">{item.title}</span>
                </SelectItem>)}</SelectContent>
              </Select>
              <FieldDescription>Выбранный товар появится в этом и следующих пополнениях. Дата, бюджет и интервал сохранятся.</FieldDescription>
            </>}
          </Field>}
        </div>
        {data && !review && <DrawerFooter className="gap-2">
          {choice ? <>
            <Button type="submit" variant={choice === "declined" ? "destructive" : "default"} aria-label={decisionLabels[choice]}
              disabled={busy || invalidChoice || error?.status === 409}>
              {busy && <Spinner />}
              {compactDecisionLabels[choice] ? <>
                <span className="md:hidden">{compactDecisionLabels[choice]}</span>
                <span className="hidden md:inline">{decisionLabels[choice]}</span>
              </> : decisionLabels[choice]}
            </Button>
            <Button data-control-icon type="button" variant="outline" size="icon" aria-label="Вернуться к покупке" title="Вернуться к покупке" disabled={busy} onClick={() => choose(null)}><RotateCcw aria-hidden="true" /></Button>
          </> : <>
            <Button type={replenishment && !wish && !need ? "button" : "submit"} variant={wish || replenishment || need ? "default" : "destructive"}
              onClick={replenishment && !wish && !need ? () => choose("replace") : undefined}>{wish || need ? (replenishment ? "Повторить" : "Купил") : (replenishment ? "Заменить" : "Отказаться")}</Button>
            {(wish || replenishment || need) && <DropdownMenu>
              <DropdownMenuTrigger render={<Button data-control-icon type="button" size="icon" variant="outline" className="pointer-events-auto" />} aria-label="Другие действия с покупкой"><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-(--layout-menu-width) max-w-(--available-width)">
                {replenishment ? <>
                  <DropdownMenuItem onClick={() => choose("skip")}><SkipForward aria-hidden="true" />Пропустить</DropdownMenuItem>
                  {wish && !need && <DropdownMenuItem onClick={() => choose("replace")}><Replace aria-hidden="true" />Заменить</DropdownMenuItem>}
                  {need && <DropdownMenuItem onClick={() => choose("postpone")}><CalendarDays aria-hidden="true" />Перенести</DropdownMenuItem>}
                  {(!wish || need) && <DropdownMenuItem variant="destructive" onClick={() => choose("declined")}><X aria-hidden="true" />Остановить пополнения</DropdownMenuItem>}
                </> : <>
                  <DropdownMenuItem onClick={() => choose("postpone")}><CalendarDays aria-hidden="true" />Перенести</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => choose("declined")}><X aria-hidden="true" />Отказаться</DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu>}
          </>}
        </DrawerFooter>}
      </form>
    </DrawerContent>
  </Drawer>;
}

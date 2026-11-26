import { ControlBar } from "@/components/control-bar";
import { Spinner } from "@/components/ui/spinner";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

const balanceNumber = new Intl.NumberFormat("ru-RU");

export const FINANCE_SECTIONS = [
  ["wallet", "Кошелёк"],
  ["purchases", "Покупки"],
];

export function FinanceNavigation() {
  return <ControlBar className="w-full min-w-0" data-finance-navigation="">
    <TabsList aria-label="Разделы финансов" className="grid w-full grid-cols-2 rounded-full bg-muted p-0">
      {FINANCE_SECTIONS.map(([value, label]) => <TabsTrigger key={value} value={value}
        className="min-w-0 rounded-full px-1 text-rollapp-body leading-7 after:hidden">
        {label}
      </TabsTrigger>)}
    </TabsList>
  </ControlBar>;
}

export function FinanceBalance({ wallet, loading, actions }) {
  const balances = wallet?.balances;
  const breakdown = balances ? [
    ["Подарочные карты", balances.giftCards],
    ["В резерве для наград", balances.reservedRewards],
    ["В резерве за покупки", balances.reservedOrders],
    ["Ожидается от продаж", balances.pendingSales],
  ].filter(([, value]) => value && value !== "0") : [];

  return <section className="finance-balance grid min-w-0 gap-4" aria-label="Баланс роллов">
    {wallet ? <div className="min-w-0 text-center" aria-live="polite" aria-atomic="true" data-rolls-balance>
      <strong className="finance-balance__amount wrap-anywhere font-heading font-semibold tabular-nums">
        {balanceNumber.format(wallet.balance)}
      </strong>
    </div> : <div className="flex min-h-12 min-w-0 items-center justify-center gap-2 text-center text-muted-foreground" role="status" data-rolls-balance>
      {loading && <Spinner />}
      <span>{loading ? "Загружаем баланс…" : "Баланс недоступен"}</span>
    </div>}
    <ControlBar className="flex min-w-0 flex-col items-center gap-2" aria-label="Действия с роллами">{actions}</ControlBar>
    {breakdown.length > 0 && <dl className="finance-balance__details grid min-w-0 gap-x-4 gap-y-3" aria-label="Роллы вне доступного баланса">
      {breakdown.map(([label, value]) => <div key={label} className="grid min-w-0 gap-1">
        <dt className="text-caption text-muted-foreground">{label}</dt>
        <dd className="wrap-anywhere font-medium tabular-nums">{formatRolls(BigInt(value))}</dd>
      </div>)}
    </dl>}
  </section>;
}

import { RollsWallet } from "@/modules/payments/rolls-wallet.jsx";
import { RollsTopup } from "@/modules/payments/rolls-topup.jsx";
import { TonTopup } from "@/modules/payments/ton-topup.jsx";
import { ROLL_STAR_PACKAGES, ROLL_STAR_TERMS, ROLL_STAR_TERMS_VERSION } from "../../shared/modules/payments/roll-stars.js";
import { Page, Scenario, owner, person, hold, fixtureError, noop } from "../support.jsx";
import { ledgerReceipts, wallet } from "../samples.js";

export default { id: "rollapp-payments", title: "РОЛЛАПП/Модули РОЛЛАУТ/08 Платежи" };

function Wallet({ state, topup }) {
  const rejected = () => { throw fixtureError("Не удалось получить данные. Попробуйте снова."); };
  const routes = {
    ...ledgerReceipts,
    "GET /rolls": state === "loading" ? hold : state === "error" ? rejected : state === "zero" ? { ...wallet, balance: 0, availableBalance: 0, transactions: [] } : wallet,
    "GET /rolls/recipients": { people: [person] },
    "GET /personal-offers": { offers: [] },
    "GET /rolls/stars": { enabled: state !== "disabled", linked: true, packages: ROLL_STAR_PACKAGES,
      terms: ROLL_STAR_TERMS, termsVersion: ROLL_STAR_TERMS_VERSION, invoiceDelivery: "worker" },
    "GET /rolls/ton": { enabled: state !== "disabled", rate: 100, packages: [100, 500, 1000] },
    "GET /rolls/ton/orders": { orders: [] },
  };
  return <Scenario path="/app/rolls" routes={routes}><Page>
    {topup === "stars" ? <RollsTopup user={owner} onBack={noop} onPaid={noop} />
      : topup === "ton" ? <TonTopup userId={owner.id} wallet={null} connector={null} onPaid={noop} />
      : <RollsWallet user={owner} embedded />}
  </Page></Scenario>;
}
export const Balance = { name: "Баланс, перевод и журнал", render: Wallet, args: { state: "ready" } };
export const Zero = { ...Balance, name: "Нулевой баланс", args: { state: "zero" } };
export const Loading = { ...Balance, name: "Загрузка кошелька", args: { state: "loading" } };
export const Error = { ...Balance, name: "Ошибка кошелька", args: { state: "error" } };
export const Topup = { ...Balance, name: "Пополнение через Stars", args: { state: "ready", topup: "stars" } };
export const Ton = { ...Balance, name: "Пополнение TON · кошелёк отключён", args: { state: "ready", topup: "ton" } };
export const Disabled = { ...Balance, name: "Пополнение недоступно", args: { state: "disabled", topup: "stars" } };

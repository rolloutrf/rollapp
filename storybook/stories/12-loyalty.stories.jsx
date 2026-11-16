import { ProfileGiftCards } from "@/modules/loyalty/gift-cards.jsx";
import { withWishReward } from "@/modules/loyalty/wish-reward.jsx";
import { useToast } from "@/modules/shell/toast.jsx";
import { Button } from "@/components/ui/button";
import { Page, Scenario, owner, fixtureError, hold, noop } from "../support.jsx";
import { seller, wallet } from "../samples.js";

export default { id: "rollapp-loyalty", title: "РОЛЛАПП/Модули РОЛЛАУТ/12 Лояльность" };

function Gifts({ state }) {
  const cards = [{ id: "storybook-card-positive", balance: 250, business: seller }, { id: "storybook-card-zero", balance: 0, business: seller }];
  return <Scenario routes={{
    "GET /rolls/gift-cards": state === "loading" ? hold : state === "error" ? () => { throw fixtureError("Не удалось загрузить подарочные карты."); } : { cards: state === "empty" ? [] : cards },
    "GET /rolls": wallet,
  }}><Page title="Подарочные карты"><ProfileGiftCards user={owner} onNavigate={noop} /></Page></Scenario>;
}
function RewardButton() {
  const toast = useToast();
  return <Button onClick={() => toast(withWishReward("Желание добавлено", { amount: 50 }))}>Показать начисление за желание</Button>;
}
export const GiftCards = { name: "Подарочные карты с остатком и без", render: Gifts, args: { state: "ready" } };
export const Empty = { ...GiftCards, name: "Нет подарочных карт", args: { state: "empty" } };
export const Loading = { ...GiftCards, name: "Загрузка подарочных карт", args: { state: "loading" } };
export const Error = { ...GiftCards, name: "Ошибка подарочных карт", args: { state: "error" } };
export const Reward = { name: "Уведомление о награде", render: () => <Scenario><Page title="Награда за желание"><RewardButton /></Page></Scenario> };

export const marketplaceOrderAttentionLabels = {
  review: "Проверить покупки",
  dispute: "Открытые споры",
  fulfill: "Исполнить заказы",
  claim: "Роллы к получению",
};

export function marketplaceOrderAttentionFilter(value) {
  return Object.hasOwn(marketplaceOrderAttentionLabels, value) ? value : null;
}

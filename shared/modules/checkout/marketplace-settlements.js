export const MARKETPLACE_REVIEW_DAYS = 7;
export const MARKETPLACE_ORDER_NOTE_LIMIT = 1000;

export function marketplaceOrderActions(order, role, now) {
  switch (order.status) {
    case "reserved":
      return role === "buyer" ? ["cancel"] : role === "seller" ? ["fulfill", "refund"] : [];
    case "fulfilled": {
      const reviewOpen = now < new Date(order.review_until);
      if (role === "buyer") return reviewOpen ? ["accept", "dispute"] : ["accept"];
      if (role === "seller") return reviewOpen ? ["refund"] : ["claim", "refund"];
      return [];
    }
    case "disputed":
      if (role === "buyer") return ["accept"];
      if (role === "seller") return ["refund"];
      return role === "operator" ? ["resolve_release", "resolve_refund"] : [];
    default:
      return [];
  }
}

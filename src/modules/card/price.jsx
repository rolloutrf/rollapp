

export const formatMoney = (value, currency = "RUB") => value == null ? "" : new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

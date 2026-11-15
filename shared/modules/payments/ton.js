export const TON_MAINNET = "-239";
export const TON_TESTNET = "-3";

export function formatTon(nanotons) {
  if (typeof nanotons !== "string" || !/^\d{1,40}$/.test(nanotons)) throw new Error("Invalid TON amount");
  const value = BigInt(nanotons);
  const whole = (value / 1_000_000_000n).toLocaleString("ru-RU");
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `,${fraction}` : ""}`;
}

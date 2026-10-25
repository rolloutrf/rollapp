// Official wallet bytecode allowlist, not profile or account data.
// https://docs.ton.org/contracts/standard/wallets/history
// Verified against the independent @ton/ton constructors in the unit suite.
export const KNOWN_WALLET_CODE_HASHES = Object.freeze([
  { version: "v3r1", codeHash: "b61041a58a7980b946e8fb9e198e3c904d24799ffa36574ea4251c41a566f581", skip: 64 },
  { version: "v3r2", codeHash: "84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599", skip: 64 },
  { version: "v4r2", codeHash: "feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0", skip: 64 },
  { version: "v5r1", codeHash: "20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f", skip: 65 },
]);

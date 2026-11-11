import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../../src/api";
import { GroupDialog } from "../../src/components/group-dialog";
import { RollsWallet } from "../../src/components/rolls-wallet";
import { WishGroupHeader } from "../../src/components/wish-group-fundraiser";
import { useVisualViewport } from "../../src/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

// Isolated component fixture; no database or HTTP API is used.
const mode = new URLSearchParams(location.search).get("mode") || "owner";
const viewerId = "fixture-user";
const group = { id: `fundraising-${mode}`, title: "Часы для путешествий", space: mode === "non-product" ? "places" : "products" };
const paused = ["closed", "closed-owner"].includes(mode);
let fund = ["empty", "hidden"].includes(mode) ? null : { id: `fund-${mode}`, raised: 250, target: 1000, contributors: 2, accepting: !paused, status: paused ? "closed" : "active" };
if (["completed", "completed-owner", "card-storage"].includes(mode)) fund = { ...fund, raised: 1000, status: "completed" };
const saved = sessionStorage.getItem(`fixture:${mode}`);
if (saved) fund = JSON.parse(saved);
window.fundraisingCalls = [];
window.fundraisingReads = [];
if (["storage", "card-storage"].includes(mode)) {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key.startsWith("rollapp:group-contribution:") || (mode === "card-storage" && key.startsWith("rollapp:virtual-card-sandbox:"))) throw new DOMException("Storage unavailable");
    return original.call(this, key, value);
  };
}
const request = {
  async get(path) {
    window.fundraisingReads.push(path);
    if (mode === "loading") await new Promise(resolve => { window.releaseFundraisingRead = resolve; });
    if (mode === "error" && window.fundraisingReads.length === 1) throw new Error("Не удалось загрузить сбор");
    return { fundraiser: fund, isOwner: ["owner", "empty", "closed-owner", "completed-owner", "card-storage"].includes(mode), signedIn: mode !== "guest", balance: 500 };
  },
  async post(path, input) {
    window.fundraisingCalls.push({ path, input });
    if (!path.endsWith("contributions")) { fund = { id: "fund", raised: 0, target: input.target, contributors: 0, accepting: true, status: "active" }; return { fundraiser: fund }; }
    const previous = sessionStorage.getItem(`fixture-key:${mode}`);
    if (!previous) {
      fund = { ...fund, raised: fund.raised + input.amount, contributors: fund.contributors + 1 };
      if (fund.raised === fund.target) fund.status = "completed";
      sessionStorage.setItem(`fixture-key:${mode}`, input.idempotencyKey);
      sessionStorage.setItem(`fixture:${mode}`, JSON.stringify(fund));
      if (["lost", "lost-denied"].includes(mode)) throw new Error("Соединение прервано после отправки");
    } else if (previous !== input.idempotencyKey) throw new Error("Duplicate request key changed");
    if (mode === "lost-denied") throw Object.assign(new Error("Доступ к группе изменился"), { status: 404 });
    return { fundraiser: fund, replayed: Boolean(previous) };
  },
  async patch(path, input) {
    window.fundraisingCalls.push({ path, input });
    if (window.holdFundraisingPatch) await new Promise(resolve => { window.releaseFundraisingPatch = resolve; });
    fund = { ...fund, ...input, status: fund.raised >= input.target ? "completed" : input.accepting ? "active" : "closed" };
    return { fundraiser: fund };
  },
};
function Fixture() {
  useVisualViewport();
  const [groupOpen, setGroupOpen] = useState(true);
  return groupOpen && <GroupDialog onClose={() => setGroupOpen(false)} className="wish-group-open" aria-label="Группа часов">
    <WishGroupHeader
      group={group}
      viewerId={viewerId}
      shareToken="fixture token"
      request={request}
      description="6 желаний"
    />
    <div className="wish-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex min-w-0 flex-col gap-2"><div className="aspect-square rounded-2xl bg-muted" /><span>Часы {i + 1}</span></div>)}</div>
  </GroupDialog>;
}

api.get = async path => {
  if (path === "/rolls") return { balance: 500, transactions: [], features: {} };
  if (path === "/personal-offers") return { offers: [] };
  throw new Error(`Unexpected fixture request: ${path}`);
};

createRoot(document.getElementById("root")).render(<MemoryRouter><Routes>
  <Route path="/" element={<Fixture />} />
  <Route path="/app/rolls" element={<RollsWallet user={{ id: viewerId }} />} />
</Routes></MemoryRouter>);

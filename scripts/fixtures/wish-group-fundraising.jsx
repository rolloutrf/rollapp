import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { GroupDialog, GroupDialogHeader } from "../../src/components/group-dialog";
import { WishGroupFundraiser } from "../../src/components/wish-group-fundraiser";
import "../../src/styles.css";
import "../../src/index.css";

// Isolated component fixture; no database or HTTP API is used.
const mode = new URLSearchParams(location.search).get("mode") || "owner";
const group = { id: `fundraising-${mode}`, title: "Часы для путешествий", space: "products" };
let fund = ["empty", "hidden"].includes(mode) ? null : { id: "fund", raised: 250, target: 1000, contributors: 2, accepting: mode !== "closed", status: mode === "closed" ? "closed" : "active" };
if (mode === "completed") fund = { ...fund, raised: 1000, status: "completed" };
const saved = sessionStorage.getItem(`fixture:${mode}`);
if (saved) fund = JSON.parse(saved);
window.fundraisingCalls = [];
if (mode === "storage") {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key.startsWith("rollapp:group-contribution:")) throw new DOMException("Storage unavailable");
    return original.call(this, key, value);
  };
}
const request = {
  async get() {
    if (mode === "error") throw new Error("Не удалось загрузить сбор");
    return { fundraiser: fund, isOwner: ["owner", "empty"].includes(mode), signedIn: mode !== "guest", balance: 500 };
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
    fund = { ...fund, ...input, status: fund.raised >= input.target ? "completed" : input.accepting ? "active" : "closed" };
    return { fundraiser: fund };
  },
};
createRoot(document.getElementById("root")).render(<MemoryRouter><GroupDialog onClose={() => {}} className="wish-group-open" aria-label="Группа часов">
  <GroupDialogHeader title={group.title} description="6 желаний" />
  <WishGroupFundraiser group={group} viewerId="fixture-user" request={request} />
  <div className="wish-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex min-w-0 flex-col gap-2"><div className="aspect-square rounded-2xl bg-muted" /><span>Часы {i + 1}</span></div>)}</div>
</GroupDialog></MemoryRouter>);

import React, { useRef } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import { GlobalAppChrome, SessionContext, ToastContext, CollectionNavigationContext } from "@/App.jsx?health-smoke";
import { SphereSharingContext } from "@/lib/sphere-sharing";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { HealthTracker } from "@/components/health-tracker";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { localDateKey } from "../../shared/planning.js";
import "../../src/styles.css";
import "../../src/index.css";

function Fixture() {
  useVisualViewport();
  const search = new URLSearchParams(useLocation().search);
  const tracker = search.get("tab") || "sleep";
  const date = localDateKey(new Date());
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const entries = search.has("empty") ? [] : tracker === "sleep"
    ? [{ id: "sleep-1", date, bedtime: "23:30", wakeTime: "07:15", quality: 4, notes: "Спокойный сон" }, { id: "sleep-previous", date: localDateKey(yesterday), bedtime: "00:00", wakeTime: "07:00", quality: 3, notes: "Прошлая ночь" }]
    : [{ id: "meal-1", date, time: "12:00", mealType: "lunch", title: "Омлет и овощи", calories: 350, protein: 21.5, fat: 20, carbs: 18, notes: "Домашний обед" }];
  const fail = useRef(true);
  const nextId = useRef(0);
  const user = { canDiscoverSpheres: true, accountType: "personal" };
  return <SessionContext.Provider value={{ user }}><ToastContext.Provider value={() => {}}><CollectionNavigationContext.Provider value={{ collection: null }}><MobileFormPages>
    <GlobalAppChrome />
    <div className="app-layout app-layout--dark"><main className="app-main"><div className="app-shell-chrome-spacer" /><div className="app-page sphere-page sphere-page--tabbed typeset typeset-rollapp"><div className="sphere-page__content tabbed-sphere"><Tabs value={tracker} className="sphere-tabs"><TabsContent value={tracker} className="sphere-tabs__content"><SphereSharingContext.Provider value={{ readOnly: search.has("readonly") }}><HealthTracker tracker={tracker} initialEntries={entries} onSaveEntry={async (data, id) => { if (fail.current) { fail.current = false; throw new Error("Проверка ошибки: черновик сохранён"); } return { entry: { ...data, id: id || `new-entry-${++nextId.current}` } }; }} onDeleteEntry={async () => {}} /></SphereSharingContext.Provider></TabsContent></Tabs></div></div></main></div>
  </MobileFormPages></CollectionNavigationContext.Provider></ToastContext.Provider></SessionContext.Provider>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><Fixture /></BrowserRouter>);

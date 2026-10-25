import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PlanningCalendar } from "@/components/planning-calendar";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { Toaster } from "@/components/ui/sonner";
import "../../src/styles.css";
import "../../src/index.css";

function Fixture() {
  useVisualViewport();
  const connection = useRef({ connected: false, title: "Личный календарь" });
  const failRead = useRef(false), failWrite = useRef(false), hold = useRef(false), pending = useRef(null), revision = useRef(0);
  const [writes, setWrites] = useState([]), [created, setCreated] = useState(0);
  const transport = useMemo(() => ({
    get: async path => { if (path === "calendar-device/events") return {events: connection.current.lastSyncedAt ? [{id:"apple-device:fixture",title:"Встреча Apple",description:"Календарь устройства: Работа",dueOn:"2026-10-25",startTime:"10:17",durationMinutes:43,external:"apple-device"}] : []}; if (failRead.current) throw Error("Не удалось загрузить подключение"); return { ...connection.current }; },
    post: async (path, body) => {
      if (hold.current) await new Promise(resolve => { pending.current = resolve; });
      if (failWrite.current) throw Error("Не удалось подключить устройство");
      setWrites(rows => [...rows, { path, body }]);
      if (!connection.current.connected) connection.current = { connected: true, title: "Личный календарь", token: `test-${++revision.current}` };
      return { ...connection.current };
    },
    delete: async path => {
      if (failWrite.current) throw Error("Не удалось отключить устройство");
      setWrites(rows => [...rows, { path, method: "DELETE" }]); connection.current = { connected: false, title: "Личный календарь" };
      return { ...connection.current };
    },
  }), []);
  return <MobileFormPages>
    <div className="app-layout app-layout--dark app-layout--planning"><main className="app-main"><section className="app-page planning-space planning-space--calendar"><div className="planning-tools"><PlanningCalendar deviceSync tasks={[]} columns={[]} spaceId="personal" subscriptionTransport={transport} onEdit={() => {}} onCreate={() => setCreated(value => value + 1)} onSave={async () => { throw Error("Unexpected task mutation"); }} /></div></section></main></div>
    <button hidden data-device-sync onClick={() => { connection.current = {...connection.current,deviceName:"Mac",lastSyncedAt:"2026-10-25T10:17:00Z",eventCount:1}; }} />
    <button hidden data-fail-read onClick={() => { failRead.current = !failRead.current; }} />
    <button hidden data-fail-write onClick={() => { failWrite.current = !failWrite.current; }} />
    <button hidden data-hold onClick={() => { hold.current = true; }} />
    <button hidden data-release onClick={() => { hold.current = false; pending.current?.(); }} />
    <output hidden data-state>{JSON.stringify({ writes, created })}</output><Toaster />
  </MobileFormPages>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><Fixture /></BrowserRouter>);

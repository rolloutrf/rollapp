import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ContactEditForm, ToastContext, WishModal } from "@/App.jsx?form-actions";
import { TaskEditor } from "@/components/planning-space.jsx?drawer-smoke-export=TaskEditor";
import { MarkdownEditorDrawer } from "@/components/career-content.jsx?drawer-smoke-export=MarkdownEditorDrawer";
import { MedicationGroupDrawer } from "@/components/medications.jsx?drawer-smoke-export=MedicationGroupDrawer";
import { ConferenceDrawer } from "@/components/conferences.jsx?drawer-smoke-export=ConferenceDrawer";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/form-surface";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

const columns = [{ id: "todo", title: "Запланировано" }];
function Fixture() {
  useVisualViewport();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const close = () => setOpen(false);
  const name = new URLSearchParams(location.search).get("form");
  if (name === "medication-group") return <MedicationGroupDrawer group={{ id: "unsaved-group", title: "Витамины" }} open onOpenChange={setOpen} />;
  if (name === "conference") return <ConferenceDrawer open onOpenChange={setOpen} />;
  if (name === "wish") return <WishModal onClose={close} />;
  if (name === "contact") return <Drawer open onOpenChange={setOpen}><DrawerContent><DrawerTitle>Контакт</DrawerTitle><ContactEditForm contact={{ id: "unsaved-contact", name: "Контакт", links: [] }} /></DrawerContent></Drawer>;
  if (name === "markdown") return <MarkdownEditorDrawer content="" label="Документ" open onOpenChange={setOpen} />;
  return <TaskEditor task={{ id: "unsaved-task", title: "Задача", dueOn: "2026-10-17", startTime: "09:00", durationMinutes: 60, recurrence: { frequency: "weekly", until: "2026-12-31" } }} columns={columns} onClose={close} />;
}
createRoot(document.getElementById("root")).render(<StrictMode><BrowserRouter><ToastContext.Provider value={() => {}}><MobileFormPages><Fixture /></MobileFormPages></ToastContext.Provider></BrowserRouter></StrictMode>);

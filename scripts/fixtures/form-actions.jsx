import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ContactEditForm, ToastContext, WishModal } from "@/App.jsx?form-actions";
import { TaskEditor } from "@/components/planning-space.jsx?drawer-smoke-export=TaskEditor";
import { MarkdownEditorDrawer } from "@/components/career-content.jsx?drawer-smoke-export=MarkdownEditorDrawer";
import { MedicationGroupDrawer } from "@/components/medications.jsx?drawer-smoke-export=MedicationGroupDrawer";
import { ConferenceDrawer } from "@/components/conferences.jsx?drawer-smoke-export=ConferenceDrawer";
import { CoachingSessionDrawer } from "@/components/coaching-sessions.jsx?drawer-smoke-export=CoachingSessionDrawer";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/form-surface";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  if (name === "task-new") return <TaskEditor task={{ title: "", dueOn: "2026-10-17" }} columns={columns} onClose={close} />;
  if (name === "coaching-edit") return <CoachingSessionDrawer session={{ id: "unsaved-session", title: "Коучинг-сессия", status: "completed", format: "online", durationMinutes: 60 }} open onOpenChange={setOpen} />;
  if (name === "medication-group") return <MedicationGroupDrawer group={{ id: "unsaved-group", title: "Витамины" }} open onOpenChange={setOpen} />;
  if (name === "conference") return <ConferenceDrawer open onOpenChange={setOpen} />;
  if (name === "wish") return <WishModal onClose={close} />;
  // Match the real contact card's legacy ScrollArea and sticky-footer styles,
  // which must yield to the native page's single scroller and shared action row.
  if (name === "contact") return <Drawer open onOpenChange={setOpen}><DrawerContent className="contact-detail-drawer rollapp-body app-drawer--form"><DrawerTitle className="sr-only">Контакт</DrawerTitle><ScrollArea className="contact-detail__scroll"><ContactEditForm contact={{ id: "unsaved-contact", name: "Контакт", links: [{ label: "Ссылка", url: "https://example.com" }] }} /></ScrollArea></DrawerContent></Drawer>;
  if (name === "markdown") return <MarkdownEditorDrawer content="" label="Документ" open onOpenChange={setOpen} />;
  return <TaskEditor task={{ id: "unsaved-task", title: "Задача", dueOn: "2026-10-17", startTime: "09:00", durationMinutes: 60, recurrence: { frequency: "weekly", until: "2026-12-31" } }} columns={columns} onClose={close} />;
}
createRoot(document.getElementById("root")).render(<StrictMode><BrowserRouter><ToastContext.Provider value={() => {}}><MobileFormPages><Fixture /></MobileFormPages></ToastContext.Provider></BrowserRouter></StrictMode>);

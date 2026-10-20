import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ContactEditForm, ToastContext, WishModal } from "@/App.jsx?form-actions";
import { TaskEditor } from "@/components/planning-space.jsx?drawer-smoke-export=TaskEditor";
import { MarkdownEditorDrawer } from "@/components/career-content.jsx?drawer-smoke-export=MarkdownEditorDrawer";
import { MedicationGroupDrawer } from "@/components/medications.jsx?drawer-smoke-export=MedicationGroupDrawer";
import { ConferenceDrawer } from "@/components/conferences.jsx?drawer-smoke-export=ConferenceDrawer";
import { CoachingSessionDrawer } from "@/components/coaching-sessions.jsx?drawer-smoke-export=CoachingSessionDrawer";
import { ThesisEditor } from "@/components/theses.jsx?drawer-smoke-export=ThesisEditor";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { Drawer, DrawerContent, DrawerTitle, DrawerClose } from "@/components/form-surface";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
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
  if (name === "principle") return <ThesisEditor section="principles" mode="edit" initialValue="Текст принципа" open onOpenChange={setOpen} onDelete={async () => { throw new Error("Удаление запрещено в проверке"); }} />;
  if (name === "task-new") return <TaskEditor task={{ title: "", dueOn: "2026-10-17" }} columns={columns} onClose={close} />;
  if (name === "coaching-edit") return <CoachingSessionDrawer session={{ id: "unsaved-session", title: "Коучинг-сессия", status: "completed", format: "online", durationMinutes: 60 }} open onOpenChange={setOpen} />;
  if (name === "medication-group") return <MedicationGroupDrawer group={{ id: "unsaved-group", title: "Витамины" }} open onOpenChange={setOpen} />;
  if (name === "conference") return <ConferenceDrawer open onOpenChange={setOpen} />;
  if (name === "wish") return <WishModal onClose={close} />;
  // The real editor owns its ScrollArea and separate footer.
  if (name === "contact-photo") return <Drawer open swipeDirection="right" onOpenChange={setOpen}><DrawerContent className="contact-detail-drawer rollapp-body app-drawer--form"><DrawerTitle className="sr-only">Контакт</DrawerTitle><ContactEditForm /></DrawerContent></Drawer>;
  if (name === "contact") return <Drawer open swipeDirection="right" onOpenChange={setOpen}><DrawerContent className="contact-detail-drawer rollapp-body app-drawer--form"><DrawerTitle className="sr-only">Контакт</DrawerTitle><div className="contact-detail__toolbar flex shrink-0 justify-end px-4 pt-4 pb-2"><DrawerClose render={<Button type="button" variant="ghost" size="icon" className="contact-detail__close size-12 rounded-full" />} aria-label="Закрыть карточку контакта"><X /></DrawerClose></div><ContactEditForm contact={{ id: "unsaved-contact", name: "Контакт с длинным именем", avatarUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84'%3E%3Crect width='84' height='84' fill='%23777985'/%3E%3C/svg%3E", links: [{ label: "Ссылка", url: "https://example.com" }] }} /></DrawerContent></Drawer>;
  if (name === "markdown") return <MarkdownEditorDrawer content="" label="Документ" open onOpenChange={setOpen} />;
  return <TaskEditor task={{ id: "unsaved-task", title: "Задача", dueOn: "2026-10-17", startTime: "09:00", durationMinutes: 60, recurrence: { frequency: "weekly", until: "2026-12-31" } }} columns={columns} onClose={close} />;
}
createRoot(document.getElementById("root")).render(<StrictMode><BrowserRouter><ToastContext.Provider value={() => {}}><MobileFormPages><Fixture /></MobileFormPages></ToastContext.Provider></BrowserRouter></StrictMode>);

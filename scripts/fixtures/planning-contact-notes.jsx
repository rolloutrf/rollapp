import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TaskEditor } from "@/components/planning-space.jsx?drawer-smoke-export=TaskEditor";
import { ContactEditForm, ToastContext } from "@/App.jsx?planning-contact-notes";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { Drawer, DrawerContent, DrawerTitle, DrawerClose } from "@/components/form-surface";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";
const anna = { id: "anna", name: "Анна с длинным именем и названием компании", company: "Компания" };
function Fixture() {
  useVisualViewport();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(null);
  const searchContacts = async (search) => {
    if (search === "Ошибка") throw Error("Поиск временно недоступен");
    if (search === "Никого") return { contacts: [] };
    return { contacts: [anna, { id: "boris", name: "Борис", company: "" }] };
  };
  const contact = new URLSearchParams(location.search).has("contact");
  return <><output hidden data-saved>{JSON.stringify(saved)}</output>{open && (contact
    ? <Drawer open swipeDirection={mobile ? "down" : "right"} onOpenChange={setOpen}><DrawerContent className="contact-detail-drawer rollapp-body app-drawer--form"><DrawerTitle className="sr-only">Карточка контакта</DrawerTitle><div className="contact-detail__toolbar flex shrink-0 justify-end px-4 pt-4 pb-2"><DrawerClose render={<Button type="button" variant="ghost" size="icon" className="contact-detail__close size-12 rounded-full" />} aria-label="Закрыть карточку контакта"><X /></DrawerClose></div><ContactEditForm contact={{ id: "anna", name: anna.name, notes: "Моя личная заметка", links: [], meetingNotes: [{ id: "meeting", title: "Обсуждение планов " + "оченьдлинноеслово".repeat(8), dueOn: "2026-10-19", startTime: "10:00", description: "Договорились о следующем шаге.\nВторая строка заметки." }] }} /></DrawerContent></Drawer>
    : <TaskEditor searchContacts={searchContacts} task={{ title: "Встреча", description: "Договорились о следующем шаге.", dueOn: "2026-10-19", startTime: "10:00", durationMinutes: 60 }} columns={[{ id: "todo", title: "Запланировано" }]} onSave={async (_id, value) => { if (value.title === "Ошибка сохранения") throw Error("Не удалось сохранить встречу"); setSaved(value); }} onClose={() => setOpen(false)} />)}</>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><ToastContext.Provider value={() => {}}><MobileFormPages><Fixture /></MobileFormPages></ToastContext.Provider></BrowserRouter>);

import { useState } from "react";
import { ChevronLeft, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/modules/shell/app-shell.jsx";
import { GlobalAppChrome } from "@/modules/shell/app-chrome.jsx";
import { ControlBar } from "@/components/control-bar";
import { PageActionButton } from "@/components/page-action-button";
import { ContentPageActions } from "@/components/content-page";
import { MobileFormFooter, MobileFormScreen } from "@/components/mobile-form-pages";
import { AddFab } from "@/components/add-fab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Page, Scenario, noop } from "../support.jsx";

export default { id: "rollapp-shell", title: "РОЛЛАПП/Модули/29 Оболочка приложения" };

function Chrome({ mode, disabled }) {
  const [open, setOpen] = useState(false);
  if (mode === "navigation") return <Scenario path="/app/wishes" routes={{ "GET /sphere-access-requests": { requests: [] }, "GET /sphere-shares/incoming": { shares: [] } }}>
    <GlobalAppChrome /><AppShell wishlistChrome><section className="app-page page-stack typeset typeset-rollapp"><h1>Оболочка РОЛЛАПП</h1><p>Переключатель сфер, навигация и профиль.</p></section></AppShell>
  </Scenario>;
  return <Scenario><Page title="Панели действий">
    <ControlBar className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="icon" data-control-icon aria-label="Назад"><ChevronLeft /></Button>
      <PageActionButton onClick={() => setOpen(true)}><Pencil />Открыть форму</PageActionButton>
      <Button variant="destructive" size="icon" data-control-icon aria-label="Удалить"><Trash2 /></Button>
    </ControlBar>
    <AddFab actions={mode === "multiple" ? [
      { label: "Создать задачу", onSelect: () => setOpen(true) }, { label: "Создать список", onSelect: () => setOpen(true) },
    ] : [{ label: "Добавить", onSelect: () => setOpen(true) }]} />
    {mode === "details" && <ContentPageActions>
      <Button data-control-icon aria-label="Назад" size="icon" variant="outline"><ChevronLeft /></Button>
      <Button className="min-w-0 flex-1" onClick={() => setOpen(true)}>Открыть</Button>
      <Button data-control-icon aria-label="Ещё" size="icon" variant="outline"><MoreHorizontal /></Button>
    </ContentPageActions>}
    {open && <MobileFormScreen open onOpenChange={setOpen}><form className="app-page page-stack rollapp-body" onSubmit={event => { event.preventDefault(); setOpen(false); }}>
      <h1>Форма</h1><Input aria-label="Название" placeholder="Название" />
      <MobileFormFooter><Button type="button" variant="outline" data-control-icon aria-label="Назад" onClick={() => setOpen(false)}><ChevronLeft /></Button>
        <Button type="submit" className="flex-1" disabled={disabled}>Сохранить</Button>
        <Button type="button" size="icon" variant="destructive" data-control-icon aria-label="Удалить" onClick={noop}><Trash2 /></Button>
      </MobileFormFooter>
    </form></MobileFormScreen>}
  </Page></Scenario>;
}

export const Navigation = { name: "Шапка и навигация", render: Chrome, args: { mode: "navigation" } };
export const Bars = { name: "ControlBar и нативная форма", render: Chrome, args: { mode: "single", disabled: false } };
export const Multiple = { ...Bars, name: "AddFab с несколькими действиями", args: { mode: "multiple", disabled: false } };
export const Detail = { ...Bars, name: "Панель действий деталей", args: { mode: "details", disabled: false } };
export const Disabled = { ...Bars, name: "Форма с заблокированным сохранением", args: { mode: "single", disabled: true } };

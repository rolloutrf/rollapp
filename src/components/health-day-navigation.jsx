import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { PlanningDayRibbon } from "@/components/planning-day-ribbon";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { addCalendarDays, dateFromKey } from "../../shared/planning-calendar.js";
import "./planning-daily-todo.css";

const compactDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" });

export function HealthDayNavigation({ selected, today, onDateChange, label, addLabel, onAdd, dayStatus }) {
  const mobile = useIsMobile();
  if (!mobile) return <PlanningDayRibbon selected={selected} today={today} onChange={onDateChange} dayStatus={dayStatus} />;

  return <ControlBar role="group" className={`daily-todo__toolbar${onAdd ? "" : " health-day-navigation--readonly"}`} aria-label={label}>
    <Button data-control-icon variant="outline" size="icon" aria-label="Предыдущий день" onClick={() => onDateChange(addCalendarDays(selected, -1))}><ChevronLeft /></Button>
    <PlanningDatePicker value={selected} onChange={onDateChange} label={label} className="min-w-0 w-full"><span className="truncate">{compactDate.format(dateFromKey(selected))}</span></PlanningDatePicker>
    <Button data-control-icon variant="outline" size="icon" aria-label="Следующий день" onClick={() => onDateChange(addCalendarDays(selected, 1))}><ChevronRight /></Button>
    {onAdd && <Button data-control-icon variant="outline" size="icon" aria-label={addLabel} onClick={onAdd}><Plus /></Button>}
  </ControlBar>;
}

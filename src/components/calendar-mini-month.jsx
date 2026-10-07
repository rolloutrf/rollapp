import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDays, localDateKey } from "../../shared/planning.js";
import { dateFromKey, shiftCalendarDate } from "../../shared/planning-calendar.js";

export function MiniMonth({ month, selected, today, tasks, onSelect, onMonthChange, onOpenMonth, compact = false }) {
  const days = calendarDays(dateFromKey(month));
  const formatted = new Intl.DateTimeFormat("ru-RU", onOpenMonth ? { month: "long" } : { month: "long", year: "numeric" }).format(dateFromKey(month));
  const title = formatted[0].toLocaleUpperCase("ru") + formatted.slice(1);
  return <section className="schedule-mini" aria-label={title}>
    {!compact && <header className="schedule-mini__header">
      {onMonthChange && <Button variant="ghost" size="icon" aria-label="Предыдущий месяц мини-календаря" onClick={() => onMonthChange(shiftCalendarDate(month, "month", -1))}><ChevronLeft /></Button>}
      {onOpenMonth ? <Button variant="ghost" className="schedule-mini__title" onClick={() => onOpenMonth(month)}>{title}</Button> : <h3 className="schedule-caption font-semibold">{title}</h3>}
      {onMonthChange && <Button variant="ghost" size="icon" aria-label="Следующий месяц мини-календаря" onClick={() => onMonthChange(shiftCalendarDate(month, "month", 1))}><ChevronRight /></Button>}
    </header>}
    <div className="schedule-mini__grid"><div className="schedule-mini__week" aria-hidden="true">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day, index) => <span key={index}>{day}</span>)}</div>
      {days.map((date) => {
        const key = localDateKey(date); const outside = key.slice(0, 7) !== month.slice(0, 7);
        return <Button variant="ghost" key={key} className="schedule-mini__day" data-outside={outside || undefined} data-today={!outside && key === today || undefined} data-has-events={tasks.some((task) => task.dueOn === key) || undefined} aria-pressed={!outside && key === selected} aria-current={key === today ? "date" : undefined} aria-label={new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date)} onClick={() => onSelect(key)}>{date.getDate()}</Button>;
      })}
    </div>
  </section>;
}

import { useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { addCalendarDays, dateFromKey } from "../../shared/planning-calendar.js";
const dateLabel = key => new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateFromKey(key)).replace(/^./u, letter => letter.toUpperCase());
const weekdayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long" });

export function PlanningDayRibbon({ selected, today, onChange }) {
  const ribbon = useRef(null);
  const focusSelection = useRef(false);
  const dates = Array.from({ length: 63 }, (_, index) => addCalendarDays(selected, index - 31));

  useLayoutEffect(() => {
    const element = ribbon.current;
    const active = element.querySelector('[aria-pressed="true"]');
    const center = () => {
      element.scrollLeft += active.getBoundingClientRect().left - element.getBoundingClientRect().left - (element.clientWidth - active.offsetWidth) / 2;
    };
    center();
    if (focusSelection.current) {
      active.focus({ preventScroll: true });
      focusSelection.current = false;
    }
    const observer = new ResizeObserver(center);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selected]);

  const navigate = (event) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 }[event.key];
    if (offset === undefined && event.key !== "Home") return;
    event.preventDefault();
    focusSelection.current = true;
    onChange(event.key === "Home" ? today : addCalendarDays(selected, offset));
  };

  return <header className="daily-todo__header">
    <h2 className="sr-only" aria-live="polite">{dateLabel(selected)}</h2>
    <div ref={ribbon} className="daily-todo__ribbon" role="group" aria-label="Выбрать день. Стрелки — соседний день, Home — сегодня." onKeyDown={navigate}>
      {dates.map((date) => <Button key={date} variant="ghost" data-list-tile="" className="daily-todo__day" aria-label={dateLabel(date)} aria-pressed={date === selected} aria-current={date === today ? "date" : undefined} tabIndex={date === selected ? 0 : -1} onClick={() => onChange(date)}>
        <span data-slot="list-tile-label" aria-hidden="true">{weekdayLabel.format(dateFromKey(date)).replace(/^./u, (letter) => letter.toUpperCase())}, {monthLabel.format(dateFromKey(date))}</span>
        <span data-slot="list-tile-meta" aria-hidden="true"><span data-slot="list-tile-count">{dateFromKey(date).getDate()}</span></span>
      </Button>)}
    </div>
  </header>;
}


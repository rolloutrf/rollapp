import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { MobileFormScreen } from "@/components/mobile-form-pages";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { dateFromKey } from "../../shared/planning-calendar.js";
import { isPlanningDate, localDateKey } from "../../shared/planning.js";

const formatDate = (date) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);

// DayPicker's default caption dropdowns are native selects. Compose our shared
// shadcn Select here, leaving the upstream Calendar primitive unchanged.
function CalendarDropdown({ options = [], value, onChange, disabled, "aria-label": label }) {
  return <Select value={String(value)} disabled={disabled} onValueChange={(next) => {
    if (next !== null) onChange?.({ target: { value: next } });
  }}>
    <SelectTrigger aria-label={label} className="min-w-0 flex-1">
      <SelectValue>{options.find((option) => String(option.value) === String(value))?.label}</SelectValue>
    </SelectTrigger>
    <SelectContent alignItemWithTrigger={false} className="not-typeset rollapp-body max-h-60 max-w-(--available-width)">
      <SelectGroup>{options.map((option) => <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectGroup>
    </SelectContent>
  </Select>;
}

const calendarComponents = { Dropdown: CalendarDropdown };
const calendarLabels = {
  labelMonthDropdown: () => "Месяц",
  labelYearDropdown: () => "Год",
};
const calendarClassNames = {
  months: "relative flex flex-col gap-4",
  month_caption: "flex min-h-12 w-full items-center justify-center",
  dropdowns: "flex w-full min-w-0 items-center gap-2",
};

export function PlanningDatePicker({ id, value, onChange, label = "Перейти к дате", clearable = false, disabled = false, min, max, "aria-invalid": ariaInvalid, className = "", children }) {
  const [open, setOpen] = useState(false);
  const pendingSelection = useRef(null);
  const mobile = useIsMobile();
  const date = isPlanningDate(value) ? dateFromKey(value) : undefined;
  const minimum = isPlanningDate(min) ? min : "";
  const maximum = isPlanningDate(max) ? max : "";
  const allowed = key => !disabled && (key === "" || (isPlanningDate(key) && (!minimum || key >= minimum) && (!maximum || key <= maximum)));
  useEffect(() => {
    if (disabled) { pendingSelection.current = null; setOpen(false); }
  }, [disabled]);
  const accessibleLabel = `${label}: ${date ? formatDate(date) : "не выбрана"}`;
  const select = (key) => {
    if (!allowed(key)) return;
    if (mobile) pendingSelection.current = key;
    else onChange(key);
    setOpen(false);
  };
  const content = <>
      <Calendar mode="single" hideNavigation required selected={date} defaultMonth={date} disabled={disabled ? true : [...(minimum ? [{ before: dateFromKey(minimum) }] : []), ...(maximum ? [{ after: dateFromKey(maximum) }] : [])]} onSelect={(next) => { if (next) select(localDateKey(next)); }} locale={ru} weekStartsOn={1} captionLayout="dropdown" components={calendarComponents} labels={calendarLabels} classNames={mobile ? { ...calendarClassNames, root: "w-full" } : calendarClassNames} startMonth={new Date(1900, 0, 1)} endMonth={maximum ? dateFromKey(maximum) : new Date(2100, 11, 1)} className={mobile ? "planning-date-page__calendar" : "[--cell-size:2.5rem] max-[380px]:[--cell-size:2.25rem]"} />
      {clearable && value && <div className="p-2"><Button type="button" variant="ghost" className="w-full justify-center" onClick={() => select("")}>Очистить дату</Button></div>}
    </>;
  const button = <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={ariaInvalid} className={`rounded-full ${className}`} aria-label={accessibleLabel} />;
  const buttonContent = children ?? <><span>{date ? formatDate(date) : "Выберите дату"}</span><CalendarDays aria-hidden="true" /></>;
  if (mobile) return <>
    <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={ariaInvalid} className={`rounded-full ${className}`} aria-label={accessibleLabel} onClick={() => { pendingSelection.current = null; setOpen(true); }}>{buttonContent}</Button>
    <MobileFormScreen open={open} onOpenChange={setOpen} onAfterClose={() => {
      const key = pendingSelection.current;
      pendingSelection.current = null;
      if (key !== null && allowed(key)) onChange(key);
    }}>
      <section className="mobile-form-page__surface planning-date-page not-typeset" aria-label={label}>
        <header className="mobile-form-page__header"><h1 className="text-2xl font-semibold" tabIndex={-1} ref={(node) => node?.focus({ preventScroll: true })}>{label}</h1></header>
        {content}
      </section>
    </MobileFormScreen>
  </>;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={button}>{buttonContent}</PopoverTrigger>
    <PopoverContent className="not-typeset rollapp-body max-h-(--available-height) w-auto gap-0 overflow-y-auto p-0" align="start">{content}</PopoverContent>
  </Popover>;
}

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export function PlanningDatePicker({ id, value, onChange, label = "Перейти к дате", clearable = false, className = "", children }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const date = isPlanningDate(value) ? dateFromKey(value) : undefined;
  const accessibleLabel = `${label}: ${date ? formatDate(date) : "не выбрана"}`;
  const content = <>
      <Calendar mode="single" hideNavigation required selected={date} defaultMonth={date} onSelect={(next) => { if (!next) return; onChange(localDateKey(next)); setOpen(false); }} locale={ru} weekStartsOn={1} captionLayout="dropdown" components={calendarComponents} labels={calendarLabels} classNames={calendarClassNames} startMonth={new Date(1900, 0, 1)} endMonth={new Date(2100, 11, 1)} className="[--cell-size:2.5rem] max-[380px]:[--cell-size:2.25rem]" />
      {clearable && value && <div className="border-t border-border p-2"><Button type="button" variant="ghost" className="w-full justify-center" onClick={() => { onChange(""); setOpen(false); }}>Очистить дату</Button></div>}
    </>;
  const button = <Button id={id} type="button" variant="outline" className={`rounded-full ${className}`} aria-label={accessibleLabel} />;
  const buttonContent = children ?? <><span>{date ? formatDate(date) : "Выберите дату"}</span><CalendarDays aria-hidden="true" /></>;
  if (mobile) return <>
    <Button id={id} type="button" variant="outline" className={`rounded-full ${className}`} aria-label={accessibleLabel} onClick={() => setOpen(true)}>{buttonContent}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="not-typeset rollapp-body max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] w-fit gap-0 overflow-y-auto p-2">
        <DialogHeader className="px-2 pt-1 text-left"><DialogTitle>{label}</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  </>;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={button}>{buttonContent}</PopoverTrigger>
    <PopoverContent className="not-typeset rollapp-body max-h-(--available-height) w-auto gap-0 overflow-y-auto p-0" align="start">{content}</PopoverContent>
  </Popover>;
}

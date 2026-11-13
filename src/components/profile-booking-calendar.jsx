import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, Globe2, Link2, Plus, Video, X } from "lucide-react";
import { ru } from "date-fns/locale";
import { TZDate } from "react-day-picker";
import { Link, useLocation } from "react-router-dom";
import { ControlBar } from "@/components/control-bar";
import { PageActionButton } from "@/components/page-action-button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { localDateKey } from "../../shared/planning.js";
import { addCalendarDays, calendarWeek, dateFromKey, minutesTime } from "../../shared/planning-calendar.js";

const localZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeZones = [...new Set(["UTC", "Europe/Moscow", ...(Intl.supportedValuesOf?.("timeZone") ?? []), localZone])].sort();
const startTimes = Array.from({ length: 24 }, (_, index) => minutesTime(8 * 60 + index * 30));
const dayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const weekdayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const selectedDateLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long" });
const durations = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const fullDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" });

function bookingFormats(timeZone) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const clock = new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" });
  return {
    key: timestamp => {
      const parts = Object.fromEntries(day.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
      return `${parts.year}-${parts.month}-${parts.day}`;
    },
    time: timestamp => clock.format(new Date(timestamp)),
    date: day => fullDate.format(dateFromKey(day)),
  };
}

function durationOf(slot) {
  return (Date.parse(slot.endsAt) - Date.parse(slot.startsAt)) / 60_000;
}

function timeRange(slot, format) {
  const endDay = format.key(slot.endsAt);
  const endDate = format.key(slot.startsAt) !== endDay ? `${format.date(endDay)}, ` : "";
  return `${format.time(slot.startsAt)} – ${endDate}${format.time(slot.endsAt)}`;
}

function bookingTypes(slots) {
  const types = new Map();
  for (const slot of slots) {
    if (slot.bookingId) continue;
    const duration = durationOf(slot);
    const id = JSON.stringify([slot.title, duration]);
    if (!types.has(id)) types.set(id, { id, title: slot.title, duration, slots: [] });
    types.get(id).slots.push(slot);
  }
  return [...types.values()];
}

function slotsByDay(slots, format) {
  const days = new Map();
  for (const slot of slots) {
    const key = format.key(slot.startsAt);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(slot);
  }
  for (const items of days.values()) items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return days;
}

function BookingMonthNav({ previousMonth, nextMonth, onPreviousClick, onNextClick, ...props }) {
  return <ControlBar as="nav" {...props} className="booking-month-nav">
    <Button data-control-icon variant="outline" size="icon" type="button" disabled={!previousMonth} onClick={onPreviousClick} aria-label="Предыдущий месяц">
      <ChevronLeft aria-hidden="true" />
    </Button>
    <Button data-control-icon variant="outline" size="icon" type="button" disabled={!nextMonth} onClick={onNextClick} aria-label="Следующий месяц">
      <ChevronRight aria-hidden="true" />
    </Button>
  </ControlBar>;
}

const monthComponents = { Nav: BookingMonthNav };
const monthLabels = {
  labelNav: () => "Месяцы",
  labelGrid: date => date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
};

function BookingMonth({ day, onDay, days, min, max, busy }) {
  const start = min ? dateFromKey(min) : undefined;
  const end = max ? dateFromKey(max) : undefined;
  const firstAvailable = days && [...days.keys()].sort()[0];
  return <Calendar
    className="booking-month"
    locale={ru}
    labels={monthLabels}
    components={monthComponents}
    mode="single"
    required
    fixedWeeks
    showOutsideDays={false}
    defaultMonth={day || firstAvailable ? dateFromKey(day || firstAvailable) : start}
    startMonth={start}
    endMonth={end}
    today={start}
    selected={day ? dateFromKey(day) : undefined}
    disabled={date => {
      const key = localDateKey(date);
      return busy || (days ? !days.has(key) : key < min || key > max);
    }}
    modifiers={{ available: date => Boolean(days?.has(localDateKey(date))) }}
    modifiersClassNames={{ available: "booking-day-available" }}
    onSelect={date => { if (date) onDay(localDateKey(date)); }}
  />;
}

function ZonePicker({ value, onChange, disabled }) {
  const id = useId();
  return <Field>
    <FieldLabel htmlFor={id} className="flex items-center gap-2"><Globe2 className="size-4" aria-hidden="true" />Часовой пояс</FieldLabel>
    <Select value={value} onValueChange={zone => { if (zone) onChange(zone); }} disabled={disabled}>
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue>{value.replaceAll("_", " ")}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="not-typeset rollapp-body max-h-64 max-w-(--available-width)">
        <SelectGroup>{timeZones.map(zone => <SelectItem key={zone} value={zone}>{zone.replaceAll("_", " ")}</SelectItem>)}</SelectGroup>
      </SelectContent>
    </Select>
  </Field>;
}

function MeetingDetails({ profile, title, duration, slot, format, zone }) {
  return <div className="booking-panel booking-details">
    <p className="text-muted-foreground wrap-anywhere">{profile.name}</p>
    <h3 className="text-2xl font-semibold wrap-anywhere">{title}</h3>
    <ul className="booking-meta">
      {duration !== undefined && <li><Clock3 aria-hidden="true" />{duration} мин</li>}
      <li><Video aria-hidden="true" />Онлайн</li>
      {slot && <>
        <li><CalendarDays aria-hidden="true" /><span>{format.date(format.key(slot.startsAt))}<br />{timeRange(slot, format)}</span></li>
        <li><Globe2 aria-hidden="true" />{zone.replaceAll("_", " ")}</li>
      </>}
    </ul>
  </div>;
}

function StatusList({ slots, owner, format, busy, onRemove }) {
  return <div className="grid gap-2">
    {slots.map(slot => {
      const day = format.date(format.key(slot.startsAt));
      const action = slot.bookingId ? "Отменить запись" : "Убрать слот";
      return <Card key={slot.id} className="booking-status-row rollapp-body">
        <div className="grid min-w-0 gap-1 wrap-anywhere">
          <div data-typography="caption" className="text-muted-foreground first-letter:uppercase">{day} · {timeRange(slot, format)}</div>
          <h3 className="font-semibold">{slot.title}</h3>
          {slot.bookingId && <p className="text-muted-foreground">{owner ? `Записался участник: ${slot.guestName}` : "Вы записаны"}</p>}
        </div>
        <PageActionButton type="button" variant="destructive" disabled={busy} aria-label={`${action}: ${slot.title}, ${day}, ${format.time(slot.startsAt)}`} onClick={() => onRemove(slot)}>
          {action}
        </PageActionButton>
      </Card>;
    })}
  </div>;
}

function BookingPicker({ type, profile, user, loginPath, zone, setZone, format, busy, preview, booked, linkedSlot, onBook, onBack }) {
  const [selectedDay, setSelectedDay] = useState(() => linkedSlot ? format.key(linkedSlot.startsAt) : null);
  const [selectedSlot, setSelectedSlot] = useState(linkedSlot?.id ?? null);
  const [details, setDetails] = useState(Boolean(linkedSlot));
  const stepHeading = useRef(null);
  const days = useMemo(() => slotsByDay(type?.slots ?? [], format), [type?.slots, format]);
  const today = format.key(Date.now());
  const last = [...days.keys()].sort().at(-1) ?? today;
  const day = days.has(selectedDay) ? selectedDay : null;
  const slot = days.get(day)?.find(item => item.id === selectedSlot);
  const showingDetails = Boolean(details && slot);
  const showingSuccess = Boolean(booked);
  const meeting = booked || slot;

  const timeHeading = useRef(null);
  const backToTime = useRef(null);

  function changeDay(key) {
    setSelectedDay(key);
    setSelectedSlot(null);
    setDetails(false);
  }

  useEffect(() => {
    if (showingDetails || showingSuccess) stepHeading.current?.focus();
    else if (backToTime.current) {
      backToTime.current = null;
      timeHeading.current?.focus();
    }
  }, [showingDetails, showingSuccess]);

  return <Card className={cn("booking-card rollapp-body", !showingDetails && !showingSuccess && "booking-card--picker", day && "booking-card--with-times")}>
    <MeetingDetails profile={profile} title={booked?.title || type?.title || "Запись на встречу"}
      duration={booked ? durationOf(booked) : type?.duration} slot={showingDetails || showingSuccess ? meeting : null} format={format} zone={zone} />
    {showingSuccess ? <section className="booking-panel" aria-labelledby="booking-complete">
      <CircleCheck className="size-8" aria-hidden="true" />
      <h3 id="booking-complete" ref={stepHeading} tabIndex={-1} className="text-2xl font-semibold" role="status">Вы записаны на сессию</h3>
      <div><PageActionButton type="button" variant="outline" onClick={onBack}>К календарю</PageActionButton></div>
    </section> : showingDetails ? <section className="booking-panel" aria-labelledby="booking-details">
      <ControlBar className="flex">
        <Button type="button" variant="outline" size="icon" data-control-icon disabled={busy}
          aria-label="Вернуться к выбору времени" onClick={() => { backToTime.current = true; setDetails(false); }}><ArrowLeft aria-hidden="true" /></Button>
      </ControlBar>
      <h3 id="booking-details" ref={stepHeading} tabIndex={-1} className="text-2xl font-semibold">Данные участника</h3>
      {user && <dl className="grid gap-2 wrap-anywhere">
        <div><dt data-typography="label" className="text-muted-foreground">Имя</dt><dd>{user.name || user.username || "Участник Rollapp"}</dd></div>
        {user.email && <div><dt data-typography="label" className="text-muted-foreground">Электронная почта</dt><dd>{user.email}</dd></div>}
      </dl>}
      <div>
        {preview ? <p className="text-muted-foreground">Предпросмотр страницы записи</p> : user
          ? <PageActionButton type="button" disabled={busy} onClick={() => onBook(slot)}>{busy ? "Записываем…" : "Подтвердить запись"}</PageActionButton>
          : <PageActionButton nativeButton={false} role="link" render={<Link to={loginPath(slot.id, zone)} />}>Войти для записи</PageActionButton>}
      </div>
    </section> : <>
      <section className="booking-panel booking-date" aria-labelledby="booking-date">
        <h3 id="booking-date" className="text-2xl font-semibold">Выберите дату и время</h3>
        {days.size > 0 ? <BookingMonth key={zone} day={day} onDay={changeDay} days={days} min={today} max={last} busy={busy} />
          : <p className="text-muted-foreground">Сейчас нет доступных слотов.</p>}
        {days.size > 0 && <ZonePicker value={zone} onChange={next => { setZone(next); changeDay(null); }} disabled={busy} />}
      </section>
      {day && <section className="booking-panel booking-times" aria-labelledby="booking-times">
        <h3 id="booking-times" ref={timeHeading} tabIndex={-1} className="text-xl font-semibold first-letter:uppercase">{format.date(day)}</h3>
        <ul className="grid gap-2">
          {days.get(day).map(item => <li key={item.id} className={cn("booking-time-row", slot?.id === item.id && "booking-time-row--selected")}>
            <PageActionButton type="button" variant={slot?.id === item.id ? "secondary" : "outline"} aria-pressed={slot?.id === item.id}
              disabled={busy} aria-label={`Выбрать время ${format.time(item.startsAt)}`} onClick={() => { setSelectedSlot(item.id); setDetails(false); }}>
              <time dateTime={item.startsAt}>{format.time(item.startsAt)}</time>
            </PageActionButton>
            {slot?.id === item.id && <PageActionButton type="button" disabled={busy} onClick={() => setDetails(true)}>Далее</PageActionButton>}
          </li>)}
        </ul>
      </section>}
    </>}
  </Card>;
}

function HostWeek({ days, today, maxDay, onWeek, renderTimes }) {
  const first = days[0];
  const last = days.at(-1);
  return <div className="booking-host-week" data-booking-host-week="">
    <ControlBar className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-rollapp-body font-semibold">
        {dayLabel.format(dateFromKey(first))} – {dayLabel.format(dateFromKey(last))}
      </h4>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="icon" data-control-icon disabled={first <= today}
          onClick={() => onWeek(addCalendarDays(first, -7))} aria-label="Предыдущая неделя"><ChevronLeft aria-hidden="true" /></Button>
        <Button type="button" variant="outline" size="icon" data-control-icon disabled={last >= maxDay}
          onClick={() => onWeek(addCalendarDays(first, 7))} aria-label="Следующая неделя"><ChevronRight aria-hidden="true" /></Button>
      </div>
    </ControlBar>
    <div className="booking-host-week-grid">
      {days.map(key => {
        const date = dateFromKey(key);
        return <section key={key} aria-label={fullDate.format(date)} className="grid min-w-0 content-start gap-2">
          <header className="grid gap-1 border-b pb-2 text-center">
            <span data-typography="label" className="text-muted-foreground">{weekdayLabel.format(date)}</span>
            <strong>{date.getDate()}</strong>
          </header>
          {renderTimes(key, true)}
        </section>;
      })}
    </div>
  </div>;
}

function HostSlotEditor({ slots, busy, onSave, onClose }) {
  const id = useId();
  const focus = useRef(null);
  const mobile = useIsMobile();
  const [day, setDay] = useState(null);
  const [week, setWeek] = useState(null);
  const [times, setTimes] = useState([]);
  const [durationChoice, setDurationChoice] = useState("30");
  const [customDuration, setCustomDuration] = useState("30");
  const [hostZone, setHostZone] = useState(localZone);
  const duration = Number(durationChoice === "custom" ? customDuration : durationChoice);
  const validDuration = Number.isInteger(duration) && duration >= 15 && duration <= 480;
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState(false);
  const [custom, setCustom] = useState("");
  const [localError, setLocalError] = useState("");
  const requestIds = useRef(new Map());
  const format = useMemo(() => bookingFormats(hostZone), [hostZone]);
  const today = format.key(Date.now());
  const maxDay = addCalendarDays(today, 365);
  const end = start => start + duration * 60_000;
  const limit = 200 - slots.length;

  useEffect(() => { focus.current?.focus(); }, [details]);

  function timeStart(time, key = day) {
    if (!key || !time) return null;
    const [year, month, dateOfMonth] = key.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const date = new TZDate(year, month - 1, dateOfMonth, hour, minute, hostZone);
    // Local wall times skipped by a daylight-saving jump are not valid slots.
    if (!Number.isFinite(date.getTime()) || format.key(date) !== key || format.time(date) !== time) return null;
    return date.getTime();
  }

  function allowed(start, length = duration, chosen = times) {
    if (!Number.isInteger(length) || length < 15 || length > 480 || start === null || start <= Date.now() || start >= Date.now() + 365 * 86_400_000) return false;
    const finish = start + length * 60_000;
    return !slots.some(slot => Date.parse(slot.startsAt) < finish && Date.parse(slot.endsAt) > start)
      && !chosen.some(other => other !== start && other < finish && other + length * 60_000 > start);
  }

  function toggle(start) {
    setLocalError("");
    if (times.includes(start)) setTimes(items => items.filter(item => item !== start));
    else if (allowed(start) && times.length < limit) setTimes(items => [...items, start].sort((a, b) => a - b));
  }

  function reconcileDuration(next) {
    setLocalError("");
    if (times.some(start => !allowed(start, next))) {
      setTimes([]);
      setLocalError("Слоты сброшены: при новой длительности они пересекаются с другим временем.");
    }
  }

  function renderTimes(key, inWeek = false) {
    return <div className={inWeek ? "grid gap-2" : "booking-host-times"}>
      {startTimes.map(time => {
        const start = timeStart(time, key);
        const selected = times.includes(start);
        return <Button type="button" variant={selected ? "default" : "outline"} className="min-w-0 rounded-full px-2"
          aria-pressed={selected} key={time} disabled={!selected && (!allowed(start) || times.length >= limit)}
          onClick={() => toggle(start)}>{time}</Button>;
      })}
    </div>;
  }

  function addAvailable() {
    const next = [...times];
    for (const time of startTimes) {
      if (next.length >= limit) break;
      const start = timeStart(time);
      if (!next.includes(start) && allowed(start, duration, next)) next.push(start);
    }
    setTimes(next.sort((a, b) => a - b));
    setLocalError("");
  }

  function submit(event) {
    event.preventDefault();
    if (busy || !details || !validDuration || !times.length || !title.trim()) return;
    // The same payload retains its IDs when the response is lost.
    onSave(times.map(start => {
      const startsAt = new Date(start).toISOString();
      const key = JSON.stringify([startsAt, duration, title.trim()]);
      if (!requestIds.current.has(key)) requestIds.current.set(key, crypto.randomUUID());
      return { id: requestIds.current.get(key), title: title.trim(), startsAt, duration };
    }));
  }

  const weekDays = useMemo(() => calendarWeek(week || today), [week, today]);
  const customTime = <Field>
    <FieldLabel htmlFor={`${id}-time`}>Другое время</FieldLabel>
    <div className="flex min-w-0 gap-2">
      <Input id={`${id}-time`} className="min-w-0 flex-1" type="time" value={custom} onChange={event => setCustom(event.target.value)} />
      <ControlBar className="shrink-0">
        <Button type="button" variant="outline" size="icon" data-control-icon aria-label="Добавить выбранное время"
          disabled={!custom || !validDuration || times.length >= limit} onClick={() => {
            const start = timeStart(custom);
            if (!allowed(start) || times.includes(start)) setLocalError("Это время недоступно или уже выбрано.");
            else { toggle(start); setCustom(""); }
          }}><Plus aria-hidden="true" /></Button>
      </ControlBar>
    </div>
  </Field>;

  return <Card className="booking-card booking-card--host rollapp-body" data-host-slot-editor="">
    <aside className="booking-panel booking-details">
      <h3 className="text-2xl font-semibold">Новая встреча</h3>
      <Field>
        <FieldLabel htmlFor={`${id}-duration`}>Длительность</FieldLabel>
        <Select value={durationChoice} onValueChange={value => {
          if (!value) return;
          setDurationChoice(value);
          reconcileDuration(Number(value === "custom" ? customDuration : value));
        }} disabled={busy || details}>
          <SelectTrigger id={`${id}-duration`} className="w-full">
            <SelectValue>{durationChoice === "custom" ? "Своя длительность" : `${duration} мин`}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="not-typeset rollapp-body">
            <SelectGroup>
              {durations.map(value => <SelectItem value={String(value)} key={value}>{value} мин</SelectItem>)}
              <SelectItem value="custom">Своя длительность</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {durationChoice === "custom" && <Field>
        <FieldLabel htmlFor={`${id}-minutes`}>Минуты (15–480)</FieldLabel>
        <Input id={`${id}-minutes`} type="number" min={15} max={480} value={customDuration} disabled={busy || details}
          onChange={event => {
            setCustomDuration(event.target.value);
            reconcileDuration(Number(event.target.value));
          }} />
      </Field>}
      <ZonePicker value={hostZone} disabled={busy || details} onChange={next => {
        setHostZone(next);
        setWeek(null);
        setDay(null);
        setCustom("");
        setLocalError("");
      }} />
      {times.length > 0 && <div className="grid gap-2">
        <p data-typography="label" className="text-muted-foreground">Выбрано · {times.length}</p>
        <ul className="grid gap-2">
          {times.map(start => <li className="flex min-w-0 items-center justify-between gap-2" key={start}>
            <span className="min-w-0">
              <span className="first-letter:uppercase">{selectedDateLabel.format(dateFromKey(format.key(start)))}</span><br />{timeRange({ startsAt: start, endsAt: end(start) }, format)}
            </span>
            {!details && <ControlBar className="shrink-0">
              <Button type="button" variant="destructive" size="icon" data-control-icon
                aria-label={`Убрать время ${format.date(format.key(start))}, ${format.time(start)}`}
                onClick={() => toggle(start)}><X aria-hidden="true" /></Button>
            </ControlBar>}
          </li>)}
        </ul>
      </div>}
    </aside>
    <form className="booking-panel min-w-0" onSubmit={submit} aria-busy={busy || undefined}>
      <h3 className="text-2xl font-semibold" ref={focus} tabIndex={-1}>
        {details ? "Детали встречи" : "Выберите время для встречи"}
      </h3>
      {details ? <Field>
        <FieldLabel htmlFor={`${id}-title`}>Название сессии</FieldLabel>
        <Input id={`${id}-title`} value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required disabled={busy} />
      </Field> : <>
        {!mobile && <HostWeek days={weekDays} today={today} maxDay={maxDay} onWeek={setWeek} renderTimes={renderTimes} />}
        <Accordion key={String(mobile)} defaultValue={mobile ? ["manual"] : []} className="booking-host-manual min-w-0">
          <AccordionItem value="manual">
            <AccordionTrigger className="min-h-12 items-center gap-2 text-rollapp-body">
              {mobile ? "Дата встречи" : "Выбрать другую дату или время"}
            </AccordionTrigger>
            <AccordionContent className="booking-host-grid-wrap">
              <div className="booking-host-grid">
                <BookingMonth key={hostZone} day={day} onDay={key => {
                  setDay(key);
                  setWeek(key);
                  setCustom("");
                  setLocalError("");
                }} min={today} max={maxDay} busy={busy} />
                {day && <section className="grid min-w-0 content-start gap-2" aria-label="Время начала">
                  <h4 className="text-rollapp-body font-semibold first-letter:uppercase">{format.date(day)}</h4>
                  <div>
                    <PageActionButton type="button" variant="outline" className="max-w-full whitespace-normal"
                      disabled={!startTimes.some(time => { const start = timeStart(time); return !times.includes(start) && allowed(start); }) || times.length >= limit}
                      onClick={addAvailable}>Добавить свободные слоты</PageActionButton>
                  </div>
                  {renderTimes(day)}
                  {customTime}
                </section>}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </>}
      {localError && <p role="alert" className="text-destructive">{localError}</p>}
      <div className="flex flex-wrap gap-2">
        {details ? <>
          <PageActionButton type="button" variant="outline" disabled={busy} onClick={() => setDetails(false)}>Назад</PageActionButton>
          <PageActionButton type="submit" disabled={busy || !title.trim()}>{busy ? "Публикуем…" : "Опубликовать"}</PageActionButton>
        </> : <>
          <PageActionButton type="button" variant="outline" onClick={onClose}>Отмена</PageActionButton>
          <PageActionButton type="button" disabled={!times.length} onClick={() => setDetails(true)}>Далее</PageActionButton>
        </>}
      </div>
    </form>
  </Card>;
}

export function ProfileBookingCalendar({ profile, slots, owner, user, busy, notice, loginPath, sharePath, onRemove, onPublish, onBook, clearNotice, booked }) {
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(null);
  const [typeId, setTypeId] = useState(null);
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  const [zone, setZone] = useState(() => {
    const requested = query.get("zone");
    return timeZones.includes(requested) ? requested : localZone;
  });
  const addButton = useRef(null);
  const format = useMemo(() => bookingFormats(zone), [zone]);
  const types = useMemo(() => bookingTypes(slots), [slots]);
  const requestedSlot = query.get("slot");
  const linkedType = types.find(type => type.slots.some(slot => slot.id === requestedSlot));
  const type = types.find(item => item.id === typeId) || (typeId === null ? linkedType : null) || (types.length === 1 ? types[0] : null);
  const linkedSlot = !owner && typeId === null ? linkedType?.slots.find(slot => slot.id === requestedSlot) : null;
  const [dismissedBookingId, setDismissedBookingId] = useState(null);
  const activeBooking = booked?.bookingId !== dismissedBookingId ? booked : null;

  function closeEditor() {
    setEditing(false);
    requestAnimationFrame(() => addButton.current?.focus({ preventScroll: true }));
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).href);
      setCopied({ text: "Ссылка скопирована" });
    } catch {
      setCopied({ text: "Не удалось скопировать ссылку", error: true });
    }
  }

  return <div className="not-typeset rollapp-body booking-flow">
    {owner && <div className="flex flex-wrap gap-2">
      {!editing && !preview && <PageActionButton ref={addButton} type="button" disabled={busy || slots.length >= 200} onClick={() => {
        clearNotice();
        setEditing(true);
      }}><Plus aria-hidden="true" />Добавить слот</PageActionButton>}
      {!editing && <PageActionButton type="button" variant="outline" disabled={busy} onClick={() => { setPreview(!preview); setTypeId(null); }}>
        {preview ? "К управлению слотами" : "Предпросмотр"}
      </PageActionButton>}
      {!editing && <PageActionButton type="button" variant="outline" onClick={share}><Link2 aria-hidden="true" />Копировать ссылку</PageActionButton>}
    </div>}
    {copied && <p role={copied.error ? "alert" : "status"}>{copied.text}</p>}
    {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? "text-destructive" : undefined}>{notice.message}</p>}
    {owner && !preview ? <>
      {editing && <HostSlotEditor slots={slots} busy={busy} onSave={items => onPublish(items, closeEditor)}
        onClose={() => { clearNotice(); closeEditor(); }} />}
      {!editing && slots.length === 0 && <Card className="booking-panel rollapp-body">
        <CalendarDays className="size-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-2xl font-semibold">Нет опубликованных слотов</h3>
        <p className="text-muted-foreground">Добавьте время, чтобы участники могли записаться на встречу.</p>
      </Card>}
      {!editing && slots.length > 0 && <>
        {slots.some(slot => !slot.bookingId) && <section className="grid gap-3">
          <h3 className="text-2xl font-semibold">Доступное время</h3>
          <StatusList slots={slots.filter(slot => !slot.bookingId)} owner format={format} busy={busy} onRemove={onRemove} />
        </section>}
        {slots.some(slot => slot.bookingId) && <section className="grid gap-3">
          <h3 className="text-2xl font-semibold">Предстоящие встречи</h3>
          <StatusList slots={slots.filter(slot => slot.bookingId)} owner format={format} busy={busy} onRemove={onRemove} />
        </section>}
      </>}
    </> : <>
      {types.length > 1 && type && <div>
        <PageActionButton type="button" variant="outline" disabled={busy} onClick={() => setTypeId("")}><ArrowLeft aria-hidden="true" />Все встречи</PageActionButton>
      </div>}
      {activeBooking || type || types.length === 0
        ? <BookingPicker key={`${type?.id || "empty"}:${linkedSlot?.id || ""}`} type={type} profile={profile} user={preview ? null : user} loginPath={loginPath}
            format={format} zone={zone} setZone={setZone} busy={busy} preview={preview}
            booked={activeBooking} linkedSlot={linkedSlot}
            onBook={onBook} onBack={() => setDismissedBookingId(booked?.bookingId)} />
        : <div className="booking-event-list">
          {types.map(item => <Card key={item.id} className="booking-panel rollapp-body">
            <MeetingDetails profile={profile} title={item.title} duration={item.duration} />
            <div><PageActionButton type="button" variant="outline" onClick={() => setTypeId(item.id)}
              aria-label={`Выбрать встречу: ${item.title}, ${item.duration} мин`}>Выбрать</PageActionButton></div>
          </Card>)}
        </div>}
      {!preview && slots.some(slot => slot.bookedByMe) && <section className="grid gap-3">
        <h3 className="text-2xl font-semibold">Ваши записи</h3>
        <StatusList slots={slots.filter(slot => slot.bookedByMe)} format={format} busy={busy} onRemove={onRemove} />
      </section>}
    </>}
  </div>;
}

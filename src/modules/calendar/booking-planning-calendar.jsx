import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/modules/runtime/api.js";
import { useSession } from "@/modules/auth/session.jsx";
import { sharePageUrl } from "@/applications/location.js";
import { PlanningCalendar } from "@/modules/calendar/planning-calendar.jsx";
import { usePlanningSpaceSelection } from "@/modules/planning/planning-space-switcher.jsx";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BOOKING_CALENDAR_ID, BOOKING_SLOT_TITLE, bookingSlotOverlaps, bookingSlotPayload, bookingSlotSchedule,
} from "../../../shared/modules/calendar/booking-calendar.js";
import { publicBookingPath, publicProfileAddress } from "../../../shared/modules/profile/profile-links.js";

const columns = [{ id: "booking", title: "Бронирование", complete: false }];
const year = 365 * 86_400_000;

export function BookingPlanningCalendar() {
  const { user } = useSession();
  const createSpace = usePlanningSpaceSelection()?.createAction;
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const mutation = useRef(false);
  const address = publicProfileAddress(user);
  const endpoint = `/profile/${encodeURIComponent(address)}/calendar`;
  const sharePath = publicBookingPath(user);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const data = await api.get(endpoint);
      setSlots(data.slots || []);
      setError("");
    } catch (cause) {
      setError(cause.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const tasks = useMemo(() => slots.map(bookingSlotSchedule), [slots]);
  const requestedBooking = searchParams.get("booking");

  useEffect(() => {
    if (!requestedBooking || selected || loading) return;
    const requested = tasks.find(task => task.bookingId === requestedBooking);
    if (requested?.bookingStatus === "pending") {
      setSelected(requested);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("booking");
    setSearchParams(next, { replace: true });
  }, [loading, requestedBooking, searchParams, selected, setSearchParams, tasks]);

  function closeSelected() {
    setSelected(null);
    if (!requestedBooking) return;
    const next = new URLSearchParams(searchParams);
    next.delete("booking");
    setSearchParams(next, { replace: true });
  }

  async function createSlot(schedule) {
    if (mutation.current) return;
    const payload = bookingSlotPayload(schedule, { id: crypto.randomUUID(), title: BOOKING_SLOT_TITLE });
    const startsAt = payload && Date.parse(payload.startsAt);
    if (!payload) return toast.error("Это локальное время недоступно. Выберите другой интервал.");
    if (payload.duration < 15 || payload.duration > 480) return toast.error("Слот может длиться от 15 минут до 8 часов.");
    if (startsAt <= Date.now() || startsAt >= Date.now() + year) return toast.error("Выберите время в пределах ближайших 365 дней.");
    if (slots.length >= 200) return toast.error("В календаре может быть до 200 предстоящих слотов.");
    if (bookingSlotOverlaps(slots, schedule)) return toast.error("Это время пересекается с другим слотом.");
    mutation.current = true;
    try {
      await api.post(endpoint, { slots: [payload] });
      setSlots((current) => [...current, {
        ...payload,
        endsAt: new Date(startsAt + payload.duration * 60_000).toISOString(),
        bookingId: null,
      }].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)));
      toast.success("Слот доступен для бронирования");
    } catch (cause) {
      toast.error(cause.message);
      await load({ quiet: true });
    } finally {
      mutation.current = false;
    }
  }

  async function confirmSelected() {
    if (!selected || mutation.current) return;
    mutation.current = true;
    const booking = Boolean(selected.bookingId);
    try {
      await api.delete(booking
        ? `${endpoint}/${selected.id}/bookings/${selected.bookingId}`
        : `${endpoint}/${selected.id}`);
      setSlots((current) => booking
        ? current.map((slot) => slot.id === selected.id ? { ...slot, bookingId: null, guestName: undefined } : slot)
        : current.filter((slot) => slot.id !== selected.id));
      closeSelected();
      toast.success(booking ? "Запись отменена, слот снова доступен" : "Слот удалён");
    } catch (cause) {
      toast.error(cause.message);
      closeSelected();
      await load({ quiet: true });
    } finally {
      mutation.current = false;
    }
  }

  async function respondSelected(decision) {
    if (!selected?.bookingId || selected.bookingStatus !== "pending" || mutation.current) return;
    mutation.current = true;
    try {
      const result = await api.patch(`/profile-bookings/${encodeURIComponent(selected.bookingId)}`, { decision });
      setSlots((current) => current.map((slot) => slot.id !== selected.id ? slot : decision === "confirm"
        ? { ...slot, bookingStatus: result.bookingStatus }
        : { ...slot, bookingId: null, bookingStatus: null, requestedAt: null, guestName: undefined }));
      closeSelected();
      toast.success(decision === "confirm" ? "Запись подтверждена" : "Запрос отклонён, слот снова доступен");
    } catch (cause) {
      toast.error(cause.message);
      closeSelected();
      await load({ quiet: true });
    } finally {
      mutation.current = false;
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(sharePageUrl(sharePath));
      toast.success("Ссылка на бронирование скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  }

  const toolbarActions = <>
    <Button type="button" variant="outline" size="icon" data-control-icon className="rounded-full"
      aria-label="Копировать ссылку на бронирование" title="Копировать ссылку" onClick={copyLink}>
      <Copy aria-hidden="true" />
    </Button>
    <Link to={sharePath} data-slot="button" data-control-icon className={cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full")}
      aria-label="Открыть страницу бронирования" title="Открыть страницу бронирования">
      <ExternalLink aria-hidden="true" />
    </Link>
  </>;

  return <section className="app-page planning-space typeset typeset-rollapp planning-space--calendar">
    <h1 className="sr-only">Календарь для бронирования</h1>
    <div className="not-typeset planning-tools rollapp-body">
      {loading ? <p className="planning-space__status" role="status">Загружаем слоты…</p>
        : error ? <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" onClick={() => load()}>Повторить</Button></AlertDescription></Alert>
          : <PlanningCalendar booking createSpace={createSpace} spaceId={BOOKING_CALENDAR_ID}
            tasks={tasks} columns={columns} onEdit={setSelected} onCreate={createSlot} onSave={() => {}}
            toolbarActions={toolbarActions} />}
    </div>
    <AlertDialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !mutation.current) closeSelected(); }}>
      {selected && <AlertDialogContent className="not-typeset rollapp-body max-w-[calc(100%-2rem)] sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{selected.bookingStatus === "pending" ? "Запрос на запись" : selected.bookingId ? "Отменить запись?" : "Убрать слот?"}</AlertDialogTitle>
          <AlertDialogDescription>{selected.bookingStatus === "pending"
            ? `${selected.guestName || "Участник"} хочет забронировать это время. Подтвердите или отклоните запрос.`
            : selected.bookingId
            ? `${selected.guestName ? `${selected.guestName}: ` : ""}после отмены это время снова смогут забронировать.`
            : "Это время исчезнет со страницы бронирования."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.current}>Назад</AlertDialogCancel>
          {selected.bookingStatus === "pending" ? <>
            <Button type="button" variant="outline" disabled={mutation.current} onClick={() => respondSelected("decline")}>Отклонить</Button>
            <AlertDialogAction disabled={mutation.current} onClick={() => respondSelected("confirm")}>Подтвердить</AlertDialogAction>
          </> : <AlertDialogAction variant="destructive" disabled={mutation.current} onClick={confirmSelected}>
              {selected.bookingId ? "Отменить запись" : "Убрать слот"}
            </AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>}
    </AlertDialog>
  </section>;
}

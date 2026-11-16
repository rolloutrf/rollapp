import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "@/modules/runtime/api.js";
import { ControlBar } from "@/components/control-bar";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ROLL_ACTIVITY_GROUPS, ROLL_ACTIVITY_PERIODS } from "../../../shared/modules/pfm/roll-activity.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { RollsHistory } from "../history/rolls-history.jsx";

const calendarDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function periodLabel({ startsOn, endsOn }) {
  return `${calendarDay.format(new Date(startsOn))} — ${calendarDay.format(new Date(endsOn))} · Москва`;
}

function signedRolls(value) {
  const amount = BigInt(value);
  return `${amount > 0n ? "+" : amount < 0n ? "−" : ""}${formatRolls(amount < 0n ? -amount : amount)}`;
}

function ActivityTotals({ totals }) {
  const received = BigInt(totals.received);
  const debited = BigInt(totals.debited);
  const max = received > debited ? received : debited;
  return <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
    {[
      ["Зачислено", received, "bg-amber-300"],
      ["Списано", debited, "bg-muted-foreground"],
    ].map(([label, amount, colors], index) => <div key={label} className="grid min-w-0 content-start gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`wrap-anywhere font-medium tabular-nums ${index === 0 ? "text-amber-300" : ""}`}>{formatRolls(amount)}</dd>
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className={`block h-full rounded-full ${colors}`} style={{ width: max === 0n ? "0%" : `${amount * 100n / max}%` }} />
      </span>
    </div>)}
    <div className="col-span-full grid min-w-0 content-start gap-1.5 sm:col-span-1">
      <dt className="text-xs text-muted-foreground">Изменение баланса</dt>
      <dd className="wrap-anywhere font-medium tabular-nums">{signedRolls(totals.change)}</dd>
    </div>
  </dl>;
}

function ActivityEntries({ period, group }) {
  const [rows, setRows] = useState(null);
  const [next, setNext] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const version = useRef(0);

  useEffect(() => {
    void load();
    return () => { version.current += 1; };
  }, [period.days, period.asOf, group]);

  async function load(cursor = null) {
    const request = ++version.current;
    setLoading(true); setError("");
    const query = new URLSearchParams({ days: String(period.days), asOf: period.asOf });
    if (group !== "all") query.set("group", group);
    if (cursor) {
      query.set("before", cursor.before);
      query.set("beforeId", cursor.beforeId);
    }
    try {
      const result = await api.get(`/rolls/activity/entries?${query}`);
      if (request !== version.current) return;
      setRows((current) => cursor ? [...current, ...result.transactions] : result.transactions);
      setNext(result.next);
    } catch (failure) {
      if (request === version.current) setError(failure.message);
    } finally {
      if (request === version.current) setLoading(false);
    }
  }

  return <div className="min-w-0">
    {error && <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{error}</span><Button variant="outline" onClick={() => load(next)}>Повторить</Button>
      </AlertDescription>
    </Alert>}
    {(rows || !error) && <RollsHistory transactions={rows} hasMore={Boolean(next)} loading={loading}
      loadingMore={loading} busy={loading} timeZone={period.timeZone} onLoadMore={() => load(next)} />}
  </div>;
}

export function RollsActivity() {
  const headingId = useId();
  const [days, setDays] = useState(30);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [group, setGroup] = useState(null);

  useEffect(() => {
    let active = true;
    api.get(`/rolls/activity?days=${days}`).then((result) => {
      if (active) setReport(result);
    }).catch((failure) => {
      if (active) setError(failure.message);
    });
    return () => { active = false; };
  }, [days, revision]);

  function selectPeriod(nextDays) {
    if (days === nextDays) return;
    setReport(null); setGroup(null); setError("");
    setDays(nextDays);
  }

  function refresh() {
    setReport(null); setGroup(null); setError("");
    setRevision((value) => value + 1);
  }

  const groups = new Map(report?.groups.map((row) => [row.group, row]));
  return <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4" data-roll-activity="">
    <header className="typeset typeset-rollapp"><h2 id={headingId}>Движение роллов</h2></header>
    <ControlBar className="flex flex-wrap gap-2" role="group" aria-label="Период сводки">
      {ROLL_ACTIVITY_PERIODS.map((length) => <Button key={length} variant={length === days ? "default" : "outline"}
        aria-pressed={length === days} onClick={() => selectPeriod(length)}>{length} дней</Button>)}
    </ControlBar>
    {error ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-2">
      <span>{error}</span><Button variant="outline" onClick={refresh}>Повторить</Button>
    </AlertDescription></Alert> : report === null
      ? <p role="status" className="flex items-center gap-2 text-muted-foreground"><Spinner />Загружаем сводку…</p>
      : <>
        <p className="text-xs text-muted-foreground">{periodLabel(report.period)}</p>
        <ActivityTotals totals={report.totals} />
        {report.totals.count === 0 ? <p className="text-muted-foreground">За этот период операций не было.</p> : <>
          <ul className="grid min-w-0 gap-2" aria-label="Виды операций">
            {Object.entries(ROLL_ACTIVITY_GROUPS).filter(([key]) => groups.has(key)).map(([key, label]) => {
              const row = groups.get(key);
              return <li key={key} className="grid min-w-0 gap-2">
                <Button variant={group === key ? "secondary" : "outline"} aria-expanded={group === key}
                  onClick={() => setGroup(group === key ? null : key)}
                  className="h-auto min-h-12 w-full justify-between gap-3 rounded-xl p-3 text-left whitespace-normal">
                  <span className="grid min-w-0 gap-1">
                    <span>{label}</span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                      {row.received !== "0" && <span className="wrap-anywhere">Зачислено {formatRolls(BigInt(row.received))}</span>}
                      {row.debited !== "0" && <span className="wrap-anywhere">Списано {formatRolls(BigInt(row.debited))}</span>}
                    </span>
                  </span>
                  <ChevronRight className={group === key ? "shrink-0 rotate-90" : "shrink-0"} aria-hidden="true" />
                </Button>
                {group === key && <ActivityEntries key={`${report.period.asOf}:${key}`} period={report.period} group={key} />}
              </li>;
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <PageActionButton variant="outline" aria-expanded={group === "all"} onClick={() => setGroup(group === "all" ? null : "all")}>
              Все операции периода
            </PageActionButton>
          </div>
          {group === "all" && <ActivityEntries key={`${report.period.asOf}:all`} period={report.period} group={group} />}
        </>}
        <div className="flex"><PageActionButton variant="ghost" onClick={refresh}>Обновить сводку</PageActionButton></div>
      </>}
  </section>;
}

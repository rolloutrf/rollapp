import { useEffect, useState } from "react";
import { DrawerFooter } from "@/components/form-surface";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/modules/runtime/api.js";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export function ProfileTelegramWaitlist({ isMobile }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.get("/me/telegram-waitlist", { signal: controller.signal }).then(
      ({ entries }) => { if (!controller.signal.aborted) setEntries(entries); },
      (error) => { if (!controller.signal.aborted) setError(error.message); },
    );
    return () => controller.abort();
  }, [attempt]);

  return <>
    <ScrollArea className="mx-auto min-h-0 w-full max-w-full flex-1">
      <div className="grid min-w-0 gap-3 px-4 py-4">
        {error ? (
          <p role="alert" className="text-destructive">{error}</p>
        ) : !entries ? (
          <p role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />Загружаем заявки…</p>
        ) : entries.length === 0 ? (
          <p>Пока никто не оставил Telegram.</p>
        ) : (
          <ul role="list" aria-label="Заявки с главной страницы" className="min-w-0 divide-y border-y">
            {entries.map(({ username, requestedAt }) => (
              <li key={username}>
                <a
                  href={`https://t.me/${encodeURIComponent(username)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid min-h-(--layout-control-size) min-w-0 gap-1 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <span className="wrap-anywhere underline underline-offset-4">@{username}</span>
                  <time className="text-xs text-muted-foreground" dateTime={requestedAt}>{dateFormat.format(new Date(requestedAt))}</time>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScrollArea>
    {(isMobile || error) && <DrawerFooter>
      {error && <Button type="button" className="min-w-0 flex-1" onClick={() => {
        setError("");
        setAttempt((current) => current + 1);
      }}>Повторить</Button>}
    </DrawerFooter>}
  </>;
}

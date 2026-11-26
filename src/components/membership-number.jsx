import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "@/api.js";
import { PageActionButton } from "@/components/page-action-button";
import "./membership-number.css";

export function MembershipNumberReel({ number }) {
  return (
    <div className="membership-reel">
      <span className="sr-only">Ваш номер Rollapp: {number}</span>
      <span className="membership-reel__mark" aria-hidden="true">№</span>
      <div className="membership-reel__digits" aria-hidden="true">
        {Array.from(number, (digit, index) => (
          <span className="membership-reel__window" key={index}>
            <span className="membership-reel__strip" style={{ "--reel-delay": `${index * 65}ms` }}>
              {[7, 2, 8, 3, 6, 1, 9].map((value, position) => <span key={position}>{(value + index) % 10}</span>)}
              <span>{digit}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MembershipReceipt({ number }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let timer;
    const load = async () => {
      try {
        const data = await api.get("/me/membership");
        if (!active) return;
        setResult({ data });
        if (data.anchor?.status === "pending") timer = setTimeout(load, 15_000);
      } catch (error) {
        if (active) setResult({ error });
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [number, attempt]);

  const anchor = result?.data?.number === number ? result.data.anchor : null;
  return (
    <div className="grid min-w-0 gap-2 border-t border-border pt-4">
      <div>
        <div className="eyebrow">Ваш номер Rollapp</div>
        <div className="membership-receipt__number">№ {number}</div>
      </div>
      {result?.error && (
        <div className="grid gap-2">
          <p role="status">Не удалось проверить запись в TON.</p>
          <PageActionButton type="button" variant="outline" onClick={() => { setResult(null); setAttempt((value) => value + 1); }}>Повторить</PageActionButton>
        </div>
      )}
      {anchor && (
        <>
          <p role="status">{anchor.status === "confirmed" ? "Запись подтверждена в TON." : "Ожидаем подтверждения в TON."}</p>
          <div className="flex flex-wrap gap-2">
            <PageActionButton variant="outline" render={<a href="/api/me/membership/receipt" download />} nativeButton={false}>Скачать квитанцию</PageActionButton>
            {anchor.status === "confirmed" && (
              <PageActionButton variant="outline" render={<a href={`https://tonviewer.com/transaction/${anchor.transactionHash}`} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                <ExternalLink data-icon="inline-start" aria-hidden="true" /> Открыть в TON
              </PageActionButton>
            )}
          </div>
        </>
      )}
    </div>
  );
}

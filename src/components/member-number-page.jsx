import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import "./member-number-page.css";

export function MemberNumberPage({ user, onDrawn }) {
  const [number, setNumber] = useState(user.memberNumber || null);
  const [receipt, setReceipt] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setNumber(user.memberNumber || null); }, [user.memberNumber]);
  useEffect(() => {
    if (!number) return undefined;
    let active = true;
    const read = () => api.get("/me/member-number").then(result => {
      if (active) setReceipt(result);
    }).catch(() => {});
    void read();
    const timer = window.setInterval(read, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [number]);

  const draw = async () => {
    if (spinning || number) return;
    setSpinning(true);
    setError("");
    try {
      const started = Date.now();
      const result = await api.post("/me/member-number/draw", {});
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1800 - (Date.now() - started))));
      setNumber(result.number);
      setReceipt(result);
      await onDrawn?.();
    } catch (cause) { setError(cause.message); }
    finally { setSpinning(false); }
  };

  return <main className="app-page page-stack typeset typeset-rollapp member-number-page">
    <header><span data-typography="label">Rollapp · 30 000 мест</span><h1>Ваш номер в Rollapp</h1><p>Каждому участнику достаётся случайный свободный номер. Он закрепляется за аккаунтом навсегда.</p></header>
    <Card data-not-typeset className="member-number-card rollapp-body grid justify-items-center gap-6 p-6 text-center">
      <div className={cn("member-number-wheel", spinning && "member-number-wheel--spinning")} aria-hidden="true"><span className="font-heading text-4xl font-bold">{number || "?????"}</span></div>
      {number ? <><p aria-live="polite">Ваш номер — <strong>#{number}</strong></p>
        {receipt?.receiptHash && <div className="grid gap-2"><p data-typography="caption">SHA-256 записи: <code className="break-all">{receipt.receiptHash}</code></p>
          <p data-typography="caption">TON: {receipt.chainStatus === "confirmed" ? "подтверждено" : receipt.chainStatus === "failed" ? "требуется проверка" : "ожидает подтверждения"}</p>
          {receipt.chainTransaction && <p data-typography="caption">Транзакция: <code className="break-all">{receipt.chainTransaction}</code></p>}
        </div>}</>
        : <Button type="button" className="min-h-(--layout-control-size) rounded-full px-6" disabled={spinning} onClick={draw}>{spinning ? "Барабан вращается…" : "Крутить барабан"}</Button>}
      {error && <p role="alert">{error}</p>}
      <Link to="/app/wishes" className={cn(buttonVariants({ variant: "outline" }), "min-h-(--layout-control-size) rounded-full px-6")}>Перейти в Rollapp</Link>
    </Card>
  </main>;
}

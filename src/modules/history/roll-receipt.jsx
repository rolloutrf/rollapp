import { useEffect, useId, useState } from "react";
import { Download } from "lucide-react";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/modules/runtime/api.js";
import { rollReceiptFields, rollReceiptText } from "../../../shared/modules/history/roll-receipt.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

function downloadReceipt(receipt) {
  const url = URL.createObjectURL(new Blob([rollReceiptText(receipt)], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `rollapp-${receipt.id.replace(/[^a-z0-9_-]/gi, "-").slice(0, 100)}.txt`;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function RollReceipt({ kind, recordId, id }) {
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);

  useEffect(() => {
    let active = true;
    api.get(`/rolls/receipts/${encodeURIComponent(kind)}/${encodeURIComponent(recordId)}`).then(({ receipt: data }) => {
      if (active) setReceipt(data);
    }).catch((failure) => {
      if (active) setError(failure.message);
    });
    return () => { active = false; };
  }, [kind, recordId, request]);

  return <section id={id} aria-label="Квитанция Rollapp" data-roll-receipt=""
    className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4 text-foreground">
    {error ? <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span className="wrap-anywhere">{error}</span>
        <PageActionButton variant="outline" onClick={() => { setError(""); setRequest((value) => value + 1); }}>Повторить</PageActionButton>
      </AlertDescription>
    </Alert> : receipt === null ? <p role="status" className="flex items-center gap-2 text-muted-foreground"><Spinner />Загружаем квитанцию…</p> : <>
      <div className="typeset typeset-rollapp min-w-0">
        <h3>Квитанция Rollapp</h3>
        <p className="wrap-anywhere font-medium tabular-nums">{formatRolls(BigInt(receipt.amount))}</p>
      </div>
      <dl className="grid min-w-0 gap-x-4 gap-y-3 sm:grid-cols-2">
        {rollReceiptFields(receipt).map(([label, value]) => <div key={label} className="grid min-w-0 content-start gap-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className={`min-w-0 wrap-anywhere${label === "Номер" || label === "Номер заказа" ? " tabular-nums" : ""}`}>{value}</dd>
        </div>)}
      </dl>
      <div className="flex"><PageActionButton variant="outline" onClick={() => downloadReceipt(receipt)}>
        <Download className="size-5" aria-hidden="true" />Скачать квитанцию
      </PageActionButton></div>
    </>}
  </section>;
}

export function OrderReceipt({ order }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <div className="col-span-full grid min-w-0 gap-3">
    <div className="flex">
      <PageActionButton variant="outline" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((value) => !value)}>
        {open ? "Скрыть квитанцию" : "Квитанция"}
      </PageActionButton>
    </div>
    {open && <RollReceipt key={`${order.id}:${order.status}`} id={id} kind="order" recordId={order.id} />}
  </div>;
}

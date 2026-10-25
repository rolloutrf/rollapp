import { lazy, Suspense, useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Copy, Download, Share2 } from "lucide-react";
import { publicContactCard, contactCardDownload } from "../../shared/contact-card.js";
import { ControlBar } from "@/components/control-bar";
import { PageActionButton } from "@/components/page-action-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { SignedCardVerifier } from "@/components/signed-card-verifier";
const TonCardSigner = lazy(() => import("@/components/ton-card-signer"));

function downloadCard(card, format) {
  const file = contactCardDownload(card, format);
  const url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export function ContactCardButton({ profile, canSign = false }) {
  const [open, setOpen] = useState(false);
  return <>
    <PageActionButton type="button" variant="outline" onClick={() => setOpen(true)}>Визитка</PageActionButton>
    {open && <ContactCardDialog key={profile.username} profile={profile} canSign={canSign} onClose={() => setOpen(false)} />}
  </>;
}

// Wallet code is loaded only after the owner explicitly opens signing.
export function ContactCardDialog({ profile, onClose, canSign = false }) {
  const card = publicContactCard(profile, window.location.origin);
  const [qr, setQr] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [signingOpen, setSigningOpen] = useState(false);
  const [previous, setPrevious] = useState(null);
  useEffect(() => {
    let current = true;
    setQr(null);
    QRCode.toDataURL(card.url, { width: 320, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((src) => { if (current) setQr({ url: card.url, src }); })
      .catch(() => { if (current) setQr({ url: card.url, error: true }); });
    return () => { current = false; };
  }, [card.url, attempt]);
  const run = async (action) => {
    setError(""); setMessage("");
    try { await action(); }
    catch (failure) { if (failure?.name !== "AbortError") setError("Не удалось выполнить действие. Попробуйте ещё раз."); }
  };
  const share = () => run(async () => {
    setSharing(true);
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: `Визитка ${card.name}`, url: card.url });
      else { await navigator.clipboard.writeText(card.url); setMessage("Ссылка на профиль скопирована"); }
    } finally { setSharing(false); }
  });
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="contact-card-dialog rollapp-body flex min-h-0 flex-col overflow-hidden sm:max-w-md" showCloseButton={false}>
      <DialogHeader className="shrink-0">
        <DialogTitle>Цифровая визитка</DialogTitle>
        <DialogDescription>Сохраните контакт или поделитесь ссылкой на профиль.</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain" data-contact-card-body>
        <div className="flex flex-col items-center gap-2 text-center">
          <strong className="max-w-full break-words">{card.name}</strong>
          <span className="max-w-full break-words text-muted-foreground">@{card.username}</span>
          <div className="flex aspect-square w-[clamp(8rem,calc(var(--app-visual-height,100dvh)-16rem),16rem)] max-w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white" aria-busy={!qr || qr.url !== card.url}>
            {qr?.url === card.url && qr.src ? <img className="block size-full" src={qr.src} alt={`QR-код профиля ${card.name}`} />
              : qr?.url === card.url && qr.error ? <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Повторить QR-код</Button>
                : <span className="text-black" role="status"><Spinner /><span className="sr-only">Создаём QR-код</span></span>}
          </div>
          <a className="max-w-full break-all underline underline-offset-4" href={card.url}>{card.url}</a>
        </div>
        <p className="text-muted-foreground">В vCard и обычном JSON — только имя, username и ссылка на профиль. Заметки и данные входа остаются в Rollapp.</p>
        <ControlBar className="flex flex-col gap-2" aria-label="Обмен визиткой">
          <Button type="button" variant="outline" onClick={() => run(async () => { await navigator.clipboard.writeText(card.url); setMessage("Ссылка на профиль скопирована"); })}><Copy aria-hidden="true" />Скопировать ссылку</Button>
          <Button type="button" variant="outline" disabled={sharing} onClick={share}><Share2 aria-hidden="true" />Поделиться</Button>
          <Button type="button" variant="ghost" onClick={() => run(() => downloadCard(card, "json"))}>Скачать JSON</Button>
          {canSign && !signingOpen && <Button type="button" variant="outline" onClick={() => { setPrevious(null); setSigningOpen(true); }}>Подпись TON Testnet</Button>}
        </ControlBar>
        {canSign && signingOpen && <Suspense fallback={<p role="status">Загружаем подключение TON…</p>}><TonCardSigner key={`${card.username}:${card.name}`} profile={card} previous={previous} /></Suspense>}
        <SignedCardVerifier key={`${card.username}:${card.name}`} profile={card} onUpdate={canSign ? (bundle) => { setPrevious(bundle); setSigningOpen(true); } : undefined} />
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <ControlBar className="flex shrink-0 gap-2" aria-label="Действия с визиткой">
        <Button data-control-icon type="button" variant="outline" size="icon" aria-label="Закрыть визитку" onClick={onClose}><ArrowLeft aria-hidden="true" /></Button>
        <Button type="button" className="min-w-0 flex-1" onClick={() => run(() => downloadCard(card, "vcard"))}><Download aria-hidden="true" />Скачать vCard</Button>
      </ControlBar>
    </DialogContent>
  </Dialog>;
}

import { Fragment, useEffect, useState } from "react";
import { api } from "@/api";
import { PageActionButton } from "@/components/page-action-button";
import { ScreenPortal } from "@/components/ui/screen-portal";
import "./member-number-page.css";

const DIGIT_COUNT = 5;
const BLANK_DIGIT = "–";
const FLIP_INTERVAL = 150;
const MIN_ROLL_FRAMES = 7;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const CONFETTI_DURATION = 2000;
const CONFETTI_COUNT = 84;
const CONFETTI_COLORS = ["#ffc12d", "#ff6940", "#ff499f", "#4debc1", "#48b9ff", "#b48aff", "#fff2c0"];

function MemberNumberConfetti() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), CONFETTI_DURATION);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return <ScreenPortal container={document.body}>
    <div className="member-number-confetti" aria-hidden="true" style={{ "--confetti-duration": `${CONFETTI_DURATION}ms` }}>
      {Array.from({ length: CONFETTI_COUNT }, (_, index) => {
        const direction = index % 2 === 0 ? 1 : -1;
        const distance = 24 + (index * 17) % 57;
        const rise = 19 + (index * 23) % 51;
        const fall = 12 + (index * 29) % 26;
        return <span key={index} style={{
          "--confetti-color": CONFETTI_COLORS[index % CONFETTI_COLORS.length],
          "--confetti-x": `${direction * distance}cqi`,
          "--confetti-rise": `${rise}dvh`,
          "--confetti-fall": `${fall}dvh`,
          "--confetti-turn": `${direction * (200 + (index * 37) % 470)}deg`,
          "--confetti-speed": 0.65 + (index % 9) * 0.025,
          "--confetti-delay": `${Math.floor(index / 2) * 6}ms`,
          "--confetti-size": `${5 + (index * 7) % 5}px`,
        }} />;
      })}
    </div>
  </ScreenPortal>;
}

function rollingDigit(frame, index) {
  return frame === 0 ? BLANK_DIGIT : String((frame + index * 3) % 10);
}

function FlipDigit({ previous, digit, frame, index }) {
  const flipping = previous !== digit;
  return <span className="member-flip-digit" style={{ "--flip-delay": `${index * 5}ms` }}>
    <span className="member-flip-face member-flip-face--top"><span>{digit}</span></span>
    <span className="member-flip-face member-flip-face--bottom"><span>{previous}</span></span>
    {flipping && <Fragment key={frame}>
      <span className="member-flip-face member-flip-face--top member-flip-face--out"><span>{previous}</span></span>
      <span className="member-flip-face member-flip-face--bottom member-flip-face--in"><span>{digit}</span></span>
    </Fragment>}
  </span>;
}

function MemberNumberDisplay({ number, draw }) {
  const frame = draw?.frame ?? 0;
  return <div className="member-flip-board" aria-hidden="true">
    {Array.from({ length: DIGIT_COUNT }, (_, index) => {
      const settled = draw && index < draw.settled;
      const digit = number?.[index] ?? (settled ? draw.result.number[index] : rollingDigit(frame, index));
      const flipping = !number && frame > 0 && (!settled || index === draw.settled - 1);
      const previous = flipping ? rollingDigit(frame - 1, index) : digit;
      return <FlipDigit key={index} previous={previous} digit={digit} frame={frame} index={index} />;
    })}
  </div>;
}

export function MemberNumberPage({ user, onDrawn }) {
  const [receipt, setReceipt] = useState(null);
  const [draw, setDraw] = useState(null);
  const [error, setError] = useState("");
  const drawing = draw !== null && !draw.finished;
  const number = draw ? (draw.finished ? draw.result.number : null) : user.memberNumber;
  const memberReceipt = receipt ?? draw?.result;

  useEffect(() => {
    if (!drawing) return undefined;
    const motion = window.matchMedia(REDUCED_MOTION);
    const advance = () => setDraw(current => {
      if (!current || current.finished) return current;
      if (current.settled === DIGIT_COUNT || (current.result && motion.matches)) {
        return { ...current, finished: true, celebrate: !motion.matches };
      }
      if (motion.matches) return current;
      const settling = current.result && current.frame >= MIN_ROLL_FRAMES;
      return { ...current, frame: current.frame + 1, settled: current.settled + (settling ? 1 : 0) };
    });
    const onMotionChange = event => { if (event.matches) advance(); };
    const timer = window.setInterval(advance, FLIP_INTERVAL);
    motion.addEventListener("change", onMotionChange);
    return () => {
      window.clearInterval(timer);
      motion.removeEventListener("change", onMotionChange);
    };
  }, [drawing]);

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

  const requestNumber = async () => {
    if (drawing || number) return;
    setDraw({ frame: 0, settled: 0, result: null, finished: false });
    setError("");
    try {
      const result = await api.post("/me/member-number/draw", {});
      if (typeof result.number !== "string" || !/^\d{5}$/.test(result.number)) {
        throw new Error("Не удалось получить номер. Попробуйте ещё раз.");
      }
      const finished = window.matchMedia(REDUCED_MOTION).matches;
      setDraw(current => ({ ...current, result, finished }));
    } catch (cause) {
      setDraw(null);
      setError(cause.message);
      return;
    }
    try { await onDrawn?.(); } catch (cause) { setError(cause.message); }
  };

  return <main className="app-page page-stack member-number-page" aria-label="Получение номера участника">
    <div className="rollapp-body grid min-w-0 justify-items-center gap-6 text-center">
      <MemberNumberDisplay number={number} draw={draw} />
      {draw?.celebrate && <MemberNumberConfetti />}
      <p role="status" className="sr-only">
        {number ? <>Ваш номер — <strong>#{number}</strong></> : drawing ? "Подбираем номер…" : ""}
      </p>
      {number && memberReceipt?.receiptHash && <div className="grid min-w-0 gap-2">
        <p data-typography="caption">SHA-256 записи: <code className="break-all">{memberReceipt.receiptHash}</code></p>
        <p data-typography="caption">TON: {memberReceipt.chainStatus === "confirmed" ? "подтверждено" : memberReceipt.chainStatus === "failed" ? "требуется проверка" : "ожидает подтверждения"}</p>
        {memberReceipt.chainTransaction && <p data-typography="caption">Транзакция: <code className="break-all">{memberReceipt.chainTransaction}</code></p>}
      </div>}
      {!number && <PageActionButton type="button" disabled={drawing} onClick={requestNumber}>{drawing ? "Подбираем номер…" : "Получить номер"}</PageActionButton>}
      {error && <p role="alert">{error}</p>}
      <PageActionButton to="/app/wishes" variant="outline">Перейти в Rollapp</PageActionButton>
    </div>
  </main>;
}

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import "../../components/member-number-page.css";

export const MEMBER_NUMBER_DIGITS = 5;
const BLANK_DIGIT = "–";

function rollingDigit(frame, index) {
  return frame === 0 ? BLANK_DIGIT : String((frame + index * 3) % 10);
}

function FlipDigit({ previous, digit, frame, index }) {
  const flipping = previous !== digit;
  return <span className="member-flip-digit" aria-hidden="true" style={{ "--flip-delay": `${index * 5}ms` }}>
    <span className="member-flip-face member-flip-face--top"><span>{digit}</span></span>
    <span className="member-flip-face member-flip-face--bottom"><span>{previous}</span></span>
    {flipping && <Fragment key={frame}>
      <span className="member-flip-face member-flip-face--top member-flip-face--out"><span>{previous}</span></span>
      <span className="member-flip-face member-flip-face--bottom member-flip-face--in"><span>{digit}</span></span>
    </Fragment>}
  </span>;
}

export function MemberNumberBoard({ number, draw, fullWidth = false }) {
  const frame = draw?.frame ?? 0;
  const label = fullWidth && number ? `Ваш номер — #${number}` : undefined;
  return <div className={cn("member-flip-board", fullWidth && "member-flip-board--full-width")}
    role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {Array.from({ length: MEMBER_NUMBER_DIGITS }, (_, index) => {
      const settled = draw && index < draw.settled;
      const digit = number?.[index] ?? (settled ? draw.result.number[index] : rollingDigit(frame, index));
      const flipping = !number && frame > 0 && (!settled || index === draw.settled - 1);
      const previous = flipping ? rollingDigit(frame - 1, index) : digit;
      return <FlipDigit key={index} previous={previous} digit={digit} frame={frame} index={index} />;
    })}
  </div>;
}

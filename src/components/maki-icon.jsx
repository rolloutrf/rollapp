import { useId } from "react";

export function MakiIcon({ className = "" }) {
  const id = useId().replaceAll(":", "");
  const noriId = `${id}-maki-nori`;
  const riceId = `${id}-maki-rice`;
  const salmonId = `${id}-maki-salmon`;

  return <svg className={className} viewBox="0 0 64 56" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={noriId} x1="8" y1="9" x2="45" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#34483b" />
        <stop offset=".55" stopColor="#17241e" />
        <stop offset="1" stopColor="#0b110e" />
      </linearGradient>
      <linearGradient id={riceId} x1="34" y1="9" x2="53" y2="47" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff" />
        <stop offset="1" stopColor="#d9ddd8" />
      </linearGradient>
      <linearGradient id={salmonId} x1="30" y1="20" x2="43" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#ff625d" />
        <stop offset="1" stopColor="#d9273f" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="49" rx="23" ry="3" fill="#000" opacity=".28" />
    <path d="M8 18C8 10.5 13 6 20.5 6h22L52 13.5v28L42.5 49h-22C13 49 8 44.5 8 37V18Z" fill={`url(#${noriId})`} />
    <path d="M17 7.5c7.5 2 13.5 5.2 18.5 10.5v25.5c-5.5 3.4-11.5 5-18 4" stroke="#59705f" strokeWidth="1.4" opacity=".38" />
    <path d="M31 17C31 9.9 35.4 6 42.5 6S56 10.4 56 17.5v20C56 45 51.5 49 44 49h-1.5C35.2 49 31 44.8 31 37.5V17Z" fill={`url(#${riceId})`} stroke="#bcc3bd" strokeWidth="1.25" />
    <path d="M34.5 18c2-5.6 6-8.2 11.8-8M52.5 16c1.1 3.3 1.2 6.7.2 10.1M34.2 40.4c2.3 3.4 5.8 5 10.4 5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".75" />
    <path d="m40 20 5-2.5 5.5 4-1 7-5.5 8.5-7-2.5-1.5-7L40 20Z" fill={`url(#${salmonId})`} stroke="#b91736" strokeWidth=".8" />
    <path d="m45 17.5 5.5 4 3-1 1.5 5.5-5.5 3-2.4-3.3L45 17.5Z" fill="#9bd86b" stroke="#57984b" strokeWidth=".8" />
    <path d="m38.5 24 9 6M37 28l8 5.5" stroke="#ff9086" strokeWidth=".8" strokeLinecap="round" opacity=".8" />
  </svg>;
}

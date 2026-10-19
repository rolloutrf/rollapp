import { useInlineFieldCaretVisibility } from "@/hooks/use-inline-caret-visibility";
import "./inline-editor.css";
import { useEffect, useLayoutEffect, useRef } from "react";

// Structured records retain plain text. Native plaintext editing preserves
// selection, undo and paste without introducing markup into their data model.
export function InlineTextField({ value, onChange, onBlur, label, disabled, autoFocus = false, singleLine = false, placeholder = "Напишите текст…" }) {
  const ref = useRef(null);
  useInlineFieldCaretVisibility(ref, disabled);
  useLayoutEffect(() => {
    if (ref.current && ref.current.innerText !== value) ref.current.textContent = value;
  }, [value]);
  useEffect(() => { if (autoFocus && !disabled) ref.current?.focus(); }, [autoFocus, disabled]);
  return <span ref={ref} className="inline-text-field" role="textbox" aria-label={label} aria-multiline={!singleLine}
    aria-readonly={disabled || undefined} contentEditable={disabled ? false : "plaintext-only"} suppressContentEditableWarning
    tabIndex={disabled ? undefined : 0} data-placeholder={value || disabled ? undefined : placeholder}
    onInput={event => onChange(singleLine ? event.currentTarget.innerText.replace(/\s*\n\s*/g, " ") : event.currentTarget.innerText.replace(/\r/g, ""))}
    onBlur={() => onBlur?.()} onKeyDown={event => {
      if (singleLine && event.key === "Enter" && !event.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onBlur?.(); }
    }} />;
}

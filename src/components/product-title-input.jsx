import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { Input } from "@/components/ui/input";
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";

const searchProducts = (query, signal) => api.post("/catalog/product-suggestions", { query }, { signal });

// Shared by wish creation and sale listings. Suggestions never author other fields.
export function ProductTitleInput({ value, onValueChange, enabled = true, disabled = false, search = searchProducts, ref, ...props }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(null);
  const [composing, setComposing] = useState(false);
  const [result, setResult] = useState({ query: "", items: [], status: "idle" });
  const cooldown = useRef(0);
  const query = value.trim().replace(/\s+/gu, " ");
  const searching = enabled && !disabled && !composing && open && typed === value && query.length >= 3 && query.length <= 160;
  const current = result.query === query ? result : { items: [], status: "loading" };
  const items = searching ? current.items : [];
  const hintId = `${props.id}-suggestions-hint`;

  useEffect(() => {
    if (!searching) return;
    let active = true;
    const controller = new AbortController();
    setResult({ query, items: [], status: "loading" });
    const timer = setTimeout(async () => {
      if (cooldown.current > Date.now()) {
        setResult({ query, items: [], status: "error", message: "Подсказки заняты. Можно продолжить ввод вручную." });
        return;
      }
      try {
        const response = await search(query, controller.signal);
        if (active) setResult({ query, items: response.items, status: "ready" });
      } catch (error) {
        if (!active) return;
        if (error.retryAfterSeconds) cooldown.current = Date.now() + error.retryAfterSeconds * 1000;
        setResult({ query, items: [], status: "error", message: error.message });
      }
    }, 600);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, searching, search]);

  if (!enabled) return <Input {...props} ref={ref} value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)} />;
  return <div className="grid min-w-0 gap-2" data-product-title-input>
    <Combobox items={items} value={null} inputValue={value} filter={null} autoHighlight={false}
      open={searching} disabled={disabled}
      onOpenChange={setOpen}
      itemToStringLabel={(item) => item.title}
      onInputValueChange={(next, details) => {
        // Combobox also emits input-clear on blur for an unselected value.
        // A product title is free text: only native editing may change it here.
        if (details.reason !== "input-change") return;
        setTyped(next);
        onValueChange(next);
        setOpen(true);
      }}
      onValueChange={(item) => {
        if (!item || disabled || composing) return;
        setTyped(null); setOpen(false); onValueChange(item.title);
      }}>
      <div ref={anchor} className="min-w-0">
        <ComboboxInput {...props} ref={ref} disabled={disabled} showTrigger={false} className="w-full min-w-0"
          autoComplete="off" maxLength={props.maxLength ?? 160}
          aria-describedby={[props["aria-describedby"], hintId].filter(Boolean).join(" ")}
          onKeyDownCapture={(event) => {
            if (event.key === "Escape" && searching && !event.nativeEvent.isComposing) {
              event.preventDefault(); event.stopPropagation(); setOpen(false);
            }
          }}
          onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
      </div>
      <ComboboxContent anchor={anchor} className="not-typeset rollapp-body min-w-0 w-(--anchor-width)">
        {current.status === "loading" && <p role="status" className="p-3 text-xs text-muted-foreground">Ищем модели…</p>}
        {current.status === "error" && <p role="status" className="p-3 text-xs text-muted-foreground">{current.message}</p>}
        {current.status === "ready" && items.length === 0 && <p role="status" className="p-3 text-xs text-muted-foreground">Модель не найдена. Оставьте своё название.</p>}
        <ComboboxList>{(item) => <ComboboxItem key={item.id} value={item} className="min-h-12 px-3 py-2 pr-8 text-lg">
          <span className="grid min-w-0 gap-1">
            <span className="break-words">{item.title}</span>
            {item.description && <span className="text-xs text-muted-foreground break-words">{item.description}</span>}
          </span>
        </ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
    <p id={hintId} className="text-xs text-muted-foreground">Название ищется в Wikidata. Есть не все модели; можно ввести своё название.</p>
  </div>;
}

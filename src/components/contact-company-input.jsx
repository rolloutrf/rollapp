import { useRef, useState } from "react";
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";

const normalizeCompany = (value) => value.trim().normalize("NFKC").replace(/\s+/gu, " ").toLocaleLowerCase("ru").replaceAll("ё", "е");

function matchingCompanies(companies, value) {
  const typedName = value.trim();
  const query = normalizeCompany(typedName);
  if (!query) return [];
  const seen = new Set(["не отсортированные", "неотсортированные"]);
  const startsWith = [];
  const contains = [];
  for (const { company } of companies) {
    const name = company.trim();
    const key = normalizeCompany(name);
    if (seen.has(key) || !key.includes(query)) continue;
    seen.add(key);
    if (name === typedName) continue;
    (key.startsWith(query) ? startsWith : contains).push(name);
  }
  return [...startsWith, ...contains].slice(0, 8);
}

export function ContactCompanyInput({ companies, value, onValueChange, disabled, ...props }) {
  const anchor = useRef(null);
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const items = typed && !composing && !disabled ? matchingCompanies(companies, value) : [];
  const showing = open && items.length > 0;
  return <Combobox items={items} value={null} inputValue={value} filter={null} autoHighlight={false}
    open={showing} disabled={disabled} onOpenChange={setOpen}
    onInputValueChange={(next, details) => {
      if (details.reason !== "input-change") return;
      onValueChange(next);
      setTyped(true);
      setOpen(true);
    }}
    onValueChange={(company) => {
      if (!company || disabled || composing) return;
      onValueChange(company);
      setTyped(false);
      setOpen(false);
    }}>
    <div ref={anchor} className="min-w-0">
      <ComboboxInput {...props} showTrigger={false} disabled={disabled} autoComplete="off"
        className="w-full min-w-0"
        onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape" && showing && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }} />
    </div>
    <ComboboxContent anchor={anchor} className="not-typeset rollapp-body min-w-0">
      <ComboboxList aria-label="Названия компаний">{(company) => <ComboboxItem key={company} value={company} className="min-h-12 px-3 py-2 pr-8 text-lg wrap-anywhere">
        {company}
      </ComboboxItem>}</ComboboxList>
    </ComboboxContent>
  </Combobox>;
}

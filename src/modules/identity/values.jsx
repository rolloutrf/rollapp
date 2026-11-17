import { AddFab } from "@/components/add-fab";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { CareerContentError } from "@/modules/career/career-content.jsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Input } from "@/components/ui/input";
import { PERSONAL_VALUE_GROUPS, PERSONAL_VALUES } from "@/modules/identity/personal-values.js";
import { useSphereSharing } from "@/modules/access/sphere-sharing.jsx";
import { IdentitySelectionFeedback, useIdentitySelection } from "./identity-selection.jsx";

const EMPTY_VALUES = { selected: [], custom: [] };

function normalizeValues(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return EMPTY_VALUES;
  const selected = Array.isArray(content.selected)
    ? [...new Set(content.selected.filter((value) => typeof value === "string"))]
    : [];
  const custom = Array.isArray(content.custom)
    ? content.custom.filter((value) => (
      value && typeof value === "object" && typeof value.id === "string" && typeof value.label === "string"
    )).map((value) => ({
      id: value.id,
      label: value.label,
      description: typeof value.description === "string" ? value.description : "",
    }))
    : [];
  return { selected, custom };
}

function ValueOption({ checked, description, disabled, label, onCheckedChange }) {
  return (
    <label className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${checked ? "border-foreground bg-accent" : "border-border bg-card hover:bg-accent/50"} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      <Checkbox
        className="mt-1 size-5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <strong className="font-semibold text-foreground">{label}</strong>
        <span className="text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function Values() {
  const { readOnly } = useSphereSharing();
  const selection = useIdentitySelection("values", EMPTY_VALUES, normalizeValues);
  const { document: valuesContent, draft, change, disabled: editingDisabled } = selection;
  const [addingCustom, setAddingCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const selected = useMemo(() => new Set(draft.selected), [draft.selected]);

  const toggle = (id, checked) => {
    change((current) => ({
      ...current,
      selected: checked
        ? [...new Set([...current.selected, id])]
        : current.selected.filter((value) => value !== id),
    }));
  };

  const addCustom = (event) => {
    event.preventDefault();
    if (editingDisabled) return;
    const label = customValue.trim().replace(/\s+/g, " ");
    const description = customDescription.trim().replace(/\s+/g, " ");
    if (!label || !description) return;
    setAddingCustom(false);
    const normalizedLabel = label.toLocaleLowerCase("ru-RU");
    const standardValue = PERSONAL_VALUES.find((value) => value.label.toLocaleLowerCase("ru-RU") === normalizedLabel);
    if (standardValue) {
      toggle(standardValue.id, true);
      setCustomValue("");
      setCustomDescription("");
      return;
    }
    const existing = draft.custom.find((value) => value.label.toLocaleLowerCase("ru-RU") === normalizedLabel);
    if (existing) {
      change((current) => ({
        selected: [...new Set([...current.selected, existing.id])],
        custom: current.custom.map((value) => value.id === existing.id ? { ...value, description } : value),
      }));
      setCustomValue("");
      setCustomDescription("");
      return;
    }
    const id = `custom:${crypto.randomUUID()}`;
    change((current) => ({
      selected: [...current.selected, id],
      custom: [...current.custom, { id, label, description }],
    }));
    setCustomValue("");
    setCustomDescription("");
  };

  const removeCustom = (id) => {
    change((current) => ({
      selected: current.selected.filter((value) => value !== id),
      custom: current.custom.filter((value) => value.id !== id),
    }));
  };

  return (
    <div className="identity-checklist not-typeset rollapp-body page-stack page-stack--sections" aria-busy={valuesContent.loading}>
      {!readOnly && <AddFab actions={[{ label: "Добавить ценность", disabled: editingDisabled, onSelect: () => setAddingCustom(true) }]} />}
      <CareerContentError error={valuesContent.error} onRetry={valuesContent.retry} />
      <IdentitySelectionFeedback selection={selection} />

      {draft.custom.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="custom-values-title">
          <h3 className="m-0 text-xl font-semibold" id="custom-values-title">Мои ценности</h3>
          <ul role="list" className="flex flex-col gap-3">
            {draft.custom.map((value) => (
              <li key={value.id} className={`flex min-h-24 min-w-0 items-start gap-3 rounded-xl border p-4 ${selected.has(value.id) ? "border-foreground bg-accent" : "border-border bg-card"}`}>
                <Checkbox
                  className="mt-1 size-5"
                  checked={selected.has(value.id)}
                  disabled={editingDisabled}
                  onCheckedChange={(checked) => toggle(value.id, checked)}
                  aria-label={value.label}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1 break-words">
                  <strong className="font-semibold text-foreground">{value.label}</strong>
                  {value.description && <span className="text-muted-foreground">{value.description}</span>}
                </span>
                {!readOnly && <Button className="shrink-0" variant="destructive" size="icon-sm" type="button" disabled={editingDisabled} onClick={() => removeCustom(value.id)} aria-label={`Удалить ценность «${value.label}»`}>
                  <Trash2 aria-hidden="true" />
                </Button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {PERSONAL_VALUE_GROUPS.map((group) => (
        <section className="flex flex-col gap-3" key={group.id} aria-labelledby={`values-${group.id}`}>
          <div className="flex items-center gap-3">
            <h3 className="m-0 text-xl font-semibold" id={`values-${group.id}`}>{group.label}</h3>
            <Badge variant="outline">{group.values.length}</Badge>
          </div>
          <ul role="list" className="flex flex-col gap-3">
            {group.values.map((value) => (
              <li key={value.id}>
                <ValueOption
                  checked={selected.has(value.id)}
                  description={value.description}
                  disabled={editingDisabled}
                  label={value.label}
                  onCheckedChange={(checked) => toggle(value.id, checked)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!readOnly && addingCustom && <Drawer open onOpenChange={open => {
        if (!open) { setAddingCustom(false); setCustomValue(""); setCustomDescription(""); }
      }}>
        <DrawerContent className="rollapp-body app-drawer--form">
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={addCustom}>
            <DrawerHeader><DrawerTitle>Добавить ценность</DrawerTitle><DrawerDescription>Добавьте свою формулировку.</DrawerDescription></DrawerHeader>
            <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <Input aria-label="Название" value={customValue} onChange={event => setCustomValue(event.target.value)} disabled={editingDisabled} required maxLength={80} />
              <Input aria-label="Описание" value={customDescription} onChange={event => setCustomDescription(event.target.value)} disabled={editingDisabled} required maxLength={240} />
            </div>
            <DrawerFooter><Button type="submit" disabled={editingDisabled || !customValue.trim() || !customDescription.trim()}>Добавить</Button></DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>}
    </div>
  );
}

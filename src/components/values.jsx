import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCareerContent, CareerContentError } from "@/components/career-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PERSONAL_VALUE_GROUPS, PERSONAL_VALUES } from "@/data/personal-values";
import { useSphereSharing } from "@/lib/sphere-sharing";

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

function sameContent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const valuesContent = useCareerContent("values", EMPTY_VALUES, "identity");
  const [draft, setDraft] = useState(EMPTY_VALUES);
  const [customValue, setCustomValue] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const editingDisabled = saving || valuesContent.loading || Boolean(valuesContent.error) || readOnly;

  useEffect(() => {
    if (valuesContent.loading) return;
    setDraft(normalizeValues(valuesContent.content));
  }, [valuesContent.content, valuesContent.loading]);

  const savedContent = normalizeValues(valuesContent.content);
  const dirty = !sameContent(draft, savedContent);
  const selected = useMemo(() => new Set(draft.selected), [draft.selected]);

  const toggle = (id, checked) => {
    setDraft((current) => ({
      ...current,
      selected: checked
        ? [...new Set([...current.selected, id])]
        : current.selected.filter((value) => value !== id),
    }));
    setSaveError("");
  };

  const addCustom = (event) => {
    event.preventDefault();
    if (editingDisabled) return;
    const label = customValue.trim().replace(/\s+/g, " ");
    const description = customDescription.trim().replace(/\s+/g, " ");
    if (!label || !description) return;
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
      setDraft((current) => ({
        selected: [...new Set([...current.selected, existing.id])],
        custom: current.custom.map((value) => value.id === existing.id ? { ...value, description } : value),
      }));
      setCustomValue("");
      setCustomDescription("");
      setSaveError("");
      return;
    }
    const id = `custom:${crypto.randomUUID()}`;
    setDraft((current) => ({
      selected: [...current.selected, id],
      custom: [...current.custom, { id, label, description }],
    }));
    setCustomValue("");
    setCustomDescription("");
    setSaveError("");
  };

  const removeCustom = (id) => {
    setDraft((current) => ({
      selected: current.selected.filter((value) => value !== id),
      custom: current.custom.filter((value) => value.id !== id),
    }));
    setSaveError("");
  };

  const save = async () => {
    if (editingDisabled || !dirty) return;
    setSaving(true);
    setSaveError("");
    try {
      await valuesContent.save(draft);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="identity-checklist not-typeset rollapp-body page-stack page-stack--sections" aria-busy={valuesContent.loading || saving}>
      {!readOnly && <header className="flex flex-wrap items-center justify-end gap-2">
        <Button className="h-12 min-w-40 text-base" type="button" disabled={!dirty || editingDisabled} onClick={save}>
          {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {valuesContent.loading ? "Загружаем" : saving ? "Сохраняем" : dirty || valuesContent.error ? "Сохранить выбор" : "Сохранено"}
        </Button>
      </header>}

      <CareerContentError error={valuesContent.error} onRetry={valuesContent.retry} />
      {saveError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось сохранить ценности</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

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

      {!readOnly && <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5" aria-labelledby="add-value-title">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-xl font-semibold" id="add-value-title">Не нашли нужную ценность?</h3>
          <p className="m-0 text-muted-foreground">Добавьте свою формулировку — она появится в начале страницы и сразу будет выбрана.</p>
        </div>
        <form className="grid gap-3" onSubmit={addCustom}>
          <Input
            className="h-12 text-base md:text-base"
            disabled={editingDisabled}
            maxLength={80}
            placeholder="Название, например «Созидание»"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            aria-label="Название своей ценности"
          />
          <Input
            className="h-12 text-base md:text-base"
            disabled={editingDisabled}
            maxLength={240}
            placeholder="Что эта ценность означает для вас"
            value={customDescription}
            onChange={(event) => setCustomDescription(event.target.value)}
            aria-label="Описание своей ценности"
          />
          <Button className="h-12 justify-self-end px-5 text-base" variant="outline" type="submit" disabled={!customValue.trim() || !customDescription.trim() || editingDisabled}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Добавить
          </Button>
        </form>
      </section>}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCareerContent, CareerContentError } from "@/components/career-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PERSONAL_VALUE_GROUPS, PERSONAL_VALUES } from "@/data/personal-values";

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
  const valuesContent = useCareerContent("values", EMPTY_VALUES, "identity");
  const [draft, setDraft] = useState(EMPTY_VALUES);
  const [search, setSearch] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (valuesContent.loading) return;
    setDraft(normalizeValues(valuesContent.content));
  }, [valuesContent.content, valuesContent.loading]);

  const savedContent = normalizeValues(valuesContent.content);
  const dirty = !sameContent(draft, savedContent);
  const selected = useMemo(() => new Set(draft.selected), [draft.selected]);
  const selectedCount = draft.selected.length;
  const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
  const visibleGroups = useMemo(() => PERSONAL_VALUE_GROUPS.map((group) => ({
    ...group,
    values: group.values.filter((value) => (
      !normalizedSearch
      || `${value.label} ${value.description}`.toLocaleLowerCase("ru-RU").includes(normalizedSearch)
    )),
  })).filter((group) => group.values.length > 0), [normalizedSearch]);

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

  const reset = () => {
    setDraft(EMPTY_VALUES);
    setSaveError("");
  };

  return (
    <div className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-3xl flex-col gap-2">
            <span className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">Личные ценности</span>
            <h2 className="m-0 text-3xl font-semibold tracking-tight">Что для меня действительно важно</h2>
            <p className="m-0 text-muted-foreground">
              Отметьте ценности, которые служат вам ориентирами. В списке 83 варианта; отсутствующую ценность можно добавить самостоятельно.
            </p>
          </div>
          <Badge className="min-h-8 px-3 text-sm" variant={selectedCount ? "default" : "secondary"}>
            Выбрано: {selectedCount}
          </Badge>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Найти ценность</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="h-12 pl-12 text-base md:text-base"
              type="text"
              role="searchbox"
              inputMode="search"
              enterKeyHint="search"
              placeholder="Найти ценность"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Button className="h-12 min-w-40 text-base" type="button" disabled={!dirty || saving} onClick={save}>
            {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {saving ? "Сохраняем" : dirty ? "Сохранить выбор" : "Сохранено"}
          </Button>
        </div>
      </header>

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {draft.custom.map((value) => (
              <div key={value.id} className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 ${selected.has(value.id) ? "border-foreground bg-accent" : "border-border bg-card"}`}>
                <Checkbox
                  className="mt-1 size-5"
                  checked={selected.has(value.id)}
                  disabled={saving}
                  onCheckedChange={(checked) => toggle(value.id, checked)}
                  aria-label={value.label}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <strong className="font-semibold text-foreground">{value.label}</strong>
                  {value.description && <span className="text-muted-foreground">{value.description}</span>}
                </span>
                <Button variant="ghost" size="icon-sm" type="button" disabled={saving} onClick={() => removeCustom(value.id)} aria-label={`Удалить ценность «${value.label}»`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {visibleGroups.length > 0 ? visibleGroups.map((group) => (
        <section className="flex flex-col gap-3" key={group.id} aria-labelledby={`values-${group.id}`}>
          <div className="flex items-center gap-3">
            <h3 className="m-0 text-xl font-semibold" id={`values-${group.id}`}>{group.label}</h3>
            <Badge variant="outline">{group.values.length}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.values.map((value) => (
              <ValueOption
                key={value.id}
                checked={selected.has(value.id)}
                description={value.description}
                disabled={saving}
                label={value.label}
                onCheckedChange={(checked) => toggle(value.id, checked)}
              />
            ))}
          </div>
        </section>
      )) : (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          По вашему запросу ничего не найдено. Добавьте собственную ценность ниже.
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5" aria-labelledby="add-value-title">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-xl font-semibold" id="add-value-title">Не нашли нужную ценность?</h3>
          <p className="m-0 text-muted-foreground">Добавьте свою формулировку — она появится в начале страницы и сразу будет выбрана.</p>
        </div>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]" onSubmit={addCustom}>
          <Input
            className="h-12 text-base md:text-base"
            maxLength={80}
            placeholder="Название, например «Созидание»"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            aria-label="Название своей ценности"
          />
          <Input
            className="h-12 text-base md:text-base"
            maxLength={240}
            placeholder="Что эта ценность означает для вас"
            value={customDescription}
            onChange={(event) => setCustomDescription(event.target.value)}
            aria-label="Описание своей ценности"
          />
          <Button className="h-12 px-5 text-base" variant="outline" type="submit" disabled={!customValue.trim() || !customDescription.trim() || saving}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Добавить
          </Button>
        </form>
      </section>

      <footer className="flex flex-col items-start justify-between gap-4 border-t pt-6 sm:flex-row sm:items-center">
        <p className="m-0 max-w-2xl text-sm text-muted-foreground">
          Перечень адаптирован из открытой методики{" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="https://motivationalinterviewing.org/personal-values-card-sort"
            target="_blank"
            rel="noreferrer"
          >
            Personal Values Card Sort Университета Нью-Мексико
          </a>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" type="button" disabled={selectedCount === 0 || saving} onClick={reset}>
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Снять выбор
          </Button>
          <Button className="min-h-12 text-base" type="button" disabled={!dirty || saving} onClick={save}>
            {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {saving ? "Сохраняем" : dirty ? "Сохранить выбор" : "Сохранено"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

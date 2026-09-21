import { useEffect, useMemo, useState } from "react";
import { ListChecks, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCareerContent, CareerContentError } from "@/components/career-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { PERSONAL_CHARACTER_TRAIT_GROUPS, PERSONAL_CHARACTER_TRAITS } from "@/data/personal-character-traits";
import { useSphereSharing } from "@/lib/sphere-sharing";

const EMPTY_CHARACTER_TRAITS = { selected: [], custom: [] };

function normalizeLegacyTrait(trait) {
  if (typeof trait === "string") return { label: trait.trim(), description: "" };
  if (!trait || typeof trait !== "object" || Array.isArray(trait)) return null;
  const label = typeof trait.title === "string" ? trait.title.trim() : "";
  const description = typeof trait.description === "string" ? trait.description.trim() : "";
  return label ? { label, description } : null;
}

function normalizeCharacterTraits(content) {
  if (Array.isArray(content)) {
    const traits = content.map(normalizeLegacyTrait).filter(Boolean);
    return {
      selected: traits.map((_, index) => `legacy:${index}`),
      custom: traits.map((trait, index) => ({ id: `legacy:${index}`, ...trait })),
    };
  }
  if (!content || typeof content !== "object") return EMPTY_CHARACTER_TRAITS;
  const selected = Array.isArray(content.selected)
    ? [...new Set(content.selected.filter((trait) => typeof trait === "string"))]
    : [];
  const custom = Array.isArray(content.custom)
    ? content.custom.filter((trait) => (
      trait && typeof trait === "object" && typeof trait.id === "string" && typeof trait.label === "string"
    )).map((trait) => ({
      id: trait.id,
      label: trait.label,
      description: typeof trait.description === "string" ? trait.description : "",
    }))
    : [];
  return { selected, custom };
}

function sameContent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function CharacterTraitOption({ checked, description, disabled, label, onCheckedChange }) {
  return (
    <label className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${checked ? "border-foreground bg-accent" : "border-border bg-card hover:bg-accent/50"} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      <Checkbox className="mt-1 size-5" checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <strong className="font-semibold text-foreground">{label}</strong>
        <span className="text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function CharacterTraits() {
  const { readOnly } = useSphereSharing();
  const characterContent = useCareerContent("character", EMPTY_CHARACTER_TRAITS, "identity");
  const [draft, setDraft] = useState(EMPTY_CHARACTER_TRAITS);
  const [search, setSearch] = useState("");
  const [customTrait, setCustomTrait] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const editingDisabled = saving || characterContent.loading || Boolean(characterContent.error) || readOnly;

  useEffect(() => {
    if (!characterContent.loading) setDraft(normalizeCharacterTraits(characterContent.content));
  }, [characterContent.content, characterContent.loading]);

  const savedContent = normalizeCharacterTraits(characterContent.content);
  const dirty = !sameContent(draft, savedContent);
  const selected = useMemo(() => new Set(draft.selected), [draft.selected]);
  const selectedCount = draft.selected.length;
  const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
  const visibleGroups = useMemo(() => PERSONAL_CHARACTER_TRAIT_GROUPS.map((group) => ({
    ...group,
    traits: group.traits.filter((trait) => !normalizedSearch || `${trait.label} ${trait.description}`.toLocaleLowerCase("ru-RU").includes(normalizedSearch)),
  })).filter((group) => group.traits.length > 0), [normalizedSearch]);
  const visibleCustomTraits = useMemo(() => draft.custom.filter((trait) => (
    !normalizedSearch || `${trait.label} ${trait.description}`.toLocaleLowerCase("ru-RU").includes(normalizedSearch)
  )), [draft.custom, normalizedSearch]);

  const toggle = (id, checked) => {
    setDraft((current) => ({
      ...current,
      selected: checked ? [...new Set([...current.selected, id])] : current.selected.filter((trait) => trait !== id),
    }));
    setSaveError("");
  };

  const addCustom = (event) => {
    event.preventDefault();
    if (editingDisabled) return;
    const label = customTrait.trim().replace(/\s+/g, " ");
    const description = customDescription.trim().replace(/\s+/g, " ");
    if (!label || !description) return;
    const normalizedLabel = label.toLocaleLowerCase("ru-RU");
    const standardTrait = PERSONAL_CHARACTER_TRAITS.find((trait) => trait.label.toLocaleLowerCase("ru-RU") === normalizedLabel);
    if (standardTrait) {
      toggle(standardTrait.id, true);
    } else {
      const existing = draft.custom.find((trait) => trait.label.toLocaleLowerCase("ru-RU") === normalizedLabel);
      if (existing) {
        setDraft((current) => ({
          selected: [...new Set([...current.selected, existing.id])],
          custom: current.custom.map((trait) => trait.id === existing.id ? { ...trait, description } : trait),
        }));
      } else {
        const id = `custom:${crypto.randomUUID()}`;
        setDraft((current) => ({
          selected: [...current.selected, id],
          custom: [...current.custom, { id, label, description }],
        }));
      }
      setSaveError("");
    }
    setCustomTrait("");
    setCustomDescription("");
  };

  const removeCustom = (id) => {
    setDraft((current) => ({
      selected: current.selected.filter((trait) => trait !== id),
      custom: current.custom.filter((trait) => trait.id !== id),
    }));
    setSaveError("");
  };

  const save = async () => {
    if (editingDisabled || !dirty) return;
    setSaving(true);
    setSaveError("");
    try {
      await characterContent.save(draft);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft((current) => ({ ...current, selected: [] }));
    setSaveError("");
  };

  return (
    <div className="not-typeset rollapp-body page-stack page-stack--sections mx-auto w-full max-w-(--layout-collection-width)" aria-busy={characterContent.loading || saving}>
      <header className="flex flex-col gap-5">
        <div className="flex justify-end">
          <span className="inline-flex min-h-8 items-center gap-2 text-base leading-6 font-normal text-muted-foreground sm:text-lg" role="status">
            <ListChecks className="size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span>Ключевых черт: {selectedCount}</span>
          </span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <InputGroup className="values-search h-12 min-w-0 flex-1">
            <InputGroupAddon align="inline-start"><Search className="size-5" aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput className="h-12 text-base md:text-base" type="text" role="searchbox" aria-label="Найти черту характера" inputMode="search" enterKeyHint="search" placeholder="Найти черту" value={search} onChange={(event) => setSearch(event.target.value)} />
          </InputGroup>
          {!readOnly && <Button className="h-12 min-w-40 text-base" type="button" disabled={!dirty || editingDisabled} onClick={save}>
            {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {characterContent.loading ? "Загружаем" : saving ? "Сохраняем" : dirty || characterContent.error ? "Сохранить выбор" : "Сохранено"}
          </Button>}
        </div>
      </header>

      <CareerContentError error={characterContent.error} onRetry={characterContent.retry} />
      {saveError && <Alert variant="destructive"><AlertTitle>Не удалось сохранить черты характера</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}

      {visibleCustomTraits.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="custom-traits-title">
          <h3 className="m-0 text-xl font-semibold" id="custom-traits-title">Мои черты</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCustomTraits.map((trait) => (
              <div key={trait.id} className={`flex min-h-24 min-w-0 items-start gap-3 rounded-xl border p-4 ${selected.has(trait.id) ? "border-foreground bg-accent" : "border-border bg-card"}`}>
                <Checkbox className="mt-1 size-5" checked={selected.has(trait.id)} disabled={editingDisabled} onCheckedChange={(checked) => toggle(trait.id, checked)} aria-label={trait.label} />
                <span className="flex min-w-0 flex-1 flex-col gap-1 break-words"><strong className="font-semibold text-foreground">{trait.label}</strong>{trait.description && <span className="text-muted-foreground">{trait.description}</span>}</span>
                {!readOnly && <Button className="shrink-0" variant="ghost" size="icon-sm" type="button" disabled={editingDisabled} onClick={() => removeCustom(trait.id)} aria-label={`Удалить черту «${trait.label}»`}><Trash2 aria-hidden="true" /></Button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {visibleGroups.map((group) => (
        <section className="flex flex-col gap-3" key={group.id} aria-labelledby={`traits-${group.id}`}>
          <div className="flex items-center gap-3"><h3 className="m-0 text-xl font-semibold" id={`traits-${group.id}`}>{group.label}</h3><Badge variant="outline">{group.traits.length}</Badge></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.traits.map((trait) => <CharacterTraitOption key={trait.id} checked={selected.has(trait.id)} description={trait.description} disabled={editingDisabled} label={trait.label} onCheckedChange={(checked) => toggle(trait.id, checked)} />)}
          </div>
        </section>
      ))}
      {visibleGroups.length === 0 && visibleCustomTraits.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{readOnly ? "По вашему запросу ничего не найдено." : "По вашему запросу ничего не найдено. Добавьте свою черту ниже."}</div>}

      {!readOnly && <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5" aria-labelledby="add-trait-title">
        <div className="flex flex-col gap-1"><h3 className="m-0 text-xl font-semibold" id="add-trait-title">Не нашли нужную черту?</h3><p className="m-0 text-muted-foreground">Добавьте свою формулировку — она появится в начале страницы и сразу будет выбрана.</p></div>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]" onSubmit={addCustom}>
          <Input className="h-12 text-base md:text-base" disabled={editingDisabled} maxLength={120} placeholder="Название, например «Настойчивость»" value={customTrait} onChange={(event) => setCustomTrait(event.target.value)} aria-label="Название своей черты характера" />
          <Input className="h-12 text-base md:text-base" disabled={editingDisabled} maxLength={20_000} placeholder="Как эта черта проявляется у вас" value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} aria-label="Описание своей черты характера" />
          <Button className="h-12 px-5 text-base" variant="outline" type="submit" disabled={!customTrait.trim() || !customDescription.trim() || editingDisabled}><Plus data-icon="inline-start" aria-hidden="true" />Добавить</Button>
        </form>
      </section>}

      <footer className="flex flex-col items-start justify-between gap-4 border-t pt-6 sm:flex-row sm:items-center">
        <p className="m-0 max-w-(--layout-text-width) text-sm text-muted-foreground">Выберите качества, которые чаще всего проявляются в ваших решениях, общении и работе.</p>
        {!readOnly && <div className="flex flex-wrap gap-2">
          <Button variant="ghost" type="button" disabled={selectedCount === 0 || editingDisabled} onClick={reset}><RotateCcw data-icon="inline-start" aria-hidden="true" />Снять выбор</Button>
          <Button className="min-h-12 text-base" type="button" disabled={!dirty || editingDisabled} onClick={save}>{saving && <Spinner data-icon="inline-start" aria-hidden="true" />}{characterContent.loading ? "Загружаем" : saving ? "Сохраняем" : dirty || characterContent.error ? "Сохранить выбор" : "Сохранено"}</Button>
        </div>}
      </footer>
    </div>
  );
}

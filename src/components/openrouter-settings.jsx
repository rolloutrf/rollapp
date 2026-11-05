import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { DrawerFooter } from "@/components/form-surface";

export function OpenRouterSettings({ draft, onDraftChange, disabled = false, onBusyChange }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const settingsRequest = useRef(0);
  const modelsRequest = useRef(0);
  const modelAnchor = useRef(null);

  const loadSettings = useCallback(async () => {
    const requestId = ++settingsRequest.current;
    setLoading(true);
    setSettingsError("");
    try {
      const next = await api.get("/me/openrouter");
      if (!mounted.current || requestId !== settingsRequest.current) return;
      setSettings(next);
    } catch (loadError) {
      if (mounted.current && requestId === settingsRequest.current) setSettingsError(loadError.message);
    } finally {
      if (mounted.current && requestId === settingsRequest.current) setLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    const requestId = ++modelsRequest.current;
    setModelsLoading(true);
    setModelsError("");
    try {
      const result = await api.get("/me/openrouter/models");
      if (mounted.current && requestId === modelsRequest.current) setModels(result.models);
    } catch (loadError) {
      if (mounted.current && requestId === modelsRequest.current) setModelsError(loadError.message);
    } finally {
      if (mounted.current && requestId === modelsRequest.current) setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadSettings();
    loadModels();
    return () => {
      mounted.current = false;
      settingsRequest.current++;
      modelsRequest.current++;
    };
  }, [loadSettings, loadModels]);

  const { apiKey } = draft;
  const modelId = draft.modelId ?? settings?.model ?? "";
  const availableModel = models.find((model) => model.id === modelId);
  // Keep the persisted choice visible even if the model catalogue is offline.
  const selectedModel = availableModel || (modelId ? { id: modelId, name: modelId, unavailable: true } : null);
  const modelOptions = selectedModel && !availableModel ? [selectedModel, ...models] : models;
  const changed = Boolean(apiKey.trim()) || Boolean(settings?.configured && modelId !== settings.model);
  const controlsDisabled = disabled || busy || loading;

  const mutate = async (request, message) => {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const next = await request();
      if (!mounted.current) return;
      setSettings(next);
      onDraftChange({ apiKey: "", modelId: null });
      setKeyVisible(false);
      toast.success(message);
    } catch (saveError) {
      if (mounted.current) setError(saveError.message);
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };

  const save = () => {
    if (controlsDisabled || !settings?.available || !availableModel || !changed) return;
    const key = apiKey.trim();
    if (key && !/^sk-or-v1-[A-Za-z0-9_-]{11,503}$/.test(key)) {
      setError("Введите API-ключ OpenRouter в формате sk-or-v1-…");
      return;
    }
    if (!key && !settings.configured) return;
    mutate(
      () => key ? api.post("/me/openrouter", { apiKey: key, model: modelId }) : api.patch("/me/openrouter", { model: modelId }),
      key ? "Ключ и модель OpenRouter сохранены" : "Модель OpenRouter изменена",
    );
  };

  const saveLabel = settings?.configured ? "Сохранить настройки OpenRouter" : "Подключить OpenRouter";
  const disconnectLabel = settings?.available ? "Отключить личный ключ" : "Отключить ключ";

  return <>
    <div className="openrouter-settings app-drawer-body not-typeset rollapp-body flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      {settings?.configured && <Badge variant="secondary">Ключ сохранён</Badge>}
      {loading ? <div className="flex min-h-12 items-center gap-2" role="status"><Spinner />Загружаем настройки…</div>
        : settingsError ? <div className="flex flex-wrap items-center gap-2 text-destructive" role="alert"><span>Не удалось загрузить настройки: {settingsError}</span><Button type="button" variant="ghost" onClick={loadSettings}>Повторить</Button></div>
        : !settings.available ? <>
          <p className="text-destructive" role="status">Настройки OpenRouter временно недоступны: на сервере не настроено защищённое хранилище ключей.</p>
          {settings.configured && <p className="text-muted-foreground">Сохранён ключ {settings.keyHint}</p>}
          {error && <p className="text-destructive" role="alert">{error}</p>}
        </> : <>
            <p className="text-muted-foreground">Выберите модель для поиска предложений. Запросы оплачиваются с вашего баланса OpenRouter.</p>
            <Field>
              <FieldLabel htmlFor="settings-openrouter-key">{settings.configured ? "Новый API-ключ" : "API-ключ"}</FieldLabel>
              {settings.configured && <p className="text-muted-foreground">Сохранён ключ {settings.keyHint}. Оставьте поле пустым, чтобы изменить только модель.</p>}
              <InputGroup>
                <InputGroupInput
                  id="settings-openrouter-key"
                  type={keyVisible ? "text" : "password"}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="sk-or-v1-…"
                  value={apiKey}
                  disabled={controlsDisabled || !settings.available}
                  onChange={(event) => { onDraftChange({ ...draft, apiKey: event.target.value }); setError(""); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); save(); } }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-sm" disabled={controlsDisabled} aria-label={keyVisible ? "Скрыть API-ключ" : "Показать API-ключ"} onClick={() => setKeyVisible((value) => !value)}>
                    {keyVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription><a className="underline underline-offset-4" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">Создать ключ</a> · После сохранения ключ целиком не показывается.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-openrouter-model">Модель</FieldLabel>
              <Combobox
                items={modelOptions}
                value={selectedModel || null}
                onValueChange={(model) => { if (model) { onDraftChange({ ...draft, modelId: model.id }); setError(""); } }}
                itemToStringLabel={(model) => model.name}
                itemToStringValue={(model) => model.id}
                isItemEqualToValue={(a, b) => a.id === b.id}
                disabled={controlsDisabled || modelsLoading || !models.length}
              >
                <div ref={modelAnchor} className="min-w-0">
                  <ComboboxInput id="settings-openrouter-model" className="w-full min-w-0" placeholder={modelsLoading ? "Загружаем модели…" : "Название модели или провайдер"} />
                </div>
                <ComboboxContent anchor={modelAnchor} className="not-typeset rollapp-body min-w-0 w-(--anchor-width)">
                  <ComboboxEmpty>Модель не найдена</ComboboxEmpty>
                  <ComboboxList>{(model) => <ComboboxItem key={model.id} value={model} disabled={model.unavailable} className="min-h-12 px-3 py-2 pr-8 text-base">
                    <div className="flex min-w-0 flex-col gap-1"><span className="whitespace-normal">{model.name}</span><span className="text-xs text-muted-foreground wrap-anywhere">{model.id}</span></div>
                  </ComboboxItem>}</ComboboxList>
                </ComboboxContent>
              </Combobox>
              {!modelsLoading && !modelsError && modelId && !availableModel && <p className="text-xs text-muted-foreground">Модель {modelId} сейчас недоступна. Сохранённый выбор не изменён. Выберите другую модель.</p>}
              {modelsError && <div className="flex flex-wrap items-center gap-2 text-destructive" role="status"><span>{modelsError}</span><Button type="button" variant="ghost" className="h-auto min-h-12 whitespace-normal text-destructive hover:text-destructive" onClick={loadModels}>Повторить загрузку</Button></div>}
            </Field>
            {error && <p className="text-destructive" role="alert">{error}</p>}
            {!settings.configured && settings.serverFallbackConfigured && <p className="text-xs text-muted-foreground">Пока личный ключ не подключён, поиск использует настройки Rollapp.</p>}
          </>}
    </div>
    <DrawerFooter>
      {!loading && !settingsError && settings?.available && <Button type="button" disabled={controlsDisabled || !availableModel || !changed} aria-label={saveLabel} aria-busy={busy || undefined} onClick={save}>
        {busy && <Spinner />}{settings.configured ? "Сохранить" : "Подключить"}
      </Button>}
      {!loading && !settingsError && settings?.configured && <Button type="button" data-control-icon variant="destructive" size="icon" aria-label={disconnectLabel} title={disconnectLabel} disabled={controlsDisabled} onClick={() => mutate(() => api.delete("/me/openrouter"), "Личный ключ OpenRouter отключён")}>
        <Trash2 aria-hidden="true" />
      </Button>}
    </DrawerFooter>
  </>;
}

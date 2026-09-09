import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

export function OpenRouterSettings({ disabled = false, onBusyChange }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const modelAnchor = useRef(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setSettingsError("");
    try {
      const next = await api.get("/me/openrouter");
      if (!mounted.current) return;
      setSettings(next);
      setModelId(next.model);
    } catch (loadError) {
      if (mounted.current) setSettingsError(loadError.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError("");
    try {
      const result = await api.get("/me/openrouter/models");
      if (mounted.current) setModels(result.models);
    } catch (loadError) {
      if (mounted.current) setModelsError(loadError.message);
    } finally {
      if (mounted.current) setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadSettings();
    loadModels();
    return () => { mounted.current = false; };
  }, [loadSettings, loadModels]);

  const selectedModel = models.find((model) => model.id === modelId);
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
      setModelId(next.model);
      setApiKey("");
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
    if (controlsDisabled || !settings?.available || !selectedModel || !changed) return;
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

  return (
    <Card className="openrouter-settings not-typeset rollapp-body" aria-label="Настройки OpenRouter">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <LockKeyhole className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <strong className="font-medium">OpenRouter</strong>
          </div>
          {settings?.configured && <Badge variant="secondary">Подключён</Badge>}
        </div>
        <p>Подключите свой ключ и выберите модель для поиска предложений. Запросы оплачиваются с вашего баланса OpenRouter.</p>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {loading ? <div className="flex min-h-12 items-center gap-2" role="status"><Spinner />Загружаем настройки…</div>
          : settingsError ? <Alert variant="destructive"><AlertTitle>Не удалось загрузить настройки</AlertTitle><AlertDescription>{settingsError}<Button type="button" variant="outline" onClick={loadSettings}>Повторить</Button></AlertDescription></Alert>
          : <>
            {!settings.available && <Alert variant="destructive"><AlertTitle>Подключение временно недоступно</AlertTitle><AlertDescription>На сервере нужно подключить защищённое хранилище ключей.</AlertDescription></Alert>}
            {settings.configured && <p className="text-xs text-muted-foreground">Сохранён ключ {settings.keyHint}. Оставьте поле пустым, чтобы изменить только модель.</p>}
            <Field>
              <FieldLabel htmlFor="settings-openrouter-key">{settings.configured ? "Новый API-ключ" : "API-ключ"}</FieldLabel>
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
                  onChange={(event) => { setApiKey(event.target.value); setError(""); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-sm" disabled={controlsDisabled} aria-label={keyVisible ? "Скрыть API-ключ" : "Показать API-ключ"} onClick={() => setKeyVisible((value) => !value)}>
                    {keyVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription><a className="underline underline-offset-4" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">Создать ключ в OpenRouter</a>. Ключ хранится в зашифрованном виде и после сохранения целиком не показывается.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-openrouter-model">Модель</FieldLabel>
              <Combobox
                items={models}
                value={selectedModel || null}
                onValueChange={(model) => { if (model) { setModelId(model.id); setError(""); } }}
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
                  <ComboboxList>{(model) => <ComboboxItem key={model.id} value={model} className="min-h-12 px-3 py-2 pr-8 text-base">
                    <div className="flex min-w-0 flex-col gap-1"><span className="whitespace-normal">{model.name}</span><span className="text-xs text-muted-foreground wrap-anywhere">{model.id}</span></div>
                  </ComboboxItem>}</ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldDescription>Модели с поддержкой инструментов поиска и структурированных ответов.</FieldDescription>
              {!modelsLoading && !modelsError && modelId && !selectedModel && <p className="text-xs text-muted-foreground">Модель {modelId} сейчас недоступна. Выберите другую.</p>}
              {modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}<Button type="button" variant="outline" className="h-auto min-h-12 whitespace-normal" onClick={loadModels}>Повторить загрузку моделей</Button></AlertDescription></Alert>}
            </Field>
            {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex flex-col gap-2">
              <Button type="button" className="h-auto min-h-12 w-full whitespace-normal py-3" disabled={controlsDisabled || !settings.available || !selectedModel || !changed} aria-busy={busy || undefined} onClick={save}>
                {busy && <Spinner />}{settings.configured ? "Сохранить настройки OpenRouter" : "Подключить OpenRouter"}
              </Button>
              {settings.configured && <Button type="button" variant="destructive" className="w-full" disabled={controlsDisabled} onClick={() => mutate(() => api.delete("/me/openrouter"), "Личный ключ OpenRouter отключён")}>Отключить личный ключ</Button>}
            </div>
            {!settings.configured && settings.serverFallbackConfigured && <p className="text-xs text-muted-foreground">Пока личный ключ не подключён, поиск использует настройки Rollapp.</p>}
          </>}
      </CardContent>
    </Card>
  );
}

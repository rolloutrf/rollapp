import { useEffect, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { api } from "@/api";
import { ControlBar } from "@/components/control-bar";
import { EditorDeleteAction } from "@/components/editor-delete-action";
import { DrawerFooter } from "@/components/form-surface";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

const scopeLabels = { read: "Только чтение", write: "Чтение и запись" };
const expiryFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });

export function ProfileMcpKeys({ onBusyChange }) {
  const [keys, setKeys] = useState(null);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [issueError, setIssueError] = useState("");
  const [allowWrite, setAllowWrite] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [issuedKey, setIssuedKey] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/mcp/tokens").then(
      ({ keys: savedKeys }) => { if (active) setKeys(savedKeys); },
      (error) => { if (active) setLoadError(error.message); },
    );
    return () => { active = false; };
  }, [reload]);

  const issueKey = async (event) => {
    event.preventDefault();
    if (!keys || issuing || revoking) return;
    setIssuing(true);
    onBusyChange(true);
    setIssueError("");
    try {
      const { token, ...summary } = await api.post("/mcp/tokens", { scope: allowWrite ? "write" : "read" });
      setKeys((current) => [summary, ...current]);
      setIssuedKey({ id: summary.id, token });
      setAllowWrite(false);
      setCopyStatus("");
    } catch (error) {
      setIssueError(error.message);
    } finally {
      setIssuing(false);
      onBusyChange(false);
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(issuedKey.token);
      setCopyStatus("Ключ скопирован");
    } catch {
      setCopyStatus("Выделите и скопируйте ключ из поля.");
    }
  };

  const revokeKey = (id) => {
    setKeys((current) => current.filter((key) => key.id !== id));
    if (issuedKey?.id === id) {
      setIssuedKey(null);
      setCopyStatus("");
    }
  };

  return <form onSubmit={issueKey} className="flex min-h-0 flex-1 flex-col">
    <ScrollArea className="mx-auto min-h-0 w-full max-w-full flex-1">
      <section aria-label="Ключи доступа MCP" className="not-typeset rollapp-body grid min-w-0 gap-4 px-4 py-4">
        <p>Подключите Codex или другой MCP-клиент к своим задачам и вишлистам. Ключ действует 30 дней.</p>
        <p className="break-all text-muted-foreground">https://роллапп.рф/mcp</p>
        {!keys && (loadError
          ? <div className="grid gap-2" role="alert">
            <p className="text-destructive">{loadError}</p>
            <Button type="button" variant="outline" className="min-h-12 w-fit rounded-full" onClick={() => { setLoadError(""); setReload(reload + 1); }}>Повторить</Button>
          </div>
          : <div className="flex items-center gap-2" role="status"><Spinner />Загружаем ключи…</div>)}
        {keys && <>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="mcp-allow-write">Разрешить запись</FieldLabel>
              <FieldDescription id="mcp-write-description">Запись позволяет создавать и обновлять задачи и желания.</FieldDescription>
            </FieldContent>
            <Switch id="mcp-allow-write" aria-describedby="mcp-write-description" checked={allowWrite}
              disabled={issuing || revoking} onCheckedChange={setAllowWrite} />
          </Field>
          {issueError && <p role="alert" className="text-destructive">{issueError}</p>}
          {issuedKey && <Field>
            <FieldLabel htmlFor="mcp-issued-key">Новый ключ MCP</FieldLabel>
            <FieldDescription>Ключ показывается один раз. Скопируйте его сейчас.</FieldDescription>
            <Input id="mcp-issued-key" readOnly value={issuedKey.token} spellCheck={false} autoComplete="off" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="outline" className="min-h-12 w-fit rounded-full" onClick={copyKey}>
              <Copy aria-hidden="true" />Скопировать ключ
            </Button>
            {copyStatus && <p role="status">{copyStatus}</p>}
          </Field>}
          {keys.length ? <ul aria-label="Активные ключи" className="grid gap-2">
            {keys.map(({ id, scope, expiresAt }) => <li key={id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div className="grid min-w-0 gap-1">
                <p className="font-medium">Ключ …{id.slice(-8)}</p>
                <span className="text-xs text-muted-foreground">{scopeLabels[scope] ?? "Ранее выпущенный ключ"} · до {expiryFormat.format(new Date(expiresAt))}</span>
              </div>
              <ControlBar className="shrink-0">
                <EditorDeleteAction
                  title="Отозвать ключ MCP?"
                  description={`Клиенты с ключом …${id.slice(-8)} потеряют доступ.`}
                  label={`Отозвать ключ …${id.slice(-8)}`}
                  disabled={issuing || revoking}
                  onBusyChange={(busy) => { setRevoking(busy); onBusyChange(busy); }}
                  onDelete={() => api.delete(`/mcp/tokens/${id}`)}
                  onDeleted={() => revokeKey(id)}
                />
              </ControlBar>
            </li>)}
          </ul> : <p className="text-muted-foreground">Активных ключей пока нет.</p>}
        </>}
      </section>
    </ScrollArea>
    <DrawerFooter>
      <Button type="submit" disabled={!keys || issuing || revoking} aria-busy={issuing || undefined}>
        {issuing ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" aria-hidden="true" />}Создать ключ
      </Button>
    </DrawerFooter>
  </form>;
}

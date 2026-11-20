import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { api } from "@/modules/runtime/api.js";
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

const serverUrl = "https://роллапп.рф/mcp";
const codexCommands = [
  "read -rs ROLLAPP_MCP_TOKEN",
  "export ROLLAPP_MCP_TOKEN",
  "codex mcp add rollapp \\",
  `  --url ${new URL(serverUrl).href} \\`,
  "  --bearer-token-env-var ROLLAPP_MCP_TOKEN",
  "codex",
].join("\n");

function McpSetupGuide() {
  return <>
    <section aria-labelledby="mcp-setup-heading" className="typeset typeset-rollapp" data-typeset-group>
      <h3 id="mcp-setup-heading">Как подключить</h3>
      <ol>
        <li>Нажмите «Создать ключ» и скопируйте его. Полный ключ показывается только при создании и действует 30 дней. Не отправляйте его в чат.</li>
        <li>Добавьте в MCP-клиенте сервер <strong>Streamable HTTP</strong>. Укажите адрес <code className="wrap-anywhere">{serverUrl}</code> и передайте ключ как <strong>Bearer token</strong>.</li>
        <li>Чтобы проверить подключение, попросите ассистента: «Покажи мои списки To Do в Роллаппе».</li>
      </ol>
    </section>
    <Accordion>
      <AccordionItem value="codex">
        <AccordionTrigger headerAs="h4" className="min-h-12 items-center gap-2 text-rollapp-body! hover:no-underline">
          Codex в терминале
        </AccordionTrigger>
        <AccordionContent>
          <div className="typeset typeset-rollapp" data-typeset-group>
            <p>В терминале macOS или Linux с установленным Codex CLI выполните первую строку. Вставьте ключ и нажмите Enter: ввод скрыт. Затем выполните остальные строки в том же окне.</p>
            <pre className="whitespace-pre-wrap wrap-anywhere"><code>{codexCommands}</code></pre>
            <p><a href="https://developers.openai.com/codex/mcp/#connect-an-existing-mcp-server" target="_blank" rel="noreferrer">Инструкция Codex в OpenAI Docs</a></p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </>;
}

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
      <section aria-label="Ключи доступа MCP" className="rollapp-body grid min-w-0 gap-4 px-4 py-4">
        <p>MCP позволяет Codex и другим ассистентам работать с задачами и вишлистами вашего аккаунта Роллапп.</p>
        <McpSetupGuide />
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
              <FieldDescription id="mcp-write-description">По умолчанию ключ только для чтения. Запись позволяет менять задачи, добавлять желания и менять их статус.</FieldDescription>
            </FieldContent>
            <Switch id="mcp-allow-write" aria-describedby="mcp-write-description" checked={allowWrite}
              disabled={issuing || revoking} onCheckedChange={setAllowWrite} />
          </Field>
          {issueError && <p role="alert" className="text-destructive">{issueError}</p>}
          {issuedKey && <Field>
            <FieldLabel htmlFor="mcp-issued-key">Новый ключ MCP</FieldLabel>
            <FieldDescription>Скопируйте ключ сейчас и укажите его только в настройках клиента или в скрытом вводе терминала.</FieldDescription>
            <Input id="mcp-issued-key" readOnly value={issuedKey.token} spellCheck={false} autoComplete="off" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="outline" className="min-h-12 w-fit rounded-full" onClick={copyKey}>
              Скопировать ключ
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
        Создать ключ
      </Button>
    </DrawerFooter>
  </form>;
}

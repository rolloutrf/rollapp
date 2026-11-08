import { useEffect, useState } from "react";
import { ArrowUpRight, Cloud, Download } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { api } from "@/api";
import { EditableTextBlock } from "@/components/editable-text-block";
import { InlineSaveStatus } from "@/components/inline-document";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useInlineAutosave } from "@/hooks/use-inline-autosave";

export const PRIVATE_NOTES_PATH = "/app/private-notes";
const API = "/private-notes";

const connectionMessages = {
  cancelled: "Подключение отменено.",
  failed: "Яндекс Диск не подключился. Попробуйте ещё раз.",
  missing: "Яндекс Диск не подключился. Выберите аккаунт, где лежат ваши заметки, или восстановите папку на Диске.",
};

export function PrivateNotesLink({ onNavigate }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    api.get(`${API}/connection`).then((data) => {
      if (active) setEnabled(Boolean(data.enabled));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!enabled) return null;
  return <PageActionButton variant="outline" nativeButton={false} role="link"
    render={<Link to={PRIVATE_NOTES_PATH} onClick={event => {
      event.preventDefault();
      onNavigate(PRIVATE_NOTES_PATH);
    }} />}>
    <Cloud aria-hidden="true" />Личные заметки на Диске
  </PageActionButton>;
}

const draftKey = (ownerId) => `rollapp:disk-notes:${ownerId}`;

function readDraft(ownerId) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey(ownerId)) || "null")?.draft;
    return typeof draft === "string" ? draft : null;
  } catch { return null; }
}

function DownloadDraft({ markdown }) {
  return <PageActionButton type="button" variant="outline" onClick={() => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "Личные заметки — черновик.md";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}><Download aria-hidden="true" />Скачать черновик</PageActionButton>;
}

function NoteEditor({ ownerId, note, onReconnect, connecting, notesApi }) {
  const [failure, setFailure] = useState("");
  const autosave = useInlineAutosave({
    value: note.markdown,
    revision: note.revision,
    storageKey: draftKey(ownerId),
    onSave: async (markdown, revision) => {
      try {
        const saved = await notesApi.patch(API, { ownerId, markdown, revision });
        if (typeof saved.revision !== "string") throw new Error("Яндекс Диск не подтвердил сохранение.");
        setFailure("");
        return saved;
      } catch (error) {
        setFailure(error.code || "");
        throw error;
      }
    },
  });

  return <>
    <EditableTextBlock value={autosave.draft} onChange={autosave.change} onBlur={autosave.flush}
      label="Личные заметки" placeholder="О чём хотите написать?" allowImages={false} />
    <InlineSaveStatus autosave={autosave} />
    {autosave.status === "error" && <div className="not-typeset flex flex-wrap gap-2">
      <DownloadDraft markdown={autosave.draft} />
      {failure === "DISK_RECONNECT" && <PageActionButton type="button" variant="outline" onClick={onReconnect}
        disabled={connecting}>Подключить Диск снова</PageActionButton>}
      {failure === "DISK_NOTE_CONFLICT" && <PageActionButton variant="outline" nativeButton={false} role="link"
        render={<Link to={PRIVATE_NOTES_PATH} target="_blank" rel="noopener noreferrer" />}>
        Версия с Диска<ArrowUpRight aria-hidden="true" />
      </PageActionButton>}
    </div>}
  </>;
}

export function PrivateNotes({ ownerId, notesApi = api }) {
  const { search } = useLocation();
  const [load, setLoad] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const offlineDraft = load.error ? readDraft(ownerId) : null;
  const callbackStatus = new URLSearchParams(search).get("disk");
  const oauthMessage = Object.hasOwn(connectionMessages, callbackStatus) ? connectionMessages[callbackStatus] : "";
  useEffect(() => {
    let active = true;
    setLoad({ status: "loading" });
    const run = async () => {
      try {
        const connection = await notesApi.get(`${API}/connection`);
        if (!active) return;
        if (!connection.enabled) { setLoad({ status: "disabled" }); return; }
        if (!connection.connected) { setLoad({ status: "connect" }); return; }
        const note = await notesApi.get(`${API}?ownerId=${encodeURIComponent(ownerId)}`);
        if (typeof note.markdown !== "string" || typeof note.revision !== "string") {
          throw new Error("Не удалось прочитать заметки с Яндекс Диска.");
        }
        if (active) setLoad({ status: "ready", note });
      } catch (error) {
        if (active) setLoad({ status: error.code === "DISK_RECONNECT" ? "reconnect" : "error", error: error.message });
      }
    };
    void run();
    return () => { active = false; };
  }, [ownerId, attempt, notesApi]);

  const connect = async () => {
    setConnecting(true);
    setConnectionError("");
    try {
      const { authorizationUrl } = await notesApi.post(`${API}/connection/start`, { ownerId });
      window.location.assign(authorizationUrl);
    } catch (error) {
      setConnecting(false);
      setConnectionError(error.message);
    }
  };

  return <div className="app-page page-stack typeset typeset-rollapp">
    <header data-typeset-group>
      <h1>Личные заметки</h1>
      {load.status === "ready" && <p>Заметки и история изменений хранятся в вашей папке на Яндекс Диске.</p>}
      {load.status === "connect" && <p>Подключите Яндекс Диск. Rollapp получит доступ только к папке приложения и будет сохранять заметки туда.</p>}
      {load.status === "disabled" && <p>Подключение Яндекс Диска пока недоступно.</p>}
    </header>
    {load.status === "loading" && <p role="status">Загружаем заметки…</p>}
    {(connectionError || oauthMessage || load.error) && <Alert className="not-typeset" variant="destructive">
      <AlertDescription>{connectionError || oauthMessage || load.error}</AlertDescription>
    </Alert>}
    {["connect", "reconnect", "error"].includes(load.status) && <div className="not-typeset flex flex-wrap gap-2">
      {load.status === "error"
        ? <PageActionButton type="button" variant="outline" onClick={() => setAttempt(value => value + 1)}>Повторить загрузку</PageActionButton>
        : <PageActionButton type="button" onClick={connect} disabled={connecting}>
          <Cloud aria-hidden="true" />{load.status === "reconnect" ? "Подключить Диск снова" : "Подключить Яндекс Диск"}
        </PageActionButton>}
      {offlineDraft !== null && <DownloadDraft markdown={offlineDraft} />}
    </div>}
    {load.status === "ready" && <NoteEditor ownerId={ownerId} note={load.note} onReconnect={connect} connecting={connecting} notesApi={notesApi} />}
  </div>;
}

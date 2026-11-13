import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseAssistantAction } from '../../shared/messenger-assistant.js';

export const NOTE_TASKS_REQUEST_EVENT = "rollapp:assistant-note-tasks";

export function usePlanningAssistantDraft(type) {
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const incoming = location.state?.assistantDraft;
  useEffect(() => {
    if (!incoming || incoming.type !== type) return;
    const { assistantDraft, ...rest } = location.state;
    const action = parseAssistantAction(assistantDraft.type, assistantDraft.value);
    setDraft(action);
    // Consume the handoff before a native mobile form adds its own history entry.
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: rest });
  }, [incoming, location, navigate, type]);
  return [!incoming && draft?.type === type ? draft.value : null, () => setDraft(null)];
}

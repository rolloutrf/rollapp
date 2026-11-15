import { createContext, useCallback, useEffect, useState, useContext } from "react";
import { api, bindApiAccount } from "../runtime/api.js";
import { refreshSession } from "./session-refresh.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNavigate } from "react-router-dom";
import { useToast } from "../shell/toast.jsx";

export const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, updateSession] = useState({ user: null, loading: true, error: null });
  const [retrying, setRetrying] = useState(false);
  const setSession = useCallback((next) => {
    if (typeof next !== "function") bindApiAccount(next.user?.id);
    updateSession(next);
  }, []);
  const refresh = useCallback(() => refreshSession(() => api.get("/me"), setSession), [setSession]);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);
  useEffect(() => {
    if (!session.user?.id) return undefined;
    const checkAccount = () => { api.get("/me").catch(() => {}); };
    const onPageShow = (event) => { if (event.persisted) checkAccount(); };
    window.addEventListener("focus", checkAccount);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("focus", checkAccount);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [session.user?.id]);
  if (session.error && !session.user) {
    return <div className="auth-page rollapp-body">
      <div className="auth-panel">
        <div className="auth-form">
          <h1>Не удалось загрузить Rollapp</h1>
          <Alert variant="destructive"><AlertDescription>{session.error.message}</AlertDescription></Alert>
          <ShadcnButton className="auth-submit" disabled={retrying} aria-busy={retrying || undefined} onClick={async () => {
            setRetrying(true);
            try { await refresh(); } catch { /* Keep the error visible for another retry. */ }
            finally { setRetrying(false); }
          }}>{retrying && <Spinner data-icon="inline-start" />}Повторить</ShadcnButton>
        </div>
      </div>
    </div>;
  }
  return <SessionContext.Provider value={{ ...session, refresh, setSession }}>{children}</SessionContext.Provider>;
}

export function useSession() { return useContext(SessionContext); }

export function useLogout() {
  const { setSession } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  return useCallback(async () => {
    try {
      await api.post("/auth/logout", {});
      setSession({ user: null, loading: false, error: null });
      navigate("/");
      toast("Вы вышли из Rollapp на этом устройстве");
      return true;
    } catch (error) {
      toast(error?.message || "Не удалось выйти из аккаунта");
      return false;
    }
  }, [navigate, setSession, toast]);
}

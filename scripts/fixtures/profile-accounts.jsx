import { createRoot } from "react-dom/client";
import { unstable_HistoryRouter as HistoryRouter, Route, Routes } from "react-router-dom";
import { createPageHistory } from "@/applications/page-history";
import { AppProfileButton, AuthPage, MobileFormPages, ProfileEditorProvider, SessionProvider, ToastProvider, useSession } from "@/App.jsx?account-smoke";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

function Home() {
  const { user, loading } = useSession();
  if (loading) return null;
  return user ? <AppProfileButton user={user} compact /> : <p>Нет активного аккаунта</p>;
}

function Fixture() {
  useVisualViewport();
  return <ToastProvider><SessionProvider><MobileFormPages><ProfileEditorProvider>
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  </ProfileEditorProvider></MobileFormPages></SessionProvider></ToastProvider>;
}

createRoot(document.getElementById("root")).render(<HistoryRouter history={createPageHistory()}><Fixture /></HistoryRouter>);

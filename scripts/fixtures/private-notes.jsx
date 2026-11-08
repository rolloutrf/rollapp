import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppShell, CollectionNavigationContext, GlobalAppChrome, SessionContext, ToastContext } from "@/App.jsx?notes-chrome";
import { PrivateNotes } from "@/components/private-notes";
import "@/styles.css";
import "@/index.css";

async function request(method, path, body) {
  const result = await window.noteFixtureRequest(method, path, body);
  if (result.error) throw Object.assign(new Error(result.error), { code: result.code });
  return result;
}
const notesApi = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  patch: (path, body) => request("PATCH", path, body),
};
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <SessionContext.Provider value={{ user: { id: "fixture-owner", canDiscoverSpheres: true, accountType: "personal" } }}>
      <ToastContext.Provider value={() => {}}>
        <CollectionNavigationContext.Provider value={{ collection: null }}>
          <GlobalAppChrome />
          <AppShell><PrivateNotes ownerId="fixture-owner" notesApi={notesApi} /></AppShell>
        </CollectionNavigationContext.Provider>
      </ToastContext.Provider>
    </SessionContext.Provider>
  </BrowserRouter>,
);

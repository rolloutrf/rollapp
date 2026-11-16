import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { unstable_HistoryRouter as HistoryRouter } from "react-router-dom";
import { createPageHistory } from "./page-history.js";
import App from "../App.jsx";
import "../styles.css";
import "../index.css";
import { loadTelegramWebAppSdk } from "../modules/identification/telegram.js";

export async function mountApplication(application = null) {
  await loadTelegramWebAppSdk();

  const history = createPageHistory(window, application);
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <HistoryRouter history={history}>
        <App application={application} />
      </HistoryRouter>
    </StrictMode>,
  );
}

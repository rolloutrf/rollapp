import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "../App.jsx";
import "../styles.css";
import "../index.css";
import { loadTelegramWebAppSdk } from "../telegram.js";

export async function mountApplication(application = null) {
  await loadTelegramWebAppSdk();

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <BrowserRouter>
        <App application={application} />
      </BrowserRouter>
    </StrictMode>,
  );
}

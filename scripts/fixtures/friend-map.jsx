import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SessionContext } from "@/modules/auth/session.jsx";
import { FriendMapPage } from "@/modules/map/friend-map.jsx";
import { AppShell } from "@/modules/shell/app-shell.jsx";
import { ToastContext } from "@/modules/shell/toast.jsx";
import "../../src/styles.css";
import "../../src/index.css";

const user = { id: "owner", name: "Михаил", username: "owner", friendMapLocationEnabled: true };

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <SessionContext.Provider value={{ user }}>
      <ToastContext.Provider value={() => {}}>
        <AppShell collectionChrome>
          <div className="app-page rollapp-body">
            <FriendMapPage user={user} />
          </div>
        </AppShell>
      </ToastContext.Provider>
    </SessionContext.Provider>
  </BrowserRouter>,
);

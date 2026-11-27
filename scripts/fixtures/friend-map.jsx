import React from "react";
import { createRoot } from "react-dom/client";
import { FriendLocationReporter } from "@/modules/map/friend-location-reporter.jsx";
import { FriendMapPage } from "@/modules/map/friend-map.jsx";
import { ToastContext } from "@/modules/shell/toast.jsx";
import "../../src/styles.css";
import "../../src/index.css";

const user = { id: "owner", name: "Михаил", username: "owner" };

createRoot(document.getElementById("root")).render(
  <ToastContext.Provider value={() => {}}>
    <main className="app-layout app-layout--dark">
      <FriendLocationReporter userId={user.id} />
      <div className="app-page rollapp-body">
        <FriendMapPage user={user} />
      </div>
    </main>
  </ToastContext.Provider>,
);

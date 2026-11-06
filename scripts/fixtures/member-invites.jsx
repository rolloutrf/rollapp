import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MemberNumberPage } from "@/components/member-number-page";
import { InvitesManager } from "@/components/invites-manager";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { AuthPage, ProfileSettingsModal, SessionContext, ToastContext } from "@/App.jsx?member-invites-smoke";
import "../../src/styles.css";
import "../../src/index.css";

const search = new URLSearchParams(location.search);
const user = { id: "fixture-user", memberNumber: search.has("assigned") ? "30000" : null };
createRoot(document.getElementById("root")).render(<BrowserRouter>
  <SessionContext.Provider value={{ user: null, refresh: async () => {} }}><ToastContext.Provider value={() => {}}><MobileFormPages>
    {search.has("profile") ? <ProfileSettingsModal user={{ id: "fixture-user", name: "Владелец", username: "koloskof", bio: "", birthday: null, avatarUrl: "", canInvite: true, memberNumber: null }} onClose={() => {}} onSaved={() => {}} />
      : search.has("auth") ? <AuthPage mode="register" invite={"a".repeat(43)} inviteEmail="invited@example.com" /> : <div className="app-layout app-layout--dark"><main className="app-main">
      {search.has("invites") ? <section className="app-page rollapp-body"><InvitesManager /></section> : <MemberNumberPage user={user} />}
    </main></div>}
  </MobileFormPages></ToastContext.Provider></SessionContext.Provider>
</BrowserRouter>);

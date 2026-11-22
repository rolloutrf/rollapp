import React, { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import App from "@/App.jsx";
import { api } from "@/modules/runtime/api.js";
import { createRoot } from "react-dom/client";
import { RegistrationAccountFields } from "@/modules/auth/registration-account-fields.jsx";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import "../../src/styles.css";
import "../../src/index.css";

function Fixture() {
  const [value, setValue] = useState({ name: "", email: "", password: "", accountType: "personal", businessCategory: null });
  const [submitted, setSubmitted] = useState(null);
  return <div className="auth-page rollapp-body"><div className="auth-panel">
    <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(value); }}>
      <div><span className="eyebrow">Новый аккаунт</span><h1>Создать свой Rollapp</h1></div>
      <FieldGroup className="gap-4">
          <RegistrationAccountFields id="registration" value={value} onChange={setValue} />
          {[['name', 'Как вас зовут', 'text'], ['email', 'Email', 'email'], ['password', 'Пароль', 'password']].map(([key, label, type]) => <Field key={key}><FieldLabel htmlFor={key}>{label}</FieldLabel><Input id={key} required type={type} minLength={key === 'password' ? 8 : undefined} value={value[key]} onChange={(event) => setValue({ ...value, [key]: event.target.value })} /></Field>)}
      </FieldGroup>
      <Button type="submit" className="auth-submit">{value.accountType === "business" ? "Создать бизнес-аккаунт" : "Создать вишлист"}</Button>
      <p className="auth-switch">Уже есть аккаунт? <a href="#login">Войти</a></p>
      <output hidden data-state>{JSON.stringify(value)}</output><output hidden data-submitted>{JSON.stringify(submitted)}</output>
    </form>
  </div></div>;
}

const root = createRoot(document.getElementById("root"));
const params = new URLSearchParams(location.search);
if (params.has("owner-catalog")) {
  const target = params.get("owner-catalog");
  const section = params.get("section");
  const owner = { id: "test-owner", accountType: "personal", canDiscoverSpheres: true, name: "Владелец", username: "test-owner" };
  const accounts = Array.from({ length: target === "wishlist" ? 52 : 3 }, (_, index) => ({
    name: index === 1 ? "АкадемияПрофессиональнойПодготовкиИДополнительногоОбразования" : `Организация ${index + 1}`,
    username: `business-account-${index + 1}`,
    offerConsent: false,
  }));
  let grants = params.has("audit-section") || params.has("revoke") || params.has("old-grant")
    ? [{ id: "business-1", ...accounts[0], grantSection: target === "wishlist" ? "wishlist" : section }] : [];
  window.catalogCalls = [];
  let failLoad = params.has("retry");
  let failSave = params.has("retry");
  api.get = async (path) => {
    if (path === "/me") return { user: owner };
    const { pathname } = new URL(path, location.origin);
    if (pathname === "/sphere-shares/context") {
      window.ownerScopeRead = true;
      return { owner, isOwner: true, people: grants, requests: [{ id: "old-request" }] };
    }
    const endpoint = target === "wishlist" ? `/wishlist-business/${section}/accounts` : `/business-catalog/${target}`;
    if (pathname === endpoint) {
      if (failLoad) { failLoad = false; throw new Error("Повторите загрузку"); }
      return { accounts: params.has("empty") ? [] : accounts.map(account => ({ ...account })) };
    }
    if (pathname === "/wishes") return { wishes: [], lists: [], groups: [], viewerId: owner.id };
    if (pathname === "/sphere-shares/candidates") throw new Error("Unexpected private access query");
    return {};
  };
  api.post = async (path, body) => {
    if (path === "/wishes/backfill-previews" && params.has("revoke")) return {};
    window.catalogCalls.push({ path, body });
    if (path === "/sphere-shares" && params.has("old-grant")) {
      grants = grants.filter(grant => grant.id !== body.viewerId || grant.grantSection !== body.section);
      return { granted: false };
    }
    const account = accounts.find(candidate => path === `/brand-offer-consents/${candidate.username}`);
    if (!account) throw new Error(`Unexpected request: ${path}`);
    if (failSave) { failSave = false; throw new Error("Повторите изменение подписки"); }
    account.offerConsent = body.granted;
    return { granted: body.granted };
  };
  const catalogue = target === "wishlist" ? "/app/wishes/catalog?source=brands&tab=" : `/app/spheres/${target}/business/catalog?tab=`;
  const home = target === "wishlist" ? "/app/wishes?tab=" : `/app/spheres/${target}?tab=`;
  history.replaceState({}, "", (params.has("revoke") || params.has("audit-section") ? home : catalogue) + encodeURIComponent(section));
  root.render(<BrowserRouter><App /></BrowserRouter>);
} else if (params.has("clients")) {
  const seller = { id: "seller-account", name: "Мой магазин", username: "seller-profile", accountType: "business", businessCategory: "seller", sellerSpace: "products" };
  const shared = { id: "shared-client", name: "Александр Соколов", username: "shared-client" };
  const shares = ["products", "wishlist"].map(section => ({ owner: shared, sphere: "wishlist", section }));
  let accessUnavailable = params.has("access-unavailable");
  window.restoreClientAccess = () => { accessUnavailable = false; };
  window.clientAccessReads = [];
  api.get = async (path) => {
    window.clientAccessReads.push(path);
    if (path === "/me") return { user: seller };
    if (path === "/sphere-shares/incoming") {
      if (accessUnavailable) throw new Error("Внутренняя ошибка. Мы уже разбираемся.");
      return { shares };
    }
    return {};
  };
  api.post = async (path) => { throw new Error(`Unexpected POST ${path}`); };
  history.replaceState({}, "", "/app/business/access");
  root.render(<BrowserRouter><App /></BrowserRouter>);
} else {
  root.render(<Fixture />);
}

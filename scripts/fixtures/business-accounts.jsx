import React, { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import App from "@/App.jsx";
import { api } from "@/modules/runtime/api.js";
import { createRoot } from "react-dom/client";
import { RegistrationAccountFields } from "@/modules/auth/registration-account-fields.jsx";
import { BusinessRequestScopeFields } from "@/modules/access/business-request-scope-fields.jsx";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { businessRequestSpheres } from "../../shared/modules/catalog-marketplace/business-accounts.js";
import { SPHERE_SECTIONS } from "../../shared/modules/access/sphere-sharing.js";
import "../../src/styles.css";
import "../../src/index.css";

function Fixture() {
  const query = new URLSearchParams(location.search);
  const account = { accountType: "business", businessCategory: query.get("category") };
  const [value, setValue] = useState({ name: "", email: "", password: "", accountType: "personal", businessCategory: null });
  const [sphere, setSphere] = useState(businessRequestSpheres(account)[0]?.id || "identity");
  const [section, setSection] = useState(SPHERE_SECTIONS[sphere][0]);
  const [submitted, setSubmitted] = useState(null);
  const request = query.has("request");
  return <div className="auth-page rollapp-body"><div className="auth-panel">
    <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(request ? { sphere, section } : value); }}>
      <div><span className="eyebrow">{request ? "Бизнес-аккаунт" : "Новый аккаунт"}</span><h1>{request ? "Запросить доступ" : "Создать свой Rollapp"}</h1></div>
      <FieldGroup className="gap-4">
        {request ? <BusinessRequestScopeFields account={account} sphere={sphere} section={section} onSphereChange={(next) => { setSphere(next); setSection(SPHERE_SECTIONS[next][0]); }} onSectionChange={setSection} /> : <>
          <RegistrationAccountFields id="registration" value={value} onChange={setValue} />
          {[['name', 'Как вас зовут', 'text'], ['email', 'Email', 'email'], ['password', 'Пароль', 'password']].map(([key, label, type]) => <Field key={key}><FieldLabel htmlFor={key}>{label}</FieldLabel><Input id={key} required type={type} minLength={key === 'password' ? 8 : undefined} value={value[key]} onChange={(event) => setValue({ ...value, [key]: event.target.value })} /></Field>)}
        </>}
      </FieldGroup>
      <Button type="submit" className="auth-submit">{request ? "Отправить запрос" : value.accountType === "business" ? "Создать бизнес-аккаунт" : "Создать вишлист"}</Button>
      {!request && <p className="auth-switch">Уже есть аккаунт? <a href="#login">Войти</a></p>}
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
    isFollowing: false,
  }));
  let grants = [{ id: "business-1", ...accounts[0], grantSection: "wishlist" }];
  window.catalogCalls = [];
  let failLoad = params.has("retry");
  let failSave = params.has("retry");
  api.get = async (path) => {
    if (path === "/me") return { user: owner };
    const { pathname } = new URL(path, location.origin);
    if (pathname === "/sphere-shares/context") return { owner, isOwner: true, people: target === "wishlist" ? grants : [], requests: [] };
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
    if (path === "/sphere-shares" && params.has("revoke")) {
      grants = grants.filter(grant => grant.id !== body.viewerId || grant.grantSection !== body.section);
      return { granted: false };
    }
    const account = accounts.find(candidate => path === `/profile/${candidate.username}/follow`);
    if (!account) throw new Error(`Unexpected request: ${path}`);
    if (failSave) { failSave = false; throw new Error("Повторите изменение подписки"); }
    account.isFollowing = body.following;
    return { following: body.following };
  };
  const catalogue = target === "wishlist" ? "/app/wishes/catalog?source=brands&tab=" : `/app/spheres/${target}/business/catalog?tab=`;
  history.replaceState({}, "", (params.has("revoke") ? "/app/wishes?tab=" : catalogue) + encodeURIComponent(section));
  root.render(<BrowserRouter><App /></BrowserRouter>);
} else if (params.has("clients")) {
  const seller = { id: "seller-account", name: "Мой магазин", username: "seller-profile", accountType: "business", businessCategory: "seller", sellerSpace: "products" };
  const shared = { id: "shared-client", name: "Александр Соколов", username: "shared-client" };
  const pending = { id: "pending-client", name: "Алёна Воронцова", username: "pending-client" };
  const prospect = { id: "new-client", name: "Виктория Александрова-Рождественская", username: "long-username-with-many-characters" };
  const people = [shared, pending, prospect, { id: "fourth-client", name: "Инна Крылова", username: "fourth-client" }];
  const shares = ["products", "wishlist"].map(section => ({ owner: shared, sphere: "wishlist", section }));
  let requests = [{ id: "initial-request", owner: pending, sphere: "wishlist", section: "products", status: "pending" }];
  let accessUnavailable = params.has("access-unavailable");
  window.restoreClientAccess = () => { accessUnavailable = false; };
  window.clientAccessCalls = [];
  window.clientAccessReads = [];
  api.get = async (path) => {
    window.clientAccessReads.push(path);
    if (path === "/me") return { user: seller };
    if (path === "/sphere-shares/incoming") return { shares };
    if (path === "/business-access/requests") {
      if (accessUnavailable) throw new Error("Внутренняя ошибка. Мы уже разбираемся.");
      return { shares, requests };
    }
    if (path.startsWith("/business-access/users")) {
      const query = new URL(path, location.origin).searchParams.get("search")?.toLowerCase() || "";
      return { people: people.filter(person => `${person.name} ${person.username}`.toLowerCase().includes(query)) };
    }
    return {};
  };
  api.post = async (path, body) => {
    if (path !== "/business-access/requests") throw new Error(`Unexpected request: ${path}`);
    window.clientAccessCalls.push(body);
    requests = [...requests, { id: "new-request", owner: prospect, sphere: body.sphere, section: body.section, status: "pending" }];
  };
  api.delete = async (path) => {
    if (path !== "/business-access/requests/initial-request") throw new Error(`Unexpected request: ${path}`);
    window.clientAccessCalls.push(path);
    requests = requests.filter(request => request.id !== "initial-request");
  };
  history.replaceState({}, "", "/app/business/access");
  root.render(<BrowserRouter><App /></BrowserRouter>);
} else {
  root.render(<Fixture />);
}

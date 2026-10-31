import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { RegistrationAccountFields } from "@/components/registration-account-fields";
import { BusinessRequestScopeFields } from "@/components/business-request-scope-fields";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { businessRequestSpheres } from "../../shared/business-accounts.js";
import { SPHERE_SECTIONS } from "../../shared/sphere-sharing.js";
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

createRoot(document.getElementById("root")).render(<Fixture />);

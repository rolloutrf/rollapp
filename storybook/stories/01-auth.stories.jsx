import { AuthPage, RegistrationForm } from "@/modules/auth/auth-pages.jsx";
import { Page, Scenario, hold, fixtureError } from "../support.jsx";

export default { id: "rollapp-auth", title: "РОЛЛАПП/Модули РОЛЛАУТ/01 Авторизация" };

const invalidCredentials = () => { throw fixtureError("Проверьте почту и пароль.", 401); };
const config = (enabled, legacySignInEnabled) => ({ enabled, legacySignInEnabled });

function Auth({ provider, recovery, status }) {
  const path = recovery === "reset" ? "/reset-password?token=storybook" : recovery ? "/forgot-password" : "/login";
  return <Scenario path={path} user={null} routes={{
    "GET /auth/yandex/config": status === "loading" ? hold : config(provider !== "unavailable", provider === "legacy"),
    "GET /auth/phone/config": { enabled: true },
    "POST /auth/login": invalidCredentials,
    "POST /auth/password/forgot": {},
    "POST /auth/password/reset": invalidCredentials,
  }}><AuthPage recovery={recovery} /></Scenario>;
}

export const Yandex = { name: "Вход через Яндекс ID", render: Auth, args: { provider: "yandex" }, argTypes: { provider: { control: "select", options: ["yandex", "legacy", "unavailable"] } } };
export const EmailAndPhone = { ...Yandex, name: "Почта и телефон", args: { provider: "legacy" } };
export const Unavailable = { ...Yandex, name: "Провайдер недоступен", args: { provider: "unavailable" } };
export const Loading = { name: "Проверка способов входа", render: Auth, args: { status: "loading" } };
export const Forgot = { name: "Забыли пароль", render: Auth, args: { provider: "legacy", recovery: "forgot" } };
export const Reset = { name: "Новый пароль", render: Auth, args: { provider: "legacy", recovery: "reset" } };
export const Registration = { name: "Регистрация по приглашению", render: () => <Scenario user={null} routes={{ "POST /auth/register": invalidCredentials }}><Page><RegistrationForm invite={{ token: "storybook" }} email="example@example.test" /></Page></Scenario> };

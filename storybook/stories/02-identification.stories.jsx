import { useState } from "react";
import { PhoneOtpFields } from "@/modules/identification/phone-otp.jsx";
import { Page } from "../support.jsx";

export default { id: "rollapp-identification", title: "РОЛЛАПП/Модули РОЛЛАУТ/02 Идентификация" };

function Phone({ initialStep, initialError, retrySeconds, loading }) {
  const [step, setStep] = useState(initialStep);
  const [phone, setPhone] = useState("+7 999 123-45-67");
  const [code, setCode] = useState("");
  const [error, setError] = useState(initialError);
  return <Page title="Подтверждение телефона"><form className="grid max-w-sm gap-4" onSubmit={(event) => {
    event.preventDefault();
    if (step === "phone") setStep("otp");
    else setError("Код не подошёл или устарел.");
  }}>
    <PhoneOtpFields flow={{
      step, phone, code, setPhone, setCode, error, loading, retrySeconds,
      phoneMasked: "+7 999 ***-**-67", clearError: () => setError(""),
      requestCode: () => setError(""), changePhone: () => { setError(""); setStep("phone"); },
    }} />
  </form></Page>;
}
const defaults = { initialStep: "phone", initialError: "", retrySeconds: 0, loading: false };
const render = (args) => <Phone key={JSON.stringify(args)} {...args} />;
export const Number = { name: "Номер телефона", render, args: defaults };
export const Code = { name: "Код из SMS", render, args: { ...defaults, initialStep: "otp" } };
export const Cooldown = { name: "Ожидание повторной отправки", render, args: { ...Code.args, retrySeconds: 42 } };
export const Invalid = { name: "Неверный код", render, args: { ...Code.args, initialError: "Код не подошёл или устарел." } };
export const Sending = { name: "Отправка кода", render, args: { ...defaults, loading: true } };

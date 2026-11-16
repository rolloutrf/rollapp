import { useState } from "react";
import { BusinessRequestScopeFields } from "@/modules/access/business-request-scope-fields.jsx";
import { BusinessClientAccessActions } from "@/modules/access/business-client-access-actions.jsx";
import { Page, Scenario, person } from "../support.jsx";
import { seller } from "../samples.js";

export default { id: "rollapp-access", title: "РОЛЛАПП/Модули/14 Доступ и выдача прав" };

function Access({ fixed, granted, disabled }) {
  const account = fixed ? { ...seller, accountType: "business", businessCategory: "seller", sellerSpace: "products" } : seller;
  const [section, setSection] = useState("products");
  const [sphere, setSphere] = useState("wishlist");
  const [selected, setSelected] = useState(false);
  const sections = granted ? [{ sphere, section }] : [];
  return <Scenario><Page title="Доступ к пространству"><div className="grid max-w-md gap-4">
    <BusinessRequestScopeFields account={account} sphere={sphere} section={section} disabled={disabled}
      onSphereChange={setSphere} onSectionChange={setSection} />
    {!disabled && <BusinessClientAccessActions account={account} person={person} sections={sections} onRequest={() => setSelected(true)} />}
    {selected && <p role="status">Выбрана отправка запроса</p>}
  </div></Page></Scenario>;
}
export const Request = { name: "Запросить доступ", render: Access, args: { fixed: false, granted: false, disabled: false } };
export const Granted = { ...Request, name: "Разделы доступны", args: { ...Request.args, granted: true } };
export const Seller = { ...Request, name: "Доступ продавца к категории", args: { ...Request.args, fixed: true, granted: true } };
export const Disabled = { ...Request, name: "Форма заблокирована", args: { ...Request.args, disabled: true } };

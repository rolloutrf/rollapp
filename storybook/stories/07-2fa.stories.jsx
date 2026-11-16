import { Page } from "../support.jsx";
import { EmptyState } from "@/modules/shell/page-feedback.jsx";
import { ShieldCheck } from "lucide-react";

export default { id: "rollapp-two-factor", title: "РОЛЛАПП/Модули РОЛЛАУТ/07 2FA" };

export const Status = { name: "Статус модуля", render: () => <Page title="2FA">
  <EmptyState icon={ShieldCheck} title="Отдельный второй фактор запланирован" text="Подтверждение телефона, привязки Яндекс ID и Telegram представлены в модуле «Идентификация»." />
</Page> };

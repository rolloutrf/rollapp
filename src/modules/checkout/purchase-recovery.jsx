import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOperationRecovery } from "../payments/use-operation-recovery.js";

const messages = {
  unreadable: "Не удалось прочитать результат покупки.",
  unknown: "Ответ об оплате пока не получен. Можно проверить заказ в журнале.",
  storage: "Разрешите хранение данных для Rollapp, чтобы безопасно восстановить покупку.",
};

export function usePurchaseRecovery(options) {
  return useOperationRecovery({ ...options, field: "purchase", messages });
}

export function PurchaseRecoveryNotice({ error, result }) {
  if (result === "missing") return <div className="grid gap-1" role="status">
    <p>В журнале пока нет покупки.</p>
    <p className="text-xs text-muted-foreground">Повторная оплата сохранит условия. Роллы спишутся только один раз.</p>
  </div>;
  if (result === "conflict") return <Alert variant="destructive"><AlertDescription>
    По этому номеру уже записана другая операция. Сверьте её в истории заказов.
  </AlertDescription></Alert>;
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  return null;
}

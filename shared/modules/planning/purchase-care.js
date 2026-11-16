export const PURCHASE_CARE_LABELS = {
  warranty: "Проверить гарантию",
  maintenance: "Обслуживание покупки",
};

export const PURCHASE_CARE_TYPES = Object.keys(PURCHASE_CARE_LABELS);
export const EMPTY_PURCHASE_CARE = { warrantyOn: "", warrantyReminderOn: "", maintenanceOn: "", maintenanceNote: "" };
export const purchaseCareTaskId = (purchaseId, type) => `purchase-care:${type}:${purchaseId}`;

export function purchaseCareItem(task) {
  const item = task?.relatedItems?.find(({ kind }) => kind === "purchase-care");
  return item && PURCHASE_CARE_TYPES.includes(item.type) && task.id === purchaseCareTaskId(item.id, item.type) ? item : null;
}

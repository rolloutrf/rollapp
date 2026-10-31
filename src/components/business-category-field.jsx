import { BUSINESS_CATEGORIES } from "../../shared/business-accounts.js";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BusinessCategoryField({ id, value, onValueChange, disabled = false }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Категория бизнеса</FieldLabel>
      <Select value={value || null} onValueChange={onValueChange} required disabled={disabled}>
        <SelectTrigger id={id} className="w-full" aria-describedby={`${id}-description`}>
          <SelectValue placeholder="Выберите категорию">
            {(selected) => BUSINESS_CATEGORIES.find(({ id: categoryId }) => categoryId === selected)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="w-(--anchor-width)" alignItemWithTrigger={false}>
          {BUSINESS_CATEGORIES.map((category) => (
            <SelectItem key={category.id} value={category.id} className="*:min-w-0 *:shrink">
              <span className="flex min-w-0 flex-col whitespace-normal">
                <span>{category.label}</span>
                <small className="text-xs text-muted-foreground">{category.sphereLabel}</small>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription id={`${id}-description`}>Категория определяет сферу работы. Доступ к данным клиента — только с его согласия.</FieldDescription>
    </Field>
  );
}

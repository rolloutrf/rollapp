import { BusinessCategoryField } from "@/components/business-category-field";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function RegistrationAccountFields({ id, value, onChange, disabled = false }) {
  return (
    <>
      <Field>
        <FieldLabel>Тип аккаунта</FieldLabel>
        <RadioGroup className="auth-account-types" value={value.accountType} disabled={disabled} onValueChange={(accountType) => onChange({ ...value, accountType, businessCategory: null })} aria-label="Тип аккаунта">
          <label className="auth-account-type" data-active={value.accountType === "personal" ? "true" : undefined}>
            <RadioGroupItem value="personal" />
            <span><strong>Личный</strong><small>Вишлист и личные сферы</small></span>
          </label>
          <label className="auth-account-type" data-active={value.accountType === "business" ? "true" : undefined}>
            <RadioGroupItem value="business" />
            <span><strong>Бизнес</strong><small>Запросы на доступ к пространствам клиентов</small></span>
          </label>
        </RadioGroup>
        <FieldDescription>Бизнес получает доступ только после подтверждения владельца сферы.</FieldDescription>
      </Field>
      {value.accountType === "business" && (
        <BusinessCategoryField id={`${id}-business-category`} value={value.businessCategory} onValueChange={(businessCategory) => onChange({ ...value, businessCategory })} disabled={disabled} />
      )}
    </>
  );
}

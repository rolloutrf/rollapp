import { WISHLIST_SPACES } from "../../shared/wishlist-business.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BusinessCategoryField } from "@/components/business-category-field";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function RegistrationAccountFields({ id, value, onChange, disabled = false }) {
  return (
    <>
      <Field>
        <FieldLabel>Тип аккаунта</FieldLabel>
        <RadioGroup className="auth-account-types" value={value.accountType} disabled={disabled} onValueChange={(accountType) => onChange({ ...value, accountType, businessCategory: null, sellerSpace: null })} aria-label="Тип аккаунта">
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
        <BusinessCategoryField id={`${id}-business-category`} value={value.businessCategory} onValueChange={(businessCategory) => onChange({ ...value, businessCategory, sellerSpace: null })} disabled={disabled} />
      )}
      {value.accountType === "business" && value.businessCategory === "seller" && <Field>
        <FieldLabel htmlFor={`${id}-seller-space`}>Раздел Вишлиста</FieldLabel>
        <Select value={value.sellerSpace || null} required disabled={disabled} onValueChange={(sellerSpace) => onChange({ ...value, sellerSpace })}>
          <SelectTrigger id={`${id}-seller-space`} className="w-full"><SelectValue placeholder="Выберите раздел">{selected => WISHLIST_SPACES.find(item => item.id === selected)?.label}</SelectValue></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>{WISHLIST_SPACES.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <FieldDescription>Страница, айтемы и запросы доступа будут относиться к этому разделу.</FieldDescription>
      </Field>}
    </>
  );
}

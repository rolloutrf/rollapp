import { businessCategoryFor, businessRequestSpheres } from "../../shared/business-accounts.js";
import { SPHERE_SECTIONS, SPHERE_SECTION_LABELS } from "../../shared/sphere-sharing.js";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BusinessRequestScopeFields({ account, sphere, section, onSphereChange, onSectionChange, disabled = false }) {
  const spheres = businessRequestSpheres(account);
  return (
    <>
      <Field>
        <FieldLabel htmlFor="business-access-sphere">Сфера</FieldLabel>
        <Select value={sphere} onValueChange={onSphereChange} disabled={disabled || Boolean(businessCategoryFor(account))}>
          <SelectTrigger id="business-access-sphere" className="w-full"><SelectValue>{() => spheres.find(({ id }) => id === sphere)?.label || sphere}</SelectValue></SelectTrigger>
          <SelectContent className="w-(--anchor-width)" alignItemWithTrigger={false}>
            {spheres.map(({ id, label }) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="business-access-section">Пространство</FieldLabel>
        <Select value={section} onValueChange={onSectionChange} disabled={disabled}>
          <SelectTrigger id="business-access-section" className="w-full"><SelectValue>{() => SPHERE_SECTION_LABELS[section] || section}</SelectValue></SelectTrigger>
          <SelectContent className="w-(--anchor-width)" alignItemWithTrigger={false}>
            {(SPHERE_SECTIONS[sphere] || []).map((id) => <SelectItem key={id} value={id}>{SPHERE_SECTION_LABELS[id] || id}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

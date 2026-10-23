import { z } from "zod";
const optionalEducationDateSchema = z.union([z.literal(""), z.string().date()]);
const medicationImageUrlSchema = z.string().trim().max(2000).refine(value => !value || /^\/api\/media\/[0-9a-f-]{36}$/i.test(value) || /^https?:\/\//i.test(value) && URL.canParse(value), "Укажите ссылку на изображение по HTTP или HTTPS");
const medicationTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const medicationFrequencyTimeCount = {
  once_daily: 1,
  twice_daily: 2,
  three_times_daily: 3,
  weekly: 1,
  as_needed: 0,
};
export const medicationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  groupId: z.string().trim().min(1).max(200).nullable().default(null),
  medicationForm: z.enum(["tablet", "capsule", "solution", "drops", "spray", "injection", "cream", "other"]),
  status: z.enum(["active", "planned", "paused", "completed"]),
  dosage: z.string().trim().max(160),
  frequency: z.enum(["once_daily", "twice_daily", "three_times_daily", "weekly", "as_needed", "custom"]),
  scheduleTimes: z.array(medicationTimeSchema).max(6),
  purpose: z.string().trim().max(240),
  prescriber: z.string().trim().max(240),
  instructions: z.string().trim().max(2_000),
  startOn: optionalEducationDateSchema,
  endOn: optionalEducationDateSchema,
  notes: z.string().trim().max(4_000),
  imageUrl: medicationImageUrlSchema.optional(),
}).strict().superRefine((medication, context) => {
  if (medication.startOn && medication.endOn && medication.endOn < medication.startOn) {
    context.addIssue({ code: "custom", path: ["endOn"], message: "Окончание курса должно быть не раньше начала" });
  }
  if (new Set(medication.scheduleTimes).size !== medication.scheduleTimes.length) {
    context.addIssue({ code: "custom", path: ["scheduleTimes"], message: "Время приёма не должно повторяться" });
  }
  const expectedTimeCount = medicationFrequencyTimeCount[medication.frequency];
  if (expectedTimeCount !== undefined && medication.scheduleTimes.length !== expectedTimeCount) {
    context.addIssue({ code: "custom", path: ["scheduleTimes"], message: "Количество времён должно соответствовать частоте приёма" });
  }
  if (medication.frequency === "custom" && medication.status !== "planned" && medication.scheduleTimes.length === 0) {
    context.addIssue({ code: "custom", path: ["scheduleTimes"], message: "Укажите хотя бы одно время приёма" });
  }
});

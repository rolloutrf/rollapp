import { WISHLIST_SPACE_IDS } from "../shared/wishlist-business.js";
import { z } from "zod";
import { BUSINESS_CATEGORY_IDS } from "../shared/business-accounts.js";

// Applied only by an explicitly invoked schema operation, never verify startup.
export const businessCategorySchema = `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_category TEXT
  CHECK (business_category IS NULL OR (account_type='business' AND business_category IN (${BUSINESS_CATEGORY_IDS.map((id) => `'${id}'`).join(",")})))`;

export function createRegistrationSchema(credentialsSchema) {
  return credentialsSchema.extend({
    name: z.string().trim().min(2).max(80),
    accountType: z.enum(["personal", "business"]).default("personal"),
    businessCategory: z.enum(BUSINESS_CATEGORY_IDS).nullish(),
    sellerSpace: z.enum(WISHLIST_SPACE_IDS).nullish(),
  }).superRefine((value, context) => {
    if (value.accountType === "business" && !value.businessCategory) {
      context.addIssue({ code: "custom", path: ["businessCategory"], message: "Выберите категорию бизнеса" });
    }
    if (value.businessCategory === "seller" && !value.sellerSpace) context.addIssue({ code: "custom", path: ["sellerSpace"], message: "Выберите раздел Вишлиста" });
    if (value.sellerSpace != null && (value.accountType !== "business" || value.businessCategory !== "seller")) context.addIssue({ code: "custom", path: ["sellerSpace"], message: "Раздел доступен только продавцу" });
    if (value.accountType === "personal" && value.businessCategory != null) {
      context.addIssue({ code: "custom", path: ["businessCategory"], message: "Категория доступна только бизнес-аккаунту" });
    }
  });
}

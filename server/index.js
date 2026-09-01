import "dotenv/config";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { initializeDatabase } from "./schema.js";
import { isMemoryDatabase, pool, query, transaction } from "./db.js";
import { addDefaultFriend } from "./default-friend.js";
import { getEmailConfig, sendPasswordResetEmail } from "./email.js";
import { deleteOwnedWishGroup, moveOwnedWishGroup, removeWishFromOwnedGroup } from "./wish-groups.js";
import { VehicleCatalogUnavailableError, vehicleCatalog } from "./vehicle-catalog.js";
import { fetchPublicHtml, fetchPublicJson, MetadataFetchError } from "./metadata-fetch.js";
import { resolveRetailerMetadata } from "./retailer-metadata.js";
import { fetchOpenRouterMarketplaceOffers, OpenRouterOffersError } from "./openrouter-marketplace-offers.js";
import { fetchMarketplaceResolvedOffers, filterDirectOffersForWish, mergeDirectOffers } from "./marketplace-resolvers.js";
import { createRateLimit } from "./rate-limit.js";
import { canonicalRetailerProductUrl } from "../shared/retailer-previews.js";
import { loadContactAvatar } from "./contact-avatars.js";
import { contactAvatarPath, contactFromOverride, findContact, listContacts, mergeContactOverride } from "./contacts.js";
import {
  LAB_ATTENTION_ITEMS, LAB_REPORTS, LAB_TRENDS, mergeLabReportsByDate,
} from "./lab-results-data.js";
import {
  isPdfBuffer, LAB_PDF_MAX_BYTES, LabPdfError, parseLabPdf,
} from "./lab-pdf.js";
import { generateIdentityReport, identityReportForDisplay, parseIdentityPdf } from "./identity-report-pdf.js";
import { parsePerformanceReviewPdf } from "./performance-review-pdf.js";
import { identityFourQuestionsSchema, identityValuesSchema } from "./identity-content-schema.js";
import {
  previewBackfillPatch,
  resolvePreviewBackfillMetadata,
  selectPreviewBackfillCandidates,
} from "./preview-backfill.js";
import {
  bookmateApiUrl,
  isBookmateUrl,
  isKinopoiskUrl,
  isVkVideoUrl,
  isYandexMapsUrl,
  isYouTubeUrl,
  kinopoiskContentUrlError,
  parseBookmateMetadata,
  parseKinopoiskMetadata,
  parseProductMetadata,
  parseVkVideoEmbedThumbnail,
  parseVkVideoEmbedUrl,
  parseVkVideoMetadata,
  parseYandexMapsMetadata,
  parseYouTubeMetadata,
  parseYouTubeVideoId,
  vkVideoOembedUrl,
  youtubeThumbnailUrl,
} from "./metadata.js";
import {
  createOtpCode,
  digestIp,
  digestOtp,
  digestPhone,
  getPhoneAuthPolicy,
  maskPhone,
  normalizeRussianPhone,
  phoneLast4,
  PHONE_OTP_CODE_LENGTH,
  requirePhoneAuthSecret,
  verifyOtpDigest,
} from "./phone-auth.js";
import { isReservedProfileUsername, legacyProfileTarget, profileUsernameCandidates } from "./profile-paths.js";
import { createSessionToken, hashPassword, hashToken, slugify, verifyPassword } from "./security.js";
import { configuredTrustedOrigins, isTrustedRequestOrigin } from "./trusted-origins.js";
import { getSmsConfig, sendSms } from "./sms.js";
import {
  getTelegramAuthConfig,
  safeSecretEqual,
  TelegramInitDataError,
  validateTelegramInitData,
} from "./telegram-auth.js";
import { getTelegramBotRuntimeConfig, telegramLaunchReply } from "./telegram-bot.js";
import {
  createYandexAuthorization,
  exchangeYandexCode,
  fetchYandexProfile,
  getYandexAuthConfig,
  readYandexAuthorization,
  safeOauthReturnPath,
  YandexAuthError,
} from "./yandex-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8080);
const isProduction = process.env.NODE_ENV === "production";
const trustedAppOrigins = configuredTrustedOrigins(process.env.APP_ORIGIN);
const sessionCookie = "rw_session";
const yandexOauthCookiePrefix = "rw_yandex_oauth_";
const localImageUrlSchema = z.string().max(2000).regex(/^\/(?!\/)[^\s\\]*$/);
const uploadedMediaUrlPattern = /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const avatarUrlSchema = z.union([
  z.literal(""),
  z.string().max(2000).url(),
  z.string().max(2000).refine((value) => {
    if (uploadedMediaUrlPattern.test(value)) return true;
    if (!value.startsWith("/avatars/")) return false;
    const segments = value.slice("/avatars/".length).split("/");
    return segments.length > 0 && segments.every((segment) => /^[a-z0-9_-][a-z0-9._-]*$/i.test(segment));
  }),
]);
const birthdaySchema = z.string().date().refine(
  (value) => value <= new Date().toISOString().slice(0, 10),
  { message: "Дата рождения не может быть в будущем" },
);
const listSpaceValues = ["products", "places", "events", "media", "food", "transport"];
const listSpaceSchema = z.enum(listSpaceValues);
const phoneRequestSchema = z.object({
  phone: z.string().trim().min(10).max(64),
}).strict();
const phoneVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
}).strict();
const telegramInitDataSchema = z.object({
  initData: z.string().min(1).max(16_384),
}).strict();
const contactLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().max(2_000).url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
}).strict();
const contactUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(160),
  role: z.string().trim().max(240),
  category: z.string().trim().max(80),
  status: z.string().trim().max(80),
  links: z.array(contactLinkSchema).max(12),
  notes: z.string().trim().max(50_000),
}).strict();
const contactFavoriteSchema = z.object({ favorite: z.boolean() }).strict();
const educationUrlSchema = z.union([
  z.literal(""),
  z.string().trim().max(2_000).url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
]);
const optionalEducationDateSchema = z.union([z.literal(""), z.string().date()]);
const educationListIdSchema = z.union([z.literal(""), z.string().uuid()]).optional().default("");
const educationListSectionSchema = z.enum(["courses", "conferences", "coaching", "workouts"]);
const educationListCreateSchema = z.object({
  section: educationListSectionSchema,
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
}).strict();
const educationListPatchSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
}).strict();
const educationItemListMoveSchema = z.object({
  listId: z.union([z.literal(""), z.string().uuid()]),
}).strict();
const educationLogoUrlSchema = z.union([
  z.literal(""),
  z.string().trim().max(2_000).url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  z.string().trim().max(2_000).regex(uploadedMediaUrlPattern),
]);
const courseCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  provider: z.string().trim().max(160),
  status: z.enum(["planned", "in_progress", "completed"]),
  logoUrl: educationLogoUrlSchema,
  url: educationUrlSchema,
  description: z.string().trim().max(4_000),
  startedOn: optionalEducationDateSchema,
  completedOn: optionalEducationDateSchema,
  listId: educationListIdSchema,
}).strict().superRefine((course, context) => {
  if (course.startedOn && course.completedOn && course.completedOn < course.startedOn) {
    context.addIssue({ code: "custom", path: ["completedOn"], message: "Дата завершения должна быть не раньше даты начала" });
  }
});
const courseReorderSchema = z.object({
  courseIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  listId: educationListIdSchema,
}).strict().superRefine(({ courseIds }, context) => {
  if (new Set(courseIds).size !== courseIds.length) {
    context.addIssue({ code: "custom", path: ["courseIds"], message: "Курсы не должны повторяться" });
  }
});
const courseGroupCreateSchema = z.object({
  courseIds: z.array(z.string().trim().min(1).max(200)).length(2),
  listId: educationListIdSchema,
}).strict().superRefine(({ courseIds }, context) => {
  if (new Set(courseIds).size !== 2) {
    context.addIssue({ code: "custom", path: ["courseIds"], message: "Выберите два разных курса" });
  }
});
const courseGroupAddSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
}).strict();
const courseGroupPatchSchema = z.object({
  title: z.string().trim().min(1).max(60),
}).strict();
const courseGroupMoveSchema = z.object({
  listId: z.union([z.literal(""), z.string().uuid()]),
}).strict();
const educationItemGroupCreateSchema = z.object({
  itemIds: z.array(z.string().trim().min(1).max(200)).length(2),
  listId: educationListIdSchema,
}).strict().superRefine(({ itemIds }, context) => {
  if (new Set(itemIds).size !== 2) {
    context.addIssue({ code: "custom", path: ["itemIds"], message: "Выберите два разных элемента" });
  }
});
const educationItemGroupAddSchema = z.object({
  itemId: z.string().trim().min(1).max(200),
}).strict();
const conferenceReorderSchema = z.object({
  conferenceIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  listId: educationListIdSchema,
}).strict().superRefine(({ conferenceIds }, context) => {
  if (new Set(conferenceIds).size !== conferenceIds.length) {
    context.addIssue({ code: "custom", path: ["conferenceIds"], message: "Конференции не должны повторяться" });
  }
});
const conferenceCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  status: z.enum(["planned", "registered", "attended"]),
  role: z.enum(["attendee", "speaker", "organizer"]),
  format: z.enum(["offline", "online", "hybrid"]),
  location: z.string().trim().max(240),
  url: educationUrlSchema,
  description: z.string().trim().max(4_000),
  startsOn: optionalEducationDateSchema,
  endsOn: optionalEducationDateSchema,
  listId: educationListIdSchema,
}).strict().superRefine((conference, context) => {
  if (conference.startsOn && conference.endsOn && conference.endsOn < conference.startsOn) {
    context.addIssue({ code: "custom", path: ["endsOn"], message: "Дата завершения должна быть не раньше даты начала" });
  }
});
const optionalEducationTimeSchema = z.union([z.literal(""), z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)]);
const optionalDurationMinutesSchema = z.union([
  z.literal(""),
  z.coerce.number().int().min(15).max(480),
]);
const coachingSessionCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  coach: z.string().trim().max(160),
  status: z.enum(["scheduled", "completed", "cancelled"]),
  format: z.enum(["online", "offline"]),
  location: z.string().trim().max(240),
  url: educationUrlSchema,
  description: z.string().trim().max(4_000),
  sessionOn: optionalEducationDateSchema,
  sessionTime: optionalEducationTimeSchema,
  durationMinutes: optionalDurationMinutesSchema,
  listId: educationListIdSchema,
}).strict();
const coachingSessionReorderSchema = z.object({
  sessionIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  listId: educationListIdSchema,
}).strict().superRefine(({ sessionIds }, context) => {
  if (new Set(sessionIds).size !== sessionIds.length) {
    context.addIssue({ code: "custom", path: ["sessionIds"], message: "Коучинг-сессии не должны повторяться" });
  }
});
const optionalWorkoutDurationSchema = z.union([
  z.literal(""),
  z.coerce.number().int().min(5).max(720),
]);
const optionalWorkoutDistanceSchema = z.union([
  z.literal(""),
  z.coerce.number().positive().max(1_000),
]);
const optionalWorkoutCaloriesSchema = z.union([
  z.literal(""),
  z.coerce.number().int().min(1).max(20_000),
]);
const workoutSchema = z.object({
  title: z.string().trim().min(1).max(160),
  workoutType: z.enum(["strength", "running", "walking", "cycling", "swimming", "mobility", "team_sport", "other"]),
  status: z.enum(["planned", "completed", "skipped"]),
  workoutOn: z.string().date(),
  startTime: optionalEducationTimeSchema,
  durationMinutes: optionalWorkoutDurationSchema,
  intensity: z.enum(["light", "moderate", "high"]),
  distanceKm: optionalWorkoutDistanceSchema,
  calories: optionalWorkoutCaloriesSchema,
  notes: z.string().trim().max(4_000),
  listId: educationListIdSchema,
}).strict();
const workoutReorderSchema = z.object({
  workoutIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  listId: educationListIdSchema,
}).strict().superRefine(({ workoutIds }, context) => {
  if (new Set(workoutIds).size !== workoutIds.length) {
    context.addIssue({ code: "custom", path: ["workoutIds"], message: "Тренировки не должны повторяться" });
  }
});
const medicationTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const medicationFrequencyTimeCount = {
  once_daily: 1,
  twice_daily: 2,
  three_times_daily: 3,
  weekly: 1,
  as_needed: 0,
};
const medicationSchema = z.object({
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
  if (medication.frequency === "custom" && medication.scheduleTimes.length === 0) {
    context.addIssue({ code: "custom", path: ["scheduleTimes"], message: "Укажите хотя бы одно время приёма" });
  }
});
const medicationGroupSchema = z.object({
  title: z.string().trim().min(1).max(60),
}).strict();
const medicationGroupMoveSchema = z.object({
  groupId: z.string().uuid().nullable(),
}).strict();
const careerSectionSchema = z.enum(["about", "cv", "performance", "development", "domain"]);
const careerMarkdownSchema = z.string().max(200_000);
const careerReviewTextSchema = z.string().max(20_000);
const careerReviewBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: careerReviewTextSchema }).strict(),
  z.object({
    type: z.enum(["unordered-list", "ordered-list"]),
    items: z.array(careerReviewTextSchema).max(500),
  }).strict(),
]);
const careerReviewerBaseSchema = z.object({
  name: z.string().max(240),
  role: z.string().max(500),
  score: z.string().max(120),
}).strict();
const careerProjectReviewerSchema = careerReviewerBaseSchema.extend({
  positive: z.array(careerReviewBlockSchema).max(100),
  improve: z.array(careerReviewBlockSchema).max(100),
}).strict();
const careerInteractionReviewerSchema = careerReviewerBaseSchema.extend({
  comment: z.array(careerReviewBlockSchema).max(100),
}).strict();
const careerPerformanceCycleSchema = z.object({
  id: z.string().min(1).max(240),
  year: z.coerce.number().int().min(1900).max(2200),
  season: z.string().min(1).max(120),
  projects: z.array(z.object({
    id: z.string().min(1).max(240),
    title: z.string().max(500),
    sections: z.array(z.object({
      label: z.string().max(500),
      blocks: z.array(careerReviewBlockSchema).max(100),
    }).strict()).max(50),
    reviewers: z.array(careerProjectReviewerSchema).max(500),
  }).strict()).max(100),
  interaction: z.array(careerInteractionReviewerSchema).max(500),
}).strict();
const careerPerformanceSchema = z.object({
  heading: z.string().max(240),
  description: z.string().max(4_000),
  cycles: z.array(careerPerformanceCycleSchema).max(30),
}).strict();
const careerContentSchemas = {
  about: careerMarkdownSchema,
  cv: careerMarkdownSchema,
  development: careerMarkdownSchema,
  domain: careerMarkdownSchema,
  performance: careerPerformanceSchema,
};
const identitySectionSchema = z.enum(["four-questions", "theses", "values", "mission", "life-strategy"]);
const identityReportSectionSchema = z.enum(["hogan", "gallup"]);
const identityContentSchemas = {
  theses: careerMarkdownSchema,
  values: identityValuesSchema,
  mission: careerMarkdownSchema,
  "life-strategy": careerMarkdownSchema,
  "four-questions": identityFourQuestionsSchema,
};

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://telegram.org"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      frameAncestors: ["'self'", "https://web.telegram.org", "https://*.telegram.org"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: false,
}));
app.use(compression());
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

const authRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const passwordResetRequestRateLimit = createRateLimit({
  windowMs: Math.min(60 * 60, Math.max(60, Number.parseInt(process.env.PASSWORD_RESET_IP_WINDOW_SECONDS || "900", 10) || 900)) * 1_000,
  max: Math.min(1_000, Math.max(1, Number.parseInt(process.env.PASSWORD_RESET_IP_REQUEST_LIMIT || "20", 10) || 20)),
});
const metadataRateLimit = createRateLimit({ windowMs: 5 * 60 * 1000, max: 40 });
const previewBackfillRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 6 });
const imageUploadRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const labPdfUploadRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const marketplaceOffersRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  key: (req) => `marketplace:${req.user?.id || req.ip}:${req.params.id}`,
  message: "Для этого товара поиск запускался слишком часто",
  code: "marketplace_offers_rate_limited",
});
const imageUploadBody = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: "8mb",
});
const labPdfUploadBody = express.raw({
  type: ["application/pdf", "application/octet-stream"],
  limit: LAB_PDF_MAX_BYTES,
});
const metadataCache = new Map();
const metadataCacheTtlMs = 10 * 60 * 1000;
const metadataCacheLimit = 500;
const previewBackfillJobs = new Map();
const previewBackfillCooldownMs = 15 * 60 * 1000;
const mutationLocks = new Map();
const backgroundTasks = new Set();
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) return "";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return "";
}

async function withMutationLock(key, callback) {
  const previous = mutationLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  mutationLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (mutationLocks.get(key) === current) mutationLocks.delete(key);
  }
}

function trackBackgroundTask(task) {
  backgroundTasks.add(task);
  void task.finally(() => backgroundTasks.delete(task));
}

async function resolveVkVideoMetadata(metadataUrl) {
  const { json } = await fetchPublicJson(vkVideoOembedUrl(metadataUrl));
  const metadata = parseVkVideoMetadata(json, metadataUrl);
  const embedUrl = parseVkVideoEmbedUrl(json);
  if (!embedUrl) return metadata;

  try {
    const { html } = await fetchPublicHtml(embedUrl);
    const imageUrl = parseVkVideoEmbedThumbnail(html);
    return imageUrl ? { ...metadata, imageUrl } : metadata;
  } catch {
    return metadata;
  }
}

async function backfillWishPreviews(userId) {
  const missing = await query(
    `SELECT w.id,w.url,w.image_url,w.description,
       (
         w.space='food'
         OR EXISTS (
           SELECT 1
           FROM wishlist_wishes ww
           JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND l.space='food'
         )
       ) AS is_food,
       (
         w.space='places'
         OR EXISTS (
           SELECT 1
           FROM wishlist_wishes ww
           JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND l.space='places'
         )
       ) AS is_place,
       (
         w.space='media'
         OR EXISTS (
           SELECT 1
           FROM wishlist_wishes ww
           JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND l.space='media'
         )
       ) AS is_media
     FROM wishes w
     WHERE w.user_id=$1 AND w.url<>''
       AND (
         w.image_url=''
         OR (
           w.image_url LIKE 'https://%.okcdn.ru/getVideoPreview%'
           AND w.image_url LIKE '%fn=vid_s%'
         )
         OR (
           btrim(w.description)=''
           AND (
             w.space='places'
             OR EXISTS (
               SELECT 1
               FROM wishlist_wishes ww
               JOIN wishlists l ON l.id=ww.wishlist_id
               WHERE ww.wish_id=w.id AND l.space='places'
             )
           )
         )
       )
       AND (
         w.space IN ('food','places','media')
         OR EXISTS (
           SELECT 1
           FROM wishlist_wishes ww
           JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND l.space IN ('food','places','media')
         )
       )
     ORDER BY w.created_at DESC,w.id
     LIMIT 500`,
    [userId],
  );
  const candidates = selectPreviewBackfillCandidates(missing.rows);
  let cursor = 0;
  let updated = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < candidates.length) {
      const row = candidates[cursor];
      cursor += 1;
      try {
        const metadata = await resolvePreviewBackfillMetadata(row, {
          resolveRetailerMetadata,
          fetchPublicHtml,
          parseYandexMapsMetadata,
          resolveVkVideoMetadata,
        });
        const patch = previewBackfillPatch(row, metadata);
        if (!patch.changed) continue;
        const saved = await query(
          "UPDATE wishes SET image_url=$1,description=$2 WHERE id=$3 AND user_id=$4 AND url=$5 AND image_url=$6 AND description=$7",
          [patch.imageUrl, patch.description, row.id, userId, row.url, row.image_url, row.description],
        );
        updated += saved.rowCount;
      } catch {
        failed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, () => worker()));
  return { checked: candidates.length, updated, failed };
}

function deduplicatedPreviewBackfill(userId) {
  const now = Date.now();
  const current = previewBackfillJobs.get(userId);
  if (current?.expiresAt > now) return current.promise;

  if (previewBackfillJobs.size >= 10_000) {
    for (const [key, entry] of previewBackfillJobs) {
      if (entry.expiresAt <= now) previewBackfillJobs.delete(key);
    }
  }

  const promise = backfillWishPreviews(userId);
  const entry = { promise, expiresAt: now + previewBackfillCooldownMs };
  previewBackfillJobs.set(userId, entry);
  void promise.catch(() => {
    if (previewBackfillJobs.get(userId) === entry) previewBackfillJobs.delete(userId);
  });
  return promise;
}

function cleanUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    bio: row.bio,
    birthday: row.birthday,
    avatarUrl: row.avatar_url,
    hasPhone: Boolean(row.phone_hash && row.phone_verified_at),
    phoneMasked: row.phone_hash && row.phone_verified_at ? maskPhone(row.phone_last4) : null,
    hasYandex: Boolean(row.has_yandex),
    canDiscoverSpheres: Boolean(row.can_discover_spheres),
    createdAt: row.created_at,
  };
}

async function cleanAuthenticatedUser(row) {
  if (!row) return null;
  const hasCapabilities = ["has_yandex", "can_discover_spheres"]
    .every((property) => Object.prototype.hasOwnProperty.call(row, property));
  if (hasCapabilities) return cleanUser(row);
  const capabilities = await query(
    `SELECT
       EXISTS(SELECT 1 FROM yandex_identities WHERE user_id=$1) AS has_yandex,
       EXISTS(SELECT 1 FROM default_follow_targets WHERE user_id=$1) AS can_discover_spheres`,
    [row.id],
  );
  return cleanUser({ ...row, ...capabilities.rows[0] });
}

function mapList(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    privacy: row.privacy,
    occasionDate: row.occasion_date,
    color: row.color,
    shareToken: row.share_token,
    space: row.space,
    wishCount: Number(row.wish_count || 0),
  };
}

function formatEventDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    // node-pg парсит DATE как полночь в локальной таймзоне, pg-mem — как полночь в UTC.
    // Выбираем компоненты даты без сдвига: UTC-полночь → UTC-компоненты, иначе локальные.
    const isUtcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0
      && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
    const year = isUtcMidnight ? value.getUTCFullYear() : value.getFullYear();
    const month = (isUtcMidnight ? value.getUTCMonth() : value.getMonth()) + 1;
    const day = isUtcMidnight ? value.getUTCDate() : value.getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

function mapEducationList(row) {
  return {
    id: row.id,
    section: row.section,
    title: row.title,
    description: row.description,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEducationCourse(row) {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider,
    status: row.status,
    logoUrl: row.logo_url,
    url: row.url,
    description: row.description,
    startedOn: formatEventDate(row.started_on),
    completedOn: formatEventDate(row.completed_on),
    listId: row.list_id || null,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEducationCourseGroups(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.id)) {
      groups.set(row.id, {
        id: row.id,
        listId: row.list_id || null,
        title: row.title,
        courseIds: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
    if (row.course_id) groups.get(row.id).courseIds.push(row.course_id);
  }
  return [...groups.values()];
}

function mapEducationItemGroups(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.id)) {
      groups.set(row.id, {
        id: row.id,
        listId: row.list_id || null,
        title: row.title,
        itemIds: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
    if (row.item_id) groups.get(row.id).itemIds.push(row.item_id);
  }
  return [...groups.values()];
}

function mapEducationConference(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    role: row.role,
    format: row.format,
    location: row.location,
    url: row.url,
    description: row.description,
    startsOn: formatEventDate(row.starts_on),
    endsOn: formatEventDate(row.ends_on),
    listId: row.list_id || null,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEducationCoachingSession(row) {
  return {
    id: row.id,
    title: row.title,
    coach: row.coach,
    status: row.status,
    format: row.format,
    location: row.location,
    url: row.url,
    description: row.description,
    sessionOn: formatEventDate(row.session_on),
    sessionTime: row.session_time ? String(row.session_time).slice(0, 5) : null,
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    listId: row.list_id || null,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHealthWorkout(row) {
  return {
    id: row.id,
    title: row.title,
    workoutType: row.workout_type,
    status: row.status,
    workoutOn: formatEventDate(row.workout_on),
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    intensity: row.intensity,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    calories: row.calories === null ? null : Number(row.calories),
    notes: row.notes,
    listId: row.list_id || null,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function medicationScheduleTimes(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(time))))].sort().slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function mapHealthMedication(row) {
  return {
    id: row.id,
    groupId: row.group_id || null,
    name: row.name,
    medicationForm: row.medication_form,
    status: row.status,
    dosage: row.dosage,
    frequency: row.frequency,
    scheduleTimes: medicationScheduleTimes(row.schedule_times_json),
    purpose: row.purpose,
    prescriber: row.prescriber,
    instructions: row.instructions,
    startOn: formatEventDate(row.start_on),
    endOn: formatEventDate(row.end_on),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHealthMedicationGroup(row) {
  return {
    id: row.id,
    title: row.title,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWish(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    url: row.url,
    imageUrl: row.image_url,
    fundraisingUrl: row.fundraising_url ?? "",
    vehicleMake: row.vehicle_make ?? "",
    vehicleModel: row.vehicle_model ?? "",
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    priority: Number(row.priority),
    privacy: row.privacy,
    allowMultiple: row.allow_multiple,
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    eventDate: formatEventDate(row.event_date),
    space: row.space ?? null,
    createdAt: row.created_at,
    reservationCount: Number(row.reservation_count || 0),
    reservedByMe: Boolean(row.reserved_by_me),
    likedByMe: Boolean(row.liked_by_me),
    listIds: row.list_ids || [],
  };
}

function mapWishMediaNote(row) {
  return {
    summary: row?.summary || "",
    keyIdeas: row?.key_ideas || "",
    quotes: row?.quotes || "",
    applications: row?.applications || "",
    updatedAt: row?.updated_at || null,
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function optionalAuth(req, _res, next) {
  const token = req.cookies[sessionCookie];
  if (!token) return next();
  const result = await query(
    `SELECT u.*,
       (yi.yandex_user_id IS NOT NULL) AS has_yandex,
       (dft.user_id IS NOT NULL) AS can_discover_spheres
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN yandex_identities yi ON yi.user_id=u.id
     LEFT JOIN default_follow_targets dft ON dft.user_id=u.id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [hashToken(token), new Date()],
  );
  req.user = result.rows[0] || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Сначала войдите в аккаунт" });
  next();
}

function requirePrivateSphereOwner(req, res, next) {
  if (!req.user?.can_discover_spheres) {
    return res.status(403).json({ error: "Раздел доступен только владельцу профиля" });
  }
  next();
}

app.use("/api", asyncRoute(optionalAuth));

const csrfSafeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function requireTrustedSessionMutation(req, res, next) {
  if (csrfSafeMethods.has(req.method) || !req.cookies[sessionCookie]) return next();

  const origin = req.get("origin");
  const fetchSite = (req.get("sec-fetch-site") || "").toLowerCase();
  if (origin) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin).origin;
    } catch {
      return res.status(403).json({ error: "Недоверенный источник запроса", code: "CSRF_ORIGIN_MISMATCH" });
    }
    const requestOrigin = `${req.protocol}://${req.get("host")}`;
    if (!isTrustedRequestOrigin({ origin: parsedOrigin, requestOrigin, configuredOrigins: trustedAppOrigins })) {
      return res.status(403).json({ error: "Недоверенный источник запроса", code: "CSRF_ORIGIN_MISMATCH" });
    }
    return next();
  }

  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return res.status(403).json({ error: "Недоверенный источник запроса", code: "CSRF_ORIGIN_MISMATCH" });
  }
  return next();
}

app.use("/api", requireTrustedSessionMutation);

async function createSession(res, userId) {
  const session = await createSessionRecord({ query: (text, params) => query(text, params) }, userId);
  setSessionCookie(res, session);
}

async function createSessionRecord(client, userId) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await client.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(token), userId, expiresAt]);
  return { token, expiresAt };
}

function setSessionCookie(res, { token, expiresAt }) {
  const telegramEnabled = getTelegramAuthConfig().enabled;
  const secure = isProduction && process.env.COOKIE_SECURE !== "false";
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: isProduction && telegramEnabled && secure ? "none" : "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

function yandexOauthCookieOptions(expires) {
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction && process.env.COOKIE_SECURE !== "false",
    path: "/api/auth/yandex/callback",
  };
  if (expires) options.expires = expires;
  return options;
}

function yandexOauthCookieName(state) {
  return typeof state === "string" && /^[A-Za-z0-9_-]{43}$/.test(state)
    ? `${yandexOauthCookiePrefix}${state}`
    : "";
}

function clearYandexOauthCookie(res, state) {
  const name = yandexOauthCookieName(state);
  if (name) res.clearCookie(name, yandexOauthCookieOptions());
}

function yandexLoginRedirect(nextPath, errorCode, successCode) {
  const params = new URLSearchParams({ next: safeOauthReturnPath(nextPath) });
  if (errorCode) params.set("auth_error", errorCode);
  if (successCode) params.set("auth_success", successCode);
  return `/login?${params.toString()}`;
}

async function uniqueUsername(name, client = { query }) {
  const base = slugify(name);
  for (const candidate of profileUsernameCandidates(base)) {
    const found = await client.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!found.rowCount) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

const credentialsSchema = z.object({
  email: z.string().email().max(160).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});
const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
}).strict();
const passwordResetConfirmSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(8).max(128),
}).strict();

const passwordResetRequestResponse = {
  ok: true,
  message: "Если аккаунт существует, мы отправили ссылку для восстановления",
};
const invalidPasswordResetResponse = {
  error: "Ссылка для восстановления недействительна или истекла",
  code: "PASSWORD_RESET_INVALID",
};

function boundedEnvironmentInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function getPasswordResetPolicy(env = process.env) {
  const testMinimum = env.NODE_ENV === "test" ? 0 : 30;
  return {
    ttlSeconds: boundedEnvironmentInteger(env.PASSWORD_RESET_TTL_SECONDS, 1_800, env.NODE_ENV === "test" ? 1 : 600, 86_400),
    cooldownSeconds: boundedEnvironmentInteger(env.PASSWORD_RESET_COOLDOWN_SECONDS, 60, testMinimum, 3_600),
    dailyLimit: boundedEnvironmentInteger(env.PASSWORD_RESET_DAILY_LIMIT, 5, 1, 100),
  };
}

function getPasswordResetOrigin(env = process.env) {
  const candidates = [env.PUBLIC_APP_URL, ...(String(env.APP_ORIGIN || "").split(","))];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(String(candidate || "").trim());
      if (parsed.protocol === "https:" || (env.NODE_ENV !== "production" && parsed.protocol === "http:")) {
        return parsed.origin;
      }
    } catch {
      // Try the next explicitly configured application origin.
    }
  }
  return "";
}

function buildPasswordResetUrl(origin, token) {
  const resetUrl = new URL("/reset-password", origin);
  resetUrl.hash = `token=${token}`;
  return resetUrl.toString();
}

async function createPasswordResetRequest(email) {
  const policy = getPasswordResetPolicy();
  const now = new Date();
  const requestId = randomUUID();
  const token = createSessionToken();

  return transaction(async (client) => {
    const found = await client.query("SELECT id,email FROM users WHERE email=$1 FOR UPDATE", [email]);
    const user = found.rows[0];
    if (!user) return null;

    if (policy.cooldownSeconds > 0) {
      const cooldownCutoff = new Date(now.getTime() - policy.cooldownSeconds * 1_000);
      const recent = await client.query(
        `SELECT 1 FROM password_reset_tokens
         WHERE user_id=$1 AND delivery_status IN ('pending','sent') AND created_at>$2 LIMIT 1`,
        [user.id, cooldownCutoff],
      );
      if (recent.rowCount) return null;
    }

    const dailyCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const daily = await client.query(
      `SELECT COUNT(*) AS count FROM password_reset_tokens
       WHERE user_id=$1 AND created_at>$2
         AND (delivery_status='sent' OR (delivery_status='pending' AND expires_at>$3))`,
      [user.id, dailyCutoff, now],
    );
    if (Number(daily.rows[0]?.count || 0) >= policy.dailyLimit) return null;

    const expiresAt = new Date(now.getTime() + policy.ttlSeconds * 1_000);
    const inserted = await client.query(
      `INSERT INTO password_reset_tokens
        (id,token_hash,user_id,expires_at,delivery_status,created_at)
       VALUES ($1,$2,$3,$4,'pending',$5)
       RETURNING created_at`,
      [requestId, hashToken(token), user.id, expiresAt, now],
    );
    return {
      requestId,
      token,
      email: user.email,
      userId: user.id,
      createdAt: inserted.rows[0]?.created_at || now,
    };
  });
}

async function deliverPasswordResetRequest(request, origin) {
  const resetUrl = buildPasswordResetUrl(origin, request.token);
  try {
    const delivered = await sendPasswordResetEmail({
      to: request.email,
      resetUrl,
      requestId: request.requestId,
    });
    const deliveredAt = new Date();
    await transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [request.userId]);
      const marked = await client.query(
        `UPDATE password_reset_tokens
         SET delivery_status='sent',provider_message_id=$1
         WHERE id=$2 AND delivery_status='pending' AND consumed_at IS NULL
         RETURNING user_id,created_at`,
        [delivered?.providerMessageId || null, request.requestId],
      );
      if (!marked.rowCount) return;
      const createdAt = marked.rows[0].created_at || request.createdAt;
      await client.query(
        `UPDATE password_reset_tokens SET consumed_at=$1
         WHERE user_id=$2 AND id<>$3 AND consumed_at IS NULL
           AND (created_at<$4 OR (created_at=$4 AND id<$3))`,
        [deliveredAt, request.userId, request.requestId, createdAt],
      );
    });
  } catch (error) {
    await query(
      `UPDATE password_reset_tokens
       SET delivery_status='failed',consumed_at=COALESCE(consumed_at,$1)
       WHERE id=$2 AND delivery_status='pending'`,
      [new Date(), request.requestId],
    ).catch((databaseError) => {
      console.error(`[password-reset] Could not record failure for request ${request.requestId}: ${databaseError.message}`);
    });
    console.error(`[password-reset] Email delivery failed for request ${request.requestId}: ${error.message}`);
  }
}

async function processPasswordResetRequest(email, origin) {
  try {
    await cleanupExpiredAuthData();
    const request = await createPasswordResetRequest(email);
    if (request) await deliverPasswordResetRequest(request, origin);
  } catch (error) {
    console.error(`[password-reset] Could not process reset request: ${error.message}`);
  }
}

class PhoneRequestLimitError extends Error {
  constructor(retryAfterSeconds) {
    super("Phone OTP request limit exceeded");
    this.name = "PhoneRequestLimitError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

function phoneAuthRuntimeConfig() {
  const sms = getSmsConfig();
  let secret = "";
  try {
    secret = requirePhoneAuthSecret();
  } catch {
    // The public config reports the feature as disabled until a strong secret exists.
  }
  return {
    ...sms,
    enabled: sms.enabled && Boolean(secret),
    policy: getPhoneAuthPolicy(),
    secret,
  };
}

function publicPhoneAuthConfig() {
  const runtime = phoneAuthRuntimeConfig();
  return {
    enabled: runtime.enabled,
    testMode: runtime.testMode,
    country: "RU",
    codeLength: PHONE_OTP_CODE_LENGTH,
    expiresInSeconds: runtime.policy.ttlSeconds,
    resendAfterSeconds: runtime.policy.resendSeconds,
  };
}

function parseTelegramRequest(body) {
  const parsed = telegramInitDataSchema.safeParse(body);
  if (!parsed.success) throw new TelegramInitDataError("Откройте Rollapp из Telegram ещё раз");
  const config = getTelegramAuthConfig();
  return {
    config,
    identity: validateTelegramInitData(parsed.data.initData, {
      botToken: config.token,
      maxAgeSeconds: config.maxAgeSeconds,
    }),
  };
}

function respondTelegramAuthError(res, error) {
  if (!(error instanceof TelegramInitDataError)) throw error;
  const unavailable = error.code === "TELEGRAM_AUTH_UNAVAILABLE";
  return res.status(unavailable ? 503 : 401).json({ error: error.message, code: error.code });
}

function publicTelegramUser(user) {
  return {
    name: user.name,
    username: user.username,
    photoUrl: user.photoUrl,
  };
}

async function saveTelegramIdentity(client, telegramUser, userId) {
  const current = await client.query(
    `SELECT telegram_user_id,user_id FROM telegram_identities
     WHERE telegram_user_id=$1 OR user_id=$2`,
    [telegramUser.id, userId],
  );
  if (current.rows.some((row) => row.telegram_user_id !== telegramUser.id || row.user_id !== userId)) {
    return { kind: "conflict" };
  }
  if (current.rowCount) {
    await client.query(
      `UPDATE telegram_identities
       SET username=$1,first_name=$2,last_name=$3,photo_url=$4,language_code=$5,last_seen_at=$6
       WHERE telegram_user_id=$7 AND user_id=$8`,
      [
        telegramUser.username,
        telegramUser.firstName,
        telegramUser.lastName,
        telegramUser.photoUrl,
        telegramUser.languageCode,
        new Date(),
        telegramUser.id,
        userId,
      ],
    );
    return { kind: "success" };
  }
  await client.query(
    `INSERT INTO telegram_identities
      (telegram_user_id,user_id,username,first_name,last_name,photo_url,language_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      telegramUser.id,
      userId,
      telegramUser.username,
      telegramUser.firstName,
      telegramUser.lastName,
      telegramUser.photoUrl,
      telegramUser.languageCode,
    ],
  );
  return { kind: "success" };
}

async function saveYandexIdentity(client, yandexUser, userId) {
  const current = await client.query(
    `SELECT yandex_user_id,user_id FROM yandex_identities
     WHERE yandex_user_id=$1 OR user_id=$2`,
    [yandexUser.id, userId],
  );
  if (current.rows.some((row) => row.yandex_user_id !== yandexUser.id || row.user_id !== userId)) {
    return { kind: "conflict" };
  }
  const values = [
    yandexUser.login,
    yandexUser.email,
    yandexUser.name,
    yandexUser.firstName,
    yandexUser.lastName,
    yandexUser.avatarUrl,
  ];
  if (current.rowCount) {
    await client.query(
      `UPDATE yandex_identities
       SET login=$1,default_email=$2,display_name=$3,first_name=$4,last_name=$5,
           avatar_url=$6,last_seen_at=$7
       WHERE yandex_user_id=$8 AND user_id=$9`,
      [...values, new Date(), yandexUser.id, userId],
    );
    return { kind: "success" };
  }
  await client.query(
    `INSERT INTO yandex_identities
      (yandex_user_id,user_id,login,default_email,display_name,first_name,last_name,avatar_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [yandexUser.id, userId, ...values],
  );
  return { kind: "success" };
}

async function lockYandexMutation(client, yandexUser, attempt) {
  if (isMemoryDatabase) return;
  const keys = [
    `yandex-id:${yandexUser.id}`,
    `yandex-email:${yandexUser.email}`,
    `yandex-username:${slugify(yandexUser.name || yandexUser.login)}`,
    attempt.user_id ? `yandex-user:${attempt.user_id}` : "",
  ].filter(Boolean).sort();
  for (const key of keys) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
  }
}

async function insertYandexUser(client, yandexUser, userId, unusablePasswordHash) {
  const base = slugify(yandexUser.name || yandexUser.login);
  const candidates = [
    ...profileUsernameCandidates(base),
    ...Array.from({ length: 5 }, () => `${base.slice(0, 25)}-${randomBytes(3).toString("hex")}`),
  ];
  for (const username of candidates) {
    const created = await client.query(
      `INSERT INTO users (id,email,username,name,password_hash,avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [userId, yandexUser.email, username, yandexUser.name, unusablePasswordHash, yandexUser.avatarUrl],
    );
    if (created.rowCount) return { kind: "success", user: created.rows[0] };
    const existingEmail = await client.query("SELECT id FROM users WHERE email=$1", [yandexUser.email]);
    if (existingEmail.rowCount) return { kind: "link-required" };
  }
  throw new YandexAuthError("Не удалось создать профиль Rollapp", "YANDEX_ACCOUNT_CONFLICT", 409);
}

async function resolveYandexLogin(yandexUser, attempt, currentUser) {
  if (attempt.purpose === "link" && (!currentUser || currentUser.id !== attempt.user_id)) {
    return { kind: "link-session-missing" };
  }

  return withMutationLock(`yandex-auth:${yandexUser.id}`, () => transaction(async (client) => {
    await lockYandexMutation(client, yandexUser, attempt);
    const knownIdentity = await client.query(
      "SELECT user_id FROM yandex_identities WHERE yandex_user_id=$1",
      [yandexUser.id],
    );
    if (knownIdentity.rowCount) {
      const userId = knownIdentity.rows[0].user_id;
      if (attempt.purpose === "link" && userId !== attempt.user_id) return { kind: "identity-conflict" };
      const user = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId]);
      if (!user.rowCount) return { kind: "identity-conflict" };
      const saved = await saveYandexIdentity(client, yandexUser, userId);
      if (saved.kind !== "success") return { kind: "identity-conflict" };
      const session = await createSessionRecord(client, userId);
      return { kind: "success", user: user.rows[0], session };
    }

    if (attempt.purpose === "link") {
      const user = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [attempt.user_id]);
      if (!user.rowCount) return { kind: "link-session-missing" };
      const saved = await saveYandexIdentity(client, yandexUser, attempt.user_id);
      if (saved.kind !== "success") return { kind: "identity-conflict" };
      const session = await createSessionRecord(client, attempt.user_id);
      return { kind: "success", user: user.rows[0], session };
    }

    const existingEmail = await client.query("SELECT id FROM users WHERE email=$1 FOR UPDATE", [yandexUser.email]);
    if (existingEmail.rowCount) return { kind: "link-required" };

    const userId = randomUUID();
    const unusablePasswordHash = `oauth-only:${randomBytes(32).toString("base64url")}`;
    const created = await insertYandexUser(client, yandexUser, userId, unusablePasswordHash);
    if (created.kind === "link-required") return created;
    await client.query(
      `INSERT INTO wishlists (id,user_id,title,description,privacy,color,share_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, "Мои желания", "Всё, чему я буду рад", "public", "coral", randomBytes(10).toString("base64url")],
    );
    await addDefaultFriend(client, userId);
    await saveYandexIdentity(client, yandexUser, userId);
    const session = await createSessionRecord(client, userId);
    return { kind: "success", user: created.user, session };
  }));
}

function phoneAuthUnavailable(res) {
  return res.status(503).json({ error: "Вход по телефону временно недоступен" });
}

function phoneRequestLimited(res, retryAfterSeconds) {
  const retry = Math.max(1, Math.ceil(retryAfterSeconds));
  res.set("Retry-After", String(retry));
  return res.status(429).json({
    error: "Слишком много запросов кода. Попробуйте позже",
    retryAfterSeconds: retry,
  });
}

async function enforcePhoneRequestLimits(client, {
  phoneHash,
  ipHash,
  purpose,
  now,
  policy,
}) {
  const resendCutoff = new Date(now.getTime() - policy.resendSeconds * 1_000);
  const latest = await client.query(
    `SELECT created_at FROM phone_auth_challenges
     WHERE phone_hash=$1 AND purpose=$2 AND created_at>$3
     ORDER BY created_at DESC LIMIT 1`,
    [phoneHash, purpose, resendCutoff],
  );
  if (latest.rowCount) {
    const elapsedMs = now.getTime() - new Date(latest.rows[0].created_at).getTime();
    throw new PhoneRequestLimitError(policy.resendSeconds - elapsedMs / 1_000);
  }

  const rateCutoff = new Date(now.getTime() - policy.rateWindowSeconds * 1_000);
  const phoneRequests = await client.query(
    "SELECT COUNT(*) AS count FROM phone_auth_challenges WHERE phone_hash=$1 AND created_at>$2",
    [phoneHash, rateCutoff],
  );
  if (Number(phoneRequests.rows[0]?.count || 0) >= policy.phoneRequestLimit) {
    throw new PhoneRequestLimitError(policy.rateWindowSeconds);
  }

  const ipRequests = await client.query(
    "SELECT COUNT(*) AS count FROM phone_auth_challenges WHERE request_ip_hash=$1 AND created_at>$2",
    [ipHash, rateCutoff],
  );
  if (Number(ipRequests.rows[0]?.count || 0) >= policy.ipRequestLimit) {
    throw new PhoneRequestLimitError(policy.rateWindowSeconds);
  }

  const dailyCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const deliveries = await client.query(
    `SELECT COUNT(*) AS count FROM phone_auth_challenges
     WHERE delivery_status<>'suppressed' AND created_at>$1`,
    [dailyCutoff],
  );
  if (Number(deliveries.rows[0]?.count || 0) >= policy.globalDailyLimit) {
    throw new PhoneRequestLimitError(60 * 60);
  }
}

let lastPhoneAuthCleanupAt = 0;
async function cleanupExpiredAuthData() {
  const now = Date.now();
  if (now - lastPhoneAuthCleanupAt < 60 * 60 * 1_000) return;
  const challengeCutoff = new Date(now - 24 * 60 * 60 * 1_000);
  await Promise.all([
    query("DELETE FROM phone_auth_challenges WHERE created_at<$1", [challengeCutoff]),
    query("DELETE FROM password_reset_tokens WHERE created_at<$1", [challengeCutoff]),
    query("DELETE FROM yandex_oauth_attempts WHERE expires_at<$1", [new Date(now)]),
    query("DELETE FROM sessions WHERE expires_at<$1", [new Date(now)]),
  ]);
  lastPhoneAuthCleanupAt = now;
}

async function startPhoneChallenge(req, res, { purpose, userId = null }) {
  const parsed = phoneRequestSchema.safeParse(req.body);
  const phone = parsed.success ? normalizeRussianPhone(parsed.data.phone) : null;
  if (!phone) return res.status(400).json({ error: "Введите российский мобильный номер" });

  const runtime = phoneAuthRuntimeConfig();
  if (!runtime.enabled) return phoneAuthUnavailable(res);

  await cleanupExpiredAuthData();
  const now = new Date();
  const challengeId = randomUUID();
  const code = createOtpCode();
  const phoneHash = digestPhone(runtime.secret, phone);
  const ipHash = digestIp(runtime.secret, req.ip || req.socket.remoteAddress || "unknown");
  const last4 = phoneLast4(phone);

  let challenge;
  try {
    challenge = await withMutationLock("phone-otp-request", async () => transaction(async (client) => {
      let targetUserId = userId;
      if (purpose === "login") {
        const owner = await client.query(
          "SELECT id FROM users WHERE phone_hash=$1 AND phone_verified_at IS NOT NULL",
          [phoneHash],
        );
        targetUserId = owner.rows[0]?.id || null;
      }
      await enforcePhoneRequestLimits(client, {
        phoneHash,
        ipHash,
        purpose,
        now,
        policy: runtime.policy,
      });
      await client.query(
        `UPDATE phone_auth_challenges SET consumed_at=$1
         WHERE phone_hash=$2 AND purpose=$3 AND consumed_at IS NULL`,
        [now, phoneHash, purpose],
      );
      const expiresAt = new Date(now.getTime() + runtime.policy.ttlSeconds * 1_000);
      const shouldDeliver = Boolean(targetUserId);
      await client.query(
        `INSERT INTO phone_auth_challenges
          (id,phone_hash,phone_last4,purpose,user_id,code_hash,request_ip_hash,max_attempts,expires_at,delivery_status,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          challengeId,
          phoneHash,
          last4,
          purpose,
          targetUserId,
          digestOtp(runtime.secret, challengeId, code),
          ipHash,
          runtime.policy.maxAttempts,
          expiresAt,
          shouldDeliver ? "pending" : "suppressed",
          now,
        ],
      );
      return { shouldDeliver };
    }));
  } catch (error) {
    if (error instanceof PhoneRequestLimitError) {
      return phoneRequestLimited(res, error.retryAfterSeconds);
    }
    throw error;
  }

  if (challenge.shouldDeliver) {
    try {
      const delivered = await sendSms({ phone, code });
      await query(
        "UPDATE phone_auth_challenges SET delivery_status='sent',provider_message_id=$1 WHERE id=$2",
        [delivered.providerMessageId || null, challengeId],
      );
    } catch (error) {
      await query("UPDATE phone_auth_challenges SET delivery_status='failed' WHERE id=$1", [challengeId]);
      console.error(`[phone-auth] SMS delivery failed for challenge ${challengeId}: ${error.message}`);
    }
  } else if (!runtime.testMode) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const response = {
    challengeId,
    phoneMasked: maskPhone(last4),
    expiresInSeconds: runtime.policy.ttlSeconds,
    resendAfterSeconds: runtime.policy.resendSeconds,
  };
  if (runtime.testMode) response.testCode = code;
  return res.status(202).json(response);
}

const invalidPhoneCodeResponse = { error: "Неверный или истёкший код" };

async function verifyPhoneChallenge(req, res, { purpose, userId = null }) {
  const parsed = phoneVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(invalidPhoneCodeResponse);
  const runtime = phoneAuthRuntimeConfig();
  if (!runtime.enabled) return phoneAuthUnavailable(res);

  const result = await withMutationLock(`phone-otp-verify:${parsed.data.challengeId}`, async () => transaction(async (client) => {
    const found = await client.query(
      "SELECT * FROM phone_auth_challenges WHERE id=$1 AND purpose=$2 FOR UPDATE",
      [parsed.data.challengeId, purpose],
    );
    const challenge = found.rows[0];
    if (!challenge) return { kind: "invalid" };
    if (purpose === "link" && challenge.user_id !== userId) return { kind: "invalid" };

    const now = new Date();
    const attempts = Number(challenge.attempt_count || 0);
    const maxAttempts = Number(challenge.max_attempts || runtime.policy.maxAttempts);
    if (challenge.consumed_at || attempts >= maxAttempts || new Date(challenge.expires_at) <= now) {
      if (!challenge.consumed_at) {
        await client.query("UPDATE phone_auth_challenges SET consumed_at=$1 WHERE id=$2", [now, challenge.id]);
      }
      return { kind: "invalid" };
    }

    if (!verifyOtpDigest(runtime.secret, challenge.id, parsed.data.code, challenge.code_hash)) {
      const nextAttempts = attempts + 1;
      await client.query(
        `UPDATE phone_auth_challenges
         SET attempt_count=$1,consumed_at=CASE WHEN $1>=max_attempts THEN $2 ELSE consumed_at END
         WHERE id=$3`,
        [nextAttempts, now, challenge.id],
      );
      return { kind: "invalid" };
    }

    if (purpose === "login") {
      const user = challenge.user_id
        ? await client.query(
          `SELECT * FROM users
           WHERE id=$1 AND phone_hash=$2 AND phone_verified_at IS NOT NULL`,
          [challenge.user_id, challenge.phone_hash],
        )
        : { rows: [] };
      await client.query("UPDATE phone_auth_challenges SET consumed_at=$1 WHERE id=$2", [now, challenge.id]);
      if (!user.rows[0]) return { kind: "invalid" };
      const session = await createSessionRecord(client, user.rows[0].id);
      return { kind: "success", user: user.rows[0], session };
    }

    const claimed = await client.query(
      "SELECT id FROM users WHERE phone_hash=$1 AND id<>$2 LIMIT 1",
      [challenge.phone_hash, userId],
    );
    await client.query("UPDATE phone_auth_challenges SET consumed_at=$1 WHERE id=$2", [now, challenge.id]);
    if (claimed.rowCount) return { kind: "conflict" };
    const updated = await client.query(
      `UPDATE users
       SET phone_hash=$1,phone_last4=$2,phone_verified_at=$3
       WHERE id=$4 RETURNING *`,
      [challenge.phone_hash, challenge.phone_last4, now, userId],
    );
    if (!updated.rows[0]) return { kind: "invalid" };
    return { kind: "success", user: updated.rows[0] };
  }));

  if (result.kind === "conflict") {
    return res.status(409).json({ error: "Этот номер уже привязан к другому аккаунту" });
  }
  if (result.kind !== "success") return res.status(401).json(invalidPhoneCodeResponse);
  if (result.session) setSessionCookie(res, result.session);
  return res.json({ user: await cleanAuthenticatedUser(result.user) });
}

app.get("/api/auth/phone/config", (_req, res) => {
  res.json(publicPhoneAuthConfig());
});

app.post("/api/auth/phone/request", asyncRoute(async (req, res) => {
  await startPhoneChallenge(req, res, { purpose: "login" });
}));

app.post("/api/auth/phone/verify", asyncRoute(async (req, res) => {
  await verifyPhoneChallenge(req, res, { purpose: "login" });
}));

app.get("/api/auth/yandex/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ enabled: getYandexAuthConfig().enabled });
});

app.get("/api/auth/yandex/start", authRateLimit, asyncRoute(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const config = getYandexAuthConfig();
  if (!config.enabled) {
    return res.status(503).json({ error: "Вход через Яндекс ID не настроен", code: "YANDEX_AUTH_UNAVAILABLE" });
  }
  const nextPath = safeOauthReturnPath(typeof req.query.next === "string" ? req.query.next : "");
  const wantsLink = req.query.link === "1";
  if (wantsLink && !req.user) {
    return res.redirect(303, yandexLoginRedirect(nextPath, "YANDEX_LINK_LOGIN_REQUIRED"));
  }
  await cleanupExpiredAuthData();
  const authorization = createYandexAuthorization(config, {
    nextPath,
    linkUserId: wantsLink ? req.user.id : null,
  });
  await query(
    `INSERT INTO yandex_oauth_attempts
      (state_hash,code_verifier,next_path,purpose,user_id,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      authorization.attempt.stateHash,
      authorization.attempt.verifier,
      authorization.attempt.nextPath,
      authorization.attempt.purpose,
      authorization.attempt.userId,
      authorization.expiresAt,
    ],
  );
  res.cookie(
    yandexOauthCookieName(authorization.state),
    authorization.cookieValue,
    yandexOauthCookieOptions(authorization.expiresAt),
  );
  return res.redirect(302, authorization.authorizationUrl);
}));

app.get("/api/auth/yandex/callback", asyncRoute(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const config = getYandexAuthConfig();
  const returnedState = typeof req.query.state === "string" ? req.query.state : "";
  const cookieName = yandexOauthCookieName(returnedState);
  const cookieState = cookieName ? req.cookies[cookieName] : undefined;
  clearYandexOauthCookie(res, returnedState);
  if (!config.enabled) return res.redirect(303, yandexLoginRedirect("", "YANDEX_AUTH_UNAVAILABLE"));

  let stateHash;
  try {
    stateHash = readYandexAuthorization(cookieState, returnedState);
  } catch {
    return res.redirect(303, yandexLoginRedirect("", "YANDEX_STATE_INVALID"));
  }
  const consumed = await query(
    `DELETE FROM yandex_oauth_attempts
     WHERE state_hash=$1 AND expires_at>$2
     RETURNING code_verifier,next_path,purpose,user_id`,
    [stateHash, new Date()],
  );
  const attempt = consumed.rows[0];
  if (!attempt) return res.redirect(303, yandexLoginRedirect("", "YANDEX_STATE_INVALID"));

  if (typeof req.query.error === "string") {
    const errorCode = req.query.error === "access_denied" ? "YANDEX_CANCELLED" : "YANDEX_PROVIDER_ERROR";
    return res.redirect(303, yandexLoginRedirect(attempt.next_path, errorCode));
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  try {
    const accessToken = await exchangeYandexCode(config, { code, verifier: attempt.code_verifier });
    const yandexUser = await fetchYandexProfile(config, accessToken);
    const result = await resolveYandexLogin(yandexUser, attempt, req.user);
    if (result.kind === "link-required") {
      return res.redirect(303, yandexLoginRedirect(attempt.next_path, "YANDEX_LINK_REQUIRED"));
    }
    if (result.kind === "identity-conflict") {
      return res.redirect(303, yandexLoginRedirect(attempt.next_path, "YANDEX_IDENTITY_CONFLICT"));
    }
    if (result.kind === "link-session-missing") {
      return res.redirect(303, yandexLoginRedirect(attempt.next_path, "YANDEX_LINK_LOGIN_REQUIRED"));
    }
    setSessionCookie(res, result.session);
    if (attempt.purpose === "link") {
      return res.redirect(303, yandexLoginRedirect(attempt.next_path, "", "YANDEX_LINKED"));
    }
    return res.redirect(303, safeOauthReturnPath(attempt.next_path));
  } catch (error) {
    const publicCode = error instanceof YandexAuthError
      ? {
        YANDEX_EMAIL_REQUIRED: "YANDEX_EMAIL_REQUIRED",
        YANDEX_STATE_INVALID: "YANDEX_STATE_INVALID",
      }[error.code] || "YANDEX_PROVIDER_ERROR"
      : "YANDEX_PROVIDER_ERROR";
    console.error(`[yandex-auth] Callback failed: ${error?.code || error?.message || "unknown error"}`);
    return res.redirect(303, yandexLoginRedirect(attempt.next_path, publicCode));
  }
}));

app.get("/api/auth/telegram/config", (_req, res) => {
  const config = getTelegramAuthConfig();
  res.json({
    enabled: config.enabled,
    botUsername: config.botUsername,
    botUrl: config.botUsername ? `https://t.me/${config.botUsername}` : null,
  });
});

app.post("/api/auth/telegram", authRateLimit, asyncRoute(async (req, res) => {
  let identity;
  try {
    ({ identity } = parseTelegramRequest(req.body));
  } catch (error) {
    return respondTelegramAuthError(res, error);
  }

  const result = await transaction(async (client) => {
    const user = await client.query(
      `SELECT u.* FROM telegram_identities ti
       JOIN users u ON u.id=ti.user_id
       WHERE ti.telegram_user_id=$1`,
      [identity.user.id],
    );
    if (!user.rowCount) return { kind: "unlinked" };
    await saveTelegramIdentity(client, identity.user, user.rows[0].id);
    const session = await createSessionRecord(client, user.rows[0].id);
    return { kind: "success", user: user.rows[0], session };
  });

  if (result.kind === "unlinked") {
    return res.status(409).json({
      error: "Привяжите Telegram к существующему аккаунту или создайте новый",
      code: "TELEGRAM_LINK_REQUIRED",
      telegram: publicTelegramUser(identity.user),
    });
  }
  setSessionCookie(res, result.session);
  return res.json({ user: await cleanAuthenticatedUser(result.user), telegram: publicTelegramUser(identity.user) });
}));

app.post("/api/telegram/webhook", asyncRoute(async (req, res) => {
  const config = getTelegramBotRuntimeConfig();
  if (!config.webhookEnabled) return res.status(404).json({ error: "Telegram webhook не настроен" });
  const receivedSecret = String(req.get("X-Telegram-Bot-Api-Secret-Token") || "");
  if (!safeSecretEqual(receivedSecret, config.webhookSecret)) {
    return res.status(401).json({ error: "Неверный Telegram webhook secret" });
  }

  const reply = telegramLaunchReply(req.body, config);
  if (reply) return res.json({ method: "sendMessage", ...reply });
  return res.json({ ok: true });
}));

app.get("/api/healthz", asyncRoute(async (_req, res) => {
  await query("SELECT 1 AS ok");
  res.json({ ok: true, service: "rollapp", version: process.env.APP_VERSION || "development" });
}));

app.get("/api/media/:id", asyncRoute(async (req, res) => {
  const result = await query("SELECT id,mime_type,image_data,size_bytes FROM wish_images WHERE id=$1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Изображение не найдено" });
  const image = result.rows[0];
  res.set({
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": String(image.size_bytes),
    ETag: `"${image.id}"`,
  });
  res.type(image.mime_type).send(image.image_data);
}));

app.post("/api/uploads/images", requireAuth, imageUploadRateLimit, imageUploadBody, asyncRoute(async (req, res) => {
  const declaredType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const detectedType = detectImageMimeType(req.body);
  if (!imageMimeTypes.has(declaredType) || detectedType !== declaredType || !req.body?.length) {
    return res.status(400).json({ error: "Загрузите изображение JPG, PNG или WEBP" });
  }
  const id = randomUUID();
  await query(
    "INSERT INTO wish_images (id,user_id,mime_type,image_data,size_bytes) VALUES ($1,$2,$3,$4,$5)",
    [id, req.user.id, detectedType, req.body, req.body.length],
  );
  res.status(201).json({ id, imageUrl: `/api/media/${id}` });
}));

app.delete("/api/uploads/images/:id", requireAuth, asyncRoute(async (req, res) => {
  const imageUrl = `/api/media/${req.params.id}`;
  const [usedByWish, usedByProfile, usedByCourse] = await Promise.all([
    query("SELECT 1 FROM wishes WHERE user_id=$1 AND image_url=$2 LIMIT 1", [req.user.id, imageUrl]),
    query("SELECT 1 FROM users WHERE id=$1 AND avatar_url=$2 LIMIT 1", [req.user.id, imageUrl]),
    query("SELECT 1 FROM education_courses WHERE user_id=$1 AND logo_url=$2 LIMIT 1", [req.user.id, imageUrl]),
  ]);
  if (usedByWish.rowCount || usedByProfile.rowCount || usedByCourse.rowCount) {
    return res.status(409).json({ error: "Изображение уже используется" });
  }
  const deleted = await query("DELETE FROM wish_images WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
  if (!deleted.rowCount) return res.status(404).json({ error: "Изображение не найдено" });
  res.json({ ok: true });
}));

app.post("/api/auth/password-reset/request", passwordResetRequestRateLimit, asyncRoute(async (req, res) => {
  const emailConfig = getEmailConfig();
  const origin = getPasswordResetOrigin();
  if (!emailConfig.enabled || !origin) {
    return res.status(503).json({
      error: "Восстановление пароля временно недоступно",
      code: "PASSWORD_RESET_UNAVAILABLE",
    });
  }

  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите корректный email" });

  res.status(202).json(passwordResetRequestResponse);
  trackBackgroundTask(processPasswordResetRequest(parsed.data.email, origin));
}));

app.post("/api/auth/password-reset/confirm", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    const invalidPassword = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return res.status(400).json(invalidPassword
      ? { error: "Пароль должен содержать от 8 до 128 символов", code: "PASSWORD_RESET_PASSWORD_INVALID" }
      : invalidPasswordResetResponse);
  }

  const tokenHash = hashToken(parsed.data.token);
  const candidate = await query(
    `SELECT t.user_id,u.email FROM password_reset_tokens t
     JOIN users u ON u.id=t.user_id
     WHERE t.token_hash=$1 AND t.delivery_status='sent'
       AND t.consumed_at IS NULL AND t.expires_at>$2`,
    [tokenHash, new Date()],
  );
  const candidateUserId = candidate.rows[0]?.user_id;
  const candidateEmail = candidate.rows[0]?.email;
  if (!candidateUserId || !candidateEmail) return res.status(400).json(invalidPasswordResetResponse);

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();
  const result = await withMutationLock(`password-auth:${candidateEmail}`, () => transaction(async (client) => {
    const lockedUser = await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [candidateUserId]);
    if (!lockedUser.rowCount) return { kind: "invalid" };
    const claimed = await client.query(
      `UPDATE password_reset_tokens SET consumed_at=$1
       WHERE token_hash=$2 AND delivery_status='sent'
         AND user_id=$3 AND consumed_at IS NULL AND expires_at>$1
       RETURNING user_id`,
      [now, tokenHash, candidateUserId],
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) return { kind: "invalid" };

    await client.query("UPDATE users SET password_hash=$1 WHERE id=$2", [passwordHash, userId]);
    await client.query(
      "UPDATE password_reset_tokens SET consumed_at=COALESCE(consumed_at,$1) WHERE user_id=$2",
      [now, userId],
    );
    await client.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
    return { kind: "success", userId };
  }));

  if (result.kind !== "success") return res.status(400).json(invalidPasswordResetResponse);
  if (req.user?.id === result.userId) res.clearCookie(sessionCookie, { path: "/" });
  return res.json({ ok: true });
}));

app.post("/api/auth/register", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = credentialsSchema.extend({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте имя, email и пароль — минимум 8 символов" });
  const { name, email, password } = parsed.data;
  const exists = await query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (exists.rowCount) return res.status(409).json({ error: "Аккаунт с таким email уже есть" });

  const userId = randomUUID();
  const username = await uniqueUsername(name);
  const passwordHash = await hashPassword(password);
  await transaction(async (client) => {
    await client.query(
      "INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)",
      [userId, email, username, name, passwordHash],
    );
    await client.query(
      `INSERT INTO wishlists (id,user_id,title,description,privacy,color,share_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, "Мои желания", "Всё, чему я буду рад", "public", "coral", randomBytes(10).toString("base64url")],
    );
    await addDefaultFriend(client, userId);
  });
  await createSession(res, userId);
  const result = await query("SELECT * FROM users WHERE id = $1", [userId]);
  res.status(201).json({ user: await cleanAuthenticatedUser(result.rows[0]) });
}));

app.post("/api/auth/login", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите корректные email и пароль" });
  const authenticated = await withMutationLock(`password-auth:${parsed.data.email}`, () => transaction(async (client) => {
    const result = await client.query("SELECT * FROM users WHERE email = $1 FOR UPDATE", [parsed.data.email]);
    const user = result.rows[0];
    if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) return null;
    const session = await createSessionRecord(client, user.id);
    return { session, user };
  }));
  if (!authenticated) {
    return res.status(401).json({ error: "Неверные email или пароль" });
  }
  setSessionCookie(res, authenticated.session);
  res.json({ user: await cleanAuthenticatedUser(authenticated.user) });
}));

app.post("/api/auth/demo", asyncRoute(async (_req, res) => {
  if (process.env.DEMO_MODE === "false") return res.status(404).json({ error: "Демо-вход отключён" });
  const result = await query("SELECT * FROM users WHERE email = $1", ["demo@rollapp.test"]);
  if (!result.rowCount) return res.status(404).json({ error: "Демо-профиль не найден" });
  await createSession(res, result.rows[0].id);
  res.json({ user: await cleanAuthenticatedUser(result.rows[0]) });
}));

app.post("/api/auth/logout", asyncRoute(async (req, res) => {
  const token = req.cookies[sessionCookie];
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  res.clearCookie(sessionCookie, { path: "/" });
  res.json({ ok: true });
}));

app.post("/api/me/phone/request", requireAuth, asyncRoute(async (req, res) => {
  await startPhoneChallenge(req, res, { purpose: "link", userId: req.user.id });
}));

app.post("/api/me/phone/verify", requireAuth, asyncRoute(async (req, res) => {
  await verifyPhoneChallenge(req, res, { purpose: "link", userId: req.user.id });
}));

app.post("/api/me/telegram/link", requireAuth, authRateLimit, asyncRoute(async (req, res) => {
  let identity;
  try {
    ({ identity } = parseTelegramRequest(req.body));
  } catch (error) {
    return respondTelegramAuthError(res, error);
  }

  let result;
  try {
    result = await withMutationLock(`telegram-link:${identity.user.id}`, () => transaction(
      (client) => saveTelegramIdentity(client, identity.user, req.user.id),
    ));
  } catch (error) {
    if (error.code === "23505") result = { kind: "conflict" };
    else throw error;
  }
  if (result.kind === "conflict") {
    return res.status(409).json({
      error: "Этот Telegram уже привязан к другому аккаунту",
      code: "TELEGRAM_IDENTITY_CONFLICT",
    });
  }
  return res.json({ user: await cleanAuthenticatedUser(req.user), telegram: publicTelegramUser(identity.user) });
}));

app.get("/api/me", asyncRoute(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: await cleanAuthenticatedUser(req.user) });
}));

app.patch("/api/me", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,32}$/).optional(),
    bio: z.string().trim().max(300).optional(),
    birthday: birthdaySchema.nullable().optional(),
    avatarUrl: avatarUrlSchema.optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Не удалось сохранить: проверьте формат полей" });
  if (parsed.data.username && isReservedProfileUsername(parsed.data.username)) {
    return res.status(409).json({ error: "Этот адрес зарезервирован сервисом — выберите другое имя профиля" });
  }
  const uploadedAvatarId = parsed.data.avatarUrl?.match(uploadedMediaUrlPattern)?.[1];
  if (uploadedAvatarId) {
    const uploadedAvatar = await query("SELECT 1 FROM wish_images WHERE id=$1 AND user_id=$2 LIMIT 1", [uploadedAvatarId, req.user.id]);
    if (!uploadedAvatar.rowCount) return res.status(400).json({ error: "Загруженное изображение не найдено" });
  }
  const next = {
    name: parsed.data.name ?? req.user.name,
    username: parsed.data.username ?? req.user.username,
    bio: parsed.data.bio ?? req.user.bio,
    birthday: parsed.data.birthday === undefined ? req.user.birthday : parsed.data.birthday,
    avatarUrl: parsed.data.avatarUrl ?? req.user.avatar_url,
  };
  try {
    const result = await query(
      `UPDATE users SET name=$1,username=$2,bio=$3,birthday=$4,avatar_url=$5 WHERE id=$6 RETURNING *`,
      [next.name, next.username, next.bio, next.birthday, next.avatarUrl, req.user.id],
    );
    res.json({ user: await cleanAuthenticatedUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Такое имя профиля уже занято" });
    throw error;
  }
}));

async function getLists(userId) {
  const result = await query(
    `SELECT l.*,COALESCE(counts.wish_count,0) AS wish_count
     FROM wishlists l
     LEFT JOIN (
       SELECT ww.wishlist_id,COUNT(*) AS wish_count
       FROM wishlist_wishes ww
       JOIN wishlists owned_list ON owned_list.id=ww.wishlist_id AND owned_list.user_id=$1
       JOIN wishes w ON w.id=ww.wish_id
       WHERE w.status='active'
       GROUP BY ww.wishlist_id
     ) counts ON counts.wishlist_id=l.id
     WHERE l.user_id=$1 ORDER BY l.created_at`,
    [userId],
  );
  return result.rows.map(mapList);
}

async function getWishes(userId, viewerId = null, includePrivate = false) {
  const params = [userId];
  const privacyClause = includePrivate ? "" : `
    AND w.privacy <> 'private'
    AND w.id NOT IN (
      SELECT secret_ww.wish_id FROM wishlist_wishes secret_ww
      JOIN wishlists secret_list ON secret_list.id=secret_ww.wishlist_id
      WHERE secret_list.privacy='private'
    )`;
  const result = await query(
    `SELECT w.* FROM wishes w WHERE w.user_id=$1 ${privacyClause}
     ORDER BY w.sort_order ASC, w.created_at DESC`,
    params,
  );
  const wishes = result.rows.map(mapWish);
  if (!wishes.length) return wishes;

  const wishIds = wishes.map((wish) => wish.id);
  const wishIdPlaceholders = wishIds.map((_, index) => `$${index + 1}`).join(",");
  const likedWishIdPlaceholders = wishIds.map((_, index) => `$${index + 2}`).join(",");
  const [links, reservations, likes] = await Promise.all([
    query(
      `SELECT wish_id,wishlist_id FROM wishlist_wishes WHERE wish_id IN (${wishIdPlaceholders})`,
      wishIds,
    ),
    viewerId === userId
      ? Promise.resolve({ rows: [] })
      : query(
        `SELECT wish_id,user_id FROM reservations
         WHERE wish_id IN (${wishIdPlaceholders}) AND status IN ('reserved','multiple')`,
        wishIds,
      ),
    viewerId && viewerId !== userId
      ? query(
        `SELECT source_wish_id FROM wishes
         WHERE user_id=$1 AND source_wish_id IN (${likedWishIdPlaceholders})`,
        [viewerId, ...wishIds],
      )
      : Promise.resolve({ rows: [] }),
  ]);
  const listIdsByWish = new Map();
  for (const row of links.rows) {
    if (!listIdsByWish.has(row.wish_id)) listIdsByWish.set(row.wish_id, []);
    listIdsByWish.get(row.wish_id).push(row.wishlist_id);
  }
  const reservationsByWish = new Map();
  for (const row of reservations.rows) {
    if (!reservationsByWish.has(row.wish_id)) reservationsByWish.set(row.wish_id, []);
    reservationsByWish.get(row.wish_id).push(row.user_id);
  }
  const likedWishIds = new Set(likes.rows.map((row) => row.source_wish_id));
  for (const wish of wishes) {
    wish.listIds = listIdsByWish.get(wish.id) || [];
    if (viewerId === userId) {
      wish.reservationCount = 0;
      wish.reservedByMe = false;
      wish.likedByMe = false;
    } else {
      const reservingUserIds = reservationsByWish.get(wish.id) || [];
      wish.reservationCount = reservingUserIds.length;
      wish.reservedByMe = reservingUserIds.includes(viewerId);
      wish.likedByMe = likedWishIds.has(wish.id);
    }
  }
  return wishes;
}

async function canViewWish(wish, viewerId, shareToken = "", client = null) {
  const runQuery = client ? (...args) => client.query(...args) : query;
  if (wish.user_id === viewerId) return true;
  if (wish.privacy === "private") return false;

  const linkedLists = await runQuery(
    `SELECT l.privacy,l.share_token FROM wishlist_wishes ww
     JOIN wishlists l ON l.id=ww.wishlist_id WHERE ww.wish_id=$1`,
    [wish.id],
  );
  if (linkedLists.rows.some((list) => list.privacy === "private")) return false;
  if (!linkedLists.rowCount) return true;
  if (linkedLists.rows.some((list) => list.privacy === "public")) return true;
  if (shareToken && linkedLists.rows.some((list) => list.privacy === "link" && list.share_token === shareToken)) return true;
  if (!linkedLists.rows.some((list) => list.privacy === "followers")) return false;

  const follows = await runQuery(
    "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",
    [viewerId, wish.user_id],
  );
  return Boolean(follows.rowCount);
}

app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const [lists, wishes, follows, birthdays, reservations, groupRows] = await Promise.all([
    getLists(req.user.id),
    getWishes(req.user.id, req.user.id, true),
    query("SELECT COUNT(*) AS count FROM follows WHERE follower_id=$1", [req.user.id]),
    query(
      `SELECT u.id,u.username,u.name,u.avatar_url,u.birthday
       FROM follows f JOIN users u ON u.id=f.following_id
       WHERE f.follower_id=$1 AND u.birthday IS NOT NULL ORDER BY u.birthday LIMIT 4`,
      [req.user.id],
    ),
    query(
      `SELECT r.id,r.created_at,w.id AS wish_id,w.title,w.image_url,w.price,w.currency,
              w.status AS wish_status,w.privacy AS wish_privacy,
              u.name AS owner_name,u.username AS owner_username,
              f.follower_id AS follows_owner,l.privacy AS list_privacy
       FROM reservations r
       JOIN wishes w ON w.id=r.wish_id
       JOIN users u ON u.id=w.user_id
       LEFT JOIN follows f ON f.follower_id=$1 AND f.following_id=w.user_id
       LEFT JOIN wishlist_wishes ww ON ww.wish_id=w.id
       LEFT JOIN wishlists l ON l.id=ww.wishlist_id
       WHERE r.user_id=$1
         AND r.status IN ('reserved','multiple')
       ORDER BY r.created_at DESC`,
      [req.user.id],
    ),
    query(
      `SELECT g.id,g.wishlist_id,g.space,g.title,m.wish_id
       FROM wish_groups g
       JOIN wishlists l ON l.id=g.wishlist_id
       LEFT JOIN wish_group_members m ON m.group_id=g.id
       WHERE l.user_id=$1 ORDER BY g.created_at,m.wish_id`,
      [req.user.id],
    ),
  ]);
  const reservationGroups = new Map();
  for (const row of reservations.rows) {
    if (!reservationGroups.has(row.id)) reservationGroups.set(row.id, { row, listPrivacies: new Set() });
    if (row.list_privacy) reservationGroups.get(row.id).listPrivacies.add(row.list_privacy);
  }
  const visibleReservations = [...reservationGroups.values()]
    .filter(({ row, listPrivacies }) => (
      row.wish_status === "active"
      && row.wish_privacy !== "private"
      && Boolean(row.follows_owner)
      && !listPrivacies.has("private")
      && (!listPrivacies.size || [...listPrivacies].some((privacy) => ["public", "followers", "link"].includes(privacy)))
    ))
    .slice(0, 6)
    .map(({ row }) => {
      const { wish_status: _wishStatus, wish_privacy: _wishPrivacy, follows_owner: _followsOwner, list_privacy: _listPrivacy, ...item } = row;
      return { ...item, price: item.price === null ? null : Number(item.price) };
    });
  const groupsById = new Map();
  for (const row of groupRows.rows) {
    if (!groupsById.has(row.id)) groupsById.set(row.id, { id: row.id, listId: row.wishlist_id, space: row.space, title: row.title, wishIds: [] });
    if (row.wish_id) groupsById.get(row.id).wishIds.push(row.wish_id);
  }
  res.json({
    lists,
    wishes,
    groups: [...groupsById.values()],
    followingCount: Number(follows.rows[0].count),
    birthdays: birthdays.rows.map((row) => ({ ...cleanUser(row), email: undefined })),
    reservations: visibleReservations,
    games: [],
  });
}));

app.patch("/api/wishes/reorder", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ wishIds: z.array(z.string().min(1)).min(1).max(1000) })
    .refine(({ wishIds }) => new Set(wishIds).size === wishIds.length)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректный порядок желаний" });
  const outcome = await transaction(async (client) => {
    const wishPlaceholders = parsed.data.wishIds.map((_, index) => `$${index + 2}`).join(",");
    const owned = await client.query(
      `SELECT id FROM wishes WHERE user_id=$1 AND id IN (${wishPlaceholders}) FOR UPDATE`,
      [req.user.id, ...parsed.data.wishIds],
    );
    if (owned.rowCount !== parsed.data.wishIds.length) return false;
    for (const [index, wishId] of parsed.data.wishIds.entries()) {
      await client.query("UPDATE wishes SET sort_order=$1 WHERE id=$2 AND user_id=$3", [index, wishId, req.user.id]);
    }
    return true;
  });
  if (!outcome) return res.status(404).json({ error: "Одно из желаний не найдено" });
  res.json({ ok: true });
}));

async function runWishGroupTransaction(listId, callback) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await withMutationLock(`wish-group-list:${listId}`, () => transaction(callback));
    } catch (error) {
      if (["40P01", "40001"].includes(error?.code) && attempt < 2) continue;
      if (error?.code === "23505") return { status: 409, error: "Желание уже в группе" };
      throw error;
    }
  }
  throw new Error("Не удалось завершить операцию с группой");
}

function inferWishGroupSpace(list, wishes, requestedSpace) {
  if (requestedSpace) return requestedSpace;
  const wishSpaces = new Set(wishes.map((wish) => wish.space).filter((space) => listSpaceValues.includes(space)));
  if (wishSpaces.size === 1) return [...wishSpaces][0];
  return listSpaceValues.includes(list.space) ? list.space : "products";
}

app.post("/api/lists/:id/groups", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({
    wishIds: z.array(z.string()).length(2).refine((ids) => new Set(ids).size === 2),
    space: listSpaceSchema.optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Выберите два разных желания" });
  const outcome = await runWishGroupTransaction(req.params.id, async (client) => {
    const list = await client.query("SELECT id,space FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, req.user.id]);
    if (!list.rowCount) return { status: 404, error: "Список не найден" };
    const wishes = await client.query(
      "SELECT id,space FROM wishes WHERE user_id=$1 AND id IN ($2,$3) ORDER BY id FOR UPDATE",
      [req.user.id, ...parsed.data.wishIds],
    );
    if (wishes.rowCount !== 2) return { status: 404, error: "Одно из желаний не найдено" };
    const space = inferWishGroupSpace(list.rows[0], wishes.rows, parsed.data.space);
    const occupied = await client.query(
      "SELECT wish_id FROM wish_group_members WHERE wishlist_id=$1 AND space=$2 AND wish_id IN ($3,$4)",
      [req.params.id, space, ...parsed.data.wishIds],
    );
    if (occupied.rowCount) return { status: 409, error: "Желание уже в группе" };
    const id = randomUUID();
    await client.query(
      `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2),($1,$3)
       ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
      [req.params.id, ...parsed.data.wishIds],
    );
    await client.query("INSERT INTO wish_groups (id,wishlist_id,space) VALUES ($1,$2,$3)", [id, req.params.id, space]);
    await client.query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4),($1,$2,$3,$5)",
      [id, req.params.id, space, ...parsed.data.wishIds],
    );
    return { id, space };
  });
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(201).json({ group: { id: outcome.id, listId: req.params.id, space: outcome.space, title: "Группа", wishIds: parsed.data.wishIds } });
}));

app.post("/api/lists/:listId/groups/:groupId/wishes", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ wishId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Желание не выбрано" });
  const outcome = await runWishGroupTransaction(req.params.listId, async (client) => {
    const list = await client.query(
      "SELECT id FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.listId, req.user.id],
    );
    if (!list.rowCount) return { status: 404, error: "Список не найден" };
    const group = await client.query(
      "SELECT id,space FROM wish_groups WHERE id=$1 AND wishlist_id=$2 FOR UPDATE",
      [req.params.groupId, req.params.listId],
    );
    if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
    const wish = await client.query(
      "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [parsed.data.wishId, req.user.id],
    );
    if (!wish.rowCount) return { status: 404, error: "Желание не найдено" };
    const occupied = await client.query(
      "SELECT group_id FROM wish_group_members WHERE wishlist_id=$1 AND space=$2 AND wish_id=$3",
      [req.params.listId, group.rows[0].space, parsed.data.wishId],
    );
    if (occupied.rowCount) return { status: 409, error: "Желание уже в группе" };
    await client.query(
      `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)
       ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
      [req.params.listId, parsed.data.wishId],
    );
    await client.query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4)",
      [req.params.groupId, req.params.listId, group.rows[0].space, parsed.data.wishId],
    );
    return { wishId: parsed.data.wishId };
  });
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(201).json({ wishId: outcome.wishId });
}));

app.delete("/api/lists/:listId/groups/:groupId/wishes/:wishId", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await runWishGroupTransaction(req.params.listId, (client) => removeWishFromOwnedGroup({
    client,
    groupId: req.params.groupId,
    listId: req.params.listId,
    wishId: req.params.wishId,
    userId: req.user.id,
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true, wishId: outcome.wishId, dissolved: outcome.dissolved, group: outcome.group });
}));

app.patch("/api/lists/:listId/groups/:groupId", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(60) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте название группы" });
  const result = await query(
    `UPDATE wish_groups g SET title=$1
     FROM wishlists l
     WHERE g.id=$2 AND g.wishlist_id=$3 AND l.id=g.wishlist_id AND l.user_id=$4
     RETURNING g.id,g.title`,
    [parsed.data.title, req.params.groupId, req.params.listId, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
  res.json({ group: { id: result.rows[0].id, title: result.rows[0].title } });
}));

app.post("/api/lists/:listId/groups/:groupId/move", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ targetListId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Выберите список для переноса" });
  const outcome = await runWishGroupTransaction(req.params.listId, (client) => moveOwnedWishGroup({
    client,
    groupId: req.params.groupId,
    sourceListId: req.params.listId,
    targetListId: parsed.data.targetListId,
    userId: req.user.id,
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json(outcome);
}));

app.delete("/api/lists/:listId/groups/:groupId", requireAuth, asyncRoute(async (req, res) => {
  const result = await deleteOwnedWishGroup({
    groupId: req.params.groupId,
    listId: req.params.listId,
    userId: req.user.id,
  });
  if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
  res.json({ ok: true });
}));

app.post("/api/lists", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).default(""),
    privacy: z.enum(["public", "followers", "link", "private"]).default("public"),
    occasionDate: z.string().date().nullable().optional(),
    color: z.enum(["coral", "blue", "lime", "sun", "ink"]).default("coral"),
    space: listSpaceSchema.default("products"),
    wishIds: z.array(z.string().min(1)).max(1_000).default([]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Укажите название и настройки списка" });
  const id = randomUUID();
  const token = randomBytes(10).toString("base64url");
  const data = parsed.data;
  const wishIds = [...new Set(data.wishIds)];
  const created = await transaction(async (client) => {
    if (wishIds.length) {
      const wishPlaceholders = wishIds.map((_, index) => `$${index + 2}`).join(",");
      const owned = await client.query(
        `SELECT id FROM wishes WHERE user_id=$1 AND id IN (${wishPlaceholders})`,
        [req.user.id, ...wishIds],
      );
      if (owned.rowCount !== wishIds.length) return false;
    }
    await client.query(
      `INSERT INTO wishlists (id,user_id,title,description,privacy,occasion_date,color,share_token,space)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, req.user.id, data.title, data.description, data.privacy, data.occasionDate || null, data.color, token, data.space],
    );
    for (const wishId of wishIds) {
      await client.query(
        `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)
         ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
        [id, wishId],
      );
    }
    return true;
  });
  if (!created) return res.status(400).json({ error: "Одно из желаний не найдено" });
  const result = await query("SELECT *,0 AS wish_count FROM wishlists WHERE id=$1", [id]);
  res.status(201).json({ list: mapList(result.rows[0]) });
}));

app.patch("/api/lists/:id", requireAuth, asyncRoute(async (req, res) => {
  const patchSchema = z.object({
    title: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).optional(),
    privacy: z.enum(["public", "followers", "link", "private"]).optional(),
    occasionDate: z.string().date().nullable().optional(),
    color: z.enum(["coral", "blue", "lime", "sun", "ink"]).optional(),
    space: listSpaceSchema.optional(),
  });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте настройки списка" });
  const data = parsed.data;
  const outcome = await withMutationLock(`list:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT * FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Список не найден" };
    const current = owned.rows[0];
    await client.query(
      `UPDATE wishlists SET title=$1,description=$2,privacy=$3,occasion_date=$4,color=$5,space=$6 WHERE id=$7`,
      [data.title ?? current.title, data.description ?? current.description, data.privacy ?? current.privacy, data.occasionDate === undefined ? current.occasion_date : data.occasionDate, data.color ?? current.color, data.space ?? current.space, current.id],
    );
    return { status: 200, id: current.id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const result = await query("SELECT * FROM wishlists WHERE id=$1", [outcome.id]);
  const count = await query(
    `SELECT COUNT(*) AS count FROM wishlist_wishes ww
     JOIN wishes w ON w.id=ww.wish_id
     WHERE ww.wishlist_id=$1 AND w.status='active'`,
    [outcome.id],
  );
  res.json({ list: mapList({ ...result.rows[0], wish_count: count.rows[0].count }) });
}));

app.delete("/api/lists/:id", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`list:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id,privacy FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Список не найден" };

    const fallback = await client.query(
      `SELECT id FROM wishlists
       WHERE user_id=$1 AND id<>$2
       ORDER BY CASE WHEN title='Мои желания' THEN 0 ELSE 1 END, created_at
       LIMIT 1 FOR UPDATE`,
      [req.user.id, req.params.id],
    );
    if (!fallback.rowCount) return { status: 400, error: "Нельзя удалить единственный список" };

    const linked = await client.query("SELECT wish_id FROM wishlist_wishes WHERE wishlist_id=$1", [req.params.id]);
    let reassignedCount = 0;
    for (const row of linked.rows) {
      const other = await client.query(
        "SELECT 1 FROM wishlist_wishes WHERE wish_id=$1 AND wishlist_id<>$2 LIMIT 1",
        [row.wish_id, req.params.id],
      );
      if (other.rowCount) continue;
      await client.query(
        "INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2) ON CONFLICT (wishlist_id,wish_id) DO NOTHING",
        [fallback.rows[0].id, row.wish_id],
      );
      if (owned.rows[0].privacy !== "public") {
        await client.query("UPDATE wishes SET privacy='private' WHERE id=$1", [row.wish_id]);
      }
      reassignedCount += 1;
    }
    await client.query("DELETE FROM wishlists WHERE id=$1", [req.params.id]);
    return { status: 200, reassignedCount, fallbackListId: fallback.rows[0].id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true, reassignedCount: outcome.reassignedCount, fallbackListId: outcome.fallbackListId });
}));

const uniqueListIds = (listIds) => new Set(listIds).size === listIds.length;

const listIdsSchema = z.array(z.string()).refine(
  uniqueListIds,
  { message: "Список нельзя выбрать дважды" },
);

// Желание теперь может существовать без списка: пространство задаёт
// собственное поле space желания, поэтому пустой listIds разрешён и при создании.
const createListIdsSchema = listIdsSchema;

const wishFieldsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  url: z.string().url().max(2000).or(z.literal("")).default(""),
  imageUrl: z.string().url().max(2000).or(localImageUrlSchema).or(z.literal("")).default(""),
  fundraisingUrl: z.string().url().max(2000).or(z.literal("")).default(""),
  vehicleMake: z.string().trim().max(120).default(""),
  vehicleModel: z.string().trim().max(120).default(""),
  price: z.coerce.number().min(0).max(999999999).nullable().optional(),
  currency: z.enum(["RUB", "USD", "EUR", "KZT", "BYN"]).default("RUB"),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  privacy: z.enum(["inherit", "private"]).default("inherit"),
  allowMultiple: z.boolean().default(false),
  eventDate: z.string().date().nullable().default(null),
  space: listSpaceSchema.nullable().optional(),
});

// Создание: пустой listIds разрешён — желание живёт в своём пространстве (space).
const wishSchema = wishFieldsSchema.extend({ listIds: createListIdsSchema });

// Патч: listIds: [] по-прежнему разрешён для намеренной отвязки желания от списков.
const wishPatchSchema = wishFieldsSchema.extend({ listIds: listIdsSchema });

const wishMediaNoteSchema = z.object({
  summary: z.string().max(12000).default(""),
  keyIdeas: z.string().max(40000).default(""),
  quotes: z.string().max(40000).default(""),
  applications: z.string().max(40000).default(""),
}).strict();

const vehicleModelsQuerySchema = z.object({
  make: z.string().trim().min(1).max(120),
});

function sendVehicleCatalogError(res, error) {
  if (!(error instanceof VehicleCatalogUnavailableError)) throw error;
  return res.status(503).json({
    error: "Справочник «Авто» временно недоступен. Марку и модель можно ввести вручную.",
    code: error.code,
  });
}

app.get("/api/vehicle-catalog/makes", requireAuth, asyncRoute(async (_req, res) => {
  try {
    const makes = await vehicleCatalog.listMakes();
    res.set("Cache-Control", "private, max-age=300");
    return res.json({ makes });
  } catch (error) {
    return sendVehicleCatalogError(res, error);
  }
}));

app.get("/api/vehicle-catalog/models", requireAuth, asyncRoute(async (req, res) => {
  const parsed = vehicleModelsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Укажите марку автомобиля" });
  try {
    const models = await vehicleCatalog.listModels(parsed.data.make);
    res.set("Cache-Control", "private, max-age=300");
    return res.json({ models });
  } catch (error) {
    return sendVehicleCatalogError(res, error);
  }
}));

function parseMarketplaceOfferSnapshot(row, wishTitle = "") {
  if (!row) return null;
  let offers = [];
  try {
    const parsed = JSON.parse(row.offers_json || "[]");
    if (Array.isArray(parsed)) offers = parsed;
  } catch {
    offers = [];
  }
  const expiresAt = row.expires_at ? new Date(row.expires_at).toISOString() : null;
  return {
    query: row.query,
    offers,
    summary: row.summary || "",
    model: row.model || "",
    searchedAt: row.searched_at ? new Date(row.searched_at).toISOString() : null,
    expiresAt,
    stale: !expiresAt || Date.parse(expiresAt) <= Date.now() || row.query !== wishTitle,
  };
}

function writeMarketplaceOfferEvent(res, event, value) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  res.flush?.();
}

app.get("/api/wishes/:id/marketplace-offers", requireAuth, asyncRoute(async (req, res) => {
  const owned = await query(
    "SELECT id,title FROM wishes WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user.id],
  );
  if (!owned.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  const snapshot = await query(
    `SELECT query,offers_json,summary,model,searched_at,expires_at
     FROM wish_marketplace_offer_snapshots WHERE wish_id=$1 AND user_id=$2`,
    [req.params.id, req.user.id],
  );
  res.set("Cache-Control", "private, no-store");
  return res.json({
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    snapshot: parseMarketplaceOfferSnapshot(snapshot.rows[0], owned.rows[0].title),
  });
}));

app.post("/api/wishes/:id/marketplace-offers/refresh", requireAuth, marketplaceOffersRateLimit, async (req, res, next) => {
  let owned;
  try {
    owned = await query(
      `SELECT id,title,description,url,price,currency,space
       FROM wishes WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id],
    );
  } catch (error) {
    return next(error);
  }
  if (!owned.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: "OpenRouter пока не настроен", code: "openrouter_not_configured" });
  }

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("OpenRouter request timed out")), 90_000);
  const keepAlive = setInterval(() => writeMarketplaceOfferEvent(res, "ping", { at: Date.now() }), 12_000);
  res.once("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    writeMarketplaceOfferEvent(res, "status", { stage: "searching", message: "Ищем товар на маркетплейсах…" });
    const [openRouterSearch, marketplaceSearch] = await Promise.allSettled([
      fetchOpenRouterMarketplaceOffers(owned.rows[0], {
        signal: controller.signal,
        allowEmpty: true,
        marketplaceIds: ["ozon"],
      }),
      fetchMarketplaceResolvedOffers(owned.rows[0], { signal: controller.signal }),
    ]);
    const result = openRouterSearch.status === "fulfilled" ? openRouterSearch.value : {
      offers: [],
      summary: "",
      model: process.env.OPENROUTER_MODEL || "",
      usage: null,
    };
    const resolvedOffers = marketplaceSearch.status === "fulfilled" ? marketplaceSearch.value : [];
    result.offers = mergeDirectOffers(
      resolvedOffers,
      filterDirectOffersForWish(owned.rows[0], result.offers),
    );
    if (!result.offers.length) {
      if (openRouterSearch.status === "rejected") throw openRouterSearch.reason;
      throw new OpenRouterOffersError("Не удалось найти прямые карточки товара", {
        status: 422,
        code: "marketplace_offers_not_found",
      });
    }
    if (resolvedOffers.some((offer) => !offer.source)) {
      result.summary = "Найдены прямые карточки товара. Предложения отсортированы по совпадению, наличию и цене.";
    } else if (result.offers.length && result.offers.every((offer) => offer.source)) {
      result.summary = "Новых точных предложений не найдено. Исходная ссылка сохранена.";
    }
    writeMarketplaceOfferEvent(res, "status", { stage: "ranking", message: "Проверяем цены и выбираем лучшие…" });

    const configuredMinutes = Number.parseInt(process.env.OPENROUTER_OFFERS_CACHE_MINUTES || "60", 10);
    const cacheMinutes = Math.min(1_440, Math.max(5, Number.isFinite(configuredMinutes) ? configuredMinutes : 60));
    const searchedAt = new Date();
    const expiresAt = new Date(searchedAt.getTime() + cacheMinutes * 60_000);
    const saved = await query(
      `INSERT INTO wish_marketplace_offer_snapshots
         (wish_id,user_id,query,offers_json,summary,model,searched_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (wish_id) DO UPDATE SET
         user_id=EXCLUDED.user_id,
         query=EXCLUDED.query,
         offers_json=EXCLUDED.offers_json,
         summary=EXCLUDED.summary,
         model=EXCLUDED.model,
         searched_at=EXCLUDED.searched_at,
         expires_at=EXCLUDED.expires_at
       WHERE wish_marketplace_offer_snapshots.user_id=EXCLUDED.user_id
       RETURNING query,offers_json,summary,model,searched_at,expires_at`,
      [
        req.params.id,
        req.user.id,
        owned.rows[0].title,
        JSON.stringify(result.offers),
        result.summary,
        result.model,
        searchedAt,
        expiresAt,
      ],
    );
    if (!saved.rowCount) throw new OpenRouterOffersError("Нет доступа к предложениям", { status: 403, code: "marketplace_offers_forbidden" });
    writeMarketplaceOfferEvent(res, "done", {
      snapshot: parseMarketplaceOfferSnapshot(saved.rows[0], owned.rows[0].title),
    });
  } catch (error) {
    const known = error instanceof OpenRouterOffersError;
    const aborted = controller.signal.aborted;
    writeMarketplaceOfferEvent(res, "error", {
      error: aborted ? "Поиск занял слишком много времени. Попробуйте ещё раз" : known ? error.message : "Не удалось обновить предложения",
      code: aborted ? "marketplace_offers_timeout" : known ? error.code : "marketplace_offers_failed",
    });
  } finally {
    clearTimeout(timeout);
    clearInterval(keepAlive);
    if (!res.writableEnded) res.end();
  }
});

app.get(["/api/wishes/:id/media-note", "/api/wishes/:id/book-note"], requireAuth, asyncRoute(async (req, res) => {
  const owned = await query(
    "SELECT id FROM wishes WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user.id],
  );
  if (!owned.rowCount) return res.status(404).json({ error: "Медиа-айтем не найден" });
  const result = await query(
    `SELECT summary,key_ideas,quotes,applications,updated_at
     FROM wish_book_notes WHERE wish_id=$1 AND user_id=$2`,
    [req.params.id, req.user.id],
  );
  res.set("Cache-Control", "private, no-store");
  return res.json({ note: mapWishMediaNote(result.rows[0]) });
}));

app.patch(["/api/wishes/:id/media-note", "/api/wishes/:id/book-note"], requireAuth, asyncRoute(async (req, res) => {
  const parsed = wishMediaNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Конспект слишком большой или содержит неверные данные" });
  const data = parsed.data;
  const outcome = await withMutationLock(`wish-media-note:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Медиа-айтем не найден" };
    const result = await client.query(
      `INSERT INTO wish_book_notes (wish_id,user_id,summary,key_ideas,quotes,applications)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (wish_id) DO UPDATE SET
         summary=EXCLUDED.summary,
         key_ideas=EXCLUDED.key_ideas,
         quotes=EXCLUDED.quotes,
         applications=EXCLUDED.applications,
         updated_at=CURRENT_TIMESTAMP
       WHERE wish_book_notes.user_id=EXCLUDED.user_id
       RETURNING summary,key_ideas,quotes,applications,updated_at`,
      [req.params.id, req.user.id, data.summary, data.keyIdeas, data.quotes, data.applications],
    );
    if (!result.rowCount) return { status: 403, error: "Нет доступа к конспекту" };
    return { note: mapWishMediaNote(result.rows[0]) };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.set("Cache-Control", "private, no-store");
  return res.json({ note: outcome.note });
}));

app.post("/api/wishes", requireAuth, asyncRoute(async (req, res) => {
  const parsed = wishSchema.safeParse(req.body);
  if (!parsed.success) {
    const listIdsIssue = parsed.error.issues.find((issue) => issue.path[0] === "listIds");
    if (listIdsIssue) return res.status(400).json({ error: listIdsIssue.message });
    return res.status(400).json({ error: "Добавьте название и проверьте данные желания" });
  }
  const data = parsed.data;
  const ownedLists = await query("SELECT id FROM wishlists WHERE user_id=$1", [req.user.id]);
  const ownedIds = new Set(ownedLists.rows.map((row) => row.id));
  if (data.listIds.some((id) => !ownedIds.has(id))) return res.status(403).json({ error: "Список вам не принадлежит" });
  const id = randomUUID();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,fundraising_url,vehicle_make,vehicle_model,price,currency,priority,privacy,allow_multiple,event_date,space)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, req.user.id, data.title, data.description, data.url, data.imageUrl, data.fundraisingUrl, data.vehicleMake, data.vehicleModel, data.price ?? null, data.currency, data.priority, data.privacy, data.allowMultiple, data.eventDate, data.space ?? null],
    );
    for (const listId of data.listIds) await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, id]);
  });
  const result = await getWishes(req.user.id, req.user.id, true);
  res.status(201).json({ wish: result.find((wish) => wish.id === id) });
}));

app.post("/api/wishes/backfill-previews", requireAuth, previewBackfillRateLimit, asyncRoute(async (req, res) => {
  res.json(await deduplicatedPreviewBackfill(req.user.id));
}));

app.patch("/api/wishes/:id", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT * FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Желание не найдено" };
    const current = owned.rows[0];
    const currentLinks = await client.query("SELECT wishlist_id FROM wishlist_wishes WHERE wish_id=$1", [current.id]);
    const merged = {
      title: req.body.title ?? current.title,
      description: req.body.description ?? current.description,
      url: req.body.url ?? current.url,
      imageUrl: req.body.imageUrl ?? current.image_url,
      fundraisingUrl: req.body.fundraisingUrl ?? current.fundraising_url,
      vehicleMake: req.body.vehicleMake ?? current.vehicle_make,
      vehicleModel: req.body.vehicleModel ?? current.vehicle_model,
      price: req.body.price === undefined ? current.price : req.body.price,
      currency: req.body.currency ?? current.currency,
      priority: req.body.priority ?? current.priority,
      privacy: req.body.privacy ?? current.privacy,
      allowMultiple: req.body.allowMultiple ?? current.allow_multiple,
      eventDate: req.body.eventDate === undefined ? formatEventDate(current.event_date) : req.body.eventDate,
      space: req.body.space === undefined ? current.space : req.body.space,
      listIds: req.body.listIds ?? currentLinks.rows.map((row) => row.wishlist_id),
    };
    const parsed = wishPatchSchema.safeParse(merged);
    if (!parsed.success) return { status: 400, error: "Проверьте данные желания" };
    const data = parsed.data;
    const ownedLists = await client.query("SELECT id FROM wishlists WHERE user_id=$1", [req.user.id]);
    const ownedIds = new Set(ownedLists.rows.map((row) => row.id));
    if (data.listIds.some((id) => !ownedIds.has(id))) {
      return { status: 403, error: "Список вам не принадлежит" };
    }
    await client.query(
      `UPDATE wishes SET title=$1,description=$2,url=$3,image_url=$4,fundraising_url=$5,vehicle_make=$6,vehicle_model=$7,price=$8,currency=$9,priority=$10,privacy=$11,allow_multiple=$12,event_date=$13,space=$14 WHERE id=$15`,
      [data.title, data.description, data.url, data.imageUrl, data.fundraisingUrl, data.vehicleMake, data.vehicleModel, data.price ?? null, data.currency, data.priority, data.privacy, data.allowMultiple, data.eventDate, data.space ?? null, current.id],
    );
    const reservations = await client.query(
      "SELECT id FROM reservations WHERE wish_id=$1 ORDER BY created_at,id",
      [current.id],
    );
    if (data.allowMultiple) {
      await client.query("UPDATE reservations SET status='multiple' WHERE wish_id=$1", [current.id]);
    } else if (reservations.rowCount) {
      const [kept, ...duplicates] = reservations.rows;
      for (const duplicate of duplicates) await client.query("DELETE FROM reservations WHERE id=$1", [duplicate.id]);
      await client.query("UPDATE reservations SET status='reserved' WHERE id=$1", [kept.id]);
    }
    await client.query("DELETE FROM wishlist_wishes WHERE wish_id=$1", [current.id]);
    for (const listId of data.listIds) await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, current.id]);
    await client.query(
      "DELETE FROM wish_group_members WHERE wish_id=$1 AND NOT (wishlist_id = ANY($2::text[]))",
      [current.id, data.listIds],
    );
    const ownedGroupMembers = await client.query(
      `SELECT g.id,m.wish_id FROM wish_groups g
       JOIN wishlists l ON l.id=g.wishlist_id
       LEFT JOIN wish_group_members m ON m.group_id=g.id
       WHERE l.user_id=$1`,
      [req.user.id],
    );
    const groupMemberCounts = new Map();
    for (const row of ownedGroupMembers.rows) {
      groupMemberCounts.set(row.id, (groupMemberCounts.get(row.id) || 0) + (row.wish_id ? 1 : 0));
    }
    for (const [groupId, memberCount] of groupMemberCounts) {
      if (memberCount < 2) await client.query("DELETE FROM wish_groups WHERE id=$1", [groupId]);
    }
    return { status: 200, id: current.id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const result = await getWishes(req.user.id, req.user.id, true);
  res.json({ wish: result.find((wish) => wish.id === outcome.id) });
}));

app.post("/api/wishes/:id/lists/:listId", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
    const [ownedWish, ownedList] = await Promise.all([
      client.query(
        "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [req.params.id, req.user.id],
      ),
      client.query(
        "SELECT id FROM wishlists WHERE id=$1 AND user_id=$2",
        [req.params.listId, req.user.id],
      ),
    ]);
    if (!ownedWish.rowCount) return { status: 404, error: "Желание не найдено" };
    if (!ownedList.rowCount) return { status: 403, error: "Список вам не принадлежит" };
    await client.query(
      "INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2) ON CONFLICT (wishlist_id,wish_id) DO NOTHING",
      [req.params.listId, req.params.id],
    );
    return { status: 200, id: req.params.id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const result = await getWishes(req.user.id, req.user.id, true);
  res.json({ wish: result.find((wish) => wish.id === outcome.id) });
}));

app.post("/api/wishes/:id/fulfilled", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ fulfilled: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте статус желания" });
  const requestedStatus = parsed.data.fulfilled === undefined
    ? null
    : parsed.data.fulfilled ? "fulfilled" : "active";
  const result = requestedStatus
    ? await query(
      "UPDATE wishes SET status=$3 WHERE id=$1 AND user_id=$2 RETURNING status",
      [req.params.id, req.user.id, requestedStatus],
    )
    : await query(
      "UPDATE wishes SET status=CASE WHEN status='fulfilled' THEN 'active' ELSE 'fulfilled' END WHERE id=$1 AND user_id=$2 RETURNING status",
      [req.params.id, req.user.id],
    );
  if (!result.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  res.json({ status: result.rows[0].status });
}));

app.delete("/api/wishes/:id", requireAuth, asyncRoute(async (req, res) => {
  const result = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { rowCount: 0, rows: [] };
    return client.query("DELETE FROM wishes WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
  }));
  if (!result.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  res.json({ ok: true });
}));

app.post("/api/wishes/:id/copy", requireAuth, asyncRoute(async (req, res) => {
  const found = await query("SELECT * FROM wishes WHERE id=$1 AND status='active'", [req.params.id]);
  if (!found.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  const source = found.rows[0];
  if (source.user_id === req.user.id) return res.status(400).json({ error: "Это желание уже находится в вашем списке" });
  const shareToken = typeof req.body?.shareToken === "string" ? req.body.shareToken : "";
  if (!(await canViewWish(source, req.user.id, shareToken))) return res.status(404).json({ error: "Желание не найдено" });

  const requestedListId = typeof req.body?.listId === "string" ? req.body.listId : "";
  const target = requestedListId
    ? await query("SELECT id FROM wishlists WHERE id=$1 AND user_id=$2", [requestedListId, req.user.id])
    : await query(
      `SELECT id FROM wishlists WHERE user_id=$1
       ORDER BY CASE WHEN title='Мои желания' THEN 0 ELSE 1 END, created_at LIMIT 1`,
      [req.user.id],
    );
  if (!target.rowCount) return res.status(400).json({ error: "Сначала создайте список желаний" });

  const id = await withMutationLock(`wish-like:${req.user.id}:${source.id}`, () => transaction(async (client) => {
    const existing = await client.query(
      "SELECT id FROM wishes WHERE user_id=$1 AND source_wish_id=$2 LIMIT 1",
      [req.user.id, source.id],
    );
    if (existing.rowCount) return existing.rows[0].id;
    const copyId = randomUUID();
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,fundraising_url,vehicle_make,vehicle_model,price,currency,priority,privacy,allow_multiple,event_date,space,source_wish_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'inherit',FALSE,$13,$14,$15)`,
      [copyId, req.user.id, source.title, source.description, source.url, source.image_url, source.fundraising_url, source.vehicle_make, source.vehicle_model, source.price, source.currency, source.priority, source.event_date, source.space, source.id],
    );
    await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [target.rows[0].id, copyId]);
    return copyId;
  }));
  const wishes = await getWishes(req.user.id, req.user.id, true);
  res.status(201).json({ wish: wishes.find((wish) => wish.id === id) });
}));

app.post("/api/metadata", requireAuth, metadataRateLimit, asyncRoute(async (req, res) => {
  const parsed = z.object({ url: z.string().url().max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Нужна корректная ссылка" });
  const metadataUrl = new URL(parsed.data.url);
  metadataUrl.hash = "";
  const kinopoiskUrlError = kinopoiskContentUrlError(metadataUrl);
  if (kinopoiskUrlError) {
    return res.status(422).json({
      error: kinopoiskUrlError,
      code: "kinopoisk_content_url_required",
    });
  }
  const cacheUrl = canonicalRetailerProductUrl(metadataUrl) || metadataUrl;
  const cacheKey = cacheUrl.href;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);
  if (cached) metadataCache.delete(cacheKey);

  try {
    let value;
    if (isYouTubeUrl(metadataUrl)) {
      // YouTube watch pages are heavy and often hide og:image; the oEmbed
      // endpoint is the reliable source. On any failure we still return the
      // deterministic thumbnail so the wish preview always gets an image.
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(metadataUrl.href)}&format=json`;
        const { json } = await fetchPublicJson(oembedUrl);
        value = parseYouTubeMetadata(json, metadataUrl);
      } catch {
        value = {
          title: "",
          description: "",
          imageUrl: youtubeThumbnailUrl(parseYouTubeVideoId(metadataUrl)),
          price: null,
          currency: "",
          kind: "video",
        };
      }
    } else if (isVkVideoUrl(metadataUrl)) {
      // VK exposes public video metadata through video.getOembed. Unlike the
      // regular watch page, this endpoint does not loop through auth redirects
      // and returns a stable title and thumbnail without an access token.
      value = await resolveVkVideoMetadata(metadataUrl);
    } else if (isBookmateUrl(metadataUrl)) {
      // Bookmate pages and their social-preview images are protected by a
      // browser challenge. Its public metadata API returns the original cover
      // directly and also resolves legacy Bookmate ids.
      const apiUrl = bookmateApiUrl(metadataUrl);
      const { json, url } = await fetchPublicJson(apiUrl);
      value = parseBookmateMetadata(json, url);
    } else if (isKinopoiskUrl(metadataUrl)) {
      // Film pages redirect anonymous server requests through Yandex SSO. The
      // public Kinopoisk poster CDN is deterministic by content id, so it is a
      // faster and more reliable preview source than scraping the page shell.
      value = parseKinopoiskMetadata(metadataUrl);
    } else {
      const retailerMetadata = await resolveRetailerMetadata(metadataUrl);
      if (retailerMetadata !== null) {
        // Grocery retailers vary between structured product pages, generic app
        // shells and bot challenges. Their adapter validates product data and
        // always supplies a safe local preview if the remote image is unavailable.
        value = retailerMetadata;
      } else {
        const { html, url } = await fetchPublicHtml(metadataUrl);
        value = isYandexMapsUrl(url)
          ? parseYandexMapsMetadata(html, url)
          : parseProductMetadata(html, url);
      }
    }
    // A branded fallback means the retailer temporarily served a challenge or
    // an incomplete app shell. Do not cache that transient result: a retry may
    // receive the public product JSON-LD with its real image and price.
    if (value.previewFallback !== true) {
      if (metadataCache.size >= metadataCacheLimit) metadataCache.delete(metadataCache.keys().next().value);
      metadataCache.set(cacheKey, { value, expiresAt: Date.now() + metadataCacheTtlMs });
    }
    res.json(value);
  } catch (error) {
    if (error instanceof MetadataFetchError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));

app.get("/api/profile/:username", asyncRoute(async (req, res) => {
  const found = await query("SELECT * FROM users WHERE username=$1", [req.params.username.toLowerCase()]);
  if (!found.rowCount) return res.status(404).json({ error: "Профиль не найден" });
  const owner = found.rows[0];
  const isOwner = req.user?.id === owner.id;
  const follows = req.user ? await query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, owner.id]) : { rowCount: 0 };
  const follower = Boolean(follows.rowCount);
  const allLists = await getLists(owner.id);
  const lists = allLists.filter((list) => isOwner || list.privacy === "public" || (list.privacy === "followers" && follower));
  const allowedIds = new Set(lists.map((list) => list.id));
  const wishes = (await getWishes(owner.id, req.user?.id, isOwner))
    .filter((wish) => isOwner || wish.status === "active")
    .filter((wish) => wish.listIds.length === 0 || wish.listIds.some((id) => allowedIds.has(id)))
    .map((wish) => isOwner ? wish : { ...wish, listIds: wish.listIds.filter((id) => allowedIds.has(id)) });
  const stats = await Promise.all([
    query("SELECT COUNT(*) AS count FROM follows WHERE following_id=$1", [owner.id]),
    query("SELECT COUNT(*) AS count FROM follows WHERE follower_id=$1", [owner.id]),
  ]);
  const visibleLists = isOwner ? lists : lists.map(({ shareToken: _shareToken, ...list }) => ({
    ...list,
    wishCount: wishes.filter((wish) => wish.status === "active" && wish.listIds.includes(list.id)).length,
  }));
  res.json({
    profile: { ...cleanUser(owner), email: undefined }, lists: visibleLists, wishes,
    isOwner, isFollowing: follower,
    followersCount: Number(stats[0].rows[0].count), followingCount: Number(stats[1].rows[0].count),
  });
}));

app.get("/api/shared/:token", asyncRoute(async (req, res) => {
  const found = await query(
    `SELECT l.*,u.username,u.name,u.bio,u.avatar_url,u.birthday FROM wishlists l JOIN users u ON u.id=l.user_id WHERE l.share_token=$1`,
    [req.params.token],
  );
  if (!found.rowCount) return res.status(404).json({ error: "Список не найден" });
  const row = found.rows[0];
  const isOwner = req.user?.id === row.user_id;
  let canView = isOwner || row.privacy === "public" || row.privacy === "link";
  if (!canView && row.privacy === "followers" && req.user) {
    const follows = await query(
      "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",
      [req.user.id, row.user_id],
    );
    canView = Boolean(follows.rowCount);
  }
  if (!canView) return res.status(404).json({ error: "Список не найден" });
  const list = mapList({ ...row, wish_count: 0 });
  const follows = req.user && !isOwner
    ? await query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, row.user_id])
    : { rowCount: 0 };
  const wishes = (await getWishes(row.user_id, req.user?.id, isOwner))
    .filter((wish) => wish.listIds.includes(row.id))
    .filter((wish) => isOwner || wish.status === "active")
    .map((wish) => ({ ...wish, listIds: isOwner ? wish.listIds : [row.id], shareToken: req.params.token }));
  res.json({ profile: { id: row.user_id, username: row.username, name: row.name, bio: row.bio, avatarUrl: row.avatar_url, birthday: row.birthday }, list, wishes, isOwner, isFollowing: Boolean(follows.rowCount) });
}));

app.post("/api/profile/:username/follow", requireAuth, asyncRoute(async (req, res) => {
  const found = await query("SELECT id,name,username FROM users WHERE username=$1", [req.params.username.toLowerCase()]);
  if (!found.rowCount) return res.status(404).json({ error: "Профиль не найден" });
  const target = found.rows[0];
  if (target.id === req.user.id) return res.status(400).json({ error: "На себя уже можно положиться" });
  const following = await withMutationLock(`actor:${req.user.id}`, () => transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
    const existing = await client.query(
      "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 FOR UPDATE",
      [req.user.id, target.id],
    );
    if (existing.rowCount) {
      await client.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, target.id]);
      await client.query(
        `DELETE FROM reservations
         WHERE user_id=$1 AND wish_id IN (SELECT id FROM wishes WHERE user_id=$2)`,
        [req.user.id, target.id],
      );
      return false;
    }
    await client.query("INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)", [req.user.id, target.id]);
    return true;
  }));
  res.json({ following });
}));

app.post("/api/wishes/:id/reserve", requireAuth, asyncRoute(async (req, res) => {
  const shareToken = typeof req.body?.shareToken === "string" ? req.body.shareToken : "";
  const note = z.string().trim().max(300).catch("").parse(req.body?.note || "");
  let outcome;
  try {
    outcome = await withMutationLock(`wish:${req.params.id}`, () => withMutationLock(`actor:${req.user.id}`, () => transaction(async (client) => {
      const found = await client.query("SELECT * FROM wishes WHERE id=$1 AND status='active' FOR UPDATE", [req.params.id]);
      if (!found.rowCount) return { status: 404, error: "Желание не найдено" };
      const wish = found.rows[0];
      if (wish.user_id === req.user.id) return { status: 400, error: "Своё желание бронировать не нужно" };
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
      if (!(await canViewWish(wish, req.user.id, shareToken, client))) return { status: 404, error: "Желание не найдено" };

      const existing = await client.query("SELECT * FROM reservations WHERE wish_id=$1 AND user_id=$2", [wish.id, req.user.id]);
      if (existing.rowCount) {
        await client.query("DELETE FROM reservations WHERE id=$1", [existing.rows[0].id]);
        return { status: 200, reserved: false };
      }

      const following = await client.query(
        "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 FOR UPDATE",
        [req.user.id, wish.user_id],
      );
      if (!following.rowCount) return { status: 403, error: "Сначала подпишитесь на автора желания" };

      if (!wish.allow_multiple) {
        const occupied = await client.query("SELECT 1 FROM reservations WHERE wish_id=$1 AND status IN ('reserved','multiple')", [wish.id]);
        if (occupied.rowCount) return { status: 409, error: "Это желание уже забронировал кто-то другой" };
      }
      const reservationId = randomUUID();
      await client.query(
        "INSERT INTO reservations (id,wish_id,user_id,note,status) VALUES ($1,$2,$3,$4,$5)",
        [reservationId, wish.id, req.user.id, note, wish.allow_multiple ? "multiple" : "reserved"],
      );
      return { status: 201, reserved: true };
    })));
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Это желание уже забронировал кто-то другой" });
    throw error;
  }
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(outcome.status).json({ reserved: outcome.reserved });
}));

async function contactOverrides(userId, contactId = "") {
  const params = contactId ? [userId, contactId] : [userId];
  const result = await query(
    `SELECT contact_id AS "contactId",name,company,role,category,status,
            links_json AS "linksJson",notes,updated_at AS "updatedAt"
     FROM contact_overrides
     WHERE user_id=$1${contactId ? " AND contact_id=$2" : ""}
     ORDER BY updated_at DESC,contact_id`,
    params,
  );
  return result.rows;
}

async function contactFavoriteIds(userId, contactId = "") {
  const params = contactId ? [userId, contactId] : [userId];
  const result = await query(
    `SELECT contact_id AS "contactId"
     FROM contact_favorites
     WHERE user_id=$1${contactId ? " AND contact_id=$2" : ""}
     ORDER BY created_at DESC`,
    params,
  );
  return result.rows.map((row) => row.contactId);
}

async function contactForUser(userId, contactId) {
  const [[override], favoriteIds] = await Promise.all([
    contactOverrides(userId, contactId),
    contactFavoriteIds(userId, contactId),
  ]);
  const source = findContact(contactId);
  const contact = source ? mergeContactOverride(source, override) : contactFromOverride(override);
  if (!contact) return null;
  return { ...contact, favorite: favoriteIds.includes(contactId) };
}

const educationItemTables = {
  courses: "education_courses",
  conferences: "education_conferences",
  coaching: "education_coaching_sessions",
  workouts: "health_workouts",
};

const educationGroupedSections = {
  conferences: {
    section: "conferences",
    apiBase: "/api/education/conferences",
    table: "education_conferences",
    itemLabel: "Конференция",
    listError: "Список конференций не найден",
  },
  coaching: {
    section: "coaching",
    apiBase: "/api/education/coaching-sessions",
    table: "education_coaching_sessions",
    itemLabel: "Коучинг-сессия",
    listError: "Список коучинг-сессий не найден",
  },
};

async function educationListsForUser(userId, section) {
  const result = await query(
    `SELECT id,section,title,description,sort_order,created_at,updated_at
     FROM education_lists
     WHERE user_id=$1 AND section=$2
     ORDER BY sort_order,created_at,id`,
    [userId, section],
  );
  return result.rows.map(mapEducationList);
}

async function educationListBelongsToUser(listId, userId, section) {
  if (!listId) return true;
  const result = await query(
    "SELECT 1 FROM education_lists WHERE id=$1 AND user_id=$2 AND section=$3",
    [listId, userId, section],
  );
  return result.rowCount > 0;
}

async function educationCourseGroupsForUser(userId) {
  const result = await query(
    `SELECT g.id,g.list_id,g.title,g.created_at,g.updated_at,m.course_id
     FROM education_course_groups g
     LEFT JOIN education_course_group_members m ON m.group_id=g.id
     WHERE g.user_id=$1
     ORDER BY g.created_at,g.id,m.sort_order,m.course_id`,
    [userId],
  );
  return mapEducationCourseGroups(result.rows);
}

async function educationItemGroupsForUser(userId, section) {
  const result = await query(
    `SELECT g.id,g.list_id,g.title,g.created_at,g.updated_at,m.item_id
     FROM education_item_groups g
     LEFT JOIN education_item_group_members m ON m.group_id=g.id AND m.section=g.section
     WHERE g.user_id=$1 AND g.section=$2
     ORDER BY g.created_at,g.id,m.sort_order,m.item_id`,
    [userId, section],
  );
  return mapEducationItemGroups(result.rows);
}

async function detachEducationItemFromGroup(client, section, itemId, userId) {
  const membership = await client.query(
    `SELECT g.id
     FROM education_item_group_members m
     JOIN education_item_groups g ON g.id=m.group_id AND g.section=m.section
     WHERE m.section=$1 AND m.item_id=$2 AND g.user_id=$3
     FOR UPDATE OF g`,
    [section, itemId, userId],
  );
  if (!membership.rowCount) return null;
  const groupId = membership.rows[0].id;
  await client.query(
    "DELETE FROM education_item_group_members WHERE group_id=$1 AND section=$2 AND item_id=$3",
    [groupId, section, itemId],
  );
  const remaining = await client.query(
    "SELECT item_id FROM education_item_group_members WHERE group_id=$1 AND section=$2 ORDER BY sort_order,item_id",
    [groupId, section],
  );
  const dissolved = remaining.rowCount < 2;
  if (dissolved) await client.query("DELETE FROM education_item_groups WHERE id=$1", [groupId]);
  return { groupId, dissolved, itemIds: dissolved ? [] : remaining.rows.map((row) => row.item_id) };
}

async function detachCourseFromEducationGroup(client, courseId, userId) {
  const membership = await client.query(
    `SELECT g.id
     FROM education_course_group_members m
     JOIN education_course_groups g ON g.id=m.group_id
     WHERE m.course_id=$1 AND g.user_id=$2
     FOR UPDATE OF g`,
    [courseId, userId],
  );
  if (!membership.rowCount) return null;
  const groupId = membership.rows[0].id;
  await client.query(
    "DELETE FROM education_course_group_members WHERE group_id=$1 AND course_id=$2",
    [groupId, courseId],
  );
  const remaining = await client.query(
    "SELECT course_id FROM education_course_group_members WHERE group_id=$1 ORDER BY sort_order,course_id",
    [groupId],
  );
  const dissolved = remaining.rowCount < 2;
  if (dissolved) await client.query("DELETE FROM education_course_groups WHERE id=$1", [groupId]);
  return { groupId, dissolved, courseIds: dissolved ? [] : remaining.rows.map((row) => row.course_id) };
}

function labUploadFilename(req) {
  return pdfUploadFilename(req, "Анализы");
}

function pdfUploadFilename(req, fallback = "Отчёт") {
  const encoded = String(req.get("X-File-Name") || "").slice(0, 1_000);
  let decoded = encoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    decoded = "";
  }
  const basename = decoded.replaceAll("\\", "/").split("/").pop() || `${fallback}.pdf`;
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 240);
  return cleaned.toLocaleLowerCase("ru-RU").endsWith(".pdf") ? cleaned : `${cleaned || fallback}.pdf`;
}

function parseStoredJson(value, fallback = null) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

async function identityReportPayload(userId, section, client = null) {
  const execute = client ? client.query.bind(client) : query;
  const [stateResult, filesResult] = await Promise.all([
    execute(
      "SELECT status,report_json,updated_at FROM identity_generated_reports WHERE user_id=$1 AND section=$2",
      [userId, section],
    ),
    execute(
      `SELECT id,filename,size_bytes,created_at
       FROM identity_report_uploads
       WHERE user_id=$1 AND section=$2
       ORDER BY created_at,id`,
      [userId, section],
    ),
  ]);
  const files = filesResult.rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    sizeBytes: Number(row.size_bytes),
    uploadedAt: row.created_at,
    pdfUrl: `/api/identity/reports/${section}/files/${row.id}/pdf`,
  }));
  if (!stateResult.rowCount) return { mode: "default", report: null, files, updatedAt: null };
  const state = stateResult.rows[0];
  if (state.status === "empty") return { mode: "empty", report: null, files: [], updatedAt: state.updated_at };
  const report = identityReportForDisplay(section, parseStoredJson(state.report_json));
  if (!report) throw new Error("Сохранённый отчёт повреждён");
  return { mode: "generated", report, files, updatedAt: state.updated_at };
}

function mapUploadedLabReport(row) {
  const report = typeof row.report_json === "string" ? JSON.parse(row.report_json) : row.report_json;
  return {
    ...report,
    source: {
      uploaded: true,
      filename: row.filename,
      uploadedAt: row.created_at,
      pdfUrl: `/api/health/lab-results/uploads/${row.id}/pdf`,
    },
  };
}

async function uploadedLabReports(userId) {
  const result = await query(
    `SELECT id,filename,report_json,created_at
     FROM lab_report_uploads
     WHERE user_id=$1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(mapUploadedLabReport);
}

app.get("/api/contacts", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const [overrides, favoriteIds] = await Promise.all([
    contactOverrides(req.user.id),
    contactFavoriteIds(req.user.id),
  ]);
  res.set("Cache-Control", "private, no-store");
  res.json(listContacts({
    search: String(req.query.search || "").slice(0, 80),
    company: String(req.query.company || "").slice(0, 120),
    category: String(req.query.category || "").slice(0, 80),
    favoriteOnly: req.query.favorite === "true",
    page: req.query.page,
    pageSize: req.query.pageSize,
  }, overrides, favoriteIds));
}));

app.post("/api/contacts", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = contactUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Не удалось добавить контакт: проверьте заполнение полей и адреса ссылок" });
  const data = parsed.data;
  const contactId = randomUUID();
  const result = await query(
    `INSERT INTO contact_overrides (
       user_id,contact_id,name,company,role,category,status,links_json,notes,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)
     RETURNING contact_id AS "contactId",name,company,role,category,status,
               links_json AS "linksJson",notes,updated_at AS "updatedAt"`,
    [req.user.id, contactId, data.name, data.company, data.role, data.category, data.status, JSON.stringify(data.links), data.notes],
  );
  const contact = { ...contactFromOverride(result.rows[0]), favorite: false };
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json({ contact: { ...contact, avatarUrl: contactAvatarPath(contact) } });
}));

app.get("/api/career/content/:section", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const section = careerSectionSchema.safeParse(req.params.section);
  if (!section.success) return res.status(404).json({ error: "Раздел карьеры не найден" });
  const result = await query(
    "SELECT content_json,updated_at FROM career_content WHERE user_id=$1 AND section=$2",
    [req.user.id, section.data],
  );
  res.set("Cache-Control", "private, no-store");
  if (!result.rowCount) return res.json({ content: null, updatedAt: null });
  let content;
  try {
    content = JSON.parse(result.rows[0].content_json);
  } catch {
    return res.status(500).json({ error: "Сохранённое содержимое раздела повреждено" });
  }
  return res.json({ content, updatedAt: result.rows[0].updated_at });
}));

app.get("/api/identity/content/:section", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const section = identitySectionSchema.safeParse(req.params.section);
  if (!section.success) return res.status(404).json({ error: "Раздел идентичности не найден" });
  const result = await query(
    "SELECT content_json,updated_at FROM identity_content WHERE user_id=$1 AND section=$2",
    [req.user.id, section.data],
  );
  res.set("Cache-Control", "private, no-store");
  if (!result.rowCount) return res.json({ content: null, updatedAt: null });
  let content;
  try {
    content = JSON.parse(result.rows[0].content_json);
  } catch {
    return res.status(500).json({ error: "Сохранённое содержимое раздела повреждено" });
  }
  if (section.data === "four-questions") {
    const parsed = identityFourQuestionsSchema.safeParse(content);
    if (parsed.success) content = parsed.data;
  }
  return res.json({ content, updatedAt: result.rows[0].updated_at });
}));

app.patch("/api/identity/content/:section", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const section = identitySectionSchema.safeParse(req.params.section);
  if (!section.success) return res.status(404).json({ error: "Раздел идентичности не найден" });
  const parsed = identityContentSchemas[section.data].safeParse(req.body?.content);
  if (!parsed.success) {
    return res.status(400).json({
      error: section.data === "four-questions"
        ? "Заполните ответ для каждого из четырёх вопросов"
        : section.data === "values"
          ? "Проверьте выбранные и добавленные ценности"
        : "Содержимое раздела слишком большое",
      code: "IDENTITY_CONTENT_VALIDATION_ERROR",
    });
  }
  const contentJson = JSON.stringify(parsed.data);
  if (Buffer.byteLength(contentJson, "utf8") > 230_000) {
    return res.status(413).json({ error: "Содержимое раздела слишком большое", code: "IDENTITY_CONTENT_TOO_LARGE" });
  }
  const result = await query(
    `INSERT INTO identity_content (user_id,section,content_json,updated_at)
     VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
     ON CONFLICT (user_id,section) DO UPDATE SET
       content_json=EXCLUDED.content_json,
       updated_at=CURRENT_TIMESTAMP
     RETURNING content_json,updated_at`,
    [req.user.id, section.data, contentJson],
  );
  res.set("Cache-Control", "private, no-store");
  return res.json({ content: JSON.parse(result.rows[0].content_json), updatedAt: result.rows[0].updated_at });
}));

app.get("/api/identity/reports/:section", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const section = identityReportSectionSchema.safeParse(req.params.section);
  if (!section.success) return res.status(404).json({ error: "Отчёт не найден" });
  const payload = await identityReportPayload(req.user.id, section.data);
  res.set("Cache-Control", "private, no-store");
  return res.json(payload);
}));

app.post(
  "/api/identity/reports/:section/files",
  requireAuth,
  requirePrivateSphereOwner,
  labPdfUploadRateLimit,
  labPdfUploadBody,
  asyncRoute(async (req, res) => {
    const section = identityReportSectionSchema.safeParse(req.params.section);
    if (!section.success) return res.status(404).json({ error: "Отчёт не найден" });
    const declaredType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!["application/pdf", "application/octet-stream"].includes(declaredType) || !isPdfBuffer(req.body)) {
      return res.status(400).json({ error: "Загрузите корректный PDF-файл" });
    }

    const id = randomUUID();
    const filename = pdfUploadFilename(req, section.data === "hogan" ? "Hogan" : "Gallup");
    let document;
    try {
      document = await parseIdentityPdf(req.body, {
        section: section.data,
        id,
        filename,
        uploadedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof LabPdfError) return res.status(422).json({ error: error.message, code: error.code });
      return res.status(422).json({ error: error.message || "Не удалось извлечь содержимое PDF", code: "IDENTITY_PDF_PARSE_ERROR" });
    }

    const fileHash = createHash("sha256").update(req.body).digest("hex");
    try {
      await transaction(async (client) => {
        const count = await client.query(
          "SELECT COUNT(*)::int AS count FROM identity_report_uploads WHERE user_id=$1 AND section=$2",
          [req.user.id, section.data],
        );
        if (Number(count.rows[0].count) >= 8) {
          const limitError = new Error("Для одного отчёта можно загрузить не больше 8 PDF");
          limitError.code = "IDENTITY_PDF_LIMIT";
          throw limitError;
        }
        await client.query(
          `INSERT INTO identity_report_uploads (
             id,user_id,section,filename,mime_type,pdf_data,size_bytes,file_hash,document_json
           ) VALUES ($1,$2,$3,$4,'application/pdf',$5,$6,$7,$8)`,
          [id, req.user.id, section.data, filename, req.body, req.body.length, fileHash, JSON.stringify(document)],
        );
        const documentsResult = await client.query(
          `SELECT document_json FROM identity_report_uploads
           WHERE user_id=$1 AND section=$2 ORDER BY created_at,id`,
          [req.user.id, section.data],
        );
        const documents = documentsResult.rows
          .map((row) => parseStoredJson(row.document_json))
          .filter(Boolean);
        const report = generateIdentityReport(section.data, documents);
        const reportJson = JSON.stringify(report);
        if (Buffer.byteLength(reportJson, "utf8") > 2_000_000) {
          const sizeError = new Error("В загруженных PDF слишком много текста для одной страницы");
          sizeError.code = "IDENTITY_REPORT_TOO_LARGE";
          throw sizeError;
        }
        await client.query(
          `INSERT INTO identity_generated_reports (user_id,section,status,report_json,updated_at)
           VALUES ($1,$2,'generated',$3,CURRENT_TIMESTAMP)
           ON CONFLICT (user_id,section) DO UPDATE SET
             status='generated',report_json=EXCLUDED.report_json,updated_at=CURRENT_TIMESTAMP`,
          [req.user.id, section.data, reportJson],
        );
      });
    } catch (error) {
      if (error?.code === "23505") return res.status(409).json({ error: "Этот PDF уже загружен" });
      if (["IDENTITY_PDF_LIMIT", "IDENTITY_REPORT_TOO_LARGE"].includes(error?.code)) {
        return res.status(413).json({ error: error.message, code: error.code });
      }
      throw error;
    }

    const payload = await identityReportPayload(req.user.id, section.data);
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(payload);
  }),
);

app.delete("/api/identity/reports/:section", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const section = identityReportSectionSchema.safeParse(req.params.section);
  if (!section.success) return res.status(404).json({ error: "Отчёт не найден" });
  await transaction(async (client) => {
    await client.query(
      "DELETE FROM identity_report_uploads WHERE user_id=$1 AND section=$2",
      [req.user.id, section.data],
    );
    await client.query(
      `INSERT INTO identity_generated_reports (user_id,section,status,report_json,updated_at)
       VALUES ($1,$2,'empty','{}',CURRENT_TIMESTAMP)
       ON CONFLICT (user_id,section) DO UPDATE SET
         status='empty',report_json='{}',updated_at=CURRENT_TIMESTAMP`,
      [req.user.id, section.data],
    );
  });
  res.set("Cache-Control", "private, no-store");
  return res.json({ mode: "empty", report: null, files: [] });
}));

app.get("/api/identity/reports/:section/files/:id/pdf", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const section = identityReportSectionSchema.safeParse(req.params.section);
  if (!section.success) return res.status(404).end();
  const result = await query(
    `SELECT filename,mime_type,pdf_data,size_bytes FROM identity_report_uploads
     WHERE id=$1 AND user_id=$2 AND section=$3`,
    [req.params.id, req.user.id, section.data],
  );
  if (!result.rowCount) return res.status(404).end();
  const file = result.rows[0];
  const encodedFilename = encodeURIComponent(file.filename).replaceAll("'", "%27");
  res.set({
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodedFilename}`,
    "Content-Length": String(file.size_bytes),
    "X-Content-Type-Options": "nosniff",
  });
  return res.type(file.mime_type).send(file.pdf_data);
}));

app.post(
  "/api/career/performance/import-pdf",
  requireAuth,
  requirePrivateSphereOwner,
  labPdfUploadRateLimit,
  labPdfUploadBody,
  asyncRoute(async (req, res) => {
    const declaredType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!["application/pdf", "application/octet-stream"].includes(declaredType) || !isPdfBuffer(req.body)) {
      return res.status(400).json({ error: "Загрузите корректный PDF-файл" });
    }
    const filename = pdfUploadFilename(req, "Перфоманс-ревью");
    let imported;
    try {
      imported = await parsePerformanceReviewPdf(req.body, {
        id: `performance-${randomUUID()}`,
        filename,
        uploadedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof LabPdfError) return res.status(422).json({ error: error.message, code: error.code });
      return res.status(422).json({
        error: "Не удалось извлечь содержимое PDF",
        code: "PERFORMANCE_PDF_PARSE_ERROR",
      });
    }
    const parsedCycle = careerPerformanceCycleSchema.safeParse(imported.cycle);
    if (!parsedCycle.success) {
      return res.status(422).json({
        error: "Структура PDF слишком сложная для импорта. Попробуйте файл с текстовым слоем и одним циклом ревью.",
        code: "PERFORMANCE_PDF_STRUCTURE_ERROR",
      });
    }
    if (Buffer.byteLength(JSON.stringify(parsedCycle.data), "utf8") > 210_000) {
      return res.status(413).json({
        error: "В PDF слишком много текста для одного цикла ревью",
        code: "PERFORMANCE_PDF_TOO_MUCH_TEXT",
      });
    }
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json({
      cycle: parsedCycle.data,
      filename,
      warnings: imported.warnings,
    });
  }),
);

app.patch("/api/career/content/:section", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const section = careerSectionSchema.safeParse(req.params.section);
  if (!section.success) return res.status(404).json({ error: "Раздел карьеры не найден" });
  const parsed = careerContentSchemas[section.data].safeParse(req.body?.content);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Не удалось сохранить: проверьте заполнение полей раздела",
      code: "CAREER_CONTENT_VALIDATION_ERROR",
    });
  }
  const contentJson = JSON.stringify(parsed.data);
  if (Buffer.byteLength(contentJson, "utf8") > 230_000) {
    return res.status(413).json({ error: "Содержимое раздела слишком большое", code: "CAREER_CONTENT_TOO_LARGE" });
  }
  const result = await query(
    `INSERT INTO career_content (user_id,section,content_json,updated_at)
     VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
     ON CONFLICT (user_id,section) DO UPDATE SET
       content_json=EXCLUDED.content_json,
       updated_at=CURRENT_TIMESTAMP
     RETURNING content_json,updated_at`,
    [req.user.id, section.data, contentJson],
  );
  res.set("Cache-Control", "private, no-store");
  return res.json({ content: JSON.parse(result.rows[0].content_json), updatedAt: result.rows[0].updated_at });
}));

app.post("/api/education/lists", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = educationListCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Укажите название и раздел списка" });
  const data = parsed.data;
  const result = await withMutationLock(`education-lists:${req.user.id}:${data.section}`, () => query(
    `INSERT INTO education_lists (id,user_id,section,title,description,sort_order)
     SELECT $1,$2,$3,$4,$5,COALESCE(MAX(sort_order),-1)+1
     FROM education_lists
     WHERE user_id=$2 AND section=$3
     RETURNING id,section,title,description,sort_order,created_at,updated_at`,
    [randomUUID(), req.user.id, data.section, data.title, data.description],
  ));
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json({ list: mapEducationList(result.rows[0]) });
}));

app.patch("/api/education/lists/:listId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = educationListPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте название и описание списка" });
  const result = await query(
    `UPDATE education_lists
     SET title=$1,description=$2,updated_at=CURRENT_TIMESTAMP
     WHERE id=$3 AND user_id=$4
     RETURNING id,section,title,description,sort_order,created_at,updated_at`,
    [parsed.data.title, parsed.data.description, req.params.listId, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Список не найден" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ list: mapEducationList(result.rows[0]) });
}));

app.delete("/api/education/lists/:listId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`education-list:${req.params.listId}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id,section FROM education_lists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.listId, req.user.id],
    );
    if (!owned.rowCount) return { error: "Список не найден", status: 404 };
    const table = educationItemTables[owned.rows[0].section];
    const linked = await client.query(
      `SELECT COUNT(*) AS count FROM ${table} WHERE list_id=$1 AND user_id=$2`,
      [req.params.listId, req.user.id],
    );
    await client.query("DELETE FROM education_lists WHERE id=$1", [req.params.listId]);
    return { unlistedCount: Number(linked.rows[0].count) || 0 };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.set("Cache-Control", "private, no-store");
  return res.json({ ok: true, unlistedCount: outcome.unlistedCount });
}));

app.get("/api/education/courses", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const [result, lists, groups] = await Promise.all([query(
    `SELECT id,title,provider,status,logo_url,url,description,started_on,completed_on,list_id,sort_order,created_at,updated_at
     FROM education_courses
     WHERE user_id=$1
     ORDER BY sort_order,
              CASE status WHEN 'in_progress' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,
              COALESCE(completed_on,started_on) DESC NULLS LAST,
              updated_at DESC`,
    [req.user.id],
  ), educationListsForUser(req.user.id, "courses"), educationCourseGroupsForUser(req.user.id)]);
  res.set("Cache-Control", "private, no-store");
  return res.json({ courses: result.rows.map(mapEducationCourse), lists, groups });
}));

app.post("/api/education/courses/groups", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = courseGroupCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Выберите два разных курса" });
  const listId = parsed.data.listId || null;
  if (!(await educationListBelongsToUser(listId, req.user.id, "courses"))) {
    return res.status(400).json({ error: "Список курсов не найден", code: "COURSE_LIST_NOT_FOUND" });
  }
  const outcome = await withMutationLock(`education-course-groups:${req.user.id}`, () => transaction(async (client) => {
    const courses = await client.query(
      `SELECT id FROM education_courses
       WHERE user_id=$1 AND list_id IS NOT DISTINCT FROM $2 AND id IN ($3,$4)
       ORDER BY id FOR UPDATE`,
      [req.user.id, listId, ...parsed.data.courseIds],
    );
    if (courses.rowCount !== 2) return { status: 404, error: "Один из курсов не найден в этом списке" };
    const occupied = await client.query(
      "SELECT course_id FROM education_course_group_members WHERE course_id IN ($1,$2)",
      parsed.data.courseIds,
    );
    if (occupied.rowCount) return { status: 409, error: "Один из курсов уже находится в группе" };
    const group = {
      id: randomUUID(),
      listId,
      title: "Группа",
      courseIds: parsed.data.courseIds,
    };
    const created = await client.query(
      `INSERT INTO education_course_groups (id,user_id,list_id,title)
       VALUES ($1,$2,$3,$4)
       RETURNING created_at,updated_at`,
      [group.id, req.user.id, group.listId, group.title],
    );
    await client.query(
      `INSERT INTO education_course_group_members (group_id,course_id,sort_order)
       VALUES ($1,$2,0),($1,$3,1)`,
      [group.id, ...group.courseIds],
    );
    return {
      group: {
        ...group,
        createdAt: created.rows[0].created_at,
        updatedAt: created.rows[0].updated_at,
      },
    };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json(outcome);
}));

app.post("/api/education/courses/groups/:groupId/courses", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = courseGroupAddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Курс не выбран" });
  const outcome = await withMutationLock(`education-course-groups:${req.user.id}`, () => transaction(async (client) => {
    const group = await client.query(
      "SELECT id,list_id,title,created_at,updated_at FROM education_course_groups WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.groupId, req.user.id],
    );
    if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
    const course = await client.query(
      "SELECT id FROM education_courses WHERE id=$1 AND user_id=$2 AND list_id IS NOT DISTINCT FROM $3 FOR UPDATE",
      [parsed.data.courseId, req.user.id, group.rows[0].list_id],
    );
    if (!course.rowCount) return { status: 404, error: "Курс не найден в списке группы" };
    const inserted = await client.query(
      `INSERT INTO education_course_group_members (group_id,course_id,sort_order)
       SELECT $1,$2,COALESCE(MAX(sort_order),-1)+1
       FROM education_course_group_members WHERE group_id=$1
       ON CONFLICT (course_id) DO NOTHING
       RETURNING course_id`,
      [req.params.groupId, parsed.data.courseId],
    );
    if (!inserted.rowCount) return { status: 409, error: "Курс уже находится в группе" };
    const members = await client.query(
      "SELECT course_id FROM education_course_group_members WHERE group_id=$1 ORDER BY sort_order,course_id",
      [req.params.groupId],
    );
    const row = group.rows[0];
    return { group: { id: row.id, listId: row.list_id || null, title: row.title, courseIds: members.rows.map((member) => member.course_id), createdAt: row.created_at, updatedAt: row.updated_at } };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json(outcome);
}));

app.delete("/api/education/courses/groups/:groupId/courses/:courseId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`education-course-groups:${req.user.id}`, () => transaction(async (client) => {
    const group = await client.query(
      "SELECT id FROM education_course_groups WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.groupId, req.user.id],
    );
    if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
    const removed = await client.query(
      "DELETE FROM education_course_group_members WHERE group_id=$1 AND course_id=$2 RETURNING course_id",
      [req.params.groupId, req.params.courseId],
    );
    if (!removed.rowCount) return { status: 404, error: "Курс не найден в группе" };
    const remaining = await client.query(
      "SELECT course_id FROM education_course_group_members WHERE group_id=$1 ORDER BY sort_order,course_id",
      [req.params.groupId],
    );
    const dissolved = remaining.rowCount < 2;
    if (dissolved) await client.query("DELETE FROM education_course_groups WHERE id=$1", [req.params.groupId]);
    return { groupId: req.params.groupId, courseId: req.params.courseId, dissolved, courseIds: dissolved ? [] : remaining.rows.map((row) => row.course_id) };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.set("Cache-Control", "private, no-store");
  return res.json(outcome);
}));

app.patch("/api/education/courses/groups/:groupId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = courseGroupPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте название группы" });
  const result = await query(
    `UPDATE education_course_groups SET title=$1,updated_at=CURRENT_TIMESTAMP
     WHERE id=$2 AND user_id=$3 RETURNING id,title,updated_at`,
    [parsed.data.title, req.params.groupId, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ group: { id: result.rows[0].id, title: result.rows[0].title, updatedAt: result.rows[0].updated_at } });
}));

app.patch("/api/education/courses/groups/:groupId/list", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = courseGroupMoveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Выберите список для группы" });
  const listId = parsed.data.listId || null;
  if (!(await educationListBelongsToUser(listId, req.user.id, "courses"))) {
    return res.status(400).json({ error: "Список курсов не найден", code: "COURSE_LIST_NOT_FOUND" });
  }
  const outcome = await withMutationLock(`education-course-groups:${req.user.id}`, () => transaction(async (client) => {
    const group = await client.query(
      "SELECT id,list_id,title,created_at FROM education_course_groups WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.groupId, req.user.id],
    );
    if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
    const members = await client.query(
      "SELECT course_id FROM education_course_group_members WHERE group_id=$1 ORDER BY sort_order,course_id",
      [req.params.groupId],
    );
    const maxOrder = await client.query(
      "SELECT COALESCE(MAX(sort_order),-1) AS value FROM education_courses WHERE user_id=$1 AND list_id IS NOT DISTINCT FROM $2",
      [req.user.id, listId],
    );
    const startOrder = Number(maxOrder.rows[0].value) + 1;
    for (const [index, member] of members.rows.entries()) {
      await client.query(
        "UPDATE education_courses SET list_id=$1,sort_order=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND user_id=$4",
        [listId, startOrder + index, member.course_id, req.user.id],
      );
    }
    const updated = await client.query(
      `UPDATE education_course_groups SET list_id=$1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 RETURNING updated_at`,
      [listId, req.params.groupId],
    );
    const row = group.rows[0];
    return { group: { id: row.id, listId, title: row.title, courseIds: members.rows.map((member) => member.course_id), createdAt: row.created_at, updatedAt: updated.rows[0].updated_at } };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.set("Cache-Control", "private, no-store");
  return res.json(outcome);
}));

app.delete("/api/education/courses/groups/:groupId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const result = await query(
    "DELETE FROM education_course_groups WHERE id=$1 AND user_id=$2 RETURNING id",
    [req.params.groupId, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ ok: true, groupId: result.rows[0].id });
}));

app.post("/api/education/courses", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = courseCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    const completedOnIssue = parsed.error.issues.find((issue) => issue.path[0] === "completedOn");
    return res.status(400).json({
      error: completedOnIssue?.message || "Проверьте название, ссылку и даты курса",
      code: "COURSE_VALIDATION_ERROR",
    });
  }
  const course = parsed.data;
  if (!(await educationListBelongsToUser(course.listId, req.user.id, "courses"))) {
    return res.status(400).json({ error: "Список курсов не найден", code: "COURSE_LIST_NOT_FOUND" });
  }
  const listId = course.listId || null;
  const result = await withMutationLock(`education-courses:${req.user.id}`, () => query(
    `INSERT INTO education_courses (
       id,user_id,title,provider,status,logo_url,url,description,started_on,completed_on,list_id,sort_order
     ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE(MAX(sort_order),-1)+1
       FROM education_courses WHERE user_id=$2 AND list_id IS NOT DISTINCT FROM $11
     RETURNING id,title,provider,status,logo_url,url,description,started_on,completed_on,list_id,sort_order,created_at,updated_at`,
    [
      randomUUID(), req.user.id, course.title, course.provider, course.status, course.logoUrl,
      course.url, course.description, course.startedOn || null, course.completedOn || null, listId,
    ],
  ));
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json({ course: mapEducationCourse(result.rows[0]) });
}));

app.patch("/api/education/courses/reorder", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = courseReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Не удалось изменить порядок курсов", code: "COURSE_REORDER_VALIDATION_ERROR" });
  }
  const courseIds = parsed.data.courseIds;
  const listId = parsed.data.listId || null;
  const outcome = await withMutationLock(`education-courses:${req.user.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id FROM education_courses WHERE user_id=$1 AND list_id IS NOT DISTINCT FROM $2 FOR UPDATE",
      [req.user.id, listId],
    );
    const ownedIds = new Set(owned.rows.map((row) => row.id));
    if (ownedIds.size !== courseIds.length || courseIds.some((id) => !ownedIds.has(id))) {
      return { error: "Список курсов изменился. Обновите страницу и попробуйте снова", status: 409 };
    }
    for (const [sortOrder, courseId] of courseIds.entries()) {
      await client.query(
        "UPDATE education_courses SET sort_order=$1 WHERE id=$2 AND user_id=$3",
        [sortOrder, courseId, req.user.id],
      );
    }
    return { courseIds };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, code: "COURSE_REORDER_CONFLICT" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ courseIds: outcome.courseIds });
}));

app.patch("/api/education/courses/:courseId/list", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = educationItemListMoveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Не удалось выбрать список для курса", code: "COURSE_LIST_VALIDATION_ERROR" });
  }
  const listId = parsed.data.listId || null;
  if (!(await educationListBelongsToUser(listId, req.user.id, "courses"))) {
    return res.status(400).json({ error: "Список курсов не найден", code: "COURSE_LIST_NOT_FOUND" });
  }
  const outcome = await withMutationLock(`education-courses:${req.user.id}`, () => transaction(async (client) => {
    const current = await client.query(
      "SELECT id,list_id FROM education_courses WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.courseId, req.user.id],
    );
    if (!current.rowCount) return { status: 404, error: "Курс не найден", code: "COURSE_NOT_FOUND" };
    const groupChange = current.rows[0].list_id === listId
      ? null
      : await detachCourseFromEducationGroup(client, req.params.courseId, req.user.id);
    const result = await client.query(
      `UPDATE education_courses item
       SET list_id=$1,
           sort_order=CASE WHEN item.list_id IS DISTINCT FROM $1 THEN (
             SELECT COALESCE(MAX(other.sort_order),-1)+1
             FROM education_courses other
             WHERE other.user_id=$3 AND other.list_id IS NOT DISTINCT FROM $1
           ) ELSE item.sort_order END,
           updated_at=CURRENT_TIMESTAMP
       WHERE item.id=$2 AND item.user_id=$3
       RETURNING id,title,provider,status,logo_url,url,description,started_on,completed_on,list_id,sort_order,created_at,updated_at`,
      [listId, req.params.courseId, req.user.id],
    );
    return { course: mapEducationCourse(result.rows[0]), groupChange };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
  res.set("Cache-Control", "private, no-store");
  return res.json(outcome);
}));

app.patch("/api/education/courses/:courseId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = courseCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    const completedOnIssue = parsed.error.issues.find((issue) => issue.path[0] === "completedOn");
    return res.status(400).json({
      error: completedOnIssue?.message || "Проверьте название, ссылку, логотип и даты курса",
      code: "COURSE_VALIDATION_ERROR",
    });
  }
  const course = parsed.data;
  if (!(await educationListBelongsToUser(course.listId, req.user.id, "courses"))) {
    return res.status(400).json({ error: "Список курсов не найден", code: "COURSE_LIST_NOT_FOUND" });
  }
  const listId = course.listId || null;
  const outcome = await withMutationLock(`education-courses:${req.user.id}`, () => transaction(async (client) => {
    const current = await client.query(
      "SELECT id,list_id FROM education_courses WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.courseId, req.user.id],
    );
    if (!current.rowCount) return { status: 404, error: "Курс не найден", code: "COURSE_NOT_FOUND" };
    const groupChange = current.rows[0].list_id === listId
      ? null
      : await detachCourseFromEducationGroup(client, req.params.courseId, req.user.id);
    const result = await client.query(
      `UPDATE education_courses item
       SET title=$1,provider=$2,status=$3,logo_url=$4,url=$5,description=$6,
           started_on=$7,completed_on=$8,list_id=$9,
           sort_order=CASE WHEN item.list_id IS DISTINCT FROM $9 THEN (
             SELECT COALESCE(MAX(other.sort_order),-1)+1
             FROM education_courses other
             WHERE other.user_id=$11 AND other.list_id IS NOT DISTINCT FROM $9
           ) ELSE item.sort_order END,
           updated_at=CURRENT_TIMESTAMP
       WHERE item.id=$10 AND item.user_id=$11
       RETURNING id,title,provider,status,logo_url,url,description,started_on,completed_on,list_id,sort_order,created_at,updated_at`,
      [
        course.title, course.provider, course.status, course.logoUrl, course.url, course.description,
        course.startedOn || null, course.completedOn || null, listId, req.params.courseId, req.user.id,
      ],
    );
    return { course: mapEducationCourse(result.rows[0]), groupChange };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
  res.set("Cache-Control", "private, no-store");
  return res.json(outcome);
}));

function registerEducationItemGroupRoutes(config) {
  app.post(`${config.apiBase}/groups`, requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const parsed = educationItemGroupCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Выберите два разных элемента" });
    const listId = parsed.data.listId || null;
    if (!(await educationListBelongsToUser(listId, req.user.id, config.section))) {
      return res.status(400).json({ error: config.listError });
    }
    const outcome = await withMutationLock(`education-${config.section}-groups:${req.user.id}`, () => transaction(async (client) => {
      const items = await client.query(
        `SELECT id FROM ${config.table}
         WHERE user_id=$1 AND list_id IS NOT DISTINCT FROM $2 AND id IN ($3,$4)
         ORDER BY id FOR UPDATE`,
        [req.user.id, listId, ...parsed.data.itemIds],
      );
      if (items.rowCount !== 2) return { status: 404, error: "Один из элементов не найден в этом списке" };
      const occupied = await client.query(
        "SELECT item_id FROM education_item_group_members WHERE section=$1 AND item_id IN ($2,$3)",
        [config.section, ...parsed.data.itemIds],
      );
      if (occupied.rowCount) return { status: 409, error: "Один из элементов уже находится в группе" };
      const group = { id: randomUUID(), listId, title: "Группа", itemIds: parsed.data.itemIds };
      const created = await client.query(
        `INSERT INTO education_item_groups (id,user_id,section,list_id,title)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING created_at,updated_at`,
        [group.id, req.user.id, config.section, group.listId, group.title],
      );
      await client.query(
        `INSERT INTO education_item_group_members (group_id,section,item_id,sort_order)
         VALUES ($1,$2,$3,0),($1,$2,$4,1)`,
        [group.id, config.section, ...group.itemIds],
      );
      return { group: { ...group, createdAt: created.rows[0].created_at, updatedAt: created.rows[0].updated_at } };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(outcome);
  }));

  app.post(`${config.apiBase}/groups/:groupId/items`, requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const parsed = educationItemGroupAddSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: `${config.itemLabel} не выбрана` });
    const outcome = await withMutationLock(`education-${config.section}-groups:${req.user.id}`, () => transaction(async (client) => {
      const group = await client.query(
        `SELECT id,list_id,title,created_at,updated_at FROM education_item_groups
         WHERE id=$1 AND user_id=$2 AND section=$3 FOR UPDATE`,
        [req.params.groupId, req.user.id, config.section],
      );
      if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
      const item = await client.query(
        `SELECT id FROM ${config.table} WHERE id=$1 AND user_id=$2 AND list_id IS NOT DISTINCT FROM $3 FOR UPDATE`,
        [parsed.data.itemId, req.user.id, group.rows[0].list_id],
      );
      if (!item.rowCount) return { status: 404, error: `${config.itemLabel} не найдена в списке группы` };
      const inserted = await client.query(
        `INSERT INTO education_item_group_members (group_id,section,item_id,sort_order)
         SELECT $1,$2,$3,COALESCE(MAX(sort_order),-1)+1
         FROM education_item_group_members WHERE group_id=$1 AND section=$2
         ON CONFLICT (section,item_id) DO NOTHING
         RETURNING item_id`,
        [req.params.groupId, config.section, parsed.data.itemId],
      );
      if (!inserted.rowCount) return { status: 409, error: `${config.itemLabel} уже находится в группе` };
      const members = await client.query(
        "SELECT item_id FROM education_item_group_members WHERE group_id=$1 AND section=$2 ORDER BY sort_order,item_id",
        [req.params.groupId, config.section],
      );
      const row = group.rows[0];
      return { group: { id: row.id, listId: row.list_id || null, title: row.title, itemIds: members.rows.map((member) => member.item_id), createdAt: row.created_at, updatedAt: row.updated_at } };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(outcome);
  }));

  app.delete(`${config.apiBase}/groups/:groupId/items/:itemId`, requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const outcome = await withMutationLock(`education-${config.section}-groups:${req.user.id}`, () => transaction(async (client) => {
      const group = await client.query(
        "SELECT id FROM education_item_groups WHERE id=$1 AND user_id=$2 AND section=$3 FOR UPDATE",
        [req.params.groupId, req.user.id, config.section],
      );
      if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
      const removed = await client.query(
        "DELETE FROM education_item_group_members WHERE group_id=$1 AND section=$2 AND item_id=$3 RETURNING item_id",
        [req.params.groupId, config.section, req.params.itemId],
      );
      if (!removed.rowCount) return { status: 404, error: `${config.itemLabel} не найдена в группе` };
      const remaining = await client.query(
        "SELECT item_id FROM education_item_group_members WHERE group_id=$1 AND section=$2 ORDER BY sort_order,item_id",
        [req.params.groupId, config.section],
      );
      const dissolved = remaining.rowCount < 2;
      if (dissolved) await client.query("DELETE FROM education_item_groups WHERE id=$1", [req.params.groupId]);
      return { groupId: req.params.groupId, itemId: req.params.itemId, dissolved, itemIds: dissolved ? [] : remaining.rows.map((row) => row.item_id) };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.set("Cache-Control", "private, no-store");
    return res.json(outcome);
  }));

  app.patch(`${config.apiBase}/groups/:groupId`, requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const parsed = courseGroupPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте название группы" });
    const result = await query(
      `UPDATE education_item_groups SET title=$1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND user_id=$3 AND section=$4 RETURNING id,title,updated_at`,
      [parsed.data.title, req.params.groupId, req.user.id, config.section],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
    res.set("Cache-Control", "private, no-store");
    return res.json({ group: { id: result.rows[0].id, title: result.rows[0].title, updatedAt: result.rows[0].updated_at } });
  }));

  app.patch(`${config.apiBase}/groups/:groupId/list`, requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const parsed = courseGroupMoveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Выберите список для группы" });
    const listId = parsed.data.listId || null;
    if (!(await educationListBelongsToUser(listId, req.user.id, config.section))) {
      return res.status(400).json({ error: config.listError });
    }
    const outcome = await withMutationLock(`education-${config.section}-groups:${req.user.id}`, () => transaction(async (client) => {
      const group = await client.query(
        `SELECT id,list_id,title,created_at FROM education_item_groups
         WHERE id=$1 AND user_id=$2 AND section=$3 FOR UPDATE`,
        [req.params.groupId, req.user.id, config.section],
      );
      if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
      const members = await client.query(
        "SELECT item_id FROM education_item_group_members WHERE group_id=$1 AND section=$2 ORDER BY sort_order,item_id",
        [req.params.groupId, config.section],
      );
      const maxOrder = await client.query(
        `SELECT COALESCE(MAX(sort_order),-1) AS value FROM ${config.table} WHERE user_id=$1 AND list_id IS NOT DISTINCT FROM $2`,
        [req.user.id, listId],
      );
      const startOrder = Number(maxOrder.rows[0].value) + 1;
      for (const [index, member] of members.rows.entries()) {
        await client.query(
          `UPDATE ${config.table} SET list_id=$1,sort_order=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND user_id=$4`,
          [listId, startOrder + index, member.item_id, req.user.id],
        );
      }
      const updated = await client.query(
        `UPDATE education_item_groups SET list_id=$1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$2 RETURNING updated_at`,
        [listId, req.params.groupId],
      );
      const row = group.rows[0];
      return { group: { id: row.id, listId, title: row.title, itemIds: members.rows.map((member) => member.item_id), createdAt: row.created_at, updatedAt: updated.rows[0].updated_at } };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.set("Cache-Control", "private, no-store");
    return res.json(outcome);
  }));

  app.delete(`${config.apiBase}/groups/:groupId`, requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const result = await query(
      "DELETE FROM education_item_groups WHERE id=$1 AND user_id=$2 AND section=$3 RETURNING id",
      [req.params.groupId, req.user.id, config.section],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
    res.set("Cache-Control", "private, no-store");
    return res.json({ ok: true, groupId: result.rows[0].id });
  }));
}

Object.values(educationGroupedSections).forEach(registerEducationItemGroupRoutes);

app.get("/api/education/conferences", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const [result, lists, groups] = await Promise.all([query(
    `SELECT id,title,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order,created_at,updated_at
     FROM education_conferences
     WHERE user_id=$1
     ORDER BY sort_order,
              CASE status WHEN 'registered' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,
              COALESCE(starts_on,ends_on) DESC NULLS LAST,
              updated_at DESC`,
    [req.user.id],
  ), educationListsForUser(req.user.id, "conferences"), educationItemGroupsForUser(req.user.id, "conferences")]);
  res.set("Cache-Control", "private, no-store");
  return res.json({ conferences: result.rows.map(mapEducationConference), lists, groups });
}));

app.post("/api/education/conferences", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = conferenceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    const endsOnIssue = parsed.error.issues.find((issue) => issue.path[0] === "endsOn");
    return res.status(400).json({
      error: endsOnIssue?.message || "Проверьте название, ссылку и даты конференции",
      code: "CONFERENCE_VALIDATION_ERROR",
    });
  }
  const conference = parsed.data;
  if (!(await educationListBelongsToUser(conference.listId, req.user.id, "conferences"))) {
    return res.status(400).json({ error: "Список конференций не найден", code: "CONFERENCE_LIST_NOT_FOUND" });
  }
  const listId = conference.listId || null;
  const result = await withMutationLock(`education-conferences:${req.user.id}`, () => query(
    `INSERT INTO education_conferences (
       id,user_id,title,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order
     ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE(MAX(sort_order),-1)+1
       FROM education_conferences WHERE user_id=$2 AND list_id IS NOT DISTINCT FROM $12
     RETURNING id,title,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order,created_at,updated_at`,
    [
      randomUUID(), req.user.id, conference.title, conference.status, conference.role,
      conference.format, conference.location, conference.url, conference.description,
      conference.startsOn || null, conference.endsOn || null, listId,
    ],
  ));
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json({ conference: mapEducationConference(result.rows[0]) });
}));

app.patch("/api/education/conferences/reorder", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = conferenceReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Не удалось изменить порядок конференций", code: "CONFERENCE_REORDER_VALIDATION_ERROR" });
  }
  const conferenceIds = parsed.data.conferenceIds;
  const listId = parsed.data.listId || null;
  const outcome = await withMutationLock(`education-conferences:${req.user.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id FROM education_conferences WHERE user_id=$1 AND list_id IS NOT DISTINCT FROM $2 FOR UPDATE",
      [req.user.id, listId],
    );
    const ownedIds = new Set(owned.rows.map((row) => row.id));
    if (ownedIds.size !== conferenceIds.length || conferenceIds.some((id) => !ownedIds.has(id))) {
      return { error: "Список конференций изменился. Обновите страницу и попробуйте снова", status: 409 };
    }
    for (const [sortOrder, conferenceId] of conferenceIds.entries()) {
      await client.query(
        "UPDATE education_conferences SET sort_order=$1 WHERE id=$2 AND user_id=$3",
        [sortOrder, conferenceId, req.user.id],
      );
    }
    return { conferenceIds };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, code: "CONFERENCE_REORDER_CONFLICT" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ conferenceIds: outcome.conferenceIds });
}));

app.patch("/api/education/conferences/:conferenceId/list", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = educationItemListMoveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Не удалось выбрать список для конференции", code: "CONFERENCE_LIST_VALIDATION_ERROR" });
  }
  const listId = parsed.data.listId || null;
  if (!(await educationListBelongsToUser(listId, req.user.id, "conferences"))) {
    return res.status(400).json({ error: "Список конференций не найден", code: "CONFERENCE_LIST_NOT_FOUND" });
  }
  const outcome = await withMutationLock(`education-conferences:${req.user.id}`, () => transaction(async (client) => {
    const current = await client.query(
      "SELECT id,list_id FROM education_conferences WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.conferenceId, req.user.id],
    );
    if (!current.rowCount) return { status: 404, error: "Конференция не найдена", code: "CONFERENCE_NOT_FOUND" };
    const groupChange = current.rows[0].list_id === listId
      ? null
      : await detachEducationItemFromGroup(client, "conferences", req.params.conferenceId, req.user.id);
    const result = await client.query(
      `UPDATE education_conferences item
       SET list_id=$1,
           sort_order=CASE WHEN item.list_id IS DISTINCT FROM $1 THEN (
             SELECT COALESCE(MAX(other.sort_order),-1)+1
             FROM education_conferences other
             WHERE other.user_id=$3 AND other.list_id IS NOT DISTINCT FROM $1
           ) ELSE item.sort_order END,
           updated_at=CURRENT_TIMESTAMP
       WHERE item.id=$2 AND item.user_id=$3
       RETURNING id,title,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order,created_at,updated_at`,
      [listId, req.params.conferenceId, req.user.id],
    );
    return { conference: mapEducationConference(result.rows[0]), groupChange };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
  res.set("Cache-Control", "private, no-store");
  return res.json(outcome);
}));

app.patch("/api/education/conferences/:conferenceId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = conferenceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    const endsOnIssue = parsed.error.issues.find((issue) => issue.path[0] === "endsOn");
    return res.status(400).json({
      error: endsOnIssue?.message || "Проверьте название, ссылку и даты конференции",
      code: "CONFERENCE_VALIDATION_ERROR",
    });
  }
  const conference = parsed.data;
  if (!(await educationListBelongsToUser(conference.listId, req.user.id, "conferences"))) {
    return res.status(400).json({ error: "Список конференций не найден", code: "CONFERENCE_LIST_NOT_FOUND" });
  }
  const listId = conference.listId || null;
  const outcome = await withMutationLock(`education-conferences:${req.user.id}`, () => transaction(async (client) => {
    const current = await client.query(
      "SELECT id,list_id FROM education_conferences WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.conferenceId, req.user.id],
    );
    if (!current.rowCount) return { status: 404, error: "Конференция не найдена" };
    const groupChange = current.rows[0].list_id === listId
      ? null
      : await detachEducationItemFromGroup(client, "conferences", req.params.conferenceId, req.user.id);
    const result = await client.query(
      `UPDATE education_conferences item SET
         title=$1,status=$2,role=$3,format=$4,location=$5,url=$6,description=$7,
         starts_on=$8,ends_on=$9,list_id=$10,
         sort_order=CASE WHEN item.list_id IS DISTINCT FROM $10 THEN (
           SELECT COALESCE(MAX(other.sort_order),-1)+1
           FROM education_conferences other
           WHERE other.user_id=$12 AND other.list_id IS NOT DISTINCT FROM $10
         ) ELSE item.sort_order END,
         updated_at=CURRENT_TIMESTAMP
       WHERE item.id=$11 AND item.user_id=$12
       RETURNING id,title,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order,created_at,updated_at`,
      [
        conference.title, conference.status, conference.role, conference.format,
        conference.location, conference.url, conference.description,
        conference.startsOn || null, conference.endsOn || null,
        listId, req.params.conferenceId, req.user.id,
      ],
    );
    return { conference: mapEducationConference(result.rows[0]), groupChange };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.set("Cache-Control", "private, no-store");
  return res.json(outcome);
}));

app.get("/api/education/coaching-sessions", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const [result, lists, groups] = await Promise.all([query(
    `SELECT id,title,coach,status,format,location,url,description,session_on,session_time,duration_minutes,list_id,sort_order,created_at,updated_at
     FROM education_coaching_sessions
     WHERE user_id=$1
     ORDER BY sort_order,
              CASE status WHEN 'scheduled' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
              CASE WHEN status='scheduled' THEN session_on END ASC NULLS LAST,
              CASE WHEN status<>'scheduled' THEN session_on END DESC NULLS LAST,
              updated_at DESC`,
    [req.user.id],
  ), educationListsForUser(req.user.id, "coaching"), educationItemGroupsForUser(req.user.id, "coaching")]);
  res.set("Cache-Control", "private, no-store");
  return res.json({ sessions: result.rows.map(mapEducationCoachingSession), lists, groups });
}));

app.post("/api/education/coaching-sessions", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = coachingSessionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Проверьте название, ссылку, время и длительность сессии",
      code: "COACHING_SESSION_VALIDATION_ERROR",
    });
  }
  const session = parsed.data;
  if (!(await educationListBelongsToUser(session.listId, req.user.id, "coaching"))) {
    return res.status(400).json({ error: "Список коучинг-сессий не найден", code: "COACHING_LIST_NOT_FOUND" });
  }
  const listId = session.listId || null;
  const result = await withMutationLock(`education-coaching-sessions:${req.user.id}`, () => query(
    `INSERT INTO education_coaching_sessions (
       id,user_id,title,coach,status,format,location,url,description,session_on,session_time,duration_minutes,list_id,sort_order
     ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE(MAX(sort_order),-1)+1
       FROM education_coaching_sessions WHERE user_id=$2 AND list_id IS NOT DISTINCT FROM $13
     RETURNING id,title,coach,status,format,location,url,description,session_on,session_time,duration_minutes,list_id,sort_order,created_at,updated_at`,
    [
      randomUUID(), req.user.id, session.title, session.coach, session.status, session.format,
      session.location, session.url, session.description, session.sessionOn || null,
      session.sessionTime || null, session.durationMinutes || null, listId,
    ],
  ));
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json({ session: mapEducationCoachingSession(result.rows[0]) });
}));

app.patch("/api/education/coaching-sessions/reorder", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = coachingSessionReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Не удалось изменить порядок коучинг-сессий", code: "COACHING_SESSION_REORDER_VALIDATION_ERROR" });
  }
  const sessionIds = parsed.data.sessionIds;
  const listId = parsed.data.listId || null;
  const outcome = await withMutationLock(`education-coaching-sessions:${req.user.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id FROM education_coaching_sessions WHERE user_id=$1 AND list_id IS NOT DISTINCT FROM $2 FOR UPDATE",
      [req.user.id, listId],
    );
    const ownedIds = new Set(owned.rows.map((row) => row.id));
    if (ownedIds.size !== sessionIds.length || sessionIds.some((id) => !ownedIds.has(id))) {
      return { error: "Список коучинг-сессий изменился. Обновите страницу и попробуйте снова", status: 409 };
    }
    for (const [sortOrder, sessionId] of sessionIds.entries()) {
      await client.query(
        "UPDATE education_coaching_sessions SET sort_order=$1 WHERE id=$2 AND user_id=$3",
        [sortOrder, sessionId, req.user.id],
      );
    }
    return { sessionIds };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, code: "COACHING_SESSION_REORDER_CONFLICT" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ sessionIds: outcome.sessionIds });
}));

app.patch("/api/education/coaching-sessions/:sessionId/list", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = educationItemListMoveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Не удалось выбрать список для коучинг-сессии", code: "COACHING_LIST_VALIDATION_ERROR" });
  }
  const listId = parsed.data.listId || null;
  if (!(await educationListBelongsToUser(listId, req.user.id, "coaching"))) {
    return res.status(400).json({ error: "Список коучинг-сессий не найден", code: "COACHING_LIST_NOT_FOUND" });
  }
  const outcome = await withMutationLock(`education-coaching-sessions:${req.user.id}`, () => transaction(async (client) => {
    const current = await client.query(
      "SELECT id,list_id FROM education_coaching_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.sessionId, req.user.id],
    );
    if (!current.rowCount) return { status: 404, error: "Коучинг-сессия не найдена", code: "COACHING_SESSION_NOT_FOUND" };
    const groupChange = current.rows[0].list_id === listId
      ? null
      : await detachEducationItemFromGroup(client, "coaching", req.params.sessionId, req.user.id);
    const result = await client.query(
      `UPDATE education_coaching_sessions item
       SET list_id=$1,
           sort_order=CASE WHEN item.list_id IS DISTINCT FROM $1 THEN (
             SELECT COALESCE(MAX(other.sort_order),-1)+1
             FROM education_coaching_sessions other
             WHERE other.user_id=$3 AND other.list_id IS NOT DISTINCT FROM $1
           ) ELSE item.sort_order END,
           updated_at=CURRENT_TIMESTAMP
       WHERE item.id=$2 AND item.user_id=$3
       RETURNING id,title,coach,status,format,location,url,description,session_on,session_time,duration_minutes,list_id,sort_order,created_at,updated_at`,
      [listId, req.params.sessionId, req.user.id],
    );
    return { session: mapEducationCoachingSession(result.rows[0]), groupChange };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
  res.set("Cache-Control", "private, no-store");
  return res.json(outcome);
}));

app.patch("/api/education/coaching-sessions/:sessionId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = coachingSessionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Проверьте название, ссылку, время и длительность сессии",
      code: "COACHING_SESSION_VALIDATION_ERROR",
    });
  }
  const session = parsed.data;
  if (!(await educationListBelongsToUser(session.listId, req.user.id, "coaching"))) {
    return res.status(400).json({ error: "Список коучинг-сессий не найден", code: "COACHING_LIST_NOT_FOUND" });
  }
  const listId = session.listId || null;
  const outcome = await withMutationLock(`education-coaching-sessions:${req.user.id}`, () => transaction(async (client) => {
    const current = await client.query(
      "SELECT id,list_id FROM education_coaching_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.sessionId, req.user.id],
    );
    if (!current.rowCount) return { status: 404, error: "Коучинг-сессия не найдена" };
    const groupChange = current.rows[0].list_id === listId
      ? null
      : await detachEducationItemFromGroup(client, "coaching", req.params.sessionId, req.user.id);
    const result = await client.query(
      `UPDATE education_coaching_sessions item SET
         title=$1,coach=$2,status=$3,format=$4,location=$5,url=$6,description=$7,
         session_on=$8,session_time=$9,duration_minutes=$10,list_id=$11,
         sort_order=CASE WHEN item.list_id IS DISTINCT FROM $11 THEN (
           SELECT COALESCE(MAX(other.sort_order),-1)+1
           FROM education_coaching_sessions other
           WHERE other.user_id=$13 AND other.list_id IS NOT DISTINCT FROM $11
         ) ELSE item.sort_order END,
         updated_at=CURRENT_TIMESTAMP
       WHERE item.id=$12 AND item.user_id=$13
       RETURNING id,title,coach,status,format,location,url,description,session_on,session_time,duration_minutes,list_id,sort_order,created_at,updated_at`,
      [
        session.title, session.coach, session.status, session.format, session.location,
        session.url, session.description, session.sessionOn || null,
        session.sessionTime || null, session.durationMinutes || null,
        listId, req.params.sessionId, req.user.id,
      ],
    );
    return { session: mapEducationCoachingSession(result.rows[0]), groupChange };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.set("Cache-Control", "private, no-store");
  return res.json(outcome);
}));

app.get("/api/health/workouts", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const [result, lists] = await Promise.all([query(
    `SELECT id,title,workout_type,status,workout_on,start_time,duration_minutes,intensity,distance_km,calories,notes,list_id,sort_order,created_at,updated_at
     FROM health_workouts
     WHERE user_id=$1
     ORDER BY sort_order,
              CASE status WHEN 'planned' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
              CASE WHEN status='planned' THEN workout_on END ASC NULLS LAST,
              CASE WHEN status<>'planned' THEN workout_on END DESC NULLS LAST,
              updated_at DESC`,
    [req.user.id],
  ), educationListsForUser(req.user.id, "workouts")]);
  res.set("Cache-Control", "private, no-store");
  return res.json({ workouts: result.rows.map(mapHealthWorkout), lists });
}));

app.post("/api/health/workouts", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = workoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Проверьте тип, дату, длительность и показатели тренировки",
      code: "WORKOUT_VALIDATION_ERROR",
    });
  }
  const workout = parsed.data;
  if (!(await educationListBelongsToUser(workout.listId, req.user.id, "workouts"))) {
    return res.status(400).json({ error: "Список тренировок не найден", code: "WORKOUT_LIST_NOT_FOUND" });
  }
  const listId = workout.listId || null;
  const result = await withMutationLock(`health-workouts:${req.user.id}`, () => query(
    `INSERT INTO health_workouts (
       id,user_id,title,workout_type,status,workout_on,start_time,duration_minutes,intensity,distance_km,calories,notes,list_id,sort_order
     ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE(MAX(sort_order),-1)+1
       FROM health_workouts WHERE user_id=$2 AND list_id IS NOT DISTINCT FROM $13
     RETURNING id,title,workout_type,status,workout_on,start_time,duration_minutes,intensity,distance_km,calories,notes,list_id,sort_order,created_at,updated_at`,
    [
      randomUUID(), req.user.id, workout.title, workout.workoutType, workout.status, workout.workoutOn,
      workout.startTime || null, workout.durationMinutes || null, workout.intensity,
      workout.distanceKm || null, workout.calories || null, workout.notes, listId,
    ],
  ));
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json({ workout: mapHealthWorkout(result.rows[0]) });
}));

app.patch("/api/health/workouts/reorder", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = workoutReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Не удалось изменить порядок тренировок", code: "WORKOUT_REORDER_VALIDATION_ERROR" });
  }
  const workoutIds = parsed.data.workoutIds;
  const listId = parsed.data.listId || null;
  const outcome = await withMutationLock(`health-workouts:${req.user.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id FROM health_workouts WHERE user_id=$1 AND list_id IS NOT DISTINCT FROM $2 FOR UPDATE",
      [req.user.id, listId],
    );
    const ownedIds = new Set(owned.rows.map((row) => row.id));
    if (ownedIds.size !== workoutIds.length || workoutIds.some((id) => !ownedIds.has(id))) {
      return { error: "Список тренировок изменился. Обновите страницу и попробуйте снова", status: 409 };
    }
    for (const [sortOrder, workoutId] of workoutIds.entries()) {
      await client.query(
        "UPDATE health_workouts SET sort_order=$1 WHERE id=$2 AND user_id=$3",
        [sortOrder, workoutId, req.user.id],
      );
    }
    return { workoutIds };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, code: "WORKOUT_REORDER_CONFLICT" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ workoutIds: outcome.workoutIds });
}));

app.patch("/api/health/workouts/:workoutId/list", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = educationItemListMoveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Не удалось выбрать список для тренировки", code: "WORKOUT_LIST_VALIDATION_ERROR" });
  }
  const listId = parsed.data.listId || null;
  if (!(await educationListBelongsToUser(listId, req.user.id, "workouts"))) {
    return res.status(400).json({ error: "Список тренировок не найден", code: "WORKOUT_LIST_NOT_FOUND" });
  }
  const result = await withMutationLock(`health-workouts:${req.user.id}`, () => query(
    `UPDATE health_workouts item
     SET list_id=$1,
         sort_order=CASE WHEN item.list_id IS DISTINCT FROM $1 THEN (
           SELECT COALESCE(MAX(other.sort_order),-1)+1
           FROM health_workouts other
           WHERE other.user_id=$3 AND other.list_id IS NOT DISTINCT FROM $1
         ) ELSE item.sort_order END,
         updated_at=CURRENT_TIMESTAMP
     WHERE item.id=$2 AND item.user_id=$3
     RETURNING id,title,workout_type,status,workout_on,start_time,duration_minutes,intensity,distance_km,calories,notes,list_id,sort_order,created_at,updated_at`,
    [listId, req.params.workoutId, req.user.id],
  ));
  if (!result.rowCount) return res.status(404).json({ error: "Тренировка не найдена", code: "WORKOUT_NOT_FOUND" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ workout: mapHealthWorkout(result.rows[0]) });
}));

app.patch("/api/health/workouts/:workoutId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = workoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Проверьте тип, дату, длительность и показатели тренировки",
      code: "WORKOUT_VALIDATION_ERROR",
    });
  }
  const workout = parsed.data;
  if (!(await educationListBelongsToUser(workout.listId, req.user.id, "workouts"))) {
    return res.status(400).json({ error: "Список тренировок не найден", code: "WORKOUT_LIST_NOT_FOUND" });
  }
  const listId = workout.listId || null;
  const result = await query(
    `UPDATE health_workouts item SET
       title=$1,workout_type=$2,status=$3,workout_on=$4,start_time=$5,duration_minutes=$6,
       intensity=$7,distance_km=$8,calories=$9,notes=$10,list_id=$11,
       sort_order=CASE WHEN item.list_id IS DISTINCT FROM $11 THEN (
         SELECT COALESCE(MAX(other.sort_order),-1)+1
         FROM health_workouts other
         WHERE other.user_id=$13 AND other.list_id IS NOT DISTINCT FROM $11
       ) ELSE item.sort_order END,
       updated_at=CURRENT_TIMESTAMP
     WHERE item.id=$12 AND item.user_id=$13
     RETURNING id,title,workout_type,status,workout_on,start_time,duration_minutes,intensity,distance_km,calories,notes,list_id,sort_order,created_at,updated_at`,
    [
      workout.title, workout.workoutType, workout.status, workout.workoutOn, workout.startTime || null,
      workout.durationMinutes || null, workout.intensity, workout.distanceKm || null,
      workout.calories || null, workout.notes, listId, req.params.workoutId, req.user.id,
    ],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Тренировка не найдена" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ workout: mapHealthWorkout(result.rows[0]) });
}));

app.post("/api/health/medication-groups", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = medicationGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Укажите название группы до 60 символов" });
  const result = await query(
    `INSERT INTO health_medication_groups (id,user_id,title,sort_order)
     SELECT $1,$2,$3,COALESCE(MAX(sort_order),-1)+1
     FROM health_medication_groups
     WHERE user_id=$2
     RETURNING id,title,sort_order,created_at,updated_at`,
    [randomUUID(), req.user.id, parsed.data.title],
  );
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json({ group: mapHealthMedicationGroup(result.rows[0]) });
}));

app.patch("/api/health/medication-groups/:groupId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = medicationGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Укажите название группы до 60 символов" });
  const result = await query(
    `UPDATE health_medication_groups
     SET title=$1,updated_at=CURRENT_TIMESTAMP
     WHERE id=$2 AND user_id=$3
     RETURNING id,title,sort_order,created_at,updated_at`,
    [parsed.data.title, req.params.groupId, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ group: mapHealthMedicationGroup(result.rows[0]) });
}));

app.delete("/api/health/medication-groups/:groupId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const result = await query(
    "DELETE FROM health_medication_groups WHERE id=$1 AND user_id=$2 RETURNING id",
    [req.params.groupId, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
  res.set("Cache-Control", "private, no-store");
  return res.status(204).end();
}));

app.get("/api/health/medications", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const [medicationsResult, groupsResult] = await Promise.all([
    query(
      `SELECT id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,created_at,updated_at
       FROM health_medications
       WHERE user_id=$1
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
                CASE WHEN status='planned' THEN start_on END ASC NULLS LAST,
                CASE WHEN status IN ('paused','completed') THEN end_on END DESC NULLS LAST,
                updated_at DESC`,
      [req.user.id],
    ),
    query(
      `SELECT id,title,sort_order,created_at,updated_at
       FROM health_medication_groups
       WHERE user_id=$1
       ORDER BY sort_order,created_at,id`,
      [req.user.id],
    ),
  ]);
  res.set("Cache-Control", "private, no-store");
  return res.json({
    medications: medicationsResult.rows.map(mapHealthMedication),
    groups: groupsResult.rows.map(mapHealthMedicationGroup),
  });
}));

app.post("/api/health/medications", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = medicationSchema.safeParse(req.body);
  if (!parsed.success) {
    const endOnIssue = parsed.error.issues.find((issue) => issue.path[0] === "endOn");
    return res.status(400).json({
      error: endOnIssue?.message || "Проверьте название, схему и период приёма препарата",
      code: "MEDICATION_VALIDATION_ERROR",
    });
  }
  const medication = parsed.data;
  if (medication.groupId) {
    const group = await query(
      "SELECT 1 FROM health_medication_groups WHERE id=$1 AND user_id=$2",
      [medication.groupId, req.user.id],
    );
    if (!group.rowCount) return res.status(400).json({ error: "Выбранная группа не найдена" });
  }
  const result = await query(
    `INSERT INTO health_medications (
       id,user_id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,created_at,updated_at`,
    [
      randomUUID(), req.user.id, medication.groupId, medication.name, medication.medicationForm,
      medication.status, medication.dosage, medication.frequency, JSON.stringify(medication.scheduleTimes),
      medication.purpose, medication.prescriber, medication.instructions, medication.startOn || null,
      medication.endOn || null, medication.notes,
    ],
  );
  res.set("Cache-Control", "private, no-store");
  return res.status(201).json({ medication: mapHealthMedication(result.rows[0]) });
}));

app.patch("/api/health/medications/:medicationId/group", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = medicationGroupMoveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Не удалось выбрать группу для препарата",
      code: "MEDICATION_GROUP_VALIDATION_ERROR",
    });
  }
  const { groupId } = parsed.data;
  if (groupId) {
    const group = await query(
      "SELECT 1 FROM health_medication_groups WHERE id=$1 AND user_id=$2",
      [groupId, req.user.id],
    );
    if (!group.rowCount) {
      return res.status(400).json({
        error: "Группа препаратов не найдена",
        code: "MEDICATION_GROUP_NOT_FOUND",
      });
    }
  }
  const result = await withMutationLock(`health-medications:${req.user.id}`, () => query(
    `UPDATE health_medications
     SET group_id=$1,updated_at=CURRENT_TIMESTAMP
     WHERE id=$2 AND user_id=$3
     RETURNING id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,created_at,updated_at`,
    [groupId, req.params.medicationId, req.user.id],
  ));
  if (!result.rowCount) {
    return res.status(404).json({ error: "Препарат не найден", code: "MEDICATION_NOT_FOUND" });
  }
  res.set("Cache-Control", "private, no-store");
  return res.json({ medication: mapHealthMedication(result.rows[0]) });
}));

app.patch("/api/health/medications/:medicationId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const parsed = medicationSchema.safeParse(req.body);
  if (!parsed.success) {
    const endOnIssue = parsed.error.issues.find((issue) => issue.path[0] === "endOn");
    return res.status(400).json({
      error: endOnIssue?.message || "Проверьте название, схему и период приёма препарата",
      code: "MEDICATION_VALIDATION_ERROR",
    });
  }
  const medication = parsed.data;
  if (medication.groupId) {
    const group = await query(
      "SELECT 1 FROM health_medication_groups WHERE id=$1 AND user_id=$2",
      [medication.groupId, req.user.id],
    );
    if (!group.rowCount) return res.status(400).json({ error: "Выбранная группа не найдена" });
  }
  const result = await query(
    `UPDATE health_medications SET
       group_id=$1,name=$2,medication_form=$3,status=$4,dosage=$5,frequency=$6,schedule_times_json=$7,
       purpose=$8,prescriber=$9,instructions=$10,start_on=$11,end_on=$12,notes=$13,updated_at=CURRENT_TIMESTAMP
     WHERE id=$14 AND user_id=$15
     RETURNING id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,created_at,updated_at`,
    [
      medication.groupId, medication.name, medication.medicationForm, medication.status, medication.dosage,
      medication.frequency, JSON.stringify(medication.scheduleTimes), medication.purpose, medication.prescriber,
      medication.instructions, medication.startOn || null, medication.endOn || null, medication.notes,
      req.params.medicationId, req.user.id,
    ],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Препарат не найден" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ medication: mapHealthMedication(result.rows[0]) });
}));

app.get("/api/health/lab-results", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const uploadedReports = await uploadedLabReports(req.user.id);
  res.set("Cache-Control", "private, no-store");
  return res.json({
    reports: mergeLabReportsByDate([...uploadedReports, ...LAB_REPORTS]),
    trends: LAB_TRENDS,
    attentionItems: LAB_ATTENTION_ITEMS,
  });
}));

app.post(
  "/api/health/lab-results/uploads",
  requireAuth,
  requirePrivateSphereOwner,
  labPdfUploadRateLimit,
  labPdfUploadBody,
  asyncRoute(async (req, res) => {
    const declaredType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!["application/pdf", "application/octet-stream"].includes(declaredType) || !isPdfBuffer(req.body)) {
      return res.status(400).json({ error: "Загрузите корректный PDF-файл" });
    }

    const id = randomUUID();
    const filename = labUploadFilename(req);
    let report;
    try {
      report = await parseLabPdf(req.body, { id, filename, uploadedAt: new Date() });
    } catch (error) {
      if (error instanceof LabPdfError) return res.status(422).json({ error: error.message, code: error.code });
      throw error;
    }

    const fileHash = createHash("sha256").update(req.body).digest("hex");
    try {
      const inserted = await query(
        `INSERT INTO lab_report_uploads (
           id,user_id,filename,mime_type,pdf_data,size_bytes,file_hash,report_json
         ) VALUES ($1,$2,$3,'application/pdf',$4,$5,$6,$7)
         RETURNING id,filename,report_json,created_at`,
        [id, req.user.id, filename, req.body, req.body.length, fileHash, JSON.stringify(report)],
      );
      const insertedReport = mapUploadedLabReport(inserted.rows[0]);
      const reports = mergeLabReportsByDate([...(await uploadedLabReports(req.user.id)), ...LAB_REPORTS]);
      const mergedReport = reports.find((item) => item.date === insertedReport.date) || insertedReport;
      res.set("Cache-Control", "private, no-store");
      return res.status(201).json({ report: mergedReport, reports });
    } catch (error) {
      if (error?.code === "23505") return res.status(409).json({ error: "Этот PDF уже загружен" });
      throw error;
    }
  }),
);

app.get("/api/health/lab-results/uploads/:id/pdf", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT id,filename,mime_type,pdf_data,size_bytes
     FROM lab_report_uploads
     WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "PDF не найден" });
  const file = result.rows[0];
  const encodedFilename = encodeURIComponent(file.filename).replaceAll("'", "%27");
  res.set({
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodedFilename}`,
    "Content-Length": String(file.size_bytes),
    "X-Content-Type-Options": "nosniff",
  });
  return res.type(file.mime_type).send(file.pdf_data);
}));

app.get("/api/contacts/:contactId/avatar", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const contact = await contactForUser(req.user.id, req.params.contactId);
  if (!contact || !contactAvatarPath(contact)) return res.status(404).end();
  try {
    const image = await loadContactAvatar(contact);
    if (req.get("if-none-match") === image.etag) return res.status(304).end();
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Length": String(image.body.length),
      ETag: image.etag,
    });
    return res.type(image.mimeType).send(image.body);
  } catch (error) {
    if (error instanceof MetadataFetchError) return res.status(404).end();
    throw error;
  }
}));

app.get("/api/contacts/:contactId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const contact = await contactForUser(req.user.id, req.params.contactId);
  if (!contact) return res.status(404).json({ error: "Контакт не найден" });
  res.set("Cache-Control", "private, no-store");
  return res.json({ contact: { ...contact, avatarUrl: contactAvatarPath(contact) } });
}));

app.patch("/api/contacts/:contactId/favorite", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const source = await contactForUser(req.user.id, req.params.contactId);
  if (!source) return res.status(404).json({ error: "Контакт не найден" });
  const parsed = contactFavoriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Не удалось изменить избранное" });
  const favorite = parsed.data.favorite;
  await withMutationLock(`contact-favorite:${req.user.id}:${source.id}`, async () => {
    if (favorite) {
      await query(
        `INSERT INTO contact_favorites (user_id,contact_id)
         VALUES ($1,$2)
         ON CONFLICT (user_id,contact_id) DO NOTHING`,
        [req.user.id, source.id],
      );
    } else {
      await query("DELETE FROM contact_favorites WHERE user_id=$1 AND contact_id=$2", [req.user.id, source.id]);
    }
  });
  res.set("Cache-Control", "private, no-store");
  return res.json({ favorite });
}));

app.patch("/api/contacts/:contactId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
  const source = await contactForUser(req.user.id, req.params.contactId);
  if (!source) return res.status(404).json({ error: "Контакт не найден" });
  const parsed = contactUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Не удалось сохранить: проверьте заполнение полей и адреса ссылок" });
  const data = parsed.data;
  const result = await query(
    `INSERT INTO contact_overrides (
       user_id,contact_id,name,company,role,category,status,links_json,notes,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)
     ON CONFLICT (user_id,contact_id) DO UPDATE SET
       name=EXCLUDED.name,
       company=EXCLUDED.company,
       role=EXCLUDED.role,
       category=EXCLUDED.category,
       status=EXCLUDED.status,
       links_json=EXCLUDED.links_json,
       notes=EXCLUDED.notes,
       updated_at=CURRENT_TIMESTAMP
     RETURNING contact_id AS "contactId",name,company,role,category,status,
               links_json AS "linksJson",notes,updated_at AS "updatedAt"`,
    [req.user.id, source.id, data.name, data.company, data.role, data.category, data.status, JSON.stringify(data.links), data.notes],
  );
  const contact = await contactForUser(req.user.id, source.id);
  res.set("Cache-Control", "private, no-store");
  return res.json({ contact: { ...contact, avatarUrl: contactAvatarPath(contact) } });
}));

app.get("/api/people", asyncRoute(async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 80);
  const scope = String(req.query.scope || "discover");
  if (!["discover", "subscriptions", "followers"].includes(scope)) {
    return res.status(400).json({ error: "Неизвестный раздел друзей" });
  }
  if (scope !== "discover" && !req.user) {
    return res.status(401).json({ error: "Войдите, чтобы увидеть друзей" });
  }
  const pattern = `%${search.toLowerCase()}%`;
  let result;
  if (scope === "subscriptions") {
    result = await query(
      `SELECT u.id,u.username,u.name,u.bio,u.avatar_url,u.birthday
       FROM follows f JOIN users u ON u.id=f.following_id
       WHERE f.follower_id=$2 AND (LOWER(u.name) LIKE $1 OR LOWER(u.username) LIKE $1)
       ORDER BY f.created_at DESC LIMIT 48`,
      [pattern, req.user.id],
    );
  } else if (scope === "followers") {
    result = await query(
      `SELECT u.id,u.username,u.name,u.bio,u.avatar_url,u.birthday
       FROM follows f JOIN users u ON u.id=f.follower_id
       WHERE f.following_id=$2 AND (LOWER(u.name) LIKE $1 OR LOWER(u.username) LIKE $1)
       ORDER BY f.created_at DESC LIMIT 48`,
      [pattern, req.user.id],
    );
  } else {
    result = await query(
      `SELECT u.id,u.username,u.name,u.bio,u.avatar_url,u.birthday
       FROM users u
       WHERE (LOWER(u.name) LIKE $1 OR LOWER(u.username) LIKE $1)
         AND ($2::text IS NULL OR u.id<>$2)
       ORDER BY u.created_at DESC LIMIT 48`,
      [pattern, req.user?.id || null],
    );
  }
  const relationships = new Map(result.rows.map((row) => [row.id, { isFollowing: false, isFollower: false }]));
  if (req.user && result.rows.length) {
    const idPlaceholders = result.rows.map((_, index) => `$${index + 2}`).join(",");
    const relationRows = await query(
      `SELECT follower_id,following_id FROM follows
       WHERE (follower_id=$1 AND following_id IN (${idPlaceholders}))
          OR (following_id=$1 AND follower_id IN (${idPlaceholders}))`,
      [req.user.id, ...result.rows.map((row) => row.id)],
    );
    for (const relation of relationRows.rows) {
      const personId = relation.follower_id === req.user.id ? relation.following_id : relation.follower_id;
      const flags = relationships.get(personId);
      if (!flags) continue;
      if (relation.follower_id === req.user.id) flags.isFollowing = true;
      if (relation.following_id === req.user.id) flags.isFollower = true;
    }
  }

  const countParameters = result.rows.flatMap((row) => [row.id, relationships.get(row.id)?.isFollowing || false]);
  const countRows = result.rows.map((_, index) => (
    `SELECT $${index * 2 + 1}::text AS user_id,$${index * 2 + 2}::boolean AS can_view_followers`
  )).join(" UNION ALL ");
  const wishCounts = new Map();
  if (countRows) {
    const wishCountRows = await query(
      `WITH visible_users AS (${countRows})
       SELECT vu.user_id,COUNT(DISTINCT w.id) AS count
       FROM visible_users vu
       JOIN wishes w ON w.user_id=vu.user_id
       LEFT JOIN wishlist_wishes ww ON ww.wish_id=w.id
       LEFT JOIN wishlists l ON l.id=ww.wishlist_id
       WHERE w.status='active' AND w.privacy<>'private'
         AND w.id NOT IN (
           SELECT secret_ww.wish_id FROM wishlist_wishes secret_ww
           JOIN wishlists secret_list ON secret_list.id=secret_ww.wishlist_id
           WHERE secret_list.privacy='private'
         )
         AND (ww.wish_id IS NULL OR l.privacy='public' OR (vu.can_view_followers AND l.privacy='followers'))
       GROUP BY vu.user_id`,
      countParameters,
    );
    for (const row of wishCountRows.rows) wishCounts.set(row.user_id, Number(row.count));
  }

  const people = result.rows.map((row) => {
    const relationship = relationships.get(row.id);
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      birthday: row.birthday,
      wishCount: wishCounts.get(row.id) || 0,
      isFollowing: relationship?.isFollowing || false,
      isFollower: relationship?.isFollower || false,
    };
  });
  people.sort(scope === "discover"
    ? (a, b) => b.wishCount - a.wishCount || a.name.localeCompare(b.name, "ru")
    : (a, b) => a.name.localeCompare(b.name, "ru"));
  res.json({ people, scope });
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "Маршрут API не найден" }));

const redirectLegacyProfile = (req, res) => res.redirect(301, legacyProfileTarget(req.params, req.originalUrl));
for (const prefix of ["u", "users"]) {
  app.get(`/${prefix}/:username`, redirectLegacyProfile);
  app.get(`/${prefix}/:username/lists/:listId`, redirectLegacyProfile);
  app.get(`/${prefix}/:username/wishes/:wishId`, redirectLegacyProfile);
}

if (isProduction) {
  const distPath = path.resolve(__dirname, "../dist");
  app.use(express.static(distPath, { maxAge: "1y", immutable: true, index: false }));
  app.get("*splat", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.use((error, req, res, _next) => {
  console.error(error);
  if (error instanceof z.ZodError) return res.status(400).json({ error: "Проверьте введённые данные" });
  if (error?.type === "entity.too.large") {
    const isPdf = req.originalUrl.startsWith("/api/health/lab-results/uploads")
      || req.originalUrl.startsWith("/api/identity/reports/")
      || req.originalUrl.startsWith("/api/career/performance/import-pdf");
    return res.status(413).json({ error: isPdf ? "PDF должен быть не больше 12 МБ" : "Изображение должно быть не больше 8 МБ" });
  }
  res.status(500).json({ error: "Внутренняя ошибка. Мы уже разбираемся." });
});

await initializeDatabase();

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Rollapp server listening on ${port}`);
});

async function shutdown() {
  server.close(async () => {
    if (backgroundTasks.size) {
      await Promise.race([
        Promise.allSettled([...backgroundTasks]),
        new Promise((resolve) => setTimeout(resolve, 20_000)),
      ]);
    }
    await pool.end();
    await vehicleCatalog.close();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

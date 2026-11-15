import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { contactMeetingNotes } from "../planning-contacts.js";
import { MetadataFetchError } from "../metadata-fetch.js";
import { createRateLimit } from "../rate-limit.js";
import { loadContactAvatar, resolveContactSocialAvatar } from "../contact-avatars.js";
import { contactAvatarPath, contactFromOverride, listContacts } from "../contacts.js";
import { isPdfBuffer, LabPdfError } from "../lab-pdf.js";
import { parsePerformanceReviewPdf } from "../performance-review-pdf.js";

export function registerCareerRoutes(app, {
  asyncRoute, contactFavoriteIds, contactForUser, contactOverrides, labPdfUploadBody, labPdfUploadRateLimit, pdfUploadFilename, requireAuth, requirePrivateSphereOwner, requireSphereReadAccess, uploadedMediaUrlPattern, withMutationLock, withSphereOwnerQuery,
}) {
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
    avatarUrl: z.union([z.literal(""), z.string().trim().regex(uploadedMediaUrlPattern)]).default(""),
    links: z.array(contactLinkSchema).max(12),
    notes: z.string().trim().max(50_000),
  }).strict();

  const contactFavoriteSchema = z.object({ favorite: z.boolean() }).strict();

  const careerSectionSchema = z.enum(["about", "cv", "performance", "development", "domain"]);

  const careerMarkdownSchema = z.string().max(200_000);

  const careerCvExperienceSchema = z.object({
    id: z.string().min(1).max(120),
    company: z.string().max(240),
    position: z.string().max(240),
    startDate: z.string().max(20),
    endDate: z.string().max(20),
    current: z.boolean(),
    description: z.string().max(20_000),
  }).strict();

  const careerCvEducationSchema = z.object({
    id: z.string().min(1).max(120),
    institution: z.string().max(500),
    faculty: z.string().max(500),
    specialization: z.string().max(500),
    graduationYear: z.string().max(20),
  }).strict();

  const careerCvStructuredSchema = z.object({
    version: z.literal(1),
    desiredPosition: z.string().max(500),
    specialization: z.string().max(500),
    city: z.string().max(240),
    salary: z.string().max(120),
    employment: z.string().max(240),
    schedule: z.string().max(240),
    about: z.string().max(20_000),
    skills: z.array(z.string().min(1).max(160)).max(100),
    experiences: z.array(careerCvExperienceSchema).max(100),
    education: z.array(careerCvEducationSchema).max(100),
    legacyMarkdown: careerMarkdownSchema,
  }).strict();

  const careerCvSchema = z.union([careerMarkdownSchema, careerCvStructuredSchema]);

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
    cv: careerCvSchema,
    development: careerMarkdownSchema,
    domain: careerMarkdownSchema,
    performance: careerPerformanceSchema,
  };

  const contactAvatarResolveRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

  app.get("/api/contacts", requireAuth, requireSphereReadAccess("career", "contacts"), asyncRoute(async (req, res) => {
    const [overrides, favoriteIds] = await Promise.all([
      contactOverrides(req.user.id),
      contactFavoriteIds(req.user.id),
    ]);
    res.set("Cache-Control", "private, no-store");
    const payload = listContacts({
      search: String(req.query.search || "").slice(0, 80),
      company: String(req.query.company || "").slice(0, 120),
      category: String(req.query.category || "").slice(0, 80),
      favoriteOnly: req.query.favorite === "true",
      order: req.query.order === "source" ? "source" : "favorites",
      page: req.query.page,
      pageSize: req.query.pageSize,
    }, overrides, favoriteIds);
    if (req.query.owner) {
      payload.contacts = payload.contacts.map((contact) => ({
        ...contact,
        avatarUrl: withSphereOwnerQuery(contact.avatarUrl, req.query.owner),
      }));
    }
    res.json(payload);
  }));

  app.post("/api/contacts/avatar/resolve", requireAuth, requirePrivateSphereOwner, contactAvatarResolveRateLimit, asyncRoute(async (req, res) => {
    const parsed = z.object({ links: z.array(contactLinkSchema).min(1).max(12) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Добавьте корректную ссылку на соцсеть" });
    try {
      const image = await resolveContactSocialAvatar(parsed.data.links);
      const id = randomUUID();
      await query(
        "INSERT INTO wish_images (id,user_id,mime_type,image_data,size_bytes) VALUES ($1,$2,$3,$4,$5)",
        [id, req.user.id, image.mimeType, image.body, image.body.length],
      );
      res.set("Cache-Control", "private, no-store");
      return res.status(201).json({ id, imageUrl: `/api/media/${id}`, source: image.source });
    } catch (error) {
      if (error instanceof MetadataFetchError) {
        return res.status(error.status || 422).json({ error: error.message, code: error.code });
      }
      throw error;
    }
  }));

  app.post("/api/contacts", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const parsed = contactUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Не удалось добавить контакт: проверьте заполнение полей и адреса ссылок" });
    const data = parsed.data;
    const contactId = randomUUID();
    const result = await query(
      `INSERT INTO contact_overrides (
         user_id,contact_id,name,company,role,category,status,avatar_url,links_json,notes,updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
       RETURNING contact_id AS "contactId",name,company,role,category,status,
                 avatar_url AS "avatarUrl",links_json AS "linksJson",notes,updated_at AS "updatedAt"`,
      [req.user.id, contactId, data.name, data.company, data.role, data.category, data.status, data.avatarUrl, JSON.stringify(data.links), data.notes],
    );
    const contact = { ...contactFromOverride(result.rows[0]), favorite: false };
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json({ contact: { ...contact, avatarSourceUrl: contact.avatarUrl, avatarUrl: contactAvatarPath(contact) } });
  }));

  app.get("/api/career/content/:section", requireAuth, requireSphereReadAccess("career", (req) => (
    req.params.section === "development" ? "development-plan" : req.params.section
  )), asyncRoute(async (req, res) => {
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

  app.get("/api/contacts/:contactId/avatar", requireAuth, requireSphereReadAccess("career", "contacts"), asyncRoute(async (req, res) => {
    const contact = await contactForUser(req.user.id, req.params.contactId);
    if (!contact || !contactAvatarPath(contact)) return res.status(404).end();
    try {
      const uploadedAvatarId = uploadedMediaUrlPattern.exec(contact.avatarUrl || "")?.[1];
      let image;
      if (uploadedAvatarId) {
        const result = await query(
          "SELECT mime_type,image_data FROM wish_images WHERE id=$1 AND user_id=$2",
          [uploadedAvatarId, req.user.id],
        );
        if (!result.rowCount) return res.status(404).end();
        image = {
          body: result.rows[0].image_data,
          mimeType: result.rows[0].mime_type,
          etag: `"${uploadedAvatarId}"`,
        };
      } else {
        image = await loadContactAvatar(contact);
      }
      const cacheControl = "private, max-age=86400, stale-while-revalidate=604800";
      if (req.get("if-none-match") === image.etag) {
        res.set("Cache-Control", cacheControl);
        return res.status(304).end();
      }
      res.set({
        "Cache-Control": cacheControl,
        "Content-Length": String(image.body.length),
        ETag: image.etag,
      });
      return res.type(image.mimeType).send(image.body);
    } catch (error) {
      if (error instanceof MetadataFetchError) return res.status(404).end();
      throw error;
    }
  }));

  app.get("/api/contacts/:contactId", requireAuth, requireSphereReadAccess("career", "contacts"), asyncRoute(async (req, res) => {
    const contact = await contactForUser(req.user.id, req.params.contactId);
    if (!contact) return res.status(404).json({ error: "Контакт не найден" });
    res.set("Cache-Control", "private, no-store");
    return res.json({ contact: {
      ...contact,
      meetingNotes: req.sphereViewer.id === req.user.id ? await contactMeetingNotes(query, req.user.id, contact.id) : [],
      avatarSourceUrl: contact.avatarUrl || "",
      avatarUrl: withSphereOwnerQuery(contactAvatarPath(contact), req.query.owner),
    } });
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
         user_id,contact_id,name,company,role,category,status,avatar_url,links_json,notes,updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
       ON CONFLICT (user_id,contact_id) DO UPDATE SET
         name=EXCLUDED.name,
         company=EXCLUDED.company,
         role=EXCLUDED.role,
         category=EXCLUDED.category,
         status=EXCLUDED.status,
         avatar_url=EXCLUDED.avatar_url,
         links_json=EXCLUDED.links_json,
         notes=EXCLUDED.notes,
         updated_at=CURRENT_TIMESTAMP
       RETURNING contact_id AS "contactId",name,company,role,category,status,
                 avatar_url AS "avatarUrl",links_json AS "linksJson",notes,updated_at AS "updatedAt"`,
      [req.user.id, source.id, data.name, data.company, data.role, data.category, data.status, data.avatarUrl, JSON.stringify(data.links), data.notes],
    );
    const contact = await contactForUser(req.user.id, source.id);
    res.set("Cache-Control", "private, no-store");
    return res.json({ contact: { ...contact, meetingNotes: await contactMeetingNotes(query, req.user.id, contact.id), avatarSourceUrl: contact.avatarUrl || "", avatarUrl: contactAvatarPath(contact) } });
  }));

  app.delete("/api/contacts/:contactId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const source = await contactForUser(req.user.id, req.params.contactId);
    if (!source) return res.status(404).json({ error: "Контакт не найден" });
    await withMutationLock(`contact:${req.user.id}:${source.id}`, () => transaction(async (client) => {
      await client.query(
        "DELETE FROM contact_favorites WHERE user_id=$1 AND contact_id=$2",
        [req.user.id, source.id],
      );
      await client.query(
        `INSERT INTO contact_overrides (
           user_id,contact_id,name,company,role,category,status,avatar_url,links_json,notes,deleted_at,updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT (user_id,contact_id) DO UPDATE SET
           deleted_at=CURRENT_TIMESTAMP,
           updated_at=CURRENT_TIMESTAMP`,
        [
          req.user.id, source.id, source.name, source.company || "", source.role || "", source.category || "",
          source.status || "", source.avatarUrl || "", JSON.stringify(source.links || []), source.notes || "",
        ],
      );
    }));
    res.set("Cache-Control", "private, no-store");
    return res.json({ deleted: true });
  }));
}

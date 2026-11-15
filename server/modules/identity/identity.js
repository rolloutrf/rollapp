import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../../db.js";
import { isPdfBuffer, LabPdfError } from "../health/lab-pdf.js";
import { generateIdentityReport, parseIdentityPdf } from "./identity-report-pdf.js";
import { identityContentSchemas, identityFourQuestionsSchema, identitySectionSchema } from "./identity-content-schema.js";

export function registerIdentityRoutes(app, {
  asyncRoute, identityReportPayload, labPdfUploadBody, labPdfUploadRateLimit, lockCustomIdentityReport, parseStoredJson, pdfUploadFilename, requireAuth, requirePrivateSphereOwner, requireSphereReadAccess,
}) {
  const customIdentityReportSectionSchema = z.string().regex(/^custom-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const identityReportSectionSchema = z.union([z.enum(["hogan", "gallup"]), customIdentityReportSectionSchema]);

  const identityReportTitleSchema = z.object({ title: z.string().trim().min(1).max(80) }).strict();

  const identityReportReadAccess = (req, res, next) => req.params.section?.startsWith("custom-")
    ? requirePrivateSphereOwner(req, res, next)
    : requireSphereReadAccess("identity", req.params.section)(req, res, next);

  app.get("/api/identity/content/:section", requireAuth, requireSphereReadAccess("identity", (req) => req.params.section), asyncRoute(async (req, res) => {
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

  // Custom tests are private to their owner; legacy Gallup/Hogan grants stay unchanged.
  app.get("/api/identity/reports", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const result = await query(
      "SELECT section,report_json::jsonb->>'title' AS title FROM identity_generated_reports WHERE user_id=$1 AND section LIKE 'custom-%' ORDER BY created_at,section", [req.user.id],
    );
    res.set("Cache-Control", "private, no-store");
    return res.json({ tests: result.rows.map(row => ({ id: row.section, title: row.title || "Тест" })) });
  }));

  app.post("/api/identity/reports", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const parsed = identityReportTitleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Введите название теста до 80 символов" });
    const id = `custom-${randomUUID()}`;
    try {
      await query("INSERT INTO identity_generated_reports (user_id,section,status,report_json) VALUES ($1,$2,'empty',$3)",
        [req.user.id, id, JSON.stringify({ title: parsed.data.title })]);
    } catch (error) {
      if (error.code === "23514") return res.status(503).json({ error: "Добавление своих тестов ещё не включено в базе данных", code: "IDENTITY_TESTS_SCHEMA_REQUIRED" });
      throw error;
    }
    return res.status(201).json({ test: { id, title: parsed.data.title } });
  }));

  app.patch("/api/identity/reports/:section", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const section = customIdentityReportSectionSchema.safeParse(req.params.section);
    const parsed = identityReportTitleSchema.safeParse(req.body);
    if (!section.success) return res.status(404).json({ error: "Тест не найден" });
    if (!parsed.success) return res.status(400).json({ error: "Введите название теста до 80 символов" });
    await transaction(async client => {
      const report = await lockCustomIdentityReport(client, req.user.id, section.data);
      await client.query("UPDATE identity_generated_reports SET report_json=$3,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND section=$2",
        [req.user.id, section.data, JSON.stringify({ ...report, title: parsed.data.title })]);
    });
    return res.json({ test: { id: section.data, title: parsed.data.title } });
  }));

  app.delete("/api/identity/reports/:section/test", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const section = customIdentityReportSectionSchema.safeParse(req.params.section);
    if (!section.success) return res.status(404).json({ error: "Тест не найден" });
    await transaction(async client => {
      await lockCustomIdentityReport(client, req.user.id, section.data);
      await client.query("DELETE FROM identity_report_uploads WHERE user_id=$1 AND section=$2", [req.user.id, section.data]);
      await client.query("DELETE FROM identity_generated_reports WHERE user_id=$1 AND section=$2", [req.user.id, section.data]);
    });
    return res.json({ deleted: true });
  }));

  app.get("/api/identity/reports/:section", requireAuth, identityReportReadAccess, asyncRoute(async (req, res) => {
    const section = identityReportSectionSchema.safeParse(req.params.section);
    if (!section.success) return res.status(404).json({ error: "Отчёт не найден" });
    const payload = await identityReportPayload(req.user.id, section.data, null, req.query.owner);
    if (section.data.startsWith("custom-") && payload.mode === "default") return res.status(404).json({ error: "Тест не найден" });
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
      const filename = pdfUploadFilename(req, section.data === "hogan" ? "Hogan" : section.data === "gallup" ? "Gallup" : "Тест");
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
          const metadata = await lockCustomIdentityReport(client, req.user.id, section.data);
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
          const report = generateIdentityReport(section.data, documents, metadata?.title);
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
      const metadata = await lockCustomIdentityReport(client, req.user.id, section.data);
      await client.query(
        "DELETE FROM identity_report_uploads WHERE user_id=$1 AND section=$2",
        [req.user.id, section.data],
      );
      await client.query(
        `INSERT INTO identity_generated_reports (user_id,section,status,report_json,updated_at)
         VALUES ($1,$2,'empty',$3,CURRENT_TIMESTAMP)
         ON CONFLICT (user_id,section) DO UPDATE SET
           status='empty',report_json=EXCLUDED.report_json,updated_at=CURRENT_TIMESTAMP`,
        [req.user.id, section.data, JSON.stringify(metadata ? { title: metadata.title } : {})],
      );
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await identityReportPayload(req.user.id, section.data));
  }));

  app.delete("/api/identity/reports/:section/files/:id", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const section = identityReportSectionSchema.safeParse(req.params.section);
    if (!section.success || !z.string().uuid().safeParse(req.params.id).success) {
      return res.status(404).json({ error: "PDF не найден" });
    }
    let missing = false;
    await transaction(async (client) => {
      const metadata = await lockCustomIdentityReport(client, req.user.id, section.data);
      const removed = await client.query(
        "DELETE FROM identity_report_uploads WHERE id=$1 AND user_id=$2 AND section=$3 RETURNING id",
        [req.params.id, req.user.id, section.data],
      );
      if (!removed.rowCount) { missing = true; return; }
      const remaining = await client.query(
        `SELECT document_json FROM identity_report_uploads
         WHERE user_id=$1 AND section=$2 ORDER BY created_at,id`,
        [req.user.id, section.data],
      );
      const documents = remaining.rows.map((row) => parseStoredJson(row.document_json)).filter(Boolean);
      const report = documents.length ? generateIdentityReport(section.data, documents, metadata?.title) : null;
      await client.query(
        `INSERT INTO identity_generated_reports (user_id,section,status,report_json,updated_at)
         VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
         ON CONFLICT (user_id,section) DO UPDATE SET
           status=EXCLUDED.status,report_json=EXCLUDED.report_json,updated_at=CURRENT_TIMESTAMP`,
        [req.user.id, section.data, report ? "generated" : "empty", JSON.stringify(report || (metadata ? { title: metadata.title } : {}))],
      );
    });
    if (missing) return res.status(404).json({ error: "PDF не найден" });
    res.set("Cache-Control", "private, no-store");
    return res.json(await identityReportPayload(req.user.id, section.data));
  }));

  app.get("/api/identity/reports/:section/files/:id/pdf", requireAuth, identityReportReadAccess, asyncRoute(async (req, res) => {
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
}

import { medicationSchema } from "../../medication-schema.js";
import { registerHealthTrackerRoutes } from "./health-trackers.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../../db.js";
import { isPdfBuffer, LabPdfError, parseLabPdf } from "./lab-pdf.js";

export function registerHealthRoutes(app, {
  asyncRoute, educationItemListMoveSchema, educationListBelongsToUser, educationListIdSchema, educationListsForUser, formatEventDate, labPdfUploadBody, labPdfUploadRateLimit, labReportKey, labResultsPayload, lockLabResultsMutation, mapUploadedLabReport, optionalEducationTimeSchema, pdfUploadFilename, requireAuth, requirePrivateSphereOwner, requireSphereReadAccess, uploadedLabReports, withMutationLock,
}) {
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

  const medicationGroupSchema = z.object({
    title: z.string().trim().min(1).max(60),
  }).strict();

  const medicationGroupMoveSchema = z.object({
    groupId: z.string().uuid().nullable(),
  }).strict();

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
      imageUrl: row.image_url || "",
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

  registerHealthTrackerRoutes(app, { query, requireAuth, requireSphereReadAccess, requirePrivateSphereOwner, asyncRoute });

  function labUploadFilename(req) {
    return pdfUploadFilename(req, "Анализы");
  }

  app.get("/api/health/workouts", requireAuth, requireSphereReadAccess("health", "sport"), asyncRoute(async (req, res) => {
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

  app.delete("/api/health/workouts/:workoutId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const result = await withMutationLock(`health-workouts:${req.user.id}`, () => query(
      "DELETE FROM health_workouts WHERE id=$1 AND user_id=$2 RETURNING id",
      [req.params.workoutId, req.user.id],
    ));
    if (!result.rowCount) return res.status(404).json({ error: "Тренировка не найдена", code: "WORKOUT_NOT_FOUND" });
    res.set("Cache-Control", "private, no-store");
    return res.json({ deleted: true, workoutId: result.rows[0].id });
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

  app.get("/api/health/medications", requireAuth, requireSphereReadAccess("health", "medications"), asyncRoute(async (req, res) => {
    const [medicationsResult, groupsResult] = await Promise.all([
      query(
        `SELECT id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,image_url,created_at,updated_at
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
    if (medication.imageUrl?.startsWith("/api/media/")) {
      const owned = await query("SELECT 1 FROM wish_images WHERE id=$1 AND user_id=$2", [medication.imageUrl.slice("/api/media/".length), req.user.id]);
      if (!owned.rowCount) return res.status(400).json({ error: "Загруженное фото не найдено" });
    }
    if (medication.groupId) {
      const group = await query(
        "SELECT 1 FROM health_medication_groups WHERE id=$1 AND user_id=$2",
        [medication.groupId, req.user.id],
      );
      if (!group.rowCount) return res.status(400).json({ error: "Выбранная группа не найдена" });
    }
    const result = await query(
      `INSERT INTO health_medications (
         id,user_id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,image_url
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,image_url,created_at,updated_at`,
      [
        randomUUID(), req.user.id, medication.groupId, medication.name, medication.medicationForm,
        medication.status, medication.dosage, medication.frequency, JSON.stringify(medication.scheduleTimes),
        medication.purpose, medication.prescriber, medication.instructions, medication.startOn || null,
        medication.endOn || null, medication.notes, medication.imageUrl || "",
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
       RETURNING id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,image_url,created_at,updated_at`,
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
    if (medication.imageUrl?.startsWith("/api/media/")) {
      const owned = await query("SELECT 1 FROM wish_images WHERE id=$1 AND user_id=$2", [medication.imageUrl.slice("/api/media/".length), req.user.id]);
      if (!owned.rowCount) return res.status(400).json({ error: "Загруженное фото не найдено" });
    }
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
         purpose=$8,prescriber=$9,instructions=$10,start_on=$11,end_on=$12,notes=$13,image_url=COALESCE($16,image_url),updated_at=CURRENT_TIMESTAMP
       WHERE id=$14 AND user_id=$15
       RETURNING id,group_id,name,medication_form,status,dosage,frequency,schedule_times_json,purpose,prescriber,instructions,start_on,end_on,notes,image_url,created_at,updated_at`,
      [
        medication.groupId, medication.name, medication.medicationForm, medication.status, medication.dosage,
        medication.frequency, JSON.stringify(medication.scheduleTimes), medication.purpose, medication.prescriber,
        medication.instructions, medication.startOn || null, medication.endOn || null, medication.notes,
        req.params.medicationId, req.user.id, medication.imageUrl ?? null,
      ],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Препарат не найден" });
    res.set("Cache-Control", "private, no-store");
    return res.json({ medication: mapHealthMedication(result.rows[0]) });
  }));

  app.get("/api/health/lab-results", requireAuth, requireSphereReadAccess("health", "lab-results"), asyncRoute(async (req, res) => {
    const payload = await labResultsPayload(req.user.id, req.query.owner);
    res.set("Cache-Control", "private, no-store");
    return res.json(payload);
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
        const inserted = await withMutationLock(`lab-results:${req.user.id}`, () => transaction(async (client) => {
          await lockLabResultsMutation(client, req.user.id);
          const result = await client.query(
            `INSERT INTO lab_report_uploads (
               id,user_id,filename,mime_type,pdf_data,size_bytes,file_hash,report_json
             ) VALUES ($1,$2,$3,'application/pdf',$4,$5,$6,$7)
             RETURNING id,filename,report_json,created_at`,
            [id, req.user.id, filename, req.body, req.body.length, fileHash, JSON.stringify(report)],
          );
          await client.query(
            "DELETE FROM lab_report_deletions WHERE user_id=$1 AND report_key=$2",
            [req.user.id, labReportKey(report)],
          );
          return {
            row: result.rows[0],
            payload: await labResultsPayload(req.user.id, "", client),
          };
        }));
        const insertedReport = mapUploadedLabReport(inserted.row);
        const mergedReport = inserted.payload.reports.find((item) => item.date === insertedReport.date) || insertedReport;
        res.set("Cache-Control", "private, no-store");
        return res.status(201).json({ report: mergedReport, ...inserted.payload });
      } catch (error) {
        if (error?.code === "23505") return res.status(409).json({ error: "Этот PDF уже загружен" });
        throw error;
      }
    }),
  );

  app.delete("/api/health/lab-results/:reportId", requireAuth, requirePrivateSphereOwner, asyncRoute(async (req, res) => {
    const outcome = await withMutationLock(`lab-results:${req.user.id}`, () => transaction(async (client) => {
      await lockLabResultsMutation(client, req.user.id);
      const currentPayload = await labResultsPayload(req.user.id, "", client);
      const report = currentPayload.reports.find((item) => item.id === req.params.reportId);
      if (!report) return null;

      const reportKey = labReportKey(report);
      const uploads = await uploadedLabReports(req.user.id, "", client);
      for (const upload of uploads) {
        if (labReportKey(upload) !== reportKey || !upload.source?.uploadId) continue;
        await client.query(
          "DELETE FROM lab_report_uploads WHERE id=$1 AND user_id=$2",
          [upload.source.uploadId, req.user.id],
        );
      }
      await client.query(
        `INSERT INTO lab_report_deletions (user_id,report_key,deleted_at)
         VALUES ($1,$2,CURRENT_TIMESTAMP)
         ON CONFLICT (user_id,report_key) DO UPDATE SET deleted_at=CURRENT_TIMESTAMP`,
        [req.user.id, reportKey],
      );
      return labResultsPayload(req.user.id, "", client);
    }));
    if (!outcome) return res.status(404).json({ error: "Анализ не найден" });
    res.set("Cache-Control", "private, no-store");
    return res.json({ ok: true, ...outcome });
  }));

  app.get("/api/health/lab-results/uploads/:id/pdf", requireAuth, requireSphereReadAccess("health", "lab-results"), asyncRoute(async (req, res) => {
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
}

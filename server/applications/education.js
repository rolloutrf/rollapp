import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { courseLogoHandler } from "../course-logo-resolver.js";
import { providerLogoHandler } from "../provider-logos.js";

export function registerEducationRoutes(app, {
  asyncRoute, courseGroupMoveSchema, courseGroupPatchSchema, detachCourseFromEducationGroup, detachEducationItemFromGroup, educationCourseGroupsForUser, educationItemGroupsForUser, educationItemListMoveSchema, educationListBelongsToUser, educationListIdSchema, educationListsForUser, formatEventDate, mapEducationList, metadataRateLimit, optionalEducationTimeSchema, requireAuth, requirePrivateSphereOwner, requireSphereReadAccess, uploadedMediaUrlPattern, withMutationLock,
}) {
  const educationUrlSchema = z.union([
    z.literal(""),
    z.string().trim().max(2_000).url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  ]);

  const optionalEducationDateSchema = z.union([z.literal(""), z.string().date()]);

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
    logoUrl: educationLogoUrlSchema,
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

  function mapEducationConference(row) {
    return {
      id: row.id,
      title: row.title,
      logoUrl: row.logo_url,
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

  app.get("/api/education/course-logo", requireAuth, metadataRateLimit, asyncRoute(courseLogoHandler));

  app.get("/api/education/provider-logos/:providerKey", asyncRoute(providerLogoHandler));

  const educationItemTables = {
    courses: "education_courses",
    conferences: "education_conferences",
    coaching: "education_coaching_sessions",
    workouts: "health_workouts",
  };

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

  app.get("/api/education/courses", requireAuth, requireSphereReadAccess("education", "courses"), asyncRoute(async (req, res) => {
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

  app.get("/api/education/conferences", requireAuth, requireSphereReadAccess("education", "conferences"), asyncRoute(async (req, res) => {
    const [result, lists, groups] = await Promise.all([query(
      `SELECT id,title,logo_url,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order,created_at,updated_at
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
        error: endsOnIssue?.message || "Проверьте название, ссылку, логотип и даты конференции",
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
         id,user_id,title,logo_url,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order
       ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE(MAX(sort_order),-1)+1
         FROM education_conferences WHERE user_id=$2 AND list_id IS NOT DISTINCT FROM $13
       RETURNING id,title,logo_url,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order,created_at,updated_at`,
      [
        randomUUID(), req.user.id, conference.title, conference.logoUrl, conference.status,
        conference.role, conference.format, conference.location, conference.url,
        conference.description, conference.startsOn || null, conference.endsOn || null, listId,
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
         RETURNING id,title,logo_url,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order,created_at,updated_at`,
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
        error: endsOnIssue?.message || "Проверьте название, ссылку, логотип и даты конференции",
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
           title=$1,logo_url=$2,status=$3,role=$4,format=$5,location=$6,url=$7,description=$8,
           starts_on=$9,ends_on=$10,list_id=$11,
           sort_order=CASE WHEN item.list_id IS DISTINCT FROM $11 THEN (
             SELECT COALESCE(MAX(other.sort_order),-1)+1
             FROM education_conferences other
             WHERE other.user_id=$13 AND other.list_id IS NOT DISTINCT FROM $11
           ) ELSE item.sort_order END,
           updated_at=CURRENT_TIMESTAMP
         WHERE item.id=$12 AND item.user_id=$13
         RETURNING id,title,logo_url,status,role,format,location,url,description,starts_on,ends_on,list_id,sort_order,created_at,updated_at`,
        [
          conference.title, conference.logoUrl, conference.status, conference.role,
          conference.format, conference.location, conference.url, conference.description,
          conference.startsOn || null, conference.endsOn || null, listId,
          req.params.conferenceId, req.user.id,
        ],
      );
      return { conference: mapEducationConference(result.rows[0]), groupChange };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.set("Cache-Control", "private, no-store");
    return res.json(outcome);
  }));

  app.get("/api/education/coaching-sessions", requireAuth, requireSphereReadAccess("education", "coaching"), asyncRoute(async (req, res) => {
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
}

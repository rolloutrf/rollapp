import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { planningPatchSchema, planningSpaceSchema, planningTaskSchema } from "./planning.js";
import { PROFILE_SPACES } from "../shared/profile-links.js";
import { RollappApiError } from "./mcp-api.js";

const id = z.string().regex(/^[a-z0-9_-]{1,100}$/i);
const pagination = {
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.number().int().min(1).max(50).default(20),
};
const searchText = z.string().trim().min(1).max(200).optional();

function page(items, { offset, limit }) {
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null,
  };
}

function matchesSearch(item, search) {
  return !search || [item.title, item.description].some((value) => value?.toLowerCase().includes(search));
}

export function createRollappMcp(api, { allowWrite = false } = {}) {
  const server = new McpServer({ name: "rollapp", version: "1.0.0" }, { maxToolInputElements: 1000 });

  function tool(name, description, inputSchema, handler, annotations = { readOnlyHint: true }) {
    server.registerTool(name, { description, inputSchema, annotations }, async (input, { mcpReq: { signal } }) => {
      const call = (endpoint, options) => api.call(endpoint, { ...options, signal });
      try {
        const result = await handler(input, call);
        return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof RollappApiError ? error.message : "Не удалось обработать ответ Rollapp.";
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    });
  }

  tool("get_service_status", "Проверить доступность API Rollapp и его подключение к базе. Вход не требуется.", z.strictObject({}),
    async (_input, call) => {
      const { ok, service, version } = await call("/api/healthz", { authenticated: false });
      if (ok !== true || service !== "rollapp") throw new RollappApiError("Ответ проверки здоровья Rollapp некорректен.");
      return { ok, service, version };
    });

  tool("get_account", "Узнать, к какому аккаунту Rollapp подключён MCP.", z.strictObject({}), async (_input, call) => {
    const { user } = await call("/api/me");
    if (!user) throw new RollappApiError("Сессия Rollapp истекла. Выполните mcp:auth -- logout, войдите снова и перезапустите MCP.");
    return { username: user.username, name: user.name, accountType: user.accountType };
  });

  tool("list_planning_spaces", "Получить ID To Do-листов, календарей или Kanban-досок своего аккаунта.",
    z.strictObject({ kind: planningSpaceSchema.shape.kind }), ({ kind }, call) => call("/api/planning/spaces", { query: { kind } }));

  tool("list_tasks", "Получить колонки и страницу задач выбранного пространства. Возвращает исходные записи повторяющихся задач. Для следующей страницы используйте nextOffset.",
    z.strictObject({
      spaceId: id.default("main"), search: searchText, completed: z.boolean().optional(),
      includeArchived: z.boolean().default(false), ...pagination,
    }),
    async ({ spaceId, search, completed, includeArchived, ...paging }, call) => {
      const { columns, tasks } = await call("/api/planning/tasks", { query: { space: spaceId } });
      const term = search?.toLowerCase();
      const filtered = tasks.filter((task) => (includeArchived || !task.archived)
        && (completed === undefined || task.completed === completed) && matchesSearch(task, term));
      return { spaceId, columns, ...page(filtered, paging) };
    });

  tool("list_wishlists", "Получить свои вишлисты. ID списка можно передать в list_wishes или create_wish.",
    z.strictObject(pagination), async (paging, call) => {
      const { lists } = await call("/api/dashboard");
      const summaries = lists.map(({ id, title, description, privacy, space, wishCount }) => ({ id, title, description, privacy, space, wishCount }));
      return page(summaries, paging);
    });

  tool("list_wishes", "Получить свои желания, включая приватные. Можно искать по названию или описанию и фильтровать по списку и статусу.",
    z.strictObject({
      listId: id.optional(), search: searchText, status: z.enum(["active", "fulfilled"]).optional(), ...pagination,
    }),
    async ({ listId, search, status, ...paging }, call) => {
      const { wishes } = await call("/api/dashboard");
      const term = search?.toLowerCase();
      const filtered = wishes.filter((wish) => (!listId || wish.listIds.includes(listId))
        && (!status || wish.status === status) && matchesSearch(wish, term));
      return page(filtered, paging);
    });

  if (!allowWrite) return server;

  const create = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };
  const update = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };

  tool("create_task", "Создать задачу. Сначала получите ID пространства и колонки через list_planning_spaces и list_tasks. Для события укажите dueOn (ГГГГ-ММ-ДД) и startTime (ЧЧ:ММ).",
    planningTaskSchema.omit({ status: true }).extend({ spaceId: id, columnId: id }).strict(),
    ({ spaceId, ...body }, call) => call("/api/planning/tasks", { method: "POST", query: { space: spaceId }, body }), create);

  tool("update_task", "Изменить выбранные поля задачи по ID. Для завершения отдельного повтора передайте в patch только occurrenceDate и completed. Архивирование обратимо.",
    z.strictObject({ spaceId: id, taskId: id, patch: planningPatchSchema }),
    ({ spaceId, taskId, patch }, call) => call(`/api/planning/tasks/${taskId}`, { method: "PATCH", query: { space: spaceId }, body: patch }), update);

  tool("create_wish", "Добавить желание. По умолчанию оно приватное. Передавайте privacy=inherit, только если нужна видимость по правилам списка.",
    z.strictObject({
      title: z.string().trim().min(1).max(160), description: z.string().max(1000).optional(),
      listIds: z.array(id).max(50).refine((ids) => new Set(ids).size === ids.length).default([]),
      space: z.enum(PROFILE_SPACES).optional(), url: z.url({ protocol: /^https?$/ }).max(2000).optional(),
      price: z.number().min(0).max(999999999).optional(), currency: z.enum(["RUB", "USD", "EUR", "KZT", "BYN"]).optional(),
      eventDate: z.iso.date().optional(), privacy: z.enum(["private", "inherit"]).default("private"),
    }),
    (body, call) => call("/api/wishes", { method: "POST", body }), create);

  tool("set_wish_fulfilled", "Установить точный статус желания по ID. fulfilled=false возвращает желание в активные.",
    z.strictObject({ wishId: id, fulfilled: z.boolean() }),
    ({ wishId, fulfilled }, call) => call(`/api/wishes/${wishId}/fulfilled`, { method: "POST", body: { fulfilled } }), update);

  return server;
}

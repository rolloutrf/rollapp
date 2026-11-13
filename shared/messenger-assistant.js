import { z } from 'zod';
import { noteTasksReview } from './assistant-note-tasks.js';
import { isPlanningDate } from './planning.js';
import { scheduleError } from './planning-calendar.js';
import { SPHERE_TABS } from './sphere-tabs.js';

export const ASSISTANT_WISH_EXAMPLE = 'Добавь кофемолку за 4 500 ₽ в список «Кухня»';
export const ASSISTANT_PRODUCT_EXAMPLE = 'Найди кофемолку на Ozon до 4500 ₽ в «Кухню»';
export const ASSISTANT_WISH_SORT_PROMPT = 'Разбери «Не отсортированные»: предложи списки для первых 10 товаров и покажи распределение перед переносом.';
export const ASSISTANT_WISH_SORT_LIMIT = 10;
export const ASSISTANT_NAME = 'Ассистент Rollapp';
export const ASSISTANT_MESSAGE_LIMIT = 4000;
// Four completed turns and the new user message.
export const ASSISTANT_CONTEXT_LIMIT = 9;

const mainSections = {
  todo: { title: 'To Do', path: '/app/planning?tab=todo' },
  calendar: { title: 'Календарь', path: '/app/planning?tab=calendar' },
  kanban: { title: 'Kanban-доска', path: '/app/planning?tab=kanban' },
  notes: { title: 'Заметки', path: '/app/planning?tab=notes' },
  wishlist: { title: 'Вишлист', path: '/app/wishes' },
  identity: { title: 'Идентичность', path: '/app/spheres/identity', private: true },
  health: { title: 'Здоровье', path: '/app/spheres/health', private: true },
  education: { title: 'Образование', path: '/app/spheres/education', private: true },
  career: { title: 'Карьера', path: '/app/spheres/career', private: true },
};

export const ASSISTANT_SECTIONS = {
  ...mainSections,
  ...Object.fromEntries(Object.entries(SPHERE_TABS).flatMap(([sphere, tabs]) => {
    const parent = mainSections[sphere];
    return tabs.map(({ id, label }) => [
      `${sphere}:${id}`,
      { title: label, path: `${parent.path}?tab=${id}`, private: parent.private },
    ]);
  })),
};

export function assistantSectionKeys(canDiscoverSpheres) {
  return Object.keys(ASSISTANT_SECTIONS).filter(key => canDiscoverSpheres === true || !ASSISTANT_SECTIONS[key].private);
}

const title = z.string().trim().min(1).max(200);
const description = z.string().trim().max(3000).default('');
const date = z.string().refine(isPlanningDate);

export const assistantWishCurrency = z.enum(['RUB', 'USD', 'EUR', 'KZT', 'BYN']);
const wishUrl = z.url({ protocol: /^https?$/ }).max(2000).refine(value => {
  if (!URL.canParse(value)) return false;
  const { username, password } = new URL(value);
  return !username && !password;
});
export const assistantWishInput = z.object({
  title: z.string().trim().max(160).default(''),
  description: z.string().trim().max(1000).default(''),
  url: wishUrl.or(z.literal('')).default(''),
  price: z.number().min(0).max(999999999).nullable().default(null),
  currency: assistantWishCurrency.default('RUB'),
  listName: z.string().trim().min(1).max(160).nullable().default(null),
}).strict();

export const assistantActionInputs = {
  open_section: z.object({ section: z.enum(Object.keys(ASSISTANT_SECTIONS)) }).strict(),
  draft_task: z.object({
    title, description, dueOn: z.string().refine(value => !value || isPlanningDate(value)).default('').describe('Дата YYYY-MM-DD, если её указал пользователь'),
  }).strict(),
  draft_event: z.object({
    title, description, dueOn: date.describe('Дата YYYY-MM-DD'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('Местное время HH:MM'),
    durationMinutes: z.number().int().min(15).max(1440),
  }).strict().refine(event => !scheduleError(event)),
  draft_wish: assistantWishInput.extend({
    imageUrl: wishUrl.or(z.literal('')).optional(),
    searchResult: z.literal(true).optional(),
  }).refine(wish => Boolean(wish.title || wish.url)),
  draft_note: z.object({ title, content: z.string().trim().min(1).max(5000) }).strict(),
};

const recordId = z.string().min(1).max(160);
const hasUniqueIds = rows => new Set(rows.map(({ id }) => id)).size === rows.length;
const wishSortReview = z.object({
  items: z.array(z.object({
    id: recordId, title, listId: recordId.nullable(),
  }).strict()).min(1).max(ASSISTANT_WISH_SORT_LIMIT).refine(hasUniqueIds),
  lists: z.array(z.object({
    id: recordId, title, privacy: z.enum(['public', 'private', 'followers', 'link']),
  }).strict()).min(1).refine(hasUniqueIds),
  hasMore: z.boolean(),
}).strict().refine(({ items, lists }) => {
  const ids = new Set(lists.map(({ id }) => id));
  return items.every(({ listId }) => listId === null || ids.has(listId));
});

export const assistantWishSortApply = z.object({
  moves: z.array(z.object({ wishId: recordId, listId: recordId }).strict())
    .min(1).max(ASSISTANT_WISH_SORT_LIMIT)
    .refine(moves => new Set(moves.map(({ wishId }) => wishId)).size === moves.length),
}).strict();

export function parseAssistantAction(type, value) {
  if (type === 'review_note_tasks') {
    const parsed = noteTasksReview.safeParse(value);
    return parsed.success ? { type, value: parsed.data } : null;
  }
  if (type === 'review_wish_sort') {
    const parsed = wishSortReview.safeParse(value);
    return parsed.success ? { type, value: parsed.data } : null;
  }
  if (typeof type !== 'string' || !Object.hasOwn(assistantActionInputs, type)) return null;
  const parsed = assistantActionInputs[type].safeParse(value);
  return parsed.success ? { type, value: parsed.data } : null;
}

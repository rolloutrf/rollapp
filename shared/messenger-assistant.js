import { z } from 'zod';
import { isPlanningDate } from './planning.js';
import { scheduleError } from './planning-calendar.js';

export const ASSISTANT_WISH_EXAMPLE = 'Добавь кофемолку за 4 500 ₽ в список «Кухня»';
export const ASSISTANT_NAME = 'Ассистент Rollapp';
export const ASSISTANT_MESSAGE_LIMIT = 4000;
// Four completed turns and the new user message.
export const ASSISTANT_CONTEXT_LIMIT = 9;

export const ASSISTANT_SECTIONS = {
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

const title = z.string().trim().min(1).max(200);
const description = z.string().trim().max(3000).default('');
const date = z.string().refine(isPlanningDate);

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
  draft_wish: z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).default(''),
    price: z.number().min(0).max(999999999).nullable().default(null),
    currency: z.enum(['RUB', 'USD', 'EUR', 'KZT', 'BYN']).default('RUB'),
    listName: z.string().trim().min(1).max(160).nullable().default(null),
  }).strict(),
  draft_note: z.object({ title, content: z.string().trim().min(1).max(5000) }).strict(),
};

export function parseAssistantAction(type, value) {
  if (typeof type !== 'string' || !Object.hasOwn(assistantActionInputs, type)) return null;
  const parsed = assistantActionInputs[type].safeParse(value);
  return parsed.success ? { type, value: parsed.data } : null;
}

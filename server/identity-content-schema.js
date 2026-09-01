import { z } from "zod";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";

export const identityValuesSchema = z.object({
  selected: z.array(z.string().trim().min(1).max(120)).max(200)
    .refine((values) => new Set(values).size === values.length),
  custom: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).default(""),
  }).strict()).max(50)
    .refine((values) => new Set(values.map((value) => value.id)).size === values.length),
}).strict();

export const identityFourQuestionsSchema = z.object({
  questions: z.array(z.object({
    title: z.string().trim().max(240).optional(),
    paragraphs: z.array(z.string().trim().min(1).max(20_000)).min(1).max(30),
  }).strict()).length(IDENTITY_QUESTION_TITLES.length),
}).strict().transform(({ questions }) => ({
  questions: questions.map(({ paragraphs }, index) => ({
    title: IDENTITY_QUESTION_TITLES[index],
    paragraphs,
  })),
}));

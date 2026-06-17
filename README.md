# RollApp

Торгово-финансовая платформа — суперапп на стыке финтеха, маркетплейса и PFM.

## Репозитории

- **[rollapp](https://github.com/rolloutrf/rollapp)** — основной монорепо (фронтенд + бэкенд)
- **[data](https://github.com/rolloutrf/data)** — спецификации, референсы, дизайн-данные

## Быстрый старт

```bash
# Клонирование
git clone https://github.com/rolloutrf/rollapp.git
cd rollapp

# Установка зависимостей
pnpm install

# Запуск dev-сервера
pnpm --filter @rollapp/web dev

# Добавление shadcn-компонента
cd apps/web
npx shadcn@latest add button
```

## Документация

- [Архитектура](docs/architecture.md) — структура монорепо, микросервисы, слои
- [Модули](docs/modules.md) — все 13 модулей с зависимостями и маппингом на shadcn/ui
- [Дизайн-система](docs/design-system.md) — Figma → shadcn/ui, токены, тематизация
- [Интеграции](docs/integrations.md) — ЕСИА, СБП, PSP, DaData и пр.
- [Пайплайн разработки](docs/pipeline.md) — фазы, порядок модулей, CI/CD
- [Стек технологий](docs/tech-stack.md) — обоснование выбора

## Стек

| Слой | Технология |
|------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Дизайн-система | shadcn/ui + Tailwind CSS v4 |
| Backend | NestJS |
| База данных | PostgreSQL + Redis + ClickHouse |
| Монорепо | Turborepo + pnpm workspaces |
| CI/CD | GitHub Actions |

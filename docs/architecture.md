# Архитектура RollApp

## Обзор

RollApp — суперапп, объединяющий финтех, маркетплейс и PFM в одном приложении.
Аналог — гибрид Т-Банка, Яндекс.Пэй и Ozon.

## Слои системы

```
┌─────────────────────────────────────────────────┐
│                  МОБИЛЬНОЕ ПРИЛОЖЕНИЕ            │
│           React Native / Capacitor               │
├─────────────────────────────────────────────────┤
│                   WEB-ФРОНТЕНД                   │
│           React 19 + Vite + TypeScript           │
│              shadcn/ui + Tailwind v4              │
│         Feature-Sliced Design (FSD)              │
├───────┬───────┬───────┬───────┬─────────────────┤
│ Auth  │ KYC   │Market │Finance│   AI             │
│ API   │ API   │  API  │  API  │  API             │
├───────┴───────┴───────┴───────┴─────────────────┤
│              API Gateway (NestJS)                │
│         REST + WebSocket + gRPC                  │
├─────────┬──────────┬──────────┬────────────────┤
│  Users  │Catalogue  │ Payments │  Analytics     │
│ Service │ Service   │ Engine   │  Service       │
├─────────┴──────────┴──────────┴────────────────┤
│  PostgreSQL  │  Redis  │  ClickHouse  │  S3     │
└─────────────────────────────────────────────────┘
```

## Структура монорепо

```
rollapp/
├── apps/
│   ├── web/                              # Vite + React 19 + shadcn/ui
│   │   ├── src/
│   │   │   ├── app/                      # Роутинг, layouts, провайдеры
│   │   │   ├── pages/                    # Экраны из Figma (по модулям)
│   │   │   │   ├── auth/                 # #1 Авторизация
│   │   │   │   ├── kyc/                  # #2 Идентификация
│   │   │   │   ├── profile/              # #3 Профиль
│   │   │   │   ├── catalogue/            # #4 Сниппеты
│   │   │   │   ├── product/              # #5 Карточка товара
│   │   │   │   ├── delivery/             # #6 Доставка
│   │   │   │   ├── payments/             # #8 Платежи
│   │   │   │   ├── checkout/             # #9 Чекаут
│   │   │   │   ├── history/              # #10 История
│   │   │   │   ├── pfm/                  # #11 PFM
│   │   │   │   ├── loyalty/              # #12 Лояльность
│   │   │   │   └── assistant/            # #13 Ассистент
│   │   │   ├── components/               # Составные компоненты страниц
│   │   │   ├── hooks/                    # Кастомные хуки
│   │   │   ├── lib/                      # Утилиты, API-клиенты
│   │   │   └── styles/
│   │   ├── components.json               # shadcn конфиг (aliases → @rollapp/ui)
│   │   └── package.json
│   │
│   └── admin/                            # Админ-панель (модерация, KYC-ревью)
│       └── ...                           # Отдельное Vite + React приложение
│
├── packages/
│   └── ui/                               # shadcn/ui монорепо-пакет
│       ├── src/
│       │   ├── components/               # shadcn-компоненты (исходный код!)
│       │   │   ├── button.tsx
│       │   │   ├── input.tsx
│       │   │   ├── card.tsx
│       │   │   ├── dialog.tsx
│       │   │   ├── sheet.tsx
│       │   │   ├── tabs.tsx
│       │   │   ├── table.tsx
│       │   │   ├── form.tsx              # React Hook Form + Zod
│       │   │   ├── command.tsx           # Поиск (Cmd+K)
│       │   │   ├── chart.tsx             # PFM-графики
│       │   │   ├── otp-input.tsx         # 2FA/SMS-коды
│       │   │   ├── carousel.tsx          # Фото в карточке товара
│       │   │   ├── progress.tsx          # Лояльность
│       │   │   └── ...                   # + кастомные компоненты RollApp
│       │   ├── hooks/
│       │   ├── lib/
│       │   │   └── utils.ts              # cn() и утилиты
│       │   └── styles/
│       │       └── globals.css           # Design tokens из Figma
│       ├── components.json
│       └── package.json                  # @rollapp/ui
│
├── services/                             # Микросервисы (NestJS)
│   ├── auth/                             # Авторизация + 2FA
│   ├── kyc/                              # Идентификация
│   ├── profile/                          # Профиль
│   ├── catalogue/                        # Сниппеты + Карточка
│   ├── delivery/                         # Доставка
│   ├── payments/                         # Платежи + Чекаут
│   ├── history/                          # История операций
│   ├── pfm/                              # PFM
│   ├── loyalty/                          # Лояльность
│   └── assistant/                        # Ассистент
│
├── infrastructure/
│   ├── docker-compose.yml
│   ├── k8s/
│   └── terraform/
│
├── docs/                                 # Документация
├── turbo.json                            # Turborepo config
├── package.json                          # Workspace root
└── .github/workflows/                    # CI/CD
```

## Принципы архитектуры

### Feature-Sliced Design (FSD)

Фронтенд следует методологии FSD с 7 слоями:

1. **app** — инициализация, роутинг, провайдеры
2. **pages** — композиционный слой (экраны из Figma)
3. **widgets** — крупные самостоятельные блоки (портфель, ордербук, дашборд)
4. **features** — бизнес-логика (торговля, депозиты, KYC-флоу)
5. **entities** — доменные сущности (User, Asset, Order, Transaction)
6. **shared** — UI Kit (shadcn/ui), типы, утилиты
7. **styles** — дизайн-токены, глобальные стили

### Микросервисы

Каждый сервис — независимый NestJS-модуль:

- Своя база данных (database-per-service)
- Свой Dockerfile
- Коммуникация через API Gateway
- Асинхронные события через Redis Pub/Sub

### API Gateway

Единая точка входа для фронтенда:

- REST для CRUD-операций
- WebSocket для real-time (котировки, статусы заказов)
- gRPC для межсервисной коммуникации
- Rate limiting, авторизация, логирование

## Базы данных

| БД | Назначение | Данные |
|----|-----------|--------|
| **PostgreSQL** | Основная | Пользователи, ордера, транзакции, настройки |
| **Redis** | Кэш + real-time | Сессии, котировки, rate limiting, pub/sub |
| **ClickHouse** | Аналитика | История сделок, агрегации, PFM-отчёты |
| **S3** | Файлы | Фото товаров, документы KYC, чеки |

## Безопасность

- **PCI DSS** — обработка карточных данных (через PSP)
- **115-ФЗ** — KYC/AML через модуль идентификации
- **3DS 2.0** — аутентификация карточных платежей
- **JWT + Refresh** — авторизация с ротацией токенов
- **2FA** — SMS, TOTP, биометрия
- **Шифрование** — TLS 1.3, шифрование PII at rest

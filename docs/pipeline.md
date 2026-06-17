# Пайплайн разработки RollApp

## Фазы

| Фаза | Недели | Что | Модули | Результат |
|------|--------|-----|--------|-----------|
| **0. Фундамент** | 1–2 | Монорепо, shadcn/ui, CI/CD, auth service | — | Рабочий scaffold с UI Kit |
| **1. Ядро** | 3–6 | Авторизация + 2FA + KYC + Профиль | 1, 2, 3, 7 | Пользователь может зарегистрироваться и пройти идентификацию |
| **2. Платежи** | 7–10 | Платежи + Чекаут + История | 8, 9, 10 | Пользователь может совершать платежи и видеть историю |
| **3. Маркетплейс** | 11–14 | Сниппеты + Карточка + Доставка | 4, 5, 6 | Полный цикл покупки товара |
| **4. Ценность** | 15–18 | PFM + Лояльность | 11, 12 | Финансовый менеджмент и программа лояльности |
| **5. AI** | 19–20 | Ассистент | 13 | AI-помощник |

## Порядок разработки модулей

```
Фаза 0:  Фундамент (монорепо + UI Kit + CI/CD)
            │
Фаза 1:  1. Авторизация ──► 7. 2FA ──► 2. KYC ──► 3. Профиль
            │
Фаза 2:  8. Платежи ──► 9. Чекаут ──► 10. История
            │
Фаза 3:  5. Карточка ──► 4. Сниппеты ──► 6. Доставка
            │
Фаза 4:  11. PFM ──► 12. Лояльность
            │
Фаза 5:  13. Ассистент
```

## Шаги Фазы 0 (Фундамент)

### День 1: Инициализация

```bash
# Создание монорепо с shadcn/ui
cd rollapp
npx shadcn@latest init --monorepo

# Это создаст:
# - apps/web/        (Vite + React + TypeScript)
# - packages/ui/     (shadcn/ui компоненты)
# - turbo.json       (Turborepo)
# - package.json     (pnpm workspace)
```

### День 2: Базовые компоненты

```bash
cd apps/web

# Добавляем все базовые shadcn-компоненты
npx shadcn@latest add button input card form label dialog sheet tabs \
  table badge avatar select separator progress radio-group checkbox \
  carousel accordion calendar command chart toast sonner dropdown-menu \
  popover tooltip skeleton scroll-area switch textarea sidebar
```

### День 3: Токены из Figma

1. Открыть Figma-файл Авторизации
2. Извлечь цвета, типографику, отступы, радиусы
3. Записать в `packages/ui/src/styles/globals.css`
4. Проверить Light/Dark тему

### День 4–5: Роутинг и лейауты

```bash
# Установка React Router
pnpm --filter @rollapp/web add react-router-dom

# Создание структуры страниц
apps/web/src/pages/
├── auth/
├── kyc/
├── profile/
├── catalogue/
├── product/
├── delivery/
├── payments/
├── checkout/
├── history/
├── pfm/
├── loyalty/
└── assistant/
```

### День 6–7: CI/CD

- GitHub Actions: lint, type-check, build, test
- Preview-deploy на Vercel для каждого PR
- Turbo cache для ускорения сборок

## Шаги Фазы 1 (Ядро)

### Неделя 3: Авторизация (#1)

1. Анализ Figma: `QsetmskH8yfvRAfVHkh6Qx`
2. Страницы: /login, /register, /forgot-password
3. Компоненты: LoginForm, RegisterForm, PhoneInput, SocialAuthButtons
4. Auth service (NestJS): JWT + refresh tokens
5. Интеграция: SMS-провайдер для кодов

### Неделя 4: 2FA (#7)

1. Анализ Figma: `i5N2gOA3nm1rDbAh3xetZm`
2. Компоненты: OTPCodeInput, BiometricPrompt
3. Auth service: TOTP, SMS-верификация
4. Экраны: /2fa/setup, /2fa/verify

### Неделя 5–6: KYC (#2) + Профиль (#3)

1. Анализ Figma: `280Q1uFPAIc2vlXkxW3oEF`, `cnpHlpnL2cvrJOiKVpgxef`
2. KYC: Stepper-форма, DocumentScanner, LivenessCheck
3. Профиль: PersonalDataCard, DeviceList, настройки
4. KYC service: интеграция с ЕСИА, МВД, SumSub

## Критерии готовности фазы

### Фаза 0
- [ ] Монорепо работает (`pnpm dev` запускает приложение)
- [ ] shadcn/ui компоненты рендерятся корректно
- [ ] Light/Dark тема переключается
- [ ] CI/CD настроен (lint + build проходят)

### Фаза 1
- [ ] Регистрация и логин работают
- [ ] 2FA подключается и верифицируется
- [ ] KYC-флоу проходится (упрощённый вариант)
- [ ] Профиль отображает данные пользователя

### Фаза 2
- [ ] Перевод по номеру телефона (СБП) работает
- [ ] Чекаут проходит полный цикл
- [ ] История операций отображается с фильтрами

### Фаза 3
- [ ] Каталог товаров с сниппетами
- [ ] Карточка товара (B2C + B2B)
- [ ] Выбор доставки и трекинг

### Фаза 4
- [ ] PFM-дашборд с категориями расходов
- [ ] Программа лояльности начисляет и списывает баллы

### Фаза 5
- [ ] Чат-бот ассистент отвечает на вопросы
- [ ] Ассистент может инициировать действия (перевод, поиск)

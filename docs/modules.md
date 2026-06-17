# Модули RollApp

## Обзор

13 модулей, каждый привязан к Figma-дизайну и спецификации из [data-репо](https://github.com/rolloutrf/data).

## Карта модулей

| # | Модуль | Тип | Зависимости | Сложность | Figma Key |
|---|--------|-----|-------------|-----------|-----------|
| 1 | Авторизация | Ядро | — | 🔴 Критический | `QsetmskH8yfvRAfVHkh6Qx` |
| 2 | Идентификация (KYC) | Регулятор | 1, 7 | 🔴 Критический (115-ФЗ) | `280Q1uFPAIc2vlXkxW3oEF` |
| 3 | Профиль | Ядро | 1, 2 | 🟡 Средний | `cnpHlpnL2cvrJOiKVpgxef` |
| 4 | Сниппеты (Выдача) | Маркетплейс | 3, 5 | 🟡 Средний | `Zy2zp3A6V5RHH8OQxt19Ow` |
| 5 | Карточка товара | Маркетплейс | 4, 8, 9 | 🔴 Сложный (B2C+B2B) | `eiItTzL0Q2QFL5S8XQXFui` |
| 6 | Доставка | Логистика | 9 | 🟡 Средний | `v5UoHLSS3oHElCwNmFotbX` |
| 7 | 2FA | Безопасность | 1 | 🟠 Высокий | `i5N2gOA3nm1rDbAh3xetZm` |
| 8 | Платежи и переводы | Финтех | 2, 7 | 🔴 Критический (PCI DSS) | `lFStWbzXTPoZakCmgx8WwX` |
| 9 | Чекаут | Финтех+Маркетплейс | 5, 6, 8 | 🔴 Самый сложный | `KCJnS3En5PmD1OZiD2YTgh` |
| 10 | История операций | Финтех | 8 | 🟡 Средний | `uad8M5o2dUSroXC6xy69Qm` |
| 11 | PFM | Финтех | 10, 12 | 🟠 Высокий | `15POc9NeuomGvfevDLpKdU` |
| 12 | Лояльность | Маркетинг | 8, 9 | 🟠 Высокий | TBD |
| 13 | Ассистент | AI | Все | 🟢 MVP = чат-бот | TBD |

## Детали по модулям

### 1. Авторизация

**Figma UI:** https://www.figma.com/design/QsetmskH8yfvRAfVHkh6Qx/1.-Auth
**Figma Map:** https://www.figma.com/board/tBQqLNr3pcw8RT6Yl04kmN/1.-AuthMap
**Figma Ref:** https://www.figma.com/board/Ir9EIcONP5LB5axN1HMrnF/1.-AuthRef

**Функционал:**
- Вход по телефону + SMS-код
- OAuth (Госуслуги/ЕСИА, Google, Apple)
- Регистрация нового пользователя
- Восстановление доступа
- Управление сессиями

**shadcn-компоненты:** `Form`, `Input`, `Button`, `Label`, `Card`
**Кастомные:** `PhoneInput`, `SocialAuthButtons`

---

### 2. Идентификация (KYC)

**Figma UI:** https://www.figma.com/design/280Q1uFPAIc2vlXkxW3oEF/2.-ID
**Figma Map:** https://www.figma.com/board/CXmKWRGKM9WFBeRVehRbat/2.-IDMap
**Figma Ref:** https://www.figma.com/board/aFLUcoeMzt6jyvReVpHbBf/2.-IDMapRef

**Типы идентификации:**

| Тип | Данные | Лимиты | Срок |
|-----|--------|--------|------|
| Упрощённая | ФИО, паспорт (серия+номер) | Переводы до 100 000 ₽ | TBD |
| Полная | Полные паспортные, ИНН, СНИЛС, контакты | Без ограничений | Обновление раз в год |
| Биометрическая | TBD | TBD | TBD |

**Интеграции:** ЕСИА, ЕБС, МВД, ФНС, Росфинмониторинг

**shadcn-компоненты:** `Form`, `Input`, `Select`, `Stepper`, `Dialog`
**Кастомные:** `DocumentScanner`, `LivenessCheck`

---

### 3. Профиль

**Figma UI:** https://www.figma.com/design/cnpHlpnL2cvrJOiKVpgxef/3.-Profile
**Figma Map:** https://www.figma.com/board/mMisAzTb1D6mwV9Sj6mWD3/3.-ProfileMap
**Figma Ref:** https://www.figma.com/board/fuIRMgFQrM2UxB4XQ42YtJ/3.-ProfileRef

**shadcn-компоненты:** `Tabs`, `Avatar`, `Switch`, `Separator`
**Кастомные:** `PersonalDataCard`, `DeviceList`

---

### 4. Сниппеты (Выдача)

**Figma UI:** https://www.figma.com/design/Zy2zp3A6V5RHH8OQxt19Ow/4.-Snippets
**Figma Map:** https://www.figma.com/board/ve48Ox1uBlGMbNlo0pLlop/4.-SnippetsMap
**Figma Ref:** https://www.figma.com/board/uLOTG7i3pl7uM4oHZl1OTs/4.-SnippetsRefs

**Контент-модель сниппета:**

```
title: string              — название товара
heroImage: URL             — основное изображение
price: number              — текущая цена
priceOld: number?          — старая цена (для скидок)
priceByPaymentMethod       — цена при спец. условиях
installment               — рассрочка
availability               — наличие
deliveryEta                — срок доставки
deliveryFee                — стоимость доставки
rating: number             — рейтинг
ratingCount: number        — число отзывов
badges: Badge[]            — бейджи (sale, new, hit...)
brand: string              — бренд
variantSwatches            — визуальные варианты
location                   — регион продавца
merchantTrust              — статус продавца
loyalty                    — баллы/кэшбэк
```

**B2B-поля:** `moq`, `orderIncrement`, `packagingUnit`, `packSize`, `leadTimeDays`, `tierPricing[]`, `requestQuoteCta`

**shadcn-компоненты:** `Card`, `Badge`, `Button`, `Carousel`
**Кастомные:** `ProductSnippet`, `B2BSnippet` (MOQ, tier pricing)

---

### 5. Карточка товара

**Figma UI:** https://www.figma.com/design/eiItTzL0Q2QFL5S8XQXFui/5.-ItemCard
**Figma Map:** https://www.figma.com/board/42NxolU9LH9FLD1QAlSjc3/5.-ItemCardMap
**Figma Ref:** https://www.figma.com/board/qdueXaVlDIisdO29Lxr0Od/5.-ItemRef

**Различия B2C / B2B:**

| Компонент | B2C | B2B |
|-----------|-----|-----|
| Объём заказа | 1–5 шт | Коробки, паллеты |
| Ценообразование | Фиксированная | Tier pricing по объёму |
| CTA | «Купить», «В корзину» | «Запросить счёт», «Скачать КП» |
| Документы | Необязательны | УПД, сертификаты, декларации |
| Оплата | Онлайн, карта | Счёт, отсрочка, договор |

**shadcn-компоненты:** `Tabs`, `Carousel`, `Table`, `Badge`, `Sheet`
**Кастомные:** `TierPricingTable`, `B2BActions`, `ReviewSection`

---

### 6. Доставка

**Figma UI:** https://www.figma.com/design/v5UoHLSS3oHElCwNmFotbX/6.-Delivery
**Figma Map:** https://www.figma.com/board/iyIZh6snI2G3GglHpU3R9t/6.-DeliveryMap
**Figma Ref:** https://www.figma.com/board/NIeNkRQp0tR4g28R2EUPPO/6.-DeliveryRef

**shadcn-компоненты:** `RadioGroup`, `Calendar`, `Card`
**Кастомные:** `DeliveryMap`, `PVZSelector`, `TrackingTimeline`

---

### 7. 2FA

**Figma UI:** https://www.figma.com/design/i5N2gOA3nm1rDbAh3xetZm/7.-2FA
**Figma Map:** https://www.figma.com/board/zS2l1NHFaKohZHDkxnWLLW/7.-2FAMap
**Figma Ref:** https://www.figma.com/board/8kzZXd0JWXjG95d5lLLR3R/7.-2FARef

**Методы 2FA:**
- SMS-код
- TOTP (Google Authenticator / Authy)
- Биометрия (отпечаток, Face ID)
- Аппаратный токен

**shadcn-компоненты:** `Input` (OTP), `Dialog`, `Button`
**Кастомные:** `OTPCodeInput`, `BiometricPrompt`

---

### 8. Платежи и переводы

**Figma UI:** https://www.figma.com/design/lFStWbzXTPoZakCmgx8WwX/8.-Payments
**Figma Map:** https://www.figma.com/board/2NlQDW4DLAHFBXDpkDK8jp/8.-PaymentsMap
**Figma Ref:** https://www.figma.com/board/8Xv25XL0qXKtceFoKyJvS1/8.-PaymentsRefs

**Типология:**
- **C2C** — перевод физлицу
- **Me2Me** — между своими счетами
- **C2B** — оплата бизнесу
- **B2C** — выплата от бизнеса
- **B2B** — между компаниями

**Платёжные методы:**
- Банковские карты (Мир, через НСПК)
- СБП (по номеру телефона)
- Электронные кошельки
- BNPL / рассрочка
- B2B: счёт на оплату, инвойс

**Лимиты СБП:**
- До 100 000 ₽/мес — бесплатно
- Далее 0.5%, макс 1 500 ₽/операция
- Макс 1 000 000 ₽/операция
- Me2Me — до 30 000 000 ₽/мес

**shadcn-компоненты:** `Form`, `Input`, `Select`, `Dialog`
**Кастомные:** `CardNumberInput`, `SBPButton`, `AmountInput`

---

### 9. Чекаут

**Figma UI:** https://www.figma.com/design/KCJnS3En5PmD1OZiD2YTgh/9.-Checkout
**Figma Map:** https://www.figma.com/board/78bapCsb8AkZpwXH2Ij9cJ/9.-CheckoutMap
**Figma Ref:** https://www.figma.com/board/lnnCRhzeiN2SFRXd45iDeE/9.-CheckoutRefs

**CJM чекаута:**
1. Обзор заказа (состав, промокод, доставка)
2. Аутентификация / guest-checkout
3. Контактные данные + адрес (DaData/FIAS)
4. Выбор способа оплаты
5. Подтверждение и авторизация платежа (3DS)
6. Пост-чекаут (подтверждение, трекинг)

**Области применения:**
- E-commerce B2C
- B2C-маркетплейс (split-payment)
- C2C маркетплейс (escrow)
- B2B-маркетплейс (инвойс)
- P2P-переводы
- Подписки / SaaS

**shadcn-компоненты:** `Sheet`, `RadioGroup`, `Checkbox`, `Button`
**Кастомные:** `OrderSummary`, `PaymentMethodGrid`, `SplitPayment`

---

### 10. История операций

**Figma UI:** https://www.figma.com/design/uad8M5o2dUSroXC6xy69Qm/10.-History
**Figma Map:** https://www.figma.com/board/oUNnhjfwxK6znPiv1sj7iK/10.-HistoryMap
**Figma Ref:** https://www.figma.com/board/fyhINScJru5hccMhXiQUQM/10.-HistoryRef

**B2C:**
- Агрегация и нормализация транзакций
- Категоризация (MCC → человекочитаемые)
- Фильтры: дата, мерчант, тип, статус, сумма
- Визуализация расходов/доходов
- Экспорт чеков и отчётов

**B2B:**
- Входящие/исходящие поступления
- Выручка, сальдо
- Аналитика по клиентам
- ДДС, акт сверки

**shadcn-компоненты:** `Table`, `Input`, `Select`, `Tabs`, `Badge`
**Кастомные:** `TransactionList`, `FilterPanel`, `ExportButton`

---

### 11. PFM (Personal Financial Management)

**Figma UI:** https://www.figma.com/design/15POc9NeuomGvfevDLpKdU/11.-PFM
**Figma Map:** https://www.figma.com/board/dbhXz6lAzQ61yWal9mLGAe/11.-PFMMap
**Figma Ref:** https://www.figma.com/board/Hz3Nh0wTPpp4c5agGSuyuW/11.-PFMRefs

**Функционал:**
- Агрегация расходов/доходов
- Категоризация и визуализация
- Бюджеты и лимиты
- Прогнозирование (Prophet, LSTM, ARIMA)
- Рекомендации

**shadcn-компоненты:** `Card`, `Chart`, `Tabs`, `Progress`
**Кастомные:** `SpendingChart`, `BudgetTracker`, `ForecastWidget`

---

### 12. Лояльность

**Figma:** TBD

**Инструменты:**

| Инструмент | Цель | Механика |
|------------|------|----------|
| Бонусы | Долгосрочное удержание | Накопительная система, уровни |
| Скидки | Разовая стимуляция | Мгновенная выгода |
| Кэшбэк ₽ | Постоянная стимуляция | Компенсация после сделки |
| Партнёрки | Кросс-продажи | Конвертация баллов |
| Геймификация | Вовлечение | Челленджи, бейджи, лидерборды |

**shadcn-компоненты:** `Card`, `Progress`, `Badge`, `Button`
**Кастомные:** `PointsBalance`, `LoyaltyTiers`, `GamificationWheel`

---

### 13. Ассистент

**Figma:** TBD

**MVP:** AI-чат-бот с доступом к контексту пользователя (профиль, история, PFM).
**V2:** Проактивные рекомендации, голосовой ввод, действия от имени пользователя.

**shadcn-компоненты:** `Sheet`, `Input`, `Button`, `Avatar`
**Кастомные:** `ChatWindow`, `MessageBubble`, `QuickActions`

## Зависимости между модулями

```
                    ┌──────────┐
                    │ 1. Auth  │
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐ ┌────────┐ ┌────────┐
        │ 7. 2FA   │ │ 2. KYC │ │3.Профиль│
        └──────────┘ └────┬───┘ └────┬───┘
                          │          │
                    ┌─────┴──────────┘
                    ▼
              ┌───────────┐
              │ 8. Платежи │◄──────────────┐
              └──┬───┬────┘               │
                 │   │                    │
        ┌────────┘   └────────┐          │
        ▼                     ▼          │
  ┌──────────┐        ┌──────────┐      │
  │10.История│        │ 9.Чекаут │      │
  └────┬─────┘        └──┬───┬──┘      │
       │                 │   │          │
       ▼                 │   ▼          │
  ┌────────┐             │ ┌────────┐  │
  │11. PFM │             │ │6.Дост-а│  │
  └───┬────┘             │ └────────┘  │
      │                  │              │
      ▼                  ▼              │
  ┌────────┐     ┌──────────────┐      │
  │12.Лоя- │     │5.Карточка    │      │
  │льность │     │товара        │──────┘
  └────────┘     └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │4.Сниппеты    │
                 └──────────────┘

  ┌──────────────┐
  │13.Ассистент  │ ← зависит от всех модулей
  └──────────────┘
```

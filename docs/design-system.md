# Дизайн-система RollApp

## shadcn/ui как основа

RollApp использует [shadcn/ui](https://ui.shadcn.com/) как дизайн-систему.

**Почему shadcn/ui:**
- **Open Code** — полный контроль над кодом компонентов, кастомизация под финтех
- **AI-Ready** — LLM может читать, понимать и генерировать компоненты
- **Монорепо из коробки** — встроенная поддержка `--monorepo` с Turborepo
- **Tailwind CSS v4** — дизайн-токены из Figma → CSS Variables
- **Radix UI** — доступность (a11y) из коробки
- **Composition** — предсказуемый API для всех компонентов

## Пайплайн: Figma → Код

```
Figma Design
     │
     ├──→ Design Tokens (цвета, типографика, отступы, радиусы)
     │         │
     │         ▼
     │    globals.css (CSS Variables)
     │         │
     │         ▼
     │    Tailwind v4 @theme
     │
     ├──→ UI Components (кнопки, инпуты, карточки)
     │         │
     │         ▼
     │    npx shadcn add button input card ...
     │         │
     │         ▼
     │    packages/ui/src/components/ (исходный код)
     │
     ├──→ Custom Components (OTP-input, PhoneInput, TierPricingTable)
     │         │
     │         ▼
     │    packages/ui/src/components/ (кастомные поверх shadcn)
     │
     └──→ Page Layouts (экраны)
              │
              ▼
         apps/web/src/pages/ (композиция из компонентов)
```

## Figma → CSS Variables

shadcn/ui использует HSL-переменные. Токены из Figma маппятся в `globals.css`:

```css
/* packages/ui/src/styles/globals.css */
@import "tailwindcss";

@theme inline {
  /* Цвета из Figma → CSS Variables */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  /* Типографика из Figma */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* Радиусы из Figma */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}

:root {
  /* Light theme — значения из Figma */
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 222 47% 50%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --accent: 210 40% 96%;
  --accent-foreground: 222 47% 11%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 210 40% 98%;
  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 222 47% 50%;
  --chart-1: 222 47% 50%;
  --chart-2: 160 60% 45%;
  --chart-3: 30 80% 55%;
  --chart-4: 280 65% 60%;
  --chart-5: 340 75% 55%;
}

.dark {
  /* Dark theme — значения из Figma */
  --background: 222 47% 6%;
  --foreground: 210 40% 98%;
  --primary: 217 91% 60%;
  --primary-foreground: 222 47% 6%;
  --secondary: 217 33% 17%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 65%;
  --accent: 217 33% 17%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 63% 31%;
  --destructive-foreground: 210 40% 98%;
  --border: 217 33% 17%;
  --input: 217 33% 17%;
  --ring: 217 91% 60%;
  --chart-1: 217 91% 60%;
  --chart-2: 160 60% 45%;
  --chart-3: 30 80% 55%;
  --chart-4: 280 65% 60%;
  --chart-5: 340 75% 55%;
}
```

> ⚠️ Значения выше — примерные. После анализа Figma-файлов будут обновлены на реальные токены из дизайна.

## Компоненты shadcn/ui по модулям

| Модуль | shadcn-компоненты | Кастомные поверх shadcn |
|--------|-------------------|------------------------|
| 1. Авторизация | `Form`, `Input`, `Button`, `Label`, `Card` | `PhoneInput`, `SocialAuthButtons` |
| 2. KYC | `Form`, `Input`, `Select`, `Stepper`, `Dialog` | `DocumentScanner`, `LivenessCheck` |
| 3. Профиль | `Tabs`, `Avatar`, `Switch`, `Separator` | `PersonalDataCard`, `DeviceList` |
| 4. Сниппеты | `Card`, `Badge`, `Button`, `Carousel` | `ProductSnippet`, `B2BSnippet` |
| 5. Карточка товара | `Tabs`, `Carousel`, `Table`, `Badge`, `Sheet` | `TierPricingTable`, `B2BActions`, `ReviewSection` |
| 6. Доставка | `RadioGroup`, `Calendar`, `Card` | `DeliveryMap`, `PVZSelector`, `TrackingTimeline` |
| 7. 2FA | `Input` (OTP), `Dialog`, `Button` | `OTPCodeInput`, `BiometricPrompt` |
| 8. Платежи | `Form`, `Input`, `Select`, `Dialog` | `CardNumberInput`, `SBPButton`, `AmountInput` |
| 9. Чекаут | `Sheet`, `RadioGroup`, `Checkbox`, `Button` | `OrderSummary`, `PaymentMethodGrid`, `SplitPayment` |
| 10. История | `Table`, `Input`, `Select`, `Tabs`, `Badge` | `TransactionList`, `FilterPanel`, `ExportButton` |
| 11. PFM | `Card`, `Chart`, `Tabs`, `Progress` | `SpendingChart`, `BudgetTracker`, `ForecastWidget` |
| 12. Лояльность | `Card`, `Progress`, `Badge`, `Button` | `PointsBalance`, `LoyaltyTiers`, `GamificationWheel` |
| 13. Ассистент | `Sheet`, `Input`, `Button`, `Avatar` | `ChatWindow`, `MessageBubble`, `QuickActions` |

## Установка компонентов

```bash
# Базовые (установить при инициализации)
cd apps/web
npx shadcn@latest add button input card form label dialog sheet tabs table badge \
  avatar select separator progress radio-group checkbox carousel accordion \
  calendar command otp-input chart toast sonner dropdown-menu popover tooltip \
  skeleton scroll-area switch textarea

# По мере разработки модулей
npx shadcn@latest add sidebar    # Для навигации
npx shadcn@latest add data-table # Для истории операций (B2B)
npx shadcn@latest add login-01   # Блок формы логина
```

## Тематизация

RollApp поддерживает:

1. **Light / Dark** — через CSS Variables (`.dark` class)
2. **Brand colors** — при необходимости мультибрендовости
3. **Адаптивность** — mobile-first, breakpoints из Tailwind

### Переключатель темы

```tsx
import { useTheme } from "@rollapp/ui/hooks/use-theme"

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}
```

## Кастомные компоненты RollApp

Компоненты, которых нет в shadcn/ui, создаются поверх Radix UI + Tailwind по тем же принципам:

- Open code (исходный код в `packages/ui/src/components/`)
- Composable API
- CSS Variables для стилизации
- Accessibility из коробки

### Приоритет создания кастомных компонентов

1. `PhoneInput` — маска телефона (+7 ___ ___-__-__)
2. `OTPCodeInput` — 6-значный код для 2FA/SMS
3. `CardNumberInput` — маска номера карты с определением BIN
4. `AmountInput` — ввод суммы с форматированием
5. `TierPricingTable` — таблица цен по объёмам (B2B)
6. `ProductSnippet` — карточка товара в выдаче
7. `TransactionList` — список транзакций с группировкой по дате
8. `SpendingChart` — круговая/столбчатая диаграмма расходов
9. `PVZSelector` — выбор пункта выдачи на карте
10. `ChatWindow` — окно чата с ассистентом

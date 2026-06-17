import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rollapp/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rollapp/ui/components/tabs"
import { Progress } from "@rollapp/ui/components/progress"
import { Badge } from "@rollapp/ui/components/badge"
import { Button } from "@rollapp/ui/components/button"
import {
  TrendingDown, TrendingUp, Wallet, Target, PiggyBank,
  ShoppingBag, Zap, Home, Car, Heart, GraduationCap, Plane,
} from "lucide-react"

/* Мок-данные PFM */
const totalExpense = 87420
const totalIncome = 125000
const savings = totalIncome - totalExpense

const spendingByCategory = [
  { category: "Покупки", icon: ShoppingBag, amount: 24990, budget: 30000, color: "text-blue-500" },
  { category: "Подписки", icon: Zap, amount: 3490, budget: 5000, color: "text-purple-500" },
  { category: "ЖКХ", icon: Home, amount: 12840, budget: 15000, color: "text-orange-500" },
  { category: "Транспорт", icon: Car, amount: 8900, budget: 12000, color: "text-green-500" },
  { category: "Здоровье", icon: Heart, amount: 5600, budget: 8000, color: "text-red-500" },
  { category: "Образование", icon: GraduationCap, amount: 12000, budget: 15000, color: "text-indigo-500" },
  { category: "Путешествия", icon: Plane, amount: 19600, budget: 20000, color: "text-cyan-500" },
]

const monthlyTrend = [
  { month: "Янв", expense: 72000, income: 110000 },
  { month: "Фев", expense: 68500, income: 110000 },
  { month: "Мар", expense: 81200, income: 115000 },
  { month: "Апр", expense: 76800, income: 120000 },
  { month: "Май", expense: 92300, income: 122000 },
  { month: "Июн", expense: 87420, income: 125000 },
]

const budgets = [
  { name: "Покупки", spent: 24990, limit: 30000 },
  { name: "Кафе и рестораны", spent: 8200, limit: 10000 },
  { name: "Развлечения", spent: 6700, limit: 7000 },
]

export function PfmPage() {
  const savingsRate = Math.round((savings / totalIncome) * 100)
  const maxTrend = Math.max(...monthlyTrend.map(t => Math.max(t.expense, t.income)))

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">PFM</h1>
        <p className="text-sm text-muted-foreground">Управление финансами</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full">
          <TabsTrigger value="overview" className="flex-1">Обзор</TabsTrigger>
          <TabsTrigger value="categories" className="flex-1">Категории</TabsTrigger>
          <TabsTrigger value="budgets" className="flex-1">Бюджеты</TabsTrigger>
        </TabsList>

        {/* ─── Обзор ─── */}
        <TabsContent value="overview" className="mt-4 flex flex-col gap-4">
          {/* Сводка */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <TrendingDown className="mx-auto mb-1 h-4 w-4 text-destructive" />
                <p className="text-xs text-muted-foreground">Расходы</p>
                <p className="text-sm font-bold">{totalExpense.toLocaleString("ru")} ₽</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <TrendingUp className="mx-auto mb-1 h-4 w-4 text-green-600" />
                <p className="text-xs text-muted-foreground">Доходы</p>
                <p className="text-sm font-bold text-green-600">{totalIncome.toLocaleString("ru")} ₽</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <PiggyBank className="mx-auto mb-1 h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Накопления</p>
                <p className="text-sm font-bold text-primary">{savingsRate}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Тренд за полгода — бар-чарт на чистом CSS */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Тренд за 6 месяцев</CardTitle>
              <CardDescription className="text-xs">Расходы vs Доходы</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {monthlyTrend.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full gap-0.5 items-end h-24">
                      <div
                        className="flex-1 bg-red-200 dark:bg-red-900/40 rounded-t"
                        style={{ height: `${(m.expense / maxTrend) * 100}%` }}
                        title={`Расходы: ${m.expense.toLocaleString("ru")} ₽`}
                      />
                      <div
                        className="flex-1 bg-green-200 dark:bg-green-900/40 rounded-t"
                        style={{ height: `${(m.income / maxTrend) * 100}%` }}
                        title={`Доходы: ${m.income.toLocaleString("ru")} ₽`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.month}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-200 dark:bg-red-900/40" /> Расходы
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-200 dark:bg-green-900/40" /> Доходы
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Топ категории */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Топ расходов</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {spendingByCategory.slice(0, 4).map((cat) => (
                  <div key={cat.category} className="flex items-center gap-3">
                    <cat.icon className={`h-4 w-4 ${cat.color}`} />
                    <span className="flex-1 text-sm">{cat.category}</span>
                    <span className="text-sm font-medium">{cat.amount.toLocaleString("ru")} ₽</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Категории ─── */}
        <TabsContent value="categories" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Расходы по категориям</CardTitle>
              <CardDescription className="text-xs">Июнь 2026</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {spendingByCategory.map((cat) => {
                  const pct = Math.round((cat.amount / cat.budget) * 100)
                  const over = cat.amount > cat.budget
                  return (
                    <div key={cat.category} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <cat.icon className={`h-4 w-4 ${cat.color}`} />
                        <span className="flex-1 text-sm font-medium">{cat.category}</span>
                        <span className="text-sm">{cat.amount.toLocaleString("ru")} ₽</span>
                        <Badge variant={over ? "destructive" : "secondary"} className="text-[10px]">
                          {pct}%
                        </Badge>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-1.5" />
                      <p className="text-[10px] text-muted-foreground">
                        из {cat.budget.toLocaleString("ru")} ₽
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Бюджеты ─── */}
        <TabsContent value="budgets" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Бюджеты на июнь</CardTitle>
              <CardDescription className="text-xs">Лимиты расходов по категориям</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {budgets.map((b) => {
                  const pct = Math.round((b.spent / b.limit) * 100)
                  const remaining = b.limit - b.spent
                  return (
                    <div key={b.name} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">{b.name}</span>
                        </div>
                        <span className="text-sm">
                          <span className="font-medium">{b.spent.toLocaleString("ru")}</span>
                          <span className="text-muted-foreground"> / {b.limit.toLocaleString("ru")} ₽</span>
                        </span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-2" />
                      <div className="flex justify-between text-[10px]">
                        <span className={pct >= 90 ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {pct >= 90 ? "⚠️ Почти лимит!" : `${pct}% использовано`}
                        </span>
                        <span className="text-muted-foreground">
                          осталось {remaining.toLocaleString("ru")} ₽
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full gap-2">
            <Wallet className="h-4 w-4" />
            Создать бюджет
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}

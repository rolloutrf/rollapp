import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rollapp/ui/components/card"
import { Progress } from "@rollapp/ui/components/progress"
import { Badge } from "@rollapp/ui/components/badge"
import { Button } from "@rollapp/ui/components/button"
import { Separator } from "@rollapp/ui/components/separator"
import {
  Gift, Star, Crown, Trophy, Sparkles, ArrowRight,
  ShoppingBag, Zap, Percent, Users,
} from "lucide-react"

const tiers = [
  { name: "Start", icon: Star, points: "0–999", color: "text-gray-500", cashback: "1%", benefits: ["Базовый кэшбэк", "Доступ к акциям"] },
  { name: "Silver", icon: Crown, points: "1 000–4 999", color: "text-gray-400", cashback: "2%", benefits: ["Повышенный кэшбэк", "Приоритетная поддержка", "Ранний доступ к распродажам"] },
  { name: "Gold", icon: Trophy, points: "5 000–19 999", color: "text-yellow-500", cashback: "3%", benefits: ["Максимальный кэшбэк", "Бесплатная доставка", "Персональный менеджер", "Эксклюзивные предложения"] },
  { name: "Platinum", icon: Sparkles, points: "20 000+", color: "text-purple-500", cashback: "5%", benefits: ["VIP-кэшбэк", "Все Gold-преимущества", "Приглашения на события", "Бесплатная рассрочка"] },
]

/* Мок-данные */
const currentTier = 1 // Silver
const currentPoints = 3450
const nextTierPoints = 5000
const earnedThisMonth = 320

const recentRewards = [
  { action: "Покупка ноутбука", points: 1500, date: "15 июня" },
  { action: "Оплата ЖКХ", points: 57, date: "11 июня" },
  { action: "Реферал: Анна М.", points: 500, date: "8 июня" },
  { action: "Челлендж «3 покупки»", points: 200, date: "5 июня" },
  { action: "Кэшбэк за май", points: 245, date: "1 июня" },
]

const challenges = [
  { name: "3 покупки за неделю", progress: 2, total: 3, reward: 200, icon: ShoppingBag },
  { name: "Оплатить ЖКХ онлайн", progress: 1, total: 1, reward: 50, icon: Zap, done: true },
  { name: "Пригласи друга", progress: 0, total: 1, reward: 500, icon: Users },
]

export function LoyaltyPage() {
  const tier = tiers[currentTier]
  const nextTier = tiers[currentTier + 1]
  const progressToNext = nextTier ? Math.round(((currentPoints - parseInt(tier.points.replace(/[^\d]/g, ""))) / (parseInt(nextTier.points.replace(/[^\d]/g, "")) - parseInt(tier.points.replace(/[^\d]/g, "")))) * 100) : 100

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Лояльность</h1>
        <p className="text-sm text-muted-foreground">Программа привилегий RollApp</p>
      </div>

      {/* Текущий уровень */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-primary/20`}>
              <tier.icon className={`h-7 w-7 ${tier.color}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{tier.name}</h2>
                <Badge variant="secondary">{tier.cashback} кэшбэк</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {currentPoints.toLocaleString("ru")} баллов
              </p>
            </div>
          </div>

          {nextTier && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">До {nextTier.name}</span>
                <span className="font-medium">{progressToNext}%</span>
              </div>
              <Progress value={progressToNext} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Ещё {(nextTierPoints - currentPoints).toLocaleString("ru")} баллов до уровня {nextTier.name}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Заработано в этом месяце */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Gift className="mx-auto mb-1 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">Заработано</p>
            <p className="text-lg font-bold">+{earnedThisMonth.toLocaleString("ru")}</p>
            <p className="text-[10px] text-muted-foreground">в июне</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Percent className="mx-auto mb-1 h-5 w-5 text-green-600" />
            <p className="text-xs text-muted-foreground">Кэшбэк</p>
            <p className="text-lg font-bold text-green-600">{tier.cashback}</p>
            <p className="text-[10px] text-muted-foreground">с каждой покупки</p>
          </CardContent>
        </Card>
      </div>

      {/* Челленджи */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Челленджи
          </CardTitle>
          <CardDescription className="text-xs">Выполняйте задания и получайте баллы</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {challenges.map((ch) => {
              const pct = Math.round((ch.progress / ch.total) * 100)
              return (
                <div key={ch.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <ch.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">{ch.name}</span>
                    <Badge variant={ch.done ? "default" : "secondary"} className="text-[10px]">
                      +{ch.reward}
                    </Badge>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground">
                    {ch.done ? "✅ Выполнено!" : `${ch.progress}/${ch.total}`}
                  </p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Последние начисления */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Последние начисления</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {recentRewards.map((r) => (
              <div key={`${r.action}-${r.date}`} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <ArrowRight className="h-3.5 w-3.5 text-green-600 rotate-[-45deg]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{r.action}</p>
                  <p className="text-xs text-muted-foreground">{r.date}</p>
                </div>
                <span className="text-sm font-medium text-green-600">+{r.points}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Уровни */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Уровни программы</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {tiers.map((t, i) => (
              <div
                key={t.name}
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  i === currentTier ? "bg-primary/5 border border-primary/30" : ""
                }`}
              >
                <t.icon className={`h-5 w-5 mt-0.5 ${t.color}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{t.name}</p>
                    <span className="text-xs text-muted-foreground">{t.points} баллов</span>
                    <Badge variant="secondary" className="text-[10px]">{t.cashback}</Badge>
                  </div>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {t.benefits.map((b) => (
                      <li key={b} className="text-xs text-muted-foreground">• {b}</li>
                    ))}
                  </ul>
                </div>
                {i === currentTier && (
                  <Badge className="text-[10px]">Вы здесь</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Потратить баллы */}
      <Button variant="outline" className="w-full gap-2">
        <Gift className="h-4 w-4" />
        Потратить баллы
      </Button>
    </div>
  )
}

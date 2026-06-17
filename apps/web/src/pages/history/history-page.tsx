import { useState } from "react"
import { Button } from "@rollapp/ui/components/button"
import { Card, CardContent } from "@rollapp/ui/components/card"
import { Input } from "@rollapp/ui/components/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rollapp/ui/components/select"
import { Badge } from "@rollapp/ui/components/badge"
import {
  Download, Search, ArrowUpRight, ArrowDownRight,
} from "lucide-react"

type TransactionStatus = "completed" | "pending" | "failed"
type TransactionType = "income" | "expense"

interface Transaction {
  id: string
  title: string
  subtitle: string
  amount: number
  type: TransactionType
  status: TransactionStatus
  date: string
  category: string
}

const statusMap: Record<TransactionStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  completed: { label: "Выполнен", variant: "secondary" },
  pending: { label: "В обработке", variant: "default" },
  failed: { label: "Ошибка", variant: "destructive" },
}

/* Мок-транзакции */
const mockTransactions: Transaction[] = [
  { id: "1", title: "Перевод Иванову И.", subtitle: "СБП · +7 900 123-45-67", amount: -5000, type: "expense", status: "completed", date: "17 июня 2026", category: "Переводы" },
  { id: "2", title: "Зачисление", subtitle: "От ООО «Рога»", amount: 85000, type: "income", status: "completed", date: "16 июня 2026", category: "Зачисления" },
  { id: "3", title: "OZON", subtitle: "Заказ #42819", amount: -3490, type: "expense", status: "completed", date: "15 июня 2026", category: "Покупки" },
  { id: "4", title: "Подписка Яндекс Плюс", subtitle: "Ежемесячная", amount: -299, type: "expense", status: "completed", date: "14 июня 2026", category: "Подписки" },
  { id: "5", title: "Перевод на карту", subtitle: "**** 4567", amount: -15000, type: "expense", status: "pending", date: "14 июня 2026", category: "Переводы" },
  { id: "6", title: "Кэшбэк", subtitle: "Программа лояльности", amount: 450, type: "income", status: "completed", date: "13 июня 2026", category: "Кэшбэк" },
  { id: "7", title: "Wildberries", subtitle: "Заказ #WB78901", amount: -12990, type: "expense", status: "completed", date: "12 июня 2026", category: "Покупки" },
  { id: "8", title: "Оплата ЖКХ", subtitle: "Мосэнергосбыт", amount: -2840, type: "expense", status: "failed", date: "11 июня 2026", category: "ЖКХ" },
]

const categories = ["Все", "Переводы", "Покупки", "Подписки", "Зачисления", "Кэшбэк", "ЖКХ"]

export function HistoryPage() {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Все")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filtered = mockTransactions.filter((tx) => {
    if (search && !tx.title.toLowerCase().includes(search.toLowerCase()) && !tx.subtitle.toLowerCase().includes(search.toLowerCase())) return false
    if (category !== "Все" && tx.category !== category) return false
    if (statusFilter !== "all" && tx.status !== statusFilter) return false
    return true
  })

  const totalExpense = filtered.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalIncome = filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0)

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">История операций</h1>
        <p className="text-sm text-muted-foreground">Все ваши платежи и переводы</p>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Расходы</p>
            <p className="text-lg font-semibold text-destructive">
              -{totalExpense.toLocaleString("ru")} ₽
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Поступления</p>
            <p className="text-lg font-semibold text-green-600">
              +{totalIncome.toLocaleString("ru")} ₽
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Фильтры */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Категория" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="completed">Выполнен</SelectItem>
              <SelectItem value="pending">В обработке</SelectItem>
              <SelectItem value="failed">Ошибка</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Список транзакций */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Операции не найдены
          </p>
        )}
        {filtered.map((tx) => (
          <Card key={tx.id} className="cursor-pointer hover:bg-accent/50 transition-colors">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
                tx.type === "income"
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-red-100 dark:bg-red-900/30"
              }`}>
                {tx.type === "income"
                  ? <ArrowDownRight className="h-4 w-4 text-green-600" />
                  : <ArrowUpRight className="h-4 w-4 text-red-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.title}</p>
                <p className="text-xs text-muted-foreground truncate">{tx.subtitle}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className={`text-sm font-semibold ${
                  tx.type === "income" ? "text-green-600" : "text-foreground"
                }`}>
                  {tx.type === "income" ? "+" : ""}{tx.amount.toLocaleString("ru")} ₽
                </p>
                <Badge variant={statusMap[tx.status].variant} className="text-[10px] px-1.5 py-0">
                  {statusMap[tx.status].label}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Экспорт */}
      <Button variant="outline" className="w-full gap-2">
        <Download className="h-4 w-4" />
        Скачать выписку
      </Button>
    </div>
  )
}

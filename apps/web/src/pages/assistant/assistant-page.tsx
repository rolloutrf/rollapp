import { useState, useRef, useEffect } from "react"
import { Button } from "@rollapp/ui/components/button"
import { Input } from "@rollapp/ui/components/input"
import { Avatar, AvatarFallback } from "@rollapp/ui/components/avatar"
import { Badge } from "@rollapp/ui/components/badge"
import {
  Send, Bot, User, Sparkles, Lightbulb,
} from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  text: string
  actions?: QuickAction[]
}

interface QuickAction {
  label: string
  command: string
}

const quickActions: QuickAction[] = [
  { label: "Сколько я потратил?", command: "Сколько я потратил в этом месяце?" },
  { label: "Перевести 5000₽", command: "Переведи 5000 рублей Иванову" },
  { label: "Найти ноутбук", command: "Найди ноутбук до 80000 рублей" },
  { label: "Мой уровень", command: "Какой у меня уровень лояльности?" },
]

/* Мок-ответы ассистента */
const mockResponses: Record<string, string> = {
  "Сколько я потратил в этом месяце?": "В июне вы потратили **87 420 ₽**. Основные категории:\n\n• Покупки — 24 990 ₽\n• Путешествия — 19 600 ₽\n• ЖКХ — 12 840 ₽\n\nДо лимита бюджета осталось **12 580 ₽**. Хотите посмотреть подробности?",
  "Переведи 5000 рублей Иванову": "Готовлю перевод:\n\n• **Кому:** Иванов И.\n• **Сумма:** 5 000 ₽\n• **Способ:** СБП (без комиссии)\n\nПодтвердить перевод?",
  "Найди ноутбук до 80000 рублей": "Нашёл 3 ноутбука до 80 000 ₽:\n\n1. **Lenovo IdeaPad 5 Pro** — 74 990 ₽ ⭐ 4.7\n2. **HP Pavilion 15** — 69 990 ₽ ⭐ 4.5\n3. **ASUS VivoBook 16** — 59 990 ₽ ⭐ 4.3\n\nОткрыть каталог?",
  "Какой у меня уровень лояльности?": "Ваш уровень — **Silver** 🥈\n\n• Баллы: 3 450\n• Кэшбэк: 2%\n• До Gold: ещё 1 550 баллов\n\nВ этом месяце вы заработали +320 баллов. Продолжайте в том же духе! 💪",
}

const defaultResponse = "Я понял ваш запрос. Давайте разберёмся! Пока я могу помочь с:\n\n• 💰 **Финансы** — расходы, переводы, бюджеты\n• 🛍️ **Покупки** — поиск товаров, рекомендации\n• 🎁 **Лояльность** — баллы, уровни, кэшбэк\n• 📊 **Аналитика** — тренды, прогнозы\n\nПопробуйте один из быстрых вопросов ниже."

export function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Привет! Я ассистент RollApp 🐾 Помогу с финансами, покупками и аналитикой. Чем могу помочь?",
      actions: quickActions,
    },
  ])
  const [input, setInput] = useState("")
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typing])

  const sendMessage = (text: string) => {
    if (!text.trim()) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: text.trim(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setTyping(true)

    // Имитация ответа
    setTimeout(() => {
      const response = mockResponses[text.trim()] || defaultResponse
      const assistantMsg: Message = {
        id: `asst-${Date.now()}`,
        role: "assistant",
        text: response,
        actions: undefined,
      }
      setMessages((prev) => [...prev, assistantMsg])
      setTyping(false)
    }, 800 + Math.random() * 700)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-0 h-[calc(100vh-8rem)]">
      {/* Заголовок */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-lg font-semibold">Ассистент</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
            Онлайн
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto gap-1">
          <Sparkles className="h-3 w-3" /> AI
        </Badge>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className={
                msg.role === "user"
                  ? "bg-muted"
                  : "bg-primary text-primary-foreground"
              }>
                {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === "user" ? "items-end" : ""}`}>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}
              >
                {/* Рендерим Markdown-подобную разметку */}
                {msg.text.split("\n").map((line, i) => {
                  // Bold **text**
                  const parts = line.split(/(\*\*[^*]+\*\*)/g)
                  return (
                    <p key={i} className={i > 0 ? "mt-1" : ""}>
                      {parts.map((part, j) => {
                        if (part.startsWith("**") && part.endsWith("**")) {
                          return <strong key={j}>{part.slice(2, -2)}</strong>
                        }
                        return <span key={j}>{part}</span>
                      })}
                    </p>
                  )
                })}
              </div>

              {/* Быстрые действия */}
              {msg.actions && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.actions.map((action) => (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                      onClick={() => sendMessage(action.command)}
                    >
                      <Lightbulb className="h-3 w-3" />
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {typing && (
          <div className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Ввод */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-3 border-t">
        <Input
          placeholder="Спросите что-нибудь…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={typing}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || typing}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}

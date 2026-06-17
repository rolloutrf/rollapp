import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@rollapp/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@rollapp/ui/components/card"
import { RadioGroup, RadioGroupItem } from "@rollapp/ui/components/radio-group"
import { Label } from "@rollapp/ui/components/label"
import { Checkbox } from "@rollapp/ui/components/checkbox"
import { Separator } from "@rollapp/ui/components/separator"
import { Badge } from "@rollapp/ui/components/badge"
import { Progress } from "@rollapp/ui/components/progress"
import { Input } from "@rollapp/ui/components/input"
import {
  CheckCircle2, ChevronRight,
} from "lucide-react"

const STEPS = ["Корзина", "Доставка", "Оплата", "Подтверждение"]

/* Мок-данные для демонстрации */
const mockItems = [
  { id: 1, name: "Ноутбук Lenovo IdeaPad 5", price: 54990, qty: 1, image: "💻" },
  { id: 2, name: "Мышь Logitech MX Master 3S", price: 8990, qty: 1, image: "🖱️" },
  { id: 3, name: "Кабель USB-C 2м", price: 990, qty: 2, image: "🔌" },
]

const deliveryOptions = [
  { id: "courier", label: "Курьер", desc: "Завтра, 10:00–14:00", price: 299 },
  { id: "pvz", label: "ПВЗ", desc: "Пункт выдачи — 1.2 км", price: 0 },
  { id: "post", label: "Почта России", desc: "3–5 рабочих дней", price: 199 },
]

const paymentMethods = [
  { id: "card", label: "Банковская карта", desc: "Мир, Visa, Mastercard" },
  { id: "sbp", label: "СБП", desc: "По номеру телефона" },
  { id: "split", label: "Рассрочка", desc: "0% на 6 месяцев" },
  { id: "invoice", label: "Счёт на оплату", desc: "Для B2B" },
]

export function CheckoutPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [promo, setPromo] = useState("")
  const [promoApplied, setPromoApplied] = useState(false)

  const progress = ((step + 1) / STEPS.length) * 100
  const subtotal = mockItems.reduce((sum, item) => sum + item.price * item.qty, 0)
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0
  const total = subtotal - discount

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Оформление заказа</h1>
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          {STEPS.map((label, i) => (
            <span key={i} className={i === step ? "font-medium text-foreground" : ""}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Шаг 0: Корзина */}
      {step === 0 && (
        <div className="flex flex-col gap-4">
          {mockItems.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <span className="text-2xl">{item.image}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.qty} шт</p>
                </div>
                <p className="text-sm font-semibold">{item.price.toLocaleString("ru")} ₽</p>
              </CardContent>
            </Card>
          ))}

          <Separator />

          {/* Промокод */}
          <div className="flex gap-2">
            <Input
              placeholder="Промокод"
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => { if (promo) setPromoApplied(true) }}
              disabled={!promo}
            >
              Применить
            </Button>
          </div>
          {promoApplied && (
            <Badge variant="secondary" className="w-fit">
              -10% применён
            </Badge>
          )}

          {/* Итого */}
          <Card>
            <CardContent className="p-4 text-sm">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Товары</span>
                  <span>{subtotal.toLocaleString("ru")} ₽</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Скидка</span>
                    <span>-{discount.toLocaleString("ru")} ₽</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Итого</span>
                  <span>{total.toLocaleString("ru")} ₽</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" onClick={() => setStep(1)}>
            Продолжить <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Шаг 1: Доставка */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Способ доставки</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup defaultValue="pvz" className="flex flex-col gap-3">
                {deliveryOptions.map((opt) => (
                  <div key={opt.id} className="flex items-start gap-3">
                    <RadioGroupItem value={opt.id} id={opt.id} className="mt-1" />
                    <Label htmlFor={opt.id} className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.desc}</p>
                        </div>
                        <span className="text-sm font-medium">
                          {opt.price === 0 ? "Бесплатно" : `${opt.price} ₽`}
                        </span>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>Назад</Button>
            <Button className="flex-1" onClick={() => setStep(2)}>
              Продолжить <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Шаг 2: Оплата */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Способ оплаты</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup defaultValue="card" className="flex flex-col gap-3">
                {paymentMethods.map((method) => (
                  <div key={method.id} className="flex items-start gap-3">
                    <RadioGroupItem value={method.id} id={`pay-${method.id}`} className="mt-1" />
                    <Label htmlFor={`pay-${method.id}`} className="flex-1">
                      <p className="text-sm font-medium">{method.label}</p>
                      <p className="text-xs text-muted-foreground">{method.desc}</p>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Checkbox id="agree" />
            <Label htmlFor="agree" className="text-xs text-muted-foreground">
              Я принимаю условия оферты и политику возврата
            </Label>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Назад</Button>
            <Button className="flex-1" onClick={() => setStep(3)}>
              Оплатить {total.toLocaleString("ru")} ₽
            </Button>
          </div>
        </div>
      )}

      {/* Шаг 3: Подтверждение */}
      {step === 3 && (
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Заказ оформлен!</h2>
            <p className="text-sm text-muted-foreground">
              Номер заказа: #RA-{Math.floor(Math.random() * 90000 + 10000)}
            </p>
          </div>
          <Card className="w-full">
            <CardContent className="p-4 text-sm">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Сумма</span>
                  <span className="font-semibold">{total.toLocaleString("ru")} ₽</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Оплата</span>
                  <span>Банковская карта</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Доставка</span>
                  <span>ПВЗ — 1.2 км</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/history")}>
              К истрии
            </Button>
            <Button className="flex-1" onClick={() => navigate("/")}>
              На главную
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

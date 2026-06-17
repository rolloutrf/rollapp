import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@rollapp/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rollapp/ui/components/card"
import { RadioGroup, RadioGroupItem } from "@rollapp/ui/components/radio-group"
import { Badge } from "@rollapp/ui/components/badge"
import { Calendar } from "@rollapp/ui/components/calendar"
import { Input } from "@rollapp/ui/components/input"
import {
  Truck, MapPin, Building2, Clock, CheckCircle2, Package,
  ChevronRight,
} from "lucide-react"

type DeliveryStep = "method" | "address" | "date" | "tracking"

const deliveryMethods = [
  { id: "courier", icon: Truck, label: "Курьер", desc: "Доставка до двери", price: 299, eta: "1–2 дня" },
  { id: "pvz", icon: Building2, label: "ПВЗ", desc: "Пункт выдачи", price: 0, eta: "2–3 дня" },
  { id: "post", icon: Package, label: "Почта России", desc: "Отделение связи", price: 199, eta: "3–7 дней" },
  { id: "express", icon: Clock, label: "Экспресс", desc: "В течение 3 часов", price: 799, eta: "Сегодня" },
]

const mockTracking = [
  { status: "Заказ создан", date: "17 июня 10:30", done: true },
  { status: "Передан в службу доставки", date: "17 июня 14:00", done: true },
  { status: "В пути", date: "17 июня 16:45", done: true },
  { status: "Прибыл на сортировку", date: "18 июня 02:30", done: false },
  { status: "Доставлен", date: "", done: false },
]

export function DeliveryPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<DeliveryStep>("method")
  const [selectedMethod, setSelectedMethod] = useState("courier")
  const [date, setDate] = useState<Date | undefined>(new Date(Date.now() + 86400000 * 2))
  const [showTracking, setShowTracking] = useState(false)

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Доставка</h1>
        <p className="text-sm text-muted-foreground">
          {showTracking ? "Отслеживание вашего заказа" : "Выберите способ доставки"}
        </p>
      </div>

      {/* Переключатель: Выбор / Трекинг */}
      <div className="flex gap-2">
        <Button
          variant={!showTracking ? "default" : "outline"}
          size="sm"
          onClick={() => setShowTracking(false)}
        >
          Оформить доставку
        </Button>
        <Button
          variant={showTracking ? "default" : "outline"}
          size="sm"
          onClick={() => setShowTracking(true)}
        >
          Трекинг заказа
        </Button>
      </div>

      {!showTracking ? (
        <>
          {/* Шаг: Способ доставки */}
          {step === "method" && (
            <div className="flex flex-col gap-4">
              <RadioGroup value={selectedMethod} onValueChange={setSelectedMethod}>
                {deliveryMethods.map((method) => (
                  <Card
                    key={method.id}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod === method.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                    }`}
                    onClick={() => setSelectedMethod(method.id)}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <RadioGroupItem value={method.id} id={method.id} />
                      <method.icon className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{method.label}</p>
                        <p className="text-xs text-muted-foreground">{method.desc}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {method.price === 0 ? "Бесплатно" : `${method.price} ₽`}
                        </p>
                        <p className="text-xs text-muted-foreground">{method.eta}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </RadioGroup>
              <Button className="w-full" onClick={() => setStep("address")}>
                Продолжить <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Шаг: Адрес */}
          {step === "address" && (
            <div className="flex flex-col gap-4">
              {selectedMethod === "courier" || selectedMethod === "express" ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Адрес доставки</CardTitle>
                    <CardDescription className="text-xs">Курьер доставит до двери</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Input placeholder="Город" defaultValue="Москва" />
                    <Input placeholder="Улица, дом, квартира" />
                    <Input placeholder="Код домофона" />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Пункт получения</CardTitle>
                    <CardDescription className="text-xs">
                      {selectedMethod === "pvz" ? "Выберите ПВЗ на карте" : "Выберите отделение почты"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3 rounded-lg border p-3">
                      <MapPin className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">ПВЗ RollApp</p>
                        <p className="text-xs text-muted-foreground">ул. Тверская, 12 · 1.2 км</p>
                      </div>
                      <Badge variant="secondary" className="ml-auto">Выбрано</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("method")}>Назад</Button>
                <Button className="flex-1" onClick={() => setStep("date")}>
                  Продолжить <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Шаг: Дата */}
          {step === "date" && (
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Выберите дату доставки</CardTitle>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={{ before: new Date() }}
                    className="rounded-md border"
                  />
                </CardContent>
              </Card>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("address")}>Назад</Button>
                <Button className="flex-1" onClick={() => navigate("/checkout")}>
                  Оформить заказ
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Трекинг */
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Заказ #RA-42819</CardTitle>
              <CardDescription className="text-xs">
                Ноутбук Lenovo IdeaPad 5 Pro · Курьер
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-0">
                {mockTracking.map((item, i) => (
                  <div key={i} className="flex gap-3 pb-4 last:pb-0">
                    {/* Линия трекинга */}
                    <div className="flex flex-col items-center">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        item.done
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {item.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-xs">{i + 1}</span>}
                      </div>
                      {i < mockTracking.length - 1 && (
                        <div className={`w-0.5 flex-1 ${item.done ? "bg-green-500" : "bg-muted"}`} />
                      )}
                    </div>
                    {/* Текст */}
                    <div className="pb-2">
                      <p className={`text-sm ${item.done ? "font-medium" : "text-muted-foreground"}`}>
                        {item.status}
                      </p>
                      {item.date && (
                        <p className="text-xs text-muted-foreground">{item.date}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full gap-2">
            <MapPin className="h-4 w-4" />
            Отследить на карте
          </Button>
        </div>
      )}
    </div>
  )
}

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@rollapp/ui/components/button"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@rollapp/ui/components/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rollapp/ui/components/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rollapp/ui/components/card"
import { RadioGroup, RadioGroupItem } from "@rollapp/ui/components/radio-group"
import { Label } from "@rollapp/ui/components/label"
import { Badge } from "@rollapp/ui/components/badge"
import { PhoneInput } from "@rollapp/ui/components/phone-input"
import { CardNumberInput } from "@rollapp/ui/components/card-number-input"
import { AmountInput } from "@rollapp/ui/components/amount-input"
import { Separator } from "@rollapp/ui/components/separator"
import {
  Send, CreditCard, Building2, ArrowRightLeft, Wallet,
} from "lucide-react"

type PaymentType = "c2c" | "me2me" | "c2b" | "card" | "sbp"

/* ─── Сchemas ─── */
const c2cSchema = z.object({
  phone: z.string().min(11, "Введите номер телефона"),
  amount: z.string().min(1, "Введите сумму"),
})

const me2meSchema = z.object({
  fromAccount: z.string().min(1, "Выберите счёт списания"),
  toAccount: z.string().min(1, "Выберите счёт зачисления"),
  amount: z.string().min(1, "Введите сумму"),
})

const cardSchema = z.object({
  cardNumber: z.string().min(16, "Введите номер карты"),
  amount: z.string().min(1, "Введите сумму"),
})

type C2CForm = z.infer<typeof c2cSchema>
type Me2MeForm = z.infer<typeof me2meSchema>
type CardForm = z.infer<typeof cardSchema>

const paymentTabs = [
  { value: "c2c" as const, label: "По телефону", icon: Send },
  { value: "me2me" as const, label: "Между счетами", icon: ArrowRightLeft },
  { value: "card" as const, label: "На карту", icon: CreditCard },
  { value: "sbp" as const, label: "СБП", icon: Building2 },
]

export function PaymentsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const c2cForm = useForm<C2CForm>({
    resolver: zodResolver(c2cSchema),
    defaultValues: { phone: "", amount: "" },
  })

  const me2meForm = useForm<Me2MeForm>({
    resolver: zodResolver(me2meSchema),
    defaultValues: { fromAccount: "main", toAccount: "savings", amount: "" },
  })

  const cardForm = useForm<CardForm>({
    resolver: zodResolver(cardSchema),
    defaultValues: { cardNumber: "", amount: "" },
  })

  const handlePay = (type: PaymentType) => {
    setLoading(true)
    // TODO: вызов payment service
    console.log("Payment:", type)
    setTimeout(() => {
      setLoading(false)
      navigate("/history")
    }, 1000)
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Платежи и переводы</h1>
        <p className="text-sm text-muted-foreground">
          Переводите деньги быстро и без комиссии
        </p>
      </div>

      <Tabs defaultValue="c2c">
        <TabsList className="w-full">
          {paymentTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-1 gap-1.5">
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* C2C — по телефону */}
        <TabsContent value="c2c" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Перевод по телефону</CardTitle>
              <CardDescription className="text-xs">
                До 100 000 ₽/мес — бесплатно · СБП
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...c2cForm}>
                <form
                  onSubmit={c2cForm.handleSubmit(() => handlePay("c2c"))}
                  className="flex flex-col gap-4"
                >
                  <FormField
                    control={c2cForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Телефон получателя</FormLabel>
                        <FormControl>
                          <PhoneInput
                            placeholder="+7 900 000-00-00"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={c2cForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Сумма</FormLabel>
                        <FormControl>
                          <AmountInput
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Лимит: 1 000 000 ₽ за операцию
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Отправляем…" : "Перевести"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Me2Me — между своими счетами */}
        <TabsContent value="me2me" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Между своими счетами</CardTitle>
              <CardDescription className="text-xs">
                До 30 000 000 ₽/мес · Без комиссии
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...me2meForm}>
                <form
                  onSubmit={me2meForm.handleSubmit(() => handlePay("me2me"))}
                  className="flex flex-col gap-4"
                >
                  <FormField
                    control={me2meForm.control}
                    name="fromAccount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Со счёта</FormLabel>
                        <FormControl>
                          <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="main" id="from-main" />
                              <Label htmlFor="from-main" className="flex items-center gap-2">
                                <Wallet className="h-4 w-4" />
                                Основной · 125 430,50 ₽
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="savings" id="from-savings" />
                              <Label htmlFor="from-savings" className="flex items-center gap-2">
                                <Wallet className="h-4 w-4" />
                                Накопительный · 890 000 ₽
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <FormField
                    control={me2meForm.control}
                    name="toAccount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>На счёт</FormLabel>
                        <FormControl>
                          <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="main" id="to-main" />
                              <Label htmlFor="to-main" className="flex items-center gap-2">
                                <Wallet className="h-4 w-4" />
                                Основной · 125 430,50 ₽
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="savings" id="to-savings" />
                              <Label htmlFor="to-savings" className="flex items-center gap-2">
                                <Wallet className="h-4 w-4" />
                                Накопительный · 890 000 ₽
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={me2meForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Сумма</FormLabel>
                        <FormControl>
                          <AmountInput value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Переводим…" : "Перевести"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* На карту */}
        <TabsContent value="card" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Перевод на карту</CardTitle>
              <CardDescription className="text-xs">
                Карты Мир · Комиссия по тарифам банка
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...cardForm}>
                <form
                  onSubmit={cardForm.handleSubmit(() => handlePay("card"))}
                  className="flex flex-col gap-4"
                >
                  <FormField
                    control={cardForm.control}
                    name="cardNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Номер карты получателя</FormLabel>
                        <FormControl>
                          <CardNumberInput
                            placeholder="0000 0000 0000 0000"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={cardForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Сумма</FormLabel>
                        <FormControl>
                          <AmountInput value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Отправляем…" : "Перевести"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* СБП */}
        <TabsContent value="sbp" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Система быстрых платежей</CardTitle>
              <CardDescription className="text-xs">
                Мгновенные переводы в любой банк РФ
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...c2cForm}>
                <form
                  onSubmit={c2cForm.handleSubmit(() => handlePay("sbp"))}
                  className="flex flex-col gap-4"
                >
                  <FormField
                    control={c2cForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Телефон получателя</FormLabel>
                        <FormControl>
                          <PhoneInput
                            placeholder="+7 900 000-00-00"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={c2cForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Сумма</FormLabel>
                        <FormControl>
                          <AmountInput value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          До 100 000 ₽/мес бесплатно · далее 0.5% (макс 1 500 ₽)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-wrap gap-2">
                    {["500", "1000", "5000", "10000"].map((val) => (
                      <Badge
                        key={val}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => c2cForm.setValue("amount", val)}
                      >
                        {Number(val).toLocaleString("ru")} ₽
                      </Badge>
                    ))}
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Отправляем…" : "Перевести по СБП"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

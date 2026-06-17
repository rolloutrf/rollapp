import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@rollapp/ui/components/button"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@rollapp/ui/components/form"
import { Input } from "@rollapp/ui/components/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rollapp/ui/components/card"
import { Progress } from "@rollapp/ui/components/progress"

/* ─── Шаг 1: Тип идентификации ─── */
const step1Schema = z.object({
  idType: z.enum(["simplified", "full", "biometric"], { message: "Выберите тип" }),
})
type Step1Form = z.infer<typeof step1Schema>

/* ─── Шаг 2: Персональные данные ─── */
const step2Schema = z.object({
  lastName: z.string().min(2, "Введите фамилию"),
  firstName: z.string().min(2, "Введите имя"),
  middleName: z.string().optional(),
  passportSeries: z.string().length(4, "4 цифры"),
  passportNumber: z.string().length(6, "6 цифр"),
  inn: z.string().length(12, "12 цифр").optional(),
  snils: z.string().length(11, "11 цифр").optional(),
})
type Step2Form = z.infer<typeof step2Schema>

/* ─── Шаг 3: Подтверждение ─── */
// Нет полей — подтверждение

const STEPS = ["Тип идентификации", "Персональные данные", "Подтверждение"]

const idTypes = [
  { value: "simplified" as const, title: "Упрощённая", desc: "ФИО, паспорт — переводы до 100 000 ₽" },
  { value: "full" as const, title: "Полная", desc: "Полные данные, ИНН, СНИЛС — без ограничений" },
  { value: "biometric" as const, title: "Биометрическая", desc: "Биометрия — максимальный уровень доступа" },
]

export function KycPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const step1Form = useForm<Step1Form>({
    resolver: zodResolver(step1Schema),
    defaultValues: { idType: undefined },
  })

  const step2Form = useForm<Step2Form>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      lastName: "", firstName: "", middleName: "",
      passportSeries: "", passportNumber: "", inn: "", snils: "",
    },
  })

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Идентификация</h1>
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          {STEPS.map((label, i) => (
            <span key={i} className={i === step ? "font-medium text-foreground" : ""}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Шаг 1 */}
      {step === 0 && (
        <Form {...step1Form}>
          <form
            onSubmit={step1Form.handleSubmit(() => setStep(1))}
            className="flex flex-col gap-4"
          >
            <FormField
              control={step1Form.control}
              name="idType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Тип идентификации</FormLabel>
                  <FormControl>
                    <div className="flex flex-col gap-3">
                      {idTypes.map((type) => (
                        <Card
                          key={type.value}
                          className={`cursor-pointer transition-colors ${
                            field.value === type.value
                              ? "border-primary bg-primary/5"
                              : "hover:bg-accent"
                          }`}
                          onClick={() => field.onChange(type.value)}
                        >
                          <CardHeader className="p-4">
                            <CardTitle className="text-sm">{type.title}</CardTitle>
                            <CardDescription className="text-xs">{type.desc}</CardDescription>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full">Продолжить</Button>
          </form>
        </Form>
      )}

      {/* Шаг 2 */}
      {step === 1 && (
        <Form {...step2Form}>
          <form
            onSubmit={step2Form.handleSubmit(() => setStep(2))}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={step2Form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Фамилия</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={step2Form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Имя</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={step2Form.control}
              name="middleName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Отчество</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={step2Form.control}
                name="passportSeries"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Серия паспорта</FormLabel>
                    <FormControl><Input placeholder="1234" maxLength={4} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={step2Form.control}
                name="passportNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Номер паспорта</FormLabel>
                    <FormControl><Input placeholder="567890" maxLength={6} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={step2Form.control}
              name="inn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ИНН</FormLabel>
                  <FormControl><Input placeholder="12 цифр" maxLength={12} {...field} /></FormControl>
                  <FormDescription>Для полной и биометрической идентификации</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={step2Form.control}
              name="snils"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>СНИЛС</FormLabel>
                  <FormControl><Input placeholder="11 цифр" maxLength={11} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(0)}>
                Назад
              </Button>
              <Button type="submit" className="flex-1">Продолжить</Button>
            </div>
          </form>
        </Form>
      )}

      {/* Шаг 3 */}
      {step === 2 && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Проверьте данные</CardTitle>
              <CardDescription>
                После отправки данные будут переданы на верификацию
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Тип:</dt>
                <dd>{idTypes.find(t => t.value === step1Form.getValues("idType"))?.title}</dd>
                <dt className="text-muted-foreground">ФИО:</dt>
                <dd>{step2Form.getValues("lastName")} {step2Form.getValues("firstName")} {step2Form.getValues("middleName")}</dd>
                <dt className="text-muted-foreground">Паспорт:</dt>
                <dd>{step2Form.getValues("passportSeries")} {step2Form.getValues("passportNumber")}</dd>
              </dl>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
              Назад
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                // TODO: вызов KYC service
                console.log("KYC submit", { ...step1Form.getValues(), ...step2Form.getValues() })
                navigate("/")
              }}
            >
              Отправить на проверку
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

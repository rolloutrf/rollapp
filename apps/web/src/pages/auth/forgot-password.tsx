import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@rollapp/ui/components/button"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@rollapp/ui/components/form"
import { PhoneInput } from "@rollapp/ui/components/phone-input"

const forgotSchema = z.object({
  phone: z.string().min(11, "Введите номер телефона"),
})

type ForgotForm = z.infer<typeof forgotSchema>

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const form = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { phone: "" },
  })

  const onSubmit = async (data: ForgotForm) => {
    setLoading(true)
    // TODO: вызов auth service — отправка кода восстановления
    console.log("Recover password:", data.phone)
    setTimeout(() => {
      setLoading(false)
      setSent(true)
    }, 1000)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Код отправлен</h1>
          <p className="text-sm text-muted-foreground">
            Мы отправили SMS-код для восстановления доступа. Проверьте телефон.
          </p>
        </div>
        <Button onClick={() => navigate("/auth/login")} className="w-full">
          Вернуться ко входу
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Восстановление доступа</h1>
        <p className="text-sm text-muted-foreground">
          Введите номер телефона, на который зарегистрирован аккаунт
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Телефон</FormLabel>
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Отправляем…" : "Получить код"}
          </Button>
        </form>
      </Form>

      <div className="flex items-center justify-center text-sm">
        <Link to="/auth/login" className="font-medium text-primary hover:underline">
          Помню пароль — войти
        </Link>
      </div>
    </div>
  )
}

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@rollapp/ui/components/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@rollapp/ui/components/form"
import { PhoneInput } from "@rollapp/ui/components/phone-input"
import { SocialAuthButtons, type SocialProvider } from "@rollapp/ui/components/social-auth-buttons"
import { Separator } from "@rollapp/ui/components/separator"

const loginSchema = z.object({
  phone: z.string().min(11, "Введите номер телефона"),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "" },
  })

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    // TODO: вызов auth service — отправка SMS-кода
    console.log("Login phone:", data.phone)
    // Временно — переход на главную
    setTimeout(() => {
      setLoading(false)
      navigate("/")
    }, 1000)
  }

  const handleSocialAuth = (provider: SocialProvider) => {
    // TODO: OAuth-редирект на провайдера
    console.log("Social auth:", provider)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Вход</h1>
        <p className="text-sm text-muted-foreground">
          Введите номер телефона, чтобы войти
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
            {loading ? "Отправляем код…" : "Получить код"}
          </Button>
        </form>
      </Form>

      <div className="relative flex items-center justify-center">
        <Separator className="absolute w-full" />
        <span className="relative z-10 bg-background px-3 text-xs text-muted-foreground">
          или
        </span>
      </div>

      <SocialAuthButtons onAuth={handleSocialAuth} />

      <p className="text-center text-xs text-muted-foreground">
        Используя приложение, вы принимаете{" "}
        <Link to="#" className="underline underline-offset-4 hover:text-primary">
          соглашение
        </Link>{" "}
        и{" "}
        <Link to="#" className="underline underline-offset-4 hover:text-primary">
          политику конфиденциальности
        </Link>
      </p>

      <div className="flex items-center justify-center gap-4 text-sm">
        <span className="text-muted-foreground">Нет аккаунта?</span>
        <Link to="/auth/register" className="font-medium text-primary hover:underline">
          Зарегистрироваться
        </Link>
      </div>
    </div>
  )
}

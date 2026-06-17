import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@rollapp/ui/components/button"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@rollapp/ui/components/form"
import { Input } from "@rollapp/ui/components/input"
import { PhoneInput } from "@rollapp/ui/components/phone-input"
import { SocialAuthButtons, type SocialProvider } from "@rollapp/ui/components/social-auth-buttons"
import { Separator } from "@rollapp/ui/components/separator"

const registerSchema = z.object({
  phone: z.string().min(11, "Введите номер телефона"),
  email: z.string().email("Введите корректный email").optional().or(z.literal("")),
  password: z.string().min(8, "Минимум 8 символов"),
  passwordConfirm: z.string().min(8, "Подтвердите пароль"),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Пароли не совпадают",
  path: ["passwordConfirm"],
})

type RegisterForm = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { phone: "", email: "", password: "", passwordConfirm: "" },
  })

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true)
    // TODO: вызов auth service — регистрация
    console.log("Register:", data)
    setTimeout(() => {
      setLoading(false)
      navigate("/")
    }, 1000)
  }

  const handleSocialAuth = (provider: SocialProvider) => {
    console.log("Social auth:", provider)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Регистрация</h1>
        <p className="text-sm text-muted-foreground">
          Создайте аккаунт для доступа к RollApp
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

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email (необязательно)</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Пароль</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Минимум 8 символов" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="passwordConfirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Подтверждение пароля</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Повторите пароль" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Создаём аккаунт…" : "Зарегистрироваться"}
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
        <span className="text-muted-foreground">Уже есть аккаунт?</span>
        <Link to="/auth/login" className="font-medium text-primary hover:underline">
          Войти
        </Link>
      </div>
    </div>
  )
}

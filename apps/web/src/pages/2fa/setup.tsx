import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@rollapp/ui/components/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@rollapp/ui/components/card"

type TwoFAMethod = "sms" | "totp" | "biometric"

const methods: { id: TwoFAMethod; title: string; description: string }[] = [
  { id: "sms", title: "SMS-код", description: "Код подтверждения по SMS на ваш телефон" },
  { id: "totp", title: "Приложение-аутентификатор", description: "Google Authenticator, Authy и др." },
  { id: "biometric", title: "Биометрия", description: "Отпечаток пальца или Face ID" },
]

export function TwoFASetupPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<TwoFAMethod | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSetup = () => {
    if (!selected) return
    setLoading(true)
    // TODO: вызов auth service — настройка 2FA
    console.log("2FA setup:", selected)
    setTimeout(() => {
      setLoading(false)
      navigate("/2fa/verify")
    }, 1000)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Двухфакторная аутентификация</h1>
        <p className="text-sm text-muted-foreground">
          Выберите способ подтверждения для дополнительной защиты аккаунта
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {methods.map((method) => (
          <Card
            key={method.id}
            className={`cursor-pointer transition-colors ${
              selected === method.id
                ? "border-primary bg-primary/5"
                : "hover:bg-accent"
            }`}
            onClick={() => setSelected(method.id)}
          >
            <CardHeader className="p-4">
              <CardTitle className="text-sm">{method.title}</CardTitle>
              <CardDescription className="text-xs">{method.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Button
        className="w-full"
        onClick={handleSetup}
        disabled={!selected || loading}
      >
        {loading ? "Настраиваем…" : "Продолжить"}
      </Button>
    </div>
  )
}

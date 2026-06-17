import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@rollapp/ui/components/button"
import { OTPCodeInput } from "@rollapp/ui/components/otp-code-input"

export function TwoFAVerifyPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState("")
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleComplete = async (value: string) => {
    setLoading(true)
    setError(false)
    // TODO: вызов auth service — верификация OTP
    console.log("2FA verify:", value)
    setTimeout(() => {
      setLoading(false)
      // Временно — переход на главную
      navigate("/")
    }, 1000)
  }

  const handleResend = () => {
    // TODO: повторная отправка SMS
    console.log("Resend code")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Подтверждение</h1>
        <p className="text-sm text-muted-foreground">
          Мы отправили код на ваш телефон. Введите его для подтверждения.
        </p>
      </div>

      <OTPCodeInput
        value={code}
        onChange={setCode}
        onComplete={handleComplete}
        error={error}
        disabled={loading}
      />

      {loading && (
        <p className="text-center text-sm text-muted-foreground">
          Проверяем код…
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          className="w-full text-sm"
          onClick={handleResend}
          disabled={loading}
        >
          Отправить код повторно
        </Button>
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@rollapp/ui/components/input-otp"
import { cn } from "@rollapp/ui/lib/utils"

/**
 * OTPCodeInput — 6-значный код для 2FA/SMS-верификации.
 * Кастомная обёртка над shadcn input-otp по Figma 2FA-дизайну.
 */
export interface OTPCodeInputProps {
  length?: number
  value?: string
  onChange?: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  error?: boolean
  className?: string
}

export function OTPCodeInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  error,
  className,
}: OTPCodeInputProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <InputOTP
        maxLength={length}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        disabled={disabled}
      >
        <InputOTPGroup>
          {Array.from({ length }, (_, i) => (
            <React.Fragment key={i}>
              <InputOTPSlot
                index={i}
                className={cn(
                  "h-12 w-12 text-lg font-semibold transition-colors",
                  error && "border-destructive"
                )}
              />
              {i === 2 && <InputOTPSeparator />}
            </React.Fragment>
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error && (
        <p className="text-sm font-medium text-destructive">
          Неверный код. Попробуйте снова.
        </p>
      )}
    </div>
  )
}

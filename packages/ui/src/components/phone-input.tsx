"use client"

import * as React from "react"
import { IMaskInput } from "react-imask"

import { cn } from "@rollapp/ui/lib/utils"

/**
 * PhoneInput — маска российского номера телефона (+7 ___ ___-__-__)
 * Кастомный компонент поверх shadcn/ui по принципам дизайн-системы RollApp.
 */
export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: string
  onChange?: (value: string) => void
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const handleAccept = (val: string) => {
      // Возвращаем чистое значение (без маски)
      const digits = val.replace(/\D/g, "")
      onChange?.(digits)
    }

    return (
      <IMaskInput
        mask="+7 000 000-00-00"
        definitions={{
          "0": /[0-9]/,
        }}
        lazy={false}
        unmask={false}
        inputRef={ref}
        value={value || ""}
        onAccept={handleAccept}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base ring-offset-background",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
PhoneInput.displayName = "PhoneInput"

export { PhoneInput }

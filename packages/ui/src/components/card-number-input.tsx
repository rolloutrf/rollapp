"use client"

import * as React from "react"
import { IMaskInput } from "react-imask"

import { cn } from "@rollapp/ui/lib/utils"

/**
 * CardNumberInput — маска номера карты (0000 0000 0000 0000)
 * Платёжный компонент по спецификации модуля #8.
 */
export interface CardNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: string
  onChange?: (value: string) => void
}

const CardNumberInput = React.forwardRef<HTMLInputElement, CardNumberInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const handleAccept = (val: string) => {
      const digits = val.replace(/\D/g, "")
      onChange?.(digits)
    }

    return (
      <IMaskInput
        mask="0000 0000 0000 0000"
        lazy={false}
        unmask={false}
        inputRef={ref}
        value={value || ""}
        onAccept={handleAccept}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base ring-offset-background",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "font-mono tracking-wider",
          className
        )}
        {...props}
      />
    )
  }
)
CardNumberInput.displayName = "CardNumberInput"

export { CardNumberInput }

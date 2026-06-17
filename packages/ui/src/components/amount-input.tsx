"use client"

import * as React from "react"
import { IMaskInput } from "react-imask"

import { cn } from "@rollapp/ui/lib/utils"

/**
 * AmountInput — поле ввода суммы в рублях с разделителями.
 * Поддерживает копейки (до 2 знаков после запятой).
 */
export interface AmountInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: string
  onChange?: (value: string) => void
  currency?: string
}

const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ className, value, onChange, currency = "₽", ...props }, ref) => {
    const handleAccept = (val: string) => {
      onChange?.(val)
    }

    return (
      <div className={cn("relative", className)}>
        <IMaskInput
          mask={/^\d[\d\s]*(,\d{0,2})?$/}
          inputRef={ref}
          value={value || ""}
          onAccept={handleAccept}
          className={cn(
            "flex h-12 w-full rounded-lg border border-input bg-background px-3 pr-12 py-2 text-lg font-semibold ring-offset-background",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
          placeholder="0"
          {...props}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {currency}
        </span>
      </div>
    )
  }
)
AmountInput.displayName = "AmountInput"

export { AmountInput }

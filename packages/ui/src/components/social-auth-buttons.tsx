"use client"

import * as React from "react"
import { cn } from "@rollapp/ui/lib/utils"

export type SocialProvider = "gosuslugi" | "sber" | "vk" | "yandex" | "t-bank"

export interface SocialAuthButtonsProps {
  providers?: SocialProvider[]
  onAuth: (provider: SocialProvider) => void
  className?: string
}

/** Цвета фона кнопок из Figma */
const providerStyles: Record<SocialProvider, { bg: string; border?: string; label: string }> = {
  gosuslugi: { bg: "bg-white", border: "border border-[rgba(31,30,29,0.06)]", label: "Госуслуги" },
  sber: { bg: "bg-[#0C9C48]", label: "Сбер" },
  vk: { bg: "bg-[#0077FF]", label: "VK" },
  yandex: { bg: "bg-[#FC3F1D]", label: "Яндекс" },
  "t-bank": { bg: "bg-[#FFDD2D]", label: "Т-Банк" },
}

/** SVG-иконки провайдеров — упрощённые версии для MVP */
const providerIcons: Record<SocialProvider, React.ReactNode> = {
  gosuslugi: (
    <svg viewBox="0 0 28 28" fill="none" className="h-7 w-7">
      <rect width="28" height="28" rx="6" fill="#1A1A1A" />
      <path d="M7 10h14v2H7zm0 4h10v2H7z" fill="white" />
      <circle cx="21" cy="18" r="3" fill="#EF4444" />
    </svg>
  ),
  sber: (
    <svg viewBox="0 0 28 28" fill="none" className="h-7 w-7">
      <circle cx="14" cy="14" r="12" fill="white" />
      <path d="M10 8l10 6-10 6V8z" fill="#0C9C48" />
    </svg>
  ),
  vk: (
    <svg viewBox="0 0 28 28" fill="none" className="h-7 w-7">
      <path d="M14 4C8.477 4 4 8.477 4 14s4.477 10 10 10 10-4.477 10-10S19.523 4 14 4z" fill="white" />
      <path d="M14.5 18c-5 0-7.8-3.4-7.9-7h2.4c.1 2.7 1.8 4 3.1 4.3V11h2.3v3.6c1.3-.1 2.6-1.4 3.1-3.6h2.3c-.4 2.5-2.1 4.4-3.5 5.1V18h2.5c-.8 1.1-2.2 2-4.3 2.2V22c3.4-.2 6.8-2 7.8-7h-2.4c-.5 2.1-1.8 3.3-3.4 3.7v-3.7z" fill="#0077FF" />
    </svg>
  ),
  yandex: (
    <svg viewBox="0 0 28 28" fill="none" className="h-7 w-7">
      <path d="M14 4L9 22h3l2-6 2 6h3L14 4z" fill="white" />
      <circle cx="14" cy="10" r="2" fill="white" />
    </svg>
  ),
  "t-bank": (
    <svg viewBox="0 0 28 28" fill="none" className="h-7 w-7">
      <rect x="4" y="8" width="20" height="3" rx="1" fill="#1A1A1A" />
      <rect x="6" y="13" width="16" height="3" rx="1" fill="#1A1A1A" />
      <rect x="8" y="18" width="12" height="3" rx="1" fill="#1A1A1A" />
    </svg>
  ),
}

const defaultProviders: SocialProvider[] = ["gosuslugi", "sber", "vk", "yandex", "t-bank"]

/**
 * SocialAuthButtons — ряд кнопок OAuth-авторизации.
 * По Figma: 40×40px, borderRadius 12px, gap 16px.
 */
export function SocialAuthButtons({
  providers = defaultProviders,
  onAuth,
  className,
}: SocialAuthButtonsProps) {
  return (
    <div className={cn("flex items-center justify-center gap-4 py-2", className)}>
      {providers.map((provider) => {
        const style = providerStyles[provider]
        return (
          <button
            key={provider}
            type="button"
            onClick={() => onAuth(provider)}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl transition-opacity",
              "hover:opacity-80 active:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              style.bg,
              style.border
            )}
            aria-label={style.label}
          >
            {providerIcons[provider]}
          </button>
        )
      })}
    </div>
  )
}

"use client"

import * as React from "react"
import { cn } from "@rollapp/ui/lib/utils"
import { Badge } from "@rollapp/ui/components/badge"
import { Button } from "@rollapp/ui/components/button"
import { Card, CardContent } from "@rollapp/ui/components/card"
import { Star, ShoppingCart, Heart } from "lucide-react"

export interface ProductSnippetProps {
  /** Название товара */
  title: string
  /** URL изображения */
  heroImage?: string
  /** Текущая цена */
  price: number
  /** Старая цена (для скидок) */
  priceOld?: number
  /** Цена при спец. условиях (рассрочка и т.д.) */
  priceByPaymentMethod?: string
  /** Рассрочка */
  installment?: string
  /** Рейтинг 0–5 */
  rating?: number
  /** Число отзывов */
  ratingCount?: number
  /** Бейджи (sale, new, hit...) */
  badges?: string[]
  /** Бренд */
  brand?: string
  /** Срок доставки */
  deliveryEta?: string
  /** Стоимость доставки */
  deliveryFee?: number
  /** Наличие */
  inStock?: boolean
  /** Кэшбэк/баллы */
  loyalty?: string
  /** Регион продавца */
  location?: string
  /** B2B-режим */
  b2b?: boolean
  /** MOQ для B2B */
  moq?: number
  /** onClick всей карточки */
  onClick?: () => void
  /** onAddToCart */
  onAddToCart?: () => void
  /** onFavourite */
  onFavourite?: () => void
  className?: string
}

/**
 * ProductSnippet — карточка товара в выдаче.
 * Поддерживает B2C и B2B-режим по спецификации модуля #4.
 */
export function ProductSnippet({
  title,
  heroImage,
  price,
  priceOld,
  priceByPaymentMethod,
  installment,
  rating,
  ratingCount,
  badges = [],
  brand,
  deliveryEta,
  deliveryFee,
  inStock = true,
  loyalty,
  location,
  b2b = false,
  moq,
  onClick,
  onAddToCart,
  onFavourite,
  className,
}: ProductSnippetProps) {
  const discount = priceOld ? Math.round(((priceOld - price) / priceOld) * 100) : undefined

  return (
    <Card
      className={cn(
        "cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
        !inStock && "opacity-60",
        className
      )}
      onClick={onClick}
    >
      {/* Изображение */}
      <div className="relative aspect-square bg-muted overflow-hidden">
        {heroImage ? (
          <img
            src={heroImage}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            🛍️
          </div>
        )}
        {/* Бейджи */}
        {badges.length > 0 && (
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {badges.map((badge) => (
              <Badge key={badge} variant="secondary" className="text-[10px] px-1.5 py-0">
                {badge}
              </Badge>
            ))}
          </div>
        )}
        {discount && (
          <Badge className="absolute right-2 top-2 bg-red-500 text-white text-[10px] px-1.5 py-0">
            -{discount}%
          </Badge>
        )}
        {/* Избранное */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 bottom-2 h-8 w-8 rounded-full bg-white/80 dark:bg-black/40 hover:bg-white dark:hover:bg-black/60"
          onClick={(e) => { e.stopPropagation(); onFavourite?.() }}
        >
          <Heart className="h-4 w-4" />
        </Button>
      </div>

      <CardContent className="p-3">
        {/* Бренд */}
        {brand && (
          <p className="text-xs text-muted-foreground mb-0.5">{brand}</p>
        )}

        {/* Название */}
        <p className="text-sm font-medium leading-tight line-clamp-2 mb-2">{title}</p>

        {/* Рейтинг */}
        {rating !== undefined && (
          <div className="flex items-center gap-1 mb-2">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-medium">{rating}</span>
            {ratingCount !== undefined && (
              <span className="text-xs text-muted-foreground">({ratingCount})</span>
            )}
          </div>
        )}

        {/* Цены */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold">{price.toLocaleString("ru")} ₽</span>
            {priceOld && (
              <span className="text-xs text-muted-foreground line-through">
                {priceOld.toLocaleString("ru")} ₽
              </span>
            )}
          </div>
          {installment && (
            <p className="text-xs text-muted-foreground">{installment}</p>
          )}
          {priceByPaymentMethod && (
            <p className="text-xs text-primary">{priceByPaymentMethod}</p>
          )}
        </div>

        {/* Доставка */}
        {deliveryEta && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{deliveryEta}</span>
            {deliveryFee !== undefined && (
              <span>· {deliveryFee === 0 ? "бесплатно" : `${deliveryFee} ₽`}</span>
            )}
          </div>
        )}

        {/* Лояльность */}
        {loyalty && (
          <p className="mt-1 text-xs text-primary">{loyalty}</p>
        )}

        {/* Регион */}
        {location && (
          <p className="mt-1 text-[10px] text-muted-foreground">{location}</p>
        )}

        {/* B2B */}
        {b2b && moq && (
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">B2B</Badge>
            <span className="text-xs text-muted-foreground">MOQ: {moq} шт</span>
          </div>
        )}

        {/* Кнопка */}
        <Button
          size="sm"
          className="mt-3 w-full gap-1.5"
          disabled={!inStock}
          onClick={(e) => { e.stopPropagation(); onAddToCart?.() }}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {b2b ? "Запросить счёт" : inStock ? "В корзину" : "Нет в наличии"}
        </Button>
      </CardContent>
    </Card>
  )
}

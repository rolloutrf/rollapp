import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@rollapp/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rollapp/ui/components/card"
import { Badge } from "@rollapp/ui/components/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rollapp/ui/components/tabs"
import { Separator } from "@rollapp/ui/components/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rollapp/ui/components/table"
import {
  Star, ShoppingCart, Heart, Share2, Truck, Shield, RotateCcw,
  ChevronLeft, FileText, Package,
} from "lucide-react"

/* Мок-данные товара */
const mockProduct = {
  id: "1",
  title: "Ноутбук Lenovo IdeaPad 5 Pro 16\"",
  brand: "Lenovo",
  price: 74990,
  priceOld: 89990,
  rating: 4.7,
  ratingCount: 324,
  badges: ["Хит продаж"],
  installment: "от 12 498 ₽/мес",
  loyalty: "+1 500 баллов",
  deliveryEta: "Завтра, 10:00–14:00",
  deliveryFee: 0,
  inStock: true,
  description: "Мощный ноутбук с экраном 16\" WQXGA, процессором AMD Ryzen 7 7840HS, 16 ГБ LPDDR5, SSD 512 ГБ. Идеален для работы и развлечений.",
  specs: [
    { label: "Экран", value: "16\" WQXGA (2560×1600), IPS, 120Hz" },
    { label: "Процессор", value: "AMD Ryzen 7 7840HS" },
    { label: "ОЗУ", value: "16 ГБ LPDDR5" },
    { label: "Накопитель", value: "512 ГБ SSD PCIe 4.0" },
    { label: "Видеокарта", value: "AMD Radeon 780M" },
    { label: "Батарея", value: "75.4 Вт·ч" },
    { label: "Вес", value: "1.9 кг" },
  ],
  tierPricing: [
    { qty: "1–9", price: 74990, discount: "0%" },
    { qty: "10–49", price: 71240, discount: "5%" },
    { qty: "50+", price: 67490, discount: "10%" },
  ],
}

export function ProductPage() {
  const navigate = useNavigate()
  const { id: _id } = useParams()
  const product = mockProduct
  const discount = product.priceOld ? Math.round(((product.priceOld - product.price) / product.priceOld) * 100) : 0

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Навигация */}
      <Button variant="ghost" size="sm" className="w-fit gap-1" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" /> Назад
      </Button>

      {/* Верхняя часть: изображение + инфо */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Галерея */}
        <div className="flex flex-col gap-3">
          <div className="aspect-square rounded-xl bg-muted flex items-center justify-center text-6xl">
            💻
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-16 w-16 rounded-lg bg-muted flex items-center justify-center cursor-pointer border-2 transition-colors ${
                  i === 1 ? "border-primary" : "border-transparent hover:border-muted-foreground"
                }`}
              >
                <span className="text-lg">{i === 1 ? "💻" : i === 2 ? "⌨️" : i === 3 ? "🖱️" : "📦"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Инфо */}
        <div className="flex flex-col gap-4">
          {product.brand && (
            <p className="text-sm text-muted-foreground">{product.brand}</p>
          )}
          <h1 className="text-xl font-semibold leading-tight">{product.title}</h1>

          {/* Рейтинг */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">{product.rating}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              ({product.ratingCount} отзывов)
            </span>
          </div>

          {/* Бейджи */}
          {product.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {product.badges.map((badge) => (
                <Badge key={badge} variant="secondary">{badge}</Badge>
              ))}
              {discount > 0 && (
                <Badge className="bg-red-500 text-white">-{discount}%</Badge>
              )}
            </div>
          )}

          {/* Цена */}
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold">{product.price.toLocaleString("ru")} ₽</span>
              {product.priceOld && (
                <span className="text-base text-muted-foreground line-through">
                  {product.priceOld.toLocaleString("ru")} ₽
                </span>
              )}
            </div>
            {product.installment && (
              <p className="text-sm text-muted-foreground">{product.installment}</p>
            )}
            {product.loyalty && (
              <p className="text-sm text-primary font-medium">{product.loyalty}</p>
            )}
          </div>

          {/* Доставка */}
          <Card>
            <CardContent className="p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span>{product.deliveryEta}</span>
                <span className="text-muted-foreground">
                  · {product.deliveryFee === 0 ? "бесплатно" : `${product.deliveryFee} ₽`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                <span>Гарантия 1 год</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Возврат 14 дней</span>
              </div>
            </CardContent>
          </Card>

          {/* Действия */}
          <div className="flex flex-col gap-2">
            <Button className="w-full gap-2" disabled={!product.inStock}>
              <ShoppingCart className="h-4 w-4" />
              {product.inStock ? "В корзину" : "Нет в наличии"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5">
                <Heart className="h-4 w-4" /> В избранное
              </Button>
              <Button variant="outline" size="icon">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Табы: Описание / Характеристики / B2B */}
      <Tabs defaultValue="description">
        <TabsList>
          <TabsTrigger value="description">Описание</TabsTrigger>
          <TabsTrigger value="specs">Характеристики</TabsTrigger>
          <TabsTrigger value="b2b">
            <Package className="mr-1.5 h-4 w-4" />
            B2B
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm leading-relaxed">{product.description}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specs" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">Параметр</TableHead>
                    <TableHead>Значение</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.specs.map((spec) => (
                    <TableRow key={spec.label}>
                      <TableCell className="text-muted-foreground">{spec.label}</TableCell>
                      <TableCell className="font-medium">{spec.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="b2b" className="mt-4">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Оптовое ценообразование</CardTitle>
                <CardDescription>Скидки при закупке партий</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Количество</TableHead>
                      <TableHead>Цена за шт</TableHead>
                      <TableHead>Скидка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.tierPricing.map((tier) => (
                      <TableRow key={tier.qty}>
                        <TableCell>{tier.qty} шт</TableCell>
                        <TableCell className="font-medium">{tier.price.toLocaleString("ru")} ₽</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{tier.discount}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 gap-2">
                <FileText className="h-4 w-4" />
                Скачать КП
              </Button>
              <Button className="flex-1 gap-2">
                Запросить счёт
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

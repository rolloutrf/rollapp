import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Input } from "@rollapp/ui/components/input"
import { Button } from "@rollapp/ui/components/button"
import { Badge } from "@rollapp/ui/components/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rollapp/ui/components/select"
import { ProductSnippet } from "@rollapp/ui/components/product-snippet"
import { Search, SlidersHorizontal, X, Sparkles, ArrowRight, TrendingUp } from "lucide-react"

const categories = [
  "Все", "Электроника", "Одежда", "Дом и сад", "Продукты", "Красота", "Спорт", "Авто",
]

const sortOptions = [
  { value: "popular", label: "По популярности" },
  { value: "price-asc", label: "Сначала дешёвые" },
  { value: "price-desc", label: "Сначала дорогие" },
  { value: "rating", label: "По рейтингу" },
  { value: "new", label: "Новинки" },
]

const mockProducts = [
  {
    id: "1", title: "Ноутбук Lenovo IdeaPad 5 Pro 16\"", price: 74990, priceOld: 89990,
    brand: "Lenovo", rating: 4.7, ratingCount: 324, badges: ["hit"],
    deliveryEta: "Завтра", deliveryFee: 0, loyalty: "+1 500 баллов", location: "Москва",
    installment: "от 12 498 ₽/мес",
  },
  {
    id: "2", title: "Смартфон Samsung Galaxy S24 Ultra 256GB", price: 109990, priceOld: 129990,
    brand: "Samsung", rating: 4.8, ratingCount: 1052, badges: ["new", "sale"],
    deliveryEta: "2 дня", deliveryFee: 299, loyalty: "+2 200 баллов", location: "Москва",
    installment: "от 18 332 ₽/мес",
  },
  {
    id: "3", title: "Наушники Sony WH-1000XM5", price: 29990, priceOld: 34990,
    brand: "Sony", rating: 4.9, ratingCount: 847, badges: ["hit"],
    deliveryEta: "Завтра", deliveryFee: 0, loyalty: "+600 баллов", location: "СПб",
  },
  {
    id: "4", title: "Клавиатура Keychron Q1 Pro", price: 18990,
    brand: "Keychron", rating: 4.6, ratingCount: 128, badges: [],
    deliveryEta: "3–5 дней", deliveryFee: 199, location: "Казань",
  },
  {
    id: "5", title: "Монитор LG UltraGear 27\" 4K 144Hz", price: 54990,
    brand: "LG", rating: 4.5, ratingCount: 256, badges: ["sale"],
    deliveryEta: "2 дня", deliveryFee: 0, loyalty: "+1 100 баллов", location: "Москва",
    priceByPaymentMethod: "52 790 ₽ при оплате СБП",
  },
  {
    id: "6", title: "Рюкзак Targus Drifter II 29L", price: 4990, inStock: false,
    brand: "Targus", rating: 4.3, ratingCount: 89, badges: [],
    deliveryEta: "7 дней", location: "Новосибирск",
  },
]

export function CataloguePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Все")
  const [sort, setSort] = useState("popular")
  const [showFilters, setShowFilters] = useState(false)

  const filtered = mockProducts.filter((p) => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !(p.brand?.toLowerCase().includes(search.toLowerCase()))) return false
    if (category !== "Все") return p.brand === category || p.title.toLowerCase().includes(category.toLowerCase())
    return true
  })

  return (
    <div className="flex flex-col">
      {/* ═══ Hero ═══ */}
      <section className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-primary/8 via-background to-background px-6 pb-8 pt-10">
        {/* Фоновые блики */}
        <div className="pointer-events-none absolute -top-20 left-1/4 h-60 w-60 rounded-full bg-primary/10 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-10 right-1/4 h-40 w-40 rounded-full bg-chart-2/8 blur-[80px]" />

        <div className="relative z-10 mx-auto max-w-3xl animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Badge className="gap-1 bg-primary/15 text-primary border-primary/20 hover:bg-primary/20">
              <Sparkles className="h-3 w-3" /> Новое
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight leading-tight sm:text-4xl">
            Ваш финтех-
            <span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">маркетплейс</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground leading-relaxed">
            Платежи, покупки, доставка — всё в одном приложении.
            Кэшбэк до 5% и персональный AI-ассистент.
          </p>

          {/* Быстрые ссылки */}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => navigate("/payments")}>
              <TrendingUp className="h-3.5 w-3.5" /> Платежи
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => navigate("/assistant")}>
              <Sparkles className="h-3.5 w-3.5" /> Ассистент
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => navigate("/loyalty")}>
              <ArrowRight className="h-3.5 w-3.5" /> Лояльность
            </Button>
          </div>
        </div>
      </section>

      {/* ═══ Каталог ═══ */}
      <section className="flex flex-col gap-6 p-6">
        {/* Поиск */}
        <div className="flex gap-2 animate-fade-in" style={{ animationDelay: "80ms" }}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Искать товары…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setSearch("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            className="h-10 w-10"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Категории */}
        <div className="flex flex-wrap gap-2 animate-fade-in" style={{ animationDelay: "140ms" }}>
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={category === cat ? "default" : "secondary"}
              className="cursor-pointer transition-colors"
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>

        {/* Фильтры-панель */}
        {showFilters && (
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur p-3 animate-slide-in">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="cursor-pointer" onClick={() => { setCategory("Все"); setSort("popular"); setSearch(""); }}>
              Сбросить
            </Badge>
          </div>
        )}

        {/* Сетка товаров */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 animate-fade-in" style={{ animationDelay: "200ms" }}>
          {filtered.map((product) => (
            <ProductSnippet
              key={product.id}
              title={product.title}
              price={product.price}
              priceOld={product.priceOld}
              priceByPaymentMethod={product.priceByPaymentMethod}
              installment={product.installment}
              brand={product.brand}
              rating={product.rating}
              ratingCount={product.ratingCount}
              badges={product.badges}
              deliveryEta={product.deliveryEta}
              deliveryFee={product.deliveryFee}
              inStock={product.inStock !== false}
              loyalty={product.loyalty}
              location={product.location}
              onClick={() => navigate(`/product/${product.id}`)}
              onAddToCart={() => console.log("Add to cart:", product.id)}
              onFavourite={() => console.log("Favourite:", product.id)}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-lg font-medium">Ничего не найдено</p>
            <p className="text-sm text-muted-foreground">Попробуйте изменить запрос или категорию</p>
            <Button variant="outline" onClick={() => { setSearch(""); setCategory("Все"); }}>
              Сбросить фильтры
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

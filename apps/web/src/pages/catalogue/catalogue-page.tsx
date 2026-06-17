import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Input } from "@rollapp/ui/components/input"
import { Button } from "@rollapp/ui/components/button"
import { Badge } from "@rollapp/ui/components/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rollapp/ui/components/select"
import { ProductSnippet } from "@rollapp/ui/components/product-snippet"
import { Search, SlidersHorizontal, X } from "lucide-react"

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

/* Мок-данные */
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
    <div className="flex flex-col gap-6">
      {/* Заголовок + поиск */}
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Каталог</h1>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Искать товары…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
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
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Категории */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <Badge
            key={cat}
            variant={category === cat ? "default" : "secondary"}
            className="cursor-pointer"
            onClick={() => setCategory(cat)}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {/* Фильтры-панель */}
      {showFilters && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
    </div>
  )
}

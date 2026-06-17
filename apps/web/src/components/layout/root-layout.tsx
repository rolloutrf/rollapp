import { Outlet, Link } from "react-router-dom"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarSeparator,
} from "@rollapp/ui/components/sidebar"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import {
  ShoppingCart,
  Truck,
  CreditCard,
  Receipt,
  History,
  PieChart,
  Gift,
  Bot,
  User,
  ShieldCheck,
} from "lucide-react"

const navGroups = [
  {
    label: "Маркетплейс",
    items: [
      { title: "Каталог", href: "/", icon: ShoppingCart },
      { title: "Доставка", href: "/delivery", icon: Truck },
    ],
  },
  {
    label: "Финтех",
    items: [
      { title: "Платежи", href: "/payments", icon: CreditCard },
      { title: "Чекаут", href: "/checkout", icon: Receipt },
      { title: "История", href: "/history", icon: History },
    ],
  },
  {
    label: "Управление",
    items: [
      { title: "PFM", href: "/pfm", icon: PieChart },
      { title: "Лояльность", href: "/loyalty", icon: Gift },
      { title: "Ассистент", href: "/assistant", icon: Bot },
    ],
  },
  {
    label: "Аккаунт",
    items: [
      { title: "Профиль", href: "/profile", icon: User },
      { title: "Идентификация", href: "/kyc", icon: ShieldCheck },
    ],
  },
]

export function RootLayout() {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="text-lg font-bold tracking-tight">RollApp</span>
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild>
                        <Link to={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs text-muted-foreground">v0.0.1</span>
            <ThemeToggle />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

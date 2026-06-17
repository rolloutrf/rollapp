import { Outlet, Link, useLocation } from "react-router-dom"
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
  SidebarSeparator,
} from "@rollapp/ui/components/sidebar"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import {
  Store, Truck, CreditCard, Receipt, History,
  PieChart, Gift, Bot, User, ShieldCheck,
  LogOut,
} from "lucide-react"

const navGroups = [
  {
    label: "Маркетплейс",
    items: [
      { title: "Каталог", href: "/", icon: Store },
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

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-4 py-3 group">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(262,83%,68%)] to-[hsl(230,60%,50%)] shadow-lg shadow-primary/20 transition-shadow group-hover:shadow-primary/30">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17V7h3.5a3.5 3.5 0 0 1 0 7H9.5l5.5 3.5L17 7" />
        </svg>
      </div>
      <span className="text-base font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text">RollApp</span>
    </Link>
  )
}

export function RootLayout() {
  const location = useLocation()

  return (
    <SidebarProvider>
      <Sidebar className="border-r-0">
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          {navGroups.map((group, gi) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href ||
                      (item.href !== "/" && location.pathname.startsWith(item.href))
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                          }
                        >
                          <Link to={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
              {gi < navGroups.length - 1 && <SidebarSeparator />}
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <div className="flex flex-col gap-2 px-4 py-2">
            <SidebarMenuButton className="text-muted-foreground/60 hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span>Выход</span>
            </SidebarMenuButton>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/40 font-mono">v0.1.0</span>
              <ThemeToggle />
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

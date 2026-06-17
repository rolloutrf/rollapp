import { Outlet } from "react-router-dom"
import { ThemeToggle } from "@/components/shared/theme-toggle"

export function AuthLayout() {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background p-4">
      {/* Фоновый градиент */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/4 h-[80vh] w-[80vh] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute -bottom-1/3 -right-1/4 h-[60vh] w-[60vh] rounded-full bg-chart-2/6 blur-[100px]" />
        <div className="absolute top-1/4 right-1/3 h-[40vh] w-[40vh] rounded-full bg-chart-4/5 blur-[80px]" />
      </div>

      {/* Контент */}
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-6">
        {/* Логотип */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(262,83%,68%)] to-[hsl(230,60%,50%)] shadow-lg shadow-primary/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17V7h3.5a3.5 3.5 0 0 1 0 7H9.5l5.5 3.5L17 7" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">RollApp</span>
          </div>
          <ThemeToggle />
        </div>

        {/* Стеклянная карточка */}
        <div className="rounded-2xl border border-border/50 bg-card/80 p-6 shadow-2xl shadow-black/10 backdrop-blur-xl">
          <Outlet />
        </div>

        <p className="text-center text-xs text-muted-foreground/50">
          © 2026 RollApp. Все права защищены.
        </p>
      </div>
    </div>
  )
}

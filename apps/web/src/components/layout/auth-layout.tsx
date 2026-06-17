import { Outlet } from "react-router-dom"
import { ThemeToggle } from "@/components/shared/theme-toggle"

export function AuthLayout() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">RollApp</span>
          <ThemeToggle />
        </div>
        <Outlet />
      </div>
    </div>
  )
}

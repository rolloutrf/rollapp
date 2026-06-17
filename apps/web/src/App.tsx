import { Suspense } from "react"
import { RouterProvider } from "react-router-dom"
import { router } from "@/app/router"

export function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <div className="text-sm text-muted-foreground">Загрузка…</div>
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  )
}

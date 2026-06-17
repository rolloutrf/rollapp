import { createBrowserRouter } from "react-router-dom"
import { RootLayout } from "@/components/layout/root-layout"
import { AuthLayout } from "@/components/layout/auth-layout"

// Ленивые импорты страниц для code splitting
import { lazy } from "react"

const LoginPage = lazy(() => import("@/pages/auth/login").then(m => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import("@/pages/auth/register").then(m => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() => import("@/pages/auth/forgot-password").then(m => ({ default: m.ForgotPasswordPage })))

const KycPage = lazy(() => import("@/pages/kyc/kyc-page").then(m => ({ default: m.KycPage })))
const ProfilePage = lazy(() => import("@/pages/profile/profile-page").then(m => ({ default: m.ProfilePage })))

const CataloguePage = lazy(() => import("@/pages/catalogue/catalogue-page").then(m => ({ default: m.CataloguePage })))
const ProductPage = lazy(() => import("@/pages/product/product-page").then(m => ({ default: m.ProductPage })))
const DeliveryPage = lazy(() => import("@/pages/delivery/delivery-page").then(m => ({ default: m.DeliveryPage })))

const PaymentsPage = lazy(() => import("@/pages/payments/payments-page").then(m => ({ default: m.PaymentsPage })))
const CheckoutPage = lazy(() => import("@/pages/checkout/checkout-page").then(m => ({ default: m.CheckoutPage })))
const HistoryPage = lazy(() => import("@/pages/history/history-page").then(m => ({ default: m.HistoryPage })))

const PfmPage = lazy(() => import("@/pages/pfm/pfm-page").then(m => ({ default: m.PfmPage })))
const LoyaltyPage = lazy(() => import("@/pages/loyalty/loyalty-page").then(m => ({ default: m.LoyaltyPage })))
const AssistantPage = lazy(() => import("@/pages/assistant/assistant-page").then(m => ({ default: m.AssistantPage })))

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      // Маркетплейс
      { path: "", element: <CataloguePage /> },
      { path: "product/:id", element: <ProductPage /> },
      { path: "delivery", element: <DeliveryPage /> },

      // Финтех
      { path: "payments", element: <PaymentsPage /> },
      { path: "checkout", element: <CheckoutPage /> },
      { path: "history", element: <HistoryPage /> },

      // PFM и лояльность
      { path: "pfm", element: <PfmPage /> },
      { path: "loyalty", element: <LoyaltyPage /> },

      // AI
      { path: "assistant", element: <AssistantPage /> },

      // Профиль
      { path: "profile", element: <ProfilePage /> },
      { path: "kyc", element: <KycPage /> },
    ],
  },
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
    ],
  },
])

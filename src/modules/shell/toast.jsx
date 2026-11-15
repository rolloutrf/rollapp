import { createContext, useCallback, useContext } from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const isMobile = useIsMobile();
  const show = useCallback((message, tone = "default") => {
    if (tone === "error") return sonnerToast.error(message);
    if (tone === "success") return sonnerToast.success(message);
    return sonnerToast(message);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Toaster
        theme="dark"
        position={isMobile ? "top-center" : "bottom-left"}
        offset={16}
        mobileOffset={{
          top: "calc(12px + env(safe-area-inset-top))",
          bottom: "calc(12px + env(safe-area-inset-bottom))",
          left: 12,
          right: 12,
        }}
        richColors
        closeButton
      />
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }

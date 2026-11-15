import { useEffect, useRef } from "react";
import { toast as sonnerToast } from "sonner";

export function useGlobalShareHandler() {
  const handlerRef = useRef(null);
  useEffect(() => {
    const handleShare = (event) => {
      if (!handlerRef.current) return;
      event.detail.handled = true;
      void Promise.resolve().then(() => handlerRef.current?.()).catch(() => sonnerToast.error("Не удалось скопировать ссылку"));
    };
    window.addEventListener("rollapp:share-request", handleShare);
    return () => window.removeEventListener("rollapp:share-request", handleShare);
  }, []);
  return handlerRef;
}

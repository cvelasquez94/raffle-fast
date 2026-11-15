import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/analytics";

/**
 * Registra una vista de página en cada cambio de ruta. Solo envía el path
 * (sin query string) y, si viene, el parámetro `ref` de campañas/referidos.
 */
export const AnalyticsTracker = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const ref = new URLSearchParams(search).get("ref");
    const safeRef = ref && /^[a-z0-9_-]{1,32}$/i.test(ref) ? ref : undefined;
    trackPageView(pathname, safeRef ? { ref: safeRef } : {});
    // Solo al cambiar de ruta; `search` se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
};

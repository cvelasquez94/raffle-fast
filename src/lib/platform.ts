import { supabase } from "@/integrations/supabase/client";

/**
 * Comisión de la plataforma sobre los pagos online, en porcentaje.
 * Devuelve null si no se pudo leer, para que la pantalla muestre un texto
 * genérico en lugar de un número equivocado.
 */
export async function getPlatformFeePercent(): Promise<number | null> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("marketplace_fee_percent")
    .maybeSingle();

  if (error || data?.marketplace_fee_percent == null) return null;

  const percent = Number(data.marketplace_fee_percent);
  return Number.isFinite(percent) ? percent : null;
}

/** "5%" o "4,5%". */
export function formatFeePercent(percent: number): string {
  return `${percent.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

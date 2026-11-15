import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

const PENDING_ORDER_KEY = "pending_payment";
const PENDING_ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface BuyerData {
  name: string;
  email: string;
  phone: string;
}

interface PendingOrder {
  raffleId: string;
  orderId: string;
  timestamp: number;
}

/**
 * Llama a una Edge Function y devuelve su respuesta. Si la función responde
 * con error, lanza un Error con el mensaje que envió el servidor.
 */
async function invokeFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let message = "No se pudo completar la operación. Por favor intentá nuevamente.";
    try {
      const payload = await (error as any).context?.json?.();
      if (payload?.error) message = payload.error;
    } catch {
      // La respuesta no era JSON: nos quedamos con el mensaje genérico.
    }
    throw new Error(message);
  }

  return data as T;
}

/** Reserva números por 24 horas (todos o ninguno). */
export async function reserveNumbers(raffleId: string, numberIds: string[], buyer: BuyerData) {
  const { error } = await supabase.rpc("reserve_numbers", {
    p_raffle_id: raffleId,
    p_number_ids: numberIds,
    p_buyer_name: buyer.name.trim(),
    p_buyer_email: buyer.email.trim() || null,
    p_buyer_phone: buyer.phone.trim() || null,
  });

  if (error) throw new Error(error.message);

  // Sin datos del comprador: solo el talonario y la cantidad de números.
  track("reservation_made", { raffle_id: raffleId, quantity: numberIds.length, method: "whatsapp" });
}

/**
 * Reserva los números y crea el pago en Mercado Pago del lado del servidor.
 * Devuelve el link al que hay que redirigir al comprador.
 */
export async function startMercadoPagoPayment(raffleId: string, numberIds: string[], buyer: BuyerData) {
  const result = await invokeFunction<{ order_id: string; payment_link: string; amount: number }>(
    "mp-create-payment",
    {
      raffle_id: raffleId,
      number_ids: numberIds,
      buyer: { name: buyer.name.trim(), email: buyer.email.trim(), phone: buyer.phone.trim() },
    }
  );

  const pending: PendingOrder = { raffleId, orderId: result.order_id, timestamp: Date.now() };
  localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(pending));

  track("payment_started", {
    raffle_id: raffleId,
    quantity: numberIds.length,
    value: result.amount,
    currency: "ARS",
    method: "mercadopago",
  });

  return result;
}

/** Orden de pago iniciada desde este navegador para este talonario, si hay una vigente. */
export function getPendingOrder(raffleId: string): PendingOrder | null {
  try {
    const raw = localStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) return null;

    const pending = JSON.parse(raw) as PendingOrder;
    if (!pending.orderId || Date.now() - pending.timestamp > PENDING_ORDER_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_ORDER_KEY);
      return null;
    }

    return pending.raffleId === raffleId ? pending : null;
  } catch {
    localStorage.removeItem(PENDING_ORDER_KEY);
    return null;
  }
}

export function clearPendingOrder() {
  localStorage.removeItem(PENDING_ORDER_KEY);
}

/** Consulta al servidor el estado de una orden (respaldo del webhook de Mercado Pago). */
export async function verifyOrderPayment(orderId: string) {
  const result = await invokeFunction<{ status: string }>("mp-verify-payment", { order_id: orderId });
  return result.status;
}

/** URL de autorización de Mercado Pago para el usuario logueado. */
export async function getMercadoPagoConnectUrl() {
  const result = await invokeFunction<{ url: string }>("mp-oauth-start");
  return result.url;
}

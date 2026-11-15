// Lógica pura de las Edge Functions de Mercado Pago.
//
// Este archivo no usa `Deno.*` ni imports por URL a propósito: lo importan las
// Edge Functions (Deno) y también los tests de Vitest (Node), ver
// supabase/tests/functions/logic.test.ts. Todo lo que dependa del entorno
// (variables, red, base de datos) queda en mp.ts o en cada función.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Error cuyo mensaje se puede mostrar tal cual al usuario. */
export class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Primera IP del header `x-forwarded-for` (la del cliente), o null. */
export function firstForwardedIp(forwardedFor: string | null | undefined): string | null {
  return (forwardedFor || "").split(",")[0].trim() || null;
}

/**
 * Comisión de la plataforma, en porcentaje sobre el total cobrado.
 * `raw` es platform_settings.marketplace_fee_percent o, si esa fila no se
 * pudo leer, MP_MARKETPLACE_FEE_PERCENT: sin definir vale 5; un valor
 * inválido o fuera de [0, 100) vale 0.
 */
export function parseFeePercent(raw: string | number | null | undefined): number {
  const value = Number(raw ?? "5");
  return Number.isFinite(value) && value >= 0 && value < 100 ? value : 0;
}

/** Total de la orden y comisión de la plataforma, redondeados a centavos. */
export function computeOrderAmounts(
  unitPrice: number,
  quantity: number,
  feePercent: number,
): { amount: number; fee: number } {
  const amount = Math.round(unitPrice * quantity * 100) / 100;
  const fee = Math.round(amount * feePercent) / 100;
  return { amount, fee };
}

/** Fecha de vencimiento (ISO) a partir del `expires_in` de un token OAuth. */
export function expiresAtFrom(expiresInSeconds: unknown, now: number = Date.now()): string | null {
  const seconds = Number(expiresInSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(now + seconds * 1000).toISOString();
}

/** Margen con el que se renueva el access token antes de que venza. */
export const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

export function tokenNeedsRefresh(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : null;
  return expiresAtMs !== null && expiresAtMs - now < REFRESH_MARGIN_MS;
}

/**
 * Decide qué estado aplicar a una orden a partir de un pago leído de la API
 * de Mercado Pago. Devuelve el estado del pago, salvo en dos casos en los que
 * hay plata cobrada y el organizador tiene que intervenir:
 *   - 'amount_mismatch': aprobado, pero no en ARS o por menos que la orden.
 *   - 'partially_refunded': aprobado con una devolución parcial.
 * La función SQL apply_order_payment convierte ambos en un conflicto.
 * Lanza UserError si el pago es de otra orden.
 */
export function resolvePaymentOutcome(
  order: { id: string; amount: number | string },
  // deno-lint-ignore no-explicit-any
  payment: any,
): { status: string; detail: string | null; mismatch: boolean } {
  if (payment.external_reference !== order.id) {
    throw new UserError("El pago no corresponde a esta orden");
  }

  const status: string = payment.status;
  const detail: string | null = payment.status_detail ?? null;

  if (status === "approved") {
    const paid = Number(payment.transaction_amount);
    if (payment.currency_id !== "ARS" || !(paid >= Number(order.amount))) {
      return { status: "amount_mismatch", detail: "amount_mismatch", mismatch: true };
    }
    if (detail === "partially_refunded" || Number(payment.transaction_amount_refunded) > 0) {
      return { status: "partially_refunded", detail: "partially_refunded", mismatch: false };
    }
  }

  return { status, detail, mismatch: false };
}

/** De los pagos de una orden, el aprobado si hay; si no, el primero (el más reciente). */
// deno-lint-ignore no-explicit-any
export function pickRelevantPayment(results: any[] | null | undefined): any | undefined {
  const list = results ?? [];
  return list.find((p) => p.status === "approved") ?? list[0];
}

/**
 * Interpreta una notificación de Mercado Pago.
 *   - Formato nuevo: ?type=payment&data.id=123 (y lo mismo en el body).
 *   - Formato IPN viejo: ?topic=payment&id=123.
 * `order` es el parámetro que agregamos nosotros a la notification_url.
 * Devuelve null si la notificación no es de un pago o no es utilizable
 * (merchant_order, ids con formato inesperado, etc.).
 */
export function parseWebhookNotification(
  url: URL,
  // deno-lint-ignore no-explicit-any
  body: any,
): { orderId: string; paymentId: string } | null {
  const orderId = url.searchParams.get("order") ?? "";

  const type = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body?.type ?? body?.topic;
  const paymentId = url.searchParams.get("data.id") ?? body?.data?.id ??
    (type === "payment" ? url.searchParams.get("id") : null);

  if (type !== "payment" || !paymentId || !UUID_RE.test(orderId)) {
    return null;
  }
  if (!/^\d+$/.test(String(paymentId))) {
    return null;
  }

  return { orderId, paymentId: String(paymentId) };
}

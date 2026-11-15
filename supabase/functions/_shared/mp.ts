// Código compartido por las Edge Functions de Mercado Pago.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const MP_API = "https://api.mercadopago.com";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Error cuyo mensaje se puede mostrar tal cual al usuario. */
export class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof UserError) {
    return json({ error: error.message }, error.status);
  }
  console.error("Unexpected error:", error);
  return json({ error: "Ocurrió un error inesperado. Probá de nuevo." }, 500);
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function appUrl(): string {
  return (Deno.env.get("APP_URL") || "http://localhost:8080").replace(/\/$/, "");
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || null;
}

/** Comisión de la plataforma, en porcentaje sobre el total cobrado. */
export function feePercent(): number {
  const value = Number(Deno.env.get("MP_MARKETPLACE_FEE_PERCENT") ?? "5");
  return Number.isFinite(value) && value >= 0 && value < 100 ? value : 0;
}

const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Devuelve el access token del organizador, renovándolo si está por vencer.
 * Devuelve null si el organizador no tiene Mercado Pago conectado.
 */
export async function getSellerAccessToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: creds, error } = await admin
    .from("mp_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!creds) return null;

  const expiresAt = creds.expires_at ? new Date(creds.expires_at).getTime() : null;
  const needsRefresh = expiresAt !== null && expiresAt - Date.now() < REFRESH_MARGIN_MS;

  if (!needsRefresh || !creds.refresh_token) {
    return creds.access_token;
  }

  const response = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: Deno.env.get("MP_CLIENT_ID")!,
      client_secret: Deno.env.get("MP_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
    }),
  });

  if (!response.ok) {
    console.error("MP token refresh failed:", response.status, await response.text());
    // Si todavía no venció, seguimos con el token actual.
    return expiresAt !== null && expiresAt > Date.now() ? creds.access_token : null;
  }

  const token = await response.json();

  const { error: updateError } = await admin
    .from("mp_credentials")
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? creds.refresh_token,
      expires_at: expiresAtFrom(token.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) throw updateError;

  return token.access_token;
}

export function expiresAtFrom(expiresInSeconds: unknown): string | null {
  const seconds = Number(expiresInSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

interface OrderRow {
  id: string;
  raffle_id: string;
  amount: number;
  status: string;
}

/** Carga la orden y el access token del organizador dueño del talonario. */
export async function loadOrderContext(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ order: OrderRow; accessToken: string | null } | null> {
  const { data: order, error } = await admin
    .from("payment_orders")
    .select("id, raffle_id, amount, status, raffles(user_id)")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!order) return null;

  // deno-lint-ignore no-explicit-any
  const ownerId = (order as any).raffles?.user_id as string | undefined;
  const accessToken = ownerId ? await getSellerAccessToken(admin, ownerId) : null;

  return { order: order as unknown as OrderRow, accessToken };
}

/**
 * Aplica a la orden el estado de un pago leído de la API de Mercado Pago.
 * Nunca confía en datos del request: `payment` tiene que venir de MP_API.
 */
export async function applyPaymentToOrder(
  admin: SupabaseClient,
  order: OrderRow,
  // deno-lint-ignore no-explicit-any
  payment: any,
): Promise<string> {
  if (payment.external_reference !== order.id) {
    throw new UserError("El pago no corresponde a esta orden");
  }

  let status: string = payment.status;
  let detail: string | null = payment.status_detail ?? null;

  if (status === "approved") {
    const paid = Number(payment.transaction_amount);
    if (payment.currency_id !== "ARS" || !(paid >= Number(order.amount))) {
      console.error("Payment amount mismatch", { order: order.id, payment: payment.id, paid });
      status = "rejected";
      detail = "amount_mismatch";
    }
  }

  const { data, error } = await admin.rpc("apply_order_payment", {
    p_order_id: order.id,
    p_mp_payment_id: String(payment.id),
    p_status: status,
    p_status_detail: detail,
  });

  if (error) throw error;
  return data as string;
}

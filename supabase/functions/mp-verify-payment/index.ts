// Verifica el estado de una orden consultando a Mercado Pago.
// Respaldo del webhook: el frontend lo llama cuando el comprador vuelve de pagar.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  applyPaymentToOrder,
  corsHeaders,
  errorResponse,
  json,
  loadOrderContext,
  MP_API,
  UserError,
} from "../_shared/mp.ts";
import { pickRelevantPayment, UUID_RE } from "../_shared/logic.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const orderId: string = body?.order_id ?? "";
    if (!UUID_RE.test(orderId)) {
      throw new UserError("Solicitud inválida");
    }

    const admin = adminClient();
    const context = await loadOrderContext(admin, orderId);
    if (!context) throw new UserError("Orden inexistente", 404);

    // Ya resuelta por el webhook.
    if (context.order.status === "approved" || context.order.status === "conflict") {
      return json({ status: context.order.status });
    }
    if (!context.accessToken) {
      return json({ status: context.order.status });
    }

    const searchResponse = await fetch(
      `${MP_API}/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc`,
      { headers: { Authorization: `Bearer ${context.accessToken}` } },
    );

    if (!searchResponse.ok) {
      console.error("MP payment search failed:", searchResponse.status);
      return json({ status: context.order.status });
    }

    const payment = pickRelevantPayment((await searchResponse.json()).results);

    if (!payment) {
      return json({ status: context.order.status });
    }

    const status = await applyPaymentToOrder(admin, context.order, payment);
    return json({ status });
  } catch (error) {
    return errorResponse(error);
  }
});

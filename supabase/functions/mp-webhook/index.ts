// Notificaciones de pago de Mercado Pago (notification_url de la preferencia).
// Se despliega sin verificación de JWT porque lo llama Mercado Pago.
// No confía en el contenido de la notificación: solo toma el id del pago y
// lee el pago real desde la API de Mercado Pago con el token del organizador.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, applyPaymentToOrder, loadOrderContext, MP_API } from "../_shared/mp.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ok = () => new Response("ok", { status: 200 });

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order") ?? "";
    const body = await req.json().catch(() => ({}));

    // Formato nuevo: ?type=payment&data.id=123 (y lo mismo en el body).
    // Formato IPN viejo: ?topic=payment&id=123.
    const type = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body?.type ?? body?.topic;
    const paymentId = url.searchParams.get("data.id") ?? body?.data?.id ??
      (type === "payment" ? url.searchParams.get("id") : null);

    if (type !== "payment" || !paymentId || !UUID_RE.test(orderId)) {
      return ok(); // merchant_order u otros avisos: no nos interesan.
    }
    if (!/^\d+$/.test(String(paymentId))) {
      return ok();
    }

    const admin = adminClient();
    const context = await loadOrderContext(admin, orderId);
    if (!context || !context.accessToken) {
      console.error("Webhook for unknown order or disconnected seller:", orderId);
      return ok();
    }

    const paymentResponse = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${context.accessToken}` },
    });

    if (paymentResponse.status === 404) {
      return ok();
    }
    if (!paymentResponse.ok) {
      // Error transitorio: 500 para que Mercado Pago reintente.
      console.error("MP payment fetch failed:", paymentResponse.status);
      return new Response("retry", { status: 500 });
    }

    const payment = await paymentResponse.json();

    if (payment.external_reference !== orderId) {
      console.error("Payment does not belong to order:", { orderId, paymentId });
      return ok();
    }

    const status = await applyPaymentToOrder(admin, context.order, payment);
    console.log("Order updated from webhook:", { orderId, paymentId, status });

    return ok();
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("error", { status: 500 });
  }
});

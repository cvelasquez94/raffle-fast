// Notificaciones de pago de Mercado Pago (notification_url de la preferencia).
// Se despliega sin verificación de JWT porque lo llama Mercado Pago.
// No confía en el contenido de la notificación: solo toma el id del pago y
// lee el pago real desde la API de Mercado Pago con el token del organizador.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, applyPaymentToOrder, loadOrderContext, MP_API } from "../_shared/mp.ts";
import { parseWebhookNotification } from "../_shared/logic.ts";

const ok = () => new Response("ok", { status: 200 });

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const notification = parseWebhookNotification(url, body);
    if (!notification) {
      return ok(); // merchant_order u otros avisos: no nos interesan.
    }
    const { orderId, paymentId } = notification;

    const admin = adminClient();
    const context = await loadOrderContext(admin, orderId);
    if (!context) {
      console.error("Webhook for unknown order:", orderId);
      return ok();
    }
    if (!context.accessToken) {
      // Sin credenciales no se puede leer el pago. Queda anotado en la orden
      // para que no pase desapercibido.
      console.error("Webhook for an order whose seller has no Mercado Pago credentials:", orderId);
      await admin
        .from("payment_orders")
        .update({ status_detail: "seller_disconnected", mp_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("status", "pending");
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

// Reserva números y crea la preferencia de pago en Mercado Pago.
// Todo ocurre del lado del servidor: el access token del organizador nunca
// llega al navegador, y el precio se toma de la base, no del request.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  appUrl,
  clientIp,
  corsHeaders,
  errorResponse,
  feePercent,
  getSellerAccessToken,
  json,
  MP_API,
  UserError,
} from "../_shared/mp.ts";
import { computeOrderAmounts, UUID_RE } from "../_shared/logic.ts";

const PREFERENCE_ERROR = "No se pudo generar el link de pago. Probá de nuevo o reservá por WhatsApp.";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const raffleId: string = body?.raffle_id;
    const numberIds: string[] = Array.isArray(body?.number_ids) ? [...new Set<string>(body.number_ids)] : [];
    const buyerName = String(body?.buyer?.name ?? "").trim();
    const buyerEmail = String(body?.buyer?.email ?? "").trim() || null;
    const buyerPhone = String(body?.buyer?.phone ?? "").trim() || null;

    if (!UUID_RE.test(raffleId ?? "") || numberIds.length === 0 || !numberIds.every((id) => UUID_RE.test(id))) {
      throw new UserError("Solicitud inválida");
    }

    const admin = adminClient();

    const { data: raffle, error: raffleError } = await admin
      .from("raffles")
      .select("id, title, price_per_number, user_id, status")
      .eq("id", raffleId)
      .maybeSingle();

    if (raffleError) throw raffleError;
    if (!raffle) throw new UserError("El talonario no existe", 404);

    const accessToken = await getSellerAccessToken(admin, raffle.user_id);
    if (!accessToken) {
      throw new UserError("Mercado Pago no está configurado para este talonario");
    }

    // 1. Reservar (atómico: o se reservan todos o ninguno).
    const { data: reservedUntil, error: reserveError } = await admin.rpc("reserve_numbers_internal", {
      p_raffle_id: raffleId,
      p_number_ids: numberIds,
      p_buyer_name: buyerName,
      p_buyer_email: buyerEmail,
      p_buyer_phone: buyerPhone,
      p_ip: clientIp(req),
    });

    if (reserveError) {
      // Los mensajes de la función SQL están pensados para el usuario.
      throw new UserError(reserveError.message, 409);
    }

    // 2. Crear la orden.
    const quantity = numberIds.length;
    const unitPrice = Number(raffle.price_per_number);
    const { amount, fee } = computeOrderAmounts(unitPrice, quantity, await feePercent(admin));

    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .insert({
        raffle_id: raffleId,
        number_ids: numberIds,
        amount,
        fee_amount: fee,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone,
      })
      .select("id")
      .single();

    if (orderError) {
      await releaseNumbers(admin, numberIds, null);
      throw orderError;
    }

    // Desde acá, cualquier falla tiene que liberar los números y cancelar la
    // orden: si no, quedarían reservados 24 horas sin que nadie pueda pagarlos.
    // deno-lint-ignore no-explicit-any
    let mpData: any;
    try {
      // Sin este vínculo apply_order_payment no reconoce los números como de
      // esta orden y un pago aprobado terminaría en "conflict".
      const { data: linked, error: linkError } = await admin
        .from("raffle_numbers")
        .update({ order_id: order.id })
        .in("id", numberIds)
        .eq("status", "reserved")
        .select("id");

      if (linkError) throw linkError;
      if ((linked ?? []).length !== numberIds.length) {
        throw new Error(`Linked ${(linked ?? []).length} of ${numberIds.length} numbers to order ${order.id}`);
      }

      // 3. Crear la preferencia en Mercado Pago con el token del organizador.
      const { data: numberRows } = await admin
        .from("raffle_numbers")
        .select("number")
        .in("id", numberIds)
        .order("number");
      const numbersList = (numberRows ?? []).map((n) => n.number).join(", ");

      // deno-lint-ignore no-explicit-any
      const preference: any = {
        items: [
          {
            title: quantity === 1 ? `${raffle.title} - Número ${numbersList}` : `${raffle.title} - ${quantity} números`,
            description: `Números: ${numbersList}`,
            quantity,
            unit_price: unitPrice,
            currency_id: "ARS",
          },
        ],
        external_reference: order.id,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook?order=${order.id}`,
        payment_methods: { installments: 1 },
        statement_descriptor: String(raffle.title).substring(0, 22),
        // La preferencia vence junto con la reserva.
        expires: true,
        expiration_date_to: new Date(reservedUntil as string).toISOString().replace("Z", "+00:00"),
      };

      if (fee > 0) {
        preference.marketplace_fee = fee;
      }

      if (buyerEmail) {
        preference.payer = { email: buyerEmail, name: buyerName };
      }

      // Mercado Pago rechaza auto_return con back_urls que no sean https (localhost).
      const base = appUrl();
      if (base.startsWith("https://")) {
        preference.back_urls = {
          success: `${base}/raffle/${raffleId}?payment=success`,
          failure: `${base}/raffle/${raffleId}?payment=failure`,
          pending: `${base}/raffle/${raffleId}?payment=pending`,
        };
        preference.auto_return = "approved";
      }

      const mpResponse = await fetch(`${MP_API}/checkout/preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(preference),
      });

      if (!mpResponse.ok) {
        console.error("MP preference failed:", mpResponse.status, await mpResponse.text());
        throw new UserError(PREFERENCE_ERROR, 502);
      }

      mpData = await mpResponse.json();
      if (!mpData?.id || !mpData?.init_point) {
        console.error("MP preference without id/init_point:", mpData);
        throw new UserError(PREFERENCE_ERROR, 502);
      }
    } catch (error) {
      await releaseNumbers(admin, numberIds, order.id);
      // Por si falló el vínculo y quedaron reservados sin orden.
      await releaseNumbers(admin, numberIds, null);
      const { error: cancelError } = await admin
        .from("payment_orders")
        .update({ status: "cancelled", status_detail: "preference_failed", updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (cancelError) console.error("Failed to cancel order:", cancelError);
      throw error;
    }

    await admin
      .from("payment_orders")
      .update({ preference_id: mpData.id, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    await admin
      .from("raffle_numbers")
      .update({ payment_link: mpData.init_point, payment_id: mpData.id, payment_status: "pending" })
      .eq("order_id", order.id);

    return json({ order_id: order.id, payment_link: mpData.init_point, amount });
  } catch (error) {
    return errorResponse(error);
  }
});

/** Devuelve a "disponible" los números que esta solicitud acababa de reservar. */
// deno-lint-ignore no-explicit-any
async function releaseNumbers(admin: any, numberIds: string[], orderId: string | null) {
  let query = admin
    .from("raffle_numbers")
    .update({
      status: "available",
      buyer_name: null,
      buyer_email: null,
      buyer_phone: null,
      reserved_at: null,
      reserved_until: null,
      payment_id: null,
      payment_status: null,
      payment_link: null,
      order_id: null,
    })
    .in("id", numberIds)
    .eq("status", "reserved");

  query = orderId ? query.eq("order_id", orderId) : query.is("order_id", null);

  const { error } = await query;
  if (error) console.error("Failed to release numbers:", error);
}

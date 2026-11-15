// Inicia el OAuth de Mercado Pago para el usuario logueado.
// Genera un `state` aleatorio de un solo uso, para que el callback no pueda
// usarse para vincular una cuenta de Mercado Pago al perfil de otra persona.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, json, UserError } from "../_shared/mp.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("MP_CLIENT_ID");
    const redirectUri = Deno.env.get("MP_REDIRECT_URI");
    if (!clientId || !redirectUri) {
      throw new Error("Missing Mercado Pago configuration");
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = adminClient();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      throw new UserError("Tenés que iniciar sesión para conectar Mercado Pago", 401);
    }

    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");

    const { error: insertError } = await admin
      .from("mp_oauth_states")
      .insert({ state, user_id: userData.user.id });
    if (insertError) throw insertError;

    const url = new URL("https://auth.mercadopago.com/authorization");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    return json({ url: url.toString() });
  } catch (error) {
    return errorResponse(error);
  }
});

// Callback del OAuth de Mercado Pago. Lo abre el navegador del organizador
// al volver de Mercado Pago, por eso se despliega sin verificación de JWT.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, appUrl, expiresAtFrom, MP_API } from "../_shared/mp.ts";

function redirectToDashboard(params: string): Response {
  return Response.redirect(`${appUrl()}/dashboard?${params}`, 302);
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (url.searchParams.get("error") || !code || !state) {
      console.error("OAuth callback without code/state:", url.searchParams.get("error"));
      return redirectToDashboard("mp_error=authorization");
    }

    const MP_CLIENT_ID = Deno.env.get("MP_CLIENT_ID");
    const MP_CLIENT_SECRET = Deno.env.get("MP_CLIENT_SECRET");
    const MP_REDIRECT_URI = Deno.env.get("MP_REDIRECT_URI");
    if (!MP_CLIENT_ID || !MP_CLIENT_SECRET || !MP_REDIRECT_URI) {
      throw new Error("Missing Mercado Pago configuration");
    }

    const admin = adminClient();

    // El state es de un solo uso: se borra al leerlo.
    const { data: stateRow, error: stateError } = await admin
      .from("mp_oauth_states")
      .delete()
      .eq("state", state)
      .select("user_id, expires_at")
      .maybeSingle();

    if (stateError) throw stateError;
    if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
      return redirectToDashboard("mp_error=expired");
    }

    const tokenResponse = await fetch(`${MP_API}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: MP_CLIENT_ID,
        client_secret: MP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: MP_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenResponse.status, await tokenResponse.text());
      return redirectToDashboard("mp_error=token");
    }

    const tokenData = await tokenResponse.json();

    const { error: upsertError } = await admin.from("mp_credentials").upsert({
      user_id: stateRow.user_id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      public_key: tokenData.public_key ?? null,
      mp_user_id: tokenData.user_id != null ? String(tokenData.user_id) : null,
      expires_at: expiresAtFrom(tokenData.expires_in),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (upsertError) throw upsertError;

    return redirectToDashboard("mp_connected=true");
  } catch (error) {
    console.error("OAuth callback error:", error);
    return redirectToDashboard("mp_error=server");
  }
});

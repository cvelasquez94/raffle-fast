import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // Contains userId
    const error = url.searchParams.get("error");

    if (error) {
      console.error("OAuth error:", error);
      return new Response(
        JSON.stringify({ error: "OAuth authorization failed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: "Missing code or state parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Exchange authorization code for access token
    const MP_CLIENT_ID = Deno.env.get("MP_CLIENT_ID");
    const MP_CLIENT_SECRET = Deno.env.get("MP_CLIENT_SECRET");
    const MP_REDIRECT_URI = Deno.env.get("MP_REDIRECT_URI");

    if (!MP_CLIENT_ID || !MP_CLIENT_SECRET || !MP_REDIRECT_URI) {
      throw new Error("Missing Mercado Pago configuration");
    }

    const tokenResponse = await fetch(
      "https://api.mercadopago.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: MP_CLIENT_ID,
          client_secret: MP_CLIENT_SECRET,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: MP_REDIRECT_URI,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      throw new Error("Failed to exchange authorization code for token");
    }

    const tokenData = await tokenResponse.json();

    // Get user information from Mercado Pago
    const userInfoResponse = await fetch("https://api.mercadopago.com/users/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userInfo = await userInfoResponse.json();

    // Store tokens in Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        mp_access_token: tokenData.access_token,
        mp_refresh_token: tokenData.refresh_token,
        mp_public_key: tokenData.public_key,
        mp_user_id: userInfo.id?.toString(),
        mp_connected_at: new Date().toISOString(),
      })
      .eq("id", state);

    if (updateError) {
      console.error("Database update error:", updateError);
      throw new Error("Failed to store tokens in database");
    }

    // Redirect back to the app with success
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:8080";
    return Response.redirect(
      `${appUrl}/dashboard?mp_connected=true`,
      302
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

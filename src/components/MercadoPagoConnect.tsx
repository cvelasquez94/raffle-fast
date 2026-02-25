import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MercadoPagoConnectProps {
  userId: string;
  onConnectionChange?: (isConnected: boolean) => void;
}

export function MercadoPagoConnect({ userId, onConnectionChange }: MercadoPagoConnectProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mpUserId, setMpUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    checkConnection();
  }, [userId]);

  const checkConnection = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("mp_access_token, mp_user_id, mp_connected_at")
        .eq("id", userId)
        .single();

      if (error) throw error;

      const connected = !!(data?.mp_access_token && data?.mp_user_id);
      setIsConnected(connected);
      setMpUserId(data?.mp_user_id || null);
      onConnectionChange?.(connected);
    } catch (error) {
      console.error("Error checking MP connection:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = () => {
    console.log("handleConnect1");
    // Get environment variables
    const mpClientId = import.meta.env.VITE_MERCADOPAGO_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_MERCADOPAGO_REDIRECT_URI;
    console.log("handleConnect2");
    console.log(mpClientId, redirectUri);
    if (!mpClientId || !redirectUri) {
      toast({
        title: "Error de configuración",
        description: "Las credenciales de Mercado Pago no están configuradas.",
        variant: "destructive",
      });
      return;
    }

    // Build OAuth URL
    const oauthUrl = new URL("https://auth.mercadopago.com/authorization");
    oauthUrl.searchParams.set("client_id", mpClientId);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("platform_id", "mp");
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("state", userId); // Pass userId as state for callback

    // Redirect to Mercado Pago OAuth
    window.location.href = oauthUrl.toString();
  };

  const handleDisconnect = async () => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          mp_access_token: null,
          mp_refresh_token: null,
          mp_public_key: null,
          mp_user_id: null,
          mp_connected_at: null,
        })
        .eq("id", userId);

      if (error) throw error;

      setIsConnected(false);
      setMpUserId(null);
      onConnectionChange?.(false);

      toast({
        title: "Desconectado",
        description: "Tu cuenta de Mercado Pago ha sido desconectada.",
      });
    } catch (error) {
      console.error("Error disconnecting MP:", error);
      toast({
        title: "Error",
        description: "No se pudo desconectar la cuenta de Mercado Pago.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Mercado Pago
          </CardTitle>
          <CardDescription>Cargando...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Mercado Pago
        </CardTitle>
        <CardDescription>
          Conecta tu cuenta de Mercado Pago para recibir pagos automáticamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <p className="font-semibold text-green-900">Cuenta conectada</p>
                {mpUserId && (
                  <p className="text-sm text-green-700">ID de usuario: {mpUserId}</p>
                )}
              </div>
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                Activa
              </Badge>
            </div>
            <Button
              onClick={handleDisconnect}
              variant="outline"
              className="w-full"
            >
              Desconectar cuenta
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div className="flex-1">
                <p className="font-semibold text-yellow-900">No conectado</p>
                <p className="text-sm text-yellow-700">
                  Conecta tu cuenta para recibir pagos automáticamente
                </p>
              </div>
            </div>
            <Button
              onClick={handleConnect}
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <CreditCard className="w-4 h-4" />
              Conectar con Mercado Pago
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Al conectar, autorizas a esta aplicación a crear y gestionar pagos en tu nombre
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

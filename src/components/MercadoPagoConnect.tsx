import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getMercadoPagoConnectUrl } from "@/lib/payments";
import { formatFeePercent, getPlatformFeePercent } from "@/lib/platform";
import { Link } from "react-router-dom";

interface MercadoPagoConnectProps {
  userId: string;
  onConnectionChange?: (isConnected: boolean) => void;
}

export function MercadoPagoConnect({ userId, onConnectionChange }: MercadoPagoConnectProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mpUserId, setMpUserId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    checkConnection();
    getPlatformFeePercent().then(setFeePercent);
  }, [userId]);

  // La comisión se le informa al organizador antes de habilitar los cobros online.
  const feeNotice = (
    <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
      <p className="font-semibold">
        {feePercent === null
          ? "Comisión de Rifa rápida sobre pagos online"
          : feePercent === 0
            ? "Sin comisión de Rifa rápida sobre pagos online"
            : `Comisión de Rifa rápida: ${formatFeePercent(feePercent)} de cada pago online`}
      </p>
      <p className="text-muted-foreground">
        {feePercent === 0
          ? "Recibís el total de cada pago en tu cuenta de Mercado Pago."
          : "Se descuenta automáticamente de cada pago que recibís por Mercado Pago; el resto se acredita directo en tu cuenta."}{" "}
        Mercado Pago cobra además su propia comisión. Las reservas por WhatsApp no tienen costo.
      </p>
    </div>
  );

  const checkConnection = async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_mp_connection");

      if (error) throw error;

      const connection = data?.[0];
      const connected = !!connection?.connected;
      setIsConnected(connected);
      setMpUserId(connection?.mp_user_id || null);
      onConnectionChange?.(connected);
    } catch (error) {
      console.error("Error checking MP connection:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // El servidor arma la URL con un `state` de un solo uso ligado a esta sesión.
      window.location.href = await getMercadoPagoConnectUrl();
    } catch (error: any) {
      console.error("Error starting MP OAuth:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo iniciar la conexión con Mercado Pago.",
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const { error } = await supabase.rpc("disconnect_mercadopago");

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
            {feeNotice}
            <Button
              onClick={handleDisconnect}
              variant="outline"
              className="w-full"
            >
              Desconectar cuenta
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Al desconectar dejás de recibir pagos nuevos. Los pagos que ya estén en curso se siguen confirmando
              durante 3 días.
            </p>
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
            {feeNotice}
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <CreditCard className="w-4 h-4" />
              Conectar con Mercado Pago
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Al conectar, autorizás a esta aplicación a crear y gestionar pagos en tu nombre y aceptás los{" "}
              <Link to="/terminos" className="underline">Términos y condiciones</Link>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

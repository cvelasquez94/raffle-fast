import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { NumberGrid } from "@/components/NumberGrid";
import { RaffleAdmin } from "@/components/RaffleAdmin";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Share2, ArrowLeft, Pencil, CheckCircle2 } from "lucide-react";
import { searchPaymentsByPreference } from "@/lib/mercadopago";

const isValidWhatsApp = (number: string) => /^\+\d{10,15}$/.test(number);

const RaffleView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [raffle, setRaffle] = useState<any>(null);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editData, setEditData] = useState({
    title: "",
    description: "",
    price_per_number: "",
    whatsapp_number: "",
  });

  useEffect(() => {
    loadData();
    checkPaymentStatus();
    checkPendingPayment();
  }, [id]);

  const checkPaymentStatus = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
      toast({
        title: "¡Pago exitoso!",
        description: "Tu pago ha sido procesado correctamente. El número será marcado como vendido.",
      });
      // Limpiar el parámetro de la URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'failure') {
      toast({
        title: "Pago rechazado",
        description: "Tu pago no pudo ser procesado. El número quedará reservado por 24 horas.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'pending') {
      toast({
        title: "Pago pendiente",
        description: "Tu pago está siendo procesado. Te notificaremos cuando se complete.",
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const checkPendingPayment = async () => {
    try {
      const pendingPaymentStr = localStorage.getItem('pending_payment');
      if (!pendingPaymentStr) return;

      const pendingPayment = JSON.parse(pendingPaymentStr);

      // Verificar que sea para este raffle
      if (pendingPayment.raffleId !== id) return;

      // Verificar que no haya expirado (24 horas)
      const hoursSince = (Date.now() - pendingPayment.timestamp) / (1000 * 60 * 60);
      if (hoursSince > 24) {
        localStorage.removeItem('pending_payment');
        return;
      }

      // Esperar a que el raffle se cargue
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Obtener el access token del perfil del dueño del raffle
      const { data: raffleData } = await supabase
        .from("raffles")
        .select("user_id, profiles!inner(mp_access_token)")
        .eq("id", id)
        .single();

      const accessToken = raffleData?.profiles?.mp_access_token;

      if (!accessToken) {
        localStorage.removeItem('pending_payment');
        return;
      }

      // Buscar pagos asociados a esta preferencia
      const paymentsData = await searchPaymentsByPreference(
        accessToken,
        pendingPayment.preferenceId
      );

      console.log("Datos de pagos de Mercado Pago:", paymentsData);
      console.log("Preferencia ID:", pendingPayment.preferenceId);

      // Verificar si hay algún pago aprobado
      const approvedPayment = paymentsData.results?.find(
        (payment: any) => payment.status === 'approved'
      );

      console.log("Pago aprobado encontrado:", approvedPayment);

      if (approvedPayment) {
        // Marcar los números como "paid" (pagados, esperando confirmación del owner)
        const numberIds = pendingPayment.numberId
          ? [pendingPayment.numberId]
          : pendingPayment.numberIds;

        const updateResults = await Promise.all(
          numberIds.map((numberId: string) =>
            supabase
              .from("raffle_numbers")
              .update({
                status: "paid",
                payment_status: "approved",
                reserved_at: null,
                reserved_until: null,
              })
              .eq("id", numberId)
          )
        );

        // Verificar si hubo errores
        const errors = updateResults.filter(r => r.error);
        if (errors.length > 0) {
          console.error("Errores al actualizar números:", errors);
        }

        toast({
          title: "¡Pago confirmado!",
          description: "Tu pago fue procesado exitosamente. El vendedor confirmará la venta cuando reciba el dinero.",
        });

        localStorage.removeItem('pending_payment');
        loadData(); // Recargar datos
      } else {
        // Verificar si hay algún pago rechazado
        const rejectedPayment = paymentsData.results?.find(
          (payment: any) => payment.status === 'rejected' || payment.status === 'cancelled'
        );

        if (rejectedPayment) {
          toast({
            title: "Pago no completado",
            description: "El pago no fue procesado. Los números quedarán reservados por 24 horas.",
            variant: "destructive",
          });
          localStorage.removeItem('pending_payment');
        }
      }
    } catch (error) {
      console.error("Error al verificar pago pendiente:", error);
      // No mostrar error al usuario, esto es un chequeo en segundo plano
    }
  };

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      const { data: raffleData, error: raffleError } = await supabase
        .from("raffles")
        .select("*, profiles(full_name, mp_access_token)")
        .eq("id", id)
        .single();

      if (raffleError) throw raffleError;

      // Add the OAuth access token to the raffle object for use in NumberGrid
      const raffleWithToken = {
        ...raffleData,
        mercadopago_access_token: raffleData.profiles?.mp_access_token || null,
      };

      setRaffle(raffleWithToken);
      setIsOwner(session?.user?.id === raffleData.user_id);

      const { data: numbersData, error: numbersError } = await supabase
        .from("raffle_numbers")
        .select("*")
        .eq("raffle_id", id)
        .order("number");

      if (numbersError) throw numbersError;
      setNumbers(numbersData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "No se pudo cargar el talonario",
        variant: "destructive",
      });
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: raffle.title,
          text: `¡Participá en esta rifa! ${raffle.description}`,
          url: url,
        });
      } catch (error) {
        copyToClipboard(url);
      }
    } else {
      copyToClipboard(url);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "¡Link copiado!",
      description: "El enlace ha sido copiado al portapapeles",
    });
  };

  const handleOpenEdit = () => {
    setEditData({
      title: raffle.title,
      description: raffle.description,
      price_per_number: raffle.price_per_number.toString(),
      whatsapp_number: raffle.whatsapp_number,
    });
    setEditErrors({});
    setEditDialogOpen(true);
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!editData.title || editData.title.trim().length < 3) {
      errors.title = "El título debe tener al menos 3 caracteres";
    } else if (editData.title.trim().length > 100) {
      errors.title = "El título no puede superar los 100 caracteres";
    }

    if (!editData.description || editData.description.trim().length < 10) {
      errors.description = "La descripción debe tener al menos 10 caracteres";
    } else if (editData.description.trim().length > 500) {
      errors.description = "La descripción no puede superar los 500 caracteres";
    }

    const price = parseFloat(editData.price_per_number);
    if (!editData.price_per_number || isNaN(price) || price <= 0) {
      errors.price_per_number = "El precio debe ser mayor a 0";
    } else if (price > 9999999) {
      errors.price_per_number = "El precio no puede superar $9.999.999";
    }

    if (!editData.whatsapp_number || !isValidWhatsApp(editData.whatsapp_number)) {
      errors.whatsapp_number = "El número debe incluir código de país, ej: +5491112345678";
    }

    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!validateEditForm()) {
      return;
    }

    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("raffles")
        .update({
          title: editData.title,
          description: editData.description,
          price_per_number: parseFloat(editData.price_per_number),
          whatsapp_number: editData.whatsapp_number,
        })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "¡Actualizado!",
        description: "Los detalles del talonario han sido actualizados",
      });

      setEditDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el talonario",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFinishRaffle = async () => {
    try {
      const { error } = await supabase
        .from("raffles")
        .update({ status: "completed" })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "¡Talonario finalizado!",
        description: "El talonario ha sido marcado como completado",
      });

      setFinishDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo finalizar el talonario",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Función para verificar pago manualmente (útil para testing)
  const handleManualPaymentCheck = () => {
    checkPendingPayment();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />

      <div className="container mx-auto px-4 py-8">
        {isOwner && (
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="mb-6 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Panel
          </Button>
        )}

        {/* Botón de verificación manual (solo visible si hay pago pendiente en localStorage) */}
        {localStorage.getItem('pending_payment') && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm mb-2">Hay un pago pendiente de verificación</p>
            <Button onClick={handleManualPaymentCheck} size="sm" variant="outline">
              Verificar estado del pago
            </Button>
          </div>
        )}

        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-4">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl md:text-4xl font-bold">{raffle.title}</h1>
                  {raffle.status === "completed" && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Finalizado
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">{raffle.description}</p>
                <div className="flex gap-4 text-sm">
                  <span className="font-semibold">
                    Precio por número: ${raffle.price_per_number}
                  </span>
                  <span className="text-muted-foreground">
                    Organizado por {raffle.profiles?.full_name || "Usuario"}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {isOwner && raffle.status !== "completed" && (
                  <>
                    <Button onClick={handleOpenEdit} variant="outline" className="gap-2">
                      <Pencil className="w-4 h-4" />
                      Editar
                    </Button>
                    <Button onClick={() => setFinishDialogOpen(true)} variant="outline" className="gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Finalizar
                    </Button>
                  </>
                )}
                <Button onClick={handleShare} className="gap-2">
                  <Share2 className="w-4 h-4" />
                  Compartir
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Disponibles"
                value={numbers.filter(n => n.status === "available").length}
                color="success"
              />
              <StatCard
                label="Reservados"
                value={numbers.filter(n => n.status === "reserved").length}
                color="warning"
              />
              <StatCard
                label="Pagados"
                value={numbers.filter(n => n.status === "paid").length}
                color="blue-500"
              />
              <StatCard
                label="Vendidos"
                value={numbers.filter(n => n.status === "sold").length}
                color="muted"
              />
            </div>
          </div>

          {/* Numbers Grid / Admin Panel */}
          {isOwner ? (
            <Tabs defaultValue="grid" className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
                <TabsTrigger value="grid">Vista Pública</TabsTrigger>
                <TabsTrigger value="admin">Administrar</TabsTrigger>
              </TabsList>
              <TabsContent value="grid" className="mt-6">
                <NumberGrid
                  numbers={numbers}
                  raffle={raffle}
                  isOwner={isOwner}
                  onNumberUpdated={loadData}
                />
              </TabsContent>
              <TabsContent value="admin" className="mt-6">
                <RaffleAdmin numbers={numbers} onNumberUpdated={loadData} />
              </TabsContent>
            </Tabs>
          ) : (
            <NumberGrid
              numbers={numbers}
              raffle={raffle}
              isOwner={isOwner}
              onNumberUpdated={loadData}
            />
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Talonario</DialogTitle>
            <DialogDescription>
              Modifica los detalles de tu talonario
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Título de la Rifa *</Label>
              <Input
                id="edit-title"
                value={editData.title}
                onChange={(e) => {
                  setEditData({ ...editData, title: e.target.value });
                  setEditErrors({ ...editErrors, title: "" });
                }}
                placeholder="Ej: Rifa de iPhone 15 Pro"
                maxLength={100}
              />
              {editErrors.title && (
                <p className="text-sm text-destructive mt-1">{editErrors.title}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción *</Label>
              <Textarea
                id="edit-description"
                value={editData.description}
                onChange={(e) => {
                  setEditData({ ...editData, description: e.target.value });
                  setEditErrors({ ...editErrors, description: "" });
                }}
                placeholder="Describe el premio, fecha del sorteo, etc."
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {editData.description.length}/500
              </p>
              {editErrors.description && (
                <p className="text-sm text-destructive mt-1">{editErrors.description}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-price">Precio por Número (ARS) *</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                min="0.01"
                max="9999999"
                value={editData.price_per_number}
                onChange={(e) => {
                  setEditData({ ...editData, price_per_number: e.target.value });
                  setEditErrors({ ...editErrors, price_per_number: "" });
                }}
                placeholder="1000.00"
              />
              {editErrors.price_per_number && (
                <p className="text-sm text-destructive mt-1">{editErrors.price_per_number}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-whatsapp">WhatsApp (con código de país) *</Label>
              <Input
                id="edit-whatsapp"
                type="tel"
                value={editData.whatsapp_number}
                onChange={(e) => {
                  setEditData({ ...editData, whatsapp_number: e.target.value });
                  setEditErrors({ ...editErrors, whatsapp_number: "" });
                }}
                placeholder="+5491112345678"
              />
              {editErrors.whatsapp_number && (
                <p className="text-sm text-destructive mt-1">{editErrors.whatsapp_number}</p>
              )}
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Pagos con Mercado Pago</h3>
                <p className="text-xs text-muted-foreground">
                  Los pagos con Mercado Pago se configuran desde tu Dashboard conectando tu cuenta.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/dashboard")}
                  className="mt-2"
                >
                  Ir a configuración de pagos
                </Button>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={
                  savingEdit ||
                  !editData.title ||
                  !editData.description ||
                  !editData.price_per_number ||
                  !editData.whatsapp_number
                }
              >
                {savingEdit ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Finish Raffle Confirmation Dialog */}
      <AlertDialog open={finishDialogOpen} onOpenChange={setFinishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar talonario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará el talonario como finalizado. Ya no podrás editar la información del talonario ni gestionar los números. Los compradores aún podrán ver el talonario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinishRaffle}>
              Finalizar Talonario
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="p-4 rounded-lg border bg-card space-y-1">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className={`text-2xl font-bold text-${color}`}>{value}</p>
  </div>
);

export default RaffleView;

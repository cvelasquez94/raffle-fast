import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Check, X, CheckSquare, Square, CreditCard } from "lucide-react";
import { createMercadoPagoPaymentLink } from "@/lib/mercadopago";

interface NumberGridProps {
  numbers: any[];
  raffle: any;
  isOwner: boolean;
  onNumberUpdated: () => void;
}

export const NumberGrid = ({ numbers, raffle, isOwner, onNumberUpdated }: NumberGridProps) => {
  const { toast } = useToast();
  const [selectedNumber, setSelectedNumber] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [reserveData, setReserveData] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [editStatus, setEditStatus] = useState("");

  const handleNumberClick = (number: any) => {
    // Si el raffle está completado y no es el dueño, no permitir interacción
    if (raffle.status === "completed" && !isOwner) return;
    if (number.status === "sold" && !isOwner) return;

    // Si está en modo de selección múltiple
    if (multiSelectMode && !isOwner && number.status === "available") {
      setSelectedNumbers(prev => {
        if (prev.includes(number.id)) {
          return prev.filter(id => id !== number.id);
        } else {
          return [...prev, number.id];
        }
      });
      return;
    }

    // Modo de selección individual
    setSelectedNumber(number);
    setReserveData({
      name: number.buyer_name || "",
      email: number.buyer_email || "",
      phone: number.buyer_phone || "",
    });
    setEditStatus(number.status);
    setDialogOpen(true);
  };

  const handleToggleMultiSelect = () => {
    setMultiSelectMode(!multiSelectMode);
    setSelectedNumbers([]);
  };

  const handleBulkReserve = () => {
    if (selectedNumbers.length === 0) {
      toast({
        title: "Sin selección",
        description: "Por favor selecciona al menos un número",
        variant: "destructive",
      });
      return;
    }
    setBulkDialogOpen(true);
  };

  const handleConfirmBulkReserve = async () => {
    try {
      const reservedUntil = new Date();
      reservedUntil.setHours(reservedUntil.getHours() + 24);

      // Preparar URL de WhatsApp
      const numbersList = numbers
        .filter(n => selectedNumbers.includes(n.id))
        .map(n => n.number)
        .sort((a, b) => a - b)
        .join(", ");

      const message = encodeURIComponent(
        `Hola! Soy ${reserveData.name}. Me interesan los números ${numbersList} de la rifa "${raffle.title}". Ya los reservé en el talonario.`
      );
      const whatsappUrl = `https://wa.me/${raffle.whatsapp_number}?text=${message}`;

      // Reservar todos los números seleccionados
      const updatePromises = selectedNumbers.map(numberId =>
        supabase
          .from("raffle_numbers")
          .update({
            status: "reserved",
            buyer_name: reserveData.name,
            buyer_email: reserveData.email || null,
            buyer_phone: reserveData.phone || null,
            reserved_at: new Date().toISOString(),
            reserved_until: reservedUntil.toISOString(),
          })
          .eq("id", numberId)
          .eq("status", "available")
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        throw new Error(`No se pudieron reservar ${errors.length} números`);
      }

      toast({
        title: "¡Números reservados!",
        description: `${selectedNumbers.length} números reservados. Serás redirigido a WhatsApp.`,
      });

      // Abrir WhatsApp
      window.location.href = whatsappUrl;

      setBulkDialogOpen(false);
      setMultiSelectMode(false);
      setSelectedNumbers([]);
      setReserveData({ name: "", email: "", phone: "" });
      onNumberUpdated();

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudieron reservar todos los números",
        variant: "destructive",
      });
    }
  };

  const handleBulkPayWithMercadoPago = async () => {
    try {
      if (!raffle.mercadopago_access_token) {
        throw new Error("Mercado Pago no está configurado para este talonario");
      }

      const numbersList = numbers
        .filter(n => selectedNumbers.includes(n.id))
        .map(n => n.number)
        .sort((a, b) => a - b)
        .join(", ");

      const totalAmount = raffle.price_per_number * selectedNumbers.length;

      // Generar link de pago
      const result = await createMercadoPagoPaymentLink({
        accessToken: raffle.mercadopago_access_token,
        title: `${raffle.title} - ${selectedNumbers.length} números`,
        description: `Números: ${numbersList}`,
        price: raffle.price_per_number,
        quantity: selectedNumbers.length,
        buyerEmail: reserveData.email,
        buyerName: reserveData.name,
        externalReference: `${raffle.id}-bulk-${selectedNumbers.join('-')}`,
      });

      if (!result.success || !result.paymentLink) {
        throw new Error(result.error || "No se pudo generar el link de pago");
      }

      // Reservar todos los números
      const reservedUntil = new Date();
      reservedUntil.setHours(reservedUntil.getHours() + 24);

      const updatePromises = selectedNumbers.map(numberId =>
        supabase
          .from("raffle_numbers")
          .update({
            status: "reserved",
            buyer_name: reserveData.name,
            buyer_email: reserveData.email || null,
            buyer_phone: reserveData.phone || null,
            reserved_at: new Date().toISOString(),
            reserved_until: reservedUntil.toISOString(),
            payment_link: result.paymentLink,
            payment_id: result.preferenceId, // Store preference ID for tracking
          })
          .eq("id", numberId)
          .eq("status", "available")
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        throw new Error(`No se pudieron reservar ${errors.length} números`);
      }

      toast({
        title: "¡Redirigiendo a Mercado Pago!",
        description: `Pago de $${totalAmount} por ${selectedNumbers.length} números`,
      });

      // Store in localStorage for checking payment status when user returns
      localStorage.setItem('pending_payment', JSON.stringify({
        raffleId: raffle.id,
        numberIds: selectedNumbers,
        preferenceId: result.preferenceId,
        timestamp: Date.now()
      }));

      // Redirigir a Mercado Pago
      window.location.href = result.paymentLink;

      setBulkDialogOpen(false);
      setMultiSelectMode(false);
      setSelectedNumbers([]);
      setReserveData({ name: "", email: "", phone: "" });
      onNumberUpdated();

    } catch (error: any) {
      console.error("Error al generar pago:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo procesar el pago. Por favor intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const handleReserve = async () => {
    try {
      const reservedUntil = new Date();
      reservedUntil.setHours(reservedUntil.getHours() + 24);

      // Preparar URL de WhatsApp ANTES de la llamada async para evitar que Safari bloquee el popup
      const message = encodeURIComponent(
        `Hola! Soy ${reserveData.name}. Me interesa el número ${selectedNumber.number} de la rifa "${raffle.title}". Ya lo reservé en el talonario.`
      );
      const whatsappUrl = `https://wa.me/${raffle.whatsapp_number}?text=${message}`;

      // Verificar que el número aún esté disponible antes de reservar
      const { data: currentNumber } = await supabase
        .from("raffle_numbers")
        .select("status")
        .eq("id", selectedNumber.id)
        .single();

      if (currentNumber?.status !== "available") {
        throw new Error("Este número ya no está disponible");
      }

      const { error } = await supabase
        .from("raffle_numbers")
        .update({
          status: "reserved",
          buyer_name: reserveData.name,
          buyer_email: reserveData.email || null,
          buyer_phone: reserveData.phone || null,
          reserved_at: new Date().toISOString(),
          reserved_until: reservedUntil.toISOString(),
        })
        .eq("id", selectedNumber.id)
        .eq("status", "available"); // Solo actualizar si aún está disponible

      if (error) throw error;

      toast({
        title: "¡Número reservado!",
        description: "Serás redirigido a WhatsApp para confirmar tu compra.",
      });

      // Abrir WhatsApp inmediatamente (sin setTimeout para evitar bloqueo en Safari iOS)
      window.location.href = whatsappUrl;

      setDialogOpen(false);
      setReserveData({ name: "", email: "", phone: "" });
      onNumberUpdated();

    } catch (error: any) {
      console.error("Error al reservar:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo reservar el número. Por favor intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const handlePayWithMercadoPago = async () => {
    try {
      if (!raffle.mercadopago_access_token) {
        throw new Error("Mercado Pago no está configurado para este talonario");
      }

      // Verificar que el número aún esté disponible
      const { data: currentNumber } = await supabase
        .from("raffle_numbers")
        .select("status")
        .eq("id", selectedNumber.id)
        .single();

      if (currentNumber?.status !== "available") {
        throw new Error("Este número ya no está disponible");
      }

      // Generar link de pago
      const result = await createMercadoPagoPaymentLink({
        accessToken: raffle.mercadopago_access_token,
        title: `${raffle.title} - Número ${selectedNumber.number}`,
        description: raffle.description,
        price: raffle.price_per_number,
        quantity: 1,
        buyerEmail: reserveData.email,
        buyerName: reserveData.name,
        externalReference: `${raffle.id}-${selectedNumber.id}`,
      });

      if (!result.success || !result.paymentLink) {
        throw new Error(result.error || "No se pudo generar el link de pago");
      }

      // Reservar el número con el payment link
      const reservedUntil = new Date();
      reservedUntil.setHours(reservedUntil.getHours() + 24);

      const { error } = await supabase
        .from("raffle_numbers")
        .update({
          status: "reserved",
          buyer_name: reserveData.name,
          buyer_email: reserveData.email || null,
          buyer_phone: reserveData.phone || null,
          reserved_at: new Date().toISOString(),
          reserved_until: reservedUntil.toISOString(),
          payment_link: result.paymentLink,
          payment_id: result.preferenceId, // Store preference ID for tracking
        })
        .eq("id", selectedNumber.id)
        .eq("status", "available");

      if (error) throw error;

      toast({
        title: "¡Redirigiendo a Mercado Pago!",
        description: "Completa tu pago de forma segura",
      });

      // Store in localStorage for checking payment status when user returns
      localStorage.setItem('pending_payment', JSON.stringify({
        raffleId: raffle.id,
        numberId: selectedNumber.id,
        preferenceId: result.preferenceId,
        timestamp: Date.now()
      }));

      // Redirigir a Mercado Pago
      window.location.href = result.paymentLink;

      setDialogOpen(false);
      setReserveData({ name: "", email: "", phone: "" });
      onNumberUpdated();

    } catch (error: any) {
      console.error("Error al generar pago:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo procesar el pago. Por favor intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent(
      `Hola! Me interesa el número ${selectedNumber.number} de la rifa "${raffle.title}"`
    );
    window.open(`https://wa.me/${raffle.whatsapp_number}?text=${message}`, "_blank");
  };

  const handleConfirmSale = async () => {
    try {
      const { error } = await supabase
        .from("raffle_numbers")
        .update({
          status: "sold",
          sold_at: new Date().toISOString(),
        })
        .eq("id", selectedNumber.id);

      if (error) throw error;

      toast({
        title: "¡Venta confirmada!",
        description: "El número ha sido marcado como vendido",
      });

      setDialogOpen(false);
      onNumberUpdated();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo confirmar la venta",
        variant: "destructive",
      });
    }
  };

  const handleCancelReservation = async () => {
    try {
      const { error } = await supabase
        .from("raffle_numbers")
        .update({
          status: "available",
          buyer_name: null,
          buyer_email: null,
          buyer_phone: null,
          reserved_at: null,
          reserved_until: null,
        })
        .eq("id", selectedNumber.id);

      if (error) throw error;

      toast({
        title: "Reserva cancelada",
        description: "El número vuelve a estar disponible",
      });

      setDialogOpen(false);
      onNumberUpdated();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo cancelar la reserva",
        variant: "destructive",
      });
    }
  };

  const handleOwnerUpdate = async () => {
    try {
      const updateData: any = {
        status: editStatus,
        buyer_name: reserveData.name || null,
        buyer_email: reserveData.email || null,
        buyer_phone: reserveData.phone || null,
      };

      if (editStatus === "sold") {
        updateData.sold_at = new Date().toISOString();
      } else if (editStatus === "reserved") {
        updateData.reserved_at = new Date().toISOString();
        const reservedUntil = new Date();
        reservedUntil.setHours(reservedUntil.getHours() + 24);
        updateData.reserved_until = reservedUntil.toISOString();
      } else if (editStatus === "available") {
        updateData.reserved_at = null;
        updateData.reserved_until = null;
        updateData.sold_at = null;
      }

      const { error } = await supabase
        .from("raffle_numbers")
        .update(updateData)
        .eq("id", selectedNumber.id);

      if (error) throw error;

      toast({
        title: "¡Actualizado!",
        description: "El número ha sido actualizado correctamente",
      });

      setDialogOpen(false);
      setReserveData({ name: "", email: "", phone: "" });
      onNumberUpdated();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el número",
        variant: "destructive",
      });
    }
  };

  const getNumberStyle = (status: string, isOwner: boolean, isRaffleCompleted: boolean, isSelected: boolean) => {
    // Si el raffle está completado y no eres el dueño, deshabilitar interacción
    if (isRaffleCompleted && !isOwner) {
      return "bg-muted text-muted-foreground border-muted cursor-not-allowed opacity-60";
    }

    // Si está seleccionado en modo multi-select
    if (isSelected) {
      return "bg-primary text-primary-foreground border-primary cursor-pointer ring-2 ring-primary ring-offset-2";
    }

    switch (status) {
      case "available":
        return "bg-success/10 hover:bg-success/20 text-success border-success/20 cursor-pointer";
      case "reserved":
        return "bg-warning/10 hover:bg-warning/20 text-warning border-warning/20 cursor-pointer";
      case "sold":
        return isOwner
          ? "bg-muted hover:bg-muted/80 text-muted-foreground border-muted cursor-pointer"
          : "bg-muted text-muted-foreground border-muted cursor-not-allowed";
      default:
        return "";
    }
  };

  return (
    <>
      {raffle.status === "completed" && !isOwner && (
        <div className="mb-4 p-4 bg-muted border border-muted-foreground/20 rounded-lg">
          <p className="text-sm font-semibold text-muted-foreground text-center">
            Este talonario ha finalizado. Ya no se pueden reservar ni comprar números.
          </p>
        </div>
      )}

      {/* Multi-select mode controls */}
      {!isOwner && raffle.status !== "completed" && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <Button
            onClick={handleToggleMultiSelect}
            variant={multiSelectMode ? "default" : "outline"}
            className="gap-2"
          >
            {multiSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {multiSelectMode ? "Cancelar selección" : "Seleccionar varios números"}
          </Button>

          {multiSelectMode && selectedNumbers.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {selectedNumbers.length} {selectedNumbers.length === 1 ? "número seleccionado" : "números seleccionados"}
              </Badge>
              <Button onClick={handleBulkReserve} size="sm">
                Reservar selección
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {numbers.map((number) => {
          const isSelected = selectedNumbers.includes(number.id);
          return (
            <button
              key={number.id}
              onClick={() => handleNumberClick(number)}
              disabled={(number.status === "sold" && !isOwner) || (raffle.status === "completed" && !isOwner) || (multiSelectMode && number.status !== "available")}
              className={`aspect-square rounded-lg border-2 font-semibold text-sm flex items-center justify-center transition-all ${getNumberStyle(number.status, isOwner, raffle.status === "completed", isSelected)}`}
            >
              {number.number}
            </button>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Número {selectedNumber?.number}</DialogTitle>
            <DialogDescription>
              {selectedNumber?.status === "available" && "Este número está disponible"}
              {selectedNumber?.status === "reserved" && "Este número está reservado"}
              {selectedNumber?.status === "sold" && "Este número ya fue vendido"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedNumber?.status === "reserved" && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-semibold">Información de reserva:</p>
                <p className="text-sm">Nombre: {selectedNumber.buyer_name}</p>
                {selectedNumber.buyer_email && (
                  <p className="text-sm">Email: {selectedNumber.buyer_email}</p>
                )}
                {selectedNumber.buyer_phone && (
                  <p className="text-sm">Teléfono: {selectedNumber.buyer_phone}</p>
                )}
              </div>
            )}

            {!isOwner && selectedNumber?.status === "available" && (
              <>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Tu nombre *</Label>
                    <Input
                      id="name"
                      value={reserveData.name}
                      onChange={(e) => setReserveData({ ...reserveData, name: e.target.value })}
                      placeholder="Juan Pérez"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={reserveData.email}
                      onChange={(e) => setReserveData({ ...reserveData, email: e.target.value })}
                      placeholder="tu@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={reserveData.phone}
                      onChange={(e) => setReserveData({ ...reserveData, phone: e.target.value })}
                      placeholder="+54 9 11 1234-5678"
                    />
                  </div>
                </div>

                {raffle.mercadopago_enabled && raffle.mercadopago_access_token ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button
                        onClick={handlePayWithMercadoPago}
                        disabled={!reserveData.name}
                        className="flex-1 gap-2"
                      >
                        <CreditCard className="w-4 h-4" />
                        Pagar ${raffle.price_per_number}
                      </Button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">O reservar sin pagar</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleReserve} disabled={!reserveData.name} variant="outline" className="flex-1">
                        Reservar 24hs
                      </Button>
                      <Button onClick={handleWhatsApp} variant="outline" className="flex-1 gap-2">
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={handleReserve} disabled={!reserveData.name} className="flex-1">
                      Reservar 24hs
                    </Button>
                    <Button onClick={handleWhatsApp} variant="outline" className="flex-1 gap-2">
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp
                    </Button>
                  </div>
                )}
              </>
            )}

            {!isOwner && selectedNumber?.status === "reserved" && (
              <Button onClick={handleWhatsApp} className="w-full gap-2">
                <MessageCircle className="w-4 h-4" />
                Contactar por WhatsApp
              </Button>
            )}

            {isOwner && selectedNumber?.status === "reserved" && (
              <div className="flex gap-2">
                <Button onClick={handleConfirmSale} className="flex-1 gap-2">
                  <Check className="w-4 h-4" />
                  Confirmar Venta
                </Button>
                <Button onClick={handleCancelReservation} variant="destructive" className="flex-1 gap-2">
                  <X className="w-4 h-4" />
                  Cancelar
                </Button>
              </div>
            )}

            {isOwner && (selectedNumber?.status === "available" || selectedNumber?.status === "sold") && (
              <>
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-semibold">Editar número (Vista de propietario)</p>

                  <div className="space-y-2">
                    <Label htmlFor="status">Estado *</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Selecciona estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Disponible</SelectItem>
                        <SelectItem value="reserved">Reservado</SelectItem>
                        <SelectItem value="sold">Vendido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="owner-name">Nombre del comprador</Label>
                    <Input
                      id="owner-name"
                      value={reserveData.name}
                      onChange={(e) => setReserveData({ ...reserveData, name: e.target.value })}
                      placeholder="Juan Pérez"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="owner-email">Email</Label>
                    <Input
                      id="owner-email"
                      type="email"
                      value={reserveData.email}
                      onChange={(e) => setReserveData({ ...reserveData, email: e.target.value })}
                      placeholder="email@ejemplo.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="owner-phone">Teléfono</Label>
                    <Input
                      id="owner-phone"
                      type="tel"
                      value={reserveData.phone}
                      onChange={(e) => setReserveData({ ...reserveData, phone: e.target.value })}
                      placeholder="+54 9 11 1234-5678"
                    />
                  </div>
                </div>

                <Button onClick={handleOwnerUpdate} className="w-full">
                  Guardar cambios
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Reservation Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reservar {selectedNumbers.length} números</DialogTitle>
            <DialogDescription>
              Ingresa tus datos para reservar los números seleccionados por 24 horas
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-semibold mb-2">Números seleccionados:</p>
              <p className="text-sm text-muted-foreground">
                {numbers
                  .filter(n => selectedNumbers.includes(n.id))
                  .map(n => n.number)
                  .sort((a, b) => a - b)
                  .join(", ")}
              </p>
              <p className="text-sm font-semibold mt-2">
                Total: ${raffle.price_per_number * selectedNumbers.length}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-name">Tu nombre *</Label>
              <Input
                id="bulk-name"
                value={reserveData.name}
                onChange={(e) => setReserveData({ ...reserveData, name: e.target.value })}
                placeholder="Juan Pérez"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-email">Email</Label>
              <Input
                id="bulk-email"
                type="email"
                value={reserveData.email}
                onChange={(e) => setReserveData({ ...reserveData, email: e.target.value })}
                placeholder="tu@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-phone">Teléfono</Label>
              <Input
                id="bulk-phone"
                type="tel"
                value={reserveData.phone}
                onChange={(e) => setReserveData({ ...reserveData, phone: e.target.value })}
                placeholder="+54 9 11 1234-5678"
              />
            </div>

            {raffle.mercadopago_enabled && raffle.mercadopago_access_token ? (
              <div className="space-y-3 pt-4">
                <Button
                  onClick={handleBulkPayWithMercadoPago}
                  disabled={!reserveData.name}
                  className="w-full gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Pagar ${raffle.price_per_number * selectedNumbers.length}
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">O reservar sin pagar</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleConfirmBulkReserve} disabled={!reserveData.name} variant="outline" className="flex-1">
                    Reservar y contactar
                  </Button>
                  <Button onClick={() => setBulkDialogOpen(false)} variant="outline">
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-4">
                <Button onClick={handleConfirmBulkReserve} disabled={!reserveData.name} className="flex-1">
                  Reservar y contactar
                </Button>
                <Button onClick={() => setBulkDialogOpen(false)} variant="outline">
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

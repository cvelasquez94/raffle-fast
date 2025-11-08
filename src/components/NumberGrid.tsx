import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Check, X } from "lucide-react";

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
  const [reserveData, setReserveData] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [editStatus, setEditStatus] = useState("");

  const handleNumberClick = (number: any) => {
    if (number.status === "sold" && !isOwner) return;
    setSelectedNumber(number);
    setReserveData({
      name: number.buyer_name || "",
      email: number.buyer_email || "",
      phone: number.buyer_phone || "",
    });
    setEditStatus(number.status);
    setDialogOpen(true);
  };

  const handleReserve = async () => {
    try {
      const reservedUntil = new Date();
      reservedUntil.setHours(reservedUntil.getHours() + 24);

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
        description: "El número ha sido reservado por 24 horas. Contacta al organizador para confirmar tu compra.",
      });

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

  const getNumberStyle = (status: string, isOwner: boolean) => {
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
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {numbers.map((number) => (
          <button
            key={number.id}
            onClick={() => handleNumberClick(number)}
            disabled={number.status === "sold" && !isOwner}
            className={`aspect-square rounded-lg border-2 font-semibold text-sm flex items-center justify-center transition-all ${getNumberStyle(number.status, isOwner)}`}
          >
            {number.number}
          </button>
        ))}
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
                
                <div className="flex gap-2">
                  <Button onClick={handleReserve} disabled={!reserveData.name} className="flex-1">
                    Reservar 24hs
                  </Button>
                  <Button onClick={handleWhatsApp} variant="outline" className="flex-1 gap-2">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </Button>
                </div>
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
    </>
  );
};

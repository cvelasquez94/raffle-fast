import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Edit, Search, X } from "lucide-react";

interface RaffleAdminProps {
  numbers: any[];
  onNumberUpdated: () => void;
}

export const RaffleAdmin = ({ numbers, onNumberUpdated }: RaffleAdminProps) => {
  const { toast } = useToast();
  const [selectedNumber, setSelectedNumber] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editData, setEditData] = useState({
    status: "",
    buyer_name: "",
    buyer_email: "",
    buyer_phone: "",
  });

  const handleEditClick = (number: any) => {
    setSelectedNumber(number);
    setEditData({
      status: number.status,
      buyer_name: number.buyer_name || "",
      buyer_email: number.buyer_email || "",
      buyer_phone: number.buyer_phone || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const updateData: any = {
        status: editData.status,
        buyer_name: editData.buyer_name || null,
        buyer_email: editData.buyer_email || null,
        buyer_phone: editData.buyer_phone || null,
      };

      if (editData.status === "sold") {
        updateData.sold_at = new Date().toISOString();
        updateData.reserved_at = null;
        updateData.reserved_until = null;
      } else if (editData.status === "reserved") {
        updateData.reserved_at = new Date().toISOString();
        const reservedUntil = new Date();
        reservedUntil.setHours(reservedUntil.getHours() + 24);
        updateData.reserved_until = reservedUntil.toISOString();
        updateData.sold_at = null;
      } else {
        updateData.reserved_at = null;
        updateData.reserved_until = null;
        updateData.sold_at = null;
        updateData.buyer_name = null;
        updateData.buyer_email = null;
        updateData.buyer_phone = null;
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
      onNumberUpdated();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el número",
        variant: "destructive",
      });
    }
  };

  const filteredNumbers = numbers.filter((number) => {
    const matchesSearch =
      number.number.toString().includes(searchTerm) ||
      number.buyer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      number.buyer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      number.buyer_phone?.includes(searchTerm);
    
    const matchesFilter = filterStatus === "all" || number.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-success/20 text-success">Disponible</Badge>;
      case "reserved":
        return <Badge className="bg-warning/20 text-warning">Reservado</Badge>;
      case "sold":
        return <Badge variant="secondary">Vendido</Badge>;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Buscar por número, nombre, email o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="available">Disponibles</SelectItem>
              <SelectItem value="reserved">Reservados</SelectItem>
              <SelectItem value="sold">Vendidos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Número</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNumbers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No se encontraron números
                  </TableCell>
                </TableRow>
              ) : (
                filteredNumbers.map((number) => (
                  <TableRow key={number.id}>
                    <TableCell className="font-semibold">{number.number}</TableCell>
                    <TableCell>{getStatusBadge(number.status)}</TableCell>
                    <TableCell>{number.buyer_name || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {number.buyer_email && <div>{number.buyer_email}</div>}
                      {number.buyer_phone && <div>{number.buyer_phone}</div>}
                      {!number.buyer_email && !number.buyer_phone && "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(number)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Número {selectedNumber?.number}</DialogTitle>
            <DialogDescription>
              Administra manualmente el estado y la información del comprador
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">Estado del número *</Label>
              <Select value={editData.status} onValueChange={(value) => setEditData({ ...editData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="reserved">Reservado</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(editData.status === "reserved" || editData.status === "sold") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="buyer_name">Nombre del comprador</Label>
                  <Input
                    id="buyer_name"
                    value={editData.buyer_name}
                    onChange={(e) => setEditData({ ...editData, buyer_name: e.target.value })}
                    placeholder="Juan Pérez"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer_email">Email</Label>
                  <Input
                    id="buyer_email"
                    type="email"
                    value={editData.buyer_email}
                    onChange={(e) => setEditData({ ...editData, buyer_email: e.target.value })}
                    placeholder="juan@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer_phone">Teléfono</Label>
                  <Input
                    id="buyer_phone"
                    type="tel"
                    value={editData.buyer_phone}
                    onChange={(e) => setEditData({ ...editData, buyer_phone: e.target.value })}
                    placeholder="+54 9 11 1234-5678"
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} className="flex-1">
                Guardar Cambios
              </Button>
              <Button onClick={() => setDialogOpen(false)} variant="outline">
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

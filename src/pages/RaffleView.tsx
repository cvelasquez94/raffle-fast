import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Navbar } from "@/components/Navbar";
import { NumberGrid } from "@/components/NumberGrid";
import { RaffleAdmin } from "@/components/RaffleAdmin";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Share2, ArrowLeft, Pencil } from "lucide-react";

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
  const [editData, setEditData] = useState({
    title: "",
    description: "",
    price_per_number: "",
    whatsapp_number: "",
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      const { data: raffleData, error: raffleError } = await supabase
        .from("raffles")
        .select("*, profiles(full_name)")
        .eq("id", id)
        .single();

      if (raffleError) throw raffleError;
      setRaffle(raffleData);
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
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
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
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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

        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-4">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-2 flex-1">
                <h1 className="text-3xl md:text-4xl font-bold">{raffle.title}</h1>
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
                {isOwner && (
                  <Button onClick={handleOpenEdit} variant="outline" className="gap-2">
                    <Pencil className="w-4 h-4" />
                    Editar
                  </Button>
                )}
                <Button onClick={handleShare} className="gap-2">
                  <Share2 className="w-4 h-4" />
                  Compartir
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
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
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                placeholder="Ej: Rifa de iPhone 15 Pro"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción *</Label>
              <Textarea
                id="edit-description"
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                placeholder="Describe el premio, fecha del sorteo, etc."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-price">Precio por Número (ARS) *</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                min="0.01"
                value={editData.price_per_number}
                onChange={(e) => setEditData({ ...editData, price_per_number: e.target.value })}
                placeholder="1000.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-whatsapp">WhatsApp (con código de país) *</Label>
              <Input
                id="edit-whatsapp"
                type="tel"
                value={editData.whatsapp_number}
                onChange={(e) => setEditData({ ...editData, whatsapp_number: e.target.value })}
                placeholder="+5491112345678"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit}>
                Guardar Cambios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

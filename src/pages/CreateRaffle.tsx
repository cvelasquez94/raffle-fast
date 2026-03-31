import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const isValidWhatsApp = (number: string) => /^\+\d{10,15}$/.test(number);

const CreateRaffle = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    pricePerNumber: "",
    whatsappNumber: "",
    totalNumbers: "50", // Default value
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title || formData.title.trim().length < 3) {
      errors.title = "El título debe tener al menos 3 caracteres";
    } else if (formData.title.trim().length > 100) {
      errors.title = "El título no puede superar los 100 caracteres";
    }

    if (!formData.description || formData.description.trim().length < 10) {
      errors.description = "La descripción debe tener al menos 10 caracteres";
    } else if (formData.description.trim().length > 500) {
      errors.description = "La descripción no puede superar los 500 caracteres";
    }

    const price = parseFloat(formData.pricePerNumber);
    if (!formData.pricePerNumber || isNaN(price) || price <= 0) {
      errors.pricePerNumber = "El precio debe ser mayor a 0";
    } else if (price > 9999999) {
      errors.pricePerNumber = "El precio no puede superar $9.999.999";
    }

    if (!formData.whatsappNumber || !isValidWhatsApp(formData.whatsappNumber)) {
      errors.whatsappNumber = "El número debe incluir código de país, ej: +5491112345678";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!profile) {
        throw new Error("Perfil no encontrado");
      }

      const { data: raffle, error } = await supabase
        .from("raffles")
        .insert({
          user_id: profile.id,
          title: formData.title,
          description: formData.description,
          price_per_number: parseFloat(formData.pricePerNumber),
          whatsapp_number: formData.whatsappNumber,
          total_numbers: parseInt(formData.totalNumbers),
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "¡Talonario creado!",
        description: "Tu talonario ha sido creado exitosamente",
      });

      navigate(`/raffle/${raffle.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el talonario",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled =
    loading ||
    !formData.title ||
    !formData.description ||
    !formData.pricePerNumber ||
    !formData.whatsappNumber;

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />

      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard")}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Panel
        </Button>

        <Card className="max-w-2xl mx-auto shadow-elegant">
          <CardHeader>
            <CardTitle className="text-2xl">Crear Nuevo Talonario</CardTitle>
            <CardDescription>
              Completa los datos de tu rifa. Podrás elegir entre 10, 30 o 50 números.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Título de la Rifa *</Label>
                <Input
                  id="title"
                  placeholder="Ej: Rifa de iPhone 15 Pro"
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({ ...formData, title: e.target.value });
                    setFormErrors({ ...formErrors, title: "" });
                  }}
                  required
                  maxLength={100}
                />
                {formErrors.title && (
                  <p className="text-sm text-destructive mt-1">{formErrors.title}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe el premio, fecha del sorteo, etc."
                  value={formData.description}
                  onChange={(e) => {
                    setFormData({ ...formData, description: e.target.value });
                    setFormErrors({ ...formErrors, description: "" });
                  }}
                  required
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {formData.description.length}/500
                </p>
                {formErrors.description && (
                  <p className="text-sm text-destructive mt-1">{formErrors.description}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalNumbers">Cantidad de Números *</Label>
                <Select
                  value={formData.totalNumbers}
                  onValueChange={(value) => setFormData({ ...formData, totalNumbers: value })}
                >
                  <SelectTrigger id="totalNumbers">
                    <SelectValue placeholder="Selecciona la cantidad de números" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 números</SelectItem>
                    <SelectItem value="30">30 números</SelectItem>
                    <SelectItem value="50">50 números</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define cuántos números tendrá tu talonario de rifa
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Precio por Número (ARS) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="9999999"
                  placeholder="1000.00"
                  value={formData.pricePerNumber}
                  onChange={(e) => {
                    setFormData({ ...formData, pricePerNumber: e.target.value });
                    setFormErrors({ ...formErrors, pricePerNumber: "" });
                  }}
                  required
                />
                {formErrors.pricePerNumber && (
                  <p className="text-sm text-destructive mt-1">{formErrors.pricePerNumber}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp (con código de país) *</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  placeholder="+5491112345678"
                  value={formData.whatsappNumber}
                  onChange={(e) => {
                    setFormData({ ...formData, whatsappNumber: e.target.value });
                    setFormErrors({ ...formErrors, whatsappNumber: "" });
                  }}
                  required
                />
                {formErrors.whatsappNumber && (
                  <p className="text-sm text-destructive mt-1">{formErrors.whatsappNumber}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Los compradores podrán contactarte por este número para coordinar reservas
                </p>
              </div>

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/dashboard")}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitDisabled} className="flex-1">
                  {loading ? "Creando..." : "Crear Talonario"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateRaffle;

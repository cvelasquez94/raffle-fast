import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Ticket } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isSignUp, setIsSignUp] = useState(searchParams.get("signup") === "true");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    phone: "",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
              phone: formData.phone,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        console.log("SignUp response:", data);

        // Verificar si se requiere confirmación de email
        if (data.user && !data.user.confirmed_at && !data.session) {
          toast({
            title: "¡Cuenta creada!",
            description: "Por favor revisa tu email para confirmar tu cuenta.",
          });
          return;
        }

        toast({
          title: "¡Cuenta creada!",
          description: "Tu cuenta ha sido creada exitosamente. Redirigiendo...",
        });

        setTimeout(() => navigate("/dashboard"), 1000);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) throw error;

        toast({
          title: "¡Bienvenido de vuelta!",
          description: "Has iniciado sesión exitosamente",
        });

        navigate("/dashboard");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      console.error("Error details:", {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name
      });

      // Mensajes de error más específicos
      let errorMessage = error.message || "Ocurrió un error. Por favor intenta de nuevo.";

      if (error.message?.includes("Email not confirmed")) {
        errorMessage = "Por favor confirma tu email antes de iniciar sesión.";
      } else if (error.message?.includes("Invalid login credentials")) {
        errorMessage = "Email o contraseña incorrectos.";
      } else if (error.message?.includes("User already registered")) {
        errorMessage = "Este email ya está registrado. Intenta iniciar sesión.";
      } else if (error.message?.includes("Database error saving new user")) {
        errorMessage = "Error al crear el perfil. Por favor contacta al administrador o revisa la configuración de Supabase.";
      } else if (error.code === "23505") {
        errorMessage = "Este usuario ya existe. Intenta iniciar sesión.";
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-12 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-elegant">
          <CardHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Ticket className="w-8 h-8 text-primary" />
              </div>
            </div>
            <div className="space-y-2 text-center">
              <CardTitle className="text-2xl">
                {isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
              </CardTitle>
              <CardDescription>
                {isSignUp 
                  ? "Crea tu cuenta gratis y comienza a gestionar tus rifas" 
                  : "Ingresa a tu cuenta para gestionar tus rifas"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Juan Pérez"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      required={isSignUp}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono (opcional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+54 9 11 1234-5678"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Procesando..." : isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
              </Button>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-primary hover:underline"
                >
                  {isSignUp 
                    ? "¿Ya tienes cuenta? Inicia sesión" 
                    : "¿No tienes cuenta? Regístrate"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;

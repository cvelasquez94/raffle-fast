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

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone: string) => /^\+?[\d\s\-().]{7,20}$/.test(phone);

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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (isSignUp) {
      if (!formData.fullName || formData.fullName.trim().length < 2) {
        errors.fullName = "El nombre debe tener al menos 2 caracteres";
      } else if (formData.fullName.trim().length > 100) {
        errors.fullName = "El nombre no puede superar los 100 caracteres";
      }

      if (formData.phone && !isValidPhone(formData.phone)) {
        errors.phone = "Por favor ingresá un número de teléfono válido";
      }
    }

    if (!formData.email || !isValidEmail(formData.email)) {
      errors.email = "Por favor ingresá un email válido";
    }

    if (!formData.password) {
      errors.password = "La contraseña es requerida";
    } else if (formData.password.length > 128) {
      errors.password = "La contraseña no puede superar los 128 caracteres";
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

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo iniciar sesión con Google",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const isSubmitDisabled = () => {
    if (loading) return true;
    if (isSignUp) {
      return !formData.email || !formData.password || !formData.fullName;
    }
    return !formData.email || !formData.password;
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
              {/* Google button */}
              <Button
                type="button"
                variant="outline"
                className="w-full gap-3"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuar con Google
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">O continúa con email</span>
                </div>
              </div>

              {isSignUp && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Juan Pérez"
                      value={formData.fullName}
                      onChange={(e) => {
                        setFormData({ ...formData, fullName: e.target.value });
                        setFormErrors({ ...formErrors, fullName: "" });
                      }}
                      required={isSignUp}
                    />
                    {formErrors.fullName && (
                      <p className="text-sm text-destructive mt-1">{formErrors.fullName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono (opcional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+54 9 11 1234-5678"
                      value={formData.phone}
                      onChange={(e) => {
                        setFormData({ ...formData, phone: e.target.value });
                        setFormErrors({ ...formErrors, phone: "" });
                      }}
                    />
                    {formErrors.phone && (
                      <p className="text-sm text-destructive mt-1">{formErrors.phone}</p>
                    )}
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
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    setFormErrors({ ...formErrors, email: "" });
                  }}
                  required
                />
                {formErrors.email && (
                  <p className="text-sm text-destructive mt-1">{formErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    setFormErrors({ ...formErrors, password: "" });
                  }}
                  required
                  minLength={6}
                  maxLength={128}
                />
                {formErrors.password && (
                  <p className="text-sm text-destructive mt-1">{formErrors.password}</p>
                )}
                <p className="text-sm text-muted-foreground">Mínimo 6 caracteres</p>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitDisabled()}>
                {loading ? "Procesando..." : isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
              </Button>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setFormErrors({});
                  }}
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

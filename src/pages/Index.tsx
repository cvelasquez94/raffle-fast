import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { Ticket, Shield, Zap, Users } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-background" />
        <div className="container mx-auto px-4 py-20 relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Crea y Gestiona tus Rifas Online
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              La forma más fácil de organizar sorteos y rifas. Comparte tu talonario, 
              gestiona ventas y reservas todo en un solo lugar.
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button 
                size="lg" 
                onClick={() => navigate(user ? "/dashboard" : "/auth?signup=true")}
                className="text-lg px-8 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-shadow"
              >
                {user ? "Ir al Panel" : "Comenzar Gratis"}
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => navigate("/auth")}
                className="text-lg px-8"
              >
                Ver Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Todo lo que necesitas para tu rifa
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <FeatureCard
              icon={<Ticket className="w-8 h-8" />}
              title="Talonario Digital"
              description="Crea tu talonario de 50 números gratis y compártelo con un simple enlace"
            />
            <FeatureCard
              icon={<Zap className="w-8 h-8" />}
              title="Pagos Integrados"
              description="Acepta pagos con Mercado Pago o tarjeta de crédito de forma segura"
            />
            <FeatureCard
              icon={<Users className="w-8 h-8" />}
              title="Reservas por WhatsApp"
              description="Permite que los compradores reserven y coordinen por WhatsApp"
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8" />}
              title="Control Total"
              description="Gestiona el estado de cada número desde tu panel de administración"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6 p-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border shadow-elegant">
            <h2 className="text-3xl md:text-4xl font-bold">
              ¿Listo para empezar?
            </h2>
            <p className="text-lg text-muted-foreground">
              Crea tu primera rifa gratis en menos de 2 minutos
            </p>
            <Button 
              size="lg"
              onClick={() => navigate(user ? "/dashboard" : "/auth?signup=true")}
              className="text-lg px-8 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-shadow"
            >
              Crear Mi Rifa Ahora
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2025 RifaFácil. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="p-6 rounded-xl bg-card border shadow-card hover:shadow-elegant transition-shadow space-y-3">
    <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
      {icon}
    </div>
    <h3 className="text-xl font-semibold">{title}</h3>
    <p className="text-muted-foreground">{description}</p>
  </div>
);

export default Index;

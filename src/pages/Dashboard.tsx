import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { RaffleCard } from "@/components/RaffleCard";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [raffles, setRaffles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeDashboard();
  }, []);

  const initializeDashboard = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    await loadRaffles(session.user.id);
  };

  const loadRaffles = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("raffles")
        .select("*, raffle_numbers(count)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRaffles(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los talonarios",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canCreateRaffle = raffles.filter(r => r.status === "active").length === 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Mis Talonarios</h1>
            <p className="text-muted-foreground mt-1">
              Gestiona tus rifas y sorteos
            </p>
          </div>
          
          <Button
            onClick={() => navigate("/create-raffle")}
            disabled={!canCreateRaffle}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Crear Talonario
          </Button>
        </div>

        {!canCreateRaffle && (
          <div className="mb-6 p-4 bg-warning/10 border border-warning/20 rounded-lg">
            <p className="text-sm text-warning-foreground">
              Ya tienes un talonario activo. Completa o cancela tu talonario actual para crear uno nuevo.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : raffles.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Plus className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">No tienes talonarios aún</h3>
              <p className="text-muted-foreground mb-4">
                Crea tu primer talonario para comenzar a vender números
              </p>
              <Button onClick={() => navigate("/create-raffle")}>
                Crear Mi Primer Talonario
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {raffles.map((raffle) => (
              <RaffleCard key={raffle.id} raffle={raffle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

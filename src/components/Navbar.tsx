import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Ticket, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface NavbarProps {
  user?: any;
}

export const Navbar = ({ user }: NavbarProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión exitosamente",
    });
    navigate("/");
  };

  return (
    <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary hover:opacity-80 transition-opacity">
          <Ticket className="w-6 h-6" />
          RifaFácil
        </Link>
        
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Button variant="ghost" onClick={() => navigate("/dashboard")} className="gap-2">
                <User className="w-4 h-4" />
                Mi Panel
              </Button>
              <Button variant="ghost" onClick={handleLogout} className="gap-2">
                <LogOut className="w-4 h-4" />
                Salir
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate("/auth")}>
                Ingresar
              </Button>
              <Button onClick={() => navigate("/auth?signup=true")}>
                Registrarse
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

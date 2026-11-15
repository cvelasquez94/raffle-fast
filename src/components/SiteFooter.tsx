import { Link } from "react-router-dom";
import { Ticket } from "lucide-react";
import { track } from "@/lib/analytics";

interface SiteFooterProps {
  /** Muestra la invitación "Creá tu rifa gratis" (para visitantes de un talonario público). */
  showPromo?: boolean;
}

export const SiteFooter = ({ showPromo = false }: SiteFooterProps) => (
  <footer className="border-t bg-muted/30 mt-12">
    {showPromo && (
      <div className="border-b">
        <div className="container mx-auto px-4 py-6 text-center">
          <Link
            to="/?ref=raffle"
            onClick={() => track("promo_footer_clicked", { source: "raffle" })}
            className="inline-flex items-center gap-2 font-semibold text-primary hover:underline"
          >
            <Ticket className="w-5 h-5" />
            Creá tu rifa gratis con Rifa rápida
          </Link>
        </div>
      </div>
    )}
    <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>&copy; {new Date().getFullYear()} Rifa rápida</p>
      <nav className="flex items-center gap-4">
        <Link to="/terminos" className="hover:text-foreground hover:underline">
          Términos y condiciones
        </Link>
        <Link to="/privacidad" className="hover:text-foreground hover:underline">
          Política de privacidad
        </Link>
      </nav>
    </div>
  </footer>
);

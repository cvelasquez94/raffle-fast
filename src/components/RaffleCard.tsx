import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Trophy } from "lucide-react";
import { formatDrawDate } from "@/lib/raffles";

interface RaffleCardProps {
  raffle: any;
}

export const RaffleCard = ({ raffle }: RaffleCardProps) => {
  const navigate = useNavigate();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-success/10 text-success hover:bg-success/20";
      case "completed":
        return "bg-primary/10 text-primary hover:bg-primary/20";
      case "cancelled":
        return "bg-destructive/10 text-destructive hover:bg-destructive/20";
      default:
        return "";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Activa";
      case "completed":
        return "Completada";
      case "cancelled":
        return "Cancelada";
      default:
        return status;
    }
  };

  return (
    <Card className="shadow-card hover:shadow-elegant transition-shadow cursor-pointer group overflow-hidden" onClick={() => navigate(`/raffle/${raffle.id}`)}>
      {raffle.image_url && (
        <img
          src={raffle.image_url}
          alt={`Premio: ${raffle.title}`}
          className="w-full h-40 object-cover"
          loading="lazy"
        />
      )}
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-xl group-hover:text-primary transition-colors">
            {raffle.title}
          </CardTitle>
          <Badge className={getStatusColor(raffle.status)}>
            {getStatusText(raffle.status)}
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">
          {raffle.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Precio</span>
          <span className="font-semibold">${raffle.price_per_number}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total números</span>
          <span className="font-semibold">{raffle.total_numbers}</span>
        </div>
        {raffle.draw_date && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sorteo</span>
            <span className="font-semibold">{formatDrawDate(raffle.draw_date)}</span>
          </div>
        )}
        {raffle.winning_number != null && (
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm">
            <Trophy className="w-4 h-4 text-primary shrink-0" />
            <span>
              Ganador: <span className="font-semibold">N° {raffle.winning_number}</span>
              {raffle.winner_display_name ? ` · ${raffle.winner_display_name}` : ""}
            </span>
          </div>
        )}
        <Button variant="ghost" className="w-full gap-2 group-hover:bg-primary/10" onClick={(e) => {
          e.stopPropagation();
          navigate(`/raffle/${raffle.id}`);
        }}>
          Ver Talonario
          <ExternalLink className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
};

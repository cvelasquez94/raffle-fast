import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

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
    <Card className="shadow-card hover:shadow-elegant transition-shadow cursor-pointer group" onClick={() => navigate(`/raffle/${raffle.id}`)}>
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

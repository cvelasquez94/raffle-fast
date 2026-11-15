import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Navbar } from "@/components/Navbar";
import { NumberGrid } from "@/components/NumberGrid";
import { RaffleAdmin } from "@/components/RaffleAdmin";
import { RaffleImageInput } from "@/components/RaffleImageInput";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Share2, ArrowLeft, Pencil, CheckCircle2, Image, Download, MessageCircle, Instagram, Facebook, Trophy, CalendarDays, AlertTriangle } from "lucide-react";
import { clearPendingOrder, getPendingOrder, verifyOrderPayment } from "@/lib/payments";
import { formatDrawDate, formatDrawnAt, isValidDateString, removeRaffleImage, todayDateString, uploadRaffleImage } from "@/lib/raffles";
import { track } from "@/lib/analytics";
import { SiteFooter } from "@/components/SiteFooter";

import { isValidWhatsApp } from "@/lib/validation";

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
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editData, setEditData] = useState({
    title: "",
    description: "",
    price_per_number: "",
    whatsapp_number: "",
    draw_date: "",
    image_url: "",
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [drawDialogOpen, setDrawDialogOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [shareImageDialogOpen, setShareImageDialogOpen] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string>("");
  const [generatingImage, setGeneratingImage] = useState(false);
  const [hasPendingPayment, setHasPendingPayment] = useState(false);

  useEffect(() => {
    loadData();
    checkPaymentStatus();
    checkPendingPayment();
  }, [id]);

  const checkPaymentStatus = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
      toast({
        title: "¡Pago exitoso!",
        description: "Tu pago ha sido procesado correctamente. El número será marcado como vendido.",
      });
      // Limpiar el parámetro de la URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'failure') {
      toast({
        title: "Pago rechazado",
        description: "Tu pago no pudo ser procesado. El número quedará reservado por 24 horas.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'pending') {
      toast({
        title: "Pago pendiente",
        description: "Tu pago está siendo procesado. Te notificaremos cuando se complete.",
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  // Respaldo del webhook: si este navegador inició un pago, le pide al
  // servidor que consulte a Mercado Pago y actualice los números.
  const checkPendingPayment = async () => {
    const pendingOrder = id ? getPendingOrder(id) : null;
    setHasPendingPayment(!!pendingOrder);
    if (!pendingOrder) return;

    try {
      const status = await verifyOrderPayment(pendingOrder.orderId);

      if (status === "approved") {
        toast({
          title: "¡Pago confirmado!",
          description: "Tu pago fue procesado exitosamente. El vendedor confirmará la venta cuando reciba el dinero.",
        });
      } else if (status === "conflict") {
        toast({
          title: "Pago recibido",
          description: "Recibimos tu pago, pero alguno de los números ya no estaba disponible. Contactá al organizador para resolverlo.",
          variant: "destructive",
        });
      } else if (status === "rejected" || status === "cancelled") {
        toast({
          title: "Pago no completado",
          description: "El pago no fue procesado. Los números quedarán reservados por 24 horas.",
          variant: "destructive",
        });
      } else {
        return; // Sigue pendiente: se vuelve a consultar en la próxima visita.
      }

      clearPendingOrder();
      setHasPendingPayment(false);
      loadData();
    } catch (error) {
      console.error("Error al verificar pago pendiente:", error);
      // No mostrar error al usuario, esto es un chequeo en segundo plano
    }
  };

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      const { data: raffleData, error: raffleError } = await supabase
        .from("raffles")
        .select("*, profiles(full_name, mp_connected)")
        .eq("id", id)
        .single();

      if (raffleError) throw raffleError;

      const owner = session?.user?.id === raffleData.user_id;

      setRaffle(raffleData);
      setIsOwner(owner);

      // Los datos de los compradores solo los puede leer el dueño del talonario.
      const { data: numbersData, error: numbersError } = owner
        ? await supabase.rpc("get_raffle_numbers_for_owner", { p_raffle_id: id })
        : await supabase
            .from("raffle_numbers")
            .select("id, raffle_id, number, status, reserved_until")
            .eq("raffle_id", id)
            .order("number");

      if (numbersError) throw numbersError;
      setNumbers(numbersData || []);

      // Pagos cobrados cuyo número ya tenía otra persona: solo los ve el dueño.
      if (owner) {
        const { data: conflictData, error: conflictError } = await supabase
          .from("payment_orders")
          .select("id, created_at, amount, buyer_name, buyer_email, buyer_phone, number_ids, mp_payment_id")
          .eq("raffle_id", id)
          .eq("status", "conflict")
          .is("resolved_at", null)
          .order("created_at");

        if (conflictError) console.error("Error al cargar pagos en conflicto:", conflictError);
        setConflicts(conflictData || []);
      } else {
        setConflicts([]);
      }
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
    track("share_clicked", { raffle_id: id, method: "link", role: isOwner ? "owner" : "visitor" });
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
      draw_date: raffle.draw_date || "",
      image_url: raffle.image_url || "",
    });
    setEditImageFile(null);
    setEditErrors({});
    setEditDialogOpen(true);
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!editData.title || editData.title.trim().length < 3) {
      errors.title = "El título debe tener al menos 3 caracteres";
    } else if (editData.title.trim().length > 100) {
      errors.title = "El título no puede superar los 100 caracteres";
    }

    if (!editData.description || editData.description.trim().length < 10) {
      errors.description = "La descripción debe tener al menos 10 caracteres";
    } else if (editData.description.trim().length > 500) {
      errors.description = "La descripción no puede superar los 500 caracteres";
    }

    const price = parseFloat(editData.price_per_number);
    if (!editData.price_per_number || isNaN(price) || price <= 0) {
      errors.price_per_number = "El precio debe ser mayor a 0";
    } else if (price > 9999999) {
      errors.price_per_number = "El precio no puede superar $9.999.999";
    }

    if (!editData.whatsapp_number || !isValidWhatsApp(editData.whatsapp_number)) {
      errors.whatsapp_number = "El número debe incluir código de país, ej: +5491112345678";
    }

    if (editData.draw_date) {
      if (!isValidDateString(editData.draw_date)) {
        errors.draw_date = "La fecha del sorteo no es válida";
      } else if (editData.draw_date !== raffle.draw_date && editData.draw_date < todayDateString()) {
        errors.draw_date = "La fecha del sorteo no puede ser anterior a hoy";
      }
    }

    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!validateEditForm()) {
      return;
    }

    setSavingEdit(true);
    const previousImageUrl: string | null = raffle.image_url || null;
    let uploadedImageUrl: string | null = null;
    try {
      if (editImageFile) {
        uploadedImageUrl = await uploadRaffleImage(raffle.user_id, editImageFile);
      }
      const newImageUrl = uploadedImageUrl || editData.image_url || null;

      const { error } = await supabase
        .from("raffles")
        .update({
          title: editData.title,
          description: editData.description,
          price_per_number: parseFloat(editData.price_per_number),
          whatsapp_number: editData.whatsapp_number,
          draw_date: editData.draw_date || null,
          image_url: newImageUrl,
        })
        .eq("id", id);

      if (error) throw error;

      // La imagen anterior ya no se usa.
      if (previousImageUrl && previousImageUrl !== newImageUrl) {
        removeRaffleImage(previousImageUrl);
      }

      toast({
        title: "¡Actualizado!",
        description: "Los detalles del talonario han sido actualizados",
      });

      setEditDialogOpen(false);
      loadData();
    } catch (error: any) {
      // Si la imagen nueva se subió pero no se guardó el cambio, no dejarla huérfana.
      if (uploadedImageUrl) removeRaffleImage(uploadedImageUrl);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el talonario",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFinishRaffle = async () => {
    try {
      const { error } = await supabase
        .from("raffles")
        .update({ status: "completed" })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "¡Talonario finalizado!",
        description: "El talonario ha sido marcado como completado",
      });

      setFinishDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo finalizar el talonario",
        variant: "destructive",
      });
    }
  };

  // El sorteo se hace en el servidor (función draw_raffle_winner): elige al
  // azar entre los números vendidos o pagados y finaliza el talonario.
  const handleDrawWinner = async () => {
    setDrawing(true);
    try {
      const { data, error } = await supabase.rpc("draw_raffle_winner", { p_raffle_id: id });

      if (error) throw error;

      toast({
        title: "¡Sorteo realizado!",
        description: `Salió el número ${data.winning_number}${data.winner_display_name ? ` (${data.winner_display_name})` : ""}.`,
      });

      setDrawDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "No se pudo realizar el sorteo",
        description: error.message || "Probá de nuevo en unos minutos",
        variant: "destructive",
      });
    } finally {
      setDrawing(false);
    }
  };

  const handleResolveConflict = async (orderId: string) => {
    setResolvingConflictId(orderId);
    try {
      const { error } = await supabase.rpc("resolve_payment_conflict", { p_order_id: orderId });

      if (error) throw error;

      toast({
        title: "Pago marcado como resuelto",
        description: "Ya no se va a mostrar en esta lista",
      });
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo marcar el pago como resuelto",
        variant: "destructive",
      });
    } finally {
      setResolvingConflictId(null);
    }
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const handleGenerateShareImage = () => {
    track("share_clicked", { raffle_id: id, method: "image", role: isOwner ? "owner" : "visitor" });
    setGeneratingImage(true);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    const cols = 10;
    const rows = Math.ceil(numbers.length / cols);
    const cellSize = 60;
    const padding = 24;
    const headerHeight = 100;
    const legendHeight = 60;

    canvas.width = cols * cellSize + padding * 2;
    canvas.height = headerHeight + rows * cellSize + padding * 2 + legendHeight;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.fillStyle = "#1f2937";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(raffle.title, canvas.width / 2, padding + 28);

    // Stats subtitle
    const available = numbers.filter((n) => n.status === "available").length;
    const reserved = numbers.filter((n) => n.status === "reserved").length;
    const sold = numbers.filter((n) => n.status === "sold").length;
    const paid = numbers.filter((n) => n.status === "paid").length;
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(
      `${available} disponibles · ${reserved} reservados · ${paid} pagados · ${sold} vendidos`,
      canvas.width / 2,
      padding + 56
    );

    // Draw numbers
    const statusColors: Record<string, string> = {
      available: "#22c55e",
      reserved: "#f59e0b",
      paid: "#3b82f6",
      sold: "#9ca3af",
    };

    numbers.forEach((num, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = padding + col * cellSize;
      const y = headerHeight + padding + row * cellSize;
      const size = cellSize - 4;

      ctx.fillStyle = statusColors[num.status] || "#9ca3af";
      drawRoundedRect(ctx, x + 2, y + 2, size, size, 8);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(num.number), x + 2 + size / 2, y + 2 + size / 2);
    });

    // Legend
    const legendY = headerHeight + padding + rows * cellSize + 16;
    const legendItems = [
      { color: "#22c55e", label: "Disponible" },
      { color: "#f59e0b", label: "Reservado" },
      { color: "#3b82f6", label: "Pagado" },
      { color: "#9ca3af", label: "Vendido" },
    ];

    ctx.textBaseline = "alphabetic";
    const legendItemWidth = canvas.width / legendItems.length;
    legendItems.forEach((item, i) => {
      const lx = i * legendItemWidth + legendItemWidth / 2;
      ctx.fillStyle = item.color;
      drawRoundedRect(ctx, lx - 30, legendY, 14, 14, 3);
      ctx.fill();
      ctx.fillStyle = "#374151";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(item.label, lx - 12, legendY + 12);
    });

    // Marca de agua con el sitio
    ctx.fillStyle = "#9ca3af";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Creá tu rifa gratis en ${window.location.host} · Rifa rápida`, canvas.width / 2, canvas.height - 14);

    const dataUrl = canvas.toDataURL("image/png");
    setShareImageUrl(dataUrl);
    setGeneratingImage(false);
    setShareImageDialogOpen(true);
  };

  const handleDownloadImage = (platform?: string) => {
    if (!shareImageUrl) return;
    const link = document.createElement("a");
    link.download = `talonario-${raffle.title.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = shareImageUrl;
    link.click();
    if (platform === "instagram") {
      toast({
        title: "Imagen descargada",
        description: "Abrí Instagram y subí la imagen a tu historia",
      });
    }
  };

  const handleShareToWhatsApp = async () => {
    if (shareImageUrl && navigator.share) {
      try {
        const blob = await (await fetch(shareImageUrl)).blob();
        const file = new File([blob], "talonario.png", { type: "image/png" });
        await navigator.share({ files: [file], title: raffle.title });
        return;
      } catch (e) {
        // fallback
      }
    }
    handleDownloadImage("whatsapp");
    toast({
      title: "Imagen descargada",
      description: "Abrí WhatsApp y compartí la imagen en tu estado",
    });
  };

  const handleShareToFacebook = async () => {
    if (shareImageUrl && navigator.share) {
      try {
        const blob = await (await fetch(shareImageUrl)).blob();
        const file = new File([blob], "talonario.png", { type: "image/png" });
        await navigator.share({ files: [file], title: raffle.title });
        return;
      } catch (e) {
        // fallback
      }
    }
    handleDownloadImage("facebook");
    toast({
      title: "Imagen descargada",
      description: "Subí la imagen a tu historia de Facebook",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Función para verificar pago manualmente (útil para testing)
  const handleManualPaymentCheck = () => {
    checkPendingPayment();
  };

  const hasWinner = raffle.winning_number != null;
  const participantsCount = numbers.filter(n => n.status === "sold" || n.status === "paid").length;
  const reservedCount = numbers.filter(n => n.status === "reserved").length;
  // Solo el dueño recibe los datos de contacto (filas de get_raffle_numbers_for_owner).
  const winnerNumber = hasWinner && isOwner ? numbers.find(n => n.number === raffle.winning_number) : null;

  const conflictNumbersText = (order: any) => {
    const list = (order.number_ids || [])
      .map((numberId: string) => numbers.find(n => n.id === numberId)?.number)
      .filter((n: number | undefined) => n != null)
      .sort((a: number, b: number) => a - b);
    return list.length > 0 ? list.join(", ") : "—";
  };

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

        {/* Verificación manual, visible mientras haya un pago iniciado desde este navegador */}
        {hasPendingPayment && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm mb-2">Hay un pago pendiente de verificación</p>
            <Button onClick={handleManualPaymentCheck} size="sm" variant="outline">
              Verificar estado del pago
            </Button>
          </div>
        )}

        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-4">
            {raffle.image_url && (
              <img
                src={raffle.image_url}
                alt={`Premio: ${raffle.title}`}
                className="w-full max-h-96 object-cover rounded-lg border"
              />
            )}
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl md:text-4xl font-bold">{raffle.title}</h1>
                  {raffle.status === "completed" && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Finalizado
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">{raffle.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold">
                    Precio por número: ${raffle.price_per_number}
                  </span>
                  {raffle.draw_date && (
                    <span className="font-semibold inline-flex items-center gap-1">
                      <CalendarDays className="w-4 h-4" />
                      {hasWinner ? "Fecha prevista" : "Se sortea el"}: {formatDrawDate(raffle.draw_date)}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Organizado por {raffle.profiles?.full_name || "Usuario"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:justify-end">
                {isOwner && !hasWinner && raffle.status !== "cancelled" && (
                  <Button onClick={() => setDrawDialogOpen(true)} variant="outline" className="gap-2">
                    <Trophy className="w-4 h-4" />
                    Sortear ganador
                  </Button>
                )}
                {isOwner && raffle.status !== "completed" && (
                  <>
                    <Button onClick={handleOpenEdit} variant="outline" className="gap-2">
                      <Pencil className="w-4 h-4" />
                      Editar
                    </Button>
                    <Button onClick={() => setFinishDialogOpen(true)} variant="outline" className="gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Finalizar
                    </Button>
                  </>
                )}
                <Button
                  onClick={handleGenerateShareImage}
                  variant="outline"
                  className="gap-2"
                  disabled={generatingImage}
                >
                  {generatingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Image className="w-4 h-4" />
                  )}
                  Compartir imagen
                </Button>
                <Button onClick={handleShare} className="gap-2">
                  <Share2 className="w-4 h-4" />
                  Compartir
                </Button>
              </div>
            </div>

            {/* Ganador del sorteo */}
            {hasWinner && (
              <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-6 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-yellow-700">
                  <Trophy className="w-6 h-6" />
                  <h2 className="text-xl font-bold">¡Ya hay ganador!</h2>
                </div>
                <p className="text-5xl font-bold text-yellow-900">N° {raffle.winning_number}</p>
                {raffle.winner_display_name && (
                  <p className="text-lg font-semibold text-yellow-900">{raffle.winner_display_name}</p>
                )}
                <p className="text-sm text-yellow-800">Sorteado el {formatDrawnAt(raffle.drawn_at)}</p>

                {isOwner && (
                  <div className="mt-4 pt-4 border-t border-yellow-300 text-left text-sm text-yellow-900 space-y-1">
                    <p className="font-semibold">Datos de contacto del ganador (solo los ves vos)</p>
                    {winnerNumber?.buyer_name ? (
                      <>
                        <p>Nombre: {winnerNumber.buyer_name}</p>
                        <p>Email: {winnerNumber.buyer_email || "No informado"}</p>
                        <p>
                          Teléfono:{" "}
                          {winnerNumber.buyer_phone ? (
                            <a
                              href={`https://wa.me/${winnerNumber.buyer_phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {winnerNumber.buyer_phone}
                            </a>
                          ) : (
                            "No informado"
                          )}
                        </p>
                      </>
                    ) : (
                      <p>El número ganador ya no tiene datos de comprador cargados.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Pagos en conflicto (solo dueño) */}
            {isOwner && conflicts.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {conflicts.length === 1
                    ? "Tenés 1 pago en conflicto"
                    : `Tenés ${conflicts.length} pagos en conflicto`}
                </AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    Recibiste el dinero por Mercado Pago, pero cuando se acreditó el pago alguno de los números ya
                    era de otra persona. Contactá al comprador y devolvele el dinero desde tu cuenta de Mercado Pago
                    (buscá el pago por su N° de operación), o asignale otro número disponible desde "Administrar".
                  </p>
                  <div className="space-y-2">
                    {conflicts.map((order) => (
                      <div key={order.id} className="rounded-md border border-destructive/30 bg-background p-3 text-foreground space-y-1">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-semibold">{order.buyer_name}</span>
                          <span className="font-semibold">${Number(order.amount).toLocaleString("es-AR")}</span>
                        </div>
                        <p>Números pedidos: {conflictNumbersText(order)}</p>
                        <p>Email: {order.buyer_email || "No informado"}</p>
                        <p>Teléfono: {order.buyer_phone || "No informado"}</p>
                        <p>N° de operación de Mercado Pago: {order.mp_payment_id || "No informado"}</p>
                        <p className="text-xs text-muted-foreground">
                          Pago iniciado el {formatDrawnAt(order.created_at)}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => handleResolveConflict(order.id)}
                          disabled={resolvingConflictId === order.id}
                        >
                          {resolvingConflictId === order.id ? "Guardando..." : "Marcar como resuelto"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
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
                label="Pagados"
                value={numbers.filter(n => n.status === "paid").length}
                color="blue-500"
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

      <SiteFooter showPromo={!isOwner} />

      {/* Share Image Dialog */}
      <Dialog open={shareImageDialogOpen} onOpenChange={setShareImageDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Compartir estado del talonario</DialogTitle>
            <DialogDescription>
              Compartí esta imagen en tus redes para que tus seguidores vean los números disponibles
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {shareImageUrl && (
              <div className="border rounded-lg overflow-hidden">
                <img src={shareImageUrl} alt="Preview del talonario" className="w-full" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => handleShareToWhatsApp()}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </Button>
              <Button
                onClick={() => handleDownloadImage("instagram")}
                variant="outline"
                className="gap-2"
              >
                <Instagram className="w-4 h-4" />
                Instagram
              </Button>
              <Button
                onClick={() => handleShareToFacebook()}
                variant="outline"
                className="gap-2"
              >
                <Facebook className="w-4 h-4" />
                Facebook
              </Button>
              <Button
                onClick={() => handleDownloadImage()}
                variant="outline"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Descargar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                onChange={(e) => {
                  setEditData({ ...editData, title: e.target.value });
                  setEditErrors({ ...editErrors, title: "" });
                }}
                placeholder="Ej: Rifa de iPhone 15 Pro"
                maxLength={100}
              />
              {editErrors.title && (
                <p className="text-sm text-destructive mt-1">{editErrors.title}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción *</Label>
              <Textarea
                id="edit-description"
                value={editData.description}
                onChange={(e) => {
                  setEditData({ ...editData, description: e.target.value });
                  setEditErrors({ ...editErrors, description: "" });
                }}
                placeholder="Describe el premio, fecha del sorteo, etc."
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {editData.description.length}/500
              </p>
              {editErrors.description && (
                <p className="text-sm text-destructive mt-1">{editErrors.description}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-price">Precio por Número (ARS) *</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                min="0.01"
                max="9999999"
                value={editData.price_per_number}
                onChange={(e) => {
                  setEditData({ ...editData, price_per_number: e.target.value });
                  setEditErrors({ ...editErrors, price_per_number: "" });
                }}
                placeholder="1000.00"
              />
              {editErrors.price_per_number && (
                <p className="text-sm text-destructive mt-1">{editErrors.price_per_number}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-whatsapp">WhatsApp (con código de país) *</Label>
              <Input
                id="edit-whatsapp"
                type="tel"
                value={editData.whatsapp_number}
                onChange={(e) => {
                  setEditData({ ...editData, whatsapp_number: e.target.value });
                  setEditErrors({ ...editErrors, whatsapp_number: "" });
                }}
                placeholder="+5491112345678"
              />
              {editErrors.whatsapp_number && (
                <p className="text-sm text-destructive mt-1">{editErrors.whatsapp_number}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-draw-date">Fecha del sorteo (opcional)</Label>
              <Input
                id="edit-draw-date"
                type="date"
                value={editData.draw_date}
                onChange={(e) => {
                  setEditData({ ...editData, draw_date: e.target.value });
                  setEditErrors({ ...editErrors, draw_date: "" });
                }}
              />
              {editErrors.draw_date && (
                <p className="text-sm text-destructive mt-1">{editErrors.draw_date}</p>
              )}
            </div>

            <RaffleImageInput
              id="edit-image"
              currentUrl={editData.image_url}
              file={editImageFile}
              onFileChange={setEditImageFile}
              onRemoveCurrent={() => setEditData({ ...editData, image_url: "" })}
              error={editErrors.image}
              onError={(message) => setEditErrors({ ...editErrors, image: message })}
              disabled={savingEdit}
            />

            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Pagos con Mercado Pago</h3>
                <p className="text-xs text-muted-foreground">
                  Los pagos con Mercado Pago se configuran desde tu Dashboard conectando tu cuenta.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/dashboard")}
                  className="mt-2"
                >
                  Ir a configuración de pagos
                </Button>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={
                  savingEdit ||
                  !editData.title ||
                  !editData.description ||
                  !editData.price_per_number ||
                  !editData.whatsapp_number
                }
              >
                {savingEdit ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Draw Winner Confirmation Dialog */}
      <AlertDialog open={drawDialogOpen} onOpenChange={(open) => !drawing && setDrawDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Sortear ganador?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {participantsCount === 0 ? (
                  <p>
                    Todavía no hay números vendidos ni pagados. Confirmá al menos una venta para poder sortear.
                  </p>
                ) : (
                  <>
                    <p>
                      Se va a elegir al azar un ganador entre{" "}
                      {participantsCount === 1
                        ? "el único número vendido o pagado"
                        : `los ${participantsCount} números vendidos o pagados`}
                      . El resultado se publica en la página del talonario con el número, el nombre y la inicial del
                      apellido del ganador.
                    </p>
                    {reservedCount > 0 && (
                      <p className="font-semibold text-foreground">
                        {reservedCount === 1
                          ? "Hay 1 número reservado sin confirmar: no participa del sorteo."
                          : `Hay ${reservedCount} números reservados sin confirmar: no participan del sorteo.`}{" "}
                        Si ya te los pagaron, confirmá la venta antes de sortear.
                      </p>
                    )}
                    <p className="font-semibold text-foreground">
                      Esta acción no se puede deshacer ni repetir, y finaliza el talonario.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={drawing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={drawing || participantsCount === 0}
              onClick={(e) => {
                e.preventDefault(); // el diálogo se cierra cuando termina el sorteo
                handleDrawWinner();
              }}
            >
              {drawing ? "Sorteando..." : "Sortear ahora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Finish Raffle Confirmation Dialog */}
      <AlertDialog open={finishDialogOpen} onOpenChange={setFinishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar talonario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará el talonario como finalizado sin sortear. Ya no podrás editar la información del talonario ni gestionar los números. Los compradores aún podrán ver el talonario. Si querés elegir un ganador, usá "Sortear ganador" (podés hacerlo también después de finalizar).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinishRaffle}>
              Finalizar Talonario
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

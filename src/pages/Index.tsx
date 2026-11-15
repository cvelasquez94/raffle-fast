import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import {
  Ticket,
  MessageCircle,
  CreditCard,
  Image,
  Plane,
  GraduationCap,
  Trophy,
  HeartHandshake,
  Check,
} from "lucide-react";

const SEGMENTS = [
  {
    icon: <Plane className="w-6 h-6" />,
    title: "Viajes de egresados",
    description: "Cada familia comparte el link del curso y ve en el momento qué números quedan.",
  },
  {
    icon: <GraduationCap className="w-6 h-6" />,
    title: "Cooperadoras escolares",
    description: "Juntá fondos para la escuela sin talonarios de papel ni planillas que se pierden.",
  },
  {
    icon: <Trophy className="w-6 h-6" />,
    title: "Clubes",
    description: "Financiá viajes, indumentaria o arreglos de la sede con una rifa entre socios y vecinos.",
  },
  {
    icon: <HeartHandshake className="w-6 h-6" />,
    title: "ONGs y causas solidarias",
    description: "Llegá a más gente compartiendo tu rifa en redes y grupos de WhatsApp.",
  },
];

const STEPS = [
  {
    title: "Creá tu talonario",
    description: "Poné el premio, el precio por número y tu WhatsApp. Lleva un par de minutos.",
  },
  {
    title: "Compartí el link",
    description: "Mandalo por WhatsApp o publicalo en tus redes. Cada persona elige su número desde el celular.",
  },
  {
    title: "Recibí reservas y pagos",
    description: "Te avisan por WhatsApp o pagan con Mercado Pago. Vos ves quién tiene cada número desde tu panel.",
  },
];

const BENEFITS = [
  {
    icon: <Ticket className="w-8 h-8" />,
    title: "Talonario digital",
    description: "Todos los números en un solo link, siempre actualizados. Se terminó el \"¿el 27 está libre?\".",
  },
  {
    icon: <MessageCircle className="w-8 h-8" />,
    title: "Reservas por WhatsApp",
    description: "El comprador reserva su número y te escribe con el mensaje ya armado para coordinar el pago.",
  },
  {
    icon: <CreditCard className="w-8 h-8" />,
    title: "Cobro con Mercado Pago",
    description: "Conectá tu cuenta y cobrá online. La plata va directo a tu Mercado Pago.",
  },
  {
    icon: <Image className="w-8 h-8" />,
    title: "Imagen para compartir",
    description: "Generá una imagen con el estado del talonario para tus historias y grupos.",
  },
];

const FAQS = [
  {
    question: "¿Cuánto cuesta usar Rifa rápida?",
    answer:
      "Crear talonarios y gestionar reservas por WhatsApp es gratis. Solo cobramos una comisión sobre los pagos online que recibas con Mercado Pago, que se te informa antes de activar los cobros.",
  },
  {
    question: "¿Necesito tener cuenta de Mercado Pago?",
    answer:
      "No. Podés usar solo las reservas por WhatsApp y cobrar como prefieras (efectivo, transferencia). Si querés cobrar online, conectás tu cuenta de Mercado Pago desde tu panel.",
  },
  {
    question: "¿A dónde va la plata de los pagos online?",
    answer:
      "Directo a la cuenta de Mercado Pago del organizador. Rifa rápida no recibe ni retiene el dinero de los compradores.",
  },
  {
    question: "¿Los compradores tienen que registrarse?",
    answer:
      "No. Entran al link, eligen su número y dejan sus datos de contacto. Esos datos solo los ve quien organiza la rifa.",
  },
  {
    question: "¿Qué pasa si alguien reserva y no paga?",
    answer:
      "La reserva tiene un plazo. Desde tu panel podés liberar el número cuando quieras para que vuelva a estar disponible, o marcarlo como vendido cuando te pagan.",
  },
  {
    question: "¿Rifa rápida hace el sorteo o entrega el premio?",
    answer:
      "No. Rifa rápida es una herramienta para gestionar el talonario. Quien organiza la rifa es responsable de contar con las autorizaciones que correspondan en su jurisdicción, de realizar el sorteo y de entregar el premio.",
  },
];

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

  const handleCta = (location: string) => {
    track("landing_cta_clicked", { location });
    navigate(user ? "/dashboard" : "/auth?signup=true");
  };

  const ctaClassName =
    "text-lg px-8 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-shadow";

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-background" />
        <div className="container mx-auto px-4 py-16 md:py-24 relative">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Para egresados, cooperadoras, clubes y ONGs
            </p>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent pb-1">
              Organizá tu rifa online sin planillas ni talonarios de papel
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Creá tu talonario digital, compartilo por WhatsApp y llevá el control de cada número.
              Cobrá en mano o con Mercado Pago.
            </p>
            <div className="flex gap-4 justify-center flex-wrap pt-2">
              <Button size="lg" onClick={() => handleCta("hero")} className={ctaClassName}>
                {user ? "Ir a mi panel" : "Crear mi rifa gratis"}
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg px-8">
                <a href="#como-funciona">Cómo funciona</a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Gratis para reservas por WhatsApp. Sin tarjeta de crédito.
            </p>
          </div>
        </div>
      </section>

      {/* Para quién */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Pensada para quienes juntan fondos
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {SEGMENTS.map((segment) => (
              <div key={segment.title} className="p-6 rounded-xl border bg-card space-y-3">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {segment.icon}
                </div>
                <h3 className="text-lg font-semibold">{segment.title}</h3>
                <p className="text-muted-foreground">{segment.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="py-16 bg-muted/30 scroll-mt-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Cómo funciona
          </h2>
          <ol className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {STEPS.map((step, index) => (
              <li key={step.title} className="text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
                  {index + 1}
                </div>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Beneficios */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Todo lo que necesitás para tu rifa
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {BENEFITS.map((benefit) => (
              <FeatureCard key={benefit.title} {...benefit} />
            ))}
          </div>
        </div>
      </section>

      {/* Precios */}
      <section id="precios" className="py-16 bg-muted/30 scroll-mt-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Precios simples
          </h2>
          <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-12">
            Gratis para reservas por WhatsApp; comisión solo sobre pagos online.
          </p>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-2xl">Reservas por WhatsApp</CardTitle>
                <CardDescription>Cobrás por tu cuenta: efectivo, transferencia o como prefieras.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-4xl font-bold">Gratis</p>
                <ul className="space-y-2">
                  <PricingItem>Talonario digital con link para compartir</PricingItem>
                  <PricingItem>Reservas con aviso por WhatsApp</PricingItem>
                  <PricingItem>Panel para administrar cada número</PricingItem>
                  <PricingItem>Imagen del talonario para redes</PricingItem>
                </ul>
              </CardContent>
            </Card>
            <Card className="shadow-card border-primary/40">
              <CardHeader>
                <CardTitle className="text-2xl">Pagos online</CardTitle>
                <CardDescription>Tus compradores pagan con Mercado Pago desde el talonario.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-4xl font-bold">Comisión por pago</p>
                <ul className="space-y-2">
                  <PricingItem>Todo lo del plan gratuito</PricingItem>
                  <PricingItem>La plata se acredita en tu cuenta de Mercado Pago</PricingItem>
                  <PricingItem>Solo pagás comisión por los pagos online aprobados</PricingItem>
                  <PricingItem>Sin costo fijo ni abono mensual</PricingItem>
                </ul>
                <p className="text-sm text-muted-foreground">
                  La comisión vigente se informa antes de activar los cobros. Mercado Pago puede aplicar
                  sus propios cargos.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Preguntas frecuentes */}
      <section id="preguntas" className="py-16 scroll-mt-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Preguntas frecuentes
          </h2>
          <Accordion type="single" collapsible className="max-w-3xl mx-auto">
            {FAQS.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-base">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-base">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA final */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6 p-8 md:p-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border shadow-elegant">
            <h2 className="text-3xl md:text-4xl font-bold">
              ¿Arrancamos con tu rifa?
            </h2>
            <p className="text-lg text-muted-foreground">
              Creá tu talonario gratis y compartilo hoy mismo.
            </p>
            <Button size="lg" onClick={() => handleCta("footer")} className={ctaClassName}>
              {user ? "Ir a mi panel" : "Crear mi rifa gratis"}
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
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

const PricingItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2">
    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
    <span>{children}</span>
  </li>
);

export default Index;

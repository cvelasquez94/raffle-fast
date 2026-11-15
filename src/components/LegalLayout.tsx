import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

/** Estructura común de las páginas legales (/terminos y /privacidad). */
export const LegalLayout = ({ title, lastUpdated, children }: LegalLayoutProps) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | Rifa rápida`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-12 flex-1">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{title}</h1>
          <p className="text-sm text-muted-foreground mb-10">Última actualización: {lastUpdated}</p>
          <div className="space-y-8">{children}</div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
};

export const LegalSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold">{title}</h2>
    <div className="space-y-3 text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground">
      {children}
    </div>
  </section>
);

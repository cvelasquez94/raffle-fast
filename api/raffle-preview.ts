/**
 * Vista previa de un talonario para WhatsApp, Facebook, X, etc.
 *
 * La app es una SPA: los crawlers de redes sociales no ejecutan JavaScript y
 * solo ven los meta tags genéricos de index.html. `vercel.json` reescribe a
 * esta función los pedidos a /raffle/:id cuyo User-Agent es de un crawler
 * conocido; el resto de los visitantes sigue recibiendo la SPA.
 *
 * Lee de Supabase REST con la clave pública (anon) únicamente columnas
 * públicas del talonario. No expone datos de compradores ni del organizador.
 */

export const config = { runtime: "edge" };

declare const process: { env: Record<string, string | undefined> };

const SITE_NAME = "Rifa rápida";
const DEFAULT_TITLE = "Rifa rápida - Creá y gestioná tus rifas online";
const DEFAULT_DESCRIPTION =
  "Creá tu talonario digital, compartilo por WhatsApp y cobrá con Mercado Pago.";
const DEFAULT_IMAGE_PATH = "/og-image.png";
const MAX_DESCRIPTION_LENGTH = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RafflePreview {
  title: string;
  description: string | null;
  price_per_number: number | string | null;
  status: string | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function formatPrice(price: number | string | null): string | null {
  const amount = Number(price);
  if (price === null || price === "" || !Number.isFinite(amount)) return null;
  return `$${amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

/** El id llega como ?id= (rewrite de vercel.json) o en el path /raffle/:id. */
export function getRaffleId(url: URL): string | null {
  const fromQuery = url.searchParams.get("id");
  const fromPath = url.pathname.match(/^\/raffle\/([^/]+)\/?$/)?.[1];
  const id = fromQuery || fromPath || "";
  return UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}

export function buildPreviewHtml(origin: string, raffleId: string | null, raffle: RafflePreview | null): string {
  const pagePath = raffleId ? `/raffle/${raffleId}` : "/";
  const pageUrl = `${origin}${pagePath}`;
  const imageUrl = `${origin}${DEFAULT_IMAGE_PATH}`;

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;

  if (raffle) {
    const price = formatPrice(raffle.price_per_number);
    const finished = raffle.status === "completed";
    title = `${truncate(raffle.title, 100)} | ${SITE_NAME}`;

    const lead = finished ? "Rifa finalizada." : price ? `${price} por número.` : "";
    const body = raffle.description ? truncate(raffle.description, MAX_DESCRIPTION_LENGTH) : "";
    description = [lead, body].filter(Boolean).join(" ") || DEFAULT_DESCRIPTION;
  }

  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(pageUrl);
  const img = escapeHtml(imageUrl);

  // El script es una red de seguridad: si una persona (no un crawler) recibe
  // este documento, la manda a la SPA. `_spa` evita que vercel.json vuelva a
  // reescribir el pedido hacia esta función.
  const spaPath = JSON.stringify(`${pagePath}${raffleId ? "?_spa=1" : ""}`).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <link rel="canonical" href="${u}" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="es_AR" />
    <meta property="og:url" content="${u}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />
    <script>location.replace(${spaPath});</script>
  </head>
  <body>
    <h1>${t}</h1>
    <p>${d}</p>
    <p><a href="${u}">Ver el talonario</a></p>
  </body>
</html>
`;
}

async function fetchRaffle(raffleId: string): Promise<RafflePreview | null> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Faltan las variables de entorno de Supabase");

  const query = new URLSearchParams({
    id: `eq.${raffleId}`,
    select: "title,description,price_per_number,status",
    limit: "1",
  });

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/raffles?${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status}`);

  const rows = (await response.json()) as RafflePreview[];
  const row = Array.isArray(rows) ? rows[0] : null;
  return row && typeof row.title === "string" ? row : null;
}

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Sin caché en el CDN: la respuesta depende del User-Agent (ver vercel.json)
      // y no debe servirse a visitantes comunes.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raffleId = getRaffleId(url);

  if (!raffleId) return htmlResponse(buildPreviewHtml(url.origin, null, null), 404);

  try {
    const raffle = await fetchRaffle(raffleId);
    if (!raffle) return htmlResponse(buildPreviewHtml(url.origin, raffleId, null), 404);
    return htmlResponse(buildPreviewHtml(url.origin, raffleId, raffle), 200);
  } catch (error) {
    // Si Supabase falla, igual devolvemos una vista previa genérica.
    console.error("raffle-preview:", error);
    return htmlResponse(buildPreviewHtml(url.origin, raffleId, null), 200);
  }
}

/**
 * Analítica opcional. No carga nada salvo que estén definidas las variables:
 *   VITE_GA_MEASUREMENT_ID  -> Google Analytics 4
 *   VITE_META_PIXEL_ID      -> Meta Pixel
 *
 * Regla: nunca enviar datos personales (nombres, emails, teléfonos) en los
 * eventos. Solo ids de talonario, cantidades y montos.
 */

type EventParams = Record<string, string | number | boolean | undefined>;

interface MetaPixel {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: MetaPixel;
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: MetaPixel;
    _fbq?: MetaPixel;
  }
}

const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim();
const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim();

// Eventos del embudo que tienen un equivalente estándar en Meta.
const META_STANDARD_EVENTS: Record<string, string> = {
  sign_up: "CompleteRegistration",
  reservation_made: "Lead",
  payment_started: "InitiateCheckout",
};

let initialized = false;

function loadScript(src: string) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function initGoogleAnalytics(id: string) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js espera el objeto `arguments`, no un array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  // Las vistas de página se envían a mano en cada cambio de ruta.
  window.gtag("config", id, { send_page_view: false });
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

function initMetaPixel(id: string) {
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as MetaPixel;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
    loadScript("https://connect.facebook.net/en_US/fbevents.js");
  }
  window.fbq("init", id);
}

/** Carga los scripts configurados. Se puede llamar más de una vez. */
export function initAnalytics() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  try {
    if (GA_ID) initGoogleAnalytics(GA_ID);
    if (PIXEL_ID) initMetaPixel(PIXEL_ID);
  } catch (error) {
    console.error("No se pudo iniciar la analítica:", error);
  }
}

/** Registra una vista de página. `path` no debe incluir query string. */
export function trackPageView(path: string, params: EventParams = {}) {
  initAnalytics();

  try {
    if (GA_ID && window.gtag) {
      window.gtag("event", "page_view", {
        page_path: path,
        page_location: `${window.location.origin}${path}`,
        page_title: document.title,
        ...params,
      });
    }
    if (PIXEL_ID && window.fbq) window.fbq("track", "PageView");
  } catch (error) {
    console.error("No se pudo registrar la vista de página:", error);
  }
}

const OAUTH_SIGNUP_KEY = "pending_oauth_signup";
const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;

/** Marca que este navegador inició un ingreso con Google (antes de salir del sitio). */
export function markPendingOAuthSignUp() {
  try {
    sessionStorage.setItem(OAUTH_SIGNUP_KEY, "google");
  } catch {
    // Sin sessionStorage no se puede atribuir el registro; no es crítico.
  }
}

/**
 * Al volver de Google no se sabe si fue un registro o un ingreso: se cuenta
 * como registro solo si la cuenta se creó hace instantes.
 */
export function trackOAuthSignUpIfNew(userCreatedAt?: string) {
  try {
    const method = sessionStorage.getItem(OAUTH_SIGNUP_KEY);
    if (!method) return;
    sessionStorage.removeItem(OAUTH_SIGNUP_KEY);

    const createdAt = userCreatedAt ? new Date(userCreatedAt).getTime() : NaN;
    if (Date.now() - createdAt < NEW_ACCOUNT_WINDOW_MS) track("sign_up", { method });
  } catch {
    // Ver markPendingOAuthSignUp.
  }
}

/** Registra un evento del embudo. No incluir datos personales en `params`. */
export function track(event: string, params: EventParams = {}) {
  initAnalytics();

  try {
    if (GA_ID && window.gtag) window.gtag("event", event, params);

    if (PIXEL_ID && window.fbq) {
      const standardEvent = META_STANDARD_EVENTS[event];
      if (standardEvent) window.fbq("track", standardEvent, params);
      else window.fbq("trackCustom", event, params);
    }
  } catch (error) {
    // La analítica nunca debe romper un flujo de la app.
    console.error("No se pudo registrar el evento:", error);
  }
}

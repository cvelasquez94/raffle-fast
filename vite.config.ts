import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Reemplaza __SITE_URL__ en index.html por la URL pública del sitio, para que
 * og:url, og:image y canonical sean absolutas (los crawlers no aceptan rutas
 * relativas). Usa VITE_SITE_URL si está definida; si no, el dominio de
 * producción que Vercel expone al compilar. Sin ninguna de las dos queda
 * vacío (rutas relativas), que es lo esperable en desarrollo local.
 */
const siteUrlPlugin = (mode: string): Plugin => ({
  name: "site-url",
  transformIndexHtml(html) {
    const env = loadEnv(mode, process.cwd(), "");
    const vercelDomain = env.VERCEL_PROJECT_PRODUCTION_URL;
    const siteUrl = (env.VITE_SITE_URL || (vercelDomain ? `https://${vercelDomain}` : "")).replace(/\/+$/, "");
    return html.replace(/__SITE_URL__/g, siteUrl);
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [".ngrok-free.app"],
  },
  plugins: [react(), siteUrlPlugin(mode)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

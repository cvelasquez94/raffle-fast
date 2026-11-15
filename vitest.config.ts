import { defineConfig } from "vitest/config";
import path from "path";

// Tests unitarios del frontend (src/), de la lógica pura de las Edge Functions
// y de la base de datos (supabase/tests/, Postgres en memoria con PGlite).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    // Cada archivo de tests de base levanta su propio Postgres en memoria.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

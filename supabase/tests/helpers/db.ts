// Base de datos de prueba: Postgres en memoria (PGlite) con el esquema real.
//
// Emula lo que Supabase trae de fábrica y que nuestro SQL da por sentado:
// los roles `anon`, `authenticated` y `service_role`, `auth.users`,
// `auth.uid()` (leído del claim del JWT) y los privilegios por defecto del
// schema `public` (todo concedido a los tres roles; el SQL del repo es el que
// tiene que revocar lo que no corresponde).
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, "migrations");

const readSql = (relativePath: string) => readFileSync(path.join(SUPABASE_DIR, relativePath), "utf8");

/** Archivos de supabase/migrations en el orden en que hay que aplicarlos. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * Aplica todas las migraciones, cada archivo en su propio `exec`: la primera
 * agrega un valor al enum que Postgres no deja usar en la misma transacción.
 */
export async function applyMigrations(db: PGlite): Promise<void> {
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
}

export const OWNER_ID = "11111111-1111-1111-1111-111111111111";
export const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
export const TOTAL_NUMBERS = 60;
export const PRICE = 100;

type Role = "anon" | "authenticated" | "service_role";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export interface TestDb {
  db: PGlite;
  /** Talonario activo del usuario OWNER_ID, con TOTAL_NUMBERS números a PRICE cada uno. */
  raffleId: string;
  /** Ids de los números del talonario, ordenados por número (ids[0] es el número 1). */
  ids: string[];
  /** Cambia de rol, como hace PostgREST según el JWT. `userId` es el `sub` del JWT. */
  as: (role: Role, userId?: string) => Promise<void>;
  /** Ejecuta una consulta con el rol activo y devuelve las filas. */
  q: (sql: string, params?: unknown[]) => Promise<Row[]>;
  /**
   * Ejecuta una consulta como superusuario (sin RLS ni permisos de columna),
   * para preparar o inspeccionar datos, y después restaura el rol activo.
   */
  admin: (sql: string, params?: unknown[]) => Promise<Row[]>;
  /** Fila completa de raffle_numbers, leída como superusuario. */
  numberRow: (id: string) => Promise<Row>;
  /** Simula los headers del request que PostgREST expone a las funciones SQL. */
  setRequestHeaders: (headers: Record<string, string> | null) => Promise<void>;
  /** Llama a la función pública reserve_numbers con el rol activo. */
  reserve: (numberIds: string[], buyerName: string, email?: string | null, phone?: string | null) => Promise<Row[]>;
  /**
   * Crea una orden de pago como lo hace la Edge Function mp-create-payment:
   * reserva los números (salvo `reserve: false`), inserta la orden y la
   * asocia a los números. Se ejecuta como superusuario.
   */
  createOrder: (numberIds: string[], buyerName: string, options?: { reserve?: boolean }) => Promise<string>;
  /** Llama a apply_order_payment como service_role y devuelve el estado resultante. */
  applyPayment: (orderId: string, mpPaymentId: string, status: string, detail?: string | null) => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Crea una base nueva: schema.sql, el estado previo a las migraciones (tokens
 * de Mercado Pago todavía en `profiles`), datos de prueba y las migraciones.
 * Al volver, el rol activo es el superusuario.
 */
export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();

  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid primary key, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);

  await db.exec(readSql("schema.sql"));

  // Estado de producción anterior a las migraciones: tokens en tablas públicas.
  await db.exec(readSql("add_mp_oauth_fields.sql"));
  await db.exec(`
    ALTER TABLE raffles
      ADD COLUMN mercadopago_access_token TEXT,
      ADD COLUMN mercadopago_enabled BOOLEAN DEFAULT false;
  `);

  await db.exec(`
    INSERT INTO auth.users VALUES
      ('${OWNER_ID}', '{"full_name":"Owner","phone":"+5491100000000"}'),
      ('${OTHER_USER_ID}', '{"full_name":"Other"}');
    UPDATE profiles
      SET mp_access_token = 'SECRET', mp_refresh_token = 'REFRESH', mp_user_id = '999'
      WHERE id = '${OWNER_ID}';
    INSERT INTO raffles (user_id, title, description, price_per_number, whatsapp_number, total_numbers)
      VALUES ('${OWNER_ID}', 'Rifa', 'd', ${PRICE}, '+5491100000000', ${TOTAL_NUMBERS});
  `);

  await applyMigrations(db);

  const q: TestDb["q"] = async (sql, params) => (await db.query(sql, params)).rows;

  // Rol activo, para poder restaurarlo después de una consulta como superusuario.
  let current: { role: Role; userId?: string } | null = null;

  const enter = async (role: Role, userId?: string) => {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${userId ?? ""}', false);
      SET ROLE ${role};
    `);
  };

  const as: TestDb["as"] = async (role, userId) => {
    await enter(role, userId);
    current = { role, userId };
  };

  const admin: TestDb["admin"] = async (sql, params) => {
    await db.exec(`RESET ROLE`);
    try {
      return await q(sql, params);
    } finally {
      if (current) await enter(current.role, current.userId);
    }
  };

  const [{ id: raffleId }] = await q(`SELECT id FROM raffles`);
  const ids: string[] = (await q(`SELECT id FROM raffle_numbers ORDER BY number`)).map((row: Row) => row.id);

  return {
    db,
    raffleId,
    ids,
    as,
    q,
    admin,
    numberRow: async (id) => (await admin(`SELECT * FROM raffle_numbers WHERE id = $1`, [id]))[0],
    setRequestHeaders: async (headers) => {
      await db.query(`SELECT set_config('request.headers', $1, false)`, [headers ? JSON.stringify(headers) : ""]);
    },
    reserve: (numberIds, buyerName, email = null, phone = null) =>
      q(`SELECT reserve_numbers($1, $2::uuid[], $3, $4, $5) AS reserved_until`, [
        raffleId,
        numberIds,
        buyerName,
        email,
        phone,
      ]),
    createOrder: async (numberIds, buyerName, options = {}) => {
      if (options.reserve !== false) {
        await admin(`SELECT reserve_numbers_internal($1, $2::uuid[], $3, $4, $5, $6)`, [
          raffleId,
          numberIds,
          buyerName,
          "buyer@example.com",
          "+5491155555555",
          null,
        ]);
      }
      const [{ id }] = await admin(
        `INSERT INTO payment_orders (raffle_id, number_ids, amount, buyer_name, buyer_email, buyer_phone)
         VALUES ($1, $2::uuid[], $3, $4, $5, $6) RETURNING id`,
        [raffleId, numberIds, PRICE * numberIds.length, buyerName, "buyer@example.com", "+5491155555555"],
      );
      if (options.reserve !== false) {
        await admin(`UPDATE raffle_numbers SET order_id = $1 WHERE id = ANY($2::uuid[]) AND status = 'reserved'`, [
          id,
          numberIds,
        ]);
      }
      return id;
    },
    applyPayment: async (orderId, mpPaymentId, status, detail = null) => {
      const previous = current;
      await enter("service_role");
      try {
        const rows = await q(`SELECT apply_order_payment($1, $2, $3, $4) AS status`, [
          orderId,
          mpPaymentId,
          status,
          detail,
        ]);
        return rows[0].status;
      } finally {
        if (previous) await enter(previous.role, previous.userId);
        else await db.exec(`RESET ROLE`);
      }
    },
    close: () => db.close(),
  };
}

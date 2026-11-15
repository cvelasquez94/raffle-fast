import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createTestDb, migrationFiles, OTHER_USER_ID, OWNER_ID, TestDb, TOTAL_NUMBERS } from "../helpers/db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(() => t?.close());

describe("schema.sql", () => {
  it("creates one number per total_numbers when a raffle is inserted", () => {
    expect(t.ids).toHaveLength(TOTAL_NUMBERS);
  });

  it("creates a profile for each auth user", async () => {
    const rows = await t.admin(`SELECT id, full_name FROM profiles ORDER BY id`);
    expect(rows).toEqual([
      { id: OWNER_ID, full_name: "Owner" },
      { id: OTHER_USER_ID, full_name: "Other" },
    ]);
  });
});

describe("migrations", () => {
  it("are applied in filename order, enum migration first", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files).toEqual([...files].sort());
    expect(files[0]).toBe("20261115000001_paid_status.sql");
    expect(files[1]).toBe("20261115000002_security_payments.sql");
  });

  it("add the 'paid' value to number_status", async () => {
    const rows = await t.admin(`SELECT unnest(enum_range(NULL::number_status))::text AS value`);
    expect(rows.map((r) => r.value)).toEqual(["available", "reserved", "sold", "paid"]);
  });

  it("move the Mercado Pago tokens from profiles to mp_credentials", async () => {
    const creds = await t.admin(`SELECT * FROM mp_credentials`);
    expect(creds).toHaveLength(1);
    expect(creds[0]).toMatchObject({
      user_id: OWNER_ID,
      access_token: "SECRET",
      refresh_token: "REFRESH",
      mp_user_id: "999",
    });
  });

  it("sync profiles.mp_connected with the migrated credentials", async () => {
    const rows = await t.admin(`SELECT id, mp_connected FROM profiles ORDER BY id`);
    expect(rows).toEqual([
      { id: OWNER_ID, mp_connected: true },
      { id: OTHER_USER_ID, mp_connected: false },
    ]);
  });

  it("drop every token column from the public tables", async () => {
    const rows = await t.admin(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('profiles', 'raffles')
        AND (column_name LIKE '%token%' OR column_name LIKE 'mp_public_key' OR column_name LIKE 'mercadopago%')
    `);
    expect(rows).toEqual([]);
  });

  it("drop the public UPDATE policy on raffle_numbers", async () => {
    const rows = await t.admin(`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'raffle_numbers' AND policyname = 'Anyone can reserve available numbers'
    `);
    expect(rows).toEqual([]);
  });

  it("can be re-run without errors or data loss", async () => {
    await t.admin(`UPDATE raffle_numbers SET status = 'reserved', buyer_name = 'Juan Perez',
      reserved_at = now(), reserved_until = now() + interval '1 hour' WHERE id = $1`, [t.ids[0]]);

    await t.db.exec(`RESET ROLE`);
    await expect(applyMigrations(t.db)).resolves.toBeUndefined();

    expect(await t.admin(`SELECT access_token FROM mp_credentials`)).toEqual([{ access_token: "SECRET" }]);
    expect(await t.admin(`SELECT count(*)::int AS c FROM raffle_numbers`)).toEqual([{ c: TOTAL_NUMBERS }]);
    expect(await t.numberRow(t.ids[0])).toMatchObject({ status: "reserved", buyer_name: "Juan Perez" });
    expect((await t.admin(`SELECT mp_connected FROM profiles WHERE id = $1`, [OWNER_ID]))[0].mp_connected).toBe(true);
  });
});

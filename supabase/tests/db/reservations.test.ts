// reserve_numbers: la única forma en que el público puede reservar.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, OTHER_USER_ID, OWNER_ID, TestDb } from "../helpers/db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(() => t?.close());

beforeEach(async () => {
  // Cada test arranca con todos los números libres y sin historial de reservas.
  await t.admin(`
    UPDATE raffle_numbers SET status = 'available', buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL,
      reserved_at = NULL, reserved_until = NULL, sold_at = NULL, order_id = NULL
  `);
  await t.admin(`DELETE FROM reservation_log`);
  await t.admin(`UPDATE raffles SET status = 'active'`);
  await t.setRequestHeaders(null);
  await t.as("anon");
});

const statusOf = async (id: string) => (await t.numberRow(id)).status;

describe("reserve_numbers", () => {
  it("lets an anonymous visitor reserve numbers for 24 hours", async () => {
    const [{ reserved_until }] = await t.reserve([t.ids[0], t.ids[1]], "Juan Perez", "j@x.com", "+54 11 5555");

    const hours = (new Date(reserved_until).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);

    for (const id of [t.ids[0], t.ids[1]]) {
      const row = await t.numberRow(id);
      expect(row).toMatchObject({
        status: "reserved",
        buyer_name: "Juan Perez",
        buyer_email: "j@x.com",
        buyer_phone: "+54 11 5555",
        order_id: null,
      });
      expect(row.reserved_at).not.toBeNull();
      expect(row.reserved_until).not.toBeNull();
    }
    expect(await t.admin(`SELECT count(*)::int AS c FROM raffle_numbers WHERE status = 'reserved'`)).toEqual([{ c: 2 }]);
  });

  it("lets a logged-in user reserve too", async () => {
    await t.as("authenticated", OTHER_USER_ID);
    await t.reserve([t.ids[0]], "Usuario Logueado");
    expect(await statusOf(t.ids[0])).toBe("reserved");
  });

  it("trims the buyer data and stores blank email/phone as NULL", async () => {
    await t.reserve([t.ids[0]], "  Ana Lopez  ", "   ", "");
    expect(await t.numberRow(t.ids[0])).toMatchObject({ buyer_name: "Ana Lopez", buyer_email: null, buyer_phone: null });
  });

  it("rejects a request that overlaps an existing reservation", async () => {
    await t.reserve([t.ids[0], t.ids[1]], "Juan Perez");
    await expect(t.reserve([t.ids[1], t.ids[2]], "Otro Comprador")).rejects.toThrow(/ya no está disponible/);
  });

  it("is all-or-nothing: a rejected request reserves none of its numbers", async () => {
    await t.reserve([t.ids[1]], "Juan Perez");
    await expect(t.reserve([t.ids[1], t.ids[2], t.ids[3]], "Otro Comprador")).rejects.toThrow();

    expect(await statusOf(t.ids[2])).toBe("available");
    expect(await statusOf(t.ids[3])).toBe("available");
    expect(await t.numberRow(t.ids[1])).toMatchObject({ status: "reserved", buyer_name: "Juan Perez" });
  });

  it("does not let anyone take a number that is already sold or paid", async () => {
    await t.admin(`UPDATE raffle_numbers SET status = 'sold', buyer_name = 'X Y', sold_at = now() WHERE id = $1`, [t.ids[0]]);
    await t.admin(`UPDATE raffle_numbers SET status = 'paid', buyer_name = 'X Y' WHERE id = $1`, [t.ids[1]]);

    await expect(t.reserve([t.ids[0]], "Otro Comprador")).rejects.toThrow(/ya no está disponible/);
    await expect(t.reserve([t.ids[1]], "Otro Comprador")).rejects.toThrow(/ya no está disponible/);
    expect(await statusOf(t.ids[0])).toBe("sold");
    expect(await statusOf(t.ids[1])).toBe("paid");
  });

  it("rejects more than 20 numbers per request", async () => {
    await expect(t.reserve(t.ids.slice(0, 21), "Muchos Numeros")).rejects.toThrow(/hasta 20 números/);
    expect(await t.admin(`SELECT count(*)::int AS c FROM raffle_numbers WHERE status = 'reserved'`)).toEqual([{ c: 0 }]);
  });

  it("accepts exactly 20 numbers", async () => {
    await t.reserve(t.ids.slice(0, 20), "Veinte Numeros");
    expect(await t.admin(`SELECT count(*)::int AS c FROM raffle_numbers WHERE status = 'reserved'`)).toEqual([{ c: 20 }]);
  });

  it("rejects an empty selection", async () => {
    await expect(t.reserve([], "Juan Perez")).rejects.toThrow(/al menos un número/);
  });

  it("counts duplicated ids once", async () => {
    await t.reserve([t.ids[0], t.ids[0], t.ids[1]], "Juan Perez");
    expect(await t.admin(`SELECT quantity FROM reservation_log`)).toEqual([{ quantity: 2 }]);
  });

  it("rejects a name shorter than 2 characters", async () => {
    await expect(t.reserve([t.ids[0]], "J")).rejects.toThrow(/nombre/);
    await expect(t.reserve([t.ids[0]], "   ")).rejects.toThrow(/nombre/);
    expect(await statusOf(t.ids[0])).toBe("available");
  });

  it("rejects oversized buyer fields", async () => {
    await expect(t.reserve([t.ids[0]], "x".repeat(101))).rejects.toThrow(/nombre/);
    await expect(t.reserve([t.ids[0]], "Juan Perez", `${"a".repeat(250)}@x.com`)).rejects.toThrow(/inválido/);
    await expect(t.reserve([t.ids[0]], "Juan Perez", null, "1".repeat(31))).rejects.toThrow(/inválido/);
  });

  it("rejects a raffle that does not exist", async () => {
    await expect(
      t.q(`SELECT reserve_numbers(gen_random_uuid(), $1::uuid[], 'Juan Perez')`, [[t.ids[0]]]),
    ).rejects.toThrow(/no existe/);
  });

  it("rejects numbers that belong to another raffle", async () => {
    const [{ id: otherRaffle }] = await t.admin(
      `INSERT INTO raffles (user_id, title, description, price_per_number, whatsapp_number, total_numbers)
       VALUES ($1, 'Otra', 'd', 50, '+5491100000000', 3) RETURNING id`,
      [OWNER_ID],
    );
    try {
      await expect(
        t.q(`SELECT reserve_numbers($1, $2::uuid[], 'Juan Perez')`, [otherRaffle, [t.ids[0]]]),
      ).rejects.toThrow(/ya no está disponible/);
      expect(await statusOf(t.ids[0])).toBe("available");
    } finally {
      await t.admin(`DELETE FROM raffles WHERE id = $1`, [otherRaffle]);
    }
  });

  it.each(["completed", "cancelled"])("rejects reservations on a %s raffle", async (status) => {
    await t.admin(`UPDATE raffles SET status = '${status}'`);
    await expect(t.reserve([t.ids[0]], "Juan Perez")).rejects.toThrow(/ya no acepta reservas/);
    expect(await statusOf(t.ids[0])).toBe("available");
  });

  it("frees expired reservations of the raffle so someone else can take them", async () => {
    await t.reserve([t.ids[0], t.ids[1]], "Juan Perez");
    await t.admin(`UPDATE raffle_numbers SET reserved_until = now() - interval '1 minute' WHERE status = 'reserved'`);

    await t.reserve([t.ids[0]], "Nueva Persona");

    expect(await t.numberRow(t.ids[0])).toMatchObject({ status: "reserved", buyer_name: "Nueva Persona" });
    expect(await t.numberRow(t.ids[1])).toMatchObject({ status: "available", buyer_name: null });
  });
});

describe("rate limit per IP", () => {
  const fromIp = (ip: string) => t.setRequestHeaders({ "x-forwarded-for": `${ip}, 10.0.0.1` });

  it("allows up to 40 numbers per hour and rejects the next one", async () => {
    await fromIp("9.9.9.9");
    await t.reserve(t.ids.slice(0, 20), "Ana Lopez");
    await t.reserve(t.ids.slice(20, 40), "Ana Lopez");

    await expect(t.reserve([t.ids[40]], "Ana Lopez")).rejects.toThrow(/demasiadas reservas/);
    expect(await statusOf(t.ids[40])).toBe("available");
  });

  it("is tracked per client IP (first address of x-forwarded-for)", async () => {
    await fromIp("9.9.9.9");
    await t.reserve(t.ids.slice(0, 20), "Ana Lopez");
    await t.reserve(t.ids.slice(20, 40), "Ana Lopez");

    await fromIp("8.8.8.8");
    await t.reserve([t.ids[40]], "Otra Persona");
    expect(await statusOf(t.ids[40])).toBe("reserved");
    expect(await t.admin(`SELECT DISTINCT ip FROM reservation_log ORDER BY ip`)).toEqual([{ ip: "8.8.8.8" }, { ip: "9.9.9.9" }]);
  });

  it("does not count rejected requests", async () => {
    await fromIp("9.9.9.9");
    await t.reserve(t.ids.slice(0, 20), "Ana Lopez");
    await expect(t.reserve(t.ids.slice(0, 20), "Ana Lopez")).rejects.toThrow(/ya no está disponible/);
    await t.reserve(t.ids.slice(20, 40), "Ana Lopez");
    expect(await statusOf(t.ids[39])).toBe("reserved");
  });

  it("forgets reservations older than an hour", async () => {
    await fromIp("9.9.9.9");
    await t.reserve(t.ids.slice(0, 20), "Ana Lopez");
    await t.reserve(t.ids.slice(20, 40), "Ana Lopez");
    await t.admin(`UPDATE reservation_log SET created_at = now() - interval '61 minutes'`);

    await t.reserve([t.ids[40]], "Ana Lopez");
    expect(await statusOf(t.ids[40])).toBe("reserved");
  });
});

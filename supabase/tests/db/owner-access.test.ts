// Qué puede ver y hacer el dueño del talonario (rol `authenticated`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, OTHER_USER_ID, OWNER_ID, TestDb, TOTAL_NUMBERS } from "../helpers/db";

let t: TestDb;
let orderId: string;

beforeAll(async () => {
  t = await createTestDb();
  await t.as("anon");
  await t.reserve([t.ids[0], t.ids[1]], "Juan Perez", "j@x.com");
  orderId = await t.createOrder([t.ids[10]], "Pagador Uno");
  await t.as("authenticated", OWNER_ID);
});

afterAll(() => t?.close());

describe("raffle owner", () => {
  it("reads buyer data through get_raffle_numbers_for_owner", async () => {
    const rows = await t.q(`SELECT * FROM get_raffle_numbers_for_owner($1)`, [t.raffleId]);
    expect(rows).toHaveLength(TOTAL_NUMBERS);
    expect(rows.map((r) => r.number)).toEqual(Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1));
    expect(rows[0]).toMatchObject({ status: "reserved", buyer_name: "Juan Perez", buyer_email: "j@x.com" });
  });

  it("cannot read buyer columns with a direct SELECT (must use the function)", async () => {
    await expect(t.q(`SELECT buyer_phone FROM raffle_numbers`)).rejects.toThrow(/permission denied/);
  });

  it("can confirm a sale on its own raffle", async () => {
    await t.q(`UPDATE raffle_numbers SET status = 'sold', sold_at = now() WHERE id = $1`, [t.ids[0]]);
    expect((await t.numberRow(t.ids[0])).status).toBe("sold");
  });

  it("can release a reserved number", async () => {
    await t.q(
      `UPDATE raffle_numbers SET status = 'available', buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL,
         reserved_at = NULL, reserved_until = NULL WHERE id = $1`,
      [t.ids[1]],
    );
    expect(await t.numberRow(t.ids[1])).toMatchObject({ status: "available", buyer_name: null });
  });

  it("can count its numbers (dashboard query)", async () => {
    const rows = await t.q(
      `SELECT r.id, (SELECT count(*) FROM raffle_numbers n WHERE n.raffle_id = r.id)::int AS c FROM raffles r`,
    );
    expect(rows).toEqual([{ id: t.raffleId, c: TOTAL_NUMBERS }]);
  });

  it("reads the payment orders of its raffles, but cannot modify them", async () => {
    const rows = await t.q(`SELECT id, status, buyer_name FROM payment_orders`);
    expect(rows).toEqual([{ id: orderId, status: "pending", buyer_name: "Pagador Uno" }]);

    await expect(
      t.q(`UPDATE payment_orders SET status = 'approved' WHERE id = $1`, [orderId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot mark its own order as paid through apply_order_payment", async () => {
    await expect(t.q(`SELECT apply_order_payment($1, '1', 'approved')`, [orderId])).rejects.toThrow(/permission denied/);
  });

  it("sees its own Mercado Pago connection, without tokens", async () => {
    const rows = await t.q(`SELECT * FROM get_my_mp_connection()`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ connected: true, mp_user_id: "999" });
    expect(Object.keys(rows[0]).sort()).toEqual(["connected", "connected_at", "mp_user_id"]);
  });

  it("cannot read its own tokens", async () => {
    await expect(t.q(`SELECT access_token FROM mp_credentials`)).rejects.toThrow(/permission denied/);
  });

  it("cannot flip profiles.mp_connected by hand", async () => {
    await expect(
      t.q(`UPDATE profiles SET mp_connected = true WHERE id = $1`, [OWNER_ID]),
    ).rejects.toThrow(/permission denied/);
  });

  it("can update its own name and phone", async () => {
    await t.q(`UPDATE profiles SET full_name = 'Nuevo Nombre', phone = '+5491122223333' WHERE id = $1`, [OWNER_ID]);
    expect((await t.admin(`SELECT full_name, phone FROM profiles WHERE id = $1`, [OWNER_ID]))[0]).toEqual({
      full_name: "Nuevo Nombre",
      phone: "+5491122223333",
    });
  });

  it("disconnects Mercado Pago: credentials are deleted and mp_connected goes false", async () => {
    await t.q(`SELECT disconnect_mercadopago()`);

    expect(await t.admin(`SELECT count(*)::int AS c FROM mp_credentials`)).toEqual([{ c: 0 }]);
    expect((await t.admin(`SELECT mp_connected FROM profiles WHERE id = $1`, [OWNER_ID]))[0].mp_connected).toBe(false);
    expect(await t.q(`SELECT * FROM get_my_mp_connection()`)).toEqual([]);
  });

  it("gets mp_connected back when credentials are stored again (OAuth callback)", async () => {
    await t.admin(`INSERT INTO mp_credentials (user_id, access_token) VALUES ($1, 'NEW')`, [OWNER_ID]);
    expect((await t.admin(`SELECT mp_connected FROM profiles WHERE id = $1`, [OWNER_ID]))[0].mp_connected).toBe(true);
    expect((await t.admin(`SELECT mp_connected FROM profiles WHERE id = $1`, [OTHER_USER_ID]))[0].mp_connected).toBe(false);
  });
});

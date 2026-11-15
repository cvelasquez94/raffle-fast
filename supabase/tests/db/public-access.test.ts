// Qué puede ver y hacer un visitante sin sesión (rol `anon`) y un usuario
// logueado que no es dueño del talonario.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, OTHER_USER_ID, TestDb, TOTAL_NUMBERS } from "../helpers/db";

let t: TestDb;
let orderId: string;

const DENIED = /permission denied/;

beforeAll(async () => {
  t = await createTestDb();
  // Un número reservado con datos del comprador y una orden, para que haya algo que filtrar.
  orderId = await t.createOrder([t.ids[0]], "Juan Perez");
});

afterAll(() => t?.close());

describe("anon", () => {
  beforeAll(() => t.as("anon"));

  it("cannot read Mercado Pago credentials", async () => {
    await expect(t.q(`SELECT * FROM mp_credentials`)).rejects.toThrow(DENIED);
  });

  it("cannot read OAuth states", async () => {
    await expect(t.q(`SELECT * FROM mp_oauth_states`)).rejects.toThrow(DENIED);
  });

  it("cannot read the organizer's phone", async () => {
    await expect(t.q(`SELECT phone FROM profiles`)).rejects.toThrow(DENIED);
  });

  it.each(["buyer_name", "buyer_email", "buyer_phone", "payment_id", "payment_link", "order_id"])(
    "cannot read raffle_numbers.%s",
    async (column) => {
      await expect(t.q(`SELECT ${column} FROM raffle_numbers`)).rejects.toThrow(DENIED);
    },
  );

  it("cannot SELECT * from raffle_numbers", async () => {
    await expect(t.q(`SELECT * FROM raffle_numbers`)).rejects.toThrow(DENIED);
  });

  it("cannot update raffle_numbers directly", async () => {
    await expect(t.q(`UPDATE raffle_numbers SET status = 'sold' WHERE id = $1`, [t.ids[1]])).rejects.toThrow(DENIED);
  });

  it("cannot insert or delete raffle_numbers", async () => {
    await expect(
      t.q(`INSERT INTO raffle_numbers (raffle_id, number) VALUES ($1, 999)`, [t.raffleId]),
    ).rejects.toThrow(/row-level security|permission denied/);

    await t.q(`DELETE FROM raffle_numbers WHERE id = $1`, [t.ids[1]]).catch(() => undefined);
    expect(await t.admin(`SELECT count(*)::int AS c FROM raffle_numbers`)).toEqual([{ c: TOTAL_NUMBERS }]);
  });

  it("cannot read or write payment_orders", async () => {
    await expect(t.q(`SELECT * FROM payment_orders`)).rejects.toThrow(DENIED);
    await expect(
      t.q(`UPDATE payment_orders SET status = 'approved' WHERE id = $1`, [orderId]),
    ).rejects.toThrow(DENIED);
    await expect(
      t.q(`INSERT INTO payment_orders (raffle_id, number_ids, amount, buyer_name) VALUES ($1, $2::uuid[], 1, 'x')`, [
        t.raffleId,
        [t.ids[1]],
      ]),
    ).rejects.toThrow(DENIED);
  });

  it("cannot read the reservation log", async () => {
    await expect(t.q(`SELECT * FROM reservation_log`)).rejects.toThrow(DENIED);
  });

  it("cannot call reserve_numbers_internal (bypasses the IP from headers)", async () => {
    await expect(
      t.q(`SELECT reserve_numbers_internal($1, $2::uuid[], 'x y', null, null, null)`, [t.raffleId, [t.ids[1]]]),
    ).rejects.toThrow(DENIED);
  });

  it("cannot call apply_order_payment", async () => {
    await expect(t.q(`SELECT apply_order_payment($1, '1', 'approved')`, [orderId])).rejects.toThrow(DENIED);
  });

  it("cannot call get_raffle_numbers_for_owner", async () => {
    await expect(t.q(`SELECT * FROM get_raffle_numbers_for_owner($1)`, [t.raffleId])).rejects.toThrow(DENIED);
  });

  it("cannot call clean_expired_reservations", async () => {
    await expect(t.q(`SELECT clean_expired_reservations()`)).rejects.toThrow(DENIED);
  });

  it("cannot call the Mercado Pago connection functions", async () => {
    await expect(t.q(`SELECT * FROM get_my_mp_connection()`)).rejects.toThrow(DENIED);
    await expect(t.q(`SELECT disconnect_mercadopago()`)).rejects.toThrow(DENIED);
  });

  it("cannot update profiles", async () => {
    await expect(t.q(`UPDATE profiles SET full_name = 'hack'`)).rejects.toThrow(DENIED);
  });

  it("reads the public columns of every number", async () => {
    const rows = await t.q(
      `SELECT id, raffle_id, number, status, reserved_at, reserved_until, sold_at, created_at
       FROM raffle_numbers WHERE raffle_id = $1 ORDER BY number`,
      [t.raffleId],
    );
    expect(rows).toHaveLength(TOTAL_NUMBERS);
    expect(rows[0].status).toBe("reserved");
    expect(rows[1].status).toBe("available");
  });

  it("reads the raffle with its organizer's public profile", async () => {
    const rows = await t.q(
      `SELECT r.title, r.price_per_number, p.full_name, p.mp_connected
       FROM raffles r JOIN profiles p ON p.id = r.user_id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Rifa", full_name: "Owner", mp_connected: true });
  });
});

describe("authenticated user who does not own the raffle", () => {
  beforeAll(() => t.as("authenticated", OTHER_USER_ID));

  it("cannot read buyer data directly", async () => {
    await expect(t.q(`SELECT buyer_name, buyer_email, buyer_phone FROM raffle_numbers`)).rejects.toThrow(DENIED);
  });

  it("gets no rows from get_raffle_numbers_for_owner", async () => {
    expect(await t.q(`SELECT * FROM get_raffle_numbers_for_owner($1)`, [t.raffleId])).toEqual([]);
  });

  it("cannot update numbers of someone else's raffle", async () => {
    await t.q(`UPDATE raffle_numbers SET status = 'sold', sold_at = now(), buyer_name = 'hack' WHERE id = $1`, [
      t.ids[2],
    ]);
    expect(await t.numberRow(t.ids[2])).toMatchObject({ status: "available", buyer_name: null });
  });

  it("cannot read Mercado Pago credentials or OAuth states", async () => {
    await expect(t.q(`SELECT * FROM mp_credentials`)).rejects.toThrow(DENIED);
    await expect(t.q(`SELECT * FROM mp_oauth_states`)).rejects.toThrow(DENIED);
  });

  it("sees no payment orders of someone else's raffle", async () => {
    expect(await t.q(`SELECT * FROM payment_orders`)).toEqual([]);
  });

  it("cannot write payment_orders", async () => {
    await expect(
      t.q(`UPDATE payment_orders SET status = 'approved' WHERE id = $1`, [orderId]),
    ).rejects.toThrow(DENIED);
  });

  it("cannot call the service-role functions", async () => {
    await expect(
      t.q(`SELECT reserve_numbers_internal($1, $2::uuid[], 'x y', null, null, null)`, [t.raffleId, [t.ids[1]]]),
    ).rejects.toThrow(DENIED);
    await expect(t.q(`SELECT apply_order_payment($1, '1', 'approved')`, [orderId])).rejects.toThrow(DENIED);
    await expect(t.q(`SELECT clean_expired_reservations()`)).rejects.toThrow(DENIED);
  });

  it("has no Mercado Pago connection of its own", async () => {
    expect(await t.q(`SELECT * FROM get_my_mp_connection()`)).toEqual([]);
  });

  it("cannot disconnect someone else's Mercado Pago account", async () => {
    await t.q(`SELECT disconnect_mercadopago()`);
    expect(await t.admin(`SELECT count(*)::int AS c FROM mp_credentials WHERE disconnected_at IS NULL`)).toEqual([{ c: 1 }]);
  });

  it("cannot update someone else's profile", async () => {
    await t.q(`UPDATE profiles SET full_name = 'hack' WHERE id <> $1`, [OTHER_USER_ID]);
    expect(await t.admin(`SELECT count(*)::int AS c FROM profiles WHERE full_name = 'hack'`)).toEqual([{ c: 0 }]);
  });
});

// Comisión visible, desconexión de Mercado Pago y devoluciones / contracargos / montos distintos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, OWNER_ID, TestDb } from "../helpers/db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(() => t?.close());

const orderRow = async (id: string) => (await t.admin(`SELECT * FROM payment_orders WHERE id = $1`, [id]))[0];

/** Orden aprobada: sus números quedan en "paid". */
const paidOrder = async (numbers: string[], buyer: string, paymentId: string) => {
  const order = await t.createOrder(numbers, buyer);
  expect(await t.applyPayment(order, paymentId, "approved", "accredited")).toBe("approved");
  return order;
};

describe("platform_settings", () => {
  it("lets anyone read the commission", async () => {
    await t.as("anon");
    expect(await t.q(`SELECT marketplace_fee_percent::float AS fee FROM platform_settings`)).toEqual([{ fee: 5 }]);
  });

  it("cannot be changed by visitors or organizers", async () => {
    await t.as("anon");
    await expect(t.q(`UPDATE platform_settings SET marketplace_fee_percent = 0`)).rejects.toThrow(/permission denied/);
    await t.as("authenticated", OWNER_ID);
    await expect(t.q(`UPDATE platform_settings SET marketplace_fee_percent = 0`)).rejects.toThrow(/permission denied/);
    await expect(t.q(`INSERT INTO platform_settings (id) VALUES (true)`)).rejects.toThrow(/permission denied/);
  });

  it("holds a single row with a valid percentage", async () => {
    await expect(t.admin(`UPDATE platform_settings SET marketplace_fee_percent = 100`)).rejects.toThrow();
    await expect(t.admin(`UPDATE platform_settings SET marketplace_fee_percent = -1`)).rejects.toThrow();
    await expect(t.admin(`INSERT INTO platform_settings (id) VALUES (false)`)).rejects.toThrow();
  });
});

describe("refunds and chargebacks", () => {
  it("releases the numbers when an approved payment is refunded", async () => {
    const numbers = [t.ids[0], t.ids[1]];
    const order = await paidOrder(numbers, "Devuelto Uno", "700");

    expect(await t.applyPayment(order, "700", "refunded", "refunded")).toBe("refunded");

    expect(await orderRow(order)).toMatchObject({ status: "refunded", status_detail: "refunded" });
    for (const id of numbers) {
      expect(await t.numberRow(id)).toMatchObject({ status: "available", buyer_name: null, order_id: null, payment_id: null });
    }
  });

  it("releases the numbers on a chargeback too", async () => {
    const numbers = [t.ids[2]];
    const order = await paidOrder(numbers, "Contracargo Uno", "701");

    expect(await t.applyPayment(order, "701", "charged_back")).toBe("refunded");
    expect(await orderRow(order)).toMatchObject({ status: "refunded", status_detail: "charged_back" });
    expect((await t.numberRow(numbers[0])).status).toBe("available");
  });

  it("keeps a refunded order final", async () => {
    const numbers = [t.ids[3]];
    const order = await paidOrder(numbers, "Final", "702");
    await t.applyPayment(order, "702", "refunded");

    expect(await t.applyPayment(order, "702", "approved")).toBe("refunded");
    expect((await t.numberRow(numbers[0])).status).toBe("available");
  });

  it("asks the owner to review when the number was already confirmed as sold", async () => {
    const numbers = [t.ids[4]];
    const order = await paidOrder(numbers, "Ya Vendido", "703");
    await t.admin(`UPDATE raffle_numbers SET status = 'sold', sold_at = now() WHERE id = $1`, [numbers[0]]);

    expect(await t.applyPayment(order, "703", "refunded")).toBe("conflict");

    expect(await orderRow(order)).toMatchObject({ status: "conflict", status_detail: "refunded_needs_review", resolved_at: null });
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "sold", buyer_name: "Ya Vendido" });
  });

  it("does not release a number that now belongs to another order", async () => {
    const numbers = [t.ids[5]];
    const order = await paidOrder(numbers, "Primero", "704");
    await t.admin(`UPDATE raffle_numbers SET order_id = NULL, buyer_name = 'Otra Persona' WHERE id = $1`, [numbers[0]]);

    expect(await t.applyPayment(order, "704", "charged_back")).toBe("conflict");
    expect(await orderRow(order)).toMatchObject({ status_detail: "charged_back_needs_review" });
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "paid", buyer_name: "Otra Persona" });
  });

  it("closes a conflict by itself once the money is refunded", async () => {
    const numbers = [t.ids[6]];
    const order = await t.createOrder(numbers, "Conflicto", { reserve: false });
    await t.admin(`UPDATE raffle_numbers SET status = 'sold', sold_at = now(), buyer_name = 'Venta Manual' WHERE id = $1`, [numbers[0]]);
    expect(await t.applyPayment(order, "705", "approved")).toBe("conflict");

    expect(await t.applyPayment(order, "705", "refunded")).toBe("refunded");

    const row = await orderRow(order);
    expect(row.status).toBe("refunded");
    expect(row.resolved_at).not.toBeNull();
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "sold", buyer_name: "Venta Manual" });
  });

  it("flags a partial refund without touching the numbers", async () => {
    const numbers = [t.ids[7], t.ids[8]];
    const order = await paidOrder(numbers, "Parcial", "706");

    expect(await t.applyPayment(order, "706", "partially_refunded", "partially_refunded")).toBe("conflict");

    expect(await orderRow(order)).toMatchObject({ status: "conflict", status_detail: "partially_refunded" });
    for (const id of numbers) expect((await t.numberRow(id)).status).toBe("paid");
  });
});

describe("approved payment for a different amount", () => {
  it("records a conflict and assigns no numbers", async () => {
    const numbers = [t.ids[10]];
    const order = await t.createOrder(numbers, "Monto Distinto");

    expect(await t.applyPayment(order, "710", "amount_mismatch", "amount_mismatch")).toBe("conflict");

    expect(await orderRow(order)).toMatchObject({ status: "conflict", status_detail: "amount_mismatch", mp_payment_id: "710" });
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "reserved", order_id: order });
  });

  it("shows up for the owner and can be marked as resolved", async () => {
    await t.as("authenticated", OWNER_ID);
    const [pending] = await t.q(
      `SELECT id FROM payment_orders WHERE status = 'conflict' AND status_detail = 'amount_mismatch' AND resolved_at IS NULL`,
    );
    expect(pending).toBeDefined();

    await t.q(`SELECT resolve_payment_conflict($1)`, [pending.id]);
    expect((await orderRow(pending.id)).resolved_at).not.toBeNull();
  });
});

describe("disconnecting Mercado Pago", () => {
  it("stops new payments at once but keeps the credentials for payments in flight", async () => {
    await t.as("authenticated", OWNER_ID);
    await t.q(`SELECT disconnect_mercadopago()`);

    expect((await t.admin(`SELECT mp_connected FROM profiles WHERE id = $1`, [OWNER_ID]))[0].mp_connected).toBe(false);
    expect(await t.q(`SELECT * FROM get_my_mp_connection()`)).toEqual([]);
    expect(await t.admin(`SELECT count(*)::int AS c FROM mp_credentials WHERE user_id = $1`, [OWNER_ID])).toEqual([{ c: 1 }]);
  });

  it("deletes the credentials three days after the disconnection", async () => {
    await t.admin(`UPDATE mp_credentials SET disconnected_at = now() - interval '2 days' WHERE user_id = $1`, [OWNER_ID]);
    await t.admin(`SELECT clean_expired_reservations()`);
    expect(await t.admin(`SELECT count(*)::int AS c FROM mp_credentials`)).toEqual([{ c: 1 }]);

    await t.admin(`UPDATE mp_credentials SET disconnected_at = now() - interval '4 days' WHERE user_id = $1`, [OWNER_ID]);
    await t.admin(`SELECT clean_expired_reservations()`);
    expect(await t.admin(`SELECT count(*)::int AS c FROM mp_credentials`)).toEqual([{ c: 0 }]);
    expect((await t.admin(`SELECT mp_connected FROM profiles WHERE id = $1`, [OWNER_ID]))[0].mp_connected).toBe(false);
  });

  it("reconnecting clears the disconnection", async () => {
    await t.admin(`INSERT INTO mp_credentials (user_id, access_token, disconnected_at) VALUES ($1, 'OLD', now())`, [OWNER_ID]);
    expect((await t.admin(`SELECT mp_connected FROM profiles WHERE id = $1`, [OWNER_ID]))[0].mp_connected).toBe(false);

    // Lo que hace el callback de OAuth: upsert con disconnected_at en NULL.
    await t.admin(
      `INSERT INTO mp_credentials (user_id, access_token, disconnected_at) VALUES ($1, 'NEW', NULL)
       ON CONFLICT (user_id) DO UPDATE SET access_token = EXCLUDED.access_token, disconnected_at = NULL`,
      [OWNER_ID],
    );
    expect((await t.admin(`SELECT mp_connected FROM profiles WHERE id = $1`, [OWNER_ID]))[0].mp_connected).toBe(true);
  });
});

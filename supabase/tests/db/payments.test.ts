// apply_order_payment y clean_expired_reservations: lo que ejecutan las Edge
// Functions (service role) cuando Mercado Pago informa un pago.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TestDb } from "../helpers/db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(() => t?.close());

const orderRow = async (id: string) => (await t.admin(`SELECT * FROM payment_orders WHERE id = $1`, [id]))[0];

// Cada test usa su propio rango de números para no depender de los demás.
describe("apply_order_payment", () => {
  it("keeps the reservation while the payment is pending", async () => {
    const numbers = [t.ids[0], t.ids[1]];
    const order = await t.createOrder(numbers, "Pagador Uno");

    expect(await t.applyPayment(order, "555", "in_process", "pending_review")).toBe("pending");

    expect(await orderRow(order)).toMatchObject({ status: "pending", status_detail: "pending_review", mp_payment_id: "555" });
    for (const id of numbers) {
      expect(await t.numberRow(id)).toMatchObject({ status: "reserved", order_id: order });
    }
  });

  it("marks every number of the order as paid when the payment is approved", async () => {
    const numbers = [t.ids[2], t.ids[3]];
    const order = await t.createOrder(numbers, "Pagador Dos");

    expect(await t.applyPayment(order, "556", "approved", "accredited")).toBe("approved");

    expect(await orderRow(order)).toMatchObject({ status: "approved", status_detail: "accredited", mp_payment_id: "556" });
    for (const id of numbers) {
      expect(await t.numberRow(id)).toMatchObject({
        status: "paid",
        payment_id: "556",
        payment_status: "approved",
        reserved_until: null,
        buyer_name: "Pagador Dos",
        order_id: order,
      });
    }
  });

  it("is idempotent: a repeated or later notification does not change an approved order", async () => {
    const numbers = [t.ids[4]];
    const order = await t.createOrder(numbers, "Pagador Tres");
    await t.applyPayment(order, "557", "approved");

    expect(await t.applyPayment(order, "557", "approved")).toBe("approved");
    expect(await t.applyPayment(order, "999", "rejected")).toBe("approved");
    expect(await t.applyPayment(order, "999", "cancelled")).toBe("approved");

    expect(await orderRow(order)).toMatchObject({ status: "approved", mp_payment_id: "557" });
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "paid", payment_id: "557" });
  });

  it("records a rejected payment, keeps the reservation and still accepts a later approval", async () => {
    const numbers = [t.ids[5]];
    const order = await t.createOrder(numbers, "Pagador Cuatro");

    expect(await t.applyPayment(order, "558", "rejected", "cc_rejected_other_reason")).toBe("rejected");
    expect(await orderRow(order)).toMatchObject({ status: "rejected", status_detail: "cc_rejected_other_reason" });
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "reserved", order_id: order });

    expect(await t.applyPayment(order, "559", "approved")).toBe("approved");
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "paid", payment_id: "559" });
  });

  it("re-claims the numbers when the reservation expired before the payment arrived", async () => {
    const numbers = [t.ids[6]];
    const order = await t.createOrder(numbers, "Tarde Pago");
    await t.admin(`UPDATE raffle_numbers SET reserved_until = now() - interval '1 minute' WHERE id = ANY($1::uuid[])`, [numbers]);

    await t.admin(`SELECT clean_expired_reservations()`);
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "available", buyer_name: null, order_id: null });

    expect(await t.applyPayment(order, "777", "approved")).toBe("approved");
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "paid", buyer_name: "Tarde Pago", order_id: order });
  });

  it("reports a conflict when someone else took the number before the payment arrived", async () => {
    const numbers = [t.ids[7]];
    const order = await t.createOrder(numbers, "Conflicto", { reserve: false });
    await t.admin(`SELECT reserve_numbers_internal($1, $2::uuid[], 'Otra Persona', null, null, null)`, [t.raffleId, numbers]);

    expect(await t.applyPayment(order, "888", "approved")).toBe("conflict");

    expect(await orderRow(order)).toMatchObject({ status: "conflict", mp_payment_id: "888" });
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "reserved", buyer_name: "Otra Persona" });
  });

  it("on a partial conflict, pays the numbers still free and leaves the taken one alone", async () => {
    const numbers = [t.ids[8], t.ids[9]];
    const order = await t.createOrder(numbers, "Parcial", { reserve: false });
    await t.admin(`SELECT reserve_numbers_internal($1, $2::uuid[], 'Otra Persona', null, null, null)`, [t.raffleId, [numbers[1]]]);

    expect(await t.applyPayment(order, "889", "approved")).toBe("conflict");

    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "paid", buyer_name: "Parcial", order_id: order });
    expect(await t.numberRow(numbers[1])).toMatchObject({ status: "reserved", buyer_name: "Otra Persona" });
  });

  it("keeps a conflict final", async () => {
    const numbers = [t.ids[10]];
    const order = await t.createOrder(numbers, "Conflicto Dos", { reserve: false });
    await t.admin(`SELECT reserve_numbers_internal($1, $2::uuid[], 'Otra Persona', null, null, null)`, [t.raffleId, numbers]);
    await t.applyPayment(order, "890", "approved");

    expect(await t.applyPayment(order, "890", "approved")).toBe("conflict");
    expect(await t.numberRow(numbers[0])).toMatchObject({ buyer_name: "Otra Persona" });
  });

  it("does not pay numbers reserved by a different order", async () => {
    const numbers = [t.ids[11]];
    const first = await t.createOrder(numbers, "Primera Orden");
    // Segunda orden sobre el mismo número (p. ej. creada tras vencer y re-reservarse).
    const second = await t.createOrder(numbers, "Segunda Orden", { reserve: false });

    expect(await t.applyPayment(second, "891", "approved")).toBe("conflict");
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "reserved", buyer_name: "Primera Orden", order_id: first });
  });

  it("needs the numbers linked to the order: an unlinked reservation by the same buyer is a conflict", async () => {
    // Por esto mp-create-payment aborta si no puede guardar order_id en los números.
    const numbers = [t.ids[13]];
    await t.admin(`SELECT reserve_numbers_internal($1, $2::uuid[], 'Sin Vinculo', null, null, null)`, [t.raffleId, numbers]);
    const order = await t.createOrder(numbers, "Sin Vinculo", { reserve: false });

    expect(await t.applyPayment(order, "893", "approved")).toBe("conflict");
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "reserved", order_id: null });
  });

  it("does not overwrite a number the owner already marked as sold", async () => {
    const numbers = [t.ids[12]];
    const order = await t.createOrder(numbers, "Pagador Cinco");
    await t.admin(`UPDATE raffle_numbers SET status = 'sold', sold_at = now(), buyer_name = 'Venta Manual' WHERE id = $1`, [numbers[0]]);

    expect(await t.applyPayment(order, "892", "approved")).toBe("conflict");
    expect(await t.numberRow(numbers[0])).toMatchObject({ status: "sold", buyer_name: "Venta Manual" });
  });

  it("fails for an order that does not exist", async () => {
    await expect(
      t.applyPayment("00000000-0000-0000-0000-000000000000", "1", "approved"),
    ).rejects.toThrow(/Orden inexistente/);
  });
});

describe("clean_expired_reservations", () => {
  it("releases only reservations past their deadline", async () => {
    const [expired, current, paid] = [t.ids[20], t.ids[21], t.ids[22]];
    await t.admin(`SELECT reserve_numbers_internal($1, $2::uuid[], 'Reserva Vieja', null, null, null)`, [t.raffleId, [expired, current]]);
    await t.admin(`UPDATE raffle_numbers SET reserved_until = now() - interval '1 second' WHERE id = $1`, [expired]);
    const order = await t.createOrder([paid], "Ya Pago");
    await t.applyPayment(order, "900", "approved");

    await t.as("service_role");
    await t.q(`SELECT clean_expired_reservations()`);

    expect(await t.numberRow(expired)).toMatchObject({
      status: "available",
      buyer_name: null,
      reserved_at: null,
      reserved_until: null,
      order_id: null,
    });
    expect(await t.numberRow(current)).toMatchObject({ status: "reserved", buyer_name: "Reserva Vieja" });
    expect(await t.numberRow(paid)).toMatchObject({ status: "paid", buyer_name: "Ya Pago" });
  });

  it("purges old rate-limit entries and expired OAuth states", async () => {
    await t.admin(`INSERT INTO reservation_log (created_at, ip, raffle_id, quantity) VALUES
      (now() - interval '8 days', '1.1.1.1', $1, 1), (now(), '2.2.2.2', $1, 1)`, [t.raffleId]);
    await t.admin(`INSERT INTO mp_oauth_states (state, user_id, expires_at)
      SELECT 'old', id, now() - interval '1 minute' FROM profiles LIMIT 1`);
    await t.admin(`INSERT INTO mp_oauth_states (state, user_id) SELECT 'fresh', id FROM profiles LIMIT 1`);

    await t.admin(`SELECT clean_expired_reservations()`);

    expect(await t.admin(`SELECT ip FROM reservation_log WHERE ip IN ('1.1.1.1', '2.2.2.2')`)).toEqual([{ ip: "2.2.2.2" }]);
    expect(await t.admin(`SELECT state FROM mp_oauth_states`)).toEqual([{ state: "fresh" }]);
  });
});

describe("raffle_numbers status constraint", () => {
  it("requires a buyer on paid, sold and reserved numbers", async () => {
    const id = t.ids[30];
    await expect(t.admin(`UPDATE raffle_numbers SET status = 'paid', buyer_name = NULL WHERE id = $1`, [id])).rejects.toThrow(/check constraint/);
    await expect(t.admin(`UPDATE raffle_numbers SET status = 'sold', sold_at = now() WHERE id = $1`, [id])).rejects.toThrow(/check constraint/);
    await expect(t.admin(`UPDATE raffle_numbers SET status = 'reserved', buyer_name = 'X Y' WHERE id = $1`, [id])).rejects.toThrow(/check constraint/);
  });

  it("does not allow buyer data on an available number", async () => {
    await expect(
      t.admin(`UPDATE raffle_numbers SET buyer_name = 'X Y' WHERE id = $1`, [t.ids[30]]),
    ).rejects.toThrow(/check constraint/);
  });
});

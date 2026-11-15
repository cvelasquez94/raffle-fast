// draw_raffle_winner y lo que pasa con los pagos que llegan después del cierre.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, OTHER_USER_ID, OWNER_ID, TestDb } from "../helpers/db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(() => t?.close());

const raffleRow = async () => (await t.admin(`SELECT * FROM raffles WHERE id = $1`, [t.raffleId]))[0];
const draw = () => t.q(`SELECT draw_raffle_winner($1)`, [t.raffleId]);

// Los tests de este archivo dependen del orden: el sorteo cierra el talonario.
describe("draw_raffle_winner", () => {
  it("cannot be called by anonymous visitors", async () => {
    await t.as("anon");
    await expect(draw()).rejects.toThrow(/permission denied/);
  });

  it("cannot be called by someone who does not own the raffle", async () => {
    await t.as("authenticated", OTHER_USER_ID);
    await expect(draw()).rejects.toThrow();
    expect((await raffleRow()).winning_number).toBeNull();
  });

  it("refuses to draw when no number is sold or paid", async () => {
    await t.createOrder([t.ids[0]], "Solo Reservado");
    await t.as("authenticated", OWNER_ID);
    await expect(draw()).rejects.toThrow();
    expect((await raffleRow()).status).toBe("active");
  });

  it("picks a sold or paid number, publishes a short name and closes the raffle", async () => {
    await t.admin(
      `UPDATE raffle_numbers SET status = 'sold', sold_at = now(), buyer_name = 'Juan Perez', buyer_email = 'juan@example.com'
       WHERE id = ANY($1::uuid[])`,
      [[t.ids[10], t.ids[11]]],
    );

    await t.as("authenticated", OWNER_ID);
    await draw();

    const raffle = await raffleRow();
    expect(raffle.status).toBe("completed");
    expect([11, 12]).toContain(raffle.winning_number);
    expect(raffle.winner_display_name).toBe("Juan P.");
    expect(raffle.drawn_at).not.toBeNull();
  });

  it("cannot be drawn twice", async () => {
    const before = await raffleRow();
    await t.as("authenticated", OWNER_ID);
    await expect(draw()).rejects.toThrow();
    expect((await raffleRow()).winning_number).toBe(before.winning_number);
  });
});

describe("apply_order_payment on a closed raffle", () => {
  it("records a conflict instead of marking numbers paid after the draw", async () => {
    // La orden de t.ids[0] se creó antes del sorteo y sigue reservada.
    const [order] = await t.admin(`SELECT id FROM payment_orders WHERE buyer_name = 'Solo Reservado'`);

    expect(await t.applyPayment(order.id, "990", "approved", "accredited")).toBe("conflict");

    const [row] = await t.admin(`SELECT status, status_detail, mp_payment_id FROM payment_orders WHERE id = $1`, [order.id]);
    expect(row).toMatchObject({ status: "conflict", status_detail: "raffle_closed", mp_payment_id: "990" });
    expect((await t.numberRow(t.ids[0])).status).toBe("reserved");
  });
});

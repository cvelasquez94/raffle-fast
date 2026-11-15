import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke } },
}));

import {
  clearPendingOrder,
  getMercadoPagoConnectUrl,
  getPendingOrder,
  reserveNumbers,
  startMercadoPagoPayment,
  verifyOrderPayment,
} from "./payments";

const PENDING_KEY = "pending_payment";
const GENERIC_ERROR = "No se pudo completar la operación. Por favor intentá nuevamente.";
const NOW = new Date("2026-11-15T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/** localStorage en memoria: los tests corren en Node, sin navegador. */
function createLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

/** Error como el que devuelve supabase.functions.invoke ante un status no 2xx. */
function functionsHttpError(context: unknown) {
  return Object.assign(new Error("Edge Function returned a non-2xx status code"), { context });
}

const buyer = { name: "  Juan Perez ", email: " juan@example.com ", phone: " +54 11 5555-5555 " };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("localStorage", createLocalStorage());
  rpc.mockReset();
  invoke.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reserveNumbers", () => {
  it("calls the reserve_numbers RPC with trimmed buyer data", async () => {
    rpc.mockResolvedValue({ data: "2026-11-16T12:00:00Z", error: null });

    await reserveNumbers("raffle-1", ["n1", "n2"], buyer);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reserve_numbers", {
      p_raffle_id: "raffle-1",
      p_number_ids: ["n1", "n2"],
      p_buyer_name: "Juan Perez",
      p_buyer_email: "juan@example.com",
      p_buyer_phone: "+54 11 5555-5555",
    });
  });

  it("sends null for blank email and phone", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await reserveNumbers("raffle-1", ["n1"], { name: "Ana", email: "   ", phone: "" });

    expect(rpc.mock.calls[0][1]).toMatchObject({ p_buyer_email: null, p_buyer_phone: null });
  });

  it("throws the message returned by the database function", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Alguno de los números ya no está disponible. Actualizá la página y elegí de nuevo." },
    });

    await expect(reserveNumbers("raffle-1", ["n1"], buyer)).rejects.toThrow(
      "Alguno de los números ya no está disponible. Actualizá la página y elegí de nuevo.",
    );
  });

  it("does not touch the pending order", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await reserveNumbers("raffle-1", ["n1"], buyer);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe("startMercadoPagoPayment", () => {
  const response = { order_id: "order-1", payment_link: "https://mp.example/pay", amount: 200 };

  it("invokes mp-create-payment with the raffle, numbers and trimmed buyer", async () => {
    invoke.mockResolvedValue({ data: response, error: null });

    const result = await startMercadoPagoPayment("raffle-1", ["n1", "n2"], buyer);

    expect(result).toEqual(response);
    expect(invoke).toHaveBeenCalledWith("mp-create-payment", {
      body: {
        raffle_id: "raffle-1",
        number_ids: ["n1", "n2"],
        buyer: { name: "Juan Perez", email: "juan@example.com", phone: "+54 11 5555-5555" },
      },
    });
  });

  it("stores the pending order so the payment can be verified on return", async () => {
    invoke.mockResolvedValue({ data: response, error: null });

    await startMercadoPagoPayment("raffle-1", ["n1"], buyer);

    expect(JSON.parse(localStorage.getItem(PENDING_KEY)!)).toEqual({
      raffleId: "raffle-1",
      orderId: "order-1",
      timestamp: NOW.getTime(),
    });
    expect(getPendingOrder("raffle-1")).toEqual({ raffleId: "raffle-1", orderId: "order-1", timestamp: NOW.getTime() });
  });

  it("does not store a pending order when the server rejects the payment", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError({ json: async () => ({ error: "Mercado Pago no está configurado para este talonario" }) }),
    });

    await expect(startMercadoPagoPayment("raffle-1", ["n1"], buyer)).rejects.toThrow(
      "Mercado Pago no está configurado para este talonario",
    );
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe("getPendingOrder", () => {
  const store = (value: unknown) => localStorage.setItem(PENDING_KEY, JSON.stringify(value));

  it("returns null when nothing is stored", () => {
    expect(getPendingOrder("raffle-1")).toBeNull();
  });

  it("returns the stored order for the same raffle", () => {
    const pending = { raffleId: "raffle-1", orderId: "order-1", timestamp: NOW.getTime() - 60_000 };
    store(pending);
    expect(getPendingOrder("raffle-1")).toEqual(pending);
  });

  it("returns null for another raffle but keeps the order stored", () => {
    store({ raffleId: "raffle-1", orderId: "order-1", timestamp: NOW.getTime() });

    expect(getPendingOrder("raffle-2")).toBeNull();
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull();
    expect(getPendingOrder("raffle-1")).not.toBeNull();
  });

  it("keeps an order that is exactly 24 hours old", () => {
    store({ raffleId: "raffle-1", orderId: "order-1", timestamp: NOW.getTime() - DAY_MS });
    expect(getPendingOrder("raffle-1")).not.toBeNull();
  });

  it("drops an order older than 24 hours", () => {
    store({ raffleId: "raffle-1", orderId: "order-1", timestamp: NOW.getTime() - DAY_MS - 1 });

    expect(getPendingOrder("raffle-1")).toBeNull();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("drops an entry without an order id", () => {
    store({ raffleId: "raffle-1", timestamp: NOW.getTime() });

    expect(getPendingOrder("raffle-1")).toBeNull();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("drops corrupt JSON instead of throwing", () => {
    localStorage.setItem(PENDING_KEY, "{not json");

    expect(getPendingOrder("raffle-1")).toBeNull();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("drops a stored JSON null instead of throwing", () => {
    localStorage.setItem(PENDING_KEY, "null");

    expect(getPendingOrder("raffle-1")).toBeNull();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe("clearPendingOrder", () => {
  it("removes the stored order", () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ raffleId: "raffle-1", orderId: "order-1", timestamp: NOW.getTime() }));
    clearPendingOrder();
    expect(getPendingOrder("raffle-1")).toBeNull();
  });
});

describe("Edge Function errors (invokeFunction)", () => {
  it("surfaces the error message sent by the server", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError({ json: async () => ({ error: "Orden inexistente" }) }),
    });

    await expect(verifyOrderPayment("order-1")).rejects.toThrow("Orden inexistente");
  });

  it("falls back to a generic message when the response is not JSON", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError({
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    });

    await expect(verifyOrderPayment("order-1")).rejects.toThrow(GENERIC_ERROR);
  });

  it("falls back to a generic message when the JSON has no error field", async () => {
    invoke.mockResolvedValue({ data: null, error: functionsHttpError({ json: async () => ({ message: "nope" }) }) });

    await expect(verifyOrderPayment("order-1")).rejects.toThrow(GENERIC_ERROR);
  });

  it("falls back to a generic message on network errors (no response)", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });

    await expect(getMercadoPagoConnectUrl()).rejects.toThrow(GENERIC_ERROR);
  });
});

describe("verifyOrderPayment", () => {
  it("sends the order id and returns the status", async () => {
    invoke.mockResolvedValue({ data: { status: "approved" }, error: null });

    await expect(verifyOrderPayment("order-1")).resolves.toBe("approved");
    expect(invoke).toHaveBeenCalledWith("mp-verify-payment", { body: { order_id: "order-1" } });
  });
});

describe("getMercadoPagoConnectUrl", () => {
  it("returns the authorization URL from mp-oauth-start", async () => {
    invoke.mockResolvedValue({ data: { url: "https://auth.mercadopago.com/authorization?state=abc" }, error: null });

    await expect(getMercadoPagoConnectUrl()).resolves.toBe("https://auth.mercadopago.com/authorization?state=abc");
    expect(invoke).toHaveBeenCalledWith("mp-oauth-start", { body: undefined });
  });
});

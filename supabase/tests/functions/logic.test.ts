// Lógica pura de las Edge Functions (supabase/functions/_shared/logic.ts).
// Las funciones completas corren en Deno y no se ejecutan acá: esto cubre
// solo las decisiones que no dependen de la red ni de la base.
import { describe, expect, it } from "vitest";
import {
  computeOrderAmounts,
  expiresAtFrom,
  firstForwardedIp,
  parseFeePercent,
  parseWebhookNotification,
  pickRelevantPayment,
  REFRESH_MARGIN_MS,
  resolvePaymentOutcome,
  tokenNeedsRefresh,
  UserError,
  UUID_RE,
} from "../../functions/_shared/logic";

const ORDER_ID = "0b2f3c7e-8a1d-4e5f-9a6b-1c2d3e4f5a6b";
const NOW = Date.parse("2026-11-15T12:00:00.000Z");

describe("UUID_RE", () => {
  it("accepts UUIDs in either case", () => {
    expect(UUID_RE.test(ORDER_ID)).toBe(true);
    expect(UUID_RE.test(ORDER_ID.toUpperCase())).toBe(true);
  });

  it.each(["", "abc", `${ORDER_ID}x`, ` ${ORDER_ID}`, `${ORDER_ID}' OR 1=1`, ORDER_ID.replaceAll("-", "")])(
    "rejects %j",
    (value) => {
      expect(UUID_RE.test(value)).toBe(false);
    },
  );
});

describe("firstForwardedIp", () => {
  it("returns the first address of the list", () => {
    expect(firstForwardedIp("9.9.9.9, 10.0.0.1")).toBe("9.9.9.9");
    expect(firstForwardedIp("  2001:db8::1  ")).toBe("2001:db8::1");
  });

  it("returns null without a usable header", () => {
    expect(firstForwardedIp(null)).toBeNull();
    expect(firstForwardedIp(undefined)).toBeNull();
    expect(firstForwardedIp("")).toBeNull();
    expect(firstForwardedIp(" , 10.0.0.1")).toBeNull();
  });
});

describe("parseFeePercent", () => {
  it("defaults to 5% when the variable is not set", () => {
    expect(parseFeePercent(undefined)).toBe(5);
    expect(parseFeePercent(null)).toBe(5);
  });

  it("parses valid percentages, including 0 and decimals", () => {
    expect(parseFeePercent("0")).toBe(0);
    expect(parseFeePercent("3.5")).toBe(3.5);
    expect(parseFeePercent("99.9")).toBe(99.9);
  });

  it("charges no fee for invalid or out-of-range values", () => {
    expect(parseFeePercent("abc")).toBe(0);
    expect(parseFeePercent("-1")).toBe(0);
    expect(parseFeePercent("100")).toBe(0);
    expect(parseFeePercent("Infinity")).toBe(0);
  });

  it("treats an empty string as 0, not as the default", () => {
    expect(parseFeePercent("")).toBe(0);
  });
});

describe("computeOrderAmounts", () => {
  it("multiplies price by quantity and applies the fee percentage", () => {
    expect(computeOrderAmounts(100, 2, 5)).toEqual({ amount: 200, fee: 10 });
    expect(computeOrderAmounts(1500, 20, 5)).toEqual({ amount: 30000, fee: 1500 });
  });

  it("charges no fee at 0%", () => {
    expect(computeOrderAmounts(100, 3, 0)).toEqual({ amount: 300, fee: 0 });
  });

  it("rounds amount and fee to cents", () => {
    expect(computeOrderAmounts(33.33, 1, 5)).toEqual({ amount: 33.33, fee: 1.67 });
    expect(computeOrderAmounts(0.1, 3, 5)).toEqual({ amount: 0.3, fee: 0.02 });
    expect(computeOrderAmounts(19.99, 3, 3.5)).toEqual({ amount: 59.97, fee: 2.1 });
  });

  it("never charges a fee larger than the amount", () => {
    for (const [price, qty, pct] of [[1, 1, 99.9], [0.01, 1, 50], [250, 7, 12.5]] as const) {
      const { amount, fee } = computeOrderAmounts(price, qty, pct);
      expect(fee).toBeLessThanOrEqual(amount);
      expect(fee).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("expiresAtFrom", () => {
  it("adds expires_in seconds to now", () => {
    expect(expiresAtFrom(3600, NOW)).toBe("2026-11-15T13:00:00.000Z");
    expect(expiresAtFrom("15552000", NOW)).toBe("2027-05-14T12:00:00.000Z"); // 180 días, como entrega MP
  });

  it("returns null when expires_in is missing or not a positive number", () => {
    for (const value of [undefined, null, "", "abc", 0, -10, NaN, Infinity, {}]) {
      expect(expiresAtFrom(value, NOW)).toBeNull();
    }
  });

  it("uses the current time by default", () => {
    const before = Date.now();
    const result = Date.parse(expiresAtFrom(60)!);
    expect(result).toBeGreaterThanOrEqual(before + 60_000);
    expect(result).toBeLessThanOrEqual(Date.now() + 60_000);
  });
});

describe("tokenNeedsRefresh", () => {
  const inMs = (ms: number) => new Date(NOW + ms).toISOString();

  it("is false for tokens without an expiry date", () => {
    expect(tokenNeedsRefresh(null, NOW)).toBe(false);
    expect(tokenNeedsRefresh(undefined, NOW)).toBe(false);
  });

  it("is false while more than 7 days remain", () => {
    expect(tokenNeedsRefresh(inMs(REFRESH_MARGIN_MS), NOW)).toBe(false);
    expect(tokenNeedsRefresh(inMs(REFRESH_MARGIN_MS + 1000), NOW)).toBe(false);
  });

  it("is true within 7 days of expiry and after it", () => {
    expect(tokenNeedsRefresh(inMs(REFRESH_MARGIN_MS - 1000), NOW)).toBe(true);
    expect(tokenNeedsRefresh(inMs(-1000), NOW)).toBe(true);
  });
});

describe("resolvePaymentOutcome", () => {
  const order = { id: ORDER_ID, amount: 200 };
  const approved = {
    id: 123,
    external_reference: ORDER_ID,
    status: "approved",
    status_detail: "accredited",
    transaction_amount: 200,
    currency_id: "ARS",
  };

  it("accepts an approved ARS payment for the exact amount", () => {
    expect(resolvePaymentOutcome(order, approved)).toEqual({ status: "approved", detail: "accredited", mismatch: false });
  });

  it("accepts an overpayment", () => {
    expect(resolvePaymentOutcome(order, { ...approved, transaction_amount: 250 }).status).toBe("approved");
  });

  it("compares numerically when the order amount comes as a string (NUMERIC column)", () => {
    expect(resolvePaymentOutcome({ id: ORDER_ID, amount: "200.00" }, approved).status).toBe("approved");
    expect(resolvePaymentOutcome({ id: ORDER_ID, amount: "1000" }, { ...approved, transaction_amount: 200 }).status).toBe("amount_mismatch");
  });

  it.each([
    ["a lower amount", { transaction_amount: 199.99 }],
    ["a missing amount", { transaction_amount: undefined }],
    ["a non-numeric amount", { transaction_amount: "abc" }],
    ["another currency", { currency_id: "USD" }],
    ["a missing currency", { currency_id: undefined }],
  ])("flags an approved payment with %s as an amount mismatch", (_label, override) => {
    expect(resolvePaymentOutcome(order, { ...approved, ...override })).toEqual({
      status: "amount_mismatch",
      detail: "amount_mismatch",
      mismatch: true,
    });
  });

  it.each([
    ["the partially_refunded detail", { status_detail: "partially_refunded" }],
    ["a refunded amount", { transaction_amount_refunded: 50 }],
  ])("flags an approved payment with %s as partially refunded", (_label, override) => {
    expect(resolvePaymentOutcome(order, { ...approved, ...override })).toEqual({
      status: "partially_refunded",
      detail: "partially_refunded",
      mismatch: false,
    });
  });

  it("does not treat a zero refunded amount as a partial refund", () => {
    expect(resolvePaymentOutcome(order, { ...approved, transaction_amount_refunded: 0 }).status).toBe("approved");
  });

  it("throws a UserError when the payment belongs to another order", () => {
    const other = { ...approved, external_reference: "another-order" };
    expect(() => resolvePaymentOutcome(order, other)).toThrow(UserError);
    expect(() => resolvePaymentOutcome(order, other)).toThrow("El pago no corresponde a esta orden");
    expect(() => resolvePaymentOutcome(order, { ...approved, external_reference: undefined })).toThrow(UserError);
  });

  it.each(["pending", "in_process", "rejected", "cancelled", "refunded", "charged_back"])(
    "passes a %s payment through without checking the amount",
    (status) => {
      const payment = { ...approved, status, status_detail: "detail", transaction_amount: 1 };
      expect(resolvePaymentOutcome(order, payment)).toEqual({ status, detail: "detail", mismatch: false });
    },
  );

  it("uses null when Mercado Pago sends no status_detail", () => {
    expect(resolvePaymentOutcome(order, { ...approved, status_detail: undefined }).detail).toBeNull();
  });
});

describe("UserError", () => {
  it("carries an HTTP status, 400 by default", () => {
    expect(new UserError("x").status).toBe(400);
    expect(new UserError("x", 409).status).toBe(409);
    expect(new UserError("mensaje").message).toBe("mensaje");
  });
});

describe("pickRelevantPayment", () => {
  it("prefers the approved payment over a more recent rejected one", () => {
    const results = [{ id: 2, status: "rejected" }, { id: 1, status: "approved" }];
    expect(pickRelevantPayment(results)).toEqual({ id: 1, status: "approved" });
  });

  it("falls back to the first (most recent) payment", () => {
    expect(pickRelevantPayment([{ id: 2, status: "rejected" }, { id: 1, status: "pending" }])).toEqual({ id: 2, status: "rejected" });
  });

  it("returns undefined when there are no payments", () => {
    expect(pickRelevantPayment([])).toBeUndefined();
    expect(pickRelevantPayment(undefined)).toBeUndefined();
    expect(pickRelevantPayment(null)).toBeUndefined();
  });
});

describe("parseWebhookNotification", () => {
  const base = `https://project.supabase.co/functions/v1/mp-webhook?order=${ORDER_ID}`;
  const parse = (query: string, body: unknown = {}) => parseWebhookNotification(new URL(`${base}${query}`), body);

  it("reads the webhook format from the query string", () => {
    expect(parse("&data.id=123456&type=payment")).toEqual({ orderId: ORDER_ID, paymentId: "123456" });
  });

  it("reads the webhook format from the body", () => {
    const body = { action: "payment.created", type: "payment", data: { id: "123456" } };
    expect(parse("", body)).toEqual({ orderId: ORDER_ID, paymentId: "123456" });
  });

  it("accepts a numeric payment id in the body", () => {
    expect(parse("", { type: "payment", data: { id: 123456 } })).toEqual({ orderId: ORDER_ID, paymentId: "123456" });
  });

  it("reads the legacy IPN format (?topic=payment&id=)", () => {
    expect(parse("&topic=payment&id=987")).toEqual({ orderId: ORDER_ID, paymentId: "987" });
  });

  it("prefers the query string over the body", () => {
    expect(parse("&data.id=111&type=payment", { type: "payment", data: { id: "222" } })?.paymentId).toBe("111");
  });

  it("ignores merchant_order notifications", () => {
    expect(parse("&topic=merchant_order&id=555")).toBeNull();
    expect(parse("", { type: "merchant_order", data: { id: "555" } })).toBeNull();
  });

  it("does not take the IPN ?id= as a payment id for other topics", () => {
    expect(parse("&id=555", { type: "subscription" })).toBeNull();
  });

  it("ignores notifications without type or payment id", () => {
    expect(parse("")).toBeNull();
    expect(parse("&type=payment")).toBeNull();
    expect(parse("&data.id=123")).toBeNull();
  });

  it("ignores payment ids that are not numeric (they go into an API URL)", () => {
    expect(parse("&type=payment&data.id=12/../34")).toBeNull();
    expect(parse("&type=payment&data.id=abc")).toBeNull();
    expect(parse("", { type: "payment", data: { id: "1?x=1" } })).toBeNull();
    expect(parse("", { type: "payment", data: { id: { nested: 1 } } })).toBeNull();
  });

  it("ignores notifications without a valid order parameter", () => {
    const noOrder = new URL("https://project.supabase.co/functions/v1/mp-webhook?type=payment&data.id=123");
    expect(parseWebhookNotification(noOrder, {})).toBeNull();

    const badOrder = new URL("https://project.supabase.co/functions/v1/mp-webhook?order=not-a-uuid&type=payment&data.id=123");
    expect(parseWebhookNotification(badOrder, {})).toBeNull();
  });

  it("tolerates bodies that are not objects", () => {
    expect(parse("&data.id=123&type=payment", null)).toEqual({ orderId: ORDER_ID, paymentId: "123" });
    expect(parse("&data.id=123&type=payment", "texto")).toEqual({ orderId: ORDER_ID, paymentId: "123" });
    expect(parse("", null)).toBeNull();
    expect(parse("", [1, 2])).toBeNull();
  });
});

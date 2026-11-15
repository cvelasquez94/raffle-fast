import { describe, expect, it } from "vitest";
import { isValidEmail, isValidPhone, isValidWhatsApp } from "./validation";

describe("isValidEmail", () => {
  it.each(["juan@example.com", "juan.perez+rifa@mail.example.com.ar", "a@b.co"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["no @", "juan.example.com"],
    ["no domain dot", "juan@example"],
    ["no local part", "@example.com"],
    ["no domain", "juan@"],
    ["space inside", "juan perez@example.com"],
    ["two @", "juan@@example.com"],
    ["leading space", " juan@example.com"],
    ["trailing space", "juan@example.com "],
  ])("rejects %s", (_label, email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("isValidPhone", () => {
  it.each(["+5491112345678", "+54 9 11 1234-5678", "(011) 4555-1234", "1145551234", "11.4555.1234", "1234567"])(
    "accepts %s",
    (phone) => {
      expect(isValidPhone(phone)).toBe(true);
    },
  );

  it.each([
    ["empty", ""],
    ["too short (6)", "123456"],
    ["too long (21)", "1".repeat(21)],
    ["letters", "11-CALL-ME-NOW"],
    ["plus in the middle", "54+91112345678"],
    ["two leading pluses", "++5491112345678"],
  ])("rejects %s", (_label, phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });

  it("accepts the maximum of 20 characters after the optional +", () => {
    expect(isValidPhone("1".repeat(20))).toBe(true);
    expect(isValidPhone(`+${"1".repeat(20)}`)).toBe(true);
  });
});

describe("isValidWhatsApp", () => {
  it.each(["+5491112345678", "+1234567890", "+123456789012345"])("accepts %s", (number) => {
    expect(isValidWhatsApp(number)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["missing +", "5491112345678"],
    ["spaces", "+54 9 11 1234 5678"],
    ["dashes", "+54-911-1234-5678"],
    ["too short (9 digits)", "+123456789"],
    ["too long (16 digits)", "+1234567890123456"],
    ["letters", "+54911abc45678"],
    ["trailing space", "+5491112345678 "],
  ])("rejects %s", (_label, number) => {
    expect(isValidWhatsApp(number)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { parseScannedQr } from "./transferQr";

function emv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0").slice(-2)}${value}`;
}

function makeMerchantQr(gui: string, options: { amount?: string } = {}): string {
  const merchantTemplate = [
    emv("00", gui),
    emv("01", "123456789012345"),
    emv("03", "STORE-001"),
  ].join("");
  const additionalData = emv("05", "INV-0001");
  return [
    emv("00", "01"),
    emv("26", merchantTemplate),
    emv("52", "0000"),
    emv("53", "608"),
    ...(options.amount ? [emv("54", options.amount)] : []),
    emv("58", "PH"),
    emv("59", "DRPAY TEST MERCHANT"),
    emv("60", "MANILA"),
    emv("62", additionalData),
  ].join("");
}

describe("parseScannedQr QRPH merchant codes", () => {
  it("recognizes a standard P2M GUI", () => {
    const result = parseScannedQr(makeMerchantQr("com.p2mqrpay"));

    expect(result?.type).toBe("p2m");
    if (result?.type !== "p2m") return;
    expect(result.merchant).toMatchObject({
      merchantName: "DRPAY TEST MERCHANT",
      merchantId: "123456789012345",
      currency: "PHP",
      city: "MANILA",
      reference: "INV-0001",
    });
  });

  it("recognizes additional QRPH merchant namespaces", () => {
    const result = parseScannedQr(makeMerchantQr("ph.ppmi.p2m.v1", { amount: "2500.00" }));

    expect(result?.type).toBe("p2m");
    if (result?.type !== "p2m") return;
    expect(result.merchant.amount).toBe(2500);
  });

  it("recognizes QRPH merchant codes without a P2M suffix", () => {
    const result = parseScannedQr(makeMerchantQr("com.qrph"));

    expect(result?.type).toBe("p2m");
  });

  it("keeps dynamic amount optional", () => {
    const result = parseScannedQr(makeMerchantQr("com.qrph.p2m"));

    expect(result?.type).toBe("p2m");
    if (result?.type !== "p2m") return;
    expect(result.merchant.amount).toBeUndefined();
  });
});

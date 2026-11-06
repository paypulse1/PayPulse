import assert from "node:assert/strict"
import { test } from "vitest"
import {
  getPaymentInstitutionAppName,
  getPaymentInstitutionDeepLink,
  isSafePaymentInstitutionDeepLink,
} from "./paymentInstitutionLinks"

test("Alipay institutions use the Alipay+ label and scanner deep link", () => {
  const institution = {
    code: " alipay ",
    name: "Alipay",
  }

  assert.equal(getPaymentInstitutionAppName(institution), "Alipay+")
  assert.equal(
    getPaymentInstitutionDeepLink(institution),
    "alipays://platformapi/startapp?appId=20000056",
  )
})

test("GCash institutions can open GCash when no provider app link is supplied", () => {
  const institution = {
    code: "G-XCHANGE INC.",
    name: "G-Xchange, Inc. (GCash)",
  }

  assert.equal(getPaymentInstitutionAppName(institution), "GCash")
  assert.equal(getPaymentInstitutionDeepLink(institution), "gcash://")
  const tlv = (tag: string, value: string) =>
    `${tag}${String(value.length).padStart(2, "0")}${value}`
  const accountInfo = [
    tlv("00", "ph.ppmi.p2m"),
    tlv("01", "SRCPPHM2XXX"),
    tlv("03", "merchant-123"),
    tlv("04", "account-456"),
  ].join("")
  const additionalData = [
    tlv("03", "invoice-789"),
    tlv("05", "acquirer-ref"),
    tlv("07", "terminal-1"),
  ].join("")
  const qrPayload = [
    tlv("00", "01"),
    tlv("28", accountInfo),
    tlv("52", "5199"),
    tlv("54", "125.50"),
    tlv("59", "SwiftPay Merchant"),
    tlv("60", "Makati City"),
    tlv("62", additionalData),
  ].join("")
  assert.equal(getPaymentInstitutionDeepLink(institution, qrPayload), undefined)
})

test("a provider-supplied GCash app link takes precedence over the QR fallback", () => {
  const institution = {
    code: "GCASH",
    name: "GCash",
    deepLink: "gcash://qr/scan",
  }

  assert.equal(
    getPaymentInstitutionDeepLink(institution, "merchant-qr-payload"),
    "gcash://qr/scan",
  )
})

test("provider app links are available for any institution when safely supplied", () => {
  const institution = {
    code: "EXAMPLE_WALLET",
    name: "Example Wallet",
    deepLink: "examplewallet://pay/scan",
  }

  assert.equal(
    getPaymentInstitutionDeepLink(institution),
    "examplewallet://pay/scan",
  )
})

test("payment institution deep links reject unsafe or malformed URLs", () => {
  assert.equal(isSafePaymentInstitutionDeepLink("javascript:alert(1)"), false)
  assert.equal(isSafePaymentInstitutionDeepLink("intent://scan"), false)
  assert.equal(isSafePaymentInstitutionDeepLink("http://wallet.example"), false)
  assert.equal(
    isSafePaymentInstitutionDeepLink("https://wallet.example/pay"),
    true,
  )
  assert.equal(
    isSafePaymentInstitutionDeepLink("wallet://user:password@host/scan"),
    false,
  )
})

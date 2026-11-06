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
  const deepLink = getPaymentInstitutionDeepLink(institution, qrPayload)
  assert.ok(deepLink)
  const deepLinkUrl = new URL(deepLink)
  assert.equal(deepLinkUrl.protocol, "gcash:")
  assert.equal(deepLinkUrl.host, "com.mynt.gcash")
  assert.equal(deepLinkUrl.pathname, "/app/006300000800")
  assert.equal(deepLinkUrl.searchParams.get("qrCode"), qrPayload)
  assert.equal(deepLinkUrl.searchParams.get("qrCodeFormat"), "EMVCO")
  assert.equal(deepLinkUrl.searchParams.get("sub"), "p2mpay")
  assert.equal(deepLinkUrl.searchParams.get("orderAmount"), "125.50")
  assert.equal(
    deepLinkUrl.searchParams.get("merchantName"),
    "SwiftPay Merchant",
  )
  assert.equal(
    deepLinkUrl.searchParams.get("tfrbnkcode"),
    "SRCPPHM2XXX",
  )
  assert.equal(deepLinkUrl.searchParams.get("shopId"), "merchant-123")
  assert.equal(deepLinkUrl.searchParams.get("tfrAcctNo"), "account-456")
  assert.equal(
    deepLinkUrl.searchParams.get("acqInfo"),
    "acquirer-ref",
  )
  assert.equal(
    deepLinkUrl.searchParams.get("param3"),
    "99960005~ph.ppmi.p2m~~~010",
  )
  assert.equal(
    deepLinkUrl.searchParams.get("param5"),
    "merchant-123~SwiftPay Merchant~terminal-1~acquirer-ref",
  )
})

test("GCash deep link uses checkout amount when QRPH has no amount field", () => {
  const institution = { code: "GCASH", name: "GCash" }
  const deepLink = getPaymentInstitutionDeepLink(
    institution,
    "000201",
    125.5,
  )

  assert.ok(deepLink)
  assert.equal(new URL(deepLink).searchParams.get("orderAmount"), "125.50")
})

test("a verified GCash provider app link takes precedence over the fallback", () => {
  const institution = {
    code: "GCASH",
    name: "GCash",
    deepLink: "gcash://qr/scan",
  }

  assert.equal(
    getPaymentInstitutionDeepLink(institution),
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

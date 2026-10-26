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

test("institutions without a verified app link use the QR fallback", () => {
  const institution = {
    code: "GCASH",
    name: "GCash",
  }

  assert.equal(getPaymentInstitutionAppName(institution), "GCash")
  assert.equal(getPaymentInstitutionDeepLink(institution), undefined)
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

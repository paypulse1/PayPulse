import { createHash } from "node:crypto"

export function isSupportedPaymentLinkCurrency(currency) {
  return currency === undefined || currency === "PHP"
}

export function paymentLinkRequestFingerprint({
  amount,
  collectionAmountKrw,
  description,
  customerEmail,
  paymentInstitutionCode,
  paymentInstitutionName,
  paymentInstitutionLogoUrl,
  paymentInstitutionDeepLink,
  checkoutInstructions,
  emailSubject,
  emailMessage,
  emailBrandColor,
  emailLogoUrl,
}) {
  const request = [
    Number(amount),
    collectionAmountKrw == null ? null : Number(collectionAmountKrw),
    description,
    customerEmail || null,
    paymentInstitutionCode || null,
    paymentInstitutionName || null,
    paymentInstitutionLogoUrl || null,
    paymentInstitutionDeepLink || null,
    checkoutInstructions,
    emailSubject,
    emailMessage,
    emailBrandColor,
    emailLogoUrl || null,
  ]
  return createHash("sha256").update(JSON.stringify(request)).digest("hex")
}

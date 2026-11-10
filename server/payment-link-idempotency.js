import { createHash } from "node:crypto"

export function isSupportedPaymentLinkCurrency(currency) {
  return currency === undefined || currency === "PHP"
}

export function isValidEstimatedDeliveryDate(
  value,
  today = new Date().toISOString().slice(0, 10),
) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    value >= today &&
    parsed.toISOString().slice(0, 10) === value
  )
}

export function paymentLinkRequestFingerprint({
  amount,
  collectionAmountKrw,
  description,
  customerEmail,
  estimatedDeliveryDate,
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
    estimatedDeliveryDate || null,
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

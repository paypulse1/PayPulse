import type { InstitutionBrand } from "./swiftpay"

export function getPaymentInstitutionAppName(institution: InstitutionBrand) {
  return institution.code.trim().toUpperCase() === "ALIPAY"
    ? "Alipay+"
    : institution.name
}

export function getPaymentInstitutionDeepLink(institution: InstitutionBrand) {
  const providerLink = institution.deepLink?.trim()
  if (providerLink && isSafePaymentInstitutionDeepLink(providerLink)) {
    return providerLink
  }

  if (institution.code.trim().toUpperCase() === "ALIPAY") {
    return "alipays://platformapi/startapp?appId=20000056"
  }
  return undefined
}

export function isSafePaymentInstitutionDeepLink(value: string) {
  if (value.length > 2048) return false
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    if (url.protocol === "https:") return Boolean(url.hostname)
    return (
      /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) &&
      !["http:", "javascript:", "data:", "file:", "blob:", "intent:", "ftp:"].includes(
        url.protocol,
      ) &&
      Boolean(url.hostname)
    )
  } catch {
    return false
  }
}

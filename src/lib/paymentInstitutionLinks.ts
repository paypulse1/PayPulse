import type { InstitutionBrand } from "./swiftpay"

function isGcashInstitution(institution: InstitutionBrand) {
  const identity = `${institution.code} ${institution.name}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
  return identity.includes("GCASH") || identity.includes("GXCHANGE")
}

export function getPaymentInstitutionAppName(institution: InstitutionBrand) {
  if (institution.code.trim().toUpperCase() === "ALIPAY") return "Alipay+"
  if (isGcashInstitution(institution)) return "GCash"
  return institution.name
}

export function getPaymentInstitutionDeepLink(
  institution: InstitutionBrand,
  qrPayload?: string,
) {
  const providerLink = institution.deepLink?.trim()
  if (providerLink && isSafePaymentInstitutionDeepLink(providerLink)) {
    return providerLink
  }

  if (isGcashInstitution(institution) && qrPayload) return undefined

  if (institution.code.trim().toUpperCase() === "ALIPAY") {
    return "alipays://platformapi/startapp?appId=20000056"
  }
  if (isGcashInstitution(institution)) return "gcash://"
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

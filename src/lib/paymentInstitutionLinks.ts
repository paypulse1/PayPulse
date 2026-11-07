import type { InstitutionBrand } from "./swiftpay"

const gcashAppDeepLink = "gcash://"
const gcashQrPaymentUrl = "gcash://com.mynt.gcash/app/006300000800"

function isGcashInstitution(institution: InstitutionBrand) {
  const identity = `${institution.code} ${institution.name}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
  return identity.includes("GCASH") || identity.includes("GXCHANGE")
}

function getGcashDeepLink(qrPayload?: string, providerLink?: string) {
  if (qrPayload) {
    return `${gcashQrPaymentUrl}?qrCode=${encodeURIComponent(qrPayload)}`
  }
  if (providerLink && isSafePaymentInstitutionDeepLink(providerLink)) {
    return providerLink
  }
  return gcashAppDeepLink
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

  if (isGcashInstitution(institution)) {
    return getGcashDeepLink(qrPayload, providerLink)
  }
  if (providerLink && isSafePaymentInstitutionDeepLink(providerLink)) return providerLink
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

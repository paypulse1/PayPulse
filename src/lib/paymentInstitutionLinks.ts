import type { InstitutionBrand } from "./swiftpay"

function parseEmvFields(payload: string) {
  const fields = new Map<string, string>()
  let offset = 0

  while (offset < payload.length) {
    if (offset + 4 > payload.length) return undefined

    const tag = payload.slice(offset, offset + 2)
    const lengthText = payload.slice(offset + 2, offset + 4)
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) {
      return undefined
    }

    const valueStart = offset + 4
    const valueEnd = valueStart + Number(lengthText)
    if (valueEnd > payload.length) return undefined

    fields.set(tag, payload.slice(valueStart, valueEnd))
    offset = valueEnd
  }

  return fields
}

function getGcashQrParameters(qrPayload: string, amount?: number) {
  const fields = parseEmvFields(qrPayload)
  const extraFields = parseEmvFields(fields?.get("62") || "")
  const accountFields = [...(fields?.entries() || [])]
    .filter(([tag]) => Number(tag) >= 26 && Number(tag) <= 51)
    .map(([, value]) => parseEmvFields(value))
    .find((template) => template?.get("00")?.includes("ph.ppmi.p2m"))
  const merchantName = fields?.get("59")?.trim() || ""
  const shopId = accountFields?.get("03")?.trim() || ""
  const acqInfo = extraFields?.get("05")?.trim() || ""
  const params = new URLSearchParams({
    qrCode: qrPayload,
    qrCodeFormat: "EMVCO",
    sub: "p2mpay",
    param3: "99960005~ph.ppmi.p2m~~~010",
    lucky: "false",
  })

  const orderAmount = fields?.get("54") || amount?.toFixed(2)
  if (orderAmount) params.set("orderAmount", orderAmount)
  if (merchantName) params.set("merchantName", merchantName)

  const bankCode = accountFields?.get("01")?.trim()
  const destinationAccount = accountFields?.get("04")?.trim()
  const terminalLabel = extraFields?.get("07")?.trim() || ""
  const merchantCity = fields?.get("60")?.trim()
  const merchantCategoryCode = fields?.get("52")?.trim()

  if (bankCode) params.set("tfrbnkcode", bankCode)
  if (shopId) {
    params.set("shopId", shopId)
    params.set("tfrAcctNo", destinationAccount || shopId)
    params.set(
      "param5",
      `${shopId}~${merchantName}~${terminalLabel}~${acqInfo}`,
    )
  }
  if (acqInfo) params.set("acqInfo", acqInfo)
  if (merchantCity) params.set("merchantCity", merchantCity)
  if (merchantCategoryCode) {
    params.set("merchantCategoryCode", merchantCategoryCode)
  }

  return params.toString().replace(/\+/g, "%20")
}

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
  amount?: number,
) {
  if (isGcashInstitution(institution) && qrPayload) {
    return `gcash://com.mynt.gcash/app/006300000800?${getGcashQrParameters(qrPayload, amount)}`
  }

  const providerLink = institution.deepLink?.trim()
  if (providerLink && isSafePaymentInstitutionDeepLink(providerLink)) {
    return providerLink
  }

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

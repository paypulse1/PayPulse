export const VIRTUAL_ACCOUNT_INSTITUTION_CODE = "DRPAY_VIRTUAL_ACCOUNT"

function providerText(value, maxLength) {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return undefined
  }
  return normalized
}

export function virtualAccountInformationFromProvider(
  data,
  fallbackReferenceNo,
) {
  const referenceNo =
    providerText(data?.referenceNo, 64) ||
    providerText(fallbackReferenceNo, 64)
  return {
    bankAccountNumber: providerText(data?.bankAccountNumber, 64),
    instapayBankCode: providerText(data?.instapayBankCode, 32),
    referenceNo,
  }
}

export function virtualAccountInformationFromRow(row) {
  if (row.payment_institution_code !== VIRTUAL_ACCOUNT_INSTITUTION_CODE) {
    return undefined
  }
  return {
    bankAccountNumber: providerText(
      row.virtual_account_bank_account_number,
      64,
    ),
    instapayBankCode: providerText(row.virtual_account_instapay_bank_code, 32),
    referenceNo:
      providerText(row.virtual_account_reference_no, 64) ||
      providerText(row.reference_no, 64),
  }
}

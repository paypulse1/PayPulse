import { parseMinorUnits } from "./money.js"

export function disbursementReplayMatches(row, request) {
  let amountMatches = false
  try {
    amountMatches =
      parseMinorUnits(row.amount) === parseMinorUnits(request.amount)
  } catch {
    amountMatches = false
  }
  return (
    amountMatches &&
    row.channel === request.channel &&
    row.institution_code === request.institutionCode &&
    String(row.recipient_account_number || "").replace(/\s/g, "") ===
      request.accountNumber &&
    String(row.recipient_name || "").trim().toLowerCase() ===
      request.fullName.toLowerCase() &&
    String(row.remarks || "").trim() === request.remarks &&
    (row.refund_payment_id || "") === (request.refundPaymentId || "")
  )
}
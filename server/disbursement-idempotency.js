export function disbursementReplayMatches(row, request) {
  return (
    Math.round(Number(row.amount) * 100) === Math.round(request.amount * 100) &&
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
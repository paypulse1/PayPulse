export function canManuallyConfirmPayment(status) {
  return status === "PENDING"
}

export function createPaymentStateService({
  pool,
  settleSuccessfulCollection,
  queueSuccessfulTransaction,
  queueTransactionWebhook,
}) {
  async function updatePaymentLinkStatus(id, status) {
    const updated = await pool.query(
      `UPDATE payment_links SET status = $1, updated_at = NOW()
       WHERE id = $2
         AND status NOT IN (
           'MANUALLY_PAID', 'EXECUTED', 'CANCELED', 'REJECTED', 'EXPIRED', 'FAILED'
         )
       RETURNING id`,
      [status, id],
    )
    if (!updated.rowCount) return false
    if (status === "EXECUTED") await settleSuccessfulCollection(id)
    await queueSuccessfulTransaction("PAYMENT", id)
    await queueTransactionWebhook("PAYMENT", id)
    return true
  }

  return { updatePaymentLinkStatus }
}

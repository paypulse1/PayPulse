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
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const selected = await client.query(
        "SELECT status FROM payment_links WHERE id = $1 FOR UPDATE",
        [id],
      )
      if (!selected.rowCount) {
        await client.query("COMMIT")
        return false
      }

      const currentStatus = selected.rows[0].status
      const alreadySettled =
        currentStatus === "EXECUTED" || currentStatus === "MANUALLY_PAID"
      const terminalStatuses = [
        "MANUALLY_PAID",
        "EXECUTED",
        "CANCELED",
        "REJECTED",
        "EXPIRED",
        "FAILED",
      ]

      if (status === "EXECUTED") {
        if (!alreadySettled && terminalStatuses.includes(currentStatus)) {
          await client.query("COMMIT")
          return false
        }
        if (!alreadySettled) {
          await client.query(
            "UPDATE payment_links SET status = 'EXECUTED', updated_at = NOW() WHERE id = $1",
            [id],
          )
        }
        await settleSuccessfulCollection(id, client)
        await queueSuccessfulTransaction("PAYMENT", id, client)
        await queueTransactionWebhook("PAYMENT", id, client)
        await client.query("COMMIT")
        return true
      }

      if (terminalStatuses.includes(currentStatus)) {
        await client.query("COMMIT")
        return false
      }
      await client.query(
        "UPDATE payment_links SET status = $1, updated_at = NOW() WHERE id = $2",
        [status, id],
      )
      await client.query("COMMIT")
      return true
    } catch (error) {
      try {
        await client.query("ROLLBACK")
      } catch (rollbackError) {
        console.error("Payment settlement rollback failed", {
          paymentId: id,
          error:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
        })
      }
      if (status === "EXECUTED") {
        try {
          await client.query(
            `UPDATE payment_links SET status = 'SETTLEMENT_RETRY', updated_at = NOW()
             WHERE id = $1
               AND status IN ('CREATING', 'ACTIVE', 'PENDING', 'OUTCOME_UNKNOWN', 'SETTLEMENT_RETRY')`,
            [id],
          )
        } catch (retryStateError) {
          console.error("Payment settlement retry state could not be recorded", {
            paymentId: id,
            error:
              retryStateError instanceof Error
                ? retryStateError.message
                : String(retryStateError),
          })
        }
      }
      throw error
    } finally {
      client.release()
    }
  }

  return { updatePaymentLinkStatus }
}

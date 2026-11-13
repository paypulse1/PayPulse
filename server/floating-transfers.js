import { randomUUID } from "node:crypto"
import {
  addMinorUnits,
  formatMinorUnits,
  parseMinorUnits,
  subtractMinorUnits,
} from "./money.js"

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export async function createFloatingTransferRequest(
  pool,
  merchantEmail,
  amount,
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      "SELECT email FROM merchant_accounts WHERE email = $1 FOR UPDATE",
      [merchantEmail],
    )
    const transferFeeSetting = await client.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'transfer_fee_fixed'",
    )
    let transferFee
    try {
      transferFee = parseMinorUnits(
        transferFeeSetting.rows[0]?.setting_value || "0",
      )
    } catch {
      throw new Error(
        "The configured floating-balance transfer fee is invalid.",
      )
    }
    if (transferFee < 0n) {
      throw new Error(
        "The configured floating-balance transfer fee is invalid.",
      )
    }
    const [account, totals] = await Promise.all([
      client.query(
        `SELECT bank_name AS "bankName", account_name AS "accountName",
           account_number AS "accountNumber"
         FROM merchant_payout_accounts WHERE merchant_email = $1`,
        [merchantEmail],
      ),
      client.query(
        `SELECT COALESCE((SELECT SUM(amount) FROM internal_wallet_adjustments
                WHERE merchant_email = $1 AND adjusted_by NOT LIKE 'system:%'), 0)::numeric AS balance,
             COALESCE((SELECT SUM(amount + transfer_fee) FROM floating_transfer_requests
                WHERE merchant_email = $1 AND status = 'PENDING'), 0)::numeric AS reserved`,
        [merchantEmail],
      ),
    ])
    if (!account.rowCount) {
      throw requestError(
        409,
        "Save a payout bank account in your merchant profile before requesting a transfer.",
      )
    }
    const available = subtractMinorUnits(
      parseMinorUnits(totals.rows[0].balance),
      parseMinorUnits(totals.rows[0].reserved),
    )
    const amountMinor = parseMinorUnits(amount)
    if (
      addMinorUnits(amountMinor, transferFee) >
      available
    ) {
      throw requestError(
        400,
        "The requested amount plus the transfer fee exceeds your available floating balance.",
      )
    }
    const payout = account.rows[0]
    const result = await client.query(
      `INSERT INTO floating_transfer_requests
         (id, merchant_email, amount, transfer_fee, bank_name, account_name, account_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
       RETURNING id, amount::float8 AS amount, transfer_fee::float8 AS "transferFee",
         status, bank_name AS "bankName", account_name AS "accountName",
         account_number AS "accountNumber", requested_at AS "requestedAt",
         reviewed_at AS "reviewedAt", failure_reason AS "failureReason"`,
      [
        randomUUID(),
        merchantEmail,
        formatMinorUnits(amountMinor),
        formatMinorUnits(transferFee),
        payout.bankName,
        payout.accountName,
        payout.accountNumber,
      ],
    )
    await client.query("COMMIT")
    return result.rows[0]
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

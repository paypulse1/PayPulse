import { randomUUID } from "node:crypto"

export const PLATFORM_FEE_LEDGER_SOURCE_TYPES = [
  "COLLECTION",
  "FLOATING_TRANSFER",
  "DISBURSEMENT",
  "ACTIVATION_FEE",
]
export const MAX_DOWNLINE_COMMISSION_PERCENT = 20

const successfulPaymentStatuses = new Set(["EXECUTED", "MANUALLY_PAID"])
const successfulDisbursementStatuses = new Set([
  "EXECUTED",
  "SUCCESS",
  "COMPLETED",
])

export function isSuccessfulPaymentStatus(status) {
  return successfulPaymentStatuses.has(String(status || "").toUpperCase())
}

export function isSuccessfulDisbursementStatus(status) {
  return successfulDisbursementStatuses.has(String(status || "").toUpperCase())
}

export function calculateCollectionFee(amount, feePercent) {
  const grossAmount = Number(amount)
  const percent = Number(feePercent)
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw new Error("The collection amount is invalid.")
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("The configured collection fee percentage is invalid.")
  }
  return Math.round(grossAmount * percent) / 100
}

export function calculateDownlineCommission(netAmount, commissionPercent) {
  const amount = Number(netAmount)
  const percent = Number(commissionPercent)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("The downline collection amount is invalid.")
  }
  if (
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > MAX_DOWNLINE_COMMISSION_PERCENT
  ) {
    throw new Error("The configured downline commission percentage is invalid.")
  }
  return Math.round(amount * percent) / 100
}

export function calculateTransferDebit(amount, feeAmount) {
  const transferAmount = Number(amount)
  const fee = Number(feeAmount)
  if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
    throw new Error("The transfer amount is invalid.")
  }
  if (!Number.isFinite(fee) || fee < 0) {
    throw new Error("The configured transfer fee is invalid.")
  }
  return Math.round((transferAmount + fee) * 100) / 100
}

export function calculateRefundLedgerReversal(amount, feeAmount) {
  const grossAmount = Number(amount)
  const fee = Number(feeAmount)
  const netAmount = Math.round((grossAmount - fee) * 100) / 100
  if (!Number.isFinite(netAmount) || netAmount < 0) {
    throw new Error("The collection refund ledger amount is invalid.")
  }
  return netAmount
}

export function calculateTransferRequestAvailableBalance(balance, reserved) {
  const postedBalance = Number(balance)
  const reservedAmount = Number(reserved)
  if (
    !Number.isFinite(postedBalance) ||
    !Number.isFinite(reservedAmount) ||
    reservedAmount < 0
  ) {
    throw new Error("The floating-balance totals are invalid.")
  }
  return postedBalance - reservedAmount
}

export function createLedgerService({
  pool,
  queueSuccessfulTransaction,
  queueTransactionWebhook,
}) {
  async function getMerchantWalletState(db, merchantEmail) {
    const result = await db.query(
      `WITH ledger AS (
        SELECT (
          COALESCE((SELECT SUM(amount) FROM merchant_wallet_ledger WHERE merchant_email = $1), 0) +
          COALESCE((SELECT SUM(amount) FROM merchant_wallet_adjustments WHERE merchant_email = $1), 0)
        )::numeric AS balance,
          COALESCE(SUM(amount) FILTER (WHERE source_type = 'COLLECTION'), 0)::numeric AS collection_credits
        FROM merchant_wallet_ledger
        WHERE merchant_email = $1
       ), collections AS (
         SELECT COALESCE(SUM(collection_amount_krw), 0)::numeric AS completed_krw
         FROM payment_links
         WHERE merchant_email = $1 AND status IN ('EXECUTED', 'MANUALLY_PAID') AND collection_amount_krw IS NOT NULL
       ), reservations AS (
         SELECT COALESCE(SUM(
           CASE WHEN d.refund_payment_id IS NOT NULL
             THEN GREATEST(COALESCE(p.amount, d.amount) - COALESCE(f.amount, 0) - COALESCE(commission.amount, 0), 0)
             ELSE d.amount + d.transfer_fee
           END
         ), 0)::numeric AS reserved
         FROM disbursements d
         LEFT JOIN payment_links p ON p.id = d.refund_payment_id
         LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
         LEFT JOIN downline_commissions commission ON commission.payment_id = p.id
         WHERE d.merchant_email = $1
           AND d.status NOT IN ('EXECUTED', 'SUCCESS', 'COMPLETED', 'REJECTED', 'ERROR', 'FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REVERSED')
       )
       SELECT ledger.balance::float8 AS balance,
         ledger.collection_credits::float8 AS collection_credits,
         collections.completed_krw::float8 AS completed_krw,
         reservations.reserved::float8 AS reserved
       FROM ledger CROSS JOIN collections CROSS JOIN reservations`,
      [merchantEmail],
    )
    return result.rows[0]
  }

  async function chargeMerchantActivationFee(
    merchantEmail,
    transactionClient = null,
  ) {
    const ownsClient = !transactionClient
    const client = transactionClient || (await pool.connect())
    try {
      if (ownsClient) await client.query("BEGIN")
      const account = await client.query(
        "SELECT email FROM merchant_accounts WHERE email = $1 FOR UPDATE",
        [merchantEmail],
      )
      if (!account.rowCount) {
        if (ownsClient) await client.query("COMMIT")
        return { paid: false, amount: 0, availableBalance: 0 }
      }
      const existingFee = await client.query(
        `SELECT amount FROM merchant_wallet_ledger
         WHERE merchant_email = $1 AND source_type = 'ACTIVATION_FEE'
         LIMIT 1`,
        [merchantEmail],
      )
      if (existingFee.rowCount) {
        if (ownsClient) await client.query("COMMIT")
        return {
          paid: true,
          amount: Math.abs(Number(existingFee.rows[0].amount)),
          availableBalance: null,
        }
      }
      const feeSetting = await client.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'agreement_activation_fee'",
      )
      const activationFee = Number(feeSetting.rows[0]?.setting_value ?? 5000)
      if (
        !Number.isFinite(activationFee) ||
        activationFee < 0 ||
        Math.abs(activationFee * 100 - Math.round(activationFee * 100)) > 1e-7
      ) {
        throw new Error("The configured merchant activation fee is invalid.")
      }
      const wallet = await client.query(
        `WITH ledger AS (
          SELECT (
            COALESCE((SELECT SUM(amount) FROM merchant_wallet_ledger WHERE merchant_email = $1), 0) +
            COALESCE((SELECT SUM(amount) FROM merchant_wallet_adjustments WHERE merchant_email = $1), 0)
          )::numeric AS balance
        ), reservations AS (
           SELECT COALESCE(SUM(
             CASE WHEN d.refund_payment_id IS NOT NULL
               THEN GREATEST(COALESCE(p.amount, d.amount) - COALESCE(f.amount, 0) - COALESCE(commission.amount, 0), 0)
               ELSE d.amount + d.transfer_fee
             END
           ), 0)::numeric AS reserved
           FROM disbursements d
           LEFT JOIN payment_links p ON p.id = d.refund_payment_id
           LEFT JOIN platform_fee_ledger f
             ON f.source_type = 'COLLECTION' AND f.source_id = p.id
           LEFT JOIN downline_commissions commission ON commission.payment_id = p.id
           WHERE d.merchant_email = $1
             AND d.status NOT IN ('EXECUTED', 'SUCCESS', 'COMPLETED', 'REJECTED',
               'ERROR', 'FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REVERSED')
         )
         SELECT ledger.balance::numeric AS balance,
           reservations.reserved::numeric AS reserved
         FROM ledger CROSS JOIN reservations`,
        [merchantEmail],
      )
      const availableBalance =
        Math.round(
          (Number(wallet.rows[0]?.balance || 0) -
            Number(wallet.rows[0]?.reserved || 0)) *
            100,
        ) / 100
      if (availableBalance + 0.000001 < activationFee) {
        if (ownsClient) await client.query("COMMIT")
        return { paid: false, amount: activationFee, availableBalance }
      }
      const sourceId = randomUUID()
      await client.query(
        `INSERT INTO merchant_wallet_ledger
           (id, merchant_email, source_type, source_id, amount, reference_no)
         VALUES ($1, $2, 'ACTIVATION_FEE', $3, $4, $5)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [
          randomUUID(),
          merchantEmail,
          sourceId,
          (-activationFee).toFixed(2),
          "DRPAY-ACTIVATION",
        ],
      )
      await client.query(
        `INSERT INTO platform_fee_ledger
           (id, source_type, source_id, merchant_email, amount)
         VALUES ($1, 'ACTIVATION_FEE', $2, $3, $4)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [randomUUID(), sourceId, merchantEmail, activationFee.toFixed(2)],
      )
      if (ownsClient) await client.query("COMMIT")
      return { paid: true, amount: activationFee, availableBalance }
    } catch (error) {
      if (ownsClient) await client.query("ROLLBACK")
      throw error
    } finally {
      if (ownsClient) client.release()
    }
  }

  async function settleSuccessfulCollection(
    paymentId,
    transactionClient = null,
  ) {
    const ownsClient = !transactionClient
    const client = transactionClient || (await pool.connect())
    try {
      if (ownsClient) await client.query("BEGIN")
      const payment = await client.query(
        `SELECT id, merchant_email, reference_no, amount::numeric AS amount, status
         FROM payment_links WHERE id = $1 FOR UPDATE`,
        [paymentId],
      )
      const row = payment.rows[0]
      if (
        !row ||
        !isSuccessfulPaymentStatus(row.status) ||
        !row.merchant_email
      ) {
        if (ownsClient) await client.query("COMMIT")
        return
      }
      const feeSetting = await client.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'collection_fee_percent'",
      )
      const feeAmount = calculateCollectionFee(
        row.amount,
        feeSetting.rows[0]?.setting_value || 0,
      )
      await client.query(
        `INSERT INTO platform_fee_ledger (id, source_type, source_id, merchant_email, amount)
         VALUES ($1, 'COLLECTION', $2, $3, $4)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [randomUUID(), paymentId, row.merchant_email, feeAmount.toFixed(2)],
      )
      const fee = await client.query(
        "SELECT amount FROM platform_fee_ledger WHERE source_type = 'COLLECTION' AND source_id = $1",
        [paymentId],
      )
      const netAmount = Math.max(
        0,
        Math.round((Number(row.amount) - Number(fee.rows[0].amount)) * 100) /
          100,
      )
      const commissionResult = await client.query(
        `SELECT referrer_email, amount::numeric AS amount
         FROM downline_commissions WHERE payment_id = $1 FOR UPDATE`,
        [paymentId],
      )
      let commissionAmount = 0
      let referral = commissionResult.rows[0]
      if (!referral) {
        const account = await client.query(
          `SELECT referred_by_email, downline_commission_rate::float8 AS rate
           FROM merchant_accounts WHERE email = $1 FOR UPDATE`,
          [row.merchant_email],
        )
        const rate = Number(account.rows[0]?.rate || 0)
        const referrerEmail = account.rows[0]?.referred_by_email
        commissionAmount = referrerEmail
          ? calculateDownlineCommission(netAmount, rate)
          : 0
        if (referrerEmail) {
          const inserted = await client.query(
            `INSERT INTO downline_commissions
               (id, payment_id, referrer_email, downline_email, rate, amount)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (payment_id) DO NOTHING
             RETURNING referrer_email, amount::numeric AS amount`,
            [
              randomUUID(),
              paymentId,
              referrerEmail,
              row.merchant_email,
              rate.toFixed(2),
              commissionAmount.toFixed(2),
            ],
          )
          referral =
            inserted.rows[0] ||
            (
              await client.query(
                `SELECT referrer_email, amount::numeric AS amount
                 FROM downline_commissions WHERE payment_id = $1 FOR UPDATE`,
                [paymentId],
              )
            ).rows[0]
        }
      }
      if (referral) commissionAmount = Number(referral.amount)
      const merchantCredit = Math.max(
        0,
        Math.round((netAmount - commissionAmount) * 100) / 100,
      )
      await client.query(
        `INSERT INTO merchant_wallet_ledger (id, merchant_email, source_type, source_id, amount, reference_no)
         VALUES ($1, $2, 'COLLECTION', $3, $4, $5)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [
          randomUUID(),
          row.merchant_email,
          paymentId,
          merchantCredit.toFixed(2),
          row.reference_no,
        ],
      )
      if (referral && commissionAmount > 0) {
        await client.query(
          `INSERT INTO merchant_wallet_ledger
             (id, merchant_email, source_type, source_id, amount, reference_no)
           VALUES ($1, $2, 'DOWNLINE_COMMISSION', $3, $4, $5)
           ON CONFLICT (source_type, source_id) DO NOTHING`,
          [
            randomUUID(),
            referral.referrer_email,
            paymentId,
            commissionAmount.toFixed(2),
            row.reference_no,
          ],
        )
      }
      await chargeMerchantActivationFee(row.merchant_email, client)
      if (ownsClient) await client.query("COMMIT")
    } catch (error) {
      if (ownsClient) await client.query("ROLLBACK")
      throw error
    } finally {
      if (ownsClient) client.release()
    }
  }

  async function updateDisbursementStatus(
    id,
    swiftpayId,
    status,
    errorMessage,
  ) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const updated = await client.query(
        `UPDATE disbursements
         SET swiftpay_id = COALESCE($1, swiftpay_id), status = $2, error_message = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING refund_payment_id, merchant_email, amount, transfer_fee, merchant_reference_no`,
        [swiftpayId, status, errorMessage, id],
      )
      const successful = isSuccessfulDisbursementStatus(status)
      const refundPaymentId = updated.rows[0]?.refund_payment_id
      if (successful && updated.rows[0]?.merchant_email) {
        const walletAmount = refundPaymentId
          ? await client.query(
              `SELECT GREATEST(p.amount - COALESCE(f.amount, 0) - COALESCE(commission.amount, 0), 0)::numeric AS amount
             FROM payment_links p
             LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
             LEFT JOIN downline_commissions commission ON commission.payment_id = p.id
             WHERE p.id = $1`,
              [refundPaymentId],
            )
          : null
        const amount = refundPaymentId
          ? -Number(walletAmount.rows[0]?.amount || 0)
          : -calculateTransferDebit(
              updated.rows[0].amount,
              updated.rows[0].transfer_fee || 0,
            )
        await client.query(
          `INSERT INTO merchant_wallet_ledger (id, merchant_email, source_type, source_id, amount, reference_no)
           VALUES ($1, $2, 'DISBURSEMENT', $3, $4, $5)
           ON CONFLICT (source_type, source_id) DO NOTHING`,
          [
            randomUUID(),
            updated.rows[0].merchant_email,
            id,
            amount.toFixed(2),
            updated.rows[0].merchant_reference_no,
          ],
        )
        const transferFee = Number(updated.rows[0].transfer_fee || 0)
        if (!refundPaymentId && transferFee > 0) {
          await client.query(
            `INSERT INTO platform_fee_ledger (id, source_type, source_id, merchant_email, amount)
             VALUES ($1, 'DISBURSEMENT', $2, $3, $4)
             ON CONFLICT (source_type, source_id) DO NOTHING`,
            [
              randomUUID(),
              id,
              updated.rows[0].merchant_email,
              transferFee.toFixed(2),
            ],
          )
        }
      }
      if (successful && refundPaymentId) {
        const payment = await client.query(
          `SELECT p.reference_no, p.amount::numeric AS amount,
             COALESCE(f.amount, 0)::numeric AS fee_amount,
               d.merchant_reference_no, d.refund_ledger_reversed_at,
               COALESCE((SELECT commission.amount FROM downline_commissions commission
                 WHERE commission.payment_id = p.id), 0)::numeric AS commission_amount,
               (SELECT commission.referrer_email FROM downline_commissions commission
                 WHERE commission.payment_id = p.id) AS referrer_email
           FROM payment_links p
           JOIN disbursements d ON d.id = $2
           LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
           WHERE p.id = $1
           FOR UPDATE OF d`,
          [refundPaymentId, id],
        )
        const row = payment.rows[0]
        if (!row)
          throw new Error("Refund settlement references a missing collection.")
        if (!row.refund_ledger_reversed_at) {
          calculateRefundLedgerReversal(
            row.amount,
            Number(row.fee_amount) + Number(row.commission_amount),
          )
          await client.query(
            "UPDATE disbursements SET refund_ledger_reversed_at = NOW() WHERE id = $1",
            [id],
          )
          if (Number(row.commission_amount) > 0 && row.referrer_email) {
            await client.query(
              `INSERT INTO merchant_wallet_ledger
                 (id, merchant_email, source_type, source_id, amount, reference_no)
               VALUES ($1, $2, 'DOWNLINE_COMMISSION_REVERSAL', $3, $4, $5)
               ON CONFLICT (source_type, source_id) DO NOTHING`,
              [
                randomUUID(),
                row.referrer_email,
                id,
                (-Number(row.commission_amount)).toFixed(2),
                row.merchant_reference_no,
              ],
            )
            await client.query(
              `UPDATE downline_commissions SET reversed_at = NOW()
               WHERE payment_id = $1 AND reversed_at IS NULL`,
              [refundPaymentId],
            )
          }
        }
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    await queueSuccessfulTransaction("DISBURSEMENT", id)
    await queueTransactionWebhook("DISBURSEMENT", id)
  }

  return {
    chargeMerchantActivationFee,
    getMerchantWalletState,
    settleSuccessfulCollection,
    updateDisbursementStatus,
  }
}

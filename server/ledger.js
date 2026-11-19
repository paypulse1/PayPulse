import { randomUUID } from "node:crypto"
import { postBalancedJournal } from "./accounting.js"
import {
  addMinorUnits,
  formatMinorUnits,
  minorUnitsToNumber,
  multiplyMinorUnitsByPercent,
  parseMinorUnits,
  subtractMinorUnits,
} from "./money.js"

export const PLATFORM_FEE_LEDGER_SOURCE_TYPES = [
  "COLLECTION",
  "FLOATING_TRANSFER",
  "DISBURSEMENT",
  "DISBURSEMENT_REVERSAL",
  "ACTIVATION_FEE",
]
export const MAX_DOWNLINE_COMMISSION_PERCENT = 20

const successfulPaymentStatuses = new Set(["EXECUTED", "MANUALLY_PAID"])
const successfulDisbursementStatuses = new Set([
  "EXECUTED",
  "SUCCESS",
  "COMPLETED",
])
const terminalDisbursementStatuses = new Set([
  ...successfulDisbursementStatuses,
  "REJECTED",
  "ERROR",
  "FAILED",
  "CANCELED",
  "CANCELLED",
  "EXPIRED",
  "REVERSED",
])

export function isSuccessfulPaymentStatus(status) {
  return successfulPaymentStatuses.has(String(status || "").toUpperCase())
}

export function isSuccessfulDisbursementStatus(status) {
  return successfulDisbursementStatuses.has(String(status || "").toUpperCase())
}

export function isTerminalDisbursementStatus(status) {
  return terminalDisbursementStatuses.has(String(status || "").toUpperCase())
}

export function calculateCollectionFee(amount, feePercent) {
  let grossAmount
  let percent
  try {
    grossAmount = parseMinorUnits(amount)
  } catch {
    throw new Error("The collection amount is invalid.")
  }
  try {
    percent = parseMinorUnits(feePercent)
  } catch {
    throw new Error("The configured collection fee percentage is invalid.")
  }
  if (grossAmount <= 0n) {
    throw new Error("The collection amount is invalid.")
  }
  if (percent < 0n || percent > 10_000n) {
    throw new Error("The configured collection fee percentage is invalid.")
  }
  return minorUnitsToNumber(multiplyMinorUnitsByPercent(grossAmount, feePercent))
}

export function calculateDownlineCommission(netAmount, commissionPercent) {
  let amount
  let percent
  try {
    amount = parseMinorUnits(netAmount)
  } catch {
    throw new Error("The downline collection amount is invalid.")
  }
  try {
    percent = parseMinorUnits(commissionPercent)
  } catch {
    throw new Error("The configured downline commission percentage is invalid.")
  }
  if (amount < 0n) {
    throw new Error("The downline collection amount is invalid.")
  }
  if (percent < 0n || percent > BigInt(MAX_DOWNLINE_COMMISSION_PERCENT * 100)) {
    throw new Error("The configured downline commission percentage is invalid.")
  }
  return minorUnitsToNumber(
    multiplyMinorUnitsByPercent(amount, commissionPercent),
  )
}

export function calculateTransferDebit(amount, feeAmount) {
  let transferAmount
  let fee
  try {
    transferAmount = parseMinorUnits(amount)
    fee = parseMinorUnits(feeAmount)
  } catch {
    throw new Error("The transfer amount or configured fee is invalid.")
  }
  if (transferAmount <= 0n) {
    throw new Error("The transfer amount is invalid.")
  }
  if (fee < 0n) {
    throw new Error("The configured transfer fee is invalid.")
  }
  return minorUnitsToNumber(addMinorUnits(transferAmount, fee))
}

export function calculateRefundLedgerReversal(amount, feeAmount) {
  let netAmount
  try {
    netAmount = subtractMinorUnits(
      parseMinorUnits(amount),
      parseMinorUnits(feeAmount),
    )
  } catch {
    throw new Error("The collection refund ledger amount is invalid.")
  }
  if (netAmount < 0n) {
    throw new Error("The collection refund ledger amount is invalid.")
  }
  return minorUnitsToNumber(netAmount)
}

export function calculateTransferRequestAvailableBalance(balance, reserved) {
  let postedBalance
  let reservedAmount
  try {
    postedBalance = parseMinorUnits(balance)
    reservedAmount = parseMinorUnits(reserved)
  } catch {
    throw new Error("The floating-balance totals are invalid.")
  }
  if (reservedAmount < 0n) {
    throw new Error("The floating-balance totals are invalid.")
  }
  return minorUnitsToNumber(subtractMinorUnits(postedBalance, reservedAmount))
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
       SELECT        ledger.balance::text AS balance_exact,
         ledger.balance::float8 AS balance,
         ledger.collection_credits::float8 AS collection_credits,
         collections.completed_krw::float8 AS completed_krw,
         reservations.reserved::text AS reserved_exact,
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
          amount: Math.abs(
            minorUnitsToNumber(parseMinorUnits(existingFee.rows[0].amount)),
          ),
          availableBalance: null,
        }
      }
      const feeSetting = await client.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'agreement_activation_fee'",
      )
      let activationFee
      try {
        activationFee = parseMinorUnits(
          feeSetting.rows[0]?.setting_value ?? "5000",
        )
      } catch {
        throw new Error("The configured merchant activation fee is invalid.")
      }
      if (activationFee < 0n) {
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
      const availableBalance = subtractMinorUnits(
        parseMinorUnits(wallet.rows[0]?.balance || "0"),
        parseMinorUnits(wallet.rows[0]?.reserved || "0"),
      )
      if (availableBalance < activationFee) {
        if (ownsClient) await client.query("COMMIT")
        return {
          paid: false,
          amount: minorUnitsToNumber(activationFee),
          availableBalance: minorUnitsToNumber(availableBalance),
        }
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
          formatMinorUnits(-activationFee),
          "PayPulse-ACTIVATION",
        ],
      )
      await client.query(
        `INSERT INTO platform_fee_ledger
           (id, source_type, source_id, merchant_email, amount)
         VALUES ($1, 'ACTIVATION_FEE', $2, $3, $4)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [randomUUID(), sourceId, merchantEmail, formatMinorUnits(activationFee)],
      )
      await postBalancedJournal(client, {
        sourceType: "ACTIVATION_FEE",
        sourceId,
        reference: "PayPulse-ACTIVATION",
        lines: [
          {
            accountCode: "MERCHANT_PAYABLE",
            side: "debit",
            amount: formatMinorUnits(activationFee),
          },
          {
            accountCode: "PLATFORM_FEE_REVENUE",
            side: "credit",
            amount: formatMinorUnits(activationFee),
          },
        ],
      })
      if (ownsClient) await client.query("COMMIT")
      return {
        paid: true,
        amount: minorUnitsToNumber(activationFee),
        availableBalance: minorUnitsToNumber(availableBalance),
      }
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
      const grossAmount = parseMinorUnits(row.amount)
      let feePercent
      try {
        feePercent = parseMinorUnits(
          feeSetting.rows[0]?.setting_value || "0",
        )
      } catch {
        throw new Error("The configured collection fee percentage is invalid.")
      }
      if (feePercent < 0n || feePercent > 10_000n) {
        throw new Error("The configured collection fee percentage is invalid.")
      }
      const feeAmount = multiplyMinorUnitsByPercent(
        grossAmount,
        feePercent,
      )
      await client.query(
        `INSERT INTO platform_fee_ledger (id, source_type, source_id, merchant_email, amount)
         VALUES ($1, 'COLLECTION', $2, $3, $4)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [randomUUID(), paymentId, row.merchant_email, formatMinorUnits(feeAmount)],
      )
      const fee = await client.query(
        "SELECT amount FROM platform_fee_ledger WHERE source_type = 'COLLECTION' AND source_id = $1",
        [paymentId],
      )
      const netAmount =
        subtractMinorUnits(grossAmount, parseMinorUnits(fee.rows[0].amount)) > 0n
          ? subtractMinorUnits(grossAmount, parseMinorUnits(fee.rows[0].amount))
          : 0n
      const commissionResult = await client.query(
        `SELECT referrer_email, amount::numeric AS amount
         FROM downline_commissions WHERE payment_id = $1 FOR UPDATE`,
        [paymentId],
      )
      let commissionAmount = 0n
      let referral = commissionResult.rows[0]
      if (!referral) {
        const account = await client.query(
          `SELECT referred_by_email, downline_commission_rate::numeric AS rate
           FROM merchant_accounts WHERE email = $1 FOR UPDATE`,
          [row.merchant_email],
        )
        const rate = account.rows[0]?.rate || "0"
        const referrerEmail = account.rows[0]?.referred_by_email
        commissionAmount = referrerEmail
          ? multiplyMinorUnitsByPercent(netAmount, rate)
          : 0n
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
              rate,
              formatMinorUnits(commissionAmount),
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
      if (referral) commissionAmount = parseMinorUnits(referral.amount)
      const merchantCredit =
        subtractMinorUnits(netAmount, commissionAmount) > 0n
          ? subtractMinorUnits(netAmount, commissionAmount)
          : 0n
      await client.query(
        `INSERT INTO merchant_wallet_ledger (id, merchant_email, source_type, source_id, amount, reference_no)
         VALUES ($1, $2, 'COLLECTION', $3, $4, $5)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [
          randomUUID(),
          row.merchant_email,
          paymentId,
          formatMinorUnits(merchantCredit),
          row.reference_no,
        ],
      )
      if (referral && commissionAmount > 0n) {
        await client.query(
          `INSERT INTO merchant_wallet_ledger
             (id, merchant_email, source_type, source_id, amount, reference_no)
           VALUES ($1, $2, 'DOWNLINE_COMMISSION', $3, $4, $5)
           ON CONFLICT (source_type, source_id) DO NOTHING`,
          [
            randomUUID(),
            referral.referrer_email,
            paymentId,
            formatMinorUnits(commissionAmount),
            row.reference_no,
          ],
        )
      }
      await chargeMerchantActivationFee(row.merchant_email, client)
      const journalLines = [
        {
          accountCode: "SWIFTPAY_CLEARING",
          side: "debit",
          amount: formatMinorUnits(grossAmount),
        },
        ...(merchantCredit > 0n
          ? [
              {
                accountCode: "MERCHANT_PAYABLE",
                side: "credit",
                amount: formatMinorUnits(merchantCredit),
              },
            ]
          : []),
        ...(commissionAmount > 0n
          ? [
              {
                accountCode: "REFERRER_PAYABLE",
                side: "credit",
                amount: formatMinorUnits(commissionAmount),
              },
            ]
          : []),
        ...(parseMinorUnits(fee.rows[0].amount) > 0n
          ? [
              {
                accountCode: "PLATFORM_FEE_REVENUE",
                side: "credit",
                amount: formatMinorUnits(
                  parseMinorUnits(fee.rows[0].amount),
                ),
              },
            ]
          : []),
      ]
      await postBalancedJournal(client, {
        sourceType: "COLLECTION",
        sourceId: paymentId,
        reference: row.reference_no,
        lines: journalLines,
      })
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
    const nextStatus = String(status || "").toUpperCase()
    const client = await pool.connect()
    let shouldDispatch = false
    try {
      await client.query("BEGIN")
      const current = await client.query(
        "SELECT status, merchant_email FROM disbursements WHERE id = $1 FOR UPDATE",
        [id],
      )
      const currentStatus = String(current.rows[0]?.status || "").toUpperCase()
      if (!current.rowCount) {
        await client.query("COMMIT")
        return
      }
      const wasSuccessful = isSuccessfulDisbursementStatus(currentStatus)
      const isRetryingReversal =
        currentStatus === "REVERSED" && nextStatus === "REVERSED"
      let hadSettledDebit = wasSuccessful
      if (isRetryingReversal) {
        const settledDebit = await client.query(
          `SELECT id FROM merchant_wallet_ledger
           WHERE source_type = 'DISBURSEMENT' AND source_id = $1
             AND merchant_email = $2`,
          [id, current.rows[0].merchant_email],
        )
        hadSettledDebit = settledDebit.rowCount > 0
      }
      const isReversingSettlement =
        nextStatus === "REVERSED" && hadSettledDebit
      if (
        (currentStatus === "REVERSED" && !isRetryingReversal) ||
        (isTerminalDisbursementStatus(currentStatus) &&
          currentStatus !== nextStatus &&
          !isReversingSettlement)
      ) {
        await client.query("COMMIT")
        return
      }
      const updated = await client.query(
        `UPDATE disbursements
         SET swiftpay_id = COALESCE($1, swiftpay_id), status = $2, error_message = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING refund_payment_id, merchant_email, amount, transfer_fee, merchant_reference_no`,
        [swiftpayId, nextStatus, errorMessage, id],
      )
      if (!updated.rowCount) {
        await client.query("COMMIT")
        return
      }
      shouldDispatch = currentStatus !== nextStatus
      const successful = isSuccessfulDisbursementStatus(nextStatus)
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
          ? -parseMinorUnits(walletAmount.rows[0]?.amount || "0")
          : -addMinorUnits(
              parseMinorUnits(updated.rows[0].amount),
              parseMinorUnits(updated.rows[0].transfer_fee || "0"),
            )
        await client.query(
          `INSERT INTO merchant_wallet_ledger (id, merchant_email, source_type, source_id, amount, reference_no)
           VALUES ($1, $2, 'DISBURSEMENT', $3, $4, $5)
           ON CONFLICT (source_type, source_id) DO NOTHING`,
          [
            randomUUID(),
            updated.rows[0].merchant_email,
            id,
            formatMinorUnits(amount),
            updated.rows[0].merchant_reference_no,
          ],
        )
        const transferFee = parseMinorUnits(
          updated.rows[0].transfer_fee || "0",
        )
        if (!refundPaymentId) {
          const payoutAmount = parseMinorUnits(updated.rows[0].amount)
          const payoutLines = [
            {
              accountCode: "MERCHANT_PAYABLE",
              side: "debit",
              amount: formatMinorUnits(addMinorUnits(payoutAmount, transferFee)),
            },
            {
              accountCode: "BANK_CLEARING",
              side: "credit",
              amount: formatMinorUnits(payoutAmount),
            },
            ...(transferFee > 0n
              ? [
                  {
                    accountCode: "PLATFORM_FEE_REVENUE",
                    side: "credit",
                    amount: formatMinorUnits(transferFee),
                  },
                ]
              : []),
          ]
          await postBalancedJournal(client, {
            sourceType: "DISBURSEMENT",
            sourceId: id,
            reference: updated.rows[0].merchant_reference_no,
            lines: payoutLines,
          })
        }
        if (!refundPaymentId && transferFee > 0n) {
          await client.query(
            `INSERT INTO platform_fee_ledger (id, source_type, source_id, merchant_email, amount)
             VALUES ($1, 'DISBURSEMENT', $2, $3, $4)
             ON CONFLICT (source_type, source_id) DO NOTHING`,
            [
              randomUUID(),
              id,
              updated.rows[0].merchant_email,
              formatMinorUnits(transferFee),
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
            formatMinorUnits(
              addMinorUnits(
                parseMinorUnits(row.fee_amount),
                parseMinorUnits(row.commission_amount),
              ),
            ),
          )
          await client.query(
            "UPDATE disbursements SET refund_ledger_reversed_at = NOW() WHERE id = $1",
            [id],
          )
          if (parseMinorUnits(row.commission_amount) > 0n && row.referrer_email) {
            await client.query(
              `INSERT INTO merchant_wallet_ledger
                 (id, merchant_email, source_type, source_id, amount, reference_no)
               VALUES ($1, $2, 'DOWNLINE_COMMISSION_REVERSAL', $3, $4, $5)
               ON CONFLICT (source_type, source_id) DO NOTHING`,
              [
                randomUUID(),
                row.referrer_email,
                id,
                formatMinorUnits(-parseMinorUnits(row.commission_amount)),
                row.merchant_reference_no,
              ],
            )
            await client.query(
              `UPDATE downline_commissions SET reversed_at = NOW()
               WHERE payment_id = $1 AND reversed_at IS NULL`,
              [refundPaymentId],
            )
          }
          const refundGross = parseMinorUnits(row.amount)
          const refundFee = parseMinorUnits(row.fee_amount)
          const refundCommission = parseMinorUnits(row.commission_amount)
          const refundMerchantNet = subtractMinorUnits(
            subtractMinorUnits(refundGross, refundFee),
            refundCommission,
          )
          await postBalancedJournal(client, {
            sourceType: "DISBURSEMENT",
            sourceId: id,
            reference: row.merchant_reference_no,
            lines: [
              ...(refundMerchantNet > 0n
                ? [
                    {
                      accountCode: "MERCHANT_PAYABLE",
                      side: "debit",
                      amount: formatMinorUnits(refundMerchantNet),
                    },
                  ]
                : []),
              ...(refundCommission > 0n
                ? [
                    {
                      accountCode: "REFERRER_PAYABLE",
                      side: "debit",
                      amount: formatMinorUnits(refundCommission),
                    },
                  ]
                : []),
              ...(refundFee > 0n
                ? [
                    {
                      accountCode: "PLATFORM_FEE_REVENUE",
                      side: "debit",
                      amount: formatMinorUnits(refundFee),
                    },
                  ]
                : []),
              {
                accountCode: "BANK_CLEARING",
                side: "credit",
                amount: formatMinorUnits(refundGross),
              },
            ],
          })
        }
      }
      if (isReversingSettlement && updated.rows[0]?.merchant_email) {
        if (refundPaymentId) {
          const refund = await client.query(
            `SELECT p.amount::numeric AS gross_amount,
               COALESCE(f.amount, 0)::numeric AS fee_amount,
               GREATEST(p.amount - COALESCE(f.amount, 0) - COALESCE(commission.amount, 0), 0)::numeric AS net_amount,
               COALESCE(commission.amount, 0)::numeric AS commission_amount,
               commission.referrer_email
             FROM payment_links p
             LEFT JOIN platform_fee_ledger f
               ON f.source_type = 'COLLECTION' AND f.source_id = p.id
             LEFT JOIN downline_commissions commission
               ON commission.payment_id = p.id
             WHERE p.id = $1`,
            [refundPaymentId],
          )
          const refundRow = refund.rows[0]
          if (!refundRow)
            throw new Error("Refund reversal references a missing collection.")
          await client.query(
            `INSERT INTO merchant_wallet_ledger
               (id, merchant_email, source_type, source_id, amount, reference_no)
             VALUES ($1, $2, 'DISBURSEMENT_REVERSAL', $3, $4, $5)
             ON CONFLICT (source_type, source_id) DO NOTHING`,
            [
              randomUUID(),
              updated.rows[0].merchant_email,
              id,
              formatMinorUnits(parseMinorUnits(refundRow.net_amount)),
              updated.rows[0].merchant_reference_no,
            ],
          )
          if (
            parseMinorUnits(refundRow.commission_amount) > 0n &&
            refundRow.referrer_email
          ) {
            await client.query(
              `INSERT INTO merchant_wallet_ledger
                 (id, merchant_email, source_type, source_id, amount, reference_no)
               VALUES ($1, $2, 'DOWNLINE_COMMISSION_RESTORATION', $3, $4, $5)
               ON CONFLICT (source_type, source_id) DO NOTHING`,
              [
                randomUUID(),
                refundRow.referrer_email,
                id,
                formatMinorUnits(parseMinorUnits(refundRow.commission_amount)),
                updated.rows[0].merchant_reference_no,
              ],
            )
            await client.query(
              `UPDATE downline_commissions SET reversed_at = NULL
               WHERE payment_id = $1`,
              [refundPaymentId],
            )
          }
          const refundGross = parseMinorUnits(refundRow.gross_amount)
          const refundFee = parseMinorUnits(refundRow.fee_amount)
          const refundCommission = parseMinorUnits(
            refundRow.commission_amount,
          )
          const refundMerchantNet = parseMinorUnits(refundRow.net_amount)
          await postBalancedJournal(client, {
            sourceType: "DISBURSEMENT_REVERSAL",
            sourceId: id,
            reference: updated.rows[0].merchant_reference_no,
            lines: [
              {
                accountCode: "BANK_CLEARING",
                side: "debit",
                amount: formatMinorUnits(refundGross),
              },
              ...(refundMerchantNet > 0n
                ? [
                    {
                      accountCode: "MERCHANT_PAYABLE",
                      side: "credit",
                      amount: formatMinorUnits(refundMerchantNet),
                    },
                  ]
                : []),
              ...(refundCommission > 0n
                ? [
                    {
                      accountCode: "REFERRER_PAYABLE",
                      side: "credit",
                      amount: formatMinorUnits(refundCommission),
                    },
                  ]
                : []),
              ...(refundFee > 0n
                ? [
                    {
                      accountCode: "PLATFORM_FEE_REVENUE",
                      side: "credit",
                      amount: formatMinorUnits(refundFee),
                    },
                  ]
                : []),
            ],
          })
        } else {
          const transferFee = parseMinorUnits(
            updated.rows[0].transfer_fee || "0",
          )
          const restoredAmount = addMinorUnits(
            parseMinorUnits(updated.rows[0].amount),
            transferFee,
          )
          await client.query(
            `INSERT INTO merchant_wallet_ledger
               (id, merchant_email, source_type, source_id, amount, reference_no)
             VALUES ($1, $2, 'DISBURSEMENT_REVERSAL', $3, $4, $5)
             ON CONFLICT (source_type, source_id) DO NOTHING`,
            [
              randomUUID(),
              updated.rows[0].merchant_email,
              id,
              formatMinorUnits(restoredAmount),
              updated.rows[0].merchant_reference_no,
            ],
          )
          if (transferFee > 0n) {
            await client.query(
              `INSERT INTO platform_fee_ledger
                 (id, source_type, source_id, merchant_email, amount)
               VALUES ($1, 'DISBURSEMENT_REVERSAL', $2, $3, $4)
               ON CONFLICT (source_type, source_id) DO NOTHING`,
              [
                randomUUID(),
                id,
                updated.rows[0].merchant_email,
                formatMinorUnits(-transferFee),
              ],
            )
          }
          await postBalancedJournal(client, {
            sourceType: "DISBURSEMENT_REVERSAL",
            sourceId: id,
            reference: updated.rows[0].merchant_reference_no,
            lines: [
              {
                accountCode: "BANK_CLEARING",
                side: "debit",
                amount: formatMinorUnits(
                  parseMinorUnits(updated.rows[0].amount),
                ),
              },
              ...(transferFee > 0n
                ? [
                    {
                      accountCode: "PLATFORM_FEE_REVENUE",
                      side: "debit",
                      amount: formatMinorUnits(transferFee),
                    },
                  ]
                : []),
              {
                accountCode: "MERCHANT_PAYABLE",
                side: "credit",
                amount: formatMinorUnits(restoredAmount),
              },
            ],
          })
        }
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    if (!shouldDispatch) return
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

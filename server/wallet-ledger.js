export function calculateMerchantAvailableBalance(balance, reserved) {
  const postedBalance = Number(balance)
  const reservedBalance = Number(reserved)
  if (
    !Number.isFinite(postedBalance) ||
    !Number.isFinite(reservedBalance) ||
    reservedBalance < 0
  ) {
    throw new Error("Merchant wallet totals are invalid.")
  }
  return Math.round((postedBalance - reservedBalance) * 100) / 100
}

export async function getMerchantWalletState(db, merchantEmail) {
  const result = await db.query(
    `WITH ledger AS (
       SELECT COALESCE(SUM(amount), 0)::numeric AS balance,
         COALESCE(SUM(amount) FILTER (WHERE source_type = 'COLLECTION'), 0)::numeric AS collection_credits
       FROM merchant_wallet_ledger
       WHERE merchant_email = $1
     ), collections AS (
       SELECT COALESCE(SUM(collection_amount_krw), 0)::numeric AS completed_krw
       FROM payment_links
       WHERE merchant_email = $1
         AND status IN ('EXECUTED', 'MANUALLY_PAID')
         AND collection_amount_krw IS NOT NULL
     ), reservations AS (
       SELECT COALESCE(SUM(
         CASE WHEN d.refund_payment_id IS NOT NULL
           THEN GREATEST(COALESCE(p.amount, d.amount) - COALESCE(f.amount, 0), 0)
           ELSE d.amount
         END
       ), 0)::numeric AS reserved
       FROM disbursements d
       LEFT JOIN payment_links p
         ON p.id = d.refund_payment_id AND p.merchant_email = d.merchant_email
       LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
       WHERE d.merchant_email = $1
         AND d.status NOT IN (
           'EXECUTED', 'SUCCESS', 'COMPLETED', 'REJECTED', 'ERROR', 'FAILED',
           'CANCELED', 'CANCELLED', 'EXPIRED', 'REVERSED'
         )
     )
     SELECT ledger.balance::float8 AS balance,
       ledger.collection_credits::float8 AS collection_credits,
       collections.completed_krw::float8 AS completed_krw,
       reservations.reserved::float8 AS reserved
     FROM ledger CROSS JOIN collections CROSS JOIN reservations`,
    [merchantEmail],
  )
  if (!result.rows[0]) throw new Error("Merchant wallet totals are unavailable.")
  return result.rows[0]
}

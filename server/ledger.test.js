import { describe, expect, it, vi } from "vitest"
import {
  calculateCollectionFee,
  calculateDownlineCommission,
  calculateRefundLedgerReversal,
  calculateTransferDebit,
  calculateTransferRequestAvailableBalance,
  createLedgerService,
  PLATFORM_FEE_LEDGER_SOURCE_TYPES,
} from "./ledger.js"
import { createFloatingTransferRequest } from "./floating-transfers.js"
import {
  hasApiKeyPermission,
  isMerchantSession,
  isOperationsSession,
} from "./access.js"
import {
  canManuallyConfirmPayment,
  createPaymentStateService,
} from "./payment-state.js"
import {
  formatMinorUnits,
  multiplyMinorUnitsByPercent,
  parseMinorUnits,
} from "./money.js"

function createClient(respond) {
  const calls = []
  const client = {
    query: vi.fn(async (sql, parameters = []) => {
      calls.push({ sql, parameters })
      return respond(sql, parameters)
    }),
    release: vi.fn(),
  }
  return { client, calls }
}

describe("ledger calculations", () => {
  it("uses integer cents for money parsing and percentage rounding", () => {
    expect(parseMinorUnits("0.30")).toBe(30n)
    expect(formatMinorUnits(parseMinorUnits("-0.01"))).toBe("-0.01")
    expect(multiplyMinorUnitsByPercent(10n, "10")).toBe(1n)
    expect(multiplyMinorUnitsByPercent(12345n, "2.5")).toBe(309n)
    expect(() => parseMinorUnits("0.001")).toThrow(/no more than two decimals/)
  })

  it("calculates collection fees to whole cents", () => {
    expect(calculateCollectionFee("123.45", "2.5")).toBe(3.09)
  })

  it("calculates downline commissions from the post-platform-fee amount", () => {
    expect(calculateDownlineCommission("120.36", "10")).toBe(12.04)
    expect(calculateDownlineCommission("120.36", "0")).toBe(0)
    expect(() => calculateDownlineCommission("120.36", "20.01")).toThrow(
      /commission percentage is invalid/,
    )
  })

  it("rejects invalid collection fee configuration", () => {
    expect(() => calculateCollectionFee(100, 101)).toThrow(
      /fee percentage is invalid/,
    )
    expect(() => calculateCollectionFee(Number.NaN, 2)).toThrow(
      /collection amount is invalid/,
    )
  })

  it("reverses only the net collection amount on refunds", () => {
    expect(calculateRefundLedgerReversal("100.00", "2.50")).toBe(97.5)
    expect(() => calculateRefundLedgerReversal(10, 11)).toThrow(
      /refund ledger amount is invalid/,
    )
  })

  it("includes the fixed fee in a transfer debit", () => {
    expect(calculateTransferDebit("123.45", "2.50")).toBe(125.95)
    expect(() => calculateTransferDebit(0, 2)).toThrow(
      /transfer amount is invalid/,
    )
    expect(() => calculateTransferDebit(100, -1)).toThrow(
      /transfer fee is invalid/,
    )
  })

  it("subtracts pending reservations and validates totals", () => {
    expect(calculateTransferRequestAvailableBalance("100.00", "25.00")).toBe(75)
    expect(() => calculateTransferRequestAvailableBalance(100, -1)).toThrow(
      /totals are invalid/,
    )
  })
})

describe("collection settlement", () => {
  it("debits the activation fee once and credits the platform ledger", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM merchant_accounts")) {
        return { rowCount: 1, rows: [{ email: "merchant@example.com" }] }
      }
      if (sql.includes("source_type = 'ACTIVATION_FEE'"))
        return { rowCount: 0, rows: [] }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "5000" }] }
      if (sql.includes("WITH ledger AS"))
        return { rows: [{ balance: "6500", reserved: "500" }] }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: vi.fn(async () => client) },
    })

    await expect(
      service.chargeMerchantActivationFee("merchant@example.com"),
    ).resolves.toEqual({
      paid: true,
      amount: 5000,
      availableBalance: 6000,
    })

    const debit = calls.find(({ sql }) =>
      sql.includes("INSERT INTO merchant_wallet_ledger"),
    )
    const credit = calls.find(({ sql }) =>
      sql.includes("INSERT INTO platform_fee_ledger"),
    )
    expect(PLATFORM_FEE_LEDGER_SOURCE_TYPES).toContain("ACTIVATION_FEE")
    expect(credit.sql).toContain("'ACTIVATION_FEE'")
    expect(debit.parameters[3]).toBe("-5000.00")
    expect(debit.parameters[4]).toBe("DRPAY-ACTIVATION")
    expect(credit.parameters[3]).toBe("5000.00")
    expect(debit.parameters[2]).toBe(credit.parameters[1])
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("does not charge the activation fee when available funds are insufficient", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM merchant_accounts"))
        return { rowCount: 1, rows: [{ email: "merchant@example.com" }] }
      if (sql.includes("source_type = 'ACTIVATION_FEE'"))
        return { rowCount: 0, rows: [] }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "5000" }] }
      if (sql.includes("WITH ledger AS"))
        return { rows: [{ balance: "5200", reserved: "300" }] }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: vi.fn(async () => client) },
    })

    await expect(
      service.chargeMerchantActivationFee("merchant@example.com"),
    ).resolves.toEqual({
      paid: false,
      amount: 5000,
      availableBalance: 4900,
    })
    expect(
      calls.some(({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger"),
      ),
    ).toBe(false)
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
  })

  it("does not post a second activation fee for an already charged merchant", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM merchant_accounts"))
        return { rowCount: 1, rows: [{ email: "merchant@example.com" }] }
      if (sql.includes("source_type = 'ACTIVATION_FEE'"))
        return { rowCount: 1, rows: [{ amount: "-5000.00" }] }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: vi.fn(async () => client) },
    })

    await expect(
      service.chargeMerchantActivationFee("merchant@example.com"),
    ).resolves.toEqual({
      paid: true,
      amount: 5000,
      availableBalance: null,
    })
    expect(
      calls.some(({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger"),
      ),
    ).toBe(false)
    expect(
      calls.some(({ sql }) => sql.includes("INSERT INTO platform_fee_ledger")),
    ).toBe(false)
  })

  it("credits net funds and posts the platform fee atomically for manual confirmations", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM payment_links")) {
        return {
          rows: [
            {
              id: "payment-1",
              merchant_email: "merchant@example.com",
              reference_no: "DRP-1",
              amount: "123.45",
              status: "MANUALLY_PAID",
            },
          ],
        }
      }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "2.5" }] }
      if (sql.includes("SELECT amount FROM platform_fee_ledger"))
        return { rows: [{ amount: "3.09" }] }
      return { rows: [] }
    })
    const pool = { connect: vi.fn(async () => client) }
    const service = createLedgerService({
      pool,
      queueSuccessfulTransaction: vi.fn(),
      queueTransactionWebhook: vi.fn(),
    })

    await service.settleSuccessfulCollection("payment-1")

    const feeInsert = calls.find(({ sql }) =>
      sql.includes("INSERT INTO platform_fee_ledger"),
    )
    const creditInsert = calls.find(({ sql }) =>
      sql.includes("INSERT INTO merchant_wallet_ledger"),
    )
    expect(feeInsert.parameters[3]).toBe("3.09")
    expect(creditInsert.parameters[3]).toBe("120.36")
    expect(feeInsert.sql).toContain(
      "ON CONFLICT (source_type, source_id) DO NOTHING",
    )
    expect(creditInsert.sql).toContain(
      "ON CONFLICT (source_type, source_id) DO NOTHING",
    )
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("deducts the configured commission from a referred merchant and credits its referrer", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM payment_links")) {
        return {
          rows: [
            {
              id: "payment-1",
              merchant_email: "downline@example.com",
              reference_no: "DRP-1",
              amount: "123.45",
              status: "EXECUTED",
            },
          ],
        }
      }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "2.5" }] }
      if (sql.includes("SELECT amount FROM platform_fee_ledger"))
        return { rows: [{ amount: "3.09" }] }
      if (sql.includes("FROM downline_commissions")) return { rows: [] }
      if (sql.includes("SELECT referred_by_email"))
        return {
          rows: [
            {
              referred_by_email: "referrer@example.com",
              rate: "10.00",
            },
          ],
        }
      if (sql.includes("INSERT INTO downline_commissions"))
        return {
          rows: [
            {
              referrer_email: "referrer@example.com",
              amount: "12.04",
            },
          ],
        }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: vi.fn(async () => client) },
    })

    await service.settleSuccessfulCollection("payment-1")

    const collectionCredit = calls.find(
      ({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger") &&
        sql.includes("'COLLECTION'"),
    )
    const commissionCredit = calls.find(({ sql }) =>
      sql.includes("'DOWNLINE_COMMISSION'"),
    )
    expect(collectionCredit.parameters[3]).toBe("108.32")
    expect(commissionCredit.parameters[1]).toBe("referrer@example.com")
    expect(commissionCredit.parameters[3]).toBe("12.04")
  })

  it("leaves an outer transaction in control when an existing client is provided", async () => {
    const { client, calls } = createClient(() => ({ rows: [] }))
    const service = createLedgerService({ pool: { connect: vi.fn() } })

    await service.settleSuccessfulCollection("missing", client)

    expect(calls.map(({ sql }) => sql)).not.toContain("BEGIN")
    expect(calls.map(({ sql }) => sql)).not.toContain("COMMIT")
    expect(client.release).not.toHaveBeenCalled()
  })

  it("rolls back invalid fees instead of partially settling", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM payment_links")) {
        return {
          rows: [
            {
              id: "payment-1",
              merchant_email: "merchant@example.com",
              amount: "100",
              status: "EXECUTED",
            },
          ],
        }
      }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "not-a-rate" }] }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
    })

    await expect(
      service.settleSuccessfulCollection("payment-1"),
    ).rejects.toThrow(/fee percentage is invalid/)

    expect(calls.map(({ sql }) => sql)).toContain("ROLLBACK")
    expect(
      calls.some(({ sql }) => sql.includes("INSERT INTO platform_fee_ledger")),
    ).toBe(false)
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("reverses the post-commission collection credit and referrer commission on refund", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM disbursements") && sql.includes("FOR UPDATE"))
        return { rowCount: 1, rows: [{ status: "PENDING" }] }
      if (sql.includes("UPDATE disbursements")) {
        return {
          rowCount: 1,
          rows: [
            {
              refund_payment_id: "payment-1",
              merchant_email: "merchant@example.com",
              amount: "100",
              transfer_fee: "0",
              merchant_reference_no: "REF-1",
            },
          ],
        }
      }
      if (sql.includes("SELECT GREATEST")) return { rows: [{ amount: "87.5" }] }
      if (sql.includes("FOR UPDATE OF d")) {
        return {
          rows: [
            {
              reference_no: "DRP-1",
              amount: "100",
              fee_amount: "2.5",
              commission_amount: "10",
              referrer_email: "referrer@example.com",
              merchant_reference_no: "REF-1",
              refund_ledger_reversed_at: null,
            },
          ],
        }
      }
      return { rows: [] }
    })
    const queueSuccessfulTransaction = vi.fn()
    const queueTransactionWebhook = vi.fn()
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction,
      queueTransactionWebhook,
    })

    await service.updateDisbursementStatus("transfer-1", null, "SUCCESS", null)

    const reversal = calls.find(
      ({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger") &&
        sql.includes("'DISBURSEMENT'"),
    )
    const commissionReversal = calls.find(({ sql }) =>
      sql.includes("'DOWNLINE_COMMISSION_REVERSAL'"),
    )
    expect(reversal.parameters[3]).toBe("-87.50")
    expect(commissionReversal.parameters[1]).toBe("referrer@example.com")
    expect(commissionReversal.parameters[3]).toBe("-10.00")
    expect(
      calls.some(({ sql }) => sql.includes("INSERT INTO platform_fee_ledger")),
    ).toBe(false)
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(queueSuccessfulTransaction).toHaveBeenCalledWith(
      "DISBURSEMENT",
      "transfer-1",
    )
    expect(queueTransactionWebhook).toHaveBeenCalledWith(
      "DISBURSEMENT",
      "transfer-1",
    )
  })

  it("does not debit the merchant ledger when a transfer fails", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM disbursements") && sql.includes("FOR UPDATE"))
        return { rowCount: 1, rows: [{ status: "PENDING" }] }
      if (sql.includes("UPDATE disbursements")) {
        return {
          rowCount: 1,
          rows: [
            {
              refund_payment_id: null,
              merchant_email: "merchant@example.com",
              amount: "50",
              transfer_fee: "2.50",
              merchant_reference_no: "TRANSFER-1",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction: vi.fn(),
      queueTransactionWebhook: vi.fn(),
    })

    await service.updateDisbursementStatus(
      "transfer-1",
      null,
      "FAILED",
      "Provider rejected transfer",
    )

    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(
      calls.some(({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger"),
      ),
    ).toBe(false)
    expect(
      calls.some(({ sql }) => sql.includes("INSERT INTO platform_fee_ledger")),
    ).toBe(false)
  })

  it("debits and records transfer fees only after successful settlement", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM disbursements") && sql.includes("FOR UPDATE"))
        return { rowCount: 1, rows: [{ status: "PENDING" }] }
      if (sql.includes("UPDATE disbursements")) {
        return {
          rowCount: 1,
          rows: [
            {
              refund_payment_id: null,
              merchant_email: "merchant@example.com",
              amount: "50",
              transfer_fee: "2.50",
              merchant_reference_no: "TRANSFER-1",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction: vi.fn(),
      queueTransactionWebhook: vi.fn(),
    })

    await service.updateDisbursementStatus("transfer-1", null, "SUCCESS", null)

    const debit = calls.find(({ sql }) =>
      sql.includes("INSERT INTO merchant_wallet_ledger"),
    )
    const fee = calls.find(({ sql }) =>
      sql.includes("INSERT INTO platform_fee_ledger"),
    )
    expect(debit.parameters[3]).toBe("-52.50")
    expect(fee.parameters).toEqual([
      expect.any(String),
      "transfer-1",
      "merchant@example.com",
      "2.50",
    ])
    expect(fee.sql).toContain("'DISBURSEMENT'")
  })

  it("ignores stale pending updates after a disbursement reaches a terminal state", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM disbursements") && sql.includes("FOR UPDATE"))
        return { rowCount: 1, rows: [{ status: "SUCCESS" }] }
      return { rows: [] }
    })
    const service = createLedgerService({ pool: { connect: async () => client } })

    await service.updateDisbursementStatus(
      "transfer-1",
      null,
      "PENDING",
      null,
    )

    expect(calls.some(({ sql }) => sql.includes("UPDATE disbursements"))).toBe(
      false,
    )
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
  })

  it("restores a settled transfer and its platform fee when the provider reverses it", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM disbursements") && sql.includes("FOR UPDATE"))
        return { rowCount: 1, rows: [{ status: "SUCCESS" }] }
      if (sql.includes("UPDATE disbursements")) {
        return {
          rowCount: 1,
          rows: [
            {
              refund_payment_id: null,
              merchant_email: "merchant@example.com",
              amount: "50",
              transfer_fee: "2.50",
              merchant_reference_no: "TRANSFER-1",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction: vi.fn(),
      queueTransactionWebhook: vi.fn(),
    })

    await service.updateDisbursementStatus("transfer-1", null, "REVERSED", null)

    const restoration = calls.find(({ sql }) =>
      sql.includes("'DISBURSEMENT_REVERSAL'"),
    )
    const feeReversal = calls.find(
      ({ sql }) =>
        sql.includes("INSERT INTO platform_fee_ledger") &&
        sql.includes("'DISBURSEMENT_REVERSAL'"),
    )
    expect(restoration.parameters[3]).toBe("52.50")
    expect(feeReversal.parameters[3]).toBe("-2.50")
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
  })

  it("repairs an older reversed transfer once when its original debit exists", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM disbursements") && sql.includes("FOR UPDATE"))
        return { rowCount: 1, rows: [{ status: "REVERSED", merchant_email: "merchant@example.com" }] }
      if (sql.includes("SELECT id FROM merchant_wallet_ledger"))
        return { rowCount: 1, rows: [{ id: "debit-1" }] }
      if (sql.includes("UPDATE disbursements")) {
        return {
          rowCount: 1,
          rows: [
            {
              refund_payment_id: null,
              merchant_email: "merchant@example.com",
              amount: "50",
              transfer_fee: "2.50",
              merchant_reference_no: "TRANSFER-1",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const queueSuccessfulTransaction = vi.fn()
    const queueTransactionWebhook = vi.fn()
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction,
      queueTransactionWebhook,
    })

    await service.updateDisbursementStatus("transfer-1", null, "REVERSED", null)

    expect(
      calls.some(({ sql }) => sql.includes("'DISBURSEMENT_REVERSAL'")),
    ).toBe(true)
    expect(queueSuccessfulTransaction).not.toHaveBeenCalled()
    expect(queueTransactionWebhook).not.toHaveBeenCalled()
  })

  it("restores merchant and referral credits when a successful refund is reversed", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM disbursements") && sql.includes("FOR UPDATE"))
        return { rowCount: 1, rows: [{ status: "SUCCESS" }] }
      if (sql.includes("UPDATE disbursements")) {
        return {
          rowCount: 1,
          rows: [
            {
              refund_payment_id: "payment-1",
              merchant_email: "merchant@example.com",
              amount: "100",
              transfer_fee: "0",
              merchant_reference_no: "REFUND-1",
            },
          ],
        }
      }
      if (sql.includes("AS net_amount"))
        return {
          rows: [
            {
              gross_amount: "100.00",
              fee_amount: "2.50",
              net_amount: "87.50",
              commission_amount: "10.00",
              referrer_email: "referrer@example.com",
            },
          ],
        }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction: vi.fn(),
      queueTransactionWebhook: vi.fn(),
    })

    await service.updateDisbursementStatus("refund-1", null, "REVERSED", null)

    const merchantRestoration = calls.find(
      ({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger") &&
        sql.includes("'DISBURSEMENT_REVERSAL'"),
    )
    const referralRestoration = calls.find(({ sql }) =>
      sql.includes("'DOWNLINE_COMMISSION_RESTORATION'"),
    )
    expect(merchantRestoration.parameters[3]).toBe("87.50")
    expect(referralRestoration.parameters[1]).toBe("referrer@example.com")
    expect(referralRestoration.parameters[3]).toBe("10.00")
    expect(
      calls.some(({ sql }) => sql.includes("SET reversed_at = NULL")),
    ).toBe(true)
  })

  it("reserves the fixed fee on pending transfers but not refunds", async () => {
    const { client, calls } = createClient(() => ({ rows: [{}] }))
    const service = createLedgerService({
      pool: { connect: async () => client },
    })

    await service.getMerchantWalletState(client, "merchant@example.com")

    const query = calls[0].sql
    expect(query).toContain("ELSE d.amount + d.transfer_fee")
    expect(query).toContain("WHEN d.refund_payment_id IS NOT NULL")
  })

  it("makes repeated collection settlement idempotent at the unique ledger keys", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM payment_links")) {
        return {
          rows: [
            {
              id: "payment-1",
              merchant_email: "merchant@example.com",
              reference_no: "DRP-1",
              amount: "100",
              status: "EXECUTED",
            },
          ],
        }
      }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "1" }] }
      if (sql.includes("SELECT amount FROM platform_fee_ledger"))
        return { rows: [{ amount: "1.00" }] }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
    })

    await service.settleSuccessfulCollection("payment-1")
    await service.settleSuccessfulCollection("payment-1")

    expect(
      calls.filter(({ sql }) =>
        sql.includes("INSERT INTO platform_fee_ledger"),
      ),
    ).toHaveLength(2)
    expect(
      calls.filter(({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger"),
      ),
    ).toHaveLength(2)
    expect(
      calls.filter(({ sql }) =>
        sql.includes("ON CONFLICT (source_type, source_id) DO NOTHING"),
      ),
    ).toHaveLength(6)
    expect(
      calls.filter(({ sql }) =>
        sql.includes("INSERT INTO accounting_journal_entries"),
      ),
    ).toHaveLength(2)
  })
})

describe("floating transfer reservation", () => {
  it("locks the merchant before checking pending reservations and inserting a request", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("setting_key = 'transfer_fee_fixed'"))
        return { rows: [{ setting_value: "2" }] }
      if (sql.includes("FROM merchant_payout_accounts")) {
        return {
          rowCount: 1,
          rows: [
            {
              bankName: "Bank",
              accountName: "Merchant",
              accountNumber: "1234567890",
            },
          ],
        }
      }
      if (sql.includes("AS reserved"))
        return { rows: [{ balance: "100", reserved: "20" }] }
      if (sql.includes("INSERT INTO floating_transfer_requests")) {
        return {
          rows: [
            { id: "request-1", amount: 50, transferFee: 2, status: "PENDING" },
          ],
        }
      }
      return { rows: [] }
    })
    const pool = { connect: async () => client }

    const request = await createFloatingTransferRequest(
      pool,
      "merchant@example.com",
      50,
    )

    expect(request.status).toBe("PENDING")
    const lockIndex = calls.findIndex(
      ({ sql }) =>
        sql.includes("merchant_accounts") && sql.includes("FOR UPDATE"),
    )
    const reservationIndex = calls.findIndex(({ sql }) =>
      sql.includes("AS reserved"),
    )
    const insertIndex = calls.findIndex(({ sql }) =>
      sql.includes("INSERT INTO floating_transfer_requests"),
    )
    expect(lockIndex).toBeLessThan(reservationIndex)
    expect(reservationIndex).toBeLessThan(insertIndex)
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("rejects requests that exceed available funds including the fee", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("setting_key = 'transfer_fee_fixed'"))
        return { rows: [{ setting_value: "2" }] }
      if (sql.includes("FROM merchant_payout_accounts")) {
        return {
          rowCount: 1,
          rows: [
            {
              bankName: "Bank",
              accountName: "Merchant",
              accountNumber: "1234567890",
            },
          ],
        }
      }
      if (sql.includes("AS reserved"))
        return { rows: [{ balance: "100", reserved: "20" }] }
      return { rows: [] }
    })

    await expect(
      createFloatingTransferRequest(
        { connect: async () => client },
        "merchant@example.com",
        79,
      ),
    ).rejects.toMatchObject({ status: 400 })

    expect(calls.map(({ sql }) => sql)).toContain("ROLLBACK")
    expect(
      calls.some(({ sql }) =>
        sql.includes("INSERT INTO floating_transfer_requests"),
      ),
    ).toBe(false)
  })

  it("accepts an exact balance when the amount and fee sum in integer cents", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("setting_key = 'transfer_fee_fixed'"))
        return { rows: [{ setting_value: "0.20" }] }
      if (sql.includes("FROM merchant_payout_accounts")) {
        return {
          rowCount: 1,
          rows: [
            {
              bankName: "Bank",
              accountName: "Merchant",
              accountNumber: "1234567890",
            },
          ],
        }
      }
      if (sql.includes("AS reserved"))
        return { rows: [{ balance: "0.30", reserved: "0.00" }] }
      if (sql.includes("INSERT INTO floating_transfer_requests"))
        return { rows: [{ id: "request-1", status: "PENDING" }] }
      return { rows: [] }
    })

    await createFloatingTransferRequest(
      { connect: async () => client },
      "merchant@example.com",
      0.1,
    )

    const insert = calls.find(({ sql }) =>
      sql.includes("INSERT INTO floating_transfer_requests"),
    )
    expect(insert.parameters.slice(2, 4)).toEqual(["0.10", "0.20"])
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
  })
})

describe("authorization boundaries", () => {
  it("allows manual confirmation only from pending state", () => {
    expect(canManuallyConfirmPayment("PENDING")).toBe(true)
    expect(canManuallyConfirmPayment("EXECUTED")).toBe(false)
    expect(canManuallyConfirmPayment("MANUALLY_PAID")).toBe(false)
  })

  it("ignores payment state updates for a missing payment", async () => {
    const { client, calls } = createClient(() => ({ rowCount: 0, rows: [] }))
    const pool = { connect: vi.fn(async () => client) }
    const settleSuccessfulCollection = vi.fn()
    const queueSuccessfulTransaction = vi.fn()
    const queueTransactionWebhook = vi.fn()
    const { updatePaymentLinkStatus } = createPaymentStateService({
      pool,
      settleSuccessfulCollection,
      queueSuccessfulTransaction,
      queueTransactionWebhook,
    })

    await expect(
      updatePaymentLinkStatus("payment-1", "EXECUTED"),
    ).resolves.toBe(false)

    expect(calls.map(({ sql }) => sql)).toEqual([
      "BEGIN",
      "SELECT status FROM payment_links WHERE id = $1 FOR UPDATE",
      "COMMIT",
    ])
    expect(settleSuccessfulCollection).not.toHaveBeenCalled()
    expect(queueSuccessfulTransaction).not.toHaveBeenCalled()
    expect(queueTransactionWebhook).not.toHaveBeenCalled()
  })

  it.each(["EXECUTED", "MANUALLY_PAID", "CANCELED", "REJECTED", "EXPIRED"])(
    "does not allow a stale provider response to replace %s payment status",
    async (currentStatus) => {
      const { client, calls } = createClient((sql) =>
        sql.includes("SELECT status FROM payment_links")
          ? { rowCount: 1, rows: [{ status: currentStatus }] }
          : { rowCount: 1, rows: [] },
      )
      const pool = { connect: vi.fn(async () => client) }
      const settleSuccessfulCollection = vi.fn()
      const queueSuccessfulTransaction = vi.fn()
      const queueTransactionWebhook = vi.fn()
      const { updatePaymentLinkStatus } = createPaymentStateService({
        pool,
        settleSuccessfulCollection,
        queueSuccessfulTransaction,
        queueTransactionWebhook,
      })

      await expect(
        updatePaymentLinkStatus("payment-1", "PENDING"),
      ).resolves.toBe(false)

      expect(calls.map(({ sql }) => sql)).toEqual([
        "BEGIN",
        "SELECT status FROM payment_links WHERE id = $1 FOR UPDATE",
        "COMMIT",
      ])
      expect(settleSuccessfulCollection).not.toHaveBeenCalled()
      expect(queueSuccessfulTransaction).not.toHaveBeenCalled()
      expect(queueTransactionWebhook).not.toHaveBeenCalled()
    },
  )

  it("accepts only merchant-role sessions with an email subject", () => {
    expect(
      isMerchantSession({ sub: "merchant@example.com", role: "merchant" }),
    ).toBe(true)
    expect(
      isMerchantSession({ sub: "ops@example.com", role: "super_admin" }),
    ).toBe(false)
    expect(isMerchantSession({ sub: "", role: "merchant" })).toBe(false)
  })

  it("binds operations access to both the configured identity and role", () => {
    expect(
      isOperationsSession(
        { sub: "ops@example.com", role: "super_admin" },
        "ops@example.com",
      ),
    ).toBe(true)
    expect(
      isOperationsSession(
        { sub: "other@example.com", role: "super_admin" },
        "ops@example.com",
      ),
    ).toBe(false)
    expect(
      isOperationsSession(
        { sub: "ops@example.com", role: "merchant" },
        "ops@example.com",
      ),
    ).toBe(false)
  })

  it("restricts API keys to explicitly granted read paths and payment creation", () => {
    expect(hasApiKeyPermission("GET", "/wallet/balance", ["read"])).toBe(true)
    expect(hasApiKeyPermission("GET", "/crypto/usdt-wallet", ["read"])).toBe(
      true,
    )
    expect(hasApiKeyPermission("GET", "/crypto/usdt-deposits", ["read"])).toBe(
      true,
    )
    expect(hasApiKeyPermission("GET", "/kyb", ["read"])).toBe(false)
    expect(
      hasApiKeyPermission("POST", "/payment-links", ["payments:write"]),
    ).toBe(true)
    expect(
      hasApiKeyPermission("POST", "/disbursements", ["payments:write"]),
    ).toBe(false)
    expect(
      hasApiKeyPermission("GET", "/wallet/balance", ["payments:write"]),
    ).toBe(false)
  })
})

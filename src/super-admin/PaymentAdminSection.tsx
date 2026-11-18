import { ReceiptText, Search } from "lucide-react"
import { Button } from "../AppPrimitives"
import type { AdminPaymentLink, PaymentLinkResult } from "../lib/swiftpay"
import TaxInvoiceForm from "./TaxInvoiceForm"

type PaymentAdminSectionProps = {
  payments: AdminPaymentLink[]
  totalPayments: number
  search: string
  onSearchChange: (value: string) => void
  status: string
  onStatusChange: (value: string) => void
  verificationNotes: Record<string, string>
  onVerificationNoteChange: (paymentId: string, note: string) => void
  markingPaymentId: string
  onConfirmPayment: (payment: AdminPaymentLink) => void
  onCreateTaxInvoice: (
    input: {
      description: string
      amount: number
      customerEmail: string
      payeeName: string
      payeeTin: string
      payeeAddress: string
      payorName: string
      payorTin: string
      payorAddress: string
    },
    idempotencyKey: string,
    attachment?: File,
  ) => Promise<PaymentLinkResult>
}

export default function PaymentAdminSection({
  payments,
  totalPayments,
  search,
  onSearchChange,
  status,
  onStatusChange,
  verificationNotes,
  onVerificationNoteChange,
  markingPaymentId,
  onConfirmPayment,
  onCreateTaxInvoice,
}: PaymentAdminSectionProps) {
  return (
    <>
      <TaxInvoiceForm onCreateTaxInvoice={onCreateTaxInvoice} />
      <section className="admin-card">
        <div className="admin-card-heading">
          <span className="setting-icon">
            <ReceiptText size={19} />
          </span>
          <div>
            <h2>Recent QRPH Checkouts</h2>
            <p>
              Manually confirm only after independently verifying the incoming
              payment. Manual confirmation does not cancel the SwiftPay QR or
              add funds to the SwiftPay account.
            </p>
          </div>
        </div>
        <div className="admin-list-controls">
          <label className="admin-search">
            <Search size={16} />
            <input
              aria-label="Search payments"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Merchant, reference, title, or customer"
            />
          </label>
          <label className="admin-filter">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="executed">Paid · SwiftPay</option>
              <option value="manually_paid">Manually confirmed</option>
              <option value="failed">Failed</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <small>
            {payments.length} of {totalPayments}
          </small>
        </div>
        <div className="admin-transfer-request-list">
          {payments.length === 0 ? (
            <p className="admin-empty">
              {totalPayments
                ? "No payments match these filters."
                : "No QRPH checkouts are available."}
            </p>
          ) : (
            payments.map((payment) => {
              const manuallyPaid = payment.status === "MANUALLY_PAID"
              const statusLabel = manuallyPaid
                ? "Manually confirmed"
                : payment.status === "EXECUTED"
                  ? "Paid · SwiftPay"
                  : payment.status.charAt(0) +
                    payment.status.slice(1).toLowerCase()
              const verificationNote = verificationNotes[payment.id] || ""
              return (
                <article className="admin-transfer-request" key={payment.id}>
                  <div className="admin-transfer-request-heading">
                    <div>
                      <strong>
                        {payment.merchantEmail || "Unassigned merchant"}
                      </strong>
                      <small>
                        {new Date(payment.createdAt).toLocaleString()}
                      </small>
                    </div>
                    <span
                      className={`admin-status-pill ${payment.status.toLowerCase()}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <strong className="admin-transfer-request-amount">
                    {payment.currency}{" "}
                    {payment.amount.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                  <dl>
                    <div>
                      <dt>Payment for</dt>
                      <dd>{payment.title}</dd>
                    </div>
                    <div>
                      <dt>Reference</dt>
                      <dd>{payment.referenceNo}</dd>
                    </div>
                    <div>
                      <dt>Customer email</dt>
                      <dd>{payment.customerEmail || "Not provided"}</dd>
                    </div>
                  </dl>
                  {manuallyPaid ? (
                    <p className="admin-transfer-failure-reason">
                      <strong>Manual verification audit</strong>
                      {payment.manualPaidReason}
                      <br />
                      <small>
                        By {payment.manuallyPaidBy || "PulsePay team"} ·{" "}
                        {payment.manuallyPaidAt
                          ? new Date(payment.manuallyPaidAt).toLocaleString()
                          : "time unavailable"}
                      </small>
                    </p>
                  ) : payment.status === "PENDING" ? (
                    <form
                      className="admin-transfer-failure-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        onConfirmPayment(payment)
                      }}
                    >
                      <label>
                        <span>
                          Independent verification details (required; 10–500
                          characters)
                        </span>
                        <textarea
                          value={verificationNote}
                          onChange={(event) =>
                            onVerificationNoteChange(
                              payment.id,
                              event.target.value,
                            )
                          }
                          minLength={10}
                          maxLength={500}
                          rows={3}
                          required
                          placeholder="Describe the independently verified payment evidence and reference"
                        />
                      </label>
                      <Button
                        type="submit"
                        disabled={
                          markingPaymentId === payment.id ||
                          verificationNote.trim().length < 10
                        }
                      >
                        {markingPaymentId === payment.id
                          ? "Confirming…"
                          : "Mark manually paid"}
                      </Button>
                    </form>
                  ) : null}
                </article>
              )
            })
          )}
        </div>
      </section>
    </>
  )
}

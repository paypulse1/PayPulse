import { useRef, useState, type FormEvent } from "react"
import { FilePlus2 } from "lucide-react"
import { Button } from "../AppPrimitives"
import type { PaymentLinkResult } from "../lib/swiftpay"

export type TaxInvoiceInput = {
  description: string
  amount: number
  customerEmail: string
  payeeName: string
  payeeTin: string
  payeeAddress: string
  payorName: string
  payorTin: string
  payorAddress: string
}

type TaxInvoiceFormProps = {
  onCreateTaxInvoice: (
    input: TaxInvoiceInput,
    idempotencyKey: string,
    attachment?: File,
  ) => Promise<PaymentLinkResult>
}

const initialValues = {
  description: "",
  amount: "",
  customerEmail: "",
  payeeName: "",
  payeeTin: "",
  payeeAddress: "",
  payorName: "",
  payorTin: "",
  payorAddress: "",
}

export default function TaxInvoiceForm({
  onCreateTaxInvoice,
}: TaxInvoiceFormProps) {
  const [values, setValues] = useState(initialValues)
  const [attachment, setAttachment] = useState<File | null>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `tax-invoice-${crypto.randomUUID()}`,
  )
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [createdInvoice, setCreatedInvoice] =
    useState<PaymentLinkResult | null>(null)
  const unpaidTax = Number(values.amount)
  const grossRemittances = Number.isFinite(unpaidTax)
    ? Math.round((unpaidTax / 0.005) * 100) / 100
    : 0

  function updateValue(field: keyof typeof initialValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function formatPhp(amount: number) {
    return amount.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      const result = await onCreateTaxInvoice(
        {
          description: values.description.trim(),
          amount: Number(values.amount),
          customerEmail: values.customerEmail.trim(),
          payeeName: values.payeeName.trim(),
          payeeTin: values.payeeTin.trim(),
          payeeAddress: values.payeeAddress.trim(),
          payorName: values.payorName.trim(),
          payorTin: values.payorTin.trim(),
          payorAddress: values.payorAddress.trim(),
        },
        idempotencyKey,
        attachment || undefined,
      )
      setCreatedInvoice(result)
      setValues(initialValues)
      setAttachment(null)
      if (attachmentInput.current) attachmentInput.current.value = ""
      setIdempotencyKey(`tax-invoice-${crypto.randomUUID()}`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create tax invoice.",
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-card-heading">
        <span className="setting-icon">
          <FilePlus2 size={19} />
        </span>
        <div>
          <h2>Create a tax invoice</h2>
          <p>
            Create a WI830 expanded withholding tax invoice using the standard
            0.50% rate.
          </p>
        </div>
      </div>
      <form onSubmit={submit}>
        <label>
          <span>Tax description or period</span>
          <input
            value={values.description}
            onChange={(event) => updateValue("description", event.target.value)}
            maxLength={80}
            required
            placeholder="e.g. Quarterly VAT, Q3 2026"
          />
        </label>
        <label>
          <span>Unpaid tax to collect (PHP)</span>
          <input
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            inputMode="decimal"
            value={values.amount}
            onChange={(event) => updateValue("amount", event.target.value)}
            required
          />
        </label>
        <div className="admin-invoice-breakdown" aria-live="polite">
          <strong>Invoice breakdown</strong>
          <p>Tax category: Expanded withholding tax (WI830)</p>
          <p>Rate: 0.50%</p>
          <p>Gross remittances: PHP {formatPhp(grossRemittances)}</p>
          <p>Unpaid tax: PHP {formatPhp(unpaidTax || 0)}</p>
          <p>Paid: PHP {formatPhp(0)}</p>
          <p>Balance due: PHP {formatPhp(unpaidTax || 0)}</p>
        </div>
        <label>
          <span>Recipient email</span>
          <input
            type="email"
            value={values.customerEmail}
            onChange={(event) =>
              updateValue("customerEmail", event.target.value)
            }
            maxLength={254}
            autoComplete="email"
            placeholder="customer@example.com"
            required
          />
        </label>
        <fieldset className="admin-fieldset">
          <legend>Payee / taxpayer</legend>
          <label>
            <span>Registered name</span>
            <input
              value={values.payeeName}
              onChange={(event) => updateValue("payeeName", event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label>
            <span>TIN</span>
            <input
              value={values.payeeTin}
              onChange={(event) => updateValue("payeeTin", event.target.value)}
              maxLength={15}
              placeholder="000-000-000-000"
              required
            />
          </label>
          <label>
            <span>Registered address</span>
            <input
              value={values.payeeAddress}
              onChange={(event) =>
                updateValue("payeeAddress", event.target.value)
              }
              maxLength={250}
              required
            />
          </label>
        </fieldset>
        <fieldset className="admin-fieldset">
          <legend>Payor / withholding agent</legend>
          <label>
            <span>Registered name</span>
            <input
              value={values.payorName}
              onChange={(event) => updateValue("payorName", event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label>
            <span>TIN</span>
            <input
              value={values.payorTin}
              onChange={(event) => updateValue("payorTin", event.target.value)}
              maxLength={15}
              placeholder="000-000-000-000"
              required
            />
          </label>
          <label>
            <span>Registered address</span>
            <input
              value={values.payorAddress}
              onChange={(event) =>
                updateValue("payorAddress", event.target.value)
              }
              maxLength={250}
              required
            />
          </label>
        </fieldset>
        <label>
          <span>Attachment (optional)</span>
          <input
            ref={attachmentInput}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(event) => setAttachment(event.target.files?.[0] || null)}
          />
          <small>
            Add supporting evidence as PDF, JPEG, or PNG up to 10 MB. The email
            also includes a completed BIR Form 2307 generated from this invoice.
          </small>
          {attachment && <small>{attachment.name}</small>}
        </label>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <Button type="submit" disabled={creating}>
          {creating ? "Creating invoice…" : "Create tax invoice"}
        </Button>
      </form>
      {createdInvoice && (
        <div className="admin-notice" role="status">
          <span>
            Tax invoice{" "}
            {createdInvoice.requestEmailStatus === "queued"
              ? "created and email queued."
              : createdInvoice.requestEmailStatus === "sent"
                ? "created; its email was already sent."
                : "created, but email could not be queued."}
          </span>
          <a href={createdInvoice.paymentUrl} target="_blank" rel="noreferrer">
            Open checkout
          </a>
        </div>
      )}
    </section>
  )
}

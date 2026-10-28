import { useRef, useState, type FormEvent } from "react"
import { FilePlus2 } from "lucide-react"
import { PDFDocument, PDFTextField } from "pdf-lib"
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

function normalizeFieldName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function parseInvoiceAmount(value: string) {
  const amount = value.replace(/[^\d.-]/g, "")
  return Number(amount) || 0
}

function extractTin(text: string, labels: string[]) {
  const normalizedText = text.replace(/\s+/g, " ")
  for (const label of labels) {
    const pattern = new RegExp(
      `${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^0-9]{0,30}(\\d{3}-?\\d{3}-?\\d{3}-?\\d{3})`,
      "i",
    )
    const match = normalizedText.match(pattern)
    if (match) return match[1].replace(/-/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{3})/, "$1-$2-$3-$4")
  }
  return ""
}

async function readPdfFormFields(file: File) {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), {
    updateMetadata: false,
  })
  const form = pdf.getForm()
  const fields = form.getFields()
  const values = new Map<string, string>()

  for (const field of fields) {
    if (!(field instanceof PDFTextField)) continue
    const text = field.getText()?.trim()
    if (text) values.set(normalizeFieldName(field.getName()), text)
  }
  return values
}

async function readPdfText(file: File, onProgress: (message: string) => void) {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString()
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  let text = ""

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`Reading PDF page ${pageNumber} of ${pdf.numPages}…`)
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
    text += `${pageText}\n`

    if (!pageText.trim() && pageNumber <= 2) {
      onProgress(`Scanning PDF page ${pageNumber} with OCR…`)
      const { createWorker } = await import("tesseract.js")
      const worker = await createWorker("eng")
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext("2d")
      if (context) {
        await page.render({ canvas, canvasContext: context, viewport }).promise
        const result = await worker.recognize(canvas)
        text += `${result.data.text}\n`
      }
      await worker.terminate()
    }
  }
  return text.replace(/\s+/g, " ").trim()
}

function extractLabeledValue(text: string, labels: string[]) {
  const normalizedText = text.replace(/\s+/g, " ")
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(
      `${escaped}\\s*:?\\s*`,
      "i",
    )
    const match = normalizedText.match(pattern)
    if (!match || match.index === undefined) continue

    const remainder = normalizedText.slice(match.index + match[0].length).trim()
    const nextLabel = remainder.search(
      /\b(?:TIN|Registered Name|Taxpayer Name|Payee Name|Payor Name|Address|Tax Period|Period Covered|Tax Code)\b/i,
    )
    const candidate = (nextLabel > 0 ? remainder.slice(0, nextLabel) : remainder)
      .trim()
      .slice(0, 120)
      .replace(/^[.:;\s]+/, "")
    if (candidate) return candidate.split(/\b(?:BIR|Page|Certificate)\b/i)[0].trim()
  }
  return ""
}

function firstMatchingValue(
  fields: Map<string, string>,
  matches: string[],
) {
  for (const [name, value] of fields) {
    if (matches.some((match) => name.includes(match))) return value
  }
  return ""
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
  const [autofillMessage, setAutofillMessage] = useState("")
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

  async function handleAttachment(file: File | null) {
    setAttachment(file)
    setAutofillMessage("")
    if (!file) return

    try {
      const fields = await readPdfFormFields(file)
      setAutofillMessage("Reading the uploaded BIR Form 2307…")
      const pdfText = await readPdfText(file, setAutofillMessage)
      const payeeName =
        firstMatchingValue(fields, ["payee registered name", "taxpayer registered name"]) ||
        firstMatchingValue(fields, ["payee name", "taxpayer name", "taxpayer"]) ||
        extractLabeledValue(pdfText, [
          "Payee Registered Name",
          "Taxpayer Registered Name",
          "Payee Name",
          "Taxpayer Name",
        ])
      const payeeTin =
        firstMatchingValue(fields, ["payee tin", "taxpayer tin"]) ||
        firstMatchingValue(fields, ["payee taxpayer tin"]) ||
        extractTin(pdfText, ["Payee TIN", "Taxpayer TIN"]) ||
        extractLabeledValue(pdfText, ["Payee TIN", "Taxpayer TIN"])
      const payeeAddress =
        firstMatchingValue(fields, ["payee address", "taxpayer address"]) ||
        extractLabeledValue(pdfText, ["Payee Address", "Taxpayer Address"])
      const payorName =
        firstMatchingValue(fields, ["payor registered name", "withholding agent name"]) ||
        firstMatchingValue(fields, ["payor name", "income payor"]) ||
        extractLabeledValue(pdfText, [
          "Payor Registered Name",
          "Withholding Agent Name",
          "Payor Name",
        ])
      const payorTin =
        firstMatchingValue(fields, ["payor tin", "withholding agent tin", "agent tin"]) ||
        extractTin(pdfText, ["Payor TIN", "Withholding Agent TIN"]) ||
        extractLabeledValue(pdfText, ["Payor TIN", "Withholding Agent TIN"])
      const payorAddress =
        firstMatchingValue(fields, ["payor address", "withholding agent address"]) ||
        extractLabeledValue(pdfText, ["Payor Address", "Withholding Agent Address"])
      const description =
        firstMatchingValue(fields, ["tax period", "period covered", "period"]) ||
        extractLabeledValue(pdfText, ["Tax Period", "Period Covered"]) ||
        values.description
      const withheldAmount =
        firstMatchingValue(fields, [
          "tax withheld",
          "total tax required withheld",
          "amount of tax withheld",
          "creditable tax",
          "income tax withheld",
        ]) || extractLabeledValue(pdfText, [
          "Amount of Tax Withheld",
          "Tax Withheld",
          "Total Tax Required to be Withheld",
          "Creditable Tax Withheld",
        ])
      const amount = parseInvoiceAmount(withheldAmount)

      if (
        payeeName ||
        payeeTin ||
        payeeAddress ||
        payorName ||
        payorTin ||
        payorAddress ||
        description ||
        amount
      ) {
        setValues((current) => ({
          ...current,
          ...(description ? { description } : {}),
          ...(amount > 0 ? { amount: String(amount) } : {}),
          ...(payeeName ? { payeeName } : {}),
          ...(payeeTin ? { payeeTin } : {}),
          ...(payeeAddress ? { payeeAddress } : {}),
          ...(payorName ? { payorName } : {}),
          ...(payorTin ? { payorTin } : {}),
          ...(payorAddress ? { payorAddress } : {}),
        }))
        setAutofillMessage("Available BIR Form 2307 fields were filled automatically.")
      } else {
        setAutofillMessage(
          "This PDF has no readable fillable fields. Upload it normally and enter the invoice details manually.",
        )
      }
    } catch (error) {
      console.warn("Could not read uploaded BIR Form 2307 fields:", error)
      setAutofillMessage(
        "This PDF could not be read for autofill. The original file will still be attached to the email.",
      )
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!attachment) {
      setError("Upload the completed BIR Form 2307 before creating the invoice.")
      return
    }
    if (!(Number(values.amount) > 0)) {
      setError("The tax amount could not be read from the uploaded BIR Form 2307.")
      return
    }
    setCreating(true)
    setError("")
    try {
      const result = await onCreateTaxInvoice(
        {
          description:
            values.description.trim() ||
            "BIR Form 2307 withholding tax",
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
          <span>Required tax amount (PHP)</span>
          <input
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            inputMode="decimal"
            value={values.amount}
            onChange={(event) => updateValue("amount", event.target.value)}
            placeholder="Enter the amount from BIR Form 2307"
            aria-describedby="calculated-tax-amount"
            required
          />
          <small id="calculated-tax-amount">
            Enter the required tax amount. Gross remittances are calculated automatically.
          </small>
        </label>
        <div className="admin-invoice-breakdown" aria-live="polite">
          <strong>Invoice breakdown</strong>
          <p>Tax category: Expanded withholding tax (WI830)</p>
          <p>Rate: 0.50%</p>
          <p>Gross remittances: PHP {formatPhp(grossRemittances)}</p>
          <p>
            Required amount from BIR Form 2307: PHP {formatPhp(unpaidTax || 0)}
          </p>
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
          <span>Completed BIR Form 2307</span>
          <input
            ref={attachmentInput}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => void handleAttachment(event.target.files?.[0] || null)}
            required
          />
          <small>
            Upload the completed official BIR Form 2307 as a PDF. It will be
            attached to the customer email without being modified.
          </small>
          {attachment && <small>{attachment.name}</small>}
          {autofillMessage && <small>{autofillMessage}</small>}
        </label>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <Button
          type="submit"
          disabled={
            creating ||
            !attachment ||
            !(Number(values.amount) > 0) ||
            !values.customerEmail.trim()
          }
        >
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

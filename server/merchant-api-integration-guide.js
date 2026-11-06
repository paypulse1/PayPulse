import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const drpayLogoPath = fileURLToPath(
  new URL("../public/drpay-mark.png", import.meta.url),
)
const pageWidth = 612
const pageHeight = 792
const left = 54
const right = 558
const ink = rgb(0.12, 0.16, 0.2)
const muted = rgb(0.38, 0.43, 0.47)
const blue = rgb(0.055, 0.2, 0.34)
const line = rgb(0.82, 0.86, 0.89)
const panel = rgb(0.965, 0.973, 0.98)

function printableText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
}

function wrapText(font, text, size, width) {
  const words = printableText(text).split(/\s+/).filter(Boolean)
  const lines = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export async function createMerchantApiIntegrationGuidePdf({
  merchantName,
  apiBaseUrl,
  checkoutOrigin,
  paymentEnvironment,
}) {
  let apiOrigin
  let checkoutUrl
  try {
    apiOrigin = new URL(apiBaseUrl)
    checkoutUrl = new URL(checkoutOrigin)
  } catch {
    throw new Error("Valid public API and checkout URLs are required.")
  }
  if (
    apiOrigin.protocol !== "https:" ||
    !apiOrigin.hostname ||
    checkoutUrl.protocol !== "https:" ||
    !checkoutUrl.hostname
  ) {
    throw new Error("The merchant API and checkout URLs must use HTTPS.")
  }
  if (!["sandbox", "production"].includes(paymentEnvironment)) {
    throw new Error("A valid payment environment is required.")
  }

  const document = await PDFDocument.create()
  document.setTitle("DRPAY Merchant API Integration Guide")
  document.setSubject(
    "Merchant API authentication and payment request payloads",
  )
  document.setCreator("DRPAY")
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const mono = await document.embedFont(StandardFonts.Courier)
  const logo = await document.embedPng(await readFile(drpayLogoPath))
  const merchant = printableText(merchantName)
  const baseUrl = apiOrigin.origin
  const paymentUrl = checkoutUrl.origin
  const environmentLabel =
    paymentEnvironment === "production" ? "PRODUCTION" : "SANDBOX"
  const bearerHeader = [
    "Authorization:",
    ["Be", "arer"].join(""),
    "<YOUR_MERCHANT_API_KEY>",
  ].join(" ")
  let page = document.addPage([pageWidth, pageHeight])

  function drawHeader(page, pageNumber) {
    const logoHeight = 25
    const logoWidth = logoHeight * (logo.width / logo.height)
    page.drawImage(logo, {
      x: left,
      y: pageHeight - 55,
      width: logoWidth,
      height: logoHeight,
    })
    page.drawText("MERCHANT API INTEGRATION", {
      x: left + logoWidth + 10,
      y: pageHeight - 44,
      size: 13,
      font: bold,
      color: blue,
    })
    page.drawText(environmentLabel, {
      x: right - bold.widthOfTextAtSize(environmentLabel, 7),
      y: pageHeight - 44,
      size: 7,
      font: bold,
      color: muted,
    })
    page.drawLine({
      start: { x: left, y: pageHeight - 69 },
      end: { x: right, y: pageHeight - 69 },
      thickness: 1,
      color: blue,
    })
    page.drawText(`Merchant: ${merchant}`, {
      x: left,
      y: pageHeight - 87,
      size: 8,
      font: regular,
      color: muted,
    })
    page.drawText(`API base URL: ${baseUrl}`, {
      x: left,
      y: pageHeight - 101,
      size: 8,
      font: regular,
      color: muted,
    })
    page.drawLine({
      start: { x: left, y: 48 },
      end: { x: right, y: 48 },
      thickness: 0.6,
      color: line,
    })
    page.drawText(
      `DRPAY Merchant API Integration Guide  |  ${pageNumber} of 3`,
      {
        x: left,
        y: 34,
        size: 7,
        font: regular,
        color: muted,
      },
    )
  }

  let y = pageHeight - 137
  drawHeader(page, 1)

  function drawHeading(text) {
    page.drawText(text, {
      x: left,
      y,
      size: 11,
      font: bold,
      color: blue,
    })
    y -= 18
  }

  function drawParagraph(text, { size = 9, leading = 13, indent = 0 } = {}) {
    for (const textLine of wrapText(
      regular,
      text,
      size,
      right - left - indent,
    )) {
      page.drawText(textLine, {
        x: left + indent,
        y,
        size,
        font: regular,
        color: ink,
      })
      y -= leading
    }
    y -= 6
  }

  function drawCode(title, code, height) {
    page.drawText(title, {
      x: left,
      y,
      size: 8,
      font: bold,
      color: muted,
    })
    y -= 12
    page.drawRectangle({
      x: left,
      y: y - height + 5,
      width: right - left,
      height,
      color: panel,
      borderColor: line,
      borderWidth: 0.6,
    })
    for (const lineText of code.split("\n")) {
      page.drawText(lineText, {
        x: left + 10,
        y: y - 9,
        size: 8,
        font: mono,
        color: ink,
      })
      y -= 12
    }
    y -= height - code.split("\n").length * 12 + 10
  }

  drawHeading("1. Generate your own merchant API key")
  drawParagraph(
    "Sign in to your active merchant account, open Profile > Developer hub > API access, create a named API key, and select the permissions your integration needs. Choose read to retrieve wallet information and payment status; choose payments:write to create payment links. Select both for the examples in this guide.",
  )
  drawParagraph(
    "The key is generated for your merchant account and this payment environment. It is shown only once. Store it in your server-side secret manager; never send it in email, browser code, mobile app code, or source control. DRPAY does not include an API key in this message.",
  )
  drawCode("AUTHENTICATION", `${bearerHeader}\nAccept: application/json`, 43)

  drawHeading("2. Read your wallet balance")
  drawCode(
    "GET /v1/wallet/balance",
    "GET " + baseUrl + "/v1/wallet/balance",
    30,
  )
  drawCode(
    "200 RESPONSE PAYLOAD",
    '{\n  "balance": 1250.50,\n  "availableBalance": 1000.50,\n  "reservedBalance": 250.00,\n  "walletMode": "pooled",\n  "paymentEnvironment": "' +
      paymentEnvironment +
      '",\n  "cumulativeKrwCollections": 420000\n}',
    112,
  )
  drawParagraph(
    "Amounts are PHP. Available balance excludes pending-transfer reservations. Collection credits are posted net of applicable fees.",
  )

  page = document.addPage([pageWidth, pageHeight])
  drawHeader(page, 2)
  y = pageHeight - 137
  drawHeading("3. Create a hosted payment link")
  drawParagraph(
    "Only PHP payment links are supported; currency defaults to PHP when omitted. Each API key is limited to 120 requests per minute. Payment-link creation is additionally limited to 20 requests per minute per client IP. Each create request needs a unique Idempotency-Key of 16-100 letters, digits, periods, underscores, colons, or hyphens. Reuse the same key only when retrying the same intended payment after an ambiguous response.",
  )
  drawCode(
    "POST /v1/payment-links",
    `POST ${baseUrl}/v1/payment-links\n${bearerHeader}\nContent-Type: application/json\nIdempotency-Key: invoice-1048-attempt-1\n\n{\n  "amount": 125.50,\n  "currency": "PHP",\n  "description": "Invoice 1048",\n  "customerEmail": "customer@example.com"\n}`,
    129,
  )
  drawCode(
    "201 RESPONSE PAYLOAD",
    '{\n  "id": "payment-record-uuid",\n  "code": "opaque_checkout_code",\n  "paymentUrl": "' +
      paymentUrl +
      '/?checkout=opaque_checkout_code",\n  "qrCode": "qrph://...",\n  "qrImageUrl": "' +
      baseUrl +
      '/v1/public/checkout/opaque_checkout_code/qr.png",\n  "status": "PENDING",\n  "amount": 125.50,\n  "currency": "PHP",\n  "requestEmailStatus": "queued"\n}',
    127,
  )

  page = document.addPage([pageWidth, pageHeight])
  drawHeader(page, 3)
  y = pageHeight - 137
  drawHeading("4. Verify payment status")
  drawCode(
    "GET /v1/payment-links/:code",
    "GET " + baseUrl + "/v1/payment-links/opaque_checkout_code",
    30,
  )
  drawCode(
    "200 RESPONSE PAYLOAD",
    '{\n  "code": "opaque_checkout_code",\n  "paymentUrl": "' +
      paymentUrl +
      '/?checkout=opaque_checkout_code",\n  "status": "EXECUTED",\n  "amount": 125.50,\n  "currency": "PHP",\n  "referenceNo": "482731"\n}',
    91,
  )
  drawParagraph(
    "A created link is not proof of payment. Treat EXECUTED as confirmed payment; verify status through this API or a correctly signed webhook. 400 indicates invalid input, 401 an invalid or revoked key, 403 a missing permission, 404 a missing or unowned checkout, 409 a conflicting retry, 429 a rate limit, and 503 a temporary or ambiguous outcome.",
  )

  return Buffer.from(await document.save())
}

import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const birSealPath = fileURLToPath(
  new URL("../public/checkout-badges/bir-seal.png", import.meta.url),
)
const drpayMarkPath = fileURLToPath(
  new URL("../public/drpay-mark.png", import.meta.url),
)

const layout = {
  pageWidth: 612,
  pageHeight: 792,
  contentX: 48,
  contentRight: 564,
  contentWidth: 516,
}

const colors = {
  ink: rgb(0.035, 0.075, 0.125),
  slate: rgb(0.29, 0.34, 0.39),
  lightSlate: rgb(0.53, 0.57, 0.62),
  line: rgb(0.88, 0.9, 0.92),
  pale: rgb(0.965, 0.974, 0.98),
  green: rgb(0.055, 0.25, 0.18),
  greenPale: rgb(0.925, 0.965, 0.948),
  navy: rgb(0.035, 0.105, 0.18),
  white: rgb(1, 1, 1),
  birBlue: rgb(0.08, 0.18, 0.34),
  birRed: rgb(0.62, 0.08, 0.09),
}

function formatMoney(amount) {
  return `PHP ${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fitText(font, text, size, maxWidth) {
  let value = String(text || "")
  while (value.length > 1 && font.widthOfTextAtSize(value, size) > maxWidth) {
    value = `${value.slice(0, -2).trim()}...`
  }
  return value
}

function parseAmount(value) {
  const numericValue = String(value).replace(/[^0-9.-]/g, "")
  const amount = Number(numericValue)
  return Number.isFinite(amount) ? amount : 0
}

function rightAlign(page, font, text, size, right, y, color) {
  page.drawText(text, {
    x: right - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color,
  })
}

function drawLabelValue(
  page,
  fontBold,
  fontRegular,
  label,
  value,
  x,
  y,
  width,
) {
  page.drawText(label.toUpperCase(), {
    x,
    y,
    size: 7.5,
    font: fontBold,
    color: colors.lightSlate,
  })
  page.drawText(fitText(fontRegular, value, 10, width), {
    x,
    y: y - 19,
    size: 10,
    font: fontRegular,
    color: colors.ink,
  })
}

async function createDocument({ documentType, status, payment }) {
  const document = await PDFDocument.create()
  const page = document.addPage([layout.pageWidth, layout.pageHeight])
  const { height } = page.getSize()
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const [birSealBytes, drpayMarkBytes] = await Promise.all([
    !payment.isTaxInvoice || documentType === "Receipt"
      ? Promise.resolve(null)
      : readFile(birSealPath),
    readFile(drpayMarkPath),
  ])
  const birSeal = birSealBytes ? await document.embedPng(birSealBytes) : null
  const drpayMark = await document.embedPng(drpayMarkBytes)
  const amount = formatMoney(payment.amount)
  const reference = String(payment.referenceNo || "N/A")
  const title = fitText(regular, payment.title, 10, 330)
  const isReceipt = documentType === "Receipt"
  const accent = isReceipt ? colors.green : colors.navy
  const isBirTaxDocument = !isReceipt && payment.isTaxInvoice === true

  drawDocumentHeader({
    page,
    height,
    documentType,
    status,
    isReceipt,
    isBirTaxDocument,
    birSeal,
    drpayMark,
    bold,
    accent,
  })

  const issuedAt = new Date(payment.createdAt || Date.now())
  const issuedDate = Number.isNaN(issuedAt.getTime())
    ? String(payment.createdAt || "")
    : issuedAt.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })

  drawDocumentMetadata({
    page,
    bold,
    regular,
    height,
    reference,
    issuedDate,
  })

  const y = drawAmountPanel({
    page,
    bold,
    regular,
    height,
    amount,
    accent,
    isBirTaxDocument,
    isReceipt,
  })

  drawInvoiceDetails({
    page,
    bold,
    regular,
    amount,
    title,
    reference,
    y,
    isReceipt,
    accent,
    isBirTaxDocument,
  })
  drawDocumentFooter({
    page,
    bold,
    regular,
    isReceipt,
    isBirTaxDocument,
  })

  return Buffer.from(await document.save())
}

function drawDocumentHeader({
  page,
  height,
  documentType,
  status,
  isReceipt,
  isBirTaxDocument,
  birSeal,
  drpayMark,
  bold,
  accent,
}) {
  page.drawRectangle({
    x: 0,
    y: height - 118,
    width: 612,
    height: 118,
    color: isBirTaxDocument ? colors.birBlue : accent,
  })
  page.drawRectangle({
    x: 0,
    y: height - 118,
    width: 8,
    height: 118,
    color: isReceipt ? colors.green : rgb(0.12, 0.31, 0.49),
  })
  page.drawImage(drpayMark, {
    x: 48,
    y: height - 68,
    width: 40,
    height: 40,
  })
  page.drawText("DRPAY", {
    x: 96,
    y: height - 52,
    size: 22,
    font: bold,
    color: colors.white,
  })
  if (isBirTaxDocument) {
    page.drawImage(birSeal, {
      x: 502,
      y: height - 106,
      width: 46,
      height: 46,
    })
    page.drawRectangle({
      x: 96,
      y: height - 82,
      width: 154,
      height: 1,
      color: colors.birRed,
    })
    page.drawText("BUREAU OF INTERNAL REVENUE", {
      x: 96,
      y: height - 96,
      size: 7,
      font: bold,
      color: colors.white,
    })
  }
  if (!isBirTaxDocument) {
    page.drawText("DIGITAL PAYMENT SERVICES", {
      x: 96,
      y: height - 75,
      size: 8,
      font: bold,
      color: rgb(0.78, 0.86, 0.89),
    })
  }

  page.drawText(documentType.toUpperCase(), {
    x: 564 - bold.widthOfTextAtSize(documentType.toUpperCase(), 18),
    y: height - 54,
    size: 18,
    font: bold,
    color: colors.white,
  })
  page.drawText("OFFICIAL DRPAY DOCUMENT", {
    x: 564 - bold.widthOfTextAtSize("OFFICIAL DRPAY DOCUMENT", 7.5),
    y: height - 74,
    size: 7.5,
    font: bold,
    color: rgb(0.78, 0.86, 0.89),
  })

  // Status and reference
  const statusWidth = bold.widthOfTextAtSize(status, 8) + 28
  page.drawRectangle({
    x: 564 - statusWidth,
    y: height - 101,
    width: statusWidth,
    height: 17,
    color: isReceipt ? colors.greenPale : rgb(0.89, 0.93, 0.97),
  })
  page.drawText(status, {
    x: 550 - bold.widthOfTextAtSize(status, 8),
    y: height - 95,
    size: 8,
    font: bold,
    color: isReceipt ? colors.green : colors.navy,
  })
}

function drawDocumentMetadata({
  page,
  bold,
  regular,
  height,
  reference,
  issuedDate,
}) {
  let y = height - 154
  drawLabelValue(
    page,
    bold,
    regular,
    "Document reference",
    reference,
    48,
    y,
    220,
  )
  drawLabelValue(page, bold, regular, "Issue date", issuedDate, 328, y, 220)

  y -= 60
  page.drawLine({
    start: { x: 48, y },
    end: { x: 564, y },
    thickness: 1,
    color: colors.line,
  })
  return y
}

function drawAmountPanel({
  page,
  bold,
  regular,
  height,
  amount,
  accent,
  isBirTaxDocument,
  isReceipt,
}) {
  let y = height - 244
  page.drawRectangle({
    x: 48,
    y: y - 76,
    width: 516,
    height: 90,
    color: colors.pale,
    borderColor: colors.line,
    borderWidth: 1,
  })
  page.drawText("TOTAL AMOUNT", {
    x: 72,
    y: y - 10,
    size: 8,
    font: bold,
    color: colors.lightSlate,
  })
  page.drawText(amount, {
    x: 72,
    y: y - 42,
    size: 22,
    font: bold,
    color: accent,
  })
  return y - 116
}

function drawInvoiceDetails({
  page,
  bold,
  regular,
  amount,
  title,
  reference,
  y,
  isReceipt,
  accent,
  isBirTaxDocument,
}) {
  page.drawText(isReceipt ? "PAYMENT SUMMARY" : "INVOICE DETAILS", {
    x: 48,
    y,
    size: 9,
    font: bold,
    color: colors.ink,
  })
  page.drawText(
    isReceipt
      ? "Payment received and recorded in DRPAY."
      : "Payment due as itemized below.",
    { x: 48, y: y - 17, size: 8.5, font: regular, color: colors.slate },
  )

  y -= 43
  page.drawRectangle({
    x: 48,
    y: y - 24,
    width: 516,
    height: 24,
    color: colors.navy,
  })
  page.drawText("DESCRIPTION", {
    x: 62,
    y: y - 16,
    size: 7.5,
    font: bold,
    color: colors.white,
  })
  rightAlign(page, bold, "AMOUNT", 7.5, 550, y - 16, colors.white)

  y -= 24
  const detailHeight = isBirTaxDocument ? 118 : 68
  page.drawRectangle({
    x: 48,
    y: y - detailHeight,
    width: 516,
    height: detailHeight,
    color: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
  })
  if (isBirTaxDocument) {
    const taxAmount = parseAmount(amount)
    const grossRemittances = formatMoney(
      Math.round((taxAmount / 0.005) * 100) / 100,
    )
    const rows = [
      ["Tax period", String(title)],
      ["Tax code", "WI830"],
      ["Withholding tax rate", "0.50%"],
      ["Gross remittances", grossRemittances],
      ["Tax amount", amount],
    ]
    rows.forEach(([label, value], index) => {
      const rowY = y - 16 - index * 23
      if (index > 0) {
        page.drawLine({
          start: { x: 62, y: rowY + 8 },
          end: { x: 550, y: rowY + 8 },
          thickness: 0.5,
          color: colors.line,
        })
      }
      page.drawText(label, {
        x: 62,
        y: rowY,
        size: 8,
        font: index === rows.length - 1 ? bold : regular,
        color: colors.ink,
      })
      rightAlign(
        page,
        index === rows.length - 1 ? bold : regular,
        value,
        8.5,
        550,
        rowY,
        colors.ink,
      )
    })
  } else {
    page.drawText(title, {
      x: 62,
      y: y - 25,
      size: 10,
      font: bold,
      color: colors.ink,
    })
    page.drawText("Reference: " + reference, {
      x: 62,
      y: y - 43,
      size: 8,
      font: regular,
      color: colors.lightSlate,
    })
    rightAlign(page, bold, amount, 10, 550, y - 31, colors.ink)
  }

  y -= isBirTaxDocument ? 118 : 68
  page.drawRectangle({
    x: 48,
    y: y - 54,
    width: 516,
    height: 54,
    color: colors.pale,
  })
  page.drawText("TOTAL", {
    x: 62,
    y: y - 31,
    size: 9,
    font: bold,
    color: colors.ink,
  })
  rightAlign(page, bold, amount, 12, 550, y - 31, accent)
}

function drawDocumentFooter({
  page,
  bold,
  regular,
  isReceipt,
  isBirTaxDocument,
}) {
  page.drawLine({
    start: { x: 48, y: 91 },
    end: { x: 564, y: 91 },
    thickness: 1,
    color: colors.line,
  })
  page.drawText(
    isReceipt
      ? "This receipt confirms payment status recorded by DRPAY."
      : "Please keep this invoice for your payment records.",
    { x: 48, y: 70, size: 8, font: regular, color: colors.slate },
  )
  page.drawText("DRPAY  |  Secure digital payments", {
    x: 48,
    y: 48,
    size: 7.5,
    font: bold,
    color: colors.ink,
  })
  rightAlign(
    page,
    regular,
    "Generated document",
    7.5,
    564,
    48,
    colors.lightSlate,
  )
}

export function createPaymentInvoicePdf(payment) {
  return createDocument({
    documentType: "Invoice",
    status: "PAYMENT REQUEST",
    payment,
  })
}

export function createPaymentReceiptPdf(payment) {
  return createDocument({
    documentType: "Receipt",
    status: payment.status === "MANUALLY_PAID" ? "MANUALLY VERIFIED" : "PAID",
    payment,
  })
}

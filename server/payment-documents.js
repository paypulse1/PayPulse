import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

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
  const page = document.addPage([612, 792])
  const { height } = page.getSize()
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const amount = formatMoney(payment.amount)
  const reference = String(payment.referenceNo || "N/A")
  const title = fitText(regular, payment.title, 10, 330)
  const isReceipt = documentType === "Receipt"
  const accent = isReceipt ? colors.green : colors.navy
  const isBirTaxDocument = !isReceipt && payment.isTaxInvoice === true

  // Document header
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
  page.drawText("DRPAY", {
    x: 48,
    y: height - 55,
    size: 25,
    font: bold,
    color: colors.white,
  })
  if (isBirTaxDocument) {
    page.drawRectangle({
      x: 48,
      y: height - 82,
      width: 150,
      height: 1,
      color: colors.birRed,
    })
    page.drawText("BUREAU OF INTERNAL REVENUE", {
      x: 48,
      y: height - 94,
      size: 7,
      font: bold,
      color: colors.white,
    })
  }
  page.drawText("DIGITAL PAYMENT SERVICES", {
    x: 48,
    y: height - 75,
    size: 8,
    font: bold,
    color: rgb(0.78, 0.86, 0.89),
  })

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

  const issuedAt = new Date(payment.createdAt || Date.now())
  const issuedDate = Number.isNaN(issuedAt.getTime())
    ? String(payment.createdAt || "")
    : issuedAt.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })

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

  // Amount panel
  y -= 30
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

  // Itemized details
  y -= 116
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
  page.drawRectangle({
    x: 48,
    y: y - 68,
    width: 516,
    height: 68,
    color: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
  })
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

  y -= 68
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

  // Footer
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

  return Buffer.from(await document.save())
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

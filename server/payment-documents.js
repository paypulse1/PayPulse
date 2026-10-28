import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

const colors = {
  navy: rgb(0.043, 0.122, 0.227),
  muted: rgb(0.322, 0.392, 0.486),
  border: rgb(0.847, 0.878, 0.918),
  green: rgb(0.082, 0.243, 0.173),
  background: rgb(0.973, 0.976, 0.987),
}

function formatMoney(amount) {
  return `PHP ${Number(amount).toLocaleString("en-PH", {
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

async function createDocument({ documentType, status, payment }) {
  const document = await PDFDocument.create()
  const page = document.addPage([612, 792])
  const { height } = page.getSize()
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const amount = formatMoney(payment.amount)

  page.drawRectangle({
    x: 0,
    y: height - 96,
    width: 612,
    height: 96,
    color: colors.navy,
  })
  page.drawText("DRPAY", {
    x: 48,
    y: height - 42,
    size: 22,
    font: bold,
    color: rgb(1, 1, 1),
  })
  page.drawText(documentType.toUpperCase(), {
    x: 48,
    y: height - 68,
    size: 10,
    font: bold,
    color: rgb(0.78, 0.84, 0.91),
  })

  page.drawText(documentType, {
    x: 48,
    y: height - 136,
    size: 26,
    font: bold,
    color: colors.navy,
  })
  page.drawText(status, {
    x: 564 - bold.widthOfTextAtSize(status, 9),
    y: height - 132,
    size: 9,
    font: bold,
    color: documentType === "Receipt" ? colors.green : colors.navy,
  })

  const issuedAt = new Date(payment.createdAt || Date.now())
  const issuedDate = Number.isNaN(issuedAt.getTime())
    ? String(payment.createdAt || "")
    : issuedAt.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
  const rows = [
    ["Reference number", payment.referenceNo],
    ["Issued date", issuedDate],
    ["Payment for", payment.title],
  ]

  let y = height - 180
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), {
      x: 48,
      y,
      size: 8,
      font: bold,
      color: colors.muted,
    })
    page.drawText(fitText(regular, value, 11, 360), {
      x: 48,
      y: y - 18,
      size: 11,
      font: regular,
      color: colors.navy,
    })
    page.drawLine({
      start: { x: 48, y: y - 31 },
      end: { x: 564, y: y - 31 },
      thickness: 1,
      color: colors.border,
    })
    y -= 62
  }

  page.drawRectangle({
    x: 48,
    y: y - 48,
    width: 516,
    height: 106,
    color: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
  })
  page.drawText("TOTAL AMOUNT", {
    x: 72,
    y: y + 28,
    size: 9,
    font: bold,
    color: colors.muted,
  })
  page.drawText(amount, {
    x: 72,
    y: y - 12,
    size: 24,
    font: bold,
    color: colors.navy,
  })

  page.drawText("PAYMENT DETAILS", {
    x: 48,
    y: y - 94,
    size: 9,
    font: bold,
    color: colors.navy,
  })
  page.drawText("Description", {
    x: 48,
    y: y - 124,
    size: 9,
    font: bold,
    color: colors.muted,
  })
  page.drawText(fitText(regular, payment.title, 10, 330), {
    x: 48,
    y: y - 141,
    size: 10,
    font: regular,
    color: colors.navy,
  })
  page.drawText("Amount", {
    x: 455,
    y: y - 124,
    size: 9,
    font: bold,
    color: colors.muted,
  })
  page.drawText(amount, {
    x: 564 - regular.widthOfTextAtSize(amount, 10),
    y: y - 141,
    size: 10,
    font: bold,
    color: colors.navy,
  })
  page.drawLine({
    start: { x: 48, y: y - 156 },
    end: { x: 564, y: y - 156 },
    thickness: 1,
    color: colors.border,
  })

  page.drawText(
    documentType === "Receipt"
      ? "This document confirms the payment recorded by DRPAY."
      : "This invoice requests payment of the amount stated above.",
    { x: 48, y: 74, size: 8, font: regular, color: colors.muted },
  )
  page.drawText("DRPAY generated document", {
    x: 48,
    y: 54,
    size: 8,
    font: bold,
    color: colors.navy,
  })

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

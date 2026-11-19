import { Capacitor } from "@capacitor/core"
import { Directory, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"

const receiptStyle = {
  blue: "#0f6ae3",
  card: "#f4f7fb",
  line: "#dfe7f1",
  ink: "#0d1b2a",
  slate: "#4b5d77",
  white: "#ffffff",
  font: "Manrope, sans-serif",
}

export type TransferReceiptData = {
  amount: number
  status?: string
  reference?: string
  channel?: string
  institutionName?: string
  recipientName?: string
  accountNumber?: string
  accountName?: string
  transferMethod?: string
  receiptEmail?: string
  remarks?: string
  statusLabel?: string
  createdAt?: string
  feeAmount?: number
  totalAmount?: number
  bankName?: string
  invoiceNo?: string
  refNo?: string
  sentVia?: string
}

type ReceiptSummaryRow = {
  label: string
  value: string
  type?: "default" | "amount"
}

const receiptCanvas = {
  width: 820,
  margin: 32,
  innerWidth: 756,
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = nextLine
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : [text]
}

function maskAccountNumber(value?: string) {
  const digits = (value ?? "").replace(/\D/g, "")
  if (!digits) return "—"
  if (digits.length <= 4) return `•••• ${digits}`
  const lastFour = digits.slice(-4)
  return `••••••••${lastFour}`
}

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatTransferDate(value?: string) {
  if (!value) return "Date not provided"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date)
}

function getReceiptData(receipt: TransferReceiptData) {
  const amount = Number.isFinite(receipt.amount) ? Number(receipt.amount) : 0
  const feeAmount = Number.isFinite(receipt.feeAmount)
    ? Number(receipt.feeAmount)
    : undefined
  const totalAmount = Number.isFinite(receipt.totalAmount)
    ? Number(receipt.totalAmount)
    : feeAmount === undefined
      ? undefined
      : amount + feeAmount
  const status = (receipt.status ?? "").toUpperCase()

  return {
    bank: receipt.bankName || receipt.institutionName || "—",
    accountNo: receipt.accountNumber
      ? maskAccountNumber(receipt.accountNumber)
      : "—",
    accountName: receipt.accountName || receipt.recipientName || "—",
    transferMethod:
      receipt.transferMethod ||
      (receipt.channel === "INSTAPAY"
        ? "InstaPay"
        : receipt.channel === "PESONET"
          ? "PESONet"
          : receipt.channel || "—"),
    receiptEmail: receipt.receiptEmail,
    sentVia: receipt.sentVia || "PayPulse Wallet",
    amount,
    feeAmount,
    totalAmount,
    date: formatTransferDate(receipt.createdAt),
    invoiceNo: receipt.invoiceNo,
    refNo: receipt.refNo || receipt.reference,
    statusLabel:
      receipt.statusLabel ||
      (["EXECUTED", "SUCCESS", "COMPLETED"].includes(status)
        ? "Bank Transfer Complete"
        : "Bank Transfer Submitted"),
  }
}

function receiptFileName(reference?: string) {
  const safeReference = (reference ?? "receipt").replace(/[^a-zA-Z0-9_-]/g, "_")
  return `drpay-transfer-${safeReference || "receipt"}.png`
}

async function shareReceiptBlob(blob: Blob, fileName: string) {
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    })
    await Share.share({
      title: "PayPulse transfer receipt",
      files: [file.uri],
      dialogTitle: "Save or share transfer receipt",
    })
    return
  }

  const image = new File([blob], fileName, { type: "image/png" })
  if (!navigator.canShare?.({ files: [image] }) || !navigator.share) {
    throw new Error("Image sharing is not supported in this browser.")
  }
  await navigator.share({ title: "PayPulse transfer receipt", files: [image] })
}

function drawCloseButton(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  context.strokeStyle = receiptStyle.white
  context.lineWidth = 6
  context.lineCap = "round"
  context.beginPath()
  context.moveTo(x - 18, y - 18)
  context.lineTo(x + 18, y + 18)
  context.moveTo(x + 18, y - 18)
  context.lineTo(x - 18, y + 18)
  context.stroke()
}

function drawStatusBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  complete: boolean,
) {
  context.fillStyle = receiptStyle.blue
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()

  context.strokeStyle = receiptStyle.white
  context.lineWidth = 8
  context.lineCap = "round"
  context.lineJoin = "round"
  context.beginPath()
  if (complete) {
    context.moveTo(x - radius * 0.4, y + 4)
    context.lineTo(x - radius * 0.08, y + radius * 0.47)
    context.lineTo(x + radius * 0.42, y - radius * 0.35)
  } else {
    context.arc(x, y, radius * 0.48, 0, Math.PI * 2)
    context.moveTo(x, y - radius * 0.24)
    context.lineTo(x, y)
    context.lineTo(x + radius * 0.2, y + radius * 0.12)
  }
  context.stroke()
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  )
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function loadReceiptLogo() {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const logo = new Image()
    logo.onload = () => resolve(logo)
    logo.onerror = () =>
      reject(new Error("Could not load the PayPulse logo for the receipt."))
    logo.src = "/paypulse-mark.png"
  })
}

function drawReceiptCard(
  context: CanvasRenderingContext2D,
  receipt: ReturnType<typeof getReceiptData>,
  logo: HTMLImageElement,
) {
  const { innerWidth, margin } = receiptCanvas
  const cardX = margin
  const cardY = 190
  const cardW = innerWidth
  const padding = 44
  const leftX = cardX + padding
  const rightX = cardX + cardW - padding

  context.fillStyle = receiptStyle.blue
  context.fillRect(0, 0, receiptCanvas.width, context.canvas.height)
  const logoCenterX = receiptCanvas.width / 2
  drawRoundedRect(context, logoCenterX - 37, 18, 74, 74, 18)
  context.fillStyle = receiptStyle.white
  context.fill()
  context.drawImage(logo, logoCenterX - 31, 24, 62, 62)
  context.fillStyle = receiptStyle.white
  context.font = `700 32px ${receiptStyle.font}`
  context.textAlign = "center"
  context.fillText("PayPulse", logoCenterX, 126)
  context.fillStyle = receiptStyle.white
  context.font = `600 30px ${receiptStyle.font}`
  context.textAlign = "center"
  context.fillText("Bank Transfer", logoCenterX, 169)
  context.textAlign = "left"
  drawCloseButton(context, cardX + cardW - 30, 132)

  context.fillStyle = receiptStyle.white
  drawRoundedRect(
    context,
    cardX,
    cardY,
    cardW,
    context.canvas.height - cardY - 38,
    28,
  )
  context.fill()

  context.fillStyle = receiptStyle.ink
  context.font = `700 46px ${receiptStyle.font}`
  const titleLines = wrapText(context, receipt.statusLabel, cardW - 220)
  titleLines.forEach((line, index) => {
    context.fillText(line, leftX, cardY + 92 + index * 54)
  })
  drawStatusBadge(
    context,
    rightX - 10,
    cardY + 72,
    48,
    receipt.statusLabel === "Bank Transfer Complete",
  )

  context.fillStyle = receiptStyle.slate
  context.font = `500 28px ${receiptStyle.font}`
  const subtitleY = cardY + Math.max(150, titleLines.length * 54 + 28)
  context.fillText(`Sent via ${receipt.sentVia}`, leftX, subtitleY)

  const introLines = wrapText(
    context,
    "Your transfer details are below. Keep this receipt for your records.",
    cardW - padding * 2,
  )
  context.fillStyle = receiptStyle.slate
  context.font = `500 25px ${receiptStyle.font}`
  introLines.forEach((line, index) => {
    context.fillText(line, leftX, subtitleY + 48 + index * 36)
  })

  let y = subtitleY + 48 + introLines.length * 36 + 30
  context.strokeStyle = receiptStyle.line
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(leftX, y)
  context.lineTo(rightX, y)
  context.stroke()

  const detailRows = [
    { label: "Bank", value: receipt.bank },
    { label: "Account No.", value: receipt.accountNo },
    { label: "Account Name", value: receipt.accountName },
    { label: "Transfer Method", value: receipt.transferMethod },
    ...(receipt.receiptEmail
      ? [{ label: "Receipt sent to", value: receipt.receiptEmail }]
      : []),
  ]
  y += 68
  for (const row of detailRows) {
    context.font = `600 28px ${receiptStyle.font}`
    const valueLines = wrapText(context, row.value, 360)
    const rowHeight = Math.max(72, valueLines.length * 38 + 22)

    context.fillStyle = receiptStyle.slate
    context.font = `500 28px ${receiptStyle.font}`
    context.fillText(row.label, leftX, y)
    context.fillStyle = receiptStyle.ink
    context.font = `600 28px ${receiptStyle.font}`
    context.textAlign = "right"
    valueLines.forEach((line, index) => {
      context.fillText(line, rightX, y + index * 38)
    })
    context.textAlign = "left"
    y += rowHeight
  }

  const summaryRows: ReceiptSummaryRow[] = [
    { label: "Transfer Amount", value: formatPeso(receipt.amount) },
    ...(receipt.feeAmount === undefined
      ? []
      : [{ label: "+Fee", value: formatPeso(receipt.feeAmount) }]),
    ...(receipt.totalAmount === undefined
      ? []
      : [
          {
            label: "Total",
            value: formatPeso(receipt.totalAmount),
            type: "amount" as const,
          },
        ]),
  ]

  context.beginPath()
  context.moveTo(leftX, y)
  context.lineTo(rightX, y)
  context.stroke()
  y += 58
  for (const row of summaryRows) {
    context.fillStyle = receiptStyle.ink
    context.font =
      row.type === "amount"
        ? `700 34px ${receiptStyle.font}`
        : `500 28px ${receiptStyle.font}`
    context.textAlign = "left"
    context.fillText(row.label, leftX, y)
    context.textAlign = "right"
    context.fillText(row.value, rightX, y)
    context.textAlign = "left"
    y += row.type === "amount" ? 60 : 54
  }

  context.beginPath()
  context.moveTo(leftX, y - 10)
  context.lineTo(rightX, y - 10)
  context.stroke()

  const finalRows = [
    { label: "Date", value: receipt.date },
    ...(receipt.invoiceNo
      ? [{ label: "InstaPay Invoice No.", value: receipt.invoiceNo }]
      : []),
    ...(receipt.refNo ? [{ label: "Ref No.", value: receipt.refNo }] : []),
  ]
  const lowerBlockY = y + 24
  const lowerBlockHeight = finalRows.length * 68 + 40
  context.fillStyle = receiptStyle.card
  context.fillRect(cardX, lowerBlockY, cardW, lowerBlockHeight)
  let detailBlockY = lowerBlockY + 56
  for (const row of finalRows) {
    context.fillStyle = receiptStyle.slate
    context.font = `500 28px ${receiptStyle.font}`
    context.fillText(row.label, leftX, detailBlockY)
    context.fillStyle = receiptStyle.ink
    context.font = `600 28px ${receiptStyle.font}`
    context.textAlign = "right"
    context.fillText(row.value, rightX, detailBlockY)
    context.textAlign = "left"
    detailBlockY += 64
  }

  return lowerBlockY + lowerBlockHeight + 38
}

export async function createTransferReceiptImage(receipt: TransferReceiptData) {
  const canvas = document.createElement("canvas")
  canvas.width = receiptCanvas.width

  const context = canvas.getContext("2d")
  if (!context) throw new Error("Could not draw the transfer receipt image.")

  await document.fonts.load(`500 30px ${receiptStyle.font}`)
  await document.fonts.load(`700 30px ${receiptStyle.font}`)
  const logo = await loadReceiptLogo()

  canvas.height = 2272
  const finalHeight = drawReceiptCard(context, getReceiptData(receipt), logo)
  const imageHeight = finalHeight + 38
  if (canvas.height !== imageHeight) {
    canvas.height = imageHeight
    const resizedContext = canvas.getContext("2d")
    if (!resizedContext)
      throw new Error("Could not draw the transfer receipt image.")
    drawReceiptCard(resizedContext, getReceiptData(receipt), logo)
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Could not generate the transfer receipt image."))
    }, "image/png")
  })
}

export async function downloadTransferReceiptImage(
  receipt: TransferReceiptData,
) {
  const blob = await createTransferReceiptImage(receipt)
  const fileName = receiptFileName(receipt.reference)
  if (Capacitor.isNativePlatform()) {
    await shareReceiptBlob(blob, fileName)
    return
  }

  const imageUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = imageUrl
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000)
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error("Could not prepare the receipt image for sharing."))
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== "string") {
        reject(new Error("Could not prepare the receipt image for sharing."))
        return
      }
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1))
    }
    reader.readAsDataURL(blob)
  })
}

export async function shareTransferReceiptImage(receipt: TransferReceiptData) {
  const blob = await createTransferReceiptImage(receipt)
  const fileName = receiptFileName(receipt.reference)
  await shareReceiptBlob(blob, fileName)
}

import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const drpayMarkPath = fileURLToPath(
  new URL("../public/drpay-mark.png", import.meta.url),
)
const netbankMarkPath = fileURLToPath(
  new URL("../public/powered-by/netbank.png", import.meta.url),
)
const pageWidth = 612
const pageHeight = 792
const left = 54
const right = 558
const contentWidth = right - left
const ink = rgb(0.12, 0.16, 0.2)
const muted = rgb(0.38, 0.43, 0.47)
const green = rgb(0.055, 0.2, 0.34)
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

function formatPhp(value) {
  return `PHP ${Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export async function createMerchantOnboardingGuidePdf({
  merchantName,
  providerName = "PayPulse",
  rate,
  rateSource,
  rateUpdatedAt,
  capturedAt = new Date(),
}) {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(
      "A valid KRW/PHP quote is required for the onboarding guide.",
    )
  }
  if (!rateSource || !rateUpdatedAt) {
    throw new Error("The KRW/PHP quote source and timestamp are required.")
  }

  const document = await PDFDocument.create()
  document.setTitle(`${providerName} Merchant Currency and USDT Guide`)
  document.setSubject("KRW/PHP reference conversion and USDT TRON fee guidance")
  document.setCreator("PayPulse")
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const [drpayMark, netbankMark] = await Promise.all([
    readFile(drpayMarkPath).then((image) => document.embedPng(image)),
    readFile(netbankMarkPath).then((image) => document.embedPng(image)),
  ])
  let page = document.addPage([pageWidth, pageHeight])
  const capturedDate = new Date(capturedAt)
  const sourceDate = new Date(rateUpdatedAt)
  if (
    Number.isNaN(capturedDate.getTime()) ||
    Number.isNaN(sourceDate.getTime())
  ) {
    throw new Error("The KRW/PHP quote timestamp is invalid.")
  }

  let y = pageHeight - 54
  const drawParagraph = (
    text,
    { size = 10, leading = 15, indent = 0 } = {},
  ) => {
    const lines = wrapText(regular, text, size, contentWidth - indent)
    for (const textLine of lines) {
      page.drawText(textLine, {
        x: left + indent,
        y,
        size,
        font: regular,
        color: ink,
      })
      y -= leading
    }
    y -= 5
  }
  const drawSectionHeading = (heading) => {
    page.drawText(printableText(heading), {
      x: left,
      y,
      size: 11,
      font: bold,
      color: green,
    })
    y -= 8
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.65,
      color: line,
    })
    y -= 18
  }
  const drawBullet = (text) => {
    page.drawCircle({
      x: left + 4,
      y: y + 3,
      size: 2,
      color: green,
    })
    drawParagraph(text, { indent: 14 })
  }
  const drawConfidentialFooter = () => {
    page.drawLine({
      start: { x: left, y: 48 },
      end: { x: right, y: 48 },
      thickness: 0.6,
      color: line,
    })
    page.drawText(
      `${printableText(providerName)} Merchant Currency & USDT Guide · ${capturedDate.toISOString().slice(0, 10)}`,
      { x: left, y: 34, size: 7, font: regular, color: muted },
    )
    page.drawText("CONFIDENTIAL", {
      x: right - bold.widthOfTextAtSize("CONFIDENTIAL", 7),
      y: 34,
      size: 7,
      font: bold,
      color: muted,
    })
  }

  const logoHeight = 27
  const logoWidth = logoHeight * (drpayMark.width / drpayMark.height)
  page.drawImage(drpayMark, {
    x: left,
    y: y - 3,
    width: logoWidth,
    height: logoHeight,
  })
  page.drawText(printableText(providerName), {
    x: left + logoWidth + 8,
    y: y + 8,
    size: 12,
    font: bold,
    color: green,
  })
  const netbankLogoWidth = 90
  const netbankLogoHeight =
    netbankLogoWidth * (netbankMark.height / netbankMark.width)
  page.drawText("BANKING PARTNER", {
    x: right - bold.widthOfTextAtSize("BANKING PARTNER", 6.5),
    y: y + 13,
    size: 6.5,
    font: bold,
    color: muted,
  })
  page.drawImage(netbankMark, {
    x: right - netbankLogoWidth,
    y: y - 9,
    width: netbankLogoWidth,
    height: netbankLogoHeight,
  })
  y -= 52

  page.drawText("MERCHANT CURRENCY & USDT GUIDE", {
    x: left,
    y,
    size: 18,
    font: bold,
    color: ink,
  })
  y -= 20
  page.drawText("INVITEE INFORMATION", {
    x: left,
    y,
    size: 7,
    font: bold,
    color: muted,
  })
  page.drawText(printableText(merchantName), {
    x: left + 112,
    y: y - 1,
    size: 9,
    font: regular,
    color: ink,
  })
  y -= 19
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1.1,
    color: green,
  })
  y -= 27

  drawSectionHeading("KRW COLLECTIONS AND PHP CONVERSION")
  const ratePanelHeight = 76
  page.drawRectangle({
    x: left,
    y: y - ratePanelHeight + 8,
    width: contentWidth,
    height: ratePanelHeight,
    color: panel,
    borderColor: line,
    borderWidth: 0.65,
  })
  page.drawText("INVITATION-TIME REFERENCE RATE", {
    x: left + 14,
    y: y - 12,
    size: 7,
    font: bold,
    color: muted,
  })
  page.drawText(`1 KRW = PHP ${Number(rate).toFixed(5)}`, {
    x: left + 14,
    y: y - 34,
    size: 17,
    font: bold,
    color: green,
  })
  page.drawText(
    `Source: ${printableText(rateSource)} · source updated ${sourceDate.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`,
    {
      x: left + 14,
      y: y - 52,
      size: 7,
      font: regular,
      color: muted,
    },
  )
  y -= ratePanelHeight + 16
  drawParagraph(
    `This reference rate was captured when this guide was prepared on ${capturedDate.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC. It is an informational snapshot, not a guaranteed payment or settlement rate.`,
  )
  drawBullet(
    "When creating a KRW payment request, the merchant enters the amount in KRW. PayPulse uses the active KRW/PHP rate to calculate an estimated PHP checkout amount, rounded to the nearest cent.",
  )
  drawBullet(
    "The active rate is either a Super Admin configured override or, when no override is set, an external reference rate. The checkout shows the active quote and its source.",
  )
  drawBullet(
    "Checkout and merchant settlement are in PHP. A payer's bank or payment provider may apply its own conversion rate, so the final amount charged in KRW can differ from this reference estimate.",
  )
  drawParagraph(
    `Example only: 10,000 KRW × ${Number(rate).toFixed(5)} PHP/KRW = approximately ${formatPhp(Math.round(10_000 * rate * 100) / 100)} before any payer-side conversion.`,
    { size: 9, leading: 13 },
  )

  drawConfidentialFooter()

  page = document.addPage([pageWidth, pageHeight])
  y = pageHeight - 58
  const runningLogoHeight = 19
  const runningLogoWidth =
    runningLogoHeight * (drpayMark.width / drpayMark.height)
  page.drawImage(drpayMark, {
    x: left,
    y: y - 4,
    width: runningLogoWidth,
    height: runningLogoHeight,
  })
  page.drawText(printableText(providerName), {
    x: left + runningLogoWidth + 7,
    y: y + 2,
    size: 10,
    font: bold,
    color: green,
  })
  page.drawText("MERCHANT CURRENCY & USDT GUIDE", {
    x: right - bold.widthOfTextAtSize("MERCHANT CURRENCY & USDT GUIDE", 7),
    y: y + 3,
    size: 7,
    font: bold,
    color: muted,
  })
  y -= 42
  drawSectionHeading("USDT DEPOSITS AND NETWORK FEES")
  drawBullet(
    "Use only the merchant's PayPulse-assigned TRON mainnet address and send USDT using the TRC20 network. Sending another token or using another network may result in loss of funds.",
  )
  drawBullet(
    "The sending wallet or provider sets and displays the network transaction fee at send time. It can vary with network conditions and wallet resources; review the fee and destination address before confirming.",
  )
  drawBullet(
    "PayPulse does not set a fixed USDT network-fee amount in the merchant console. Do not treat a wallet's quoted network fee as a PayPulse charge.",
  )
  drawBullet(
    "The merchant portal displays the on-chain balance and recent confirmed TRC20 deposits. A deposit appears after it is confirmed on TRON.",
  )

  y -= 2
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.6,
    color: line,
  })
  y -= 15
  drawParagraph(
    "This guide is informational. The signed Merchant Services Agreement controls contractual fees and service terms. Confirm network, address, exchange quote, and any third-party fee with the relevant wallet or payment provider before transacting.",
    { size: 8, leading: 11 },
  )

  drawConfidentialFooter()

  return Buffer.from(await document.save())
}

import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const alipayPlusLogoPath = fileURLToPath(
  new URL("../public/bank-logos/alipay-plus.svg", import.meta.url),
)
const pageWidth = 612
const pageHeight = 792
const left = 54
const right = 558
const ink = rgb(0.12, 0.16, 0.2)
const muted = rgb(0.38, 0.43, 0.47)
const blue = rgb(0.055, 0.2, 0.34)
const line = rgb(0.82, 0.86, 0.89)

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

function hexToRgb(hex) {
  const value = hex.slice(1)
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  )
}

function averageGradientColors(svg) {
  const gradients = new Map()
  for (const [, id, content] of svg.matchAll(
    /<linearGradient\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/linearGradient>/g,
  )) {
    const colors = [...content.matchAll(/stop-color="(#[\da-f]{6})"/gi)].map(
      ([, color]) => color,
    )
    if (colors.length) {
      const channels = [0, 0, 0]
      for (const color of colors) {
        const hex = color.slice(1)
        channels[0] += Number.parseInt(hex.slice(0, 2), 16)
        channels[1] += Number.parseInt(hex.slice(2, 4), 16)
        channels[2] += Number.parseInt(hex.slice(4, 6), 16)
      }
      gradients.set(
        id,
        rgb(...channels.map((channel) => channel / colors.length / 255)),
      )
    }
  }
  return gradients
}

function drawAlipayPlusLogo(page, svg, top) {
  const scale = 150 / 164
  const gradients = averageGradientColors(svg)
  for (const [, path, fill] of svg.matchAll(
    /<path\b[^>]*d="([^"]+)"[^>]*fill="([^"]+)"[^>]*>/g,
  )) {
    let color
    if (fill.startsWith("url(#") && fill.endsWith(")")) {
      color = gradients.get(fill.slice(5, -1))
    } else if (
      /^#[\da-f]{6}$/i.test(fill) &&
      fill.toLowerCase() !== "#ffffff"
    ) {
      color = hexToRgb(fill)
    }
    if (color) {
      page.drawSvgPath(path, {
        x: left,
        y: pageHeight - top,
        scale,
        color,
      })
    }
  }
}

export async function createAlipayPlusAgreementPdf({
  agreementId,
  merchantName,
  merchantEmail,
  merchantAddress = "",
  contactPerson = "",
  phoneNumber = "",
  providerName = "DRPAY",
  providerAddress = "",
  providerRegistrationNumber = "",
  templateVersion = "",
  createdAt = new Date(),
}) {
  const agreementDate = new Date(createdAt)
  if (Number.isNaN(agreementDate.getTime())) {
    throw new Error("The Alipay+ agreement date is invalid.")
  }

  const svg = await readFile(alipayPlusLogoPath, "utf8")
  const document = await PDFDocument.create()
  document.setTitle("Alipay+ International Payment Services Agreement")
  document.setSubject(`Alipay+ merchant agreement ${agreementId}`)
  document.setCreator("DRPAY")
  const regular = await document.embedFont(StandardFonts.TimesRoman)
  const bold = await document.embedFont(StandardFonts.TimesRomanBold)
  const sans = await document.embedFont(StandardFonts.Helvetica)
  const sansBold = await document.embedFont(StandardFonts.HelveticaBold)
  const page = document.addPage([pageWidth, pageHeight])
  const businessName = printableText(merchantName || merchantEmail)
  const drpayName = printableText(providerName)
  let y = pageHeight - 118

  drawAlipayPlusLogo(page, svg, 53)
  page.drawText("INTERNATIONAL PAYMENT SERVICES", {
    x: right - sansBold.widthOfTextAtSize("INTERNATIONAL PAYMENT SERVICES", 7),
    y: pageHeight - 48,
    size: 7,
    font: sansBold,
    color: muted,
  })
  page.drawText("ALIPAY+ INTERNATIONAL PAYMENT SERVICES AGREEMENT", {
    x: left,
    y,
    size: 17,
    font: bold,
    color: ink,
  })
  y -= 28
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1.1,
    color: blue,
  })
  y -= 27

  const drawParagraph = (
    text,
    { size = 10, leading = 15, indent = 0 } = {},
  ) => {
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
    y -= 7
  }
  const drawSection = (heading, text) => {
    page.drawText(heading, {
      x: left,
      y,
      size: 11,
      font: bold,
      color: blue,
    })
    y -= 18
    drawParagraph(text)
  }

  page.drawText("PARTIES", {
    x: left,
    y,
    size: 8,
    font: sansBold,
    color: muted,
  })
  y -= 17
  drawParagraph(
    `This Agreement is made between ${drpayName} ("DRPAY") and ${businessName} ("Merchant").`,
    { size: 11, leading: 16 },
  )
  for (const detail of [
    providerAddress && `DRPAY address: ${providerAddress}`,
    providerRegistrationNumber &&
      `DRPAY registration number: ${providerRegistrationNumber}`,
    `Merchant contact: ${contactPerson || merchantEmail} (${merchantEmail})`,
    merchantAddress && `Merchant registered address: ${merchantAddress}`,
    phoneNumber && `Merchant phone: ${phoneNumber}`,
  ].filter(Boolean)) {
    drawParagraph(detail, { size: 8, leading: 11 })
  }
  y -= 5

  drawSection(
    "1. PURPOSE",
    "This Agreement records the parties' arrangement for international payment services made available to Merchant through DRPAY.",
  )
  drawSection(
    "2. DESIGNATED SERVICE PROVIDER",
    "Alipay+ is the designated provider for international collection and outbound transfer services made available to Merchant through DRPAY.",
  )
  drawSection(
    "3. MERCHANT ACKNOWLEDGMENT",
    "Merchant acknowledges Alipay+ as the provider of the international collection and outbound transfer services identified in this Agreement.",
  )
  drawSection(
    "4. RELATED AGREEMENT",
    "This Agreement supplements the Merchant Services Agreement between DRPAY and Merchant. Commercial terms are set out in that separate agreement.",
  )

  const signatureTop = 218
  page.drawLine({
    start: { x: left, y: signatureTop },
    end: { x: right, y: signatureTop },
    thickness: 0.6,
    color: line,
  })
  page.drawText("ACCEPTED AND AGREED", {
    x: left,
    y: signatureTop - 22,
    size: 8,
    font: sansBold,
    color: muted,
  })
  const columnGap = 38
  const columnWidth = (right - left - columnGap) / 2
  const columns = [
    { x: left, label: "For DRPAY", name: drpayName },
    {
      x: left + columnWidth + columnGap,
      label: "For Merchant",
      name: businessName,
    },
  ]
  for (const column of columns) {
    const signatureY = signatureTop - 88
    page.drawLine({
      start: { x: column.x, y: signatureY },
      end: { x: column.x + columnWidth, y: signatureY },
      thickness: 0.7,
      color: muted,
    })
    page.drawText(column.label, {
      x: column.x,
      y: signatureY - 16,
      size: 9,
      font: sansBold,
      color: ink,
    })
    page.drawText(column.name, {
      x: column.x,
      y: signatureY - 32,
      size: 9,
      font: regular,
      color: ink,
    })
    page.drawText("Authorized representative", {
      x: column.x,
      y: signatureY - 47,
      size: 8,
      font: sans,
      color: muted,
    })
    page.drawText("Date: ____________________", {
      x: column.x,
      y: signatureY - 66,
      size: 8,
      font: sans,
      color: muted,
    })
  }

  const footer = `Alipay+ Agreement  |  ${printableText(agreementId)}  |  ${
    templateVersion ? `v${printableText(templateVersion)}  |  ` : ""
  }${agreementDate.toISOString().slice(0, 10)}`
  page.drawLine({
    start: { x: left, y: 48 },
    end: { x: right, y: 48 },
    thickness: 0.6,
    color: line,
  })
  page.drawText(footer, {
    x: left,
    y: 34,
    size: 7,
    font: sans,
    color: muted,
  })
  page.drawText("ALIPAY+", {
    x: right - sansBold.widthOfTextAtSize("ALIPAY+", 7),
    y: 34,
    size: 7,
    font: sansBold,
    color: muted,
  })

  return Buffer.from(await document.save())
}

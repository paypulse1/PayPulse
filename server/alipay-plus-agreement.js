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
    throw new Error("The Alipay+ addendum date is invalid.")
  }

  const svg = await readFile(alipayPlusLogoPath, "utf8")
  const document = await PDFDocument.create()
  document.setTitle("Alipay+ Service Access and Incorporation Addendum")
  document.setSubject(`DRPAY-merchant addendum ${agreementId}`)
  document.setCreator("DRPAY")
  const regular = await document.embedFont(StandardFonts.TimesRoman)
  const bold = await document.embedFont(StandardFonts.TimesRomanBold)
  const sans = await document.embedFont(StandardFonts.Helvetica)
  const sansBold = await document.embedFont(StandardFonts.HelveticaBold)
  const businessName = printableText(merchantName || merchantEmail)
  const drpayName = printableText(providerName)
  const pages = []
  let page
  let y

  function addPage() {
    page = document.addPage([pageWidth, pageHeight])
    pages.push(page)
    if (pages.length === 1) {
      drawAlipayPlusLogo(page, svg, 53)
      page.drawText("SERVICE ACCESS & INCORPORATION ADDENDUM", {
        x: left,
        y: pageHeight - 119,
        size: 15,
        font: bold,
        color: ink,
      })
      page.drawText("DRPAY-MERCHANT CONTRACT", {
        x: left,
        y: pageHeight - 139,
        size: 8,
        font: sansBold,
        color: blue,
      })
      y = pageHeight - 169
    } else {
      page.drawText("ALIPAY+ SERVICE ACCESS & INCORPORATION ADDENDUM", {
        x: left,
        y: pageHeight - 47,
        size: 8,
        font: sansBold,
        color: muted,
      })
      y = pageHeight - 72
      page.drawLine({
        start: { x: left, y },
        end: { x: right, y },
        thickness: 0.6,
        color: line,
      })
      y -= 25
    }
  }

  function ensureSpace(height) {
    if (y - height < 76) addPage()
  }

  function drawParagraph(text, { size = 9.5, leading = 13.5 } = {}) {
    for (const textLine of wrapText(regular, text, size, right - left)) {
      ensureSpace(leading)
      page.drawText(textLine, {
        x: left,
        y,
        size,
        font: regular,
        color: ink,
      })
      y -= leading
    }
    y -= 4
  }

  function drawSection(heading, text) {
    ensureSpace(44)
    page.drawText(heading, {
      x: left,
      y,
      size: 10,
      font: bold,
      color: blue,
    })
    y -= 15
    drawParagraph(text)
  }

  addPage()
  const details = [
    providerAddress && `DRPAY address: ${providerAddress}`,
    providerRegistrationNumber &&
      `DRPAY registration number: ${providerRegistrationNumber}`,
    `Merchant: ${businessName}`,
    `Merchant contact: ${contactPerson || merchantEmail} (${merchantEmail})`,
    merchantAddress && `Registered address: ${merchantAddress}`,
    phoneNumber && `Phone: ${phoneNumber}`,
    `Agreement date: ${agreementDate.toISOString().slice(0, 10)}`,
  ].filter(Boolean)
  drawParagraph(
    `This Addendum is entered into by ${drpayName} ("DRPAY") and ${businessName} ("Merchant").`,
    { size: 10.5, leading: 15 },
  )
  for (const detail of details) drawParagraph(detail, { size: 8, leading: 10 })

  drawSection(
    "1. PURPOSE AND SERVICE MODEL",
    "This Addendum governs Merchant's conditional access, through DRPAY, to payment services that may use the Alipay+ platform. Alipay+ is a service brand, not a named contracting entity under this Addendum. The particular Alipay+ legal entity, acquirer, payment service provider, wallet operator, and services available to Merchant depend on the written onboarding and service-activation documents supplied for Merchant's market and product.",
  )
  drawSection(
    "2. CONTRACTING PARTIES; NO ALIPAY+ REPRESENTATION",
    `This Addendum is a contract only between DRPAY and Merchant. Alipay+, Ant International, their affiliates, wallet operators, and acquiring partners are not parties to it and do not assume obligations under it by its execution. DRPAY does not represent that it is Alipay+, its agent, or authorized to bind any such entity. The Alipay+ mark is used only to identify the relevant service. No direct merchant relationship, approval, or endorsement by Alipay+ is represented by this Addendum.`,
  )
  drawSection(
    "3. INCORPORATION OF IDENTIFIED SERVICE TERMS",
    "No third-party terms are incorporated merely by reference to the Alipay+ name, logo, or public marketing website. Before Alipay+ transactions are enabled, DRPAY or the relevant acquirer must deliver to Merchant the applicable Alipay+, acquirer, wallet, and payment-network terms, identify each document by its issuing entity, title, version or effective date, and provide a copy or working link. Those identified documents form the Service Terms Schedule to this Addendum only after Merchant has had an opportunity to review and accept them. Until then, Merchant is not treated as having accepted undisclosed third-party terms and DRPAY must not enable Alipay+ transaction processing for Merchant.",
  )
  drawSection(
    "4. SERVICE TERMS SCHEDULE AND CHANGES",
    "The Service Terms Schedule may be completed in a separate written activation notice that identifies the documents and Merchant's recorded acceptance. The official Alipay+ merchant page at https://www.alipayplus.com/merchant describes services but is informational and is not itself incorporated as a contract. If a third-party provider changes an incorporated document, DRPAY will provide the updated document or link and effective date before applying the change to Merchant, where the provider and law permit. If Merchant does not accept a material change, Merchant may stop using the affected service and terminate that service under this Addendum; accrued obligations remain due.",
  )
  drawSection(
    "5. MERCHANT RESPONSIBILITIES",
    "Merchant will provide complete and accurate onboarding, beneficial-ownership, business, product, and transaction information; maintain required registrations and permissions; use the services only for its approved business; protect credentials and payment data; keep transaction and refund records; and comply with applicable law and the Service Terms Schedule once accepted. Merchant will promptly notify DRPAY of suspected fraud, unauthorized access, material business changes, or a regulatory or security incident affecting the services.",
  )
  drawSection(
    "6. TRANSACTIONS, SETTLEMENT, AND ADJUSTMENTS",
    "Transaction acceptance, currency, settlement timing, reserves, refunds, reversals, disputes, chargebacks, and service fees are governed by the Merchant Services Agreement and the applicable accepted Service Terms Schedule. This Addendum does not create a settlement promise, guarantee transaction approval, or change the Merchant Services Agreement's disclosed fee schedule. DRPAY will account to Merchant for amounts it actually receives for Merchant, subject to those agreements and applicable law.",
  )
  drawSection(
    "7. CONTROLS AND SERVICE AVAILABILITY",
    "Alipay+, an acquirer, wallet operator, or DRPAY may reject, delay, review, restrict, or suspend transactions or service access when required by applicable law, an accepted Service Terms Schedule, a security or fraud concern, an operational interruption, or a reasonable compliance review. Where permitted, the responsible party will give notice and the reason for the action. DRPAY will use reasonable efforts to relay notices it receives from a third-party provider but cannot guarantee that provider's availability or decision.",
  )
  drawSection(
    "8. DATA, SECURITY, AND CONFIDENTIALITY",
    "Each party will handle personal information and confidential information in accordance with applicable data-protection law, the privacy notices provided for the service, the Merchant Services Agreement, and the accepted Service Terms Schedule. Merchant will provide required notices and obtain required permissions from its customers. Neither party may use another party's confidential information except to perform or exercise rights under the applicable agreements or as required by law.",
  )
  drawSection(
    "9. INTELLECTUAL PROPERTY AND BRAND",
    "Alipay+, Ant International, wallet-provider, and acquirer names, marks, software, and materials remain the property of their respective owners. Merchant receives no ownership or general licence to those materials. Merchant may use service marks only as permitted by the relevant brand guidelines and accepted Service Terms Schedule, and must stop such use when its authorization ends.",
  )
  drawSection(
    "10. TERM, SUSPENSION, AND TERMINATION",
    "This Addendum takes effect when signed by both parties and continues while the relevant services are enabled. Either party may terminate the Alipay+ service on written notice, subject to the Merchant Services Agreement and any accepted Service Terms Schedule. DRPAY may suspend access immediately where necessary to address legal, security, fraud, provider, or material breach risks, and will notify Merchant when reasonably practicable. Termination does not affect completed transactions, accrued payment obligations, or clauses that by their nature continue.",
  )
  drawSection(
    "11. ORDER OF PRECEDENCE; GENERAL",
    "Applicable law prevails. For Alipay+ network eligibility and transaction-processing requirements, the applicable accepted Service Terms Schedule controls solely to the extent it cannot be reconciled with this Addendum. This Addendum controls the parties' Alipay+ service-access arrangement; the Merchant Services Agreement controls DRPAY commercial terms, fees, settlement, and other merchant services. Any amendment between DRPAY and Merchant must be in writing. This Addendum may be signed electronically and in counterparts. Governing law and dispute procedures are those stated in the Merchant Services Agreement.",
  )

  addPage()
  page.drawText("SCHEDULE A - IDENTIFIED THIRD-PARTY SERVICE TERMS", {
    x: left,
    y,
    size: 10,
    font: bold,
    color: blue,
  })
  y -= 18
  drawParagraph(
    "Complete this schedule and deliver each listed document to Merchant before enabling the related service. Identify the actual issuing legal entity and the exact document/version. A blank or incomplete entry does not incorporate terms. Merchant's signature below accepts only the completed, delivered entries listed here.",
    { size: 8.5, leading: 12 },
  )

  for (let index = 0; index < 3; index += 1) {
    ensureSpace(112)
    const boxTop = y
    page.drawRectangle({
      x: left,
      y: boxTop - 102,
      width: right - left,
      height: 102,
      borderColor: line,
      borderWidth: 0.7,
    })
    page.drawText(`DOCUMENT ${index + 1}`, {
      x: left + 9,
      y: boxTop - 15,
      size: 7,
      font: sansBold,
      color: muted,
    })
    page.drawText("Issuing legal entity:", {
      x: left + 9,
      y: boxTop - 32,
      size: 7,
      font: sans,
      color: ink,
    })
    page.drawLine({
      start: { x: left + 92, y: boxTop - 34 },
      end: { x: right - 10, y: boxTop - 34 },
      thickness: 0.5,
      color: line,
    })
    page.drawText("Document title and version / effective date:", {
      x: left + 9,
      y: boxTop - 50,
      size: 7,
      font: sans,
      color: ink,
    })
    page.drawLine({
      start: { x: left + 164, y: boxTop - 52 },
      end: { x: right - 10, y: boxTop - 52 },
      thickness: 0.5,
      color: line,
    })
    page.drawText("Copy or working link delivered to Merchant:", {
      x: left + 9,
      y: boxTop - 68,
      size: 7,
      font: sans,
      color: ink,
    })
    page.drawLine({
      start: { x: left + 158, y: boxTop - 70 },
      end: { x: right - 10, y: boxTop - 70 },
      thickness: 0.5,
      color: line,
    })
    page.drawText("Related product / market:", {
      x: left + 9,
      y: boxTop - 86,
      size: 7,
      font: sans,
      color: ink,
    })
    page.drawLine({
      start: { x: left + 102, y: boxTop - 88 },
      end: { x: right - 10, y: boxTop - 88 },
      thickness: 0.5,
      color: line,
    })
    y = boxTop - 112
  }

  ensureSpace(92)
  page.drawText("Merchant acceptance of the completed Service Terms Schedule", {
    x: left,
    y,
    size: 8,
    font: sansBold,
    color: ink,
  })
  y -= 34
  page.drawLine({
    start: { x: left, y },
    end: { x: left + 275, y },
    thickness: 0.7,
    color: muted,
  })
  page.drawLine({
    start: { x: right - 135, y },
    end: { x: right, y },
    thickness: 0.7,
    color: muted,
  })
  page.drawText("Merchant authorized representative", {
    x: left,
    y: y - 13,
    size: 7,
    font: sans,
    color: muted,
  })
  page.drawText("Date", {
    x: right - 135,
    y: y - 13,
    size: 7,
    font: sans,
    color: muted,
  })

  ensureSpace(190)
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.6,
    color: line,
  })
  y -= 21
  page.drawText("AGREED BY THE CONTRACTING PARTIES", {
    x: left,
    y,
    size: 8,
    font: sansBold,
    color: muted,
  })
  y -= 67
  const columnGap = 38
  const columnWidth = (right - left - columnGap) / 2
  for (const column of [
    { x: left, label: "For DRPAY", name: drpayName },
    {
      x: left + columnWidth + columnGap,
      label: "For Merchant",
      name: businessName,
    },
  ]) {
    page.drawLine({
      start: { x: column.x, y },
      end: { x: column.x + columnWidth, y },
      thickness: 0.7,
      color: muted,
    })
    page.drawText(column.label, {
      x: column.x,
      y: y - 15,
      size: 8,
      font: sansBold,
      color: ink,
    })
    page.drawText(column.name, {
      x: column.x,
      y: y - 29,
      size: 8,
      font: regular,
      color: ink,
    })
    page.drawText("Authorized representative", {
      x: column.x,
      y: y - 43,
      size: 7,
      font: sans,
      color: muted,
    })
    page.drawText("Name / title: __________________", {
      x: column.x,
      y: y - 57,
      size: 7,
      font: sans,
      color: muted,
    })
    page.drawText("Date: ________________________", {
      x: column.x,
      y: y - 71,
      size: 7,
      font: sans,
      color: muted,
    })
  }

  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: left, y: 48 },
      end: { x: right, y: 48 },
      thickness: 0.6,
      color: line,
    })
    currentPage.drawText(
      `DRPAY–Merchant Addendum | ${printableText(agreementId)} | ${agreementDate.toISOString().slice(0, 10)}${
        templateVersion ? ` | v${printableText(templateVersion)}` : ""
      }`,
      {
        x: left,
        y: 34,
        size: 6.5,
        font: sans,
        color: muted,
      },
    )
    const pageLabel = `${index + 1} / ${pages.length}`
    currentPage.drawText(pageLabel, {
      x: right - sans.widthOfTextAtSize(pageLabel, 7),
      y: 34,
      size: 7,
      font: sans,
      color: muted,
    })
  })

  return Buffer.from(await document.save())
}

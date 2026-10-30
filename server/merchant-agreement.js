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
const textWidth = right - left
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

export async function createMerchantAgreementPdf({
  agreementId,
  merchantEmail,
  businessName,
  contactPerson,
  businessAddress,
  phoneNumber,
  providerName = "DRPAY",
  providerAddress = "",
  providerRegistrationNumber = "",
  collectionFeePercent = 0.5,
  transferFeeFixed = 15,
  activationFee = 5000,
  createdAt = new Date(),
}) {
  const document = await PDFDocument.create()
  document.setTitle(`${providerName} Merchant Services Agreement`)
  document.setSubject(`Merchant agreement ${agreementId}`)
  document.setCreator("DRPAY")
  const regular = await document.embedFont(StandardFonts.TimesRoman)
  const bold = await document.embedFont(StandardFonts.TimesRomanBold)
  const sans = await document.embedFont(StandardFonts.Helvetica)
  const sansBold = await document.embedFont(StandardFonts.HelveticaBold)
  const [drpayMark, netbankMark] = await Promise.all([
    readFile(drpayMarkPath).then((image) => document.embedPng(image)),
    readFile(netbankMarkPath).then((image) => document.embedPng(image)),
  ])
  const pages = []
  let page
  let y

  function addPage() {
    page = document.addPage([pageWidth, pageHeight])
    pages.push(page)
    y = pageHeight - 58
    if (pages.length > 1) {
      const runningLogoHeight = 17
      const runningLogoWidth =
        runningLogoHeight * (drpayMark.width / drpayMark.height)
      page.drawImage(drpayMark, {
        x: left,
        y: y - 4,
        width: runningLogoWidth,
        height: runningLogoHeight,
      })
      page.drawText(printableText(providerName), {
        x: left + runningLogoWidth + 6,
        y: y + 1,
        size: 9,
        font: sansBold,
        color: green,
      })
      page.drawText("MERCHANT SERVICES AGREEMENT", {
        x: right - sansBold.widthOfTextAtSize("MERCHANT SERVICES AGREEMENT", 8),
        y,
        size: 8,
        font: sansBold,
        color: muted,
      })
      y -= 25
      page.drawLine({
        start: { x: left, y },
        end: { x: right, y },
        thickness: 1,
        color: line,
      })
      y -= 26
    }
  }

  function ensureSpace(height) {
    if (y - height < 68) addPage()
  }

  function drawParagraph(
    text,
    { font = regular, size = 10, leading = 15, indent = 0 } = {},
  ) {
    const lines = wrapText(
      font,
      String(text).replaceAll("DRPAY", providerName),
      size,
      textWidth - indent,
    )
    for (const textLine of lines) {
      ensureSpace(leading)
      page.drawText(textLine, {
        x: left + indent,
        y,
        size,
        font,
        color: ink,
      })
      y -= leading
    }
    y -= 5
  }

  function drawHeading(text) {
    ensureSpace(34)
    page.drawText(printableText(text), {
      x: left,
      y,
      size: 11.5,
      font: bold,
      color: green,
    })
    y -= 7
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.55,
      color: line,
    })
    y -= 18
  }

  addPage()
  const logoHeight = 29
  const logoWidth = logoHeight * (drpayMark.width / drpayMark.height)
  page.drawImage(drpayMark, {
    x: left,
    y: y - 5,
    width: logoWidth,
    height: logoHeight,
  })
  page.drawText("DRPAY", {
    x: left + logoWidth + 8,
    y: y + 7,
    size: 13,
    font: sansBold,
    color: green,
  })
  page.drawText("MERCHANT PAYMENT SERVICES", {
    x: left + logoWidth + 8,
    y: y - 5,
    size: 6.5,
    font: sans,
    color: muted,
  })
  const netbankLogoWidth = 100
  const netbankLogoHeight =
    netbankLogoWidth * (netbankMark.height / netbankMark.width)
  page.drawText("BANKING PARTNER", {
    x: right - sansBold.widthOfTextAtSize("BANKING PARTNER", 6.5),
    y: y + 15,
    size: 6.5,
    font: sansBold,
    color: muted,
  })
  page.drawImage(netbankMark, {
    x: right - netbankLogoWidth,
    y: y - 8,
    width: netbankLogoWidth,
    height: netbankLogoHeight,
  })
  y -= 51
  page.drawText("MERCHANT SERVICES AGREEMENT", {
    x:
      (pageWidth - bold.widthOfTextAtSize("MERCHANT SERVICES AGREEMENT", 18)) /
      2,
    y,
    size: 18,
    font: bold,
    color: ink,
  })
  y -= 22
  const statusLabel = "AGREEMENT FOR SIGNATURE"
  page.drawText(statusLabel, {
    x: (pageWidth - sansBold.widthOfTextAtSize(statusLabel, 7)) / 2,
    y,
    size: 7,
    font: sansBold,
    color: muted,
  })
  y -= 16
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1.2,
    color: green,
  })
  y -= 17
  const metadataTop = y + 7
  const metadataHeight = 35
  page.drawRectangle({
    x: left,
    y: metadataTop - metadataHeight,
    width: textWidth,
    height: metadataHeight,
    color: panel,
    borderColor: line,
    borderWidth: 0.6,
  })
  page.drawText("AGREEMENT REFERENCE", {
    x: left + 12,
    y: metadataTop - 13,
    size: 6.5,
    font: sansBold,
    color: muted,
  })
  page.drawText(printableText(agreementId), {
    x: left + 12,
    y: metadataTop - 27,
    size: 9,
    font: sans,
    color: ink,
  })
  const preparedDate = new Date(createdAt).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  page.drawText("DATE PREPARED", {
    x: right - 150,
    y: metadataTop - 13,
    size: 6.5,
    font: sansBold,
    color: muted,
  })
  page.drawText(preparedDate, {
    x: right - 150,
    y: metadataTop - 27,
    size: 9,
    font: sans,
    color: ink,
  })
  y = metadataTop - metadataHeight - 22

  drawHeading("CONTRACTING PARTIES")
  drawParagraph(
    `This Merchant Services Agreement ("Agreement") is entered into by ${providerName} ("${providerName}") and the merchant identified below ("Merchant"). Each party agrees to the terms in this Agreement when its authorized representative signs. The Agreement takes effect on the date of the last signature, subject to the activation condition in Section 3.`,
  )
  const partyColumnWidth = textWidth / 2 - 20
  const partyNameLines = [
    wrapText(bold, providerName, 9.5, partyColumnWidth),
    wrapText(bold, businessName, 9.5, partyColumnWidth),
  ]
  const partyDetails = [
    [
      ...(providerAddress ? [`Address: ${providerAddress}`] : []),
      ...(providerRegistrationNumber
        ? [`Registration No.: ${providerRegistrationNumber}`]
        : []),
    ],
    [
      `Authorized contact: ${contactPerson}`,
      `Email: ${merchantEmail}`,
      `Registered address: ${businessAddress}`,
      ...(phoneNumber ? [`Phone: ${phoneNumber}`] : []),
    ],
  ].map((details) =>
    details.flatMap((detail) => wrapText(regular, detail, 8, partyColumnWidth)),
  )
  const nameLineCount = Math.max(...partyNameLines.map((lines) => lines.length))
  const detailLineCount = Math.max(
    ...partyDetails.map((details) => details.length),
  )
  const dividerOffset = 42 + (nameLineCount - 1) * 11
  const firstDetailsOffset = dividerOffset + 17
  const lastDetailsOffset = firstDetailsOffset + (detailLineCount - 1) * 11
  const partyPanelHeight = lastDetailsOffset + 16
  ensureSpace(partyPanelHeight + 10)
  const partyPanelTop = y + 7
  page.drawRectangle({
    x: left,
    y: partyPanelTop - partyPanelHeight,
    width: textWidth,
    height: partyPanelHeight,
    color: panel,
    borderColor: line,
    borderWidth: 0.6,
  })
  page.drawText("SERVICE PROVIDER", {
    x: left + 12,
    y: partyPanelTop - 17,
    size: 6.5,
    font: sansBold,
    color: muted,
  })
  page.drawText("MERCHANT", {
    x: left + textWidth / 2 + 8,
    y: partyPanelTop - 17,
    size: 6.5,
    font: sansBold,
    color: muted,
  })
  partyNameLines.forEach((lines, columnIndex) => {
    lines.forEach((nameLine, lineIndex) => {
      page.drawText(nameLine, {
        x: columnIndex === 0 ? left + 12 : left + textWidth / 2 + 8,
        y: partyPanelTop - 33 - lineIndex * 11,
        size: 9.5,
        font: bold,
        color: ink,
      })
    })
  })
  page.drawLine({
    start: { x: left + 12, y: partyPanelTop - dividerOffset },
    end: { x: right - 12, y: partyPanelTop - dividerOffset },
    thickness: 0.5,
    color: line,
  })
  partyDetails.forEach((details, columnIndex) => {
    details.forEach((detail, lineIndex) => {
      page.drawText(detail, {
        x: columnIndex === 0 ? left + 12 : left + textWidth / 2 + 8,
        y: partyPanelTop - firstDetailsOffset - lineIndex * 11,
        size: 8,
        font: regular,
        color: ink,
      })
    })
  })
  y = partyPanelTop - partyPanelHeight - 18

  const feeSchedule = [
    [
      "Successful payment collection",
      `${Number(collectionFeePercent)}% of amount collected`,
    ],
    [
      "Completed interbank transfer",
      `PHP ${Number(transferFeeFixed).toFixed(2)} per transfer`,
    ],
    [
      "One-time account activation",
      `PHP ${Number(activationFee).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ],
  ]

  function drawFeeSchedule() {
    const rowHeight = 25
    const tableHeight = rowHeight * (feeSchedule.length + 1)
    ensureSpace(tableHeight + 8)
    const tableTop = y + 5
    const labelColumn = left + 12
    const amountColumn = left + 335
    page.drawRectangle({
      x: left,
      y: tableTop - tableHeight,
      width: textWidth,
      height: tableHeight,
      color: panel,
      borderColor: line,
      borderWidth: 0.65,
    })
    page.drawRectangle({
      x: left,
      y: tableTop - rowHeight,
      width: textWidth,
      height: rowHeight,
      color: green,
    })
    page.drawText("FEE", {
      x: labelColumn,
      y: tableTop - 16,
      size: 7,
      font: sansBold,
      color: rgb(1, 1, 1),
    })
    page.drawText("RATE", {
      x: amountColumn,
      y: tableTop - 16,
      size: 7,
      font: sansBold,
      color: rgb(1, 1, 1),
    })
    feeSchedule.forEach(([label, amount], index) => {
      const rowTop = tableTop - rowHeight * (index + 1)
      const rowTextY = rowTop - 16
      page.drawText(label, {
        x: labelColumn,
        y: rowTextY,
        size: 9,
        font: regular,
        color: ink,
      })
      page.drawText(amount, {
        x: amountColumn,
        y: rowTextY,
        size: 9,
        font: bold,
        color: ink,
      })
      if (index < feeSchedule.length - 1) {
        page.drawLine({
          start: { x: left + 10, y: rowTop - rowHeight },
          end: { x: right - 10, y: rowTop - rowHeight },
          thickness: 0.4,
          color: line,
        })
      }
    })
    y = tableTop - tableHeight - 12
  }

  const terms = [
    [
      "1. Services and account approval",
      "DRPAY will provide the Merchant access to its merchant payment services, including payment collection, payment links, transaction records, and interbank transfer functionality, subject to account approval, technical availability, and this Agreement. The Merchant must provide complete and accurate business and beneficial-owner information and any documents reasonably required for identity, business, and compliance checks. An account invitation or signature does not waive those checks.",
    ],
    [
      "2. Merchant account and responsibilities",
      "The Merchant must keep its business, contact, payout, and verification information accurate and current; protect its passwords, MPIN, verification codes, devices, and API credentials; and promptly report suspected unauthorized access. The Merchant is responsible for its goods and services, customer disclosures, fulfillment, customer support, refunds, and all activity initiated through its account. The Merchant must not use the services for unlawful activity or a business or transaction prohibited by applicable law or payment-network rules.",
    ],
    [
      "4. Activation and fees",
      `A one-time account activation fee of PHP ${Number(activationFee).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is payable from the Merchant's own ${providerName} wallet. ${providerName} will activate interbank transfers and the other merchant services after the full activation fee has been collected and recorded in that wallet. Until then, those services remain inactive.`,
      `The fees below apply to the Merchant's use of the services. No interbank transfer fee of PHP ${Number(transferFeeFixed).toFixed(2)} is charged for a transfer that does not complete successfully. Fees are stated in Philippine pesos and may be deducted from the relevant merchant wallet or settlement proceeds.`,
    ],
    [
      "5. Payment processing and settlement",
      "Payment and transfer instructions are subject to acceptance and processing by the relevant financial institution, payment network, and service provider. Processing and settlement timing may vary by transaction, institution, operating hours, compliance review, and technical availability. DRPAY will make transaction status and wallet records available through the merchant service where supported. The Merchant must promptly review those records and report an apparent error with the relevant transaction reference.",
    ],
    [
      "6. Reversals, disputes, and reserves",
      "A payment may be reversed, refunded, disputed, or adjusted under applicable law, payment-network rules, or the relevant provider's requirements. The Merchant is responsible for valid refunds and losses attributable to its goods, services, instructions, or breach of this Agreement. DRPAY may delay settlement or restrict funds only to the extent reasonably necessary to investigate a disputed or suspicious transaction, comply with law or a provider requirement, prevent loss, or resolve an amount owed under this Agreement. DRPAY will release any remaining restricted funds when the reason for the restriction has ended, subject to applicable law and provider rules.",
    ],
    [
      "7. Compliance and information",
      "Each party will comply with laws and regulations applicable to it and to the services and transactions under this Agreement, including applicable requirements of the Philippines and the Republic of Korea. The Merchant authorizes DRPAY to use and share its account and transaction information as reasonably necessary to provide the services, verify the Merchant, prevent fraud, meet legal or regulatory obligations, and work with financial institutions and payment providers, subject to applicable data-protection law and DRPAY's privacy notice.",
    ],
    [
      "8. Security, availability, and suspension",
      "The Merchant must use reasonable security measures to protect its account and promptly notify DRPAY of suspected compromise. DRPAY will use reasonable operational measures to provide the services but does not guarantee uninterrupted or error-free availability. DRPAY may suspend or limit access where reasonably necessary to address a security threat, suspected fraud or unlawful activity, a material breach, a legal or provider requirement, or a risk to users or the payment system. Where legally and practically permitted, DRPAY will notify the Merchant of the reason and the steps required to restore access.",
    ],
    [
      "9. Term and termination",
      "This Agreement continues until terminated. Either party may terminate it by giving the other party 30 days' written notice. DRPAY may terminate or suspend access immediately where required by law or a provider, or where a material breach, fraud, or security risk requires immediate action. Termination does not cancel fees, refunds, disputes, or other obligations incurred before termination. The parties will cooperate in completing or resolving pending transactions, subject to applicable law and provider rules.",
    ],
    [
      "10. Liability and indemnity",
      "Each party remains responsible for its own acts and omissions. To the extent permitted by applicable law, neither party is liable to the other for indirect or consequential loss that was not reasonably foreseeable when this Agreement was made. Nothing in this Agreement excludes liability that cannot lawfully be excluded. The Merchant will indemnify DRPAY for third-party claims and reasonable direct costs to the extent caused by the Merchant's unlawful activity, its products or services, its breach of this Agreement, or its instructions, except to the extent caused by DRPAY's own breach or misconduct.",
    ],
    [
      "11. Notices, changes, and entire agreement",
      "Notices to the Merchant may be sent to the email address on its account; the Merchant must keep that address current. The Merchant may contact DRPAY at support@denpay.cc. This Agreement and the applicable privacy notice state the agreement between the parties concerning the merchant services and replace prior discussions on that subject. A change to this Agreement is effective only when provided in writing and accepted by both parties, except that DRPAY may make an operational change required by law or a payment provider and will notify the Merchant where required.",
    ],
    [
      "12. Applicable law and disputes",
      "The parties will comply with applicable laws and regulations of the Philippines and the Republic of Korea in connection with this Agreement and the services. The parties will first attempt in good faith to resolve a dispute through written notice and discussion. If they cannot resolve it, either party may bring the dispute before a court with jurisdiction under applicable law. Nothing in this clause limits mandatory rights or protections under applicable law.",
    ],
  ]

  for (const [heading, ...paragraphs] of terms) {
    drawHeading(heading)
    if (heading === "4. Activation and fees") {
      drawParagraph(paragraphs[0])
      drawFeeSchedule()
      drawParagraph(paragraphs[1])
    } else {
      for (const text of paragraphs) drawParagraph(text)
    }
  }

  drawHeading("EXECUTION")
  drawParagraph(
    "Each signatory confirms that they are authorized to bind the party named below and agrees to this Agreement. The effective date is the date on which the second party signs.",
  )
  ensureSpace(112)
  const signatureTop = y
  page.drawText("MERCHANT", {
    x: left,
    y: signatureTop,
    size: 9,
    font: bold,
    color: green,
  })
  page.drawText(printableText(providerName), {
    x: 320,
    y: signatureTop,
    size: 9,
    font: bold,
    color: green,
  })
  for (const columnX of [left, 320]) {
    for (const offset of [30, 58, 86]) {
      page.drawLine({
        start: { x: columnX, y: signatureTop - offset },
        end: { x: columnX + 220, y: signatureTop - offset },
        thickness: 0.7,
        color: line,
      })
    }
  }
  page.drawText("Signature", {
    x: left,
    y: signatureTop - 43,
    size: 8,
    font: regular,
    color: muted,
  })
  page.drawText("Name and title", {
    x: left,
    y: signatureTop - 71,
    size: 8,
    font: regular,
    color: muted,
  })
  page.drawText("Date", {
    x: left,
    y: signatureTop - 99,
    size: 8,
    font: regular,
    color: muted,
  })
  page.drawText("Authorized signature", {
    x: 320,
    y: signatureTop - 43,
    size: 8,
    font: regular,
    color: muted,
  })
  page.drawText("Name and title", {
    x: 320,
    y: signatureTop - 71,
    size: 8,
    font: regular,
    color: muted,
  })
  page.drawText("Date", {
    x: 320,
    y: signatureTop - 99,
    size: 8,
    font: regular,
    color: muted,
  })

  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: left, y: 48 },
      end: { x: right, y: 48 },
      thickness: 0.6,
      color: line,
    })
    currentPage.drawText(
      `DRPAY Merchant Services Agreement  |  ${agreementId}  |  Page ${index + 1} of ${pages.length}`,
      { x: left, y: 34, size: 7, font: regular, color: muted },
    )
  })

  return Buffer.from(await document.save())
}

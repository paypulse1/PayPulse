import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

const serverDirectory = fileURLToPath(new URL(".", import.meta.url))
const templatePath = join(
  serverDirectory,
  "..",
  "BIR_2307_org_9BdLmmV4QQ5hRiBMrP9hKx5F_Q3-2026.pdf",
)

const FIELD_LAYOUT = {
  payeeName: {
    x: 39,
    y: 168,
    width: 205,
    size: 7,
    cover: { x: 36, y: 164, width: 205, height: 14 },
  },
  payeeAddress: {
    x: 39,
    y: 194,
    width: 540,
    size: 7,
    cover: { x: 36, y: 190, width: 555, height: 18 },
  },
  periodFrom: {
    x: 126,
    y: 140,
    width: 75,
    size: 6.5,
    cover: { x: 205, y: 137, width: 194, height: 16 },
  },
  periodTo: { x: 282, y: 140, width: 75, height: 16, size: 6.5 },
  payeeTin: {
    x: 210,
    y: 257,
    width: 190,
    size: 7,
    cover: { x: 210, y: 252, width: 190, height: 16 },
  },
  payorName: {
    x: 39,
    y: 283,
    width: 150,
    size: 7,
    cover: { x: 36, y: 279, width: 150, height: 15 },
  },
  payorAddress: {
    x: 39,
    y: 314,
    width: 555,
    size: 7,
    cover: { x: 36, y: 308, width: 555, height: 15 },
  },
  payorTin: {
    x: 210,
    y: 283,
    width: 190,
    size: 7,
    cover: { x: 210, y: 279, width: 190, height: 16 },
  },
  taxCode: {
    x: 185,
    y: 370,
    width: 410,
    size: 7,
    cover: { x: 180, y: 366, width: 410, height: 14 },
  },
  grossRemittancesTable: { x: 402, y: 370, size: 7 },
  withholdingTaxTable: { x: 514, y: 370, size: 7 },
  grossRemittancesSummary: {
    x: 464,
    y: 506,
    width: 150,
    size: 7,
    cover: { x: 280, y: 502, width: 150, height: 13 },
  },
  withholdingTaxSummary: {
    x: 520,
    y: 506,
    width: 130,
    size: 7,
    cover: { x: 460, y: 502, width: 130, height: 13 },
  },
  reference: {
    x: 254,
    y: 736,
    width: 150,
    size: 7,
    cover: { x: 250, y: 732, width: 150, height: 18 },
  },
}

function formatMoney(amount) {
  return Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getPeriod(description) {
  const yearMatch = description.match(/\b(20\d{2})\b/)
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear()
  const quarterMatch = description.match(/\bQ([1-4])\b/i)
  const monthMatch = description.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
  )

  if (quarterMatch) {
    const quarter = Number(quarterMatch[1])
    const firstMonth = (quarter - 1) * 3 + 1
    const lastMonth = firstMonth + 2
    const first = `${String(firstMonth).padStart(2, "0")}/01/${year}`
    const lastDate = new Date(Date.UTC(year, lastMonth, 0)).getUTCDate()
    return {
      from: first,
      to: `${String(lastMonth).padStart(2, "0")}/${String(lastDate).padStart(2, "0")}/${year}`,
      quarter,
    }
  }

  if (monthMatch) {
    const month =
      [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ].indexOf(
        monthMatch[1][0].toUpperCase() + monthMatch[1].slice(1).toLowerCase(),
      ) + 1
    if (month > 0) {
      const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate()
      return {
        from: `${String(month).padStart(2, "0")}/01/${year}`,
        to: `${String(month).padStart(2, "0")}/${String(lastDate).padStart(2, "0")}/${year}`,
        quarter: Math.ceil(month / 3),
      }
    }
  }

  return {
    from: `01/01/${year}`,
    to: `12/31/${year}`,
    quarter: "",
  }
}

function descriptionFromTitle(title) {
  return title.startsWith("Tax invoice: ")
    ? title.slice("Tax invoice: ".length)
    : title
}

function normalizeTin(tin) {
  return String(tin || "").replace(/\D/g, "")
}

function calculateWithholding(amount) {
  const withholdingTax = Math.round(Number(amount) * 100) / 100
  const grossRemittances = Math.round((withholdingTax / 0.005) * 100) / 100
  return { withholdingTax, grossRemittances }
}

function createOverlay({ page, font, height }) {
  const ink = rgb(0.08, 0.08, 0.08)

  function clear(field) {
    const cover = field.cover
    if (!cover) return

    page.drawRectangle({
      x: cover.x,
      y: height - cover.y - cover.height,
      width: cover.width,
      height: cover.height,
      color: rgb(1, 1, 1),
    })
  }

  function text(value, field) {
    clear(field)
    let displayValue = String(value || "")
    while (
      displayValue.length > 1 &&
      field.width !== undefined &&
      font.widthOfTextAtSize(displayValue, field.size) > field.width
    ) {
      displayValue = `${displayValue.slice(0, -2).trim()}...`
    }
    page.drawText(displayValue, {
      x: field.x,
      y: height - field.y - field.size,
      size: field.size,
      font,
      color: ink,
    })
  }

  return { text, clear }
}

export async function createFilledBir2307({
  title,
  amount,
  referenceNo,
  payeeName,
  payeeTin,
  payeeAddress,
  payorName,
  payorTin,
  payorAddress,
}) {
  const template = await readFile(templatePath)
  const document = await PDFDocument.load(template)
  const page = document.getPage(0)
  const { height } = page.getSize()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const { withholdingTax, grossRemittances } = calculateWithholding(amount)
  const description = descriptionFromTitle(title)
  const period = getPeriod(description)
  const overlay = createOverlay({ page, font, height })
  const text = overlay.text

  text(payeeName, FIELD_LAYOUT.payeeName)
  text(payeeAddress, FIELD_LAYOUT.payeeAddress)
  text(period.from, FIELD_LAYOUT.periodFrom)
  text(period.to, FIELD_LAYOUT.periodTo)
  text(normalizeTin(payeeTin), FIELD_LAYOUT.payeeTin)
  text(payorName, FIELD_LAYOUT.payorName)
  text(payorAddress, FIELD_LAYOUT.payorAddress)
  text(normalizeTin(payorTin), FIELD_LAYOUT.payorTin)
  text("WI830", FIELD_LAYOUT.taxCode)
  text(formatMoney(grossRemittances), FIELD_LAYOUT.grossRemittancesTable)
  text(formatMoney(withholdingTax), FIELD_LAYOUT.withholdingTaxTable)
  text(formatMoney(grossRemittances), FIELD_LAYOUT.grossRemittancesSummary)
  text(formatMoney(withholdingTax), FIELD_LAYOUT.withholdingTaxSummary)
  text(`DRPAY TAX REF: ${referenceNo}`, FIELD_LAYOUT.reference)

  return Buffer.from(await document.save())
}

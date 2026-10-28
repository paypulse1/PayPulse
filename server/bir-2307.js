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
    return { from: first, to: `${String(lastMonth).padStart(2, "0")}/${String(lastDate).padStart(2, "0")}/${year}`, quarter }
  }

  if (monthMatch) {
    const month = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ].indexOf(
      monthMatch[1][0].toUpperCase() + monthMatch[1].slice(1).toLowerCase(),
    ) + 1
    if (month > 0) {
      const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate()
      return { from: `${String(month).padStart(2, "0")}/01/${year}`, to: `${String(month).padStart(2, "0")}/${String(lastDate).padStart(2, "0")}/${year}`, quarter: Math.ceil(month / 3) }
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
  const ink = rgb(0.08, 0.08, 0.08)
  const unpaidTax = Math.round(Number(amount) * 100) / 100
  const grossRemittances = Math.round((unpaidTax / 0.005) * 100) / 100
  const description = descriptionFromTitle(title)
  const period = getPeriod(description)

  function cover(x, y, width, heightValue) {
    page.drawRectangle({
      x,
      y: height - y - heightValue,
      width,
      height: heightValue,
      color: rgb(1, 1, 1),
    })
  }

  function draw(text, x, y, size = 7, maxWidth = Number.POSITIVE_INFINITY) {
    let value = String(text || "")
    while (
      value.length > 1 &&
      font.widthOfTextAtSize(value, size) > maxWidth
    ) {
      value = `${value.slice(0, -2).trim()}...`
    }
    page.drawText(value, {
      x,
      y: height - y - size,
      size,
      font,
      color: ink,
    })
  }

  cover(36, 164, 205, 14)
  draw(payeeName, 39, 168, 7, 205)

  cover(36, 190, 555, 18)
  draw(
    payeeAddress,
    39,
    194,
    7,
    540,
  )
  cover(205, 137, 194, 16)
  draw(period.from, 126, 140, 6.5)
  draw(period.to, 282, 140, 6.5)
  cover(210, 252, 190, 16)
  draw(payeeTin.replace(/\D/g, ""), 210, 257, 7)

  cover(36, 308, 555, 15)
  cover(36, 279, 150, 15)
  draw(payorName, 39, 283, 7)
  draw(payorAddress, 39, 314, 7)
  cover(205, 253, 190, 16)
  draw(payorTin.replace(/\D/g, ""), 210, 257, 7)

  cover(180, 366, 410, 14)
  draw("WI830", 185, 370, 7)
  draw(formatMoney(grossRemittances), 402, 370, 7)
  draw(formatMoney(unpaidTax), 514, 370, 7)
  cover(280, 502, 150, 13)
  cover(460, 502, 130, 13)
  draw(formatMoney(grossRemittances), 464, 506, 7)
  draw(formatMoney(unpaidTax), 520, 506, 7)
  cover(250, 732, 150, 18)
  draw(`DRPAY TAX REF: ${referenceNo}`, 254, 736, 7)

  return Buffer.from(await document.save())
}

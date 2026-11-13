import { parseMinorUnits, formatMinorUnits } from "./money.js"

const requiredColumns = [
  "reference",
  "amount",
  "currency",
  "direction",
  "status",
  "occurred_at",
]

function parseCsvRows(content) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  let closedQuote = false
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          closedQuote = true
        }
      } else {
        field += character
      }
      continue
    }
    if (character === "," || character === "\n" || character === "\r") {
      row.push(field)
      field = ""
      closedQuote = false
      if (character === ",") continue
      if (character === "\r" && content[index + 1] === "\n") index += 1
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      continue
    }
    if (character === '"') {
      if (field.length || closedQuote) {
        throw new Error("The bank CSV contains a misplaced quote.")
      }
      quoted = true
      continue
    }
    if (closedQuote && !/\s/.test(character)) {
      throw new Error("Unexpected data follows a quoted CSV field.")
    }
    if (!closedQuote) field += character
  }
  if (quoted) throw new Error("The bank CSV contains an unclosed quoted field.")
  if (field.length || row.length) {
    row.push(field)
    if (row.some((value) => value.trim())) rows.push(row)
  }
  return rows
}

export function parseBankCsv(content) {
  if (typeof content !== "string" || content.length > 2 * 1024 * 1024) {
    throw new Error("Upload a bank CSV no larger than 2 MB.")
  }
  const rows = parseCsvRows(content)
  if (rows.length < 2 || rows.length > 5001) {
    throw new Error("The bank CSV must contain a header and 1–5000 records.")
  }
  const headers = rows[0].map((header) => header.trim().toLowerCase())
  if (new Set(headers).size !== headers.length) {
    throw new Error("The bank CSV contains duplicate column names.")
  }
  const missing = requiredColumns.filter((column) => !headers.includes(column))
  if (missing.length) {
    throw new Error(`The bank CSV is missing columns: ${missing.join(", ")}.`)
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(`Bank CSV row ${rowIndex + 2} has the wrong column count.`)
    }
    const record = Object.fromEntries(
      headers.map((header, index) => [header, cells[index].trim()]),
    )
    const amount = parseMinorUnits(record.amount)
    const occurredAt = new Date(record.occurred_at)
    const direction = record.direction.toUpperCase()
    const currency = record.currency.toUpperCase()
    if (!record.reference || record.reference.length > 160) {
      throw new Error(`Bank CSV row ${rowIndex + 2} has an invalid reference.`)
    }
    if (
      amount <= 0n ||
      !/^[A-Z]{3}$/.test(currency) ||
      !["IN", "OUT"].includes(direction) ||
      !record.status ||
      record.status.length > 80 ||
      !Number.isFinite(occurredAt.getTime())
    ) {
      throw new Error(`Bank CSV row ${rowIndex + 2} contains invalid data.`)
    }
    return {
      reference: record.reference,
      amount: formatMinorUnits(amount),
      currency,
      direction,
      status: record.status.slice(0, 80),
      occurredAt: occurredAt.toISOString(),
    }
  })
}

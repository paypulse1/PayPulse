import { randomUUID } from "node:crypto"
import { addMinorUnits, formatMinorUnits, parseMinorUnits } from "./money.js"

export async function postBalancedJournal(
  executor,
  { sourceType, sourceId, reference, currency = "PHP", lines },
) {
  if (
    typeof sourceType !== "string" ||
    typeof sourceId !== "string" ||
    typeof reference !== "string" ||
    !Array.isArray(lines) ||
    lines.length < 2
  ) {
    throw new Error("A complete accounting journal is required.")
  }
  let debits = 0n
  let credits = 0n
  const normalizedLines = lines.map((line) => {
    const amount = parseMinorUnits(line.amount)
    if (
      typeof line.accountCode !== "string" ||
      !line.accountCode ||
      amount <= 0n ||
      !["debit", "credit"].includes(line.side)
    ) {
      throw new Error("An accounting journal line is invalid.")
    }
    if (line.side === "debit") debits = addMinorUnits(debits, amount)
    else credits = addMinorUnits(credits, amount)
    return {
      accountCode: line.accountCode,
      side: line.side,
      amount: formatMinorUnits(amount),
    }
  })
  if (debits !== credits) {
    throw new Error("The accounting journal is not balanced.")
  }

  const entryId = randomUUID()
  const inserted = await executor.query(
    `INSERT INTO accounting_journal_entries
       (id, source_type, source_id, reference, currency)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source_type, source_id) DO NOTHING
     RETURNING id`,
    [entryId, sourceType, sourceId, reference, currency],
  )
  if (!inserted.rowCount) return { created: false, id: null }

  for (const [index, line] of normalizedLines.entries()) {
    await executor.query(
      `INSERT INTO accounting_journal_lines
         (id, entry_id, line_number, account_code, side, amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        entryId,
        index + 1,
        line.accountCode,
        line.side,
        line.amount,
      ],
    )
  }
  return { created: true, id: entryId }
}

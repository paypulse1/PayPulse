import { randomInt } from "node:crypto"

const MAX_REFERENCE_ATTEMPTS = 100

export async function reserveTransactionReference(client) {
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    const reference = String(randomInt(100000, 1000000))
    const result = await client.query(
      `INSERT INTO transaction_references (reference_no)
       VALUES ($1)
       ON CONFLICT (reference_no) DO NOTHING
       RETURNING reference_no`,
      [reference],
    )
    if (result.rowCount) return reference
  }

  throw new Error(
    "Could not allocate a unique six-digit transaction reference.",
  )
}

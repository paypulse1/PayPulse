import { describe, expect, it } from "vitest"
import { ensureMerchantRegistrationDocumentSchema } from "./registration-document-schema.js"

describe("merchant registration document schema compatibility", () => {
  it("adds the missing id column and backfills legacy rows", async () => {
    const calls = []
    const pool = {
      query: async (sql) => {
        calls.push(sql)
        return { rows: [] }
      },
    }

    await ensureMerchantRegistrationDocumentSchema(pool)

    expect(calls.join("\n")).toContain("ADD COLUMN IF NOT EXISTS id")
    expect(calls.join("\n")).toContain("UPDATE merchant_registration_documents")
    expect(calls.join("\n")).toContain("ALTER TABLE merchant_registration_documents")
  })
})

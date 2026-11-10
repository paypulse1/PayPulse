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

  it("repairs legacy tables that still use uploaded_at instead of completed_at", async () => {
    const calls = []
    const pool = {
      query: async (sql) => {
        calls.push(sql)
        return { rows: [] }
      },
    }

    await ensureMerchantRegistrationDocumentSchema(pool)

    expect(calls.join("\n")).toContain("ADD COLUMN IF NOT EXISTS completed_at")
    expect(calls.join("\n")).toContain("uploaded_at")
    expect(calls.join("\n")).toContain("completed_at")
  })

  it("adds the missing challenge_id column for legacy registration records", async () => {
    const calls = []
    const pool = {
      query: async (sql) => {
        calls.push(sql)
        return { rows: [] }
      },
    }

    await ensureMerchantRegistrationDocumentSchema(pool)

    expect(calls.join("\n")).toContain("ADD COLUMN IF NOT EXISTS challenge_id")
  })
})

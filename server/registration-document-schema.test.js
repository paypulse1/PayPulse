import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { ensureMerchantRegistrationDocumentSchema } from "./registration-document-schema.js"

describe("merchant registration document schema compatibility", () => {
  it("bootstraps pgcrypto before uuid-based migration logic", () => {
    const migrationSql = readFileSync(new URL("./index.js", import.meta.url), "utf8")

    expect(migrationSql).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
  })

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

    const migration = calls.join("\n")
    const renameIndex = migration.indexOf(
      "RENAME COLUMN uploaded_at TO completed_at",
    )
    const addCompletedAtIndex = migration.indexOf(
      "ADD COLUMN IF NOT EXISTS completed_at",
    )

    expect(renameIndex).toBeGreaterThan(-1)
    expect(addCompletedAtIndex).toBeGreaterThan(renameIndex)
    expect(migration).toContain(
      "COALESCE(completed_at, uploaded_at)",
    )
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

  it("adds the missing document_type column for legacy registration records", async () => {
    const calls = []
    const pool = {
      query: async (sql) => {
        calls.push(sql)
        return { rows: [] }
      },
    }

    await ensureMerchantRegistrationDocumentSchema(pool)

    expect(calls.join("\n")).toContain("ADD COLUMN IF NOT EXISTS document_type")
  })

  it("adds the missing object_key column for legacy registration records", async () => {
    const calls = []
    const pool = {
      query: async (sql) => {
        calls.push(sql)
        return { rows: [] }
      },
    }

    await ensureMerchantRegistrationDocumentSchema(pool)

    expect(calls.join("\n")).toContain("ADD COLUMN IF NOT EXISTS object_key")
  })

  it("adds the missing upload metadata columns for legacy registration records", async () => {
    const calls = []
    const pool = {
      query: async (sql) => {
        calls.push(sql)
        return { rows: [] }
      },
    }

    await ensureMerchantRegistrationDocumentSchema(pool)

    const migration = calls.join("\n")
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS file_name")
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS content_type")
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS size_bytes")
  })

  it("makes the legacy email and kind columns nullable when present", async () => {
    const calls = []
    const pool = {
      query: async (sql) => {
        calls.push(sql)
        return { rows: [] }
      },
    }

    await ensureMerchantRegistrationDocumentSchema(pool)

    const migration = calls.join("\n")
    const replacePrimaryKeyIndex = migration.indexOf(
      "ALTER TABLE merchant_registration_documents DROP CONSTRAINT",
    )
    const dropLegacyColumnsIndex = migration.indexOf(
      "column_name IN ('email', 'kind')",
    )

    expect(replacePrimaryKeyIndex).toBeGreaterThan(-1)
    expect(migration).toContain("ADD PRIMARY KEY (id)")
    expect(dropLegacyColumnsIndex).toBeGreaterThan(replacePrimaryKeyIndex)
    expect(migration).toContain("ALTER COLUMN %I DROP NOT NULL")
  })
})

import { describe, expect, it } from "vitest"
import { S3Client } from "@aws-sdk/client-s3"
import {
  createPrivateDocumentUploadCommand,
  getPrivateDocumentUploadUrl,
} from "./private-document-upload.js"

describe("browser-facing private document upload signing", () => {
  it("signs metadata without requiring a signed Content-Length header", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: "https://account.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "TESTACCESSKEY",
        secretAccessKey: "TESTSECRETKEY",
      },
    })
    const signedUrl = new URL(
      await getPrivateDocumentUploadUrl(
        client,
        "private-documents",
        "kyb/document-id",
        "application/pdf",
        "document-id",
      ),
    )
    const command = createPrivateDocumentUploadCommand(
      "private-documents",
      "kyb/document-id",
      "application/pdf",
      "document-id",
    )

    expect(signedUrl.searchParams.get("X-Amz-SignedHeaders")).not.toContain(
      "content-length",
    )
    expect(signedUrl.searchParams.get("X-Amz-SignedHeaders")).toContain(
      "x-amz-meta-document-id",
    )
    expect(signedUrl.searchParams.has("x-amz-meta-document-id")).toBe(false)
    expect(command.input.Metadata).toEqual({ "document-id": "document-id" })
    client.destroy()
  })
})
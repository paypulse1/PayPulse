import { describe, expect, it } from "vitest"
import { S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createPrivateDocumentUploadCommand } from "./private-document-upload.js"

describe("browser-facing private document upload signing", () => {
  it("does not require the browser to send a signed Content-Length header", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: "https://account.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "TESTACCESSKEY",
        secretAccessKey: "TESTSECRETKEY",
      },
    })
    const command = createPrivateDocumentUploadCommand(
      "private-documents",
      "kyb/document-id",
      "application/pdf",
      "document-id",
    )
    const signedUrl = new URL(
      await getSignedUrl(client, command, { expiresIn: 300 }),
    )

    expect(signedUrl.searchParams.get("X-Amz-SignedHeaders")).not.toContain(
      "content-length",
    )
    expect(command.input.Metadata).toEqual({ "document-id": "document-id" })
    client.destroy()
  })
})
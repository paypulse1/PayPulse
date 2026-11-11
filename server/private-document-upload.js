import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export function createPrivateDocumentUploadCommand(
  bucket,
  objectKey,
  contentType,
  documentId,
) {
  return new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
    Metadata: { "document-id": documentId },
  })
}

export function getPrivateDocumentUploadUrl(
  client,
  bucket,
  objectKey,
  contentType,
  documentId,
) {
  return getSignedUrl(
    client,
    createPrivateDocumentUploadCommand(
      bucket,
      objectKey,
      contentType,
      documentId,
    ),
    {
      expiresIn: 300,
      unhoistableHeaders: new Set(["x-amz-meta-document-id"]),
    },
  )
}
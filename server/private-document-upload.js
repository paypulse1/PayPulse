import { PutObjectCommand } from "@aws-sdk/client-s3"

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
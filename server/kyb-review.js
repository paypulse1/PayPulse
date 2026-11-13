export const requiredKybDocumentTypes = [
  "business_registration",
  "identity_front",
  "identity_back",
]

export function getMissingRequiredKybDocuments(documentTypes) {
  const uploadedTypes = new Set(documentTypes)
  return requiredKybDocumentTypes.filter(
    (documentType) => !uploadedTypes.has(documentType),
  )
}

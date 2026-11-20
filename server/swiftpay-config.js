export function getMissingSwiftPayCredentials(accessKey, secretKey) {
  const missing = []
  if (!accessKey) missing.push("SWIFTPAY_ACCESS_KEY")
  if (!secretKey) missing.push("SWIFTPAY_SECRET_KEY")
  return missing
}

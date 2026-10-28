import { createHash } from "node:crypto"

export function tronAddressPayload(address) {
  if (
    typeof address !== "string" ||
    !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
  )
    return null
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  let decoded = 0n
  for (const character of address) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) return null
    decoded = decoded * 58n + BigInt(digit)
  }
  let hex = decoded.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  const leadingZeroBytes = address.match(/^1*/)?.[0].length || 0
  const bytes = Buffer.concat([
    Buffer.alloc(leadingZeroBytes),
    Buffer.from(hex, "hex"),
  ])
  if (bytes.length !== 25) return null
  const payload = bytes.subarray(0, 21)
  const checksum = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest()
    .subarray(0, 4)
  if (payload[0] !== 0x41 || !checksum.equals(bytes.subarray(21))) return null
  return payload
}

export function formatTokenBalance(rawHex, decimals) {
  if (typeof rawHex !== "string" || !/^[0-9a-f]+$/i.test(rawHex)) return null
  const raw = BigInt(`0x${rawHex}`)
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const fraction = (raw % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : String(whole)
}
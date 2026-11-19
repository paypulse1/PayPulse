import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const TOTP_PERIOD_SECONDS = 30

export function isTotpRequiredForAdminRole(role) {
  return role !== "super_admin"
}

function decodeBase32(value) {
  const normalized = value.replace(/=+$/, "").toUpperCase()
  let bits = ""
  for (const character of normalized) {
    const index = BASE32.indexOf(character)
    if (index < 0) throw new Error("The TOTP secret is invalid.")
    bits += index.toString(2).padStart(5, "0")
  }
  const bytes = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  }
  return Buffer.from(bytes)
}

export function generateTotpSecret() {
  const bytes = randomBytes(20)
  let bits = ""
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0")
  let secret = ""
  for (let offset = 0; offset < bits.length; offset += 5) {
    secret += BASE32[Number.parseInt(bits.slice(offset, offset + 5), 2)]
  }
  return secret
}

export function totpCodeAt(secret, timestampMilliseconds) {
  const counter = BigInt(
    Math.floor(timestampMilliseconds / 1000 / TOTP_PERIOD_SECONDS),
  )
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(counter)
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(binary % 1_000_000).padStart(6, "0")
}

export function matchingTotpStep(secret, token, timestampMilliseconds = Date.now(), lastStep = -1) {
  if (typeof token !== "string" || !/^\d{6}$/.test(token)) return null
  const currentStep = Math.floor(
    timestampMilliseconds / 1000 / TOTP_PERIOD_SECONDS,
  )
  for (const step of [currentStep, currentStep - 1, currentStep + 1]) {
    if (step <= lastStep || step < 0) continue
    const expected = totpCodeAt(secret, step * TOTP_PERIOD_SECONDS * 1000)
    if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return step
  }
  return null
}

function encryptionKey(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(
      "DRPAY_ADMIN_MFA_ENCRYPTION_KEY must be a 32-byte hexadecimal key.",
    )
  }
  return Buffer.from(value, "hex")
}

export function encryptTotpSecret(secret, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv)
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ])
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
}

export function decryptTotpSecret(value, key) {
  const [iv, authTag, encrypted] = value.split(".")
  if (!iv || !authTag || !encrypted) {
    throw new Error("The stored TOTP secret is invalid.")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(key),
    Buffer.from(iv, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(authTag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function totpProvisioningUri(email, secret) {
  const label = encodeURIComponent(`PayPulse:${email}`)
  const issuer = encodeURIComponent("PayPulse")
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_SECONDS}`
}

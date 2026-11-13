const DECIMAL_AMOUNT = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/

export function parseMinorUnits(value) {
  if (typeof value === "bigint") return value
  const text = typeof value === "number" ? String(value) : value
  if (typeof text !== "string") {
    throw new Error("The monetary value is invalid.")
  }
  const match = DECIMAL_AMOUNT.exec(text.trim())
  if (!match) {
    throw new Error("The monetary value must have no more than two decimals.")
  }
  const [, sign, whole, fraction = ""] = match
  const magnitude = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))
  return sign === "-" ? -magnitude : magnitude
}

export function formatMinorUnits(value) {
  const amount = BigInt(value)
  const sign = amount < 0n ? "-" : ""
  const magnitude = amount < 0n ? -amount : amount
  return `${sign}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, "0")}`
}

export function minorUnitsToNumber(value) {
  return Number(formatMinorUnits(value))
}

export function addMinorUnits(left, right) {
  return BigInt(left) + BigInt(right)
}

export function subtractMinorUnits(left, right) {
  return BigInt(left) - BigInt(right)
}

export function multiplyMinorUnitsByPercent(amount, percent) {
  const amountMinor = BigInt(amount)
  const percentHundredths = parseMinorUnits(percent)
  const numerator = amountMinor * percentHundredths
  const denominator = 10_000n
  const magnitude = numerator < 0n ? -numerator : numerator
  const quotient = magnitude / denominator
  const remainder = magnitude % denominator
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient
  return numerator < 0n ? -rounded : rounded
}

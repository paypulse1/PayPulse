import { createHmac, timingSafeEqual } from "node:crypto"

const webhookDigestAlgorithms = {
  HMAC_SHA256_HEX: "sha256",
  HMAC_SHA512_HEX: "sha512",
}

export function createSumsubRequestSignature(
  secretKey,
  timestamp,
  method,
  uri,
  body = "",
) {
  return createHmac("sha256", secretKey)
    .update(`${timestamp}${method.toUpperCase()}${uri}${body}`)
    .digest("hex")
}

export async function createSumsubSdkAccessToken({
  appToken,
  secretKey,
  levelName,
  externalUserId,
  email,
  phone,
  fetcher = fetch,
}) {
  const requestPath = "/resources/accessTokens/sdk"
  const requestBody = JSON.stringify({
    applicantIdentifiers: { email, phone },
    ttlInSecs: 600,
    userId: externalUserId,
    levelName,
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const response = await fetcher(`https://api.sumsub.com${requestPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": appToken,
      "X-App-Access-Ts": timestamp,
      "X-App-Access-Sig": createSumsubRequestSignature(
        secretKey,
        timestamp,
        "POST",
        requestPath,
        requestBody,
      ),
    },
    body: requestBody,
    signal: AbortSignal.timeout(10_000),
  })

  let providerData
  try {
    providerData = await response.json()
  } catch {
    providerData = null
  }
  if (
    !response.ok ||
    typeof providerData?.token !== "string" ||
    providerData.token.length === 0 ||
    providerData.token.length > 1024
  ) {
    const error = new Error("Sumsub access-token request failed")
    error.status = response.status
    error.providerErrorName = providerData?.errorName || null
    throw error
  }
  return providerData.token
}

export function verifySumsubWebhookDigest({
  rawBody,
  digest,
  algorithm,
  secretKey,
}) {
  const hashAlgorithm = webhookDigestAlgorithms[algorithm]
  if (
    !Object.hasOwn(webhookDigestAlgorithms, algorithm) ||
    !hashAlgorithm ||
    typeof digest !== "string" ||
    !/^[a-f0-9]+$/i.test(digest)
  ) {
    return false
  }

  const expected = createHmac(hashAlgorithm, secretKey).update(rawBody).digest()
  const received = Buffer.from(digest, "hex")
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}

export function mapSumsubWebhook(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.testMode === true ||
    typeof payload.externalUserId !== "string" ||
    !payload.externalUserId
  ) {
    return null
  }

  let reviewStatus = null
  switch (payload.type) {
    case "applicantCreated":
      reviewStatus = "IN_PROGRESS"
      break
    case "applicantAwaitingUser":
      reviewStatus = "IN_PROGRESS"
      break
    case "applicantPending":
    case "applicantAwaitingService":
      reviewStatus = "IN_REVIEW"
      break
    case "applicantOnHold":
      reviewStatus = "ON_HOLD"
      break
    case "applicantReviewed": {
      const answer = payload.reviewResult?.reviewAnswer
      if (answer === "GREEN") {
        reviewStatus = "APPROVED"
      } else if (answer === "RED") {
        reviewStatus =
          payload.reviewResult?.reviewRejectType === "RETRY"
            ? "RESUBMISSION_REQUIRED"
            : "REJECTED"
      } else {
        reviewStatus = "IN_REVIEW"
      }
      break
    }
    default:
      return null
  }

  return {
    applicantId:
      typeof payload.applicantId === "string" ? payload.applicantId : null,
    externalUserId: payload.externalUserId,
    reviewAnswer:
      typeof payload.reviewResult?.reviewAnswer === "string"
        ? payload.reviewResult.reviewAnswer
        : null,
    reviewStatus,
    type: payload.type,
  }
}

import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  createSumsubSdkAccessToken,
  createSumsubRequestSignature,
  mapSumsubWebhook,
  verifySumsubWebhookDigest,
} from "./sumsub-kyb.js"

describe("Sumsub KYB helpers", () => {
  it("requests a short-lived access token using the signed applicant payload", async () => {
    let request
    const token = await createSumsubSdkAccessToken({
      appToken: "app-token",
      secretKey: "secret",
      levelName: "kyb-level",
      externalUserId: "registration-1",
      email: "owner@example.com",
      phone: "+639123456789",
      fetcher: async (url, options) => {
        request = { url, options }
        return new Response(JSON.stringify({ token: "sdk-token" }), {
          status: 200,
        })
      },
    })

    expect(token).toBe("sdk-token")
    expect(request.url).toBe(
      "https://api.sumsub.com/resources/accessTokens/sdk",
    )
    expect(request.options.headers["X-App-Token"]).toBe("app-token")
    expect(request.options.headers["X-App-Access-Sig"]).toBe(
      createSumsubRequestSignature(
        "secret",
        request.options.headers["X-App-Access-Ts"],
        "POST",
        "/resources/accessTokens/sdk",
        request.options.body,
      ),
    )
    expect(JSON.parse(request.options.body)).toEqual({
      applicantIdentifiers: {
        email: "owner@example.com",
        phone: "+639123456789",
      },
      ttlInSecs: 600,
      userId: "registration-1",
      levelName: "kyb-level",
    })
  })

  it("signs API requests using timestamp, method, URI, and exact body", () => {
    const body = JSON.stringify({ userId: "merchant-1", levelName: "kyb" })
    const expected = createHmac("sha256", "secret")
      .update(`1700000000POST/resources/accessTokens/sdk${body}`)
      .digest("hex")

    expect(
      createSumsubRequestSignature(
        "secret",
        "1700000000",
        "post",
        "/resources/accessTokens/sdk",
        body,
      ),
    ).toBe(expected)
  })

  it.each([
    ["HMAC_SHA256_HEX", "sha256"],
    ["HMAC_SHA512_HEX", "sha512"],
  ])("verifies %s webhook digests against the raw body", (algorithm, hash) => {
    const rawBody = Buffer.from('{"type":"applicantReviewed"}')
    const digest = createHmac(hash, "webhook-secret")
      .update(rawBody)
      .digest("hex")

    expect(
      verifySumsubWebhookDigest({
        rawBody,
        digest,
        algorithm,
        secretKey: "webhook-secret",
      }),
    ).toBe(true)
    expect(
      verifySumsubWebhookDigest({
        rawBody,
        digest: `${digest.slice(0, -2)}00`,
        algorithm,
        secretKey: "webhook-secret",
      }),
    ).toBe(false)
  })

  it("maps provider outcomes without converting a retry into approval", () => {
    expect(
      mapSumsubWebhook({
        type: "applicantAwaitingService",
        externalUserId: "merchant-1",
      }),
    ).toMatchObject({ reviewStatus: "IN_REVIEW" })
    expect(
      mapSumsubWebhook({
        type: "applicantReviewed",
        applicantId: "applicant-1",
        externalUserId: "merchant-1",
        reviewResult: { reviewAnswer: "GREEN" },
      }),
    ).toMatchObject({ reviewStatus: "APPROVED", reviewAnswer: "GREEN" })
    expect(
      mapSumsubWebhook({
        type: "applicantReviewed",
        externalUserId: "merchant-1",
        reviewResult: {
          reviewAnswer: "RED",
          reviewRejectType: "RETRY",
        },
      }),
    ).toMatchObject({ reviewStatus: "RESUBMISSION_REQUIRED" })
    expect(
      mapSumsubWebhook({
        type: "applicantReviewed",
        externalUserId: "merchant-1",
        reviewResult: { reviewAnswer: "RED", reviewRejectType: "FINAL" },
      }),
    ).toMatchObject({ reviewStatus: "REJECTED" })
  })

  it("ignores test webhooks and unrelated events", () => {
    expect(
      mapSumsubWebhook({
        type: "applicantReviewed",
        externalUserId: "merchant-1",
        testMode: true,
        reviewResult: { reviewAnswer: "GREEN" },
      }),
    ).toBeNull()
    expect(
      mapSumsubWebhook({
        type: "applicantActionReviewed",
        externalUserId: "merchant-1",
      }),
    ).toBeNull()
  })
})

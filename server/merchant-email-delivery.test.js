import { describe, expect, it } from "vitest"
import { sendMerchantEmails } from "./merchant-email-delivery.js"

const message = (subject) => ({
  subject,
  text: subject,
  html: `<p>${subject}</p>`,
})

describe("merchant email delivery", () => {
  it("uses the single-email endpoint for one notification", async () => {
    let request
    await sendMerchantEmails({
      from: "PayPulse <accounts@example.com>",
      apiKey: "test-key",
      messages: [
        { to: "merchant@example.com", email: message("Access ready") },
      ],
      fetchImpl: async (url, options) => {
        request = { url, options, body: JSON.parse(options.body) }
        return { ok: true, status: 200 }
      },
    })

    expect(request.url).toBe("https://api.resend.com/emails")
    expect(request.body.to).toEqual(["merchant@example.com"])
    expect(request.body.subject).toBe("Access ready")
  })

  it("sends multiple notifications in order using the batch endpoint", async () => {
    let request
    await sendMerchantEmails({
      from: "accounts@example.com",
      apiKey: "test-key",
      messages: [
        { to: "one@example.com", email: message("First") },
        { to: "two@example.com", email: message("Second") },
      ],
      fetchImpl: async (url, options) => {
        request = { url, body: JSON.parse(options.body) }
        return { ok: true, status: 200 }
      },
    })

    expect(request.url).toBe("https://api.resend.com/emails/batch")
    expect(request.body.map((email) => email.to[0])).toEqual([
      "one@example.com",
      "two@example.com",
    ])
    expect(request.body.map((email) => email.subject)).toEqual([
      "First",
      "Second",
    ])
  })

  it("reports provider rejection rather than treating it as sent", async () => {
    await expect(
      sendMerchantEmails({
        from: "accounts@example.com",
        apiKey: "test-key",
        messages: [
          { to: "merchant@example.com", email: message("Access ready") },
        ],
        fetchImpl: async () => ({ ok: false, status: 422 }),
      }),
    ).rejects.toThrow("Resend returned HTTP 422.")
  })
})

import { describe, expect, it, vi } from "vitest"
import {
  formatAdminTelegramNotification,
  sendTelegramMessage,
} from "./telegram-notifications.js"

describe("formatAdminTelegramNotification", () => {
  it("includes the posted and available merchant wallet balances", () => {
    const message = formatAdminTelegramNotification(
      {
        direction: "IN",
        merchant_name: "Example Merchant",
        merchant_email: "merchant@example.com",
        amount: "125.5",
        currency: "PHP",
        reference: "PAY-123",
        details: "Merchant payment confirmed",
      },
      { balance: "1250.5", reserved: "250" },
    )

    expect(message).toContain("Merchant balance: PHP 1,250.50")
    expect(message).toContain("Available balance: PHP 1,000.50")
  })

  it("rejects missing or invalid merchant wallet balances", () => {
    expect(() =>
      formatAdminTelegramNotification(
        { amount: "10", currency: "PHP" },
        { balance: null, reserved: "0" },
      ),
    ).toThrow("The merchant wallet balance is invalid.")
  })
})

describe("sendTelegramMessage", () => {
  it("sends a plain-text message to the configured super-admin chat", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    await sendTelegramMessage({
      botToken: "test-token",
      chatId: "12345",
      text: "Payment received",
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chat_id: "12345",
          text: "Payment received",
          disable_web_page_preview: true,
        }),
      }),
    )
  })

  it("reports a redacted Telegram API rejection for retry", async () => {
    await expect(
      sendTelegramMessage({
        botToken: "test-token",
        chatId: "12345",
        text: "Payment received",
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          status: 400,
          json: async () => ({
            ok: false,
            description: "Bad Request: chat 12345 not found for test-token",
          }),
        }),
      }),
    ).rejects.toThrow(
      "Telegram rejected the notification (HTTP 400): Bad Request: chat [redacted] not found for [redacted].",
    )
  })
})

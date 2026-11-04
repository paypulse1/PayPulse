import { describe, expect, it, vi } from "vitest"
import { sendTelegramMessage } from "./telegram-notifications.js"

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

  it("reports unsuccessful Telegram API responses for retry", async () => {
    await expect(
      sendTelegramMessage({
        botToken: "test-token",
        chatId: "12345",
        text: "Payment received",
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ok: false }),
        }),
      }),
    ).rejects.toThrow("Telegram transaction notification delivery failed.")
  })
})

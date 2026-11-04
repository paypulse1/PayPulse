export async function sendTelegramMessage({
  botToken,
  chatId,
  text,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true) {
    throw new Error("Telegram transaction notification delivery failed.")
  }
}

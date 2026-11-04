export async function sendTelegramMessage({
  botToken,
  chatId,
  text,
  fetchImpl = fetch,
}) {
  let response
  try {
    response = await fetchImpl(
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
  } catch (error) {
    throw new Error(
      `Telegram request failed: ${error.name || "network error"}.`,
    )
  }
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true) {
    const description =
      typeof result?.description === "string"
        ? result.description
            .replaceAll(botToken, "[redacted]")
            .replaceAll(chatId, "[redacted]")
            .slice(0, 200)
        : "No provider details"
    throw new Error(
      `Telegram rejected the notification (HTTP ${response.status}): ${description}.`,
    )
  }
}

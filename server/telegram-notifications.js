function formatTelegramMoney(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === "") {
    throw new Error("The merchant wallet balance is invalid.")
  }
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    throw new Error("The merchant wallet balance is invalid.")
  }
  return amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  })
}

export function formatAdminTelegramNotification(notification, walletState) {
  if (
    walletState?.balance === null ||
    walletState?.balance === undefined ||
    walletState?.reserved === null ||
    walletState?.reserved === undefined
  ) {
    throw new Error("The merchant wallet balance is invalid.")
  }
  const balance = Number(walletState.balance)
  const reserved = Number(walletState.reserved)
  if (!Number.isFinite(balance) || !Number.isFinite(reserved)) {
    throw new Error("The merchant wallet balance is invalid.")
  }
  const amount = formatTelegramMoney(
    notification.amount,
    notification.currency === "USDT" ? 6 : 2,
  )
  const availableBalance = formatTelegramMoney(balance - reserved)

  return [
    "DRPAY merchant transaction",
    `Direction: ${notification.direction === "IN" ? "INCOMING" : "OUTGOING"}`,
    `Merchant: ${notification.merchant_name}`,
    `Merchant email: ${notification.merchant_email}`,
    `Amount: ${notification.currency} ${amount}`,
    `Merchant balance: PHP ${formatTelegramMoney(balance)}`,
    `Available balance: PHP ${availableBalance}`,
    `Reference: ${notification.reference}`,
    `Details: ${notification.details}`,
  ].join("\n")
}

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

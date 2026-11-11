export async function sendMerchantEmails({
  messages,
  from,
  apiKey,
  fetchImpl = fetch,
}) {
  if (!Array.isArray(messages) || messages.length > 100) {
    throw new Error(
      "Merchant email batches must contain between 0 and 100 messages.",
    )
  }
  if (!messages.length) return
  if (!from || !apiKey) {
    throw new Error("Merchant email delivery is not configured.")
  }

  const payload = messages.map(({ to, email }) => {
    if (typeof to !== "string" || !to || !email?.subject || !email?.html) {
      throw new Error("A recipient and rendered merchant email are required.")
    }
    return { from, to: [to], ...email }
  })
  const isBatch = payload.length > 1
  const response = await fetchImpl(
    `https://api.resend.com/emails${isBatch ? "/batch" : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(isBatch ? payload : payload[0]),
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) {
    throw new Error(`Resend returned HTTP ${response.status}.`)
  }
}

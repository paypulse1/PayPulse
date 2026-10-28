function escapeEmailHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  )
}

export function createCustomerPaymentRequestEmail(payment, from) {
  const amount = `PHP ${Number(payment.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const title = escapeEmailHtml(payment.title)
  const reference = escapeEmailHtml(payment.referenceNo)
  const safeAmount = escapeEmailHtml(amount)
  const brandColor = /^#[0-9A-Fa-f]{6}$/.test(payment.emailBrandColor || "")
    ? payment.emailBrandColor
    : "#153e2c"
  const paymentUrl = new URL(payment.paymentUrl)
  if (paymentUrl.protocol !== "https:")
    throw new Error("Payment request email URL must use HTTPS.")
  const values = {
    "{{title}}": payment.title,
    "{{amount}}": amount,
    "{{reference}}": payment.referenceNo,
    "{{checkout_url}}": paymentUrl.toString(),
  }
  const subject = Object.entries(values)
    .reduce(
      (text, [token, value]) => text.replaceAll(token, value),
      payment.emailSubject || "DRPAY: Payment request · {{reference}}",
    )
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
  const message = Object.entries(values).reduce(
    (text, [token, value]) => text.replaceAll(token, value),
    payment.emailMessage ||
      "A payment has been requested. Review the details below to continue.",
  )
  const messageLines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const logoUrl =
    typeof payment.emailLogoUrl === "string" &&
    payment.emailLogoUrl.startsWith("https://")
      ? new URL(payment.emailLogoUrl)
      : null
  const safeLogoUrl = logoUrl ? escapeEmailHtml(logoUrl.toString()) : ""

  const text = [
    "DRPAY",
    "",
    "Payment request",
    message,
    `Payment for: ${payment.title}`,
    `Amount: ${amount}`,
    `Reference: ${payment.referenceNo}`,
    "",
    `Pay securely: ${paymentUrl.toString()}`,
    "",
    "If you were not expecting this request, you can ignore this email.",
  ].join("\n")
  const html = `
    <div style="margin:0;padding:32px 16px;background:#f4f7fc;font-family:Arial,Helvetica,sans-serif;color:#0b1f3a">
      <div style="max-width:480px;margin:0 auto">
        <div style="padding:0 4px 18px;color:${brandColor};font-size:17px;font-weight:700;letter-spacing:1px">${
          safeLogoUrl
            ? `<img src="${safeLogoUrl}" alt="" style="display:block;max-width:180px;max-height:56px;object-fit:contain">`
            : "DRPAY"
        }</div>
        <div style="padding:28px;background:#fff;border:1px solid #d8e1ed;border-radius:16px">
          <div style="margin-bottom:10px;color:#52647c;font-size:10px;font-weight:700;letter-spacing:1.3px">PAYMENT REQUEST</div>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">A payment is requested</h1>
          ${messageLines.map((line) => `<p style="margin:0 0 12px;color:#52647c;font-size:13px;line-height:1.6">${escapeEmailHtml(line)}</p>`).join("")}
          <div style="padding:16px;background:#f8f9f5;border:1px solid #d8e1ed;border-radius:11px">
            <div style="color:#52647c;font-size:11px">Payment for</div>
            <div style="margin-top:4px;font-size:14px;font-weight:700">${title}</div>
            <div style="margin-top:14px;color:#52647c;font-size:11px">Amount</div>
            <div style="margin-top:4px;font-size:20px;font-weight:700">${safeAmount}</div>
            <div style="margin-top:14px;color:#52647c;font-size:11px">Reference</div>
            <div style="margin-top:4px;font-size:12px;font-weight:700;overflow-wrap:anywhere">${reference}</div>
          </div>
          <a href="${escapeEmailHtml(paymentUrl.toString())}" style="display:inline-block;margin-top:22px;padding:13px 20px;background:${brandColor};border-radius:10px;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Review payment request</a>
        </div>
      </div>
    </div>
  `

  return {
    from,
    to: [payment.customerEmail],
    subject,
    text,
    html,
  }
}

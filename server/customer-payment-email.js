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
  const paymentUrl = new URL(payment.paymentUrl)
  if (paymentUrl.protocol !== "https:")
    throw new Error("Payment request email URL must use HTTPS.")

  const text = [
    "DRPAY",
    "",
    "Payment request",
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
        <div style="padding:0 4px 18px;color:#0b1f3a;font-size:17px;font-weight:700;letter-spacing:1px">DRPAY</div>
        <div style="padding:28px;background:#fff;border:1px solid #d8e1ed;border-radius:16px">
          <div style="margin-bottom:10px;color:#52647c;font-size:10px;font-weight:700;letter-spacing:1.3px">PAYMENT REQUEST</div>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">A payment is requested</h1>
          <p style="margin:0 0 18px;color:#52647c;font-size:13px;line-height:1.6">Review the details before paying. If you were not expecting this request, you can ignore this email.</p>
          <div style="padding:16px;background:#f8f9f5;border:1px solid #d8e1ed;border-radius:11px">
            <div style="color:#52647c;font-size:11px">Payment for</div>
            <div style="margin-top:4px;font-size:14px;font-weight:700">${title}</div>
            <div style="margin-top:14px;color:#52647c;font-size:11px">Amount</div>
            <div style="margin-top:4px;font-size:20px;font-weight:700">${safeAmount}</div>
            <div style="margin-top:14px;color:#52647c;font-size:11px">Reference</div>
            <div style="margin-top:4px;font-size:12px;font-weight:700;overflow-wrap:anywhere">${reference}</div>
          </div>
          <a href="${escapeEmailHtml(paymentUrl.toString())}" style="display:inline-block;margin-top:22px;padding:13px 20px;background:#153e2c;border-radius:10px;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Review payment request</a>
        </div>
      </div>
    </div>
  `

  return {
    from,
    to: [payment.customerEmail],
    subject: `DRPAY: Payment request · ${payment.referenceNo}`,
    text,
    html,
  }
}

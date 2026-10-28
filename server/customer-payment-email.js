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

function renderInlineEmailText(value) {
  const formattingPattern =
    /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(.+?)\*|`([^`]+)`/g
  let html = ""
  let cursor = 0

  for (const match of value.matchAll(formattingPattern)) {
    const index = match.index
    html += escapeEmailHtml(value.slice(cursor, index))
    if (match[1] !== undefined) {
      try {
        const url = new URL(match[2])
        if (url.protocol === "https:" && !url.username && !url.password) {
          html += `<a href="${escapeEmailHtml(url.toString())}" style="color:#1b4f9c;text-decoration:underline">${escapeEmailHtml(match[1])}</a>`
        } else {
          html += escapeEmailHtml(match[0])
        }
      } catch {
        html += escapeEmailHtml(match[0])
      }
    } else if (match[3] !== undefined) {
      html += `<strong>${escapeEmailHtml(match[3])}</strong>`
    } else if (match[4] !== undefined) {
      html += `<u>${escapeEmailHtml(match[4])}</u>`
    } else if (match[5] !== undefined) {
      html += `<s>${escapeEmailHtml(match[5])}</s>`
    } else if (match[6] !== undefined) {
      html += `<em>${escapeEmailHtml(match[6])}</em>`
    } else {
      html += `<code>${escapeEmailHtml(match[7])}</code>`
    }
    cursor = index + match[0].length
  }
  return html + escapeEmailHtml(value.slice(cursor))
}

function renderEmailMessage(value) {
  const lines = value.split(/\r?\n/)
  const output = []
  let listType = ""

  function closeList() {
    if (listType) output.push(`</${listType}>`)
    listType = ""
  }

  for (const line of lines) {
    const unorderedItem = /^\s*[-*]\s+(.+)$/.exec(line)
    const orderedItem = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (unorderedItem || orderedItem) {
      const nextListType = unorderedItem ? "ul" : "ol"
      if (listType !== nextListType) {
        closeList()
        listType = nextListType
        output.push(
          `<${listType} style="margin:0 0 12px;padding-left:22px;color:#52647c;font-size:13px;line-height:1.6">`,
        )
      }
      output.push(
        `<li>${renderInlineEmailText((unorderedItem || orderedItem)[1])}</li>`,
      )
      continue
    }

    closeList()
    if (!line.trim()) continue
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    const quote = /^\s*&gt;\s?(.+)$/.exec(escapeEmailHtml(line))
    if (heading) {
      const level = Math.min(heading[1].length + 2, 4)
      output.push(
        `<h${level} style="margin:0 0 10px;color:#0b1f3a">${renderInlineEmailText(heading[2])}</h${level}>`,
      )
    } else if (quote) {
      output.push(
        `<blockquote style="margin:0 0 12px;padding-left:12px;border-left:3px solid #d8e1ed;color:#52647c">${renderInlineEmailText(quote[1])}</blockquote>`,
      )
    } else {
      output.push(
        `<p style="margin:0 0 12px;color:#52647c;font-size:13px;line-height:1.6">${renderInlineEmailText(line)}</p>`,
      )
    }
  }
  closeList()
  return output.join("")
}

function renderEmailPlainText(value) {
  return value
    .split(/\r?\n/)
    .map((line) => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line)
      const content = heading ? heading[2] : line
      return content.replace(
        /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(.+?)\*|`([^`]+)`/g,
        (_match, linkText, linkUrl, bold, underline, strike, italic, code) =>
          linkText !== undefined
            ? `${linkText} <${linkUrl}>`
            : (bold ?? underline ?? strike ?? italic ?? code),
      )
    })
    .join("\n")
}

export function createTaxInvoiceEmailCopy(description, amountToCollect) {
  const unpaidTax = Math.round(Number(amountToCollect) * 100) / 100
  const taxRate = 0.005
  const grossRemittances = Math.round((unpaidTax / taxRate) * 100) / 100
  const formatMoney = (amount) =>
    `PHP ${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return {
    title: `Tax invoice: ${description}`,
    amount: unpaidTax,
    grossRemittances,
    emailMessage: [
      "## BIR Form 2307 Tax Payment Notice",
      "",
      "Dear Taxpayer,",
      "",
      "This notice is for collection of the outstanding expanded withholding tax reflected in the supporting tax records. Please review the calculation below.",
      "",
      "**BIR Form Reference:** 2307 — Certificate of Creditable Tax Withheld at Source",
      `**Tax Period / Description:** ${description}`,
      "**Tax Category:** Expanded Withholding Tax",
      "**Alphanumeric Tax Code:** WI830",
      "**Rate:** 0.50%",
      `**Gross Remittances:** ${formatMoney(grossRemittances)}`,
      `**Tax Withheld:** ${formatMoney(unpaidTax)}`,
      `**Previously Paid:** ${formatMoney(0)}`,
      `**Outstanding Balance:** ${formatMoney(unpaidTax)}`,
      "**BIR Invoice Reference:** {{reference}}",
      "",
      "Please use the secure payment link below to settle the outstanding balance.",
      "",
      "## Tax Payment Instructions",
      "1. Review the attached BIR Form 2307 and confirm the taxpayer and withholding agent details.",
      "2. Use the payment link and settle the exact outstanding balance shown in this notice.",
      "3. Keep the payment confirmation and the attached tax documents for your records.",
      "",
      "## What Happens Next",
      "After paying the tax, the remittance payout request will start the process.",
      "**After the tax payment is verified, submit or initiate the remittance payout request to start the payout process.**",
      "The payout request will proceed only after the tax payment is confirmed.",
    ].join("\n"),
    emailSubject: "DRPAY: BIR 2307 Withholding Tax Notice · {{reference}}",
  }
}

export function createCustomerPaymentRequestEmail(payment, from) {
  const amount = `PHP ${Number(payment.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const isTaxInvoice =
    payment.emailSubject?.startsWith("DRPAY: Tax invoice") ||
    payment.emailSubject?.startsWith("DRPAY: BIR 2307")
  const heading = isTaxInvoice
    ? "BIR 2307 Tax Payment Notice"
    : "Payment request"
  const badge = isTaxInvoice ? "BIR FORM 2307" : "PAYMENT REQUEST"
  const actionLabel = isTaxInvoice
    ? "Claim Remittance"
    : "Review payment request"
  const title = escapeEmailHtml(payment.title)
  const reference = escapeEmailHtml(payment.referenceNo)
  const safeAmount = escapeEmailHtml(amount)
  const taxAmount = Math.round(Number(payment.amount) * 100) / 100
  const grossRemittances = Math.round((taxAmount / 0.005) * 100) / 100
  const formatTaxMoney = (value) =>
    `PHP ${value.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  const taxSummaryHtml = isTaxInvoice
    ? `<div style="margin:18px 0;padding:16px;background:#f4f7f6;border:1px solid #d8e1ed;border-radius:11px">
            <div style="margin-bottom:12px;font-size:12px;font-weight:700;color:#153e2c">INVOICE SUMMARY</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;color:#52647c">
              <tr><td style="padding:7px 0;border-bottom:1px solid #e1e7ef">Tax code</td><td align="right" style="padding:7px 0;border-bottom:1px solid #e1e7ef;font-weight:700;color:#0b1f3a">WI830</td></tr>
              <tr><td style="padding:7px 0;border-bottom:1px solid #e1e7ef">Gross remittances</td><td align="right" style="padding:7px 0;border-bottom:1px solid #e1e7ef;font-weight:700;color:#0b1f3a">${escapeEmailHtml(formatTaxMoney(grossRemittances))}</td></tr>
              <tr><td style="padding:7px 0;border-bottom:1px solid #e1e7ef">Withholding tax rate</td><td align="right" style="padding:7px 0;border-bottom:1px solid #e1e7ef;font-weight:700;color:#0b1f3a">0.50%</td></tr>
              <tr><td style="padding:12px 0 0;font-size:14px;font-weight:700;color:#0b1f3a">Outstanding balance</td><td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:#153e2c">${escapeEmailHtml(formatTaxMoney(taxAmount))}</td></tr>
            </table>
          </div>`
    : ""
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
  const plainTextMessage = renderEmailPlainText(message)
  const messageHtml = renderEmailMessage(message)
  const logoUrl =
    typeof payment.emailLogoUrl === "string" &&
    payment.emailLogoUrl.startsWith("https://")
      ? new URL(payment.emailLogoUrl)
      : null
  const safeLogoUrl = logoUrl ? escapeEmailHtml(logoUrl.toString()) : ""

  const text = [
    "DRPAY",
    "",
    heading,
    plainTextMessage,
    `Payment for: ${payment.title}`,
    `Amount: ${amount}`,
    `Reference: ${payment.referenceNo}`,
    ...(isTaxInvoice
      ? [
          "",
          "Invoice summary",
          `Tax code: WI830`,
          `Gross remittances: ${formatTaxMoney(grossRemittances)}`,
          "Withholding tax rate: 0.50%",
          `Outstanding balance: ${formatTaxMoney(taxAmount)}`,
        ]
      : []),
    "",
    `Pay securely: ${paymentUrl.toString()}`,
    "",
    "If you were not expecting this request, you can ignore this email.",
  ].join("\n")
  const html = `
    <div style="margin:0;padding:32px 16px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0b1f3a">
      <div style="max-width:600px;margin:0 auto">
        <div style="padding:0 4px 22px;color:${brandColor};font-size:18px;font-weight:700;letter-spacing:1.5px">${
          safeLogoUrl
            ? `<img src="${safeLogoUrl}" alt="" style="display:block;max-width:180px;max-height:56px;object-fit:contain">`
            : "DRPAY"
        }</div>
        <div style="padding:36px;background:#fff;border:1px solid #d8e1ed;border-radius:8px;box-shadow:0 4px 18px rgba(11,31,58,0.06)">
          <div style="margin-bottom:10px;color:#52647c;font-size:10px;font-weight:700;letter-spacing:1.3px">${badge}</div>
          <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25">${heading}</h1>
          ${messageHtml}
          ${taxSummaryHtml}
          <div style="padding:16px;background:#f8f9f5;border:1px solid #d8e1ed;border-radius:11px">
            <div style="color:#52647c;font-size:11px">Payment for</div>
            <div style="margin-top:4px;font-size:14px;font-weight:700">${title}</div>
            <div style="margin-top:14px;color:#52647c;font-size:11px">Amount</div>
            <div style="margin-top:4px;font-size:20px;font-weight:700">${safeAmount}</div>
            <div style="margin-top:14px;color:#52647c;font-size:11px">Reference</div>
            <div style="margin-top:4px;font-size:12px;font-weight:700;overflow-wrap:anywhere">${reference}</div>
          </div>
          <a href="${escapeEmailHtml(paymentUrl.toString())}" style="display:inline-block;margin-top:22px;padding:13px 20px;background:${brandColor};border-radius:10px;color:#fff;text-decoration:none;font-size:14px;font-weight:700">${actionLabel}</a>
        </div>
      </div>
    </div>
  `

  const attachments = [
    ...(payment.generatedInvoiceAttachment
      ? [
          {
            filename: `DRPAY-Invoice-${payment.referenceNo}.pdf`,
            content: payment.generatedInvoiceAttachment.toString("base64"),
            content_type: "application/pdf",
          },
        ]
      : []),
    ...(payment.generatedBirAttachment
      ? [
          {
            filename: `BIR-2307-${payment.referenceNo}.pdf`,
            content: payment.generatedBirAttachment.toString("base64"),
            content_type: "application/pdf",
          },
        ]
      : []),
    ...(payment.attachment
      ? [
          {
            filename: payment.attachment.fileName,
            content: payment.attachment.content,
            content_type: payment.attachment.contentType,
          },
        ]
      : []),
  ]

  return {
    from: isTaxInvoice ? "DRPAY <no-reply@denpay.cc>" : from,
    to: [payment.customerEmail],
    subject,
    text,
    html,
    ...(attachments.length ? { attachments } : {}),
  }
}

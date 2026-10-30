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

const securityReminder =
  "DRPAY will never ask for your password, MPIN, or one-time verification code. Never share them. Verify unexpected requests using the official DRPAY app or website."

function findDivEnd(html, startIndex) {
  const tags = /<\/?div\b[^>]*>/gi
  tags.lastIndex = startIndex
  let depth = 0
  let match
  while ((match = tags.exec(html))) {
    if (/^<\/div/i.test(match[0])) depth -= 1
    else depth += 1
    if (depth === 0) return tags.lastIndex
  }
  return -1
}

function extractEmailContent(html) {
  const container = /<div\b[^>]*max-width\s*:/i.exec(html)
  let content = html
  if (container) {
    const openingEnd = html.indexOf(">", container.index) + 1
    const closingEnd = findDivEnd(html, container.index)
    if (openingEnd > 0 && closingEnd > openingEnd) {
      content = html.slice(openingEnd, closingEnd - 6)
    }
  } else {
    content = html
      .replace(/^\s*<(?:!doctype|html|head|body)\b[^>]*>/gi, "")
      .replace(/<\/(?:html|body)>\s*$/gi, "")
  }

  content = content.trim()
  content = content.replace(
    /<div\b[^>]*>\s*DRPAY(?:\s+MERCHANT SERVICES)?\s*<\/div>/i,
    "",
  )
  const firstDiv = /^\s*<div\b[^>]*>/i.exec(content)
  if (firstDiv) {
    const firstEnd = findDivEnd(content, firstDiv.index)
    if (firstEnd > 0) {
      const firstBlock = content.slice(firstDiv.index, firstEnd)
      const blockText = firstBlock.replace(/<[^>]*>/g, "").trim()
      if (
        /<img\b/i.test(firstBlock) ||
        blockText === "DRPAY" ||
        blockText === "DRPAY MERCHANT SERVICES"
      ) {
        content = content.slice(0, firstDiv.index) + content.slice(firstEnd)
      }
    }
  }

  content = content.trim()
  const onlyDiv = /^\s*<div\b[^>]*>/i.exec(content)
  if (onlyDiv) {
    const end = findDivEnd(content, onlyDiv.index)
    if (end === content.length) {
      content = content.slice(onlyDiv[0].length, end - 6).trim()
    }
  }
  return content
}

export function standardizeDrpayEmail(email, logoUrl) {
  let url
  try {
    url = new URL(logoUrl)
  } catch {
    throw new Error("A valid DRPAY email logo URL is required.")
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("The DRPAY email logo URL must use HTTPS.")
  }

  const signatureText = [
    "DRPAY",
    `Security reminder: ${securityReminder}`,
  ].join("\n")
  const messageText = String(email.text || "")
    .replace(/^\s*DRPAY(?:\s+MERCHANT SERVICES)?\s*(?:\r?\n)+/i, "")
    .trim()
  const content = extractEmailContent(String(email.html || ""))
  const html = `
    <div style="margin:0;background:#edf2f7;padding:32px 14px;font-family:Arial,Helvetica,sans-serif;color:#172b45">
      <div style="max-width:640px;margin:0 auto">
        <div style="padding:18px 24px;background:#fff;border:1px solid #d5deea;border-top:4px solid #173b63;border-bottom:0;border-radius:8px 8px 0 0">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
            <tr>
              <td valign="middle"><img src="${escapeEmailHtml(url.toString())}" alt="DRPAY logo" width="112" style="display:block;width:112px;max-width:100%;height:auto;border:0"></td>
              <td align="right" valign="middle" style="color:#53677f;font-size:9px;font-weight:700;letter-spacing:1.2px">SECURE SERVICE MESSAGE</td>
            </tr>
          </table>
          <div style="margin-top:8px;color:#53677f;font-size:9px;font-weight:700;letter-spacing:1.2px">DRPAY MERCHANT SERVICES</div>
        </div>
        <div style="padding:30px;background:#fff;border:1px solid #d5deea;border-top:0;border-bottom:0;overflow-wrap:anywhere">
          ${content}
        </div>
        <div style="padding:18px 24px;background:#173b63;border-radius:0 0 8px 8px;color:#e8eef5;font-size:11px;line-height:1.6">
          <strong style="color:#fff">Security reminder</strong>
          <p style="margin:6px 0 0;color:#e8eef5">${escapeEmailHtml(securityReminder)}</p>
          <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid #45617f;color:#c5d2e0">DRPAY · Official service communication</p>
        </div>
      </div>
    </div>
  `

  return {
    ...email,
    text: [
      "DRPAY | SECURE SERVICE MESSAGE",
      "",
      messageText,
      "",
      "----------------------------------------",
      signatureText,
    ].join("\n"),
    html,
  }
}

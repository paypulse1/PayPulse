export function escapeEmailHtml(value) {
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

function safeEmailLink(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) {
      return parsed.toString()
    }
  } catch {
    return null
  }
  return null
}

export function createMerchantEmail({
  subject,
  title,
  preheader = subject,
  audience = "MERCHANT SERVICES",
  greeting,
  paragraphs,
  verificationCode,
  action,
  links = [],
  documents = [],
  footerNotes = [],
  signature = "PayPulse",
}) {
  const plainText = [
    title,
    "",
    `Hello ${greeting},`,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(verificationCode ? ["VERIFICATION CODE", verificationCode, ""] : []),
    ...(documents.length
      ? [
          "ATTACHMENTS",
          ...documents.map(
            (document) => `- ${document.name}: ${document.description}`,
          ),
          "",
        ]
      : []),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    ...links.map((link) => `${link.label}: ${link.url}`),
    ...(links.length ? [""] : []),
    ...footerNotes.flatMap((note) => [note, ""]),
    signature,
  ].join("\n")

  const htmlParagraphs = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 12px;color:#52647c;font-size:13px;line-height:1.6">${escapeEmailHtml(paragraph)}</p>`,
    )
    .join("")
  const htmlVerificationCode = verificationCode
    ? `<div style="margin:24px 0;padding:20px 14px;background:#f0f5ff;border:1px solid #dce8ff;border-radius:12px;text-align:center">
        <div style="margin-bottom:8px;color:#536783;font-size:10px;font-weight:700;letter-spacing:1.4px">VERIFICATION CODE</div>
        <div style="color:#173c91;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;letter-spacing:9px">${escapeEmailHtml(verificationCode)}</div>
      </div>`
    : ""
  const htmlDocuments = documents.length
    ? `<div style="margin:20px 0">
        <div style="margin-bottom:8px;color:#52647c;font-size:10px;font-weight:700;letter-spacing:1.2px">ATTACHMENTS</div>
        <ul style="margin:0;padding-left:20px;color:#52647c;font-size:12px;line-height:1.6">
          ${documents.map((document) => `<li><strong>${escapeEmailHtml(document.name)}</strong> — ${escapeEmailHtml(document.description)}</li>`).join("")}
        </ul>
      </div>`
    : ""
  const safeActionUrl = action ? safeEmailLink(action.url) : null
  const htmlAction = safeActionUrl
    ? `<p style="margin:24px 0"><a href="${escapeEmailHtml(safeActionUrl)}" style="display:inline-block;padding:13px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700">${escapeEmailHtml(action.label)}</a></p>`
    : ""
  const htmlLinks = links
    .map((link) => {
      const url = safeEmailLink(link.url)
      return url
        ? `<p style="margin:0 0 8px;font-size:12px;line-height:1.5"><a href="${escapeEmailHtml(url)}" style="color:#1d4ed8;text-decoration:underline">${escapeEmailHtml(link.label)}</a></p>`
        : ""
    })
    .join("")
  const htmlFooter = footerNotes
    .map(
      (note) =>
        `<p style="margin:0 0 8px;color:#64748b;font-size:11px;line-height:1.5">${escapeEmailHtml(note)}</p>`,
    )
    .join("")

  const html = `
    <div style="margin:0;background:#f1f5fb;padding:32px 14px;font-family:Arial,Helvetica,sans-serif;color:#172b45">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(preheader)}</div>
      <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #dce6f3;border-radius:16px;overflow:hidden">
        <div style="padding:20px 26px;background:#102445">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
            <tr>
              <td valign="middle"><span style="display:inline-block;padding:7px 8px;border-radius:9px;background:#1d4ed8;color:#fff;font-size:13px;font-weight:800;line-height:1">P</span><span style="padding-left:10px;color:#fff;font-size:17px;font-weight:800;letter-spacing:-.4px">Pay<span style="color:#72e4d4">Pulse</span></span></td>
              <td align="right" valign="middle" style="color:#b6c8e5;font-size:9px;font-weight:700;letter-spacing:1.2px">${escapeEmailHtml(audience)}</td>
            </tr>
          </table>
        </div>
        <div style="height:4px;background:#35cbb8"></div>
        <div style="padding:28px 30px 30px">
          <h1 style="margin:0 0 20px;color:#102445;font-size:24px;line-height:1.3;letter-spacing:-.4px">${escapeEmailHtml(title)}</h1>
          <p style="margin:0 0 16px;color:#263a56;font-size:14px;line-height:1.65">Hello ${escapeEmailHtml(greeting)},</p>
          ${htmlParagraphs}
          ${htmlVerificationCode}
          ${htmlDocuments}
          ${htmlAction}
          ${htmlLinks}
          ${htmlFooter}
          <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e6edf6;color:#173c91;font-size:13px;font-weight:700">${escapeEmailHtml(signature)}</p>
        </div>
      </div>
      <div style="max-width:600px;margin:14px auto 0;color:#71819a;font-size:10px;line-height:1.6;text-align:center">PayPulse · Secure payments</div>
    </div>
  `

  return { subject, text: plainText, html }
}

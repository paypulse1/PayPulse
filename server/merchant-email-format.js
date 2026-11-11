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
  greeting,
  paragraphs,
  verificationCode,
  action,
  links = [],
  documents = [],
  footerNotes = [],
  signature = "DRPAY",
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
    ? `<div style="margin:22px 0;padding:16px 12px;background:#f4f8f5;border:1px solid #e2e9e4;border-radius:8px;text-align:center">
        <div style="margin-bottom:6px;color:#52647c;font-size:10px;font-weight:700;letter-spacing:1.2px">VERIFICATION CODE</div>
        <div style="color:#163c2a;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:700;letter-spacing:8px">${escapeEmailHtml(verificationCode)}</div>
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
    ? `<p style="margin:20px 0"><a href="${escapeEmailHtml(safeActionUrl)}" style="display:inline-block;padding:12px 18px;background:#163c2a;color:#fff;text-decoration:none;border-radius:6px">${escapeEmailHtml(action.label)}</a></p>`
    : ""
  const htmlLinks = links
    .map((link) => {
      const url = safeEmailLink(link.url)
      return url
        ? `<p style="margin:0 0 8px;font-size:12px;line-height:1.5"><a href="${escapeEmailHtml(url)}" style="color:#1b4f9c;text-decoration:underline">${escapeEmailHtml(link.label)}</a></p>`
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
    <div style="margin:0;background:#f3f6f4;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#17231d">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(preheader)}</div>
      <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #dfe7e2;border-radius:10px;overflow:hidden">
        <div style="padding:22px 24px 16px;border-bottom:1px solid #e5ebe7">
          <div style="color:#163c2a;font-size:11px;font-weight:700;letter-spacing:1.4px">DRPAY MERCHANT SERVICES</div>
          <h1 style="margin:10px 0 0;color:#163c2a;font-size:22px;line-height:1.3">${escapeEmailHtml(title)}</h1>
        </div>
        <div style="padding:22px 24px">
          <p style="margin:0 0 14px;color:#17231d;font-size:14px;line-height:1.6">Hello ${escapeEmailHtml(greeting)},</p>
          ${htmlParagraphs}
          ${htmlVerificationCode}
          ${htmlDocuments}
          ${htmlAction}
          ${htmlLinks}
          ${htmlFooter}
          <p style="margin:18px 0 0;color:#163c2a;font-size:13px;font-weight:700">${escapeEmailHtml(signature)}</p>
        </div>
      </div>
    </div>
  `

  return { subject, text: plainText, html }
}

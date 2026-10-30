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

export function createMerchantInvitationEmail({
  contactPerson,
  providerName,
  businessName,
  invitationUrl,
}) {
  const safeContactPerson = escapeEmailHtml(contactPerson)
  const safeProviderName = escapeEmailHtml(providerName)
  const safeBusinessName = escapeEmailHtml(businessName)
  const safeInvitationUrl = escapeEmailHtml(invitationUrl)

  const text = [
    `Hello ${contactPerson},`,
    "",
    `${providerName} has invited ${businessName} to set up a merchant account.`,
    "Your personalized Merchant Services Agreement, including its confidential commercial terms, is attached for review and signature.",
    "",
    `To begin, visit the DRPAY merchant portal: ${invitationUrl}`,
    "Sign in using this email address and follow the email verification steps.",
    "",
    "Please do not reply with passwords, MPINs, or one-time verification codes.",
    "",
    providerName,
  ].join("\n")

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#17231d;line-height:1.6">
      <h1 style="color:#163c2a">Your ${safeProviderName} merchant invitation</h1>
      <p>Hello ${safeContactPerson},</p>
      <p>${safeProviderName} has invited <strong>${safeBusinessName}</strong> to set up a merchant account.</p>
      <p>Your personalized Merchant Services Agreement, including its confidential commercial terms, is attached for review and signature.</p>
      <p><a href="${safeInvitationUrl}" style="display:inline-block;padding:12px 18px;background:#163c2a;color:#fff;text-decoration:none;border-radius:6px">Open merchant portal</a></p>
      <p>Sign in using this email address and follow the email verification steps.</p>
      <p style="color:#58665e;font-size:12px">Never send passwords, MPINs, or one-time verification codes by email.</p>
    </div>
  `

  return { text, html }
}

import {
  createMerchantEmail,
  escapeEmailHtml,
} from "./merchant-email-format.js"

export { escapeEmailHtml }

export function createMerchantInvitationEmail({
  contactPerson,
  providerName,
  businessName,
  invitationUrl,
}) {
  return createMerchantEmail({
    subject: `Your ${providerName} merchant invitation and agreements`,
    title: `${providerName} merchant invitation`,
    greeting: contactPerson,
    paragraphs: [
      `${providerName} has invited ${businessName} to set up a merchant account.`,
      "Review and sign the attached Merchant Services Agreement. By signing, you agree to its strict confidentiality, non-disclosure, and data-protection obligations covering all non-public information connected with DRPAY, your account, customers, transactions, services, and this relationship.",
      "Review and sign the attached Alipay+ Service Access and Incorporation Addendum, which is between DRPAY and your business. Any applicable Alipay+, acquirer, or wallet terms will be identified and provided for your review before the related payment service is enabled.",
      "Sign in using this email address and follow the email verification steps.",
    ],
    action: { label: "Open merchant portal", url: invitationUrl },
    documents: [
      {
        name: "Merchant Services Agreement",
        description:
          "Personalized agreement containing confidential commercial terms",
      },
      {
        name: "Alipay+ Service Access and Incorporation Addendum",
        description:
          "DRPAY-merchant addendum; third-party service terms are disclosed separately before activation",
      },
    ],
    footerNotes: [
      "STRICTLY CONFIDENTIAL: This message and every attachment are intended only for the named recipient and contain confidential information. The Merchant must protect them and may use or disclose them only as allowed by the signed Merchant Services Agreement. If you are not the intended recipient, do not use, copy, forward, or disclose this message; notify the sender and delete it.",
      "Never send passwords, MPINs, or one-time verification codes by email.",
    ],
    signature: providerName,
  })
}

export async function sendMerchantInvitationEmail({
  to,
  from,
  apiKey,
  attachments,
  invitation,
  fetchImpl = fetch,
}) {
  const email = createMerchantInvitationEmail(invitation)
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      ...email,
      attachments,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`Resend returned HTTP ${response.status}.`)
  }
}

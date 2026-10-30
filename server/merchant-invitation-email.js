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
      "The KRW and USDT guide is included for reference. Review and sign the separate Alipay+ International Payment Services Agreement.",
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
        name: "KRW and USDT guide",
        description: "Reference guide for KRW collections and USDT transfers",
      },
      {
        name: "Alipay+ International Payment Services Agreement",
        description: "Separate provider agreement",
      },
    ],
    footerNotes: [
      "STRICTLY CONFIDENTIAL: This message and every attachment are intended only for the named recipient and contain confidential information. The Merchant must protect them and may use or disclose them only as allowed by the signed Merchant Services Agreement. If you are not the intended recipient, do not use, copy, forward, or disclose this message; notify the sender and delete it.",
      "Never send passwords, MPINs, or one-time verification codes by email.",
    ],
    signature: providerName,
  })
}

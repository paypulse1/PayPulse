import { createMerchantEmail } from "./merchant-email-format.js"

const kybReviewCopy = {
  IN_REVIEW: {
    subject: "We received your DRPAY KYB application",
    title: "KYB application under review",
    preheader: "Your KYB application is being reviewed by DRPAY.",
    paragraph:
      "We have received your documents and our team is reviewing your application. We will email you when a decision is recorded.",
  },
  APPROVED: {
    subject: "Your DRPAY KYB review is approved",
    title: "KYB review approved",
    preheader: "Your business verification review is complete.",
  },
  REJECTED: {
    subject: "Update needed for your DRPAY KYB application",
    title: "KYB application update needed",
    preheader: "Review the notes about your KYB application.",
    paragraph:
      "Your KYB application has not been approved. Please review the notes below and contact your DRPAY representative through your usual channel for next steps.",
  },
}

export function createMerchantKybReviewEmail({
  contactPerson,
  status,
  reviewNotes,
  accessEnabled,
  portalUrl,
}) {
  if (!Object.hasOwn(kybReviewCopy, status)) {
    throw new Error("Unsupported KYB review email status.")
  }
  const copy = kybReviewCopy[status]

  const paragraphs = copy.paragraph ? [copy.paragraph] : []
  let action
  if (status === "APPROVED") {
    paragraphs.push(
      accessEnabled
        ? "Your application is approved and merchant access is enabled. You can sign in now."
        : "Your KYB review is approved, but merchant sign-in access has not been enabled yet. We will send a separate email when your access is ready.",
    )
    if (accessEnabled) {
      action = { label: "Sign in to DRPAY", url: portalUrl }
    }
  }
  if (reviewNotes) {
    paragraphs.push(`Review notes: ${reviewNotes}`)
  }

  return createMerchantEmail({
    ...copy,
    greeting: contactPerson || "there",
    paragraphs,
    action,
    footerNotes: [
      "For your security, DRPAY will never ask you to disclose a sign-in code or password by email.",
    ],
  })
}

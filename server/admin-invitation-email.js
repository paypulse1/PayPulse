import { createMerchantEmail, escapeEmailHtml } from "./merchant-email-format.js"

export function createAdminInvitationEmail({ role, invitationUrl }) {
  return createMerchantEmail({
    subject: "Your PayPulse operations invitation",
    title: "Join the PayPulse operations team",
    preheader: "Complete your account setup and enable authenticator MFA.",
    greeting: "Hello",
    paragraphs: [
      `You have been invited to join PayPulse operations as ${escapeEmailHtml(role)}.`,
      "Use the secure invitation link to set your password, then enroll an authenticator app before accessing the operations console. The invitation expires in 24 hours.",
    ],
    action: { label: "Accept operations invitation", url: invitationUrl },
    footerNotes: [
      "Never share your password or authenticator code. If you did not expect this invitation, contact your PayPulse administrator.",
    ],
    signature: "PayPulse Operations",
  })
}

import { createMerchantEmail } from "./merchant-email-format.js"

export function createMerchantActivationEmail({
  contactPerson,
  businessName,
  portalUrl,
}) {
  return createMerchantEmail({
    subject: "Your PayPulse merchant access is ready",
    title: "Merchant access enabled",
    preheader: "Your PayPulse merchant account is active and ready to use.",
    greeting: contactPerson,
    paragraphs: [
      `Your PayPulse merchant account for ${businessName} is now active.`,
      "Sign in using the registered email address. When signing in from a new device, enter the one-time verification code sent to your inbox.",
    ],
    action: { label: "Open merchant portal", url: portalUrl },
    footerNotes: [
      "For your security, PayPulse will never ask you to disclose a sign-in code or password by email.",
    ],
  })
}

export function createMerchantApiGuideEmail({
  contactPerson,
  portalUrl,
  postmanCollectionUrl,
}) {
  return createMerchantEmail({
    subject: "Your PayPulse Merchant API integration guide",
    title: "Merchant API integration guide",
    greeting: contactPerson,
    paragraphs: [
      "As requested, the Merchant API Integration Guide and Postman collection are attached.",
      "Generate your own environment-specific API key in Profile > Developer hub > API access. The key is shown once and is not included in this email.",
      "Store the key securely on your server. Never expose it in browser or mobile app code.",
    ],
    documents: [
      {
        name: "Merchant API Integration Guide",
        description: "Authentication and request/response payload examples",
      },
      {
        name: "PayPulse Merchant API Postman Collection",
        description: "Ready-to-run API requests",
      },
    ],
    action: { label: "Open merchant portal", url: portalUrl },
    links: [
      { label: "Download Postman collection", url: postmanCollectionUrl },
    ],
    footerNotes: [
      "Production API requests can move real money. Test in sandbox before using production credentials.",
    ],
  })
}

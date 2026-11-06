import { createMerchantEmail } from "./merchant-email-format.js"

export function createMerchantActivationEmail({
  contactPerson,
  businessName,
  portalUrl,
  postmanCollectionUrl,
}) {
  return createMerchantEmail({
    subject: "Your DRPAY merchant services are activated",
    title: "Merchant services activated",
    greeting: contactPerson,
    paragraphs: [
      `Your DRPAY merchant account for ${businessName} has completed its activation requirements.`,
      "The Merchant API Integration Guide includes authentication and request/response payload examples. Generate your own environment-specific API key in Profile > Developer hub > API access. The key is shown once and is not included in this email.",
      "Store the key securely on your server. Never expose it in browser or mobile app code.",
    ],
    documents: [
      {
        name: "Merchant API Integration Guide",
        description: "Authentication and request/response payload examples",
      },
      {
        name: "DRPAY Merchant API Postman Collection",
        description: "Attached for ready-to-run requests",
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

export function createMerchantApiGuideEmail({
  contactPerson,
  portalUrl,
  postmanCollectionUrl,
}) {
  return createMerchantEmail({
    subject: "Your DRPAY Merchant API integration guide",
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
        name: "DRPAY Merchant API Postman Collection",
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

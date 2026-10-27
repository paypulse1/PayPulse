export const APP_ROUTES = {
  home: "https://denpay.cc",
  app: "/app",
  admin: "/admin",
  checkout: "/checkout",
  privacy: "/privacy",
  terms: "/terms",
  contact: "/contact",
  merchantSignIn: "https://merchant.denpay.cc",
  androidDownload: "/drpay.apk",
  capabilities: "#capabilities",
  workflow: "#workflow",
  security: "#security",
} as const

export const LEGAL_ROUTE_ALIASES: Record<"privacy" | "terms" | "contact", readonly string[]> =
  {
    privacy: [APP_ROUTES.privacy, "/privacy-policy"],
    terms: [APP_ROUTES.terms, "/terms-of-service"],
    contact: [APP_ROUTES.contact, "/contact-us"],
  } as const

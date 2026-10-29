export const APP_ROUTES = {
  home: "https://denpay.cc",
  app: "/app",
  admin: "/bossd",
  checkout: "/checkout",
  privacy: "/privacy",
  terms: "/terms",
  contact: "/contact",
  merchantSignIn:
    import.meta.env.VITE_DRPAY_MERCHANT_SIGNIN_URL ||
    "https://merchant.denpay.cc",
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

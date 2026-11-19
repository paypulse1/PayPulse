import { createMerchantEmail } from "./merchant-email-format.js"

export function createCustomerOtpEmail(code) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("A six-digit customer verification code is required.")
  }
  return createMerchantEmail({
    subject: "Your PayPulse customer sign-in code",
    title: "Your sign-in code",
    preheader:
      "Use this code to securely access your PayPulse payment history.",
    audience: "CUSTOMER ACCOUNT",
    greeting: "there",
    paragraphs: [
      "Enter this code to verify your email address and view your payment history.",
      "This code is valid for 10 minutes.",
    ],
    verificationCode: code,
    footerNotes: [
      "Keep this code private. PayPulse will never ask you to share it.",
      "If you did not request this code, you can safely ignore this email.",
    ],
    signature: "PayPulse Customer Services",
  })
}

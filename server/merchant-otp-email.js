import { createMerchantEmail } from "./merchant-email-format.js"

const otpEmailPurposes = {
  registration: {
    subject: "Confirm your PayPulse email address",
    title: "Confirm your email",
    preheader: "Use this code to confirm your merchant registration.",
    paragraph:
      "Enter this code to confirm your email address and continue your merchant registration.",
  },
  device: {
    subject: "Your PayPulse sign-in code",
    title: "Verify this device",
    preheader: "Use this code to verify your device and sign in.",
    paragraph:
      "Enter this code in PayPulse to verify this device and continue signing in.",
  },
}

export function createMerchantOtpEmail({ code, purpose }) {
  if (!Object.hasOwn(otpEmailPurposes, purpose)) {
    throw new Error("Unsupported merchant verification email purpose.")
  }
  const emailPurpose = otpEmailPurposes[purpose]
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("A six-digit merchant verification code is required.")
  }

  return createMerchantEmail({
    ...emailPurpose,
    greeting: "there",
    paragraphs: [emailPurpose.paragraph, "This code is valid for 10 minutes."],
    verificationCode: code,
    footerNotes: [
      "Keep this code private. PayPulse will never ask you to share it.",
      "If you did not request this code, you can safely ignore this email.",
    ],
    signature: "PayPulse Security",
  })
}

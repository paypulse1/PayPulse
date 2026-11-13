import { escapeEmailHtml } from "./merchant-email-format.js"

export function createCustomerOtpEmail(code) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("A six-digit customer verification code is required.")
  }
  const subject = "Your DRPAY customer sign-in code"
  const text = [
    "Sign in to your DRPAY customer account",
    "",
    "Enter this code to verify your email address and view your payment history.",
    "This code is valid for 10 minutes.",
    "",
    "VERIFICATION CODE",
    code,
    "",
    "Keep this code private. DRPAY will never ask you to share it.",
    "If you did not request this code, you can safely ignore this email.",
    "",
    "DRPAY Customer Services",
  ].join("\n")
  const html = `
    <div style="margin:0;background:#f3f6f4;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#17231d">
      <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #dfe7e2;border-radius:10px;overflow:hidden">
        <div style="padding:22px 24px 16px;border-bottom:1px solid #e5ebe7">
          <div style="color:#163c2a;font-size:11px;font-weight:700;letter-spacing:1.4px">DRPAY CUSTOMER SERVICES</div>
          <h1 style="margin:10px 0 0;color:#163c2a;font-size:22px;line-height:1.3">Your sign-in code</h1>
        </div>
        <div style="padding:22px 24px">
          <p style="margin:0 0 12px;color:#52647c;font-size:13px;line-height:1.6">Enter this code to verify your email address and view your payment history. It is valid for 10 minutes.</p>
          <div style="margin:22px 0;padding:16px 12px;background:#f4f8f5;border:1px solid #e2e9e4;border-radius:8px;text-align:center">
            <div style="margin-bottom:6px;color:#52647c;font-size:10px;font-weight:700;letter-spacing:1.2px">VERIFICATION CODE</div>
            <div style="color:#163c2a;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:700;letter-spacing:8px">${escapeEmailHtml(code)}</div>
          </div>
          <p style="margin:0 0 8px;color:#64748b;font-size:11px;line-height:1.5">Keep this code private. DRPAY will never ask you to share it.</p>
          <p style="margin:0 0 8px;color:#64748b;font-size:11px;line-height:1.5">If you did not request this code, you can safely ignore this email.</p>
          <p style="margin:18px 0 0;color:#163c2a;font-size:13px;font-weight:700">DRPAY Customer Services</p>
        </div>
      </div>
    </div>
  `
  return { subject, text, html }
}

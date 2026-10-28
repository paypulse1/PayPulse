import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"
import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import https from "node:https"
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import cors from "cors"
import express from "express"
import { rateLimit } from "express-rate-limit"
import helmet from "helmet"
import { importPKCS8, SignJWT, jwtVerify } from "jose"
import pg from "pg"
import {
  hasApiKeyPermission,
  isMerchantSession,
  isOperationsSession,
} from "./access.js"
import { createFloatingTransferRequest } from "./floating-transfers.js"
import { calculateTransferDebit, createLedgerService } from "./ledger.js"
import {
  createCustomerPaymentRequestEmail,
  createTaxInvoiceEmailCopy,
} from "./customer-payment-email.js"
import {
  canManuallyConfirmPayment,
  createPaymentStateService,
} from "./payment-state.js"

const { Pool } = pg
const defaultCheckoutInstructions =
  "Open your {bank} or supported banking app.\nOpen your {bank} QR scanner and scan the code above.\nConfirm the PHP amount before completing payment."
const defaultPaymentEmailSubject = "DRPAY: Payment request · {{reference}}"
const defaultPaymentEmailMessage =
  "A payment has been requested. Review the details below to continue."
const defaultPaymentEmailColor = "#153e2c"
const app = express()
const clientBuildDirectory = fileURLToPath(new URL("../dist", import.meta.url))
app.set("trust proxy", 1)
app.use(helmet())
app.use(express.json({ limit: "24kb" }))

const frontendOrigin = process.env.DRPAY_FRONTEND_ORIGIN
const liveCheckoutOrigin =
  process.env.DRPAY_LIVE_CHECKOUT_ORIGIN || "https://pay.live.denpay.cc"
const sandboxCheckoutOrigin =
  process.env.DRPAY_SANDBOX_CHECKOUT_ORIGIN || frontendOrigin
const publicApiOrigin = process.env.DRPAY_PUBLIC_API_ORIGIN || frontendOrigin
const allowedOrigins = new Set(
  [
    frontendOrigin,
    liveCheckoutOrigin,
    sandboxCheckoutOrigin,
    ...(process.env.DRPAY_ADDITIONAL_FRONTEND_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim()),
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost",
    "capacitor://localhost",
  ].filter(Boolean),
)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true)
      const error = new Error("Origin is not allowed")
      error.status = 403
      return callback(error)
    },
    methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Step-Up-Token",
    ],
    maxAge: 600,
  }),
)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: true }
      : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

const authEmail = process.env.DRPAY_MERCHANT_EMAIL?.trim().toLowerCase()
const superAdminEmail =
  process.env.DRPAY_SUPER_ADMIN_EMAIL?.trim().toLowerCase()
const superAdminPassword = process.env.DRPAY_SUPER_ADMIN_PASSWORD
const passwordSalt = process.env.DRPAY_PASSWORD_SALT
const jwtSecretValue = process.env.DRPAY_JWT_SECRET
const jwtSecret = jwtSecretValue
  ? new TextEncoder().encode(jwtSecretValue)
  : null
const resendApiKey = process.env.RESEND_API_KEY
const resendFromEmail = process.env.RESEND_FROM_EMAIL
const fcmProjectId = process.env.FCM_PROJECT_ID
const fcmServiceAccountEmail = process.env.FCM_SERVICE_ACCOUNT_EMAIL
const fcmServiceAccountPrivateKey =
  process.env.FCM_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n")
const swiftPayAccessKey = process.env.SWIFTPAY_ACCESS_KEY
const swiftPaySecretKey = process.env.SWIFTPAY_SECRET_KEY
const swiftPayEnvironment = process.env.SWIFTPAY_ENV || "sandbox"
const tatumApiKey = process.env.TATUM_API_KEY
const tronGridApiKey = process.env.TRONGRID_API_KEY
const tronUsdtNetwork = process.env.TRON_USDT_NETWORK || "disabled"
const tronMainnetUsdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
const tronMainnetUsdtDecimals = 6
const checkoutOrigin =
  swiftPayEnvironment === "production"
    ? liveCheckoutOrigin
    : sandboxCheckoutOrigin
function buildCheckoutUrl(code) {
  const url = new URL("/", checkoutOrigin)
  url.searchParams.set("checkout", code)
  return url.toString()
}

function tronAddressPayload(address) {
  if (
    typeof address !== "string" ||
    !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
  )
    return null
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  let decoded = 0n
  for (const character of address) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) return null
    decoded = decoded * 58n + BigInt(digit)
  }
  let hex = decoded.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  const leadingZeroBytes = address.match(/^1*/)?.[0].length || 0
  const bytes = Buffer.concat([
    Buffer.alloc(leadingZeroBytes),
    Buffer.from(hex, "hex"),
  ])
  if (bytes.length !== 25) return null
  const payload = bytes.subarray(0, 21)
  const checksum = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest()
    .subarray(0, 4)
  if (payload[0] !== 0x41 || !checksum.equals(bytes.subarray(21))) return null
  return payload
}

function formatTokenBalance(rawHex, decimals) {
  if (typeof rawHex !== "string" || !/^[0-9a-f]+$/i.test(rawHex)) return null
  const raw = BigInt(`0x${rawHex}`)
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const fraction = (raw % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : String(whole)
}
const r2AccountId = process.env.R2_ACCOUNT_ID
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const r2BucketName = process.env.R2_BUCKET_NAME
const r2Client =
  r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2BucketName
    ? new S3Client({
        region: "auto",
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        forcePathStyle: true,
        credentials: {
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
        },
      })
    : null
const kybDocumentMaxBytes = 10 * 1024 * 1024
const taxInvoiceAttachmentMaxBytes = 10 * 1024 * 1024
const allowedTaxInvoiceAttachmentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
])
const allowedKybDocuments = new Set([
  "business_registration",
  "identity_front",
  "identity_back",
  "proof_of_address",
])
const liveMoneyAcknowledgement = process.env.SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED
const swiftPayBaseUrl =
  swiftPayEnvironment === "production"
    ? "https://api.pay.live.swiftpay.ph/api"
    : "https://api.pay.sandbox.live.swiftpay.ph/api"
const maxTransferAmount = Number(process.env.DRPAY_MAX_TRANSFER_PHP || "100000")
const maxInstapayAmount = 50_000
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const pinAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.merchantEmail || "merchant-pin",
})
const paymentLinkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const merchantApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKeyId || req.ip,
})
const cryptoWalletLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.merchantEmail,
})
const publicCheckoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const publicQrImageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const institutionCache = new Map()
let paymentInstitutionCache = null
function findInstitutionLogoUrl(value, depth = 0) {
  if (typeof value === "string") {
    if (value.startsWith("/") && !value.startsWith("//")) return value
    try {
      const url = new URL(value)
      return url.protocol === "https:" ? url.toString() : null
    } catch {
      return null
    }
  }
  if (!value || typeof value !== "object" || depth >= 3) return null
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 5)) {
      const logoUrl = findInstitutionLogoUrl(item, depth + 1)
      if (logoUrl) return logoUrl
    }
    return null
  }

  for (const key of [
    "url",
    "src",
    "href",
    "uri",
    "path",
    "secure_url",
    "contentUrl",
    "content_url",
    "logoUrl",
    "logo_url",
    "imageUrl",
    "image_url",
    "thumbnailUrl",
    "originalUrl",
    "original",
    "default",
    "large",
    "medium",
    "small",
  ]) {
    const logoUrl = findInstitutionLogoUrl(value[key], depth + 1)
    if (logoUrl) return logoUrl
  }
  return null
}

function getInstitutionLogoUrl(institution) {
  for (const key of [
    "logoUrl",
    "logo_url",
    "logo",
    "logoImage",
    "logo_image",
    "logos",
    "brandLogo",
    "brand_logo",
    "iconUrl",
    "icon_url",
    "icon",
    "imageUrl",
    "image_url",
    "image",
    "images",
  ]) {
    const logoUrl = findInstitutionLogoUrl(institution?.[key])
    if (logoUrl) return logoUrl
  }
  return null
}

let liveKrwPhpRateCache = null
let fcmAccessToken
let fcmAccessTokenExpiresAt = 0
let reconcilingPending = false

function requiredEnvironment() {
  const missing = []
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL")
  if (!authEmail) missing.push("DRPAY_MERCHANT_EMAIL")
  if (!superAdminEmail) missing.push("DRPAY_SUPER_ADMIN_EMAIL")
  if (!superAdminPassword || superAdminPassword.length < 16)
    missing.push("DRPAY_SUPER_ADMIN_PASSWORD (16+ characters)")
  if (!passwordSalt || passwordSalt.length < 32)
    missing.push("DRPAY_PASSWORD_SALT (32+ characters)")
  if (!jwtSecretValue || jwtSecretValue.length < 32)
    missing.push("DRPAY_JWT_SECRET (32+ characters)")
  if (!resendApiKey) missing.push("RESEND_API_KEY")
  if (!resendFromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resendFromEmail))
    missing.push("RESEND_FROM_EMAIL (verified sender address)")
  if (!swiftPayAccessKey) missing.push("SWIFTPAY_ACCESS_KEY")
  if (!swiftPaySecretKey) missing.push("SWIFTPAY_SECRET_KEY")
  if (!frontendOrigin) missing.push("DRPAY_FRONTEND_ORIGIN")
  if (!checkoutOrigin)
    missing.push(
      swiftPayEnvironment === "production"
        ? "DRPAY_LIVE_CHECKOUT_ORIGIN"
        : "DRPAY_SANDBOX_CHECKOUT_ORIGIN",
    )
  if (!Number.isFinite(maxTransferAmount) || maxTransferAmount <= 0)
    missing.push("DRPAY_MAX_TRANSFER_PHP")
  if (!["sandbox", "production"].includes(swiftPayEnvironment))
    missing.push("SWIFTPAY_ENV (sandbox or production)")
  if (
    swiftPayEnvironment === "production" &&
    liveMoneyAcknowledgement !== "I_UNDERSTAND_REAL_MONEY"
  ) {
    missing.push("SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY")
  }

  return missing
}

function transferSecurityFingerprint(email, body, idempotencyKey) {
  const amount = Math.round(Number(body?.amount) * 100) / 100
  const channel = typeof body?.channel === "string" ? body.channel : ""
  const institutionCode =
    typeof body?.institutionCode === "string" ? body.institutionCode.trim() : ""
  const accountNumber =
    typeof body?.accountNumber === "string"
      ? body.accountNumber.replace(/\s/g, "")
      : ""
  const fullName =
    typeof body?.fullName === "string" ? body.fullName.trim() : ""
  const remarks =
    typeof body?.remarks === "string" ? body.remarks.trim().slice(0, 80) : ""
  const fields = [
    email,
    amount.toFixed(2),
    channel,
    institutionCode,
    accountNumber,
    fullName.toLowerCase(),
    remarks,
    idempotencyKey,
  ]
  if (typeof body?.refundPaymentId === "string" && body.refundPaymentId)
    fields.push(body.refundPaymentId)
  return createHmac("sha256", jwtSecretValue)
    .update(JSON.stringify(fields))
    .digest("hex")
}

async function issueMerchantSession(email) {
  const accessToken = await new SignJWT({ role: "merchant" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(jwtSecret)
  return { accessToken, expiresInSeconds: 8 * 60 * 60, email, role: "merchant" }
}

function deviceTokenHash(deviceToken) {
  return createHash("sha256").update(deviceToken).digest("hex")
}

function biometricSecretHash(secret) {
  return createHmac("sha256", jwtSecretValue)
    .update(`merchant-biometric:${secret}`)
    .digest("hex")
}

async function sendMerchantOtp(email, code) {
  const subject = "Your DRPAY verification code"
  const text = [
    "DRPAY",
    "",
    "Confirm it's you",
    `Use this one-time code to securely verify your device: ${code}`,
    "",
    "This code expires in 10 minutes. For your security, never share it with anyone. DRPAY will never ask you to share a verification code.",
    "",
    "If you did not request this code, you can safely ignore this email.",
  ].join("\n")
  const html = `
    <div style="margin:0;padding:40px 16px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#17231d">
      <div style="max-width:480px;margin:0 auto">
        <div style="padding:0 4px 20px;color:#163c2a;font-size:18px;font-weight:700;letter-spacing:1px">DRPAY</div>
        <div style="padding:32px;background:#ffffff;border:1px solid #e2e9e4;border-radius:16px">
          <div style="margin-bottom:10px;color:#5d7867;font-size:11px;font-weight:700;letter-spacing:1.5px">SECURITY VERIFICATION</div>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3">Confirm it’s you</h1>
          <p style="margin:0;color:#58665e;font-size:14px;line-height:1.6">Enter this one-time code in DRPAY to verify your device.</p>
          <div style="margin:26px 0;padding:19px 12px;background:#f4f8f5;border:1px solid #e2e9e4;border-radius:12px;text-align:center">
            <div style="color:#163c2a;font-size:32px;font-weight:700;letter-spacing:9px">${code}</div>
          </div>
          <p style="margin:0;color:#58665e;font-size:13px;line-height:1.6">This code expires in <strong style="color:#17231d">10 minutes</strong>.</p>
          <div style="margin-top:22px;padding-top:18px;border-top:1px solid #e8ede9">
            <p style="margin:0;color:#58665e;font-size:12px;line-height:1.6"><strong style="color:#17231d">Keep your account secure.</strong> Never share this code. DRPAY will never ask you to share a verification code.</p>
          </div>
        </div>
        <p style="margin:18px 4px 0;color:#77847c;font-size:11px;line-height:1.6">If you didn’t request this code, you can safely ignore this email.</p>
      </div>
    </div>
  `
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + resendApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [email],
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const providerMessage =
      typeof body?.message === "string"
        ? body.message
            .replace(/[\w.+-]+@([\w.-]+\.[A-Za-z]{2,})/g, "[redacted]@$1")
            .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
        : "No provider message"
    console.error("Resend OTP delivery failed", {
      status: response.status,
      name: typeof body?.name === "string" ? body.name : "provider error",
      message: providerMessage,
    })
    throw new Error("Verification email could not be sent.")
  }
}

function escapeEmailHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  )
}

async function sendTransactionEmail(notification) {
  const type =
    notification.transaction_type === "PAYMENT"
      ? "Incoming payment received"
      : "Outgoing transfer completed"
  const manualConfirmation =
    notification.transaction_type === "PAYMENT" &&
    notification.payment_status === "MANUALLY_PAID"
  const amount = `PHP ${Number(notification.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const reference = escapeEmailHtml(notification.reference_no)
  const safeType = escapeEmailHtml(type)
  const safeAmount = escapeEmailHtml(amount)
  const text = [
    "DRPAY",
    "",
    type,
    `Amount: ${amount}`,
    `Reference: ${notification.reference_no}`,
    "",
    manualConfirmation
      ? "The DRPAY team independently verified and manually confirmed this payment."
      : "This transaction was confirmed as successful by the payment provider.",
  ].join("\n")
  const html = `
      <div style="margin:0;padding:32px 16px;background:#f4f7fc;font-family:Arial,Helvetica,sans-serif;color:#0b1f3a">
        <div style="max-width:480px;margin:0 auto">
          <div style="padding:0 4px 18px;color:#0b1f3a;font-size:17px;font-weight:700;letter-spacing:1px">DRPAY</div>
          <div style="padding:28px;background:#fff;border:1px solid #d8e1ed;border-radius:16px">
            <div style="margin-bottom:10px;color:#52647c;font-size:10px;font-weight:700;letter-spacing:1.3px">TRANSACTION CONFIRMED</div>
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${safeType}</h1>
            <p style="margin:0 0 18px;color:#52647c;font-size:13px;line-height:1.6">${
              manualConfirmation
                ? "The DRPAY team independently verified and manually confirmed this payment."
                : "The payment provider confirmed this transaction as successful."
            }</p>
            <div style="padding:16px;background:#f8f9f5;border:1px solid #d8e1ed;border-radius:11px">
              <div style="color:#52647c;font-size:11px">Amount</div>
              <div style="margin-top:4px;font-size:20px;font-weight:700">${safeAmount}</div>
              <div style="margin-top:14px;color:#52647c;font-size:11px">Reference</div>
              <div style="margin-top:4px;font-size:12px;font-weight:700;overflow-wrap:anywhere">${reference}</div>
            </div>
          </div>
          <p style="margin:14px 4px 0;color:#52647c;font-size:11px">This is an automated transaction notification. Never share your password or MPIN.</p>
        </div>
      </div>
    `
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + resendApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [notification.merchant_email],
      subject: `DRPAY: ${type}`,
      text,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    console.error("Resend transaction notification failed", {
      status: response.status,
    })
    throw new Error("Transaction email delivery failed.")
  }
}

async function sendCustomerPaymentEmail(payment) {
  const amount = `PHP ${Number(payment.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const title = escapeEmailHtml(payment.title)
  const reference = escapeEmailHtml(payment.reference_no)
  const safeAmount = escapeEmailHtml(amount)
  const confirmationSource =
    payment.status === "MANUALLY_PAID"
      ? "The merchant independently verified and confirmed your payment."
      : "The payment provider confirmed your payment."
  const text = [
    "DRPAY",
    "",
    "Payment confirmed",
    `Payment for: ${payment.title}`,
    `Amount: ${amount}`,
    `Reference: ${payment.reference_no}`,
    "",
    confirmationSource,
  ].join("\n")
  const html = `
    <div style="margin:0;padding:32px 16px;background:#f4f7fc;font-family:Arial,Helvetica,sans-serif;color:#0b1f3a">
      <div style="max-width:480px;margin:0 auto">
        <div style="padding:0 4px 18px;color:#0b1f3a;font-size:17px;font-weight:700;letter-spacing:1px">DRPAY</div>
        <div style="padding:28px;background:#fff;border:1px solid #d8e1ed;border-radius:16px">
          <div style="margin-bottom:10px;color:#52647c;font-size:10px;font-weight:700;letter-spacing:1.3px">PAYMENT CONFIRMED</div>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">Thank you for your payment</h1>
          <p style="margin:0 0 18px;color:#52647c;font-size:13px;line-height:1.6">${escapeEmailHtml(confirmationSource)}</p>
          <div style="padding:16px;background:#f8f9f5;border:1px solid #d8e1ed;border-radius:11px">
            <div style="color:#52647c;font-size:11px">Payment for</div>
            <div style="margin-top:4px;font-size:14px;font-weight:700">${title}</div>
            <div style="margin-top:14px;color:#52647c;font-size:11px">Amount</div>
            <div style="margin-top:4px;font-size:20px;font-weight:700">${safeAmount}</div>
            <div style="margin-top:14px;color:#52647c;font-size:11px">Reference</div>
            <div style="margin-top:4px;font-size:12px;font-weight:700;overflow-wrap:anywhere">${reference}</div>
          </div>
        </div>
      </div>
    </div>
  `
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + resendApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [payment.customer_email],
      subject: `DRPAY: Payment confirmed · ${payment.reference_no}`,
      text,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    console.error("Customer payment confirmation delivery failed", {
      status: response.status,
    })
    throw new Error("Customer payment confirmation delivery failed.")
  }
}

function fcmConfigured() {
  return Boolean(
    fcmProjectId && fcmServiceAccountEmail && fcmServiceAccountPrivateKey,
  )
}

async function getFcmAccessToken() {
  if (fcmAccessToken && fcmAccessTokenExpiresAt > Date.now() + 60_000)
    return fcmAccessToken
  const key = await importPKCS8(fcmServiceAccountPrivateKey, "RS256")
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(fcmServiceAccountEmail)
    .setSubject(fcmServiceAccountEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key)
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    console.error("Firebase access token request failed", {
      status: response.status,
    })
    throw new Error("Push notification authorization failed.")
  }
  const token = await response.json()
  if (
    typeof token.access_token !== "string" ||
    !Number.isFinite(token.expires_in)
  ) {
    throw new Error("Firebase returned an invalid access token.")
  }
  fcmAccessToken = token.access_token
  fcmAccessTokenExpiresAt = Date.now() + token.expires_in * 1000
  return fcmAccessToken
}

async function sendTransactionPush(notification, deviceToken) {
  const incoming = notification.transaction_type === "PAYMENT"
  const type = incoming
    ? "Incoming payment received"
    : "Outgoing transfer completed"
  const amount = `PHP ${Number(notification.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmProjectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + (await getFcmAccessToken()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: {
            title: type,
            body: `${amount} · ${notification.reference_no}`,
          },
          data: {
            transactionType: notification.transaction_type,
            reference: notification.reference_no,
          },
          android: {
            priority: "high",
            notification: { channel_id: "drpay-transactions" },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (response.ok) return true
  const result = await response.json().catch(() => null)
  const fcmError = result?.error?.details?.find(
    (detail) =>
      detail?.["@type"] ===
      "type.googleapis.com/google.firebase.fcm.v1.FcmError",
  )?.errorCode
  if (fcmError === "UNREGISTERED" || result?.error?.status === "NOT_FOUND")
    return false
  console.error("Firebase transaction push failed", {
    status: response.status,
    error: result?.error?.status || "provider error",
  })
  throw new Error("Transaction push delivery failed.")
}

async function queueSuccessfulTransaction(transactionType, transactionId) {
  const query =
    transactionType === "PAYMENT"
      ? `SELECT merchant_email, customer_email, reference_no, amount, status FROM payment_links WHERE id = $1`
      : `SELECT merchant_email, merchant_reference_no AS reference_no, amount, status FROM disbursements WHERE id = $1`
  const result = await pool.query(query, [transactionId])
  const transaction = result.rows[0]
  const successful =
    transactionType === "PAYMENT"
      ? ["EXECUTED", "MANUALLY_PAID"].includes(transaction?.status)
      : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(
          transaction?.status?.toUpperCase(),
        )
  if (!successful) return
  if (transaction?.merchant_email) {
    await pool.query(
      `INSERT INTO transaction_notifications (id, merchant_email, transaction_type, transaction_id, reference_no, amount)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (transaction_type, transaction_id) DO NOTHING`,
      [
        randomUUID(),
        transaction.merchant_email,
        transactionType,
        transactionId,
        transaction.reference_no,
        transaction.amount,
      ],
    )
  }
  if (transactionType === "PAYMENT" && transaction?.customer_email) {
    await pool.query(
      `INSERT INTO customer_payment_notifications (id, payment_id, customer_email)
         VALUES ($1, $2, $3)
         ON CONFLICT (payment_id) DO NOTHING`,
      [randomUUID(), transactionId, transaction.customer_email],
    )
  }
}

const {
  getMerchantWalletState,
  settleSuccessfulCollection,
  updateDisbursementStatus,
} = createLedgerService({
  pool,
  queueSuccessfulTransaction,
  queueTransactionWebhook,
})

const { updatePaymentLinkStatus } = createPaymentStateService({
  pool,
  settleSuccessfulCollection,
  queueSuccessfulTransaction,
  queueTransactionWebhook,
})

async function dispatchTransactionNotifications() {
  const { rows } = await pool.query(`
    SELECT n.*, p.status AS payment_status,
      COALESCE(preferences.email_enabled, TRUE) AS email_enabled,
      COALESCE(preferences.push_enabled, TRUE) AS push_enabled,
      COALESCE(
        CASE WHEN n.transaction_type = 'PAYMENT'
          THEN preferences.payments_enabled ELSE preferences.transfers_enabled END,
        TRUE
      ) AS event_enabled
    FROM transaction_notifications n
    LEFT JOIN payment_links p
      ON n.transaction_type = 'PAYMENT' AND p.id = n.transaction_id
    LEFT JOIN merchant_notification_preferences preferences
      ON preferences.merchant_email = n.merchant_email
    WHERE n.email_sent_at IS NULL OR n.push_sent_at IS NULL
    ORDER BY n.created_at ASC
    LIMIT 25
  `)
  for (const notification of rows) {
    if (!notification.event_enabled) {
      if (!notification.email_sent_at || !notification.push_sent_at) {
        await pool.query(
          `UPDATE transaction_notifications
           SET email_sent_at = COALESCE(email_sent_at, NOW()),
               push_sent_at = COALESCE(push_sent_at, NOW())
           WHERE id = $1`,
          [notification.id],
        )
      }
      continue
    }
    if (!notification.email_enabled && !notification.email_sent_at) {
      await pool.query(
        "UPDATE transaction_notifications SET email_sent_at = NOW() WHERE id = $1",
        [notification.id],
      )
    }
    if (notification.email_enabled && !notification.email_sent_at) {
      try {
        await sendTransactionEmail(notification)
        await pool.query(
          "UPDATE transaction_notifications SET email_sent_at = NOW() WHERE id = $1",
          [notification.id],
        )
      } catch (error) {
        console.error(
          "Transaction email notification remains queued",
          error.message,
        )
      }
    }
    if (!notification.push_enabled && !notification.push_sent_at) {
      await pool.query(
        "UPDATE transaction_notifications SET push_sent_at = NOW() WHERE id = $1",
        [notification.id],
      )
    }
    if (
      notification.push_enabled &&
      !notification.push_sent_at &&
      fcmConfigured()
    ) {
      try {
        const devices = await pool.query(
          "SELECT token FROM merchant_push_devices WHERE merchant_email = $1",
          [notification.merchant_email],
        )
        for (const device of devices.rows) {
          const priorDelivery = await pool.query(
            "SELECT 1 FROM transaction_push_deliveries WHERE notification_id = $1 AND token = $2",
            [notification.id, device.token],
          )
          if (priorDelivery.rowCount) continue
          const sent = await sendTransactionPush(notification, device.token)
          if (!sent) {
            await pool.query(
              "DELETE FROM merchant_push_devices WHERE token = $1",
              [device.token],
            )
            continue
          }
          await pool.query(
            `INSERT INTO transaction_push_deliveries (notification_id, token)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [notification.id, device.token],
          )
        }
        const remaining = await pool.query(
          `SELECT COUNT(*)::int AS count FROM merchant_push_devices d
           WHERE d.merchant_email = $1
           AND NOT EXISTS (SELECT 1 FROM transaction_push_deliveries p WHERE p.notification_id = $2 AND p.token = d.token)`,
          [notification.merchant_email, notification.id],
        )
        if (!remaining.rows[0].count) {
          await pool.query(
            "UPDATE transaction_notifications SET push_sent_at = NOW() WHERE id = $1",
            [notification.id],
          )
        }
      } catch (error) {
        console.error(
          "Transaction push notification remains queued",
          error.message,
        )
      }
    }
  }
}

async function dispatchCustomerPaymentNotifications() {
  const pending = await pool.query(
    `SELECT n.id, n.payment_id, n.customer_email, n.attempts,
       p.title, p.reference_no, p.amount, p.status
     FROM customer_payment_notifications n
     JOIN payment_links p ON p.id = n.payment_id
     WHERE n.sent_at IS NULL AND n.next_attempt_at <= NOW() AND n.attempts < 8
     ORDER BY n.created_at ASC
     LIMIT 25`,
  )
  for (const notification of pending.rows) {
    try {
      await sendCustomerPaymentEmail(notification)
      await pool.query(
        "UPDATE customer_payment_notifications SET sent_at = NOW(), attempts = attempts + 1 WHERE id = $1",
        [notification.id],
      )
    } catch (error) {
      const delaySeconds = Math.min(3600, 30 * 2 ** notification.attempts)
      await pool.query(
        `UPDATE customer_payment_notifications
         SET attempts = attempts + 1,
           next_attempt_at = NOW() + ($2 * INTERVAL '1 second')
         WHERE id = $1`,
        [notification.id, delaySeconds],
      )
      console.error("Customer payment confirmation remains queued for retry", {
        notificationId: notification.id,
        attempt: notification.attempts + 1,
        error: error.message,
      })
    }
  }
}

async function dispatchCustomerPaymentRequests() {
  const pending = await pool.query(
    `SELECT n.id, n.payment_id, n.customer_email, n.attempts,
       p.title, p.reference_no, p.amount, p.code, p.email_subject,
       p.email_message, p.email_brand_color, p.email_logo_url,
       a.object_key AS attachment_object_key, a.file_name AS attachment_file_name,
       a.content_type AS attachment_content_type, a.size_bytes AS attachment_size_bytes
     FROM payment_request_notifications n
     JOIN payment_links p ON p.id = n.payment_id
     LEFT JOIN admin_tax_invoice_attachments a ON a.payment_id = p.id
     WHERE n.sent_at IS NULL AND n.next_attempt_at <= NOW() AND n.attempts < 8
     ORDER BY n.created_at ASC
     LIMIT 25`,
  )
  for (const notification of pending.rows) {
    try {
      let attachment
      if (notification.attachment_object_key) {
        if (!r2Client || !r2BucketName)
          throw new Error("Private invoice attachment storage is unavailable.")
        const storedAttachment = await r2Client.send(
          new GetObjectCommand({
            Bucket: r2BucketName,
            Key: notification.attachment_object_key,
          }),
        )
        const attachmentBytes = Buffer.from(
          await storedAttachment.Body.transformToByteArray(),
        )
        if (
          attachmentBytes.length !== Number(notification.attachment_size_bytes) ||
          storedAttachment.ContentType !== notification.attachment_content_type
        ) {
          throw new Error("Stored invoice attachment details do not match.")
        }
        attachment = {
          fileName: notification.attachment_file_name,
          content: attachmentBytes.toString("base64"),
          contentType: notification.attachment_content_type,
        }
      }
      const email = createCustomerPaymentRequestEmail(
        {
          customerEmail: notification.customer_email,
          title: notification.title,
          amount: notification.amount,
          referenceNo: notification.reference_no,
          paymentUrl: buildCheckoutUrl(notification.code),
          emailSubject: notification.email_subject,
          emailMessage: notification.email_message,
          emailBrandColor: notification.email_brand_color,
          emailLogoUrl: notification.email_logo_url,
          attachment,
        },
        resendFromEmail,
      )
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(email),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        console.error("Customer payment request delivery failed", {
          status: response.status,
        })
        throw new Error("Customer payment request delivery failed.")
      }
      await pool.query(
        "UPDATE payment_request_notifications SET sent_at = NOW(), attempts = attempts + 1 WHERE id = $1",
        [notification.id],
      )
    } catch (error) {
      const delaySeconds = Math.min(3600, 30 * 2 ** notification.attempts)
      await pool.query(
        `UPDATE payment_request_notifications
         SET attempts = attempts + 1,
           next_attempt_at = NOW() + ($2 * INTERVAL '1 second')
         WHERE id = $1`,
        [notification.id, delaySeconds],
      )
      console.error("Customer payment request remains queued for retry", {
        notificationId: notification.id,
        attempt: notification.attempts + 1,
        error: error.message,
      })
    }
  }
}

async function queueCustomerPaymentRequest(paymentId) {
  const result = await pool.query(
    `WITH payment AS (
       SELECT id, customer_email FROM payment_links WHERE id = $2
     ), inserted AS (
       INSERT INTO payment_request_notifications (id, payment_id, customer_email)
       SELECT $1, id, customer_email
       FROM payment
       WHERE customer_email IS NOT NULL
       ON CONFLICT (payment_id) DO NOTHING
       RETURNING id
     )
     SELECT payment.customer_email, notification.sent_at
     FROM payment
     LEFT JOIN payment_request_notifications notification
       ON notification.payment_id = payment.id`,
    [randomUUID(), paymentId],
  )
  const payment = result.rows[0]
  if (!payment?.customer_email) return "no_customer_email"
  return payment.sent_at ? "sent" : "queued"
}

function passwordMatchesWithSalt(candidate, expectedPassword, salt) {
  const expected = scryptSync(expectedPassword, salt, 64)
  const actual = scryptSync(candidate, salt, 64)
  return timingSafeEqual(expected, actual)
}

function matchesPasswordHash(candidate, salt, expectedHash) {
  const expected = Buffer.from(expectedHash, "hex")
  const actual = scryptSync(candidate, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_accounts (
      email TEXT PRIMARY KEY,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      business_name TEXT NOT NULL DEFAULT '',
      contact_person TEXT NOT NULL DEFAULT '',
      phone_number TEXT NOT NULL DEFAULT '',
      business_address TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS merchant_usdt_wallets (
      merchant_email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE ON UPDATE CASCADE,
      address TEXT NOT NULL UNIQUE,
      network TEXT NOT NULL DEFAULT 'TRON_MAINNET' CHECK (network IN ('TRON_SHASTA', 'TRON_MAINNET')),
      assigned_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE merchant_usdt_wallets DROP CONSTRAINT IF EXISTS merchant_usdt_wallets_network_check;
    ALTER TABLE merchant_usdt_wallets ADD CONSTRAINT merchant_usdt_wallets_network_check
      CHECK (network IN ('TRON_SHASTA', 'TRON_MAINNET'));
    CREATE TABLE IF NOT EXISTS merchant_security (
      email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      pin_salt TEXT,
      pin_hash TEXT,
      credential_id TEXT UNIQUE,
      credential_public_key BYTEA,
      credential_counter BIGINT NOT NULL DEFAULT 0,
      credential_transports JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((pin_salt IS NULL) = (pin_hash IS NULL)),
      CHECK ((credential_id IS NULL) = (credential_public_key IS NULL))
    );
    UPDATE merchant_security
    SET credential_id = NULL, credential_public_key = NULL, credential_counter = 0, credential_transports = '[]'::jsonb
    WHERE credential_id IS NOT NULL OR credential_public_key IS NOT NULL;
    DROP TABLE IF EXISTS webauthn_challenges;
    ALTER TABLE merchant_accounts DROP COLUMN IF EXISTS password_salt, DROP COLUMN IF EXISTS password_hash;
    CREATE TABLE IF NOT EXISTS merchant_email_otps (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      device_token_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS merchant_email_otps_expiry_idx ON merchant_email_otps (expires_at);
    CREATE TABLE IF NOT EXISTS merchant_devices (
      email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      device_token_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (email, device_token_hash)
    );
    CREATE TABLE IF NOT EXISTS merchant_biometric_credentials (
      email TEXT NOT NULL,
      device_token_hash TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (email, device_token_hash),
      FOREIGN KEY (email, device_token_hash)
        REFERENCES merchant_devices (email, device_token_hash) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS used_step_up_tokens (
      jti TEXT PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS merchant_pin_attempts (
      id BIGSERIAL PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS merchant_pin_attempts_email_created_idx
      ON merchant_pin_attempts (merchant_email, created_at DESC);
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS internal_wallet_adjustments (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount <> 0),
      reason TEXT NOT NULL,
      adjusted_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS platform_fee_ledger (
      id UUID PRIMARY KEY,
      source_type TEXT NOT NULL CHECK (source_type IN ('COLLECTION', 'FLOATING_TRANSFER', 'DISBURSEMENT')),
      source_id UUID NOT NULL,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_type, source_id)
    );
    CREATE TABLE IF NOT EXISTS merchant_wallet_ledger (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK (source_type IN ('COLLECTION', 'DISBURSEMENT')),
      source_id UUID NOT NULL,
      amount NUMERIC(18, 2) NOT NULL,
      reference_no TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_type, source_id)
    );
    CREATE TABLE IF NOT EXISTS merchant_payout_accounts (
      merchant_email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      bank_name TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS merchant_kyb_profiles (
      merchant_email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      legal_business_name TEXT NOT NULL,
      registration_number TEXT NOT NULL,
      business_type TEXT NOT NULL,
      country TEXT NOT NULL,
      business_address TEXT NOT NULL,
      owner_full_name TEXT NOT NULL,
      owner_date_of_birth DATE NOT NULL,
      owner_nationality TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      owner_phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED')),
      review_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS merchant_kyb_documents (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      document_type TEXT NOT NULL CHECK (document_type IN ('business_registration', 'identity_front', 'identity_back', 'proof_of_address')),
      object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (merchant_email, document_type)
    );
    CREATE TABLE IF NOT EXISTS merchant_kyb_uploads (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      document_type TEXT NOT NULL CHECK (document_type IN ('business_registration', 'identity_front', 'identity_back', 'proof_of_address')),
      object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
      expires_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS merchant_kyb_uploads_expiry_idx
      ON merchant_kyb_uploads (expires_at) WHERE completed_at IS NULL;
    CREATE TABLE IF NOT EXISTS merchant_api_keys (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS merchant_webhook_settings (
      merchant_email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      endpoint_url TEXT NOT NULL,
      events TEXT[] NOT NULL,
      signing_secret TEXT NOT NULL,
      callback_url TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS merchant_webhook_deliveries (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      resource_id UUID NOT NULL,
      payload JSONB NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempt_at TIMESTAMPTZ,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (merchant_email, event_type, resource_id)
    );
    ALTER TABLE merchant_webhook_deliveries ADD COLUMN IF NOT EXISTS last_error TEXT;
    ALTER TABLE merchant_webhook_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS merchant_webhook_deliveries_pending_idx
      ON merchant_webhook_deliveries (next_attempt_at) WHERE delivered_at IS NULL;
    CREATE TABLE IF NOT EXISTS merchant_webhook_delivery_attempts (
      id UUID PRIMARY KEY,
      delivery_id UUID NOT NULL REFERENCES merchant_webhook_deliveries(id) ON DELETE CASCADE,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered BOOLEAN NOT NULL,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS merchant_webhook_delivery_attempts_delivery_idx
      ON merchant_webhook_delivery_attempts (delivery_id, attempted_at DESC);
    CREATE TABLE IF NOT EXISTS floating_transfer_requests (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      transfer_fee NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
      bank_name TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED')),
      failure_reason TEXT,
      payout_reference TEXT,
      payout_note TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT
    );
    ALTER TABLE floating_transfer_requests ADD COLUMN IF NOT EXISTS payout_reference TEXT;
    ALTER TABLE floating_transfer_requests ADD COLUMN IF NOT EXISTS payout_note TEXT;
    CREATE TABLE IF NOT EXISTS admin_audit_events (
      id UUID PRIMARY KEY,
      event_key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      actor TEXT,
      summary TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payment_links (
      id UUID PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      reference_no TEXT NOT NULL UNIQUE,
      code TEXT UNIQUE,
      title TEXT NOT NULL,
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'PHP',
      collection_amount_krw NUMERIC(18, 0),
      payment_institution_code TEXT,
      payment_institution_name TEXT,
      payment_institution_logo_url TEXT,
      payment_institution_deep_link TEXT,
      payment_url TEXT,
      checkout_type TEXT NOT NULL DEFAULT 'PAYMENT_LINK',
      payment_token TEXT,
      qr_payload TEXT,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS disbursements (
      id UUID PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      merchant_reference_no TEXT NOT NULL UNIQUE,
      swiftpay_id UUID UNIQUE,
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      transfer_fee NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
      channel TEXT NOT NULL CHECK (channel IN ('INSTAPAY', 'PESONET')),
      institution_code TEXT NOT NULL,
      recipient_name TEXT,
      recipient_account_number TEXT,
      remarks TEXT,
      request_fingerprint TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS merchant_push_devices (
      token TEXT PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS merchant_notification_preferences (
      merchant_email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      payments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      transfers_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE merchant_notification_preferences ADD COLUMN IF NOT EXISTS payments_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE merchant_notification_preferences ADD COLUMN IF NOT EXISTS transfers_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    CREATE TABLE IF NOT EXISTS merchant_checkout_preferences (
      merchant_email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      checkout_instructions TEXT NOT NULL DEFAULT E'Open your {bank} or supported banking app.\\nOpen your {bank} QR scanner and scan the code above.\\nConfirm the PHP amount before completing payment.',
      email_subject TEXT NOT NULL DEFAULT 'DRPAY: Payment request · {{reference}}',
      email_message TEXT NOT NULL DEFAULT 'A payment has been requested. Review the details below to continue.',
      email_brand_color TEXT NOT NULL DEFAULT '#153e2c',
      email_logo_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS transaction_notifications (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('PAYMENT', 'DISBURSEMENT')),
      transaction_id UUID NOT NULL,
      reference_no TEXT NOT NULL,
      amount NUMERIC(18, 2) NOT NULL,
      email_sent_at TIMESTAMPTZ,
      push_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (transaction_type, transaction_id)
    );
    ALTER TABLE transaction_notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS transaction_push_deliveries (
      notification_id UUID NOT NULL REFERENCES transaction_notifications(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (notification_id, token)
    );
    CREATE INDEX IF NOT EXISTS payment_links_created_at_idx ON payment_links (created_at DESC);
    CREATE INDEX IF NOT EXISTS disbursements_created_at_idx ON disbursements (created_at DESC);
    CREATE INDEX IF NOT EXISTS internal_wallet_adjustments_merchant_created_idx
      ON internal_wallet_adjustments (merchant_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_wallet_ledger_merchant_created_idx
      ON merchant_wallet_ledger (merchant_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS floating_transfer_requests_merchant_status_idx
      ON floating_transfer_requests (merchant_email, status, requested_at DESC);
    CREATE INDEX IF NOT EXISTS floating_transfer_requests_status_created_idx
      ON floating_transfer_requests (status, requested_at ASC);
    CREATE INDEX IF NOT EXISTS admin_audit_events_occurred_idx
      ON admin_audit_events (occurred_at DESC);
    ALTER TABLE floating_transfer_requests
      DROP CONSTRAINT IF EXISTS floating_transfer_requests_status_check;
    UPDATE floating_transfer_requests
      SET status = CASE status WHEN 'APPROVED' THEN 'SUCCESSFUL' WHEN 'REJECTED' THEN 'FAILED' ELSE status END
      WHERE status IN ('APPROVED', 'REJECTED');
    ALTER TABLE floating_transfer_requests
      ADD CONSTRAINT floating_transfer_requests_status_check
      CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED'));
    ALTER TABLE floating_transfer_requests
      ADD COLUMN IF NOT EXISTS failure_reason TEXT;
    ALTER TABLE floating_transfer_requests
      ADD COLUMN IF NOT EXISTS transfer_fee NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0);
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS checkout_type TEXT NOT NULL DEFAULT 'PAYMENT_LINK';
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS collection_amount_krw NUMERIC(18, 0);
    UPDATE payment_links
    SET collection_amount_krw = NULLIF(
      REPLACE((regexp_match(title, '·[[:space:]]*([0-9,]+)[[:space:]]*KRW[[:space:]]*@'))[1], ',', ''),
      ''
    )::numeric
    WHERE collection_amount_krw IS NULL
      AND title ~ '·[[:space:]]*[0-9,]+[[:space:]]*KRW[[:space:]]*@';
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS payment_token TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS qr_payload TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS payment_institution_code TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS payment_institution_name TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS payment_institution_logo_url TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS payment_institution_deep_link TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS merchant_email TEXT REFERENCES merchant_accounts(email) ON DELETE CASCADE;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS customer_email TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS checkout_instructions TEXT NOT NULL DEFAULT E'Open your {bank} or supported banking app.\\nOpen your {bank} QR scanner and scan the code above.\\nConfirm the PHP amount before completing payment.';
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS email_subject TEXT NOT NULL DEFAULT 'DRPAY: Payment request · {{reference}}';
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS email_message TEXT NOT NULL DEFAULT 'A payment has been requested. Review the details below to continue.';
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS email_brand_color TEXT NOT NULL DEFAULT '#153e2c';
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS email_logo_url TEXT NOT NULL DEFAULT '';
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS manually_paid_by TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS manually_paid_at TIMESTAMPTZ;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS manual_paid_reason TEXT;
    CREATE TABLE IF NOT EXISTS customer_payment_notifications (
      id UUID PRIMARY KEY,
      payment_id UUID NOT NULL UNIQUE REFERENCES payment_links(id) ON DELETE CASCADE,
      customer_email TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS customer_payment_notifications_pending_idx
      ON customer_payment_notifications (next_attempt_at)
      WHERE sent_at IS NULL AND attempts < 8;
    CREATE TABLE IF NOT EXISTS payment_request_notifications (
      id UUID PRIMARY KEY,
      payment_id UUID NOT NULL UNIQUE REFERENCES payment_links(id) ON DELETE CASCADE,
      customer_email TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_tax_invoice_uploads (
      id UUID PRIMARY KEY,
      admin_email TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
      size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
      expires_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (admin_email, idempotency_key)
    );
    CREATE SEQUENCE IF NOT EXISTS admin_tax_invoice_reference_seq
      START WITH 100000 MINVALUE 100000 MAXVALUE 999999 NO CYCLE;
    CREATE INDEX IF NOT EXISTS admin_tax_invoice_uploads_expiry_idx
      ON admin_tax_invoice_uploads (expires_at);
    CREATE TABLE IF NOT EXISTS admin_tax_invoice_attachments (
      payment_id UUID PRIMARY KEY REFERENCES payment_links(id) ON DELETE CASCADE,
      upload_id UUID NOT NULL UNIQUE REFERENCES admin_tax_invoice_uploads(id),
      object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payment_request_notifications_pending_idx
      ON payment_request_notifications (next_attempt_at)
      WHERE sent_at IS NULL AND attempts < 8;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS recipient_name TEXT;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS recipient_account_number TEXT;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS remarks TEXT;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS merchant_email TEXT REFERENCES merchant_accounts(email) ON DELETE CASCADE;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS refund_payment_id UUID REFERENCES payment_links(id);
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS refund_ledger_reversed_at TIMESTAMPTZ;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS transfer_fee NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0);
    ALTER TABLE platform_fee_ledger DROP CONSTRAINT IF EXISTS platform_fee_ledger_source_type_check;
    ALTER TABLE platform_fee_ledger ADD CONSTRAINT platform_fee_ledger_source_type_check
      CHECK (source_type IN ('COLLECTION', 'FLOATING_TRANSFER', 'DISBURSEMENT'));
    CREATE INDEX IF NOT EXISTS disbursements_refund_payment_created_idx
      ON disbursements (refund_payment_id, created_at DESC)
      WHERE refund_payment_id IS NOT NULL;
    ALTER TABLE merchant_accounts ADD COLUMN IF NOT EXISTS business_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE merchant_accounts ADD COLUMN IF NOT EXISTS contact_person TEXT NOT NULL DEFAULT '';
    ALTER TABLE merchant_accounts ADD COLUMN IF NOT EXISTS phone_number TEXT NOT NULL DEFAULT '';
    ALTER TABLE merchant_accounts ADD COLUMN IF NOT EXISTS business_address TEXT NOT NULL DEFAULT '';
    DO $migration$
    DECLARE
      foreign_key RECORD;
      definition TEXT;
    BEGIN
      FOR foreign_key IN
        SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE contype = 'f'
          AND confrelid IN ('merchant_accounts'::regclass, 'merchant_devices'::regclass)
      LOOP
        definition := foreign_key.definition;
        IF position('ON UPDATE' IN definition) = 0 THEN
          IF position('ON DELETE' IN definition) > 0 THEN
            definition := replace(definition, ' ON DELETE', ' ON UPDATE CASCADE ON DELETE');
          ELSE
            definition := definition || ' ON UPDATE CASCADE';
          END IF;
          EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', foreign_key.table_name, foreign_key.conname);
          EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', foreign_key.table_name, foreign_key.conname, definition);
        END IF;
      END LOOP;
    END
    $migration$;
    CREATE INDEX IF NOT EXISTS merchant_push_devices_email_idx ON merchant_push_devices (merchant_email);
    CREATE INDEX IF NOT EXISTS transaction_notifications_pending_idx
      ON transaction_notifications (created_at) WHERE email_sent_at IS NULL OR push_sent_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS disbursements_active_fingerprint_idx
      ON disbursements (request_fingerprint)
      WHERE status IN ('REQUESTING', 'PENDING', 'OUTCOME_UNKNOWN');
  `)
  await pool.query(`
    INSERT INTO admin_audit_events
      (id, event_key, category, action, target, actor, summary, occurred_at)
    SELECT id, 'wallet-adjustment:' || id::text, 'Floating balance',
      CASE WHEN amount < 0 THEN 'Balance debited' ELSE 'Balance credited' END,
      merchant_email, adjusted_by,
      'PHP ' || TO_CHAR(amount, 'FM999999999999990.00') || ' · ' || reason,
      created_at
    FROM internal_wallet_adjustments
    WHERE adjusted_by NOT LIKE 'system:%'
    ON CONFLICT (event_key) DO NOTHING
  `)
  await pool.query(`
    INSERT INTO admin_audit_events
      (id, event_key, category, action, target, actor, summary, occurred_at)
    SELECT id, 'transfer-review:' || id::text, 'Transfer request',
      'Request marked ' || LOWER(status), merchant_email, reviewed_by,
      'PHP ' || TO_CHAR(amount, 'FM999999999999990.00') ||
        CASE WHEN failure_reason IS NOT NULL THEN ' · ' || failure_reason ELSE '' END,
      reviewed_at
    FROM floating_transfer_requests
    WHERE reviewed_at IS NOT NULL
    ON CONFLICT (event_key) DO NOTHING
  `)
  await pool.query(`
    INSERT INTO admin_audit_events
      (id, event_key, category, action, target, actor, summary, occurred_at)
    SELECT md5('kyb-review:' || merchant_email || ':' || reviewed_at::text)::uuid,
      'kyb-review:' || merchant_email || ':' || reviewed_at::text,
      'KYB review', 'Application marked ' || LOWER(REPLACE(status, '_', ' ')),
      merchant_email, reviewed_by, 'KYB application review recorded', reviewed_at
    FROM merchant_kyb_profiles
    WHERE reviewed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM admin_audit_events existing
        WHERE existing.category = 'KYB review'
          AND existing.target = merchant_kyb_profiles.merchant_email
          AND existing.occurred_at = merchant_kyb_profiles.reviewed_at
      )
    ON CONFLICT (event_key) DO NOTHING
  `)
  if (authEmail) {
    await pool.query(
      `INSERT INTO merchant_accounts (email)
       SELECT $1
       WHERE NOT EXISTS (SELECT 1 FROM merchant_accounts)
       ON CONFLICT (email) DO NOTHING`,
      [authEmail],
    )
  }
  await pool.query(
    `UPDATE payment_links
     SET payment_url = $1 || '/checkout/' || code
     WHERE payment_token IS NOT NULL
       AND payment_url IS DISTINCT FROM $1 || '/checkout/' || code`,
    [checkoutOrigin.replace(/\/$/, "")],
  )
  await pool.query(`
    INSERT INTO merchant_wallet_ledger (id, merchant_email, source_type, source_id, amount, reference_no, created_at)
    SELECT gen_random_uuid(), p.merchant_email, 'COLLECTION', p.id,
      GREATEST(p.amount - COALESCE(f.amount, 0), 0), p.reference_no, p.created_at
    FROM payment_links p
    LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
    WHERE p.status IN ('EXECUTED', 'MANUALLY_PAID') AND p.merchant_email IS NOT NULL
    ON CONFLICT (source_type, source_id) DO NOTHING
  `)
  await pool.query(`
    INSERT INTO merchant_wallet_ledger (id, merchant_email, source_type, source_id, amount, reference_no, created_at)
    SELECT gen_random_uuid(), d.merchant_email, 'DISBURSEMENT', d.id,
      CASE WHEN d.refund_payment_id IS NOT NULL
        THEN -GREATEST(COALESCE(p.amount, d.amount) - COALESCE(f.amount, 0), 0)
        ELSE -d.amount
      END,
      d.merchant_reference_no, d.created_at
    FROM disbursements d
    LEFT JOIN payment_links p ON p.id = d.refund_payment_id
    LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
    WHERE d.status IN ('EXECUTED', 'SUCCESS', 'COMPLETED') AND d.merchant_email IS NOT NULL
    ON CONFLICT (source_type, source_id) DO NOTHING
  `)
  if (process.env.DRPAY_KRW_TO_PHP_RATE !== undefined) {
    const configuredRate = Number(process.env.DRPAY_KRW_TO_PHP_RATE)
    if (Number.isFinite(configuredRate) && configuredRate > 0) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ('krw_to_php_rate', $1)
         ON CONFLICT (setting_key) DO NOTHING`,
        [String(configuredRate)],
      )
    }
  }
}

async function swiftPayFetch(
  path,
  { method = "GET", body, headers = {}, timeoutMs = 12_000 } = {},
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${swiftPayBaseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    if (!response.ok) {
      const error = new Error(`SwiftPay request failed (${response.status})`)
      error.status = response.status
      error.providerMessage = providerErrorMessage(data)
      throw error
    }
    return { data, status: response.status }
  } finally {
    clearTimeout(timeout)
  }
}

function providerErrorMessage(data) {
  const candidates = [
    data?.message,
    data?.error,
    data?.detail,
    data?.description,
    data?.errors?.[0]?.message,
    data?.errors?.[0],
  ]
  const value = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  )
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, 300)
    : null
}

async function swiftPayRequest(path, options = {}) {
  const authorization = Buffer.from(
    `${swiftPayAccessKey}:${swiftPaySecretKey}`,
  ).toString("base64")
  return swiftPayFetch(path, {
    ...options,
    headers: { Authorization: `Basic ${authorization}`, ...options.headers },
  })
}

async function swiftPayPaymentRequest(path, paymentToken) {
  return swiftPayFetch(path, {
    headers: { "X-Swiftpay-Payment-Token": paymentToken },
  })
}

async function swiftPaySignedRequest(path, payload) {
  const canonicalPayload = Object.entries(payload)
    .filter(
      ([key, value]) =>
        key.startsWith("x_") && value !== null && value !== undefined,
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}${value}`)
    .join("")
  const signature = createHmac("sha256", swiftPaySecretKey)
    .update(canonicalPayload, "utf8")
    .digest("hex")
  return swiftPayFetch(path, {
    method: "POST",
    body: { ...payload, signature },
  })
}

function validPaymentStatus(value) {
  return ["PENDING", "EXECUTED", "CANCELED", "REJECTED", "EXPIRED"].includes(
    value,
  )
}

function paymentStatusFromResponse(data) {
  const status =
    typeof data === "string" ? data : data?.status || data?.paymentStatus
  if (!validPaymentStatus(status))
    throw new Error("SwiftPay returned an invalid payment status.")
  return status
}

async function requireMerchant(req, res, next) {
  const match = /^Bearer (.+)$/.exec(req.get("authorization") || "")
  if (!match || !jwtSecret)
    return res.status(401).json({ error: "Sign in is required." })
  if (match[1].startsWith("drp_")) {
    if (!match[1].startsWith(`drp_${swiftPayEnvironment}_`)) {
      return res.status(401).json({
        error:
          "The API key is invalid or belongs to another payment environment.",
      })
    }
    const keyHash = createHash("sha256").update(match[1]).digest("hex")
    const result = await pool.query(
      `SELECT k.id, k.merchant_email, k.scopes, a.active
       FROM merchant_api_keys k JOIN merchant_accounts a ON a.email = k.merchant_email
       WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
      [keyHash],
    )
    const apiKey = result.rows[0]
    if (!apiKey?.active)
      return res
        .status(401)
        .json({ error: "The API key is invalid or revoked." })
    if (req.method === "GET" && !apiKey.scopes.includes("read")) {
      return res
        .status(403)
        .json({ error: "This API key does not have read permission." })
    }
    if (!hasApiKeyPermission(req.method, req.path, apiKey.scopes)) {
      return res.status(403).json({
        error: "This API key does not have permission for this operation.",
      })
    }
    req.merchantEmail = apiKey.merchant_email
    req.apiKey = true
    req.apiKeyId = apiKey.id
    await pool.query(
      "UPDATE merchant_api_keys SET last_used_at = NOW() WHERE id = $1",
      [apiKey.id],
    )
    return merchantApiLimiter(req, res, next)
  }
  let payload
  try {
    ;({ payload } = await jwtVerify(match[1], jwtSecret, {
      algorithms: ["HS256"],
    }))
  } catch {
    return res
      .status(401)
      .json({ error: "Your session has expired. Sign in again." })
  }
  if (!isMerchantSession(payload)) {
    return res
      .status(401)
      .json({ error: "Your session has expired. Sign in again." })
  }
  const account = await pool.query(
    "SELECT active FROM merchant_accounts WHERE email = $1",
    [payload.sub],
  )
  if (!account.rows[0]?.active)
    return res.status(401).json({ error: "This merchant account is disabled." })
  req.merchantEmail = payload.sub
  return next()
}

const blockedIpv6Subnets = new BlockList()
for (const [subnet, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
])
  blockedIpv6Subnets.addSubnet(subnet, prefix, "ipv6")

function isPublicAddress(address) {
  if (isIP(address) === 6) {
    const globalUnicast = /^[23]/.test(address)
    return globalUnicast && !blockedIpv6Subnets.check(address, "ipv6")
  }
  if (isIP(address) !== 4) return false
  const [a, b] = address.split(".").map(Number)
  const c = Number(address.split(".")[2])
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  )
}

async function validateWebhookUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false
  let url
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    return false
  const hostname = url.hostname.toLowerCase()
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isIP(hostname)
  )
    return false
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => isPublicAddress(address))
    )
  } catch {
    return false
  }
}

function sendWebhookRequest(url, payload, signature) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    void lookup(parsed.hostname, { all: true, verbatim: true })
      .then((addresses) => {
        if (
          !addresses.length ||
          addresses.some(({ address }) => !isPublicAddress(address))
        ) {
          throw new Error(
            "Webhook destination resolved to a non-public address.",
          )
        }
        const address = addresses[0].address
        const body = JSON.stringify(payload)
        const request = https.request(
          {
            hostname: parsed.hostname,
            port: 443,
            path: `${parsed.pathname}${parsed.search}`,
            method: "POST",
            servername: parsed.hostname,
            lookup: (_hostname, _options, callback) =>
              callback(null, address, isIP(address)),
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
              "DRPAY-Signature": `sha256=${signature}`,
              "DRPAY-Event": payload.type,
            },
            timeout: 8000,
          },
          (response) => {
            response.resume()
            response.on("end", () => {
              if (
                response.statusCode &&
                response.statusCode >= 200 &&
                response.statusCode < 300
              )
                resolve()
              else
                reject(
                  new Error(
                    `Webhook endpoint returned HTTP ${response.statusCode || "unknown"}.`,
                  ),
                )
            })
          },
        )
        request.on("timeout", () =>
          request.destroy(new Error("Webhook request timed out.")),
        )
        request.on("error", reject)
        request.end(body)
      })
      .catch(reject)
  })
}

async function queueTransactionWebhook(transactionType, transactionId) {
  const query =
    transactionType === "PAYMENT"
      ? `SELECT merchant_email, id, reference_no, amount, currency, status FROM payment_links WHERE id = $1`
      : `SELECT merchant_email, id, merchant_reference_no AS reference_no, amount, 'PHP' AS currency, status FROM disbursements WHERE id = $1`
  const result = await pool.query(query, [transactionId])
  const transaction = result.rows[0]
  if (!transaction?.merchant_email) return
  const status = String(transaction.status).toUpperCase()
  const succeeded =
    transactionType === "PAYMENT"
      ? ["EXECUTED", "MANUALLY_PAID"].includes(status)
      : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(status)
  const failed = [
    "FAILED",
    "REJECTED",
    "ERROR",
    "CANCELED",
    "CANCELLED",
    "EXPIRED",
  ].includes(status)
  if (!succeeded && !failed) return
  const eventType = `${
    transactionType === "PAYMENT" ? "payment" : "disbursement"
  }.${succeeded ? "succeeded" : "failed"}`
  const configured = await pool.query(
    `SELECT 1 FROM merchant_webhook_settings
     WHERE merchant_email = $1 AND enabled = TRUE AND $2 = ANY(events)
       AND (endpoint_url <> '' OR callback_url IS NOT NULL)`,
    [transaction.merchant_email, eventType],
  )
  if (!configured.rowCount) return
  const payload = {
    id: randomUUID(),
    type: eventType,
    createdAt: new Date().toISOString(),
    data: {
      id: transaction.id,
      reference: transaction.reference_no,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      status,
    },
  }
  await pool.query(
    `INSERT INTO merchant_webhook_deliveries (id, merchant_email, event_type, resource_id, payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (merchant_email, event_type, resource_id) DO NOTHING`,
    [
      payload.id,
      transaction.merchant_email,
      eventType,
      transactionId,
      JSON.stringify(payload),
    ],
  )
}

async function dispatchMerchantWebhooks() {
  const deliveries = await pool.query(
    `SELECT d.id, d.merchant_email, d.event_type, d.payload, d.attempts,
       s.endpoint_url, s.callback_url, s.signing_secret, s.events
     FROM merchant_webhook_deliveries d
     JOIN merchant_webhook_settings s ON s.merchant_email = d.merchant_email AND s.enabled = TRUE
     WHERE d.delivered_at IS NULL AND d.next_attempt_at <= NOW()
       AND d.attempts < 8 AND d.event_type = ANY(s.events)
     ORDER BY d.created_at ASC LIMIT 25`,
  )
  for (const delivery of deliveries.rows) {
    const body = JSON.stringify(delivery.payload)
    const signature = createHmac("sha256", delivery.signing_secret)
      .update(body)
      .digest("hex")
    const urls = [
      ...new Set(
        [delivery.endpoint_url, delivery.callback_url].filter(Boolean),
      ),
    ]
    const failures = []
    for (const url of urls) {
      try {
        if (!(await validateWebhookUrl(url)))
          throw new Error(
            "Webhook destination is not an allowed public HTTPS URL.",
          )
        await sendWebhookRequest(url, delivery.payload, signature)
      } catch (error) {
        failures.push(error.message)
        console.error(
          "Merchant webhook delivery failed",
          delivery.id,
          error.message,
        )
      }
    }
    await pool.query(
      `INSERT INTO merchant_webhook_delivery_attempts
         (id, delivery_id, delivered, error)
       VALUES ($1, $2, $3, $4)`,
      [
        randomUUID(),
        delivery.id,
        failures.length === 0,
        failures.length ? failures.join(" ").slice(0, 500) : null,
      ],
    )
    if (!failures.length) {
      await pool.query(
        "UPDATE merchant_webhook_deliveries SET delivered_at = NOW(), last_attempt_at = NOW(), attempts = attempts + 1, last_error = NULL WHERE id = $1",
        [delivery.id],
      )
    } else {
      const delaySeconds = Math.min(3600, 30 * 2 ** delivery.attempts)
      await pool.query(
        `UPDATE merchant_webhook_deliveries
         SET attempts = attempts + 1, last_error = $3,
           last_attempt_at = NOW(), next_attempt_at = NOW() + ($2 * INTERVAL '1 second')
         WHERE id = $1`,
        [delivery.id, delaySeconds, failures.join(" ").slice(0, 500)],
      )
    }
  }
}

async function cleanExpiredKybUploads() {
  if (!r2Client || !r2BucketName) return
  const expired = await pool.query(
    `SELECT id, object_key FROM merchant_kyb_uploads
     WHERE expires_at <= NOW() AND completed_at IS NULL
     ORDER BY expires_at ASC LIMIT 100`,
  )
  for (const upload of expired.rows) {
    try {
      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: r2BucketName,
          Key: upload.object_key,
        }),
      )
      await pool.query(
        "DELETE FROM merchant_kyb_uploads WHERE id = $1 AND completed_at IS NULL",
        [upload.id],
      )
    } catch (error) {
      console.error(
        "Could not clean up an expired private KYB upload",
        upload.id,
        error.name || "storage error",
      )
    }
  }
}

async function cleanExpiredTaxInvoiceUploads() {
  if (!r2Client || !r2BucketName) return
  const expired = await pool.query(
    `SELECT upload.id, upload.object_key FROM admin_tax_invoice_uploads upload
     WHERE upload.expires_at <= NOW()
       AND NOT EXISTS (
         SELECT 1 FROM admin_tax_invoice_attachments attachment
         WHERE attachment.upload_id = upload.id
       )
     ORDER BY upload.expires_at ASC LIMIT 100`,
  )
  for (const upload of expired.rows) {
    try {
      await r2Client.send(
        new DeleteObjectCommand({ Bucket: r2BucketName, Key: upload.object_key }),
      )
      await pool.query(
        `DELETE FROM admin_tax_invoice_uploads WHERE id = $1
         AND expires_at <= NOW()
         AND NOT EXISTS (
           SELECT 1 FROM admin_tax_invoice_attachments WHERE upload_id = $1
         )`,
        [upload.id],
      )
    } catch (error) {
      console.error(
        "Could not clean up an expired tax invoice attachment",
        upload.id,
        error.name || "storage error",
      )
    }
  }
}

async function requireSuperAdmin(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "")
  if (!match || !jwtSecret)
    return res.status(401).json({ error: "Restricted sign-in is required." })
  try {
    const { payload } = await jwtVerify(match[1], jwtSecret, {
      algorithms: ["HS256"],
    })
    if (!isOperationsSession(payload, superAdminEmail))
      throw new Error("Invalid session")
    req.adminEmail = payload.sub
    return next()
  } catch {
    return res
      .status(401)
      .json({ error: "Your session has expired. Sign in again." })
  }
}

app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1")
    return res.json({ status: "ok", paymentEnvironment: swiftPayEnvironment })
  } catch {
    return res.status(503).json({ status: "unavailable" })
  }
})

app.post("/v1/auth/login", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  const password =
    typeof req.body?.password === "string" ? req.body.password : ""
  if (password.length < 1 || password.length > 256) {
    return res.status(401).json({ error: "Email or password is incorrect." })
  }
  if (
    email !== superAdminEmail ||
    !superAdminPassword ||
    !passwordSalt ||
    !passwordMatchesWithSalt(password, superAdminPassword, passwordSalt)
  ) {
    return res.status(401).json({ error: "Email or password is incorrect." })
  }
  const expiresInSeconds = 60 * 60
  const accessToken = await new SignJWT({ role: "super_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(jwtSecret)
  return res
    .set("Cache-Control", "no-store")
    .json({ accessToken, expiresInSeconds, email, role: "super_admin" })
})

app.post("/v1/auth/device/otp/request", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  const deviceToken =
    typeof req.body?.deviceToken === "string" ? req.body.deviceToken : ""
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(deviceToken)
  ) {
    return res.status(400).json({
      error: "Enter a valid merchant email to request a verification code.",
    })
  }
  const account = await pool.query(
    "SELECT email FROM merchant_accounts WHERE email = $1 AND active = TRUE",
    [email],
  )
  let challengeId = randomUUID()
  if (account.rowCount) {
    const tokenHash = deviceTokenHash(deviceToken)
    const recentChallenge = await pool.query(
      `SELECT id FROM merchant_email_otps
       WHERE email = $1 AND device_token_hash = $2 AND consumed_at IS NULL
         AND attempts < 5 AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [email, tokenHash],
    )
    if (recentChallenge.rowCount) {
      challengeId = recentChallenge.rows[0].id
      return res.set("Cache-Control", "no-store").json({
        challengeId,
        message:
          "If this email belongs to an active merchant account, a verification code has been sent.",
      })
    }
    const recentRequests = await pool.query(
      "SELECT COUNT(*)::int AS count FROM merchant_email_otps WHERE email = $1 AND created_at > NOW() - INTERVAL '15 minutes'",
      [email],
    )
    if (recentRequests.rows[0].count >= 5) {
      return res.set("Cache-Control", "no-store").json({
        challengeId,
        message:
          "If this email belongs to an active merchant account, a verification code has been sent.",
      })
    }
    const code = String(randomInt(100_000, 1_000_000))
    const codeHash = createHmac("sha256", jwtSecretValue)
      .update(`${challengeId}:${email}:${code}`)
      .digest("hex")
    await pool.query(
      "DELETE FROM merchant_email_otps WHERE expires_at <= NOW() OR consumed_at IS NOT NULL",
    )
    await pool.query(
      "UPDATE merchant_email_otps SET consumed_at = NOW() WHERE email = $1 AND consumed_at IS NULL",
      [email],
    )
    await pool.query(
      `INSERT INTO merchant_email_otps (id, email, device_token_hash, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [challengeId, email, tokenHash, codeHash],
    )
    try {
      await sendMerchantOtp(email, code)
    } catch {
      await pool.query("DELETE FROM merchant_email_otps WHERE id = $1", [
        challengeId,
      ])
      return res.status(503).json({
        error: "Verification email could not be sent. Try again later.",
      })
    }
  }
  return res.set("Cache-Control", "no-store").json({
    challengeId,
    message:
      "If this email belongs to an active merchant account, a verification code has been sent.",
  })
})

app.post("/v1/auth/device/otp/verify", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : ""
  const challengeId =
    typeof req.body?.challengeId === "string" ? req.body.challengeId : ""
  const deviceToken =
    typeof req.body?.deviceToken === "string" ? req.body.deviceToken : ""
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^\d{6}$/.test(code) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(deviceToken) ||
    !/^[0-9a-f-]{36}$/i.test(challengeId)
  ) {
    return res
      .status(400)
      .json({ error: "Enter the six-digit email code to verify this device." })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const challenge = await client.query(
      `SELECT o.code_hash FROM merchant_email_otps o
       JOIN merchant_accounts a ON a.email = o.email AND a.active = TRUE
       WHERE o.id = $1 AND o.email = $2 AND o.device_token_hash = $3
         AND o.consumed_at IS NULL AND o.expires_at > NOW() AND o.attempts < 5
       FOR UPDATE`,
      [challengeId, email, deviceTokenHash(deviceToken)],
    )
    const record = challenge.rows[0]
    if (!record) {
      await client.query("ROLLBACK")
      return res
        .status(401)
        .json({ error: "That code is invalid or expired. Request a new code." })
    }
    await client.query(
      "UPDATE merchant_email_otps SET attempts = attempts + 1 WHERE id = $1",
      [challengeId],
    )
    const expectedHash = createHmac("sha256", jwtSecretValue)
      .update(`${challengeId}:${email}:${code}`)
      .digest()
    const actualHash = Buffer.from(record.code_hash, "hex")
    if (
      actualHash.length !== expectedHash.length ||
      !timingSafeEqual(actualHash, expectedHash)
    ) {
      await client.query("COMMIT")
      return res.status(401).json({
        error: "That code is incorrect. Check the email and try again.",
      })
    }
    const consumed = await client.query(
      `UPDATE merchant_email_otps SET consumed_at = NOW()
       WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [challengeId],
    )
    if (!consumed.rowCount) {
      await client.query("ROLLBACK")
      return res
        .status(401)
        .json({ error: "That code has already been used. Request a new code." })
    }
    await client.query(
      `INSERT INTO merchant_devices (email, device_token_hash)
       VALUES ($1, $2) ON CONFLICT (email, device_token_hash) DO UPDATE SET last_used_at = NOW()`,
      [email, deviceTokenHash(deviceToken)],
    )
    await client.query("COMMIT")
    return res
      .set("Cache-Control", "no-store")
      .json(await issueMerchantSession(email))
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.post("/v1/auth/device/pin", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  const pin = typeof req.body?.pin === "string" ? req.body.pin : ""
  const deviceToken =
    typeof req.body?.deviceToken === "string" ? req.body.deviceToken : ""
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^\d{4}$/.test(pin) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(deviceToken)
  ) {
    return res.status(401).json({
      error:
        "Check your email and four-digit MPIN, or verify this device by email.",
    })
  }
  const { rows } = await pool.query(
    `SELECT s.pin_salt, s.pin_hash FROM merchant_accounts a
     JOIN merchant_devices d ON d.email = a.email
     JOIN merchant_security s ON s.email = a.email
     WHERE a.email = $1 AND a.active = TRUE AND d.device_token_hash = $2`,
    [email, deviceTokenHash(deviceToken)],
  )
  const security = rows[0]
  if (!security?.pin_hash) return res.status(403).json({
      error: "Verify this device by email and set up an MPIN to continue.",
    })
  await pool.query(
    "DELETE FROM merchant_pin_attempts WHERE created_at <= NOW() - INTERVAL '1 day'",
  )
  const attempts = await pool.query(
    "SELECT COUNT(*)::int AS count FROM merchant_pin_attempts WHERE merchant_email = $1 AND created_at > NOW() - INTERVAL '15 minutes'",
    [email],
  )
  if (attempts.rows[0].count >= 5) return res.status(429).json({
      error: "Too many incorrect MPIN attempts. Try again in 15 minutes.",
    })
  if (!matchesPasswordHash(pin, security.pin_salt, security.pin_hash)) {
    await pool.query(
      "INSERT INTO merchant_pin_attempts (merchant_email) VALUES ($1)",
      [email],
    )
    return res.status(401).json({ error: "The MPIN is incorrect." })
  }
  await pool.query(
    "DELETE FROM merchant_pin_attempts WHERE merchant_email = $1",
    [email],
  )
  await pool.query(
    "UPDATE merchant_devices SET last_used_at = NOW() WHERE email = $1 AND device_token_hash = $2",
    [email, deviceTokenHash(deviceToken)],
  )
  return res
    .set("Cache-Control", "no-store")
    .json(await issueMerchantSession(email))
})

app.post("/v1/auth/device/biometric", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  const secret = typeof req.body?.secret === "string" ? req.body.secret : ""
  const deviceToken =
    typeof req.body?.deviceToken === "string" ? req.body.deviceToken : ""
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^[A-Za-z0-9_-]{43}$/.test(secret) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(deviceToken)
  ) {
    return res.status(401).json({
      error:
        "Biometric sign-in is unavailable. Use your MPIN or verify this device by email.",
    })
  }
  const { rows } = await pool.query(
    `SELECT credential.secret_hash FROM merchant_accounts account
     JOIN merchant_devices device ON device.email = account.email
     JOIN merchant_biometric_credentials credential
       ON credential.email = device.email AND credential.device_token_hash = device.device_token_hash
     WHERE account.email = $1 AND account.active = TRUE AND device.device_token_hash = $2`,
    [email, deviceTokenHash(deviceToken)],
  )
  const expectedHash = rows[0]?.secret_hash
  const actualHash = Buffer.from(biometricSecretHash(secret), "hex")
  const storedHash =
    typeof expectedHash === "string"
      ? Buffer.from(expectedHash, "hex")
      : Buffer.alloc(0)
  if (
    storedHash.length !== actualHash.length ||
    !timingSafeEqual(storedHash, actualHash)
  ) {
    return res.status(401).json({
      error:
        "Biometric sign-in is unavailable. Use your MPIN or verify this device by email.",
    })
  }
  await pool.query(
    `UPDATE merchant_biometric_credentials SET last_used_at = NOW()
     WHERE email = $1 AND device_token_hash = $2`,
    [email, deviceTokenHash(deviceToken)],
  )
  await pool.query(
    "UPDATE merchant_devices SET last_used_at = NOW() WHERE email = $1 AND device_token_hash = $2",
    [email, deviceTokenHash(deviceToken)],
  )
  return res
    .set("Cache-Control", "no-store")
    .json(await issueMerchantSession(email))
})

app.use("/v1/admin", requireSuperAdmin)

async function recordAdminAuditEvent(
  client,
  { eventKey, category, action, target, actor, summary },
) {
  await client.query(
    `INSERT INTO admin_audit_events
       (id, event_key, category, action, target, actor, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_key) DO NOTHING`,
    [randomUUID(), eventKey, category, action, target, actor || null, summary],
  )
}

app.get("/v1/admin/audit", async (_req, res) => {
  const result = await pool.query(
    `SELECT id, category, action, target, actor, summary,
       occurred_at AS "occurredAt"
     FROM admin_audit_events
     ORDER BY occurred_at DESC
     LIMIT 500`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.get("/v1/admin/payment-links", async (_req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.merchant_email AS "merchantEmail",
       p.customer_email AS "customerEmail", p.reference_no AS "referenceNo",
       p.title, p.amount::float8 AS amount, p.currency, p.status,
       p.created_at AS "createdAt", p.manually_paid_by AS "manuallyPaidBy",
       p.manually_paid_at AS "manuallyPaidAt",
       p.manual_paid_reason AS "manualPaidReason",
       CASE WHEN p.customer_email IS NULL THEN 'no_customer_email'
            WHEN n.sent_at IS NOT NULL THEN 'sent'
            WHEN n.attempts > 0 THEN 'queued_for_retry'
            WHEN n.id IS NOT NULL THEN 'queued'
            ELSE NULL END AS "customerNotification"
     FROM payment_links p
     LEFT JOIN customer_payment_notifications n ON n.payment_id = p.id
     ORDER BY p.created_at DESC
     LIMIT 500`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post("/v1/admin/tax-invoice-attachments/presign", async (req, res) => {
  if (!r2Client || !r2BucketName) {
    return res.status(503).json({
      error: "Private document storage is not configured on this server.",
    })
  }
  const submittedFileName =
    typeof req.body?.fileName === "string" ? req.body.fileName.trim() : ""
  const contentType = req.body?.contentType
  const sizeBytes = Number(req.body?.sizeBytes)
  const fileName = submittedFileName
    .replace(/[^\w .()-]/g, "_")
    .slice(0, 180)
  if (
    !submittedFileName ||
    submittedFileName.length > 180 ||
    /[/\\\u0000-\u001f]/.test(submittedFileName) ||
    !fileName ||
    !allowedTaxInvoiceAttachmentTypes.has(contentType) ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > taxInvoiceAttachmentMaxBytes
  ) {
    return res.status(400).json({
      error: "Attach a PDF, JPEG, or PNG file no larger than 10 MB.",
    })
  }
  const idempotencyKey = req.get("Idempotency-Key")
  if (!validIdempotencyKey(idempotencyKey)) {
    return res
      .status(400)
      .json({ error: "A valid Idempotency-Key header is required." })
  }
  const existingUpload = await pool.query(
    `SELECT upload.id, upload.object_key, upload.file_name, upload.content_type,
       upload.size_bytes, upload.completed_at, upload.expires_at,
       attachment.payment_id
     FROM admin_tax_invoice_uploads upload
     LEFT JOIN admin_tax_invoice_attachments attachment
       ON attachment.upload_id = upload.id
     WHERE upload.admin_email = $1 AND upload.idempotency_key = $2`,
    [req.adminEmail, idempotencyKey],
  )
  if (existingUpload.rowCount) {
    const upload = existingUpload.rows[0]
    if (
      upload.file_name !== fileName ||
      upload.content_type !== contentType ||
      Number(upload.size_bytes) !== sizeBytes ||
      (new Date(upload.expires_at).getTime() <= Date.now() &&
        !upload.payment_id)
    ) {
      return res.status(409).json({
        error:
          "This invoice retry must use the original attachment. Start a new invoice to replace it.",
      })
    }
    if (upload.completed_at) {
      return res.set("Cache-Control", "no-store").json({
        uploadId: upload.id,
        fileName: upload.file_name,
        completed: true,
      })
    }
    try {
      const uploadUrl = await getSignedUrl(
        r2Client,
        new PutObjectCommand({
          Bucket: r2BucketName,
          Key: upload.object_key,
          ContentType: contentType,
          ContentLength: sizeBytes,
          Metadata: { "tax-invoice-upload-id": upload.id },
        }),
        { expiresIn: 600 },
      )
      return res.set("Cache-Control", "no-store").json({
        uploadId: upload.id,
        uploadUrl,
        objectKey: upload.object_key,
        fileName: upload.file_name,
        headers: { "Content-Type": contentType },
        completed: false,
      })
    } catch (error) {
      console.error(
        "Could not renew private tax invoice attachment upload",
        error.name || "storage error",
      )
      return res
        .status(503)
        .json({ error: "Private document upload is temporarily unavailable." })
    }
  }
  const uploadId = randomUUID()
  const objectKey = `tax-invoices/${uploadId}`
  await pool.query(
    `INSERT INTO admin_tax_invoice_uploads
       (id, admin_email, idempotency_key, object_key, file_name, content_type, size_bytes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '10 minutes')`,
    [
      uploadId,
      req.adminEmail,
      idempotencyKey,
      objectKey,
      fileName,
      contentType,
      sizeBytes,
    ],
  )
  try {
    const uploadUrl = await getSignedUrl(
      r2Client,
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: sizeBytes,
        Metadata: { "tax-invoice-upload-id": uploadId },
      }),
      { expiresIn: 600 },
    )
    return res.set("Cache-Control", "no-store").json({
      uploadId,
      uploadUrl,
      objectKey,
      fileName,
      headers: { "Content-Type": contentType },
      completed: false,
    })
  } catch (error) {
    await pool.query("DELETE FROM admin_tax_invoice_uploads WHERE id = $1", [
      uploadId,
    ])
    console.error(
      "Could not create private tax invoice attachment upload",
      error.name || "storage error",
    )
    return res
      .status(503)
      .json({ error: "Private document upload is temporarily unavailable." })
  }
})

app.post("/v1/admin/tax-invoice-attachments/complete", async (req, res) => {
  if (!r2Client || !r2BucketName) {
    return res.status(503).json({
      error: "Private document storage is not configured on this server.",
    })
  }
  const { uploadId, objectKey, fileName, contentType } = req.body || {}
  const sizeBytes = Number(req.body?.sizeBytes)
  if (
    !/^[0-9a-f-]{36}$/i.test(uploadId || "") ||
    typeof objectKey !== "string" ||
    !objectKey.startsWith("tax-invoices/") ||
    typeof fileName !== "string" ||
    fileName.length > 180 ||
    !allowedTaxInvoiceAttachmentTypes.has(contentType) ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > taxInvoiceAttachmentMaxBytes
  ) {
    return res
      .status(400)
      .json({ error: "The uploaded attachment details are invalid." })
  }
  const reservationResult = await pool.query(
    `SELECT object_key, file_name, content_type, size_bytes
     FROM admin_tax_invoice_uploads
     WHERE id = $1 AND admin_email = $2 AND object_key = $3
       AND expires_at > NOW() AND completed_at IS NULL`,
    [uploadId, req.adminEmail, objectKey],
  )
  const reservation = reservationResult.rows[0]
  if (
    !reservation ||
    reservation.file_name !== fileName ||
    reservation.content_type !== contentType ||
    Number(reservation.size_bytes) !== sizeBytes
  ) {
    return res.status(409).json({
      error: "This attachment upload is invalid or expired. Select the file again.",
    })
  }
  try {
    const object = await r2Client.send(
      new HeadObjectCommand({ Bucket: r2BucketName, Key: objectKey }),
    )
    if (
      Number(object.ContentLength) !== sizeBytes ||
      object.ContentType !== contentType ||
      object.Metadata?.["tax-invoice-upload-id"] !== uploadId
    ) {
      return res.status(400).json({
        error: "The stored attachment does not match the selected file.",
      })
    }
    const prefix = await r2Client.send(
      new GetObjectCommand({
        Bucket: r2BucketName,
        Key: objectKey,
        Range: "bytes=0-7",
      }),
    )
    const bytes = Buffer.from(await prefix.Body.transformToByteArray())
    const validSignature =
      contentType === "application/pdf"
        ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
        : contentType === "image/jpeg"
          ? bytes.length >= 3 &&
            bytes[0] === 0xff &&
            bytes[1] === 0xd8 &&
            bytes[2] === 0xff
          : bytes.length >= 8 &&
            bytes
              .subarray(0, 8)
              .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
              )
    if (!validSignature) {
      await r2Client.send(
        new DeleteObjectCommand({ Bucket: r2BucketName, Key: objectKey }),
      )
      return res.status(400).json({
        error: "The attachment does not match its declared file type.",
      })
    }
    const completed = await pool.query(
      `UPDATE admin_tax_invoice_uploads SET completed_at = NOW()
       WHERE id = $1 AND admin_email = $2 AND completed_at IS NULL
         AND expires_at > NOW()
       RETURNING id`,
      [uploadId, req.adminEmail],
    )
    if (!completed.rowCount) {
      return res.status(409).json({
        error: "This attachment upload is invalid, expired, or already used.",
      })
    }
    return res.set("Cache-Control", "no-store").json({ uploadId })
  } catch (error) {
    console.error(
      "Could not verify private tax invoice attachment",
      error.name || "storage error",
    )
    return res
      .status(503)
      .json({ error: "Private document verification is temporarily unavailable." })
  }
})

app.post("/v1/admin/tax-invoices", async (req, res) => {
  const submittedAmount = Number(req.body?.amount)
  const amount = Number.isFinite(submittedAmount)
    ? Math.round(submittedAmount * 100) / 100
    : Number.NaN
  const description =
    typeof req.body?.description === "string"
      ? req.body.description.trim()
      : ""
  const customerEmail =
    typeof req.body?.customerEmail === "string"
      ? req.body.customerEmail.trim().toLowerCase()
      : ""
  const attachmentId =
    typeof req.body?.attachmentId === "string" && req.body.attachmentId.trim()
      ? req.body.attachmentId.trim()
      : null
  const idempotencyKey = req.get("Idempotency-Key")
  if (!validIdempotencyKey(idempotencyKey)) {
    return res
      .status(400)
      .json({ error: "A valid Idempotency-Key header is required." })
  }
  if (
    !Number.isFinite(amount) ||
    Math.abs(submittedAmount - amount) > 1e-7 ||
    amount <= 0 ||
    amount > 1_000_000 ||
    !description ||
    description.length > 80
  ) {
    return res.status(400).json({
      error: "Enter a tax description and a PHP amount up to 1,000,000.00.",
    })
  }
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
    customerEmail.length > 254
  ) {
    return res
      .status(400)
      .json({ error: "Enter a valid customer email address." })
  }

  if (attachmentId && !/^[0-9a-f-]{36}$/i.test(attachmentId)) {
    return res.status(400).json({ error: "The attachment ID is invalid." })
  }
  const invoice = createTaxInvoiceEmailCopy(description)
  const existing = await pool.query(
    `SELECT p.id, p.code, p.title, p.amount, p.customer_email, p.payment_url,
       p.payment_token, p.qr_payload, p.status, a.upload_id AS attachment_id
     FROM payment_links p
     LEFT JOIN admin_tax_invoice_attachments a ON a.payment_id = p.id
     WHERE p.idempotency_key = $1 AND p.merchant_email IS NULL`,
    [idempotencyKey],
  )
  if (existing.rowCount) {
    const row = existing.rows[0]
    if (
      row.title !== invoice.title ||
      Number(row.amount) !== amount ||
      row.customer_email !== customerEmail ||
      row.attachment_id !== attachmentId
    ) {
      return res.status(409).json({
        error: "This idempotency key was already used for a different invoice.",
      })
    }
    if (!row.payment_url) {
      return res.status(409).json({
        error:
          "The checkout outcome is unknown. Check payment activity before retrying.",
      })
    }
    let requestEmailStatus = "queued"
    try {
      requestEmailStatus = await queueCustomerPaymentRequest(row.id)
    } catch (error) {
      requestEmailStatus = "queue_failed"
      console.error("Tax invoice email could not be queued", {
        error: error.code || "database error",
      })
    }
    return res.json({
      id: row.id,
      code: row.code,
      paymentUrl: row.payment_token
        ? buildCheckoutUrl(row.code)
        : row.payment_url,
      qrCode: row.qr_payload,
      status: row.status,
      amount: Number(row.amount),
      currency: "PHP",
      requestEmailStatus,
    })
  }

  const id = randomUUID()
  const referenceResult = await pool.query(
    "SELECT nextval('admin_tax_invoice_reference_seq')::text AS reference_no",
  )
  const referenceNo = referenceResult.rows[0].reference_no
  const code = randomBytes(32).toString("base64url")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    let attachment = null
    if (attachmentId) {
      const selectedAttachment = await client.query(
        `SELECT object_key, file_name, content_type, size_bytes
         FROM admin_tax_invoice_uploads
         WHERE id = $1 AND admin_email = $2 AND completed_at IS NOT NULL
           AND expires_at > NOW()
         FOR UPDATE`,
        [attachmentId, req.adminEmail],
      )
      attachment = selectedAttachment.rows[0]
      if (!attachment) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "Upload a valid attachment before creating the invoice.",
        })
      }
    }
    await client.query(
      `INSERT INTO payment_links (
        id, idempotency_key, reference_no, code, title, amount,
        checkout_instructions, email_subject, email_message,
        email_brand_color, email_logo_url, checkout_type, status,
        merchant_email, customer_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        'DIRECT_QRPH', 'CREATING', NULL, $12)`,
      [
        id,
        idempotencyKey,
        referenceNo,
        code,
        invoice.title,
        amount,
        defaultCheckoutInstructions,
        invoice.emailSubject,
        invoice.emailMessage,
        defaultPaymentEmailColor,
        "",
        customerEmail,
      ],
    )
    if (attachment) {
      await client.query(
        `INSERT INTO admin_tax_invoice_attachments
           (payment_id, upload_id, object_key, file_name, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          attachmentId,
          attachment.object_key,
          attachment.file_name,
          attachment.content_type,
          attachment.size_bytes,
        ],
      )
    }
    await recordAdminAuditEvent(client, {
      eventKey: `tax-invoice:${id}`,
      category: "Tax invoice",
      action: "Tax payment invoice created",
      target: referenceNo,
      actor: req.adminEmail,
      summary: `${amount.toFixed(2)} PHP tax invoice for ${customerEmail}.`,
    })
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    if (error.code === "23505") {
      return res.status(409).json({
        error:
          "The checkout outcome is unknown. Check payment activity before retrying.",
      })
    }
    throw error
  } finally {
    client.release()
  }

  try {
    const { data } = await swiftPaySignedRequest("/bootstrap/qrph?type=P2M", {
      x_access_key: swiftPayAccessKey,
      x_amount: amount.toFixed(2),
      x_currency: "PHP",
      x_reference_no: referenceNo,
      reject_qrph_duplicated_payments: true,
    })
    if (
      typeof data?.paymentId !== "string" ||
      !data.paymentId ||
      typeof data.qrCode !== "string" ||
      !data.qrCode
    ) {
      throw new Error("SwiftPay returned an incomplete QR payment.")
    }
    const status = data.paymentStatus || "PENDING"
    if (!validPaymentStatus(status))
      throw new Error("SwiftPay returned an invalid initial payment status.")
    const checkoutUrl = buildCheckoutUrl(code)
    const actualAmount = Number(data.amount ?? amount)
    if (!Number.isFinite(actualAmount) || actualAmount <= 0)
      throw new Error("SwiftPay returned an invalid payment amount.")
    await pool.query(
      `UPDATE payment_links
       SET payment_token = $1, qr_payload = $2, payment_url = $3,
         status = $4, amount = $5, updated_at = NOW()
       WHERE id = $6`,
      [data.paymentId, data.qrCode, checkoutUrl, status, actualAmount, id],
    )
    let requestEmailStatus = "queued"
    try {
      requestEmailStatus = await queueCustomerPaymentRequest(id)
    } catch (error) {
      requestEmailStatus = "queue_failed"
      console.error("Tax invoice email could not be queued", {
        error: error.code || "database error",
      })
    }
    if (status === "EXECUTED") {
      await settleSuccessfulCollection(id)
      await queueSuccessfulTransaction("PAYMENT", id)
    }
    const qrImageUrl = new URL(
      `/v1/public/checkout/${code}/qr.png`,
      publicApiOrigin,
    ).toString()
    return res.status(201).json({
      id,
      code,
      paymentUrl: checkoutUrl,
      qrCode: data.qrCode,
      qrImageUrl,
      status,
      amount: actualAmount,
      currency: "PHP",
      requestEmailStatus,
    })
  } catch (error) {
    const isAmbiguous = !error.status || error.status >= 500
    await updatePaymentLinkStatus(
      id,
      isAmbiguous ? "OUTCOME_UNKNOWN" : "FAILED",
    )
    console.error(
      "SwiftPay tax invoice checkout creation failed",
      error.status || "network error",
    )
    return res.status(isAmbiguous ? 503 : 502).json({
      error: isAmbiguous
        ? "The checkout outcome is unknown. Check payment activity before retrying."
        : "SwiftPay could not create the tax invoice checkout.",
    })
  }
})

app.post("/v1/admin/payment-links/:id/mark-paid", async (req, res) => {
  const paymentId = req.params.id
  const verificationNote =
    typeof req.body?.verificationNote === "string"
      ? req.body.verificationNote.trim()
      : ""
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      paymentId,
    )
  ) {
    return res.status(400).json({ error: "The payment ID is invalid." })
  }
  if (verificationNote.length < 10 || verificationNote.length > 500) {
    return res.status(400).json({
      error:
        "Enter 10–500 characters of independent payment verification details.",
    })
  }

  const client = await pool.connect()
  let payment
  try {
    await client.query("BEGIN")
    const selected = await client.query(
      `SELECT id, merchant_email, customer_email, reference_no, title,
         amount::float8 AS amount, currency, status, created_at
       FROM payment_links WHERE id = $1 FOR UPDATE`,
      [paymentId],
    )
    payment = selected.rows[0]
    if (!payment) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Payment not found." })
    }
    if (!canManuallyConfirmPayment(payment.status)) {
      await client.query("ROLLBACK")
      return res
        .status(409)
        .json({ error: "Only pending payments can be manually confirmed." })
    }

    const updated = await client.query(
      `UPDATE payment_links
       SET status = 'MANUALLY_PAID', manually_paid_by = $1,
         manually_paid_at = NOW(), manual_paid_reason = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING manually_paid_by AS "manuallyPaidBy",
         manually_paid_at AS "manuallyPaidAt", manual_paid_reason AS "manualPaidReason"`,
      [req.adminEmail, verificationNote, paymentId],
    )
    await settleSuccessfulCollection(paymentId, client)
    if (payment.merchant_email) {
      await client.query(
        `INSERT INTO transaction_notifications
           (id, merchant_email, transaction_type, transaction_id, reference_no, amount)
         VALUES ($1, $2, 'PAYMENT', $3, $4, $5)
         ON CONFLICT (transaction_type, transaction_id) DO NOTHING`,
        [
          randomUUID(),
          payment.merchant_email,
          paymentId,
          payment.reference_no,
          payment.amount,
        ],
      )
    }
    if (payment.customer_email) {
      await client.query(
        `INSERT INTO customer_payment_notifications (id, payment_id, customer_email)
         VALUES ($1, $2, $3)
         ON CONFLICT (payment_id) DO NOTHING`,
        [randomUUID(), paymentId, payment.customer_email],
      )
    }
    await recordAdminAuditEvent(client, {
      eventKey: `manual-payment:${paymentId}`,
      category: "Payment",
      action: "Payment manually confirmed",
      target: payment.reference_no,
      actor: req.adminEmail,
      summary: verificationNote,
    })
    await client.query("COMMIT")
    payment = { ...payment, status: "MANUALLY_PAID", ...updated.rows[0] }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  try {
    await queueTransactionWebhook("PAYMENT", paymentId)
  } catch (error) {
    console.error(
      "Manually confirmed payment webhook remains unscheduled",
      error.message,
    )
  }
  return res.json({
    id: payment.id,
    merchantEmail: payment.merchant_email,
    customerEmail: payment.customer_email,
    referenceNo: payment.reference_no,
    title: payment.title,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.created_at,
    manuallyPaidBy: payment.manuallyPaidBy,
    manuallyPaidAt: payment.manuallyPaidAt,
    manualPaidReason: payment.manualPaidReason,
    customerNotification: payment.customer_email
      ? "queued"
      : "no_customer_email",
  })
})

app.get("/v1/admin/settings", async (_req, res) => {
  const result = await pool.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1)",
    [
      [
        "krw_to_php_rate",
        "usdt_address",
        "usdt_network",
        "collection_fee_percent",
        "transfer_fee_fixed",
      ],
    ],
  )
  const feeWallet = await pool.query(
    "SELECT COALESCE(SUM(amount), 0)::float8 AS balance FROM platform_fee_ledger",
  )
  const settings = Object.fromEntries(
    result.rows.map((row) => [row.setting_key, row.setting_value]),
  )
  const rate =
    settings.krw_to_php_rate === undefined
      ? null
      : Number(settings.krw_to_php_rate)
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
    return res
      .status(503)
      .json({ error: "The configured KRW/PHP exchange rate is invalid." })
  }
  const collectionFeePercent = Number(settings.collection_fee_percent || 0)
  const transferFeeFixed = Number(settings.transfer_fee_fixed || 0)
  if (
    !Number.isFinite(collectionFeePercent) ||
    collectionFeePercent < 0 ||
    collectionFeePercent > 100 ||
    !Number.isFinite(transferFeeFixed) ||
    transferFeeFixed < 0
  ) {
    return res
      .status(503)
      .json({ error: "The configured collection or transfer fee is invalid." })
  }
  return res.json({
    krwToPhpRate: rate,
    usdtAddress: settings.usdt_address || "",
    usdtNetwork: settings.usdt_network || "",
    collectionFeePercent,
    transferFeeFixed,
    superAdminFeeWallet: feeWallet.rows[0].balance,
  })
})

app.put("/v1/admin/settings", async (req, res) => {
  const rawRate = req.body?.krwToPhpRate
  const rate = rawRate === null || rawRate === "" ? null : Number(rawRate)
  const collectionFeePercent = Number(req.body?.collectionFeePercent)
  const transferFeeFixed = Number(req.body?.transferFeeFixed)
  const usdtAddress =
    typeof req.body?.usdtAddress === "string" ? req.body.usdtAddress.trim() : ""
  const usdtNetwork =
    typeof req.body?.usdtNetwork === "string" ? req.body.usdtNetwork.trim() : ""
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || rate > 1000)) {
    return res.status(400).json({
      error: "KRW/PHP rate must be greater than zero and no more than 1000.",
    })
  }
  if (
    !Number.isFinite(collectionFeePercent) ||
    collectionFeePercent < 0 ||
    collectionFeePercent > 100
  ) {
    return res
      .status(400)
      .json({ error: "Collection fee must be between 0% and 100%." })
  }
  if (
    !Number.isFinite(transferFeeFixed) ||
    transferFeeFixed < 0 ||
    transferFeeFixed > 1_000_000 ||
    Math.abs(transferFeeFixed * 100 - Math.round(transferFeeFixed * 100)) > 1e-7
  ) {
    return res.status(400).json({
      error:
        "Transfer fee must be a non-negative PHP amount with no more than two decimal places.",
    })
  }
  if ((usdtAddress && !usdtNetwork) || (!usdtAddress && usdtNetwork)) {
    return res.status(400).json({
      error: "Set both the USDT address and its network, or leave both empty.",
    })
  }
  if (usdtAddress.length > 256 || usdtNetwork.length > 64) {
    return res
      .status(400)
      .json({ error: "USDT address or network is too long." })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const entries = [
      ["krw_to_php_rate", rate === null ? null : String(rate)],
      ["usdt_address", usdtAddress || null],
      ["usdt_network", usdtNetwork || null],
      ["collection_fee_percent", String(collectionFeePercent)],
      ["transfer_fee_fixed", transferFeeFixed.toFixed(2)],
    ]
    for (const [key, value] of entries) {
      if (value === null) {
        await client.query(
          "DELETE FROM system_settings WHERE setting_key = $1",
          [key],
        )
      } else {
        await client.query(
          `INSERT INTO system_settings (setting_key, setting_value)
           VALUES ($1, $2)
           ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
          [key, value],
        )
      }
    }
    await recordAdminAuditEvent(client, {
      eventKey: `settings:${randomUUID()}`,
      category: "Settings",
      action: "Collection settings updated",
      target: "System settings",
      actor: req.adminEmail,
      summary: `Collection fee ${collectionFeePercent}%; transfer fee PHP ${transferFeeFixed.toFixed(2)}; ${
        rate === null ? "automatic KRW/PHP rate" : `manual KRW/PHP rate ${rate}`
      }; USDT receiving configuration ${usdtAddress ? "updated" : "cleared"}.`,
    })
    await client.query("COMMIT")
    const feeWallet = await pool.query(
      "SELECT COALESCE(SUM(amount), 0)::float8 AS balance FROM platform_fee_ledger",
    )
    return res.json({
      krwToPhpRate: rate,
      usdtAddress,
      usdtNetwork,
      collectionFeePercent,
      transferFeeFixed,
      superAdminFeeWallet: feeWallet.rows[0].balance,
    })
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.get("/v1/admin/merchants", async (_req, res) => {
  const result = await pool.query(
    `SELECT merchant.email, merchant.active, merchant.business_name AS "businessName",
       merchant.contact_person AS "contactPerson", merchant.phone_number AS "phoneNumber",
       merchant.business_address AS "businessAddress",
       COALESCE(payout.bank_name, '') AS "bankName",
       COALESCE(payout.account_name, '') AS "accountName",
       COALESCE(payout.account_number, '') AS "accountNumber",
       crypto.address AS "usdtAddress",
       merchant.created_at AS "createdAt", merchant.updated_at AS "updatedAt"
     FROM merchant_accounts merchant
     LEFT JOIN merchant_payout_accounts payout ON payout.merchant_email = merchant.email
     LEFT JOIN merchant_usdt_wallets crypto ON crypto.merchant_email = merchant.email
     ORDER BY merchant.created_at DESC`,
  )
  return res.json(result.rows)
})

app.get("/v1/admin/internal-wallets", async (_req, res) => {
  const result = await pool.query(
    `SELECT m.email, m.active,
       COALESCE(SUM(a.amount), 0)::float8 AS balance,
       MAX(a.created_at) AS "lastAdjustedAt"
     FROM merchant_accounts m
     LEFT JOIN internal_wallet_adjustments a
       ON a.merchant_email = m.email AND a.adjusted_by NOT LIKE 'system:%'
     GROUP BY m.email, m.active
     ORDER BY m.email ASC`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.get("/v1/admin/internal-wallets/:email", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  const account = await pool.query(
    "SELECT email FROM merchant_accounts WHERE email = $1",
    [email],
  )
  if (!account.rowCount)
    return res.status(404).json({ error: "Merchant account not found." })
  const [balanceResult, reservationResult, adjustmentResult] =
    await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::float8 AS balance
       FROM internal_wallet_adjustments
       WHERE merchant_email = $1 AND adjusted_by NOT LIKE 'system:%'`,
        [email],
      ),
      pool.query(
        "SELECT COALESCE(SUM(amount + transfer_fee), 0)::float8 AS reserved FROM floating_transfer_requests WHERE merchant_email = $1 AND status = 'PENDING'",
        [email],
      ),
      pool.query(
        `SELECT id, amount::float8 AS amount, reason, adjusted_by AS "adjustedBy", created_at AS "createdAt"
       FROM internal_wallet_adjustments WHERE merchant_email = $1
       ORDER BY created_at DESC LIMIT 50`,
        [email],
      ),
    ])
  return res.set("Cache-Control", "no-store").json({
    merchantEmail: email,
    currency: "PHP",
    balance: balanceResult.rows[0].balance,
    availableBalance:
      balanceResult.rows[0].balance - reservationResult.rows[0].reserved,
    adjustments: adjustmentResult.rows,
  })
})

app.post("/v1/admin/internal-wallets/:email/adjustments", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  const submittedAmount = Number(req.body?.amount)
  const amount = Number.isFinite(submittedAmount)
    ? Math.round(submittedAmount * 100) / 100
    : Number.NaN
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : ""
  if (
    !Number.isFinite(amount) ||
    amount === 0 ||
    Math.abs(submittedAmount - amount) > 1e-7 ||
    Math.abs(amount) > 1_000_000_000
  ) {
    return res.status(400).json({
      error:
        "Enter a non-zero PHP adjustment with no more than two decimal places.",
    })
  }
  if (!reason || reason.length > 250) {
    return res
      .status(400)
      .json({ error: "Enter an adjustment reason of 1–250 characters." })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const account = await client.query(
      "SELECT email FROM merchant_accounts WHERE email = $1 FOR UPDATE",
      [email],
    )
    if (!account.rowCount) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Merchant account not found." })
    }
    const balances = await client.query(
      `SELECT COALESCE((SELECT SUM(amount) FROM internal_wallet_adjustments
            WHERE merchant_email = $1 AND adjusted_by NOT LIKE 'system:%'), 0)::numeric AS balance,
         COALESCE((SELECT SUM(amount + transfer_fee) FROM floating_transfer_requests WHERE merchant_email = $1 AND status = 'PENDING'), 0)::numeric AS reserved`,
      [email],
    )
    if (
      Number(balances.rows[0].balance) + amount <
      Number(balances.rows[0].reserved)
    ) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error:
          "This adjustment would reduce the floating balance below pending transfer requests.",
      })
    }
    const adjustmentId = randomUUID()
    const result = await client.query(
      `INSERT INTO internal_wallet_adjustments (id, merchant_email, amount, reason, adjusted_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, amount::float8 AS amount, reason, adjusted_by AS "adjustedBy", created_at AS "createdAt"`,
      [adjustmentId, email, amount.toFixed(2), reason, req.adminEmail],
    )
    await recordAdminAuditEvent(client, {
      eventKey: `wallet-adjustment:${adjustmentId}`,
      category: "Floating balance",
      action: amount < 0 ? "Balance debited" : "Balance credited",
      target: email,
      actor: req.adminEmail,
      summary: `PHP ${amount.toFixed(2)} · ${reason}`,
    })
    await client.query("COMMIT")
    return res.status(201).json(result.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.get("/v1/admin/floating-transfer-requests", async (_req, res) => {
  const result = await pool.query(
    `SELECT id, merchant_email AS "merchantEmail", amount::float8 AS amount,
       transfer_fee::float8 AS "transferFee", status,
       bank_name AS "bankName", account_name AS "accountName", account_number AS "accountNumber",
       requested_at AS "requestedAt", reviewed_at AS "reviewedAt", reviewed_by AS "reviewedBy",
       failure_reason AS "failureReason", payout_reference AS "payoutReference",
       payout_note AS "payoutNote"
     FROM floating_transfer_requests
     ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, requested_at DESC`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post(
  "/v1/admin/floating-transfer-requests/:id/:decision",
  async (req, res) => {
    const { id, decision } = req.params
    if (
      !/^[0-9a-f-]{36}$/i.test(id) ||
      !["successful", "failed"].includes(decision)
    ) {
      return res
        .status(400)
        .json({ error: "Choose a valid transfer request and decision." })
    }
    const failureReason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : ""
    const payoutReference =
      typeof req.body?.payoutReference === "string"
        ? req.body.payoutReference.trim()
        : ""
    const payoutNote =
      typeof req.body?.payoutNote === "string" ? req.body.payoutNote.trim() : ""
    if (
      decision === "failed" &&
      (!failureReason || failureReason.length > 500)
    ) {
      return res.status(400).json({
        error: "Enter a reason for the failed settlement (1–500 characters).",
      })
    }
    if (
      decision === "successful" &&
      (!payoutReference || payoutReference.length > 120)
    ) {
      return res.status(400).json({
        error: "Enter the bank payout reference (1–120 characters).",
      })
    }
    if (payoutNote.length > 500) {
      return res
        .status(400)
        .json({ error: "Payout notes must be no longer than 500 characters." })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const requestInfo = await client.query(
        "SELECT merchant_email FROM floating_transfer_requests WHERE id = $1",
        [id],
      )
      if (!requestInfo.rowCount) {
        await client.query("ROLLBACK")
        return res
          .status(404)
          .json({ error: "Floating-balance transfer request not found." })
      }
      const email = requestInfo.rows[0].merchant_email
      await client.query(
        "SELECT email FROM merchant_accounts WHERE email = $1 FOR UPDATE",
        [email],
      )
      const request = await client.query(
        "SELECT * FROM floating_transfer_requests WHERE id = $1 FOR UPDATE",
        [id],
      )
      if (request.rows[0].status !== "PENDING") {
        await client.query("ROLLBACK")
        return res
          .status(409)
          .json({ error: "This transfer request has already been reviewed." })
      }
      const nextStatus = decision === "successful" ? "SUCCESSFUL" : "FAILED"
      if (nextStatus === "SUCCESSFUL") {
        const debitAmount =
          Number(request.rows[0].amount) + Number(request.rows[0].transfer_fee)
        await client.query(
          `INSERT INTO internal_wallet_adjustments (id, merchant_email, amount, reason, adjusted_by)
         VALUES ($1, $2, $3, $4, $5)`,
          [
            randomUUID(),
            email,
            (-debitAmount).toFixed(2),
            `Floating-balance transfer request ${id} including PHP ${Number(request.rows[0].transfer_fee).toFixed(2)} fee`,
            req.adminEmail,
          ],
        )
        await client.query(
          `INSERT INTO platform_fee_ledger (id, source_type, source_id, merchant_email, amount)
         VALUES ($1, 'FLOATING_TRANSFER', $2, $3, $4)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
          [
            randomUUID(),
            id,
            email,
            Number(request.rows[0].transfer_fee).toFixed(2),
          ],
        )
      }
      const updated = await client.query(
        `UPDATE floating_transfer_requests
       SET status = $2, reviewed_at = NOW(), reviewed_by = $3, failure_reason = $4,
         payout_reference = $5, payout_note = $6
       WHERE id = $1
       RETURNING id, merchant_email AS "merchantEmail", amount::float8 AS amount, status,
         bank_name AS "bankName", account_name AS "accountName", account_number AS "accountNumber",
         requested_at AS "requestedAt", reviewed_at AS "reviewedAt", reviewed_by AS "reviewedBy",
         failure_reason AS "failureReason", transfer_fee::float8 AS "transferFee",
         payout_reference AS "payoutReference", payout_note AS "payoutNote"`,
        [
          id,
          nextStatus,
          req.adminEmail,
          nextStatus === "FAILED" ? failureReason : null,
          nextStatus === "SUCCESSFUL" ? payoutReference : null,
          nextStatus === "SUCCESSFUL" ? payoutNote || null : null,
        ],
      )
      await recordAdminAuditEvent(client, {
        eventKey: `transfer-review:${id}`,
        category: "Transfer request",
        action: `Request marked ${nextStatus.toLowerCase()}`,
        target: email,
        actor: req.adminEmail,
        summary: `PHP ${Number(request.rows[0].amount).toFixed(2)} · ${
          nextStatus === "FAILED"
            ? failureReason
            : `Payout reference ${payoutReference} · transfer fee PHP ${Number(request.rows[0].transfer_fee).toFixed(2)}${
                payoutNote ? ` · ${payoutNote}` : ""
              }`
        }`,
      })
      await client.query("COMMIT")
      return res.json(updated.rows[0])
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  },
)

app.post("/v1/admin/merchants", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res
      .status(400)
      .json({ error: "Enter a valid merchant email address." })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await client.query(
      `INSERT INTO merchant_accounts (email)
       VALUES ($1)
       RETURNING email, active, business_name AS "businessName", contact_person AS "contactPerson",
         phone_number AS "phoneNumber", business_address AS "businessAddress",
         '' AS "bankName", '' AS "accountName", '' AS "accountNumber",
         NULL AS "usdtAddress",
         created_at AS "createdAt", updated_at AS "updatedAt"`,
      [email],
    )
    await recordAdminAuditEvent(client, {
      eventKey: `merchant-created:${email}:${randomUUID()}`,
      category: "Merchant account",
      action: "Merchant account created",
      target: email,
      actor: req.adminEmail,
      summary: "Merchant account access was created.",
    })
    await client.query("COMMIT")
    return res.status(201).json(result.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    if (error.code === "23505")
      return res
        .status(409)
        .json({ error: "A merchant account with that email already exists." })
    throw error
  } finally {
    client.release()
  }
})

app.put("/v1/admin/merchants/:email/usdt-wallet", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  const address =
    typeof req.body?.address === "string" ? req.body.address.trim() : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Choose a valid merchant account." })
  }
  if (address && !tronAddressPayload(address)) {
    return res.status(400).json({
      error: "Enter a valid TRON address with a valid Base58Check checksum.",
    })
  }
  if (address && tronUsdtNetwork !== "mainnet") {
    return res.status(503).json({
      error:
        "Mainnet USDT address assignment is disabled on this API environment.",
    })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    let wallet
    if (!address) {
      const result = await client.query(
        "DELETE FROM merchant_usdt_wallets WHERE merchant_email = $1 RETURNING merchant_email",
        [email],
      )
      if (!result.rowCount) {
        const merchant = await client.query(
          "SELECT email FROM merchant_accounts WHERE email = $1",
          [email],
        )
        if (!merchant.rowCount) {
          await client.query("ROLLBACK")
          return res.status(404).json({ error: "Merchant account not found." })
        }
      }
      wallet = { address: null, network: "TRON_MAINNET" }
    } else {
      const result = await client.query(
        `INSERT INTO merchant_usdt_wallets (merchant_email, address, network, assigned_by)
         SELECT email, $2, 'TRON_MAINNET', $3 FROM merchant_accounts WHERE email = $1
         ON CONFLICT (merchant_email) DO UPDATE SET address = EXCLUDED.address,
           network = EXCLUDED.network, assigned_by = EXCLUDED.assigned_by, updated_at = NOW()
         RETURNING address, network`,
        [email, address, req.adminEmail],
      )
      if (!result.rowCount) {
        await client.query("ROLLBACK")
        return res.status(404).json({ error: "Merchant account not found." })
      }
      wallet = result.rows[0]
    }
    await recordAdminAuditEvent(client, {
      eventKey: `merchant-usdt-wallet:${randomUUID()}`,
      category: "Merchant account",
      action: address
        ? "TRON mainnet wallet assigned"
        : "TRON mainnet wallet removed",
      target: email,
      actor: req.adminEmail,
      summary: address
        ? "Merchant USDT collection address was assigned or updated."
        : "Merchant USDT collection address was removed.",
    })
    await client.query("COMMIT")
    return res.json(wallet)
  } catch (error) {
    await client.query("ROLLBACK")
    if (error.code === "23505") {
      return res.status(409).json({
        error: "That TRON address is already assigned to another merchant.",
      })
    }
    throw error
  } finally {
    client.release()
  }
})

app.patch("/v1/admin/merchants/:email", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  const hasActive = typeof req.body?.active === "boolean"
  const hasProfile = [
    "email",
    "businessName",
    "contactPerson",
    "phoneNumber",
    "businessAddress",
    "bankName",
    "accountName",
    "accountNumber",
  ].every((key) => typeof req.body?.[key] === "string")
  if (!hasActive && !hasProfile)
    return res
      .status(400)
      .json({ error: "Provide merchant profile fields or an active state." })
  if (hasProfile) {
    const nextEmail = req.body.email.trim().toLowerCase()
    const businessName = req.body.businessName.trim()
    const contactPerson = req.body.contactPerson.trim()
    const phoneNumber = req.body.phoneNumber.trim()
    const businessAddress = req.body.businessAddress.trim()
    const bankName = req.body.bankName.trim()
    const accountName = req.body.accountName.trim()
    const accountNumber = req.body.accountNumber.replace(/\s+/g, "")
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail) ||
      nextEmail.length > 254
    ) {
      return res
        .status(400)
        .json({ error: "Enter a valid merchant email address." })
    }
    if (
      businessName.length > 160 ||
      contactPerson.length > 120 ||
      phoneNumber.length > 40 ||
      businessAddress.length > 500
    ) {
      return res.status(400).json({
        error: "One or more merchant profile fields exceed the allowed length.",
      })
    }
    if (
      (bankName || accountName || accountNumber) &&
      (bankName.length < 2 ||
        bankName.length > 100 ||
        accountName.length < 2 ||
        accountName.length > 120 ||
        !/^[A-Za-z0-9-]{4,34}$/.test(accountNumber))
    ) {
      return res.status(400).json({
        error:
          "Enter a complete payout bank name, account holder name, and valid account number, or leave all payout fields blank.",
      })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock(84172031)")
      const account = await client.query(
        "SELECT email FROM merchant_accounts WHERE email = $1 FOR UPDATE",
        [email],
      )
      if (!account.rowCount) {
        await client.query("ROLLBACK")
        return res.status(404).json({ error: "Merchant account not found." })
      }
      const updated = await client.query(
        `UPDATE merchant_accounts SET email = $2, business_name = $3, contact_person = $4,
           phone_number = $5, business_address = $6, updated_at = NOW()
         WHERE email = $1
         RETURNING email, active, business_name AS "businessName", contact_person AS "contactPerson",
           phone_number AS "phoneNumber", business_address AS "businessAddress",
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          email,
          nextEmail,
          businessName,
          contactPerson,
          phoneNumber,
          businessAddress,
        ],
      )
      if (bankName) {
        await client.query(
          `INSERT INTO merchant_payout_accounts (merchant_email, bank_name, account_name, account_number)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (merchant_email) DO UPDATE SET bank_name = EXCLUDED.bank_name,
             account_name = EXCLUDED.account_name, account_number = EXCLUDED.account_number, updated_at = NOW()`,
          [nextEmail, bankName, accountName, accountNumber],
        )
      } else {
        await client.query(
          "DELETE FROM merchant_payout_accounts WHERE merchant_email = $1",
          [nextEmail],
        )
      }
      await recordAdminAuditEvent(client, {
        eventKey: `merchant-profile:${randomUUID()}`,
        category: "Merchant account",
        action: "Merchant profile updated",
        target: nextEmail,
        actor: req.adminEmail,
        summary: `Business profile and payout account details ${
          bankName ? "updated" : "cleared"
        }.`,
      })
      await client.query("COMMIT")
      return res.json({
        ...updated.rows[0],
        bankName,
        accountName,
        accountNumber,
      })
    } catch (error) {
      await client.query("ROLLBACK")
      if (error.code === "23505")
        return res
          .status(409)
          .json({ error: "A merchant account with that email already exists." })
      throw error
    } finally {
      client.release()
    }
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(84172031)")
    const account = await client.query(
      "SELECT email FROM merchant_accounts WHERE email = $1",
      [email],
    )
    if (!account.rowCount) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Merchant account not found." })
    }
    if (req.body.active === false) {
      const remaining = await client.query(
        "SELECT COUNT(*)::int AS count FROM merchant_accounts WHERE active = TRUE AND email <> $1",
        [email],
      )
      if (remaining.rows[0].count === 0) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "The last active merchant account cannot be disabled.",
        })
      }
      await client.query("DELETE FROM merchant_devices WHERE email = $1", [
        email,
      ])
    }
    const result = await client.query(
      `UPDATE merchant_accounts SET
         active = $2,
         updated_at = NOW()
       WHERE email = $1
       RETURNING email, active, business_name AS "businessName", contact_person AS "contactPerson",
         phone_number AS "phoneNumber", business_address AS "businessAddress",
         created_at AS "createdAt", updated_at AS "updatedAt"`,
      [email, req.body.active],
    )
    const payout = await client.query(
      `SELECT bank_name AS "bankName", account_name AS "accountName", account_number AS "accountNumber"
       FROM merchant_payout_accounts WHERE merchant_email = $1`,
      [email],
    )
    await recordAdminAuditEvent(client, {
      eventKey: `merchant-status:${randomUUID()}`,
      category: "Merchant account",
      action: req.body.active
        ? "Merchant access enabled"
        : "Merchant access disabled",
      target: email,
      actor: req.adminEmail,
      summary: `Merchant account access was ${
        req.body.active ? "enabled" : "disabled"
      }.`,
    })
    await client.query("COMMIT")
    return res.json({ ...result.rows[0], ...payout.rows[0] })
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.get("/v1/admin/kyb", async (_req, res) => {
  const result = await pool.query(
    `SELECT p.merchant_email AS "merchantEmail", p.legal_business_name AS "legalBusinessName",
       p.registration_number AS "registrationNumber", p.business_type AS "businessType", p.country,
       p.business_address AS "businessAddress", p.owner_full_name AS "ownerFullName",
       p.owner_date_of_birth::text AS "ownerDateOfBirth", p.owner_nationality AS "ownerNationality",
       p.owner_email AS "ownerEmail", p.owner_phone AS "ownerPhone", p.status, p.review_notes AS "reviewNotes",
       p.created_at AS "createdAt", p.updated_at AS "updatedAt",
       COALESCE(json_agg(json_build_object(
         'id', d.id, 'documentType', d.document_type, 'fileName', d.file_name,
         'contentType', d.content_type, 'sizeBytes', d.size_bytes, 'uploadedAt', d.uploaded_at
       )) FILTER (WHERE d.id IS NOT NULL), '[]'::json) AS documents
     FROM merchant_kyb_profiles p
     LEFT JOIN merchant_kyb_documents d ON d.merchant_email = p.merchant_email
     GROUP BY p.merchant_email
     ORDER BY p.updated_at DESC`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.get(
  "/v1/admin/kyb/:email/documents/:documentType/url",
  async (req, res) => {
    if (!r2Client || !r2BucketName)
      return res
        .status(503)
        .json({ error: "Private document storage is not configured." })
    const email =
      typeof req.params.email === "string"
        ? req.params.email.trim().toLowerCase()
        : ""
    const documentType = req.params.documentType
    if (!allowedKybDocuments.has(documentType))
      return res.status(400).json({ error: "Invalid KYB document type." })
    const result = await pool.query(
      `SELECT object_key, file_name FROM merchant_kyb_documents
     WHERE merchant_email = $1 AND document_type = $2`,
      [email, documentType],
    )
    if (!result.rowCount)
      return res.status(404).json({ error: "KYB document not found." })
    try {
      const url = await getSignedUrl(
        r2Client,
        new GetObjectCommand({
          Bucket: r2BucketName,
          Key: result.rows[0].object_key,
          ResponseContentDisposition: `attachment; filename="${result.rows[0].file_name.replace(/["\\]/g, "_")}"`,
        }),
        { expiresIn: 60 },
      )
      return res
        .set("Cache-Control", "no-store")
        .json({ url, expiresInSeconds: 60 })
    } catch (error) {
      console.error(
        "Could not create KYB document download",
        error.name || "storage error",
      )
      return res
        .status(503)
        .json({ error: "The KYB document is temporarily unavailable." })
    }
  },
)

app.patch("/v1/admin/kyb/:email", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  const status = req.body?.status
  const reviewNotes =
    typeof req.body?.reviewNotes === "string" ? req.body.reviewNotes.trim() : ""
  if (
    !["IN_REVIEW", "APPROVED", "REJECTED"].includes(status) ||
    reviewNotes.length > 1000 ||
    (status === "REJECTED" && !reviewNotes)
  ) {
    return res.status(400).json({
      error:
        "Choose a valid KYB review status. Rejected applications require review notes.",
    })
  }
  if (status === "APPROVED") {
    const requiredDocuments = await pool.query(
      `SELECT COUNT(DISTINCT document_type)::int AS count
       FROM merchant_kyb_documents
       WHERE merchant_email = $1
         AND document_type IN ('business_registration', 'identity_front', 'identity_back')`,
      [email],
    )
    if (requiredDocuments.rows[0].count !== 3) {
      return res.status(409).json({
        error:
          "A business registration certificate and both owner identity images are required before approval.",
      })
    }
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await client.query(
      `UPDATE merchant_kyb_profiles
       SET status = $2, review_notes = $3, reviewed_by = $4, reviewed_at = NOW(), updated_at = NOW()
       WHERE merchant_email = $1
       RETURNING merchant_email AS "merchantEmail", status, review_notes AS "reviewNotes",
         reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"`,
      [email, status, reviewNotes || null, req.adminEmail],
    )
    if (!result.rowCount) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "KYB application not found." })
    }
    await recordAdminAuditEvent(client, {
      eventKey: `kyb-review:${randomUUID()}`,
      category: "KYB review",
      action: `Application marked ${status.toLowerCase().replace("_", " ")}`,
      target: email,
      actor: req.adminEmail,
      summary: reviewNotes
        ? "KYB review notes recorded."
        : "KYB application review recorded.",
    })
    await client.query("COMMIT")
    return res.json(result.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.get(
  "/v1/public/checkout/:code/qr.png",
  publicQrImageLimiter,
  async (req, res) => {
    const code = req.params.code
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(code))
      return res.status(404).json({ error: "Checkout not found." })
    const record = await pool.query(
      "SELECT payment_token FROM payment_links WHERE code = $1 AND checkout_type = 'DIRECT_QRPH'",
      [code],
    )
    const paymentToken = record.rows[0]?.payment_token
    if (!paymentToken)
      return res.status(404).json({ error: "Checkout not found." })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)
    try {
      const response = await fetch(
        `${swiftPayBaseUrl}/payments/qrph/image?type=P2M`,
        {
          signal: controller.signal,
          headers: {
            Accept: "image/png",
            "X-Swiftpay-Payment-Token": paymentToken,
          },
        },
      )
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/png")
      ) {
        console.error("SwiftPay QR image request failed", response.status)
        return res
          .status(503)
          .json({ error: "The payment QR is temporarily unavailable." })
      }
      const image = Buffer.from(await response.arrayBuffer())
      if (!image.length || image.length > 5 * 1024 * 1024) {
        console.error("SwiftPay returned an invalid QR image.")
        return res
          .status(503)
          .json({ error: "The payment QR is temporarily unavailable." })
      }
      return res
        .set({
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=30",
          "X-Content-Type-Options": "nosniff",
        })
        .send(image)
    } catch (error) {
      console.error(
        "SwiftPay QR image request failed",
        error.name === "AbortError" ? "timeout" : error.message,
      )
      return res
        .status(503)
        .json({ error: "The payment QR is temporarily unavailable." })
    } finally {
      clearTimeout(timeout)
    }
  },
)

app.get(
  "/v1/public/checkout/:code",
  publicCheckoutLimiter,
  async (req, res) => {
    const code = req.params.code
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(code))
      return res.status(404).json({ error: "Checkout not found." })
    const record = await pool.query(
      `SELECT code, title, reference_no, amount::float8 AS amount, currency, status, payment_token, qr_payload,
        payment_institution_code, payment_institution_name, payment_institution_logo_url,
        payment_institution_deep_link, checkout_instructions,
        email_brand_color, email_logo_url
     FROM payment_links WHERE code = $1 AND checkout_type = 'DIRECT_QRPH'`,
      [code],
    )
    const row = record.rows[0]
    if (!row?.payment_token)
      return res.status(404).json({ error: "Checkout not found." })

    let status = row.status
    let statusCheckUnavailable = false
    if (!["EXECUTED", "CANCELED", "REJECTED", "EXPIRED"].includes(status)) {
      try {
        const { data } = await swiftPayPaymentRequest(
          "/payments/status",
          row.payment_token,
        )
        status = paymentStatusFromResponse(data)
        await updatePaymentLinkStatus(row.id, status)
      } catch (error) {
        statusCheckUnavailable = true
        console.error(
          "Checkout payment status lookup failed",
          error.status || "network error",
        )
      }
    }

    return res.set("Cache-Control", "no-store").json({
      title: row.title,
      referenceNo: row.reference_no,
      amount: row.amount,
      currency: row.currency,
      status,
      statusCheckUnavailable,
      qrCode: row.qr_payload,
      institutionCode: row.payment_institution_code,
      institutionName: row.payment_institution_name,
      institutionLogoUrl: row.payment_institution_logo_url,
      institutionDeepLink: row.payment_institution_deep_link,
      checkoutInstructions: row.checkout_instructions.replaceAll(
        "{bank}",
        row.payment_institution_name || "bank",
      ),
      brandColor: row.email_brand_color,
      logoUrl: row.email_logo_url,
    })
  },
)

app.use("/v1", requireMerchant)

app.get("/v1/crypto/usdt-wallet", cryptoWalletLimiter, async (req, res) => {
  const wallet = await pool.query(
    "SELECT address, network FROM merchant_usdt_wallets WHERE merchant_email = $1",
    [req.merchantEmail],
  )
  const assigned = wallet.rows[0]
  const mainnetEnabled = tronUsdtNetwork === "mainnet"
  const ready = Boolean(mainnetEnabled && tatumApiKey)
  if (!assigned) {
    return res.set("Cache-Control", "no-store").json({
      address: null,
      network: "TRON_MAINNET",
      balance: null,
      configured: ready,
      message: "The DRPAY team has not assigned your TRON mainnet address.",
    })
  }
  if (assigned.network !== "TRON_MAINNET") {
    return res.set("Cache-Control", "no-store").json({
      address: assigned.address,
      network: assigned.network,
      balance: null,
      configured: false,
      message:
        "This address is marked as a Shasta testnet address. The DRPAY team must confirm and reassign a production address before mainnet balance lookup.",
    })
  }
  if (!ready) {
    return res.set("Cache-Control", "no-store").json({
      address: assigned.address,
      network: "TRON_MAINNET",
      balance: null,
      configured: false,
      message:
        "Mainnet USDT balance lookup is disabled or Tatum is not configured on this API service.",
    })
  }
  const addressPayload = tronAddressPayload(assigned.address)
  const contractPayload = tronAddressPayload(tronMainnetUsdtContract)
  if (!addressPayload || !contractPayload) {
    return res.status(503).set("Cache-Control", "no-store").json({
      address: assigned.address,
      network: "TRON_MAINNET",
      balance: null,
      configured: false,
      message:
        "The assigned wallet address or official TRON USDT contract is invalid.",
    })
  }
  try {
    const response = await fetch(
      "https://tron-mainnet.gateway.tatum.io/wallet/triggerconstantcontract",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": tatumApiKey,
        },
        body: JSON.stringify({
          owner_address: assigned.address,
          contract_address: tronMainnetUsdtContract,
          function_selector: "balanceOf(address)",
          parameter: addressPayload
            .subarray(1)
            .toString("hex")
            .padStart(64, "0"),
          visible: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!response.ok) throw new Error(`Tatum returned HTTP ${response.status}`)
    const result = await response.json()
    const rawBalance = result?.constant_result?.[0]
    if (
      result?.Error ||
      result?.result?.result !== true ||
      typeof rawBalance !== "string"
    ) {
      throw new Error("Tatum did not return a valid TRC20 contract result")
    }
    const balance = formatTokenBalance(rawBalance, tronMainnetUsdtDecimals)
    if (balance === null)
      throw new Error("Tatum returned an invalid token balance")
    return res.set("Cache-Control", "no-store").json({
      address: assigned.address,
      network: "TRON_MAINNET",
      balance,
      configured: true,
      message: null,
    })
  } catch (error) {
    console.error(
      "TRON mainnet USDT balance lookup failed",
      error.name || "RPC error",
    )
    return res.status(503).set("Cache-Control", "no-store").json({
      address: assigned.address,
      network: "TRON_MAINNET",
      balance: null,
      configured: true,
      message:
        "Could not retrieve the mainnet USDT balance. Try again shortly.",
    })
  }
})

app.get("/v1/crypto/usdt-deposits", cryptoWalletLimiter, async (req, res) => {
  const wallet = await pool.query(
    "SELECT address, network FROM merchant_usdt_wallets WHERE merchant_email = $1",
    [req.merchantEmail],
  )
  const assigned = wallet.rows[0]
  if (
    !assigned ||
    assigned.network !== "TRON_MAINNET" ||
    tronUsdtNetwork !== "mainnet"
  ) {
    return res.set("Cache-Control", "no-store").json({
      deposits: [],
      configured: false,
      message:
        "A confirmed TRON mainnet wallet is required to view USDT deposits.",
    })
  }
  try {
    const endpoint = new URL(
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(assigned.address)}/transactions/trc20`,
    )
    endpoint.searchParams.set("limit", "50")
    endpoint.searchParams.set("contract_address", tronMainnetUsdtContract)
    endpoint.searchParams.set("only_confirmed", "true")
    endpoint.searchParams.set("order_by", "block_timestamp,desc")
    const headers = { Accept: "application/json" }
    if (tronGridApiKey) headers["TRON-PRO-API-KEY"] = tronGridApiKey
    const response = await fetch(endpoint, {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      throw new Error(
        `TRON transaction service returned HTTP ${response.status}`,
      )
    const result = await response.json()
    if (!Array.isArray(result?.data)) {
      throw new Error(
        "TRON transaction service returned an invalid deposit list",
      )
    }
    const deposits = result.data
      .filter(
        (item) =>
          typeof item?.to === "string" &&
          item.to.toLowerCase() === assigned.address.toLowerCase() &&
          String(item?.token_info?.address || "").toLowerCase() ===
            tronMainnetUsdtContract.toLowerCase() &&
          String(item?.token_info?.symbol || "").toUpperCase() === "USDT" &&
          Number(item?.token_info?.decimals) === tronMainnetUsdtDecimals &&
          typeof item?.value === "string" &&
          /^[0-9]+$/.test(item.value) &&
          typeof item?.transaction_id === "string" &&
          Number.isFinite(Number(item?.block_timestamp)),
      )
      .map((item) => ({
        transactionId: item.transaction_id,
        amount: formatTokenBalance(
          BigInt(item.value).toString(16),
          tronMainnetUsdtDecimals,
        ),
        from: item.from,
        blockTimestamp: new Date(Number(item.block_timestamp)).toISOString(),
        confirmed: true,
      }))
    return res.set("Cache-Control", "no-store").json({
      deposits,
      configured: true,
      message: null,
    })
  } catch (error) {
    console.error(
      "TRON USDT deposit history lookup failed",
      error.name || "network error",
    )
    return res.status(503).set("Cache-Control", "no-store").json({
      deposits: [],
      configured: true,
      message: "Could not retrieve confirmed USDT deposits. Try again shortly.",
    })
  }
})

app.get("/v1/kyb", async (req, res) => {
  const [profile, documents] = await Promise.all([
    pool.query(
      `SELECT legal_business_name AS "legalBusinessName", registration_number AS "registrationNumber",
         business_type AS "businessType", country, business_address AS "businessAddress",
         owner_full_name AS "ownerFullName", owner_date_of_birth::text AS "ownerDateOfBirth",
         owner_nationality AS "ownerNationality", owner_email AS "ownerEmail", owner_phone AS "ownerPhone",
         status, review_notes AS "reviewNotes", updated_at AS "updatedAt"
       FROM merchant_kyb_profiles WHERE merchant_email = $1`,
      [req.merchantEmail],
    ),
    pool.query(
      `SELECT id, document_type AS "documentType", file_name AS "fileName",
         content_type AS "contentType", size_bytes::bigint AS "sizeBytes", uploaded_at AS "uploadedAt"
       FROM merchant_kyb_documents WHERE merchant_email = $1 ORDER BY uploaded_at ASC`,
      [req.merchantEmail],
    ),
  ])
  return res
    .set("Cache-Control", "no-store")
    .json({ profile: profile.rows[0] || null, documents: documents.rows })
})

app.put("/v1/kyb", async (req, res) => {
  const approved = await pool.query(
    "SELECT 1 FROM merchant_kyb_profiles WHERE merchant_email = $1 AND status = 'APPROVED'",
    [req.merchantEmail],
  )
  if (approved.rowCount) return res.status(409).json({
      error:
        "Your KYB profile is approved. Contact DRPAY support to request a verified profile change.",
    })
  const fields = {
    legalBusinessName: req.body?.legalBusinessName,
    registrationNumber: req.body?.registrationNumber,
    businessType: req.body?.businessType,
    country: req.body?.country,
    businessAddress: req.body?.businessAddress,
    ownerFullName: req.body?.ownerFullName,
    ownerDateOfBirth: req.body?.ownerDateOfBirth,
    ownerNationality: req.body?.ownerNationality,
    ownerEmail:
      typeof req.body?.ownerEmail === "string"
        ? req.body.ownerEmail.trim().toLowerCase()
        : "",
    ownerPhone: req.body?.ownerPhone,
  }
  if (
    Object.values(fields).some(
      (value) =>
        typeof value !== "string" || !value.trim() || value.length > 200,
    ) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.ownerEmail) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.ownerDateOfBirth) ||
    Number.isNaN(Date.parse(`${fields.ownerDateOfBirth}T00:00:00Z`)) ||
    new Date(`${fields.ownerDateOfBirth}T00:00:00Z`)
      .toISOString()
      .slice(0, 10) !== fields.ownerDateOfBirth ||
    new Date(`${fields.ownerDateOfBirth}T00:00:00Z`) >= new Date()
  ) {
    return res.status(400).json({
      error:
        "Complete each required business and beneficial-owner field with valid details.",
    })
  }
  const result = await pool.query(
    `INSERT INTO merchant_kyb_profiles (
       merchant_email, legal_business_name, registration_number, business_type, country, business_address,
       owner_full_name, owner_date_of_birth, owner_nationality, owner_email, owner_phone, status, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', NOW())
     ON CONFLICT (merchant_email) DO UPDATE SET
       legal_business_name = EXCLUDED.legal_business_name,
       registration_number = EXCLUDED.registration_number,
       business_type = EXCLUDED.business_type,
       country = EXCLUDED.country,
       business_address = EXCLUDED.business_address,
       owner_full_name = EXCLUDED.owner_full_name,
       owner_date_of_birth = EXCLUDED.owner_date_of_birth,
       owner_nationality = EXCLUDED.owner_nationality,
       owner_email = EXCLUDED.owner_email,
       owner_phone = EXCLUDED.owner_phone,
       status = 'PENDING', review_notes = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
     RETURNING status, updated_at AS "updatedAt"`,
    [req.merchantEmail, ...Object.values(fields)],
  )
  return res.json(result.rows[0])
})

app.post("/v1/kyb/documents/presign", async (req, res) => {
  if (!r2Client || !r2BucketName) return res.status(503).json({
      error: "Private document storage is not configured on this server.",
    })
  const documentType = req.body?.documentType
  const fileName =
    typeof req.body?.fileName === "string" ? req.body.fileName.trim() : ""
  const contentType = req.body?.contentType
  const sizeBytes = Number(req.body?.sizeBytes)
  if (
    !allowedKybDocuments.has(documentType) ||
    !fileName ||
    fileName.length > 180 ||
    /[/\\\u0000-\u001f]/.test(fileName) ||
    !["application/pdf", "image/jpeg", "image/png"].includes(contentType) ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > kybDocumentMaxBytes
  ) {
    return res.status(400).json({
      error: "Upload a PDF, JPEG, or PNG document no larger than 10 MB.",
    })
  }
  const profile = await pool.query(
    "SELECT status FROM merchant_kyb_profiles WHERE merchant_email = $1",
    [req.merchantEmail],
  )
  if (!profile.rowCount) return res.status(409).json({
      error:
        "Save the KYB business and owner details before uploading documents.",
    })
  if (profile.rows[0].status === "APPROVED") return res.status(409).json({
      error:
        "Your KYB profile is approved. Contact DRPAY support to request a verified document change.",
    })
  const objectKey = `kyb/${randomUUID()}`
  const documentId = randomUUID()
  const safeName = fileName.replace(/[^\w .()-]/g, "_").slice(0, 180)
  await pool.query(
    `INSERT INTO merchant_kyb_uploads
       (id, merchant_email, document_type, object_key, file_name, content_type, size_bytes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '5 minutes')`,
    [
      documentId,
      req.merchantEmail,
      documentType,
      objectKey,
      safeName,
      contentType,
      sizeBytes,
    ],
  )
  try {
    const uploadUrl = await getSignedUrl(
      r2Client,
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: sizeBytes,
        Metadata: { "document-id": documentId },
      }),
      { expiresIn: 300 },
    )
    return res.set("Cache-Control", "no-store").json({
      documentId,
      uploadUrl,
      objectKey,
      fileName: safeName,
      headers: { "Content-Type": contentType },
      expiresInSeconds: 300,
    })
  } catch (error) {
    await pool.query("DELETE FROM merchant_kyb_uploads WHERE id = $1", [
      documentId,
    ])
    console.error(
      "Could not create private KYB document upload",
      error.name || "storage error",
    )
    return res
      .status(503)
      .json({ error: "Private document upload is temporarily unavailable." })
  }
})

app.post("/v1/kyb/documents/complete", async (req, res) => {
  if (!r2Client || !r2BucketName) return res.status(503).json({
      error: "Private document storage is not configured on this server.",
    })
  const {
    documentId,
    objectKey,
    documentType,
    fileName,
    contentType,
    sizeBytes,
  } = req.body || {}
  if (
    !/^[0-9a-f-]{36}$/i.test(documentId || "") ||
    typeof objectKey !== "string" ||
    !objectKey.startsWith("kyb/") ||
    !allowedKybDocuments.has(documentType) ||
    typeof fileName !== "string" ||
    fileName.length > 180 ||
    !["application/pdf", "image/jpeg", "image/png"].includes(contentType) ||
    !Number.isSafeInteger(Number(sizeBytes)) ||
    Number(sizeBytes) <= 0 ||
    Number(sizeBytes) > kybDocumentMaxBytes
  ) {
    return res
      .status(400)
      .json({ error: "The uploaded document details are invalid." })
  }
  const reservationResult = await pool.query(
    `SELECT document_type, object_key, file_name, content_type, size_bytes
     FROM merchant_kyb_uploads
     WHERE id = $1 AND merchant_email = $2 AND object_key = $3
       AND expires_at > NOW() AND completed_at IS NULL`,
    [documentId, req.merchantEmail, objectKey],
  )
  const reservation = reservationResult.rows[0]
  if (
    !reservation ||
    reservation.document_type !== documentType ||
    reservation.file_name !== fileName ||
    reservation.content_type !== contentType ||
    Number(reservation.size_bytes) !== Number(sizeBytes)
  ) {
    return res.status(409).json({
      error:
        "This document upload is invalid or expired. Request a new upload URL.",
    })
  }
  const profile = await pool.query(
    "SELECT status FROM merchant_kyb_profiles WHERE merchant_email = $1",
    [req.merchantEmail],
  )
  if (!profile.rowCount) return res.status(409).json({
      error:
        "Save the KYB business and owner details before uploading documents.",
    })
  if (profile.rows[0].status === "APPROVED") {
    await r2Client
      .send(new DeleteObjectCommand({ Bucket: r2BucketName, Key: objectKey }))
      .catch((error) => {
        console.error(
          "Could not clean up a KYB upload for an approved profile",
          error.name || "storage error",
        )
      })
    return res.status(409).json({
      error:
        "Your KYB profile is approved. Contact DRPAY support to request a verified document change.",
    })
  }
  try {
    const object = await r2Client.send(
      new HeadObjectCommand({ Bucket: r2BucketName, Key: objectKey }),
    )
    if (
      Number(object.ContentLength) !== Number(sizeBytes) ||
      object.ContentType !== contentType ||
      object.Metadata?.["document-id"] !== documentId
    ) {
      return res.status(400).json({
        error: "The stored document does not match the uploaded file details.",
      })
    }
    const prefix = await r2Client.send(
      new GetObjectCommand({
        Bucket: r2BucketName,
        Key: objectKey,
        Range: "bytes=0-7",
      }),
    )
    const bytes = Buffer.from(await prefix.Body.transformToByteArray())
    const validSignature =
      contentType === "application/pdf"
        ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
        : contentType === "image/jpeg"
          ? bytes.length >= 3 &&
            bytes[0] === 0xff &&
            bytes[1] === 0xd8 &&
            bytes[2] === 0xff
          : bytes.length >= 8 &&
            bytes
              .subarray(0, 8)
              .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
              )
    if (!validSignature) {
      await r2Client.send(
        new DeleteObjectCommand({ Bucket: r2BucketName, Key: objectKey }),
      )
      return res.status(400).json({
        error: "The uploaded file does not match its declared document type.",
      })
    }
    const client = await pool.connect()
    let oldObjectKey = null
    try {
      await client.query("BEGIN")
      const lockedUpload = await client.query(
        `SELECT id FROM merchant_kyb_uploads
         WHERE id = $1 AND merchant_email = $2 AND expires_at > NOW() AND completed_at IS NULL
         FOR UPDATE`,
        [documentId, req.merchantEmail],
      )
      if (!lockedUpload.rowCount) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "This document upload is invalid, expired, or already used.",
        })
      }
      const old = await client.query(
        "SELECT object_key FROM merchant_kyb_documents WHERE merchant_email = $1 AND document_type = $2",
        [req.merchantEmail, documentType],
      )
      oldObjectKey = old.rows[0]?.object_key || null
      await client.query(
        `INSERT INTO merchant_kyb_documents (id, merchant_email, document_type, object_key, file_name, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (merchant_email, document_type) DO UPDATE SET
           id = EXCLUDED.id, object_key = EXCLUDED.object_key, file_name = EXCLUDED.file_name,
           content_type = EXCLUDED.content_type, size_bytes = EXCLUDED.size_bytes, uploaded_at = NOW()`,
        [
          documentId,
          req.merchantEmail,
          documentType,
          objectKey,
          reservation.file_name,
          reservation.content_type,
          Number(reservation.size_bytes),
        ],
      )
      await client.query(
        "UPDATE merchant_kyb_profiles SET status = 'PENDING', review_notes = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW() WHERE merchant_email = $1",
        [req.merchantEmail],
      )
      await client.query(
        "UPDATE merchant_kyb_uploads SET completed_at = NOW() WHERE id = $1",
        [documentId],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    if (oldObjectKey && oldObjectKey !== objectKey) {
      await r2Client
        .send(
          new DeleteObjectCommand({ Bucket: r2BucketName, Key: oldObjectKey }),
        )
        .catch((error) => {
          console.error(
            "Could not remove replaced KYB document from private storage",
            error.name || "storage error",
          )
        })
    }
    return res.status(201).json({ uploaded: true, documentType })
  } catch (error) {
    console.error(
      "Could not verify private KYB document upload",
      error.name || "storage error",
    )
    return res.status(503).json({
      error: "The uploaded document could not be verified. Try again.",
    })
  }
})

app.get("/v1/api-keys", async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, key_prefix AS "keyPrefix", scopes, created_at AS "createdAt",
       last_used_at AS "lastUsedAt", revoked_at AS "revokedAt"
     FROM merchant_api_keys WHERE merchant_email = $1 ORDER BY created_at DESC`,
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post("/v1/api-keys", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
  const scopes = req.body?.scopes
  const validScopes =
    Array.isArray(scopes) &&
    scopes.length > 0 &&
    scopes.every((scope) => ["read", "payments:write"].includes(scope)) &&
    new Set(scopes).size === scopes.length
  if (!name || name.length > 80 || !validScopes) {
    return res
      .status(400)
      .json({ error: "Enter a key name and select valid API permissions." })
  }
  const activeKeys = await pool.query(
    "SELECT COUNT(*)::int AS count FROM merchant_api_keys WHERE merchant_email = $1 AND revoked_at IS NULL",
    [req.merchantEmail],
  )
  if (activeKeys.rows[0].count >= 10) return res.status(409).json({
      error:
        "Revoke an existing API key before creating another. Each merchant can have up to 10 active keys.",
    })
  const key = `drp_${swiftPayEnvironment}_${randomBytes(32).toString("hex")}`
  const result = await pool.query(
    `INSERT INTO merchant_api_keys (id, merchant_email, name, key_prefix, key_hash, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, key_prefix AS "keyPrefix", scopes, created_at AS "createdAt"`,
    [
      randomUUID(),
      req.merchantEmail,
      name,
      key.slice(0, 16),
      createHash("sha256").update(key).digest("hex"),
      scopes,
    ],
  )
  return res
    .set("Cache-Control", "no-store")
    .status(201)
    .json({ ...result.rows[0], key })
})

app.delete("/v1/api-keys/:id", async (req, res) => {
  const result = await pool.query(
    `UPDATE merchant_api_keys SET revoked_at = NOW()
     WHERE id = $1 AND merchant_email = $2 AND revoked_at IS NULL RETURNING id`,
    [req.params.id, req.merchantEmail],
  )
  if (!result.rowCount)
    return res.status(404).json({ error: "Active API key not found." })
  return res.json({ revoked: true })
})

app.get("/v1/webhook", async (req, res) => {
  const result = await pool.query(
    `SELECT endpoint_url AS "endpointUrl", callback_url AS "callbackUrl", events, enabled,
       updated_at AS "updatedAt"
     FROM merchant_webhook_settings WHERE merchant_email = $1`,
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json(result.rows[0] || null)
})

app.get("/v1/webhook/deliveries", async (req, res) => {
  const result = await pool.query(
    `SELECT id, event_type AS "eventType", resource_id AS "resourceId",
       payload, attempts, next_attempt_at AS "nextAttemptAt",
       delivered_at AS "deliveredAt", last_error AS "lastError",
       last_attempt_at AS "lastAttemptAt",
       COALESCE((
         SELECT json_agg(json_build_object(
           'attemptedAt', attempt.attempted_at,
           'delivered', attempt.delivered,
           'error', attempt.error
         ) ORDER BY attempt.attempted_at ASC)
         FROM merchant_webhook_delivery_attempts attempt
         WHERE attempt.delivery_id = d.id
       ), '[]'::json) AS "attemptHistory",
       created_at AS "createdAt"
     FROM merchant_webhook_deliveries d
     WHERE d.merchant_email = $1
     ORDER BY d.created_at DESC LIMIT 50`,
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post("/v1/webhook/deliveries/:id/retry", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res
      .status(400)
      .json({ error: "The webhook delivery ID is invalid." })
  }
  const result = await pool.query(
    `UPDATE merchant_webhook_deliveries
     SET attempts = 0, next_attempt_at = NOW(), last_error = NULL
     WHERE id = $1 AND merchant_email = $2 AND delivered_at IS NULL
       AND attempts >= 8
     RETURNING id`,
    [req.params.id, req.merchantEmail],
  )
  if (!result.rowCount) {
    return res.status(409).json({
      error: "Only an exhausted, undelivered webhook can be retried.",
    })
  }
  return res.status(202).json({ queued: true })
})

app.put("/v1/webhook", async (req, res) => {
  const endpointUrl =
    typeof req.body?.endpointUrl === "string" ? req.body.endpointUrl.trim() : ""
  const callbackUrl =
    typeof req.body?.callbackUrl === "string" && req.body.callbackUrl.trim()
      ? req.body.callbackUrl.trim()
      : null
  const events = req.body?.events
  const allowedEvents = new Set([
    "payment.succeeded",
    "payment.failed",
    "disbursement.succeeded",
    "disbursement.failed",
  ])
  if (
    !Array.isArray(events) ||
    !events.length ||
    events.some((event) => !allowedEvents.has(event)) ||
    new Set(events).size !== events.length
  ) {
    return res
      .status(400)
      .json({ error: "Select one or more supported webhook events." })
  }
  if (
    !(await validateWebhookUrl(endpointUrl)) ||
    (callbackUrl && !(await validateWebhookUrl(callbackUrl)))
  ) {
    return res.status(400).json({
      error: "Webhook and callback URLs must be public HTTPS endpoints.",
    })
  }
  const signingSecret = `whsec_${randomBytes(32).toString("hex")}`
  const result = await pool.query(
    `INSERT INTO merchant_webhook_settings (merchant_email, endpoint_url, callback_url, events, signing_secret, enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     ON CONFLICT (merchant_email) DO UPDATE SET
       endpoint_url = EXCLUDED.endpoint_url, callback_url = EXCLUDED.callback_url, events = EXCLUDED.events,
       signing_secret = EXCLUDED.signing_secret, enabled = TRUE, updated_at = NOW()
     RETURNING endpoint_url AS "endpointUrl", callback_url AS "callbackUrl", events, enabled,
       updated_at AS "updatedAt"`,
    [req.merchantEmail, endpointUrl, callbackUrl, events, signingSecret],
  )
  return res
    .set("Cache-Control", "no-store")
    .json({ ...result.rows[0], signingSecret })
})

app.delete("/v1/webhook", async (req, res) => {
  await pool.query(
    "DELETE FROM merchant_webhook_settings WHERE merchant_email = $1",
    [req.merchantEmail],
  )
  return res.json({ deleted: true })
})

app.get("/v1/floating-balance/payout-account", async (req, res) => {
  const result = await pool.query(
    `SELECT bank_name AS "bankName", account_name AS "accountName", account_number AS "accountNumber"
     FROM merchant_payout_accounts WHERE merchant_email = $1`,
    [req.merchantEmail],
  )
  return res
    .set("Cache-Control", "no-store")
    .json(
      result.rows[0] || { bankName: "", accountName: "", accountNumber: "" },
    )
})

app.put("/v1/floating-balance/payout-account", async (req, res) => {
  const bankName =
    typeof req.body?.bankName === "string" ? req.body.bankName.trim() : ""
  const accountName =
    typeof req.body?.accountName === "string" ? req.body.accountName.trim() : ""
  const accountNumber =
    typeof req.body?.accountNumber === "string"
      ? req.body.accountNumber.replace(/\s+/g, "")
      : ""
  if (
    bankName.length < 2 ||
    bankName.length > 100 ||
    accountName.length < 2 ||
    accountName.length > 120 ||
    !/^[A-Za-z0-9-]{4,34}$/.test(accountNumber)
  ) {
    return res.status(400).json({
      error:
        "Enter a bank name, account holder name, and valid account number.",
    })
  }
  const result = await pool.query(
    `INSERT INTO merchant_payout_accounts (merchant_email, bank_name, account_name, account_number)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (merchant_email) DO NOTHING
     RETURNING bank_name AS "bankName", account_name AS "accountName", account_number AS "accountNumber"`,
    [req.merchantEmail, bankName, accountName, accountNumber],
  )
  if (!result.rowCount) {
    return res.status(409).json({
      error:
        "A payout account is already saved. Contact the DRPAY team to change it.",
    })
  }
  return res.set("Cache-Control", "no-store").json(result.rows[0])
})

app.get("/v1/floating-balance/transfer-requests", async (req, res) => {
  const result = await pool.query(
    `SELECT id, amount::float8 AS amount, transfer_fee::float8 AS "transferFee", status, bank_name AS "bankName",
       account_name AS "accountName", account_number AS "accountNumber",
       requested_at AS "requestedAt", reviewed_at AS "reviewedAt",
       failure_reason AS "failureReason", payout_reference AS "payoutReference",
       payout_note AS "payoutNote"
     FROM floating_transfer_requests WHERE merchant_email = $1
     ORDER BY requested_at DESC LIMIT 50`,
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post("/v1/floating-balance/transfer-requests", async (req, res) => {
  const submittedAmount = Number(req.body?.amount)
  const amount = Number.isFinite(submittedAmount)
    ? Math.round(submittedAmount * 100) / 100
    : Number.NaN
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.abs(submittedAmount - amount) > 1e-7 ||
    amount > 1_000_000_000
  ) {
    return res.status(400).json({
      error:
        "Enter a positive PHP amount with no more than two decimal places.",
    })
  }
  try {
    return res
      .status(201)
      .json(
        await createFloatingTransferRequest(pool, req.merchantEmail, amount),
      )
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ error: error.message })
    throw error
  }
})

app.get("/v1/security/status", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT pin_hash IS NOT NULL AS pin_configured FROM merchant_security WHERE email = $1",
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json({
    pinConfigured: rows[0]?.pin_configured === true,
  })
})

app.post("/v1/notifications/push-token", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : ""
  if (token.length < 32 || token.length > 4096)
    return res.status(400).json({ error: "A valid push token is required." })
  await pool.query(
    `INSERT INTO merchant_push_devices (token, merchant_email)
     VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE SET merchant_email = EXCLUDED.merchant_email, updated_at = NOW()`,
    [token, req.merchantEmail],
  )
  return res.json({ registered: true })
})

app.post("/v1/notifications/push-token/remove", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : ""
  if (token.length < 32 || token.length > 4096)
    return res.status(400).json({ error: "A valid push token is required." })
  await pool.query(
    "DELETE FROM merchant_push_devices WHERE token = $1 AND merchant_email = $2",
    [token, req.merchantEmail],
  )
  return res.json({ removed: true })
})

function validPaymentBranding(input) {
  const checkoutInstructions =
    typeof input?.checkoutInstructions === "string"
      ? input.checkoutInstructions.trim()
      : ""
  const emailSubject =
    typeof input?.emailSubject === "string" ? input.emailSubject.trim() : ""
  const emailMessage =
    typeof input?.emailMessage === "string" ? input.emailMessage.trim() : ""
  const emailBrandColor =
    typeof input?.emailBrandColor === "string"
      ? input.emailBrandColor.trim()
      : ""
  const emailLogoUrl =
    typeof input?.emailLogoUrl === "string" ? input.emailLogoUrl.trim() : ""
  let validLogoUrl = ""
  if (emailLogoUrl) {
    try {
      const url = new URL(emailLogoUrl)
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        emailLogoUrl.length > 2048
      ) {
        return null
      }
      validLogoUrl = url.toString()
    } catch {
      return null
    }
  }
  if (
    checkoutInstructions.length < 1 ||
    checkoutInstructions.length > 600 ||
    emailSubject.length < 1 ||
    emailSubject.length > 160 ||
    /[\r\n\u0000-\u001f\u007f]/.test(emailSubject) ||
    emailMessage.length < 1 ||
    emailMessage.length > 1000 ||
    !/^#[0-9A-Fa-f]{6}$/.test(emailBrandColor)
  ) {
    return null
  }
  return {
    checkoutInstructions,
    emailSubject,
    emailMessage,
    emailBrandColor,
    emailLogoUrl: validLogoUrl,
  }
}

app.get("/v1/checkout/preferences", async (req, res) => {
  const result = await pool.query(
    `SELECT checkout_instructions AS "checkoutInstructions",
       email_subject AS "emailSubject", email_message AS "emailMessage",
       email_brand_color AS "emailBrandColor", email_logo_url AS "emailLogoUrl"
     FROM merchant_checkout_preferences WHERE merchant_email = $1`,
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json(
    result.rows[0] || {
      checkoutInstructions: defaultCheckoutInstructions,
      emailSubject: defaultPaymentEmailSubject,
      emailMessage: defaultPaymentEmailMessage,
      emailBrandColor: defaultPaymentEmailColor,
      emailLogoUrl: "",
    },
  )
})

app.put("/v1/checkout/preferences", async (req, res) => {
  const branding = validPaymentBranding(req.body)
  if (!branding) {
    return res.status(400).json({
      error:
        "Check the checkout instructions, email subject and message, brand color, and secure logo URL.",
    })
  }
  const result = await pool.query(
    `INSERT INTO merchant_checkout_preferences
       (merchant_email, checkout_instructions, email_subject, email_message,
        email_brand_color, email_logo_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (merchant_email) DO UPDATE SET
       checkout_instructions = EXCLUDED.checkout_instructions,
       email_subject = EXCLUDED.email_subject,
       email_message = EXCLUDED.email_message,
       email_brand_color = EXCLUDED.email_brand_color,
       email_logo_url = EXCLUDED.email_logo_url,
       updated_at = NOW()
     RETURNING checkout_instructions AS "checkoutInstructions",
       email_subject AS "emailSubject", email_message AS "emailMessage",
       email_brand_color AS "emailBrandColor", email_logo_url AS "emailLogoUrl"`,
    [
      req.merchantEmail,
      branding.checkoutInstructions,
      branding.emailSubject,
      branding.emailMessage,
      branding.emailBrandColor,
      branding.emailLogoUrl,
    ],
  )
  return res.set("Cache-Control", "no-store").json(result.rows[0])
})

app.get("/v1/notifications/inbox", async (req, res) => {
  if (req.apiKey) return res.status(403).json({
      error: "Sign in to your merchant account to view notifications.",
    })
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
    50,
  )
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)
  const [notifications, unreadResult] = await Promise.all([
    pool.query(
      `SELECT n.id, n.transaction_type AS type, n.reference_no AS reference,
         n.amount::float8 AS amount, n.created_at AS "createdAt",
         n.read_at AS "readAt",
         CASE WHEN n.transaction_type = 'PAYMENT' THEN 'Payment received'
           ELSE 'Transfer completed' END AS title,
         COALESCE(NULLIF(p.title, ''), NULLIF(d.remarks, ''),
           CASE WHEN n.transaction_type = 'PAYMENT' THEN 'Merchant payment'
             ELSE 'Bank transfer' END) AS description
       FROM transaction_notifications n
       LEFT JOIN payment_links p
         ON n.transaction_type = 'PAYMENT' AND p.id = n.transaction_id
       LEFT JOIN disbursements d
         ON n.transaction_type = 'DISBURSEMENT' AND d.id = n.transaction_id
       WHERE n.merchant_email = $1
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $2 OFFSET $3`,
      [req.merchantEmail, limit + 1, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM transaction_notifications
       WHERE merchant_email = $1 AND read_at IS NULL`,
      [req.merchantEmail],
    ),
  ])
  const hasMore = notifications.rows.length > limit
  return res.set("Cache-Control", "no-store").json({
    notifications: notifications.rows.slice(0, limit),
    unreadCount: unreadResult.rows[0].count,
    hasMore,
  })
})

app.post("/v1/notifications/inbox/read-all", async (req, res) => {
  if (req.apiKey) return res.status(403).json({
      error: "Sign in to your merchant account to update notifications.",
    })
  const result = await pool.query(
    `UPDATE transaction_notifications SET read_at = NOW()
     WHERE merchant_email = $1 AND read_at IS NULL`,
    [req.merchantEmail],
  )
  const unread = await pool.query(
    `SELECT COUNT(*)::int AS count FROM transaction_notifications
     WHERE merchant_email = $1 AND read_at IS NULL`,
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json({
    updated: result.rowCount,
    unreadCount: unread.rows[0].count,
  })
})

app.post("/v1/notifications/inbox/:id/read", async (req, res) => {
  if (req.apiKey) return res.status(403).json({
      error: "Sign in to your merchant account to update notifications.",
    })
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      req.params.id,
    )
  )
    return res.status(400).json({ error: "Choose a valid notification." })
  const result = await pool.query(
    `UPDATE transaction_notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND merchant_email = $2
     RETURNING read_at AS "readAt"`,
    [req.params.id, req.merchantEmail],
  )
  if (!result.rows[0])
    return res.status(404).json({ error: "Notification not found." })
  return res.set("Cache-Control", "no-store").json(result.rows[0])
})

app.get("/v1/notifications/preferences", async (req, res) => {
  const result = await pool.query(
    `SELECT COALESCE(email_enabled, TRUE) AS "emailEnabled",
       COALESCE(push_enabled, TRUE) AS "pushEnabled",
       COALESCE(payments_enabled, TRUE) AS "paymentsEnabled",
       COALESCE(transfers_enabled, TRUE) AS "transfersEnabled"
     FROM merchant_notification_preferences WHERE merchant_email = $1`,
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json(
    result.rows[0] || {
      emailEnabled: true,
      pushEnabled: true,
      paymentsEnabled: true,
      transfersEnabled: true,
    },
  )
})

app.put("/v1/notifications/preferences", async (req, res) => {
  const { emailEnabled, pushEnabled, paymentsEnabled, transfersEnabled } =
    req.body || {}
  if (
    [emailEnabled, pushEnabled, paymentsEnabled, transfersEnabled].some(
      (value) => typeof value !== "boolean",
    )
  ) {
    return res.status(400).json({
      error: "Choose valid transaction notification preferences.",
    })
  }
  const result = await pool.query(
    `INSERT INTO merchant_notification_preferences
       (merchant_email, email_enabled, push_enabled, payments_enabled, transfers_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (merchant_email) DO UPDATE SET
       email_enabled = EXCLUDED.email_enabled,
       push_enabled = EXCLUDED.push_enabled,
       payments_enabled = EXCLUDED.payments_enabled,
       transfers_enabled = EXCLUDED.transfers_enabled, updated_at = NOW()
     RETURNING email_enabled AS "emailEnabled", push_enabled AS "pushEnabled",
       payments_enabled AS "paymentsEnabled", transfers_enabled AS "transfersEnabled"`,
    [
      req.merchantEmail,
      emailEnabled,
      pushEnabled,
      paymentsEnabled,
      transfersEnabled,
    ],
  )
  return res.set("Cache-Control", "no-store").json(result.rows[0])
})

app.post("/v1/security/biometric", async (req, res) => {
  const secret = typeof req.body?.secret === "string" ? req.body.secret : ""
  const deviceToken =
    typeof req.body?.deviceToken === "string" ? req.body.deviceToken : ""
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(secret) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(deviceToken)
  ) {
    return res
      .status(400)
      .json({ error: "Could not enable biometric sign-in on this device." })
  }
  const deviceHash = deviceTokenHash(deviceToken)
  const device = await pool.query(
    "SELECT 1 FROM merchant_devices WHERE email = $1 AND device_token_hash = $2",
    [req.merchantEmail, deviceHash],
  )
  if (!device.rowCount) return res.status(403).json({
      error: "Verify this device by email before enabling biometric sign-in.",
    })
  await pool.query(
    `INSERT INTO merchant_biometric_credentials (email, device_token_hash, secret_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email, device_token_hash)
     DO UPDATE SET secret_hash = EXCLUDED.secret_hash, created_at = NOW(), last_used_at = NOW()`,
    [req.merchantEmail, deviceHash, biometricSecretHash(secret)],
  )
  return res.set("Cache-Control", "no-store").json({ enabled: true })
})

app.post("/v1/security/biometric/remove", async (req, res) => {
  const deviceToken =
    typeof req.body?.deviceToken === "string" ? req.body.deviceToken : ""
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(deviceToken)) {
    return res
      .status(400)
      .json({ error: "Could not disable biometric sign-in on this device." })
  }
  await pool.query(
    "DELETE FROM merchant_biometric_credentials WHERE email = $1 AND device_token_hash = $2",
    [req.merchantEmail, deviceTokenHash(deviceToken)],
  )
  return res.set("Cache-Control", "no-store").json({ enabled: false })
})

app.post("/v1/security/pin", async (req, res) => {
  const pin = typeof req.body?.pin === "string" ? req.body.pin : ""
  if (!/^\d{4}$/.test(pin))
    return res
      .status(400)
      .json({ error: "MPIN must contain exactly four digits." })
  const salt = randomBytes(32).toString("hex")
  const hash = scryptSync(pin, salt, 64).toString("hex")
  await pool.query(
    "INSERT INTO merchant_security (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
    [req.merchantEmail],
  )
  const result = await pool.query(
    `UPDATE merchant_security SET pin_salt = $1, pin_hash = $2, updated_at = NOW()
     WHERE email = $3 AND pin_hash IS NULL RETURNING email`,
    [salt, hash, req.merchantEmail],
  )
  if (!result.rowCount)
    return res
      .status(409)
      .json({ error: "An MPIN is already configured for this account." })
  return res.set("Cache-Control", "no-store").json({ pinConfigured: true })
})

app.post("/v1/security/transfer/pin", pinAttemptLimiter, async (req, res) => {
  const pin = typeof req.body?.pin === "string" ? req.body.pin : ""
  const idempotencyKey =
    typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : ""
  if (!/^\d{4}$/.test(pin) || !validIdempotencyKey(idempotencyKey)) {
    return res
      .status(400)
      .json({ error: "Enter your four-digit MPIN to authorize this transfer." })
  }
  const { rows } = await pool.query(
    "SELECT pin_salt, pin_hash FROM merchant_security WHERE email = $1",
    [req.merchantEmail],
  )
  const security = rows[0]
  if (!security?.pin_hash) {
    return res
      .status(403)
      .json({ error: "Set up an MPIN before transferring." })
  }
  await pool.query(
    "DELETE FROM merchant_pin_attempts WHERE created_at <= NOW() - INTERVAL '1 day'",
  )
  const attempts = await pool.query(
    "SELECT COUNT(*)::int AS count FROM merchant_pin_attempts WHERE merchant_email = $1 AND created_at > NOW() - INTERVAL '15 minutes'",
    [req.merchantEmail],
  )
  if (attempts.rows[0].count >= 5) {
    return res.status(429).json({
      error: "Too many incorrect MPIN attempts. Try again in 15 minutes.",
    })
  }
  if (!matchesPasswordHash(pin, security.pin_salt, security.pin_hash)) {
    await pool.query(
      "INSERT INTO merchant_pin_attempts (merchant_email) VALUES ($1)",
      [req.merchantEmail],
    )
    return res.status(403).json({ error: "The MPIN is incorrect." })
  }
  await pool.query(
    "DELETE FROM merchant_pin_attempts WHERE merchant_email = $1",
    [req.merchantEmail],
  )
  const fingerprint = transferSecurityFingerprint(
    req.merchantEmail,
    req.body,
    idempotencyKey,
  )
  const jti = randomUUID()
  const stepUpToken = await new SignJWT({
    purpose: "transfer_step_up",
    fingerprint,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(req.merchantEmail)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(jwtSecret)
  return res.set("Cache-Control", "no-store").json({ stepUpToken })
})

app.get("/v1/internal-wallet", async (req, res) => {
  const [result, feeSetting] = await Promise.all([
    pool.query(
      `WITH wallet AS (
       SELECT COALESCE(SUM(amount), 0)::numeric AS balance
       FROM internal_wallet_adjustments
      WHERE merchant_email = $1 AND adjusted_by NOT LIKE 'system:%'
     )
     SELECT wallet.balance::float8 AS balance,
       COALESCE((SELECT SUM(amount + transfer_fee) FROM floating_transfer_requests WHERE merchant_email = $1 AND status = 'PENDING'), 0)::float8 AS reserved
     FROM wallet`,
      [req.merchantEmail],
    ),
    pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'transfer_fee_fixed'",
    ),
  ])
  const balance = result.rows[0].balance
  const transferFeeFixed = Number(feeSetting.rows[0]?.setting_value || 0)
  if (
    !Number.isFinite(transferFeeFixed) ||
    transferFeeFixed < 0 ||
    Math.abs(transferFeeFixed * 100 - Math.round(transferFeeFixed * 100)) > 1e-7
  ) {
    return res
      .status(503)
      .json({ error: "The configured transfer fee is invalid." })
  }
  return res.set("Cache-Control", "no-store").json({
    currency: "PHP",
    balance,
    availableBalance: balance - result.rows[0].reserved,
    transferFeeFixed,
    label: "Floated Amount",
  })
})

app.get("/v1/wallet/activity/trend", async (req, res) => {
  try {
    const result = await pool.query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
       ), activity AS (
         SELECT created_at::date AS day, amount, source_type AS activity_type
         FROM merchant_wallet_ledger
         WHERE merchant_email = $1
           AND created_at >= CURRENT_DATE - INTERVAL '6 days'
           AND created_at < CURRENT_DATE + INTERVAL '1 day'
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
         COALESCE(SUM(activity.amount) FILTER (WHERE activity.activity_type = 'COLLECTION'), 0)::float8 AS collections,
         COALESCE(SUM(ABS(activity.amount)) FILTER (WHERE activity.activity_type = 'DISBURSEMENT'), 0)::float8 AS transfers
       FROM days
       LEFT JOIN activity ON activity.day = days.day
       GROUP BY days.day
       ORDER BY days.day ASC`,
      [req.merchantEmail],
    )
    return res.set("Cache-Control", "no-store").json(result.rows)
  } catch (error) {
    console.error("Merchant activity trend lookup failed", error.message)
    return res
      .status(503)
      .json({ error: "The live activity chart is temporarily unavailable." })
  }
})

app.get("/v1/exchange-rates/krw-php", async (_req, res) => {
  const result = await pool.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'krw_to_php_rate'",
  )
  const configuredRate = result.rows[0]?.setting_value
  if (configuredRate !== undefined) {
    const rate = Number(configuredRate)
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(503).json({
        error: "The configured KRW/PHP exchange-rate override is invalid.",
      })
    }
    return res.json({
      baseCurrency: "KRW",
      quoteCurrency: "PHP",
      rate,
      date: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
      source: "DRPAY configured rate",
    })
  }

  if (
    liveKrwPhpRateCache &&
    Date.now() - liveKrwPhpRateCache.fetchedAt < 60 * 60 * 1000
  ) {
    return res.json(liveKrwPhpRateCache.quote)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/KRW", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
    if (!response.ok)
      throw new Error(`Exchange-rate service returned ${response.status}.`)
    const data = await response.json()
    const rate = Number(data?.rates?.PHP)
    const updatedAt =
      typeof data?.time_last_update_utc === "string"
        ? new Date(data.time_last_update_utc)
        : null
    if (
      data?.result !== "success" ||
      data?.base_code !== "KRW" ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      !updatedAt ||
      Number.isNaN(updatedAt.getTime())
    ) {
      throw new Error("Exchange-rate service returned invalid KRW/PHP data.")
    }
    const quote = {
      baseCurrency: "KRW",
      quoteCurrency: "PHP",
      rate,
      date: updatedAt.toISOString().slice(0, 10),
      updatedAt: updatedAt.toISOString(),
      source: "ExchangeRate-API reference rate",
    }
    liveKrwPhpRateCache = { quote, fetchedAt: Date.now() }
    return res.json(quote)
  } catch (error) {
    console.error(
      "KRW/PHP live exchange-rate lookup failed",
      error.name === "AbortError" ? "timeout" : error.message,
    )
    return res.status(503).json({
      error: "The live KRW/PHP reference rate is temporarily unavailable.",
    })
  } finally {
    clearTimeout(timeout)
  }
})

app.get("/v1/wallet/balance", async (req, res) => {
  try {
    const wallet = await getMerchantWalletState(pool, req.merchantEmail)
    const balance = Number(wallet.balance)
    const reservedBalance = Number(wallet.reserved)
    const availableBalance = balance - reservedBalance
    const completedKrw = Number(wallet.completed_krw)
    const collectionCredits = Number(wallet.collection_credits)
    const cumulativeKrwCollections =
      collectionCredits > 0
        ? completedKrw *
          Math.min(1, Math.max(0, availableBalance / collectionCredits))
        : 0
    return res.set("Cache-Control", "no-store").json({
      balance,
      availableBalance,
      reservedBalance,
      walletMode: "pooled",
      paymentEnvironment: swiftPayEnvironment,
      cumulativeKrwCollections,
    })
  } catch (error) {
    console.error(
      "Merchant wallet ledger lookup failed",
      error.code || error.message,
    )
    return res
      .status(503)
      .json({ error: "Merchant wallet is temporarily unavailable." })
  }
})

app.get("/v1/disbursement-institutions", async (req, res) => {
  const channel = req.query.channel
  if (channel && !["INSTAPAY", "PESONET"].includes(channel))
    return res.status(400).json({ error: "Unsupported transfer rail." })
  const cacheKey = channel || "all"
  const cached = institutionCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.items)
  try {
    const query = channel ? `?channel=${encodeURIComponent(channel)}` : ""
    const { data } = await swiftPayRequest(
      `/disbursements/institutions${query}`,
    )
    if (!Array.isArray(data))
      throw new Error(
        "SwiftPay returned an invalid disbursement institution list.",
      )
    const items = data.map((institution) => ({
      ...institution,
      logoUrl: getInstitutionLogoUrl(institution),
    }))
    institutionCache.set(cacheKey, {
      items,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    })
    return res.json(items)
  } catch (error) {
    console.error("Institution lookup failed", error.status || "network error")
    return res
      .status(503)
      .json({ error: "Transfer institutions are temporarily unavailable." })
  }
})

function getSafePaymentInstitutionDeepLink(value) {
  if (typeof value !== "string" || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (url.username || url.password) return null
    if (url.protocol === "https:") return url.hostname ? url.toString() : null
    if (
      !/^[a-z][a-z0-9+.-]*:$/.test(url.protocol) ||
      [
        "http:",
        "javascript:",
        "data:",
        "file:",
        "blob:",
        "intent:",
        "ftp:",
      ].includes(url.protocol) ||
      !url.hostname
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

app.get("/v1/payment-institutions", async (_req, res) => {
  if (
    paymentInstitutionCache &&
    paymentInstitutionCache.expiresAt > Date.now()
  ) {
    return res.json(paymentInstitutionCache.items)
  }
  try {
    const { data } = await swiftPayFetch("/institutions")
    if (!Array.isArray(data))
      throw new Error("SwiftPay returned an invalid payment institution list.")
    const items = data
      .filter(
        (item) =>
          item?.enabled === true &&
          (swiftPayEnvironment !== "production" || item.live === true) &&
          ![
            "PALAWAN",
            "JCB_MAYA",
            "VISA_MAYA",
            "MASTERCARD_MAYA",
            "BILLEASE",
            "CARD_MAYA",
          ].includes(item.code),
      )
      .map((institution) => ({
        code: institution.code,
        name: institution.name,
        category: institution.category,
        logoUrl: getInstitutionLogoUrl(institution),
        deepLink: getSafePaymentInstitutionDeepLink(
          institution.deepLink ??
            institution.deeplink ??
            institution.deep_link ??
            institution.appDeepLink ??
            institution.app_deep_link ??
            institution.appLink ??
            institution.app_link,
        ),
      }))
    paymentInstitutionCache = { items, expiresAt: Date.now() + 60 * 60 * 1000 }
    return res.json(items)
  } catch (error) {
    console.error(
      "Payment institution lookup failed",
      error.status || error.message || "unexpected error",
    )
    return res
      .status(503)
      .json({ error: "Payment institutions are temporarily unavailable." })
  }
})

async function reconcilePending() {
  if (reconcilingPending) return
  reconcilingPending = true
  try {
    const [links, transfers] = await Promise.all([
      pool.query(
        "SELECT id, code, payment_token FROM payment_links WHERE status IN ('CREATING', 'ACTIVE', 'PENDING') AND code IS NOT NULL ORDER BY created_at DESC LIMIT 50",
      ),
      pool.query(
        "SELECT id, swiftpay_id, merchant_reference_no FROM disbursements WHERE status IN ('REQUESTING', 'PENDING', 'OUTCOME_UNKNOWN') ORDER BY created_at DESC LIMIT 50",
      ),
    ])
    await Promise.allSettled([
      ...links.rows.map(async (row) => {
        let status
        if (row.payment_token) {
          const { data } = await swiftPayPaymentRequest(
            "/payments/status",
            row.payment_token,
          )
          status = paymentStatusFromResponse(data)
        } else {
          const { data } = await swiftPayRequest(
            `/payments/links/${encodeURIComponent(row.code)}`,
          )
          status = data.linkStatus || "ACTIVE"
        }
        await updatePaymentLinkStatus(row.id, status)
      }),
      ...transfers.rows.map(async (row) => {
        let data
        if (row.swiftpay_id) {
          ;({ data } = await swiftPayRequest(
            `/disbursements/${encodeURIComponent(row.swiftpay_id)}`,
          ))
        } else {
          const query = new URLSearchParams({
            merchantReferenceNo: row.merchant_reference_no,
            pageSize: "1",
          })
          const result = await swiftPayRequest(`/disbursements?${query}`)
          data = result.data?.result?.find(
            (item) => item.merchantReferenceNo === row.merchant_reference_no,
          )
          if (!data) return
        }
        await updateDisbursementStatus(
          row.id,
          data.id,
          data.status,
          data.errorMessage || null,
        )
      }),
    ])
    await dispatchTransactionNotifications()
    await dispatchCustomerPaymentRequests()
    await dispatchCustomerPaymentNotifications()
    await dispatchMerchantWebhooks()
  } finally {
    reconcilingPending = false
  }
}

function startNotificationWorker() {
  if (!fcmConfigured()) {
    console.warn(
      "Firebase push delivery is disabled until FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_EMAIL, and FCM_SERVICE_ACCOUNT_PRIVATE_KEY are configured.",
    )
  }
  const timer = setInterval(() => {
    void reconcilePending().catch((error) => {
      console.error(
        "Transaction notification worker cycle failed",
        error.status || error.message || "unexpected error",
      )
    })
  }, 30_000)
  timer.unref()
  const kybCleanupTimer = setInterval(() => {
    void cleanExpiredKybUploads().catch((error) => {
      console.error(
        "Private KYB upload cleanup failed",
        error.name || "storage error",
      )
    })
  }, 5 * 60_000)
  kybCleanupTimer.unref()
  const taxInvoiceCleanupTimer = setInterval(() => {
    void cleanExpiredTaxInvoiceUploads().catch((error) => {
      console.error(
        "Tax invoice attachment cleanup failed",
        error.name || "storage error",
      )
    })
  }, 5 * 60_000)
  taxInvoiceCleanupTimer.unref()
}

async function getRefundTransferDetails(paymentId, merchantEmail) {
  const paymentResult = await pool.query(
    `SELECT id, reference_no, amount::float8 AS amount, status, payment_token
     FROM payment_links WHERE id = $1 AND merchant_email = $2`,
    [paymentId, merchantEmail],
  )
  const payment = paymentResult.rows[0]
  if (!payment) {
    const error = new Error("This collection was not found.")
    error.status = 404
    throw error
  }
  if (payment.status !== "EXECUTED" || !payment.payment_token) {
    const error = new Error(
      "Only completed SwiftPay collections can be refunded.",
    )
    error.status = 409
    throw error
  }
  if (payment.amount > maxTransferAmount) {
    const error = new Error(
      "This collection is above the configured transfer limit for an automatic refund.",
    )
    error.status = 409
    throw error
  }
  const settlement = await pool.query(
    "SELECT 1 FROM platform_fee_ledger WHERE source_type = 'COLLECTION' AND source_id = $1",
    [paymentId],
  )
  if (!settlement.rowCount) {
    const error = new Error(
      "Collection settlement is still being finalized. Refresh Wallet activity and try again.",
    )
    error.status = 409
    throw error
  }

  const previousRefund = await pool.query(
    `SELECT status FROM disbursements WHERE refund_payment_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [paymentId],
  )
  const previousStatus = previousRefund.rows[0]?.status
  if (
    previousStatus &&
    !["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(
      previousStatus.toUpperCase(),
    )
  ) {
    const error = new Error(
      "A refund transfer for this collection is already in progress or complete.",
    )
    error.status = 409
    throw error
  }

  const { data } = await swiftPayPaymentRequest(
    "/payments",
    payment.payment_token,
  )
  if (
    data?.paymentStatus !== "EXECUTED" ||
    Math.round(Number(data.amount) * 100) !== Math.round(payment.amount * 100)
  ) {
    const error = new Error(
      "SwiftPay could not confirm this collection as eligible for a full refund.",
    )
    error.status = 409
    throw error
  }
  const accountNumber =
    typeof data.bankAccountNo === "string"
      ? data.bankAccountNo.replace(/\s/g, "")
      : ""
  const fullName =
    typeof data.payerName === "string" ? data.payerName.trim() : ""
  const institutionCode =
    typeof data.institutionCode === "string" ? data.institutionCode.trim() : ""
  if (
    !/^[0-9]{5,64}$/.test(accountNumber) ||
    !fullName ||
    fullName.length > 128 ||
    !institutionCode ||
    institutionCode.length > 16
  ) {
    const error = new Error(
      "SwiftPay did not provide valid payer bank details for this refund.",
    )
    error.status = 409
    throw error
  }

  let channel = ""
  for (const candidate of ["INSTAPAY", "PESONET"]) {
    if (candidate === "INSTAPAY" && payment.amount > maxInstapayAmount) continue
    let cached = institutionCache.get(candidate)
    if (!cached || cached.expiresAt <= Date.now()) {
      const result = await swiftPayRequest(
        `/disbursements/institutions?channel=${candidate}`,
      )
      if (!Array.isArray(result.data))
        throw new Error(
          "SwiftPay returned an invalid transfer-institution list.",
        )
      cached = {
        items: result.data,
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      }
      institutionCache.set(candidate, cached)
    }
    if (cached.items.some((item) => item.code === institutionCode)) {
      channel = candidate
      break
    }
  }
  if (!channel) {
    const error = new Error(
      "The payer’s institution is not available for an automatic refund transfer.",
    )
    error.status = 409
    throw error
  }

  return {
    amount: payment.amount,
    channel,
    institutionCode,
    accountNumber,
    fullName,
    remarks: `Refund ${payment.reference_no}`.slice(0, 80),
  }
}

app.get("/v1/payment-links/:id/refund-details", async (req, res) => {
  try {
    const details = await getRefundTransferDetails(
      req.params.id,
      req.merchantEmail,
    )
    return res.set("Cache-Control", "no-store").json(details)
  } catch (error) {
    console.error(
      "Collection refund eligibility lookup failed",
      error.status || "provider error",
    )
    return res.status(error.status || 503).json({
      error: error.status
        ? error.message
        : "Refund details are temporarily unavailable.",
    })
  }
})

app.get("/v1/wallet/activity", async (req, res) => {
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
    100,
  )
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)
  const fromDate = typeof req.query.from === "string" ? req.query.from : null
  const toDate = typeof req.query.to === "string" ? req.query.to : null
  const isValidDate = (value) =>
    value === null ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value)
  if (
    !isValidDate(fromDate) ||
    !isValidDate(toDate) ||
    (fromDate && toDate && fromDate > toDate)
  ) {
    return res.status(400).json({
      error: "Choose a valid activity date range.",
    })
  }
  try {
    if (offset === 0) await reconcilePending()
    const { rows } = await pool.query(
      `
      SELECT p.id::text, p.reference_no AS "referenceNo",
        p.payment_institution_code AS "institutionCode", p.title AS description,
        p.payment_institution_name AS "institutionName", p.payment_institution_logo_url AS "institutionLogoUrl",
        NULL::text AS "recipientName", NULL::text AS "recipientAccountNumber",
        NULL::text AS remarks, FALSE AS "isRefund",
        CASE WHEN p.payment_token IS NULL THEN 'Payment link' ELSE 'QR Ph checkout' END AS channel,
        p.status, p.amount::float8 AS amount, wallet.amount::float8 AS "walletAmount",
        p.created_at AS "createdAt", 'PAYMENT_LINK' AS "transactionType",
        (p.status = 'EXECUTED' AND p.payment_token IS NOT NULL AND p.amount <= $4
          AND EXISTS (SELECT 1 FROM platform_fee_ledger f WHERE f.source_type = 'COLLECTION' AND f.source_id = p.id)
          AND (refund.status IS NULL OR refund.status IN ('REJECTED', 'ERROR', 'FAILED', 'CANCELED', 'CANCELLED'))) AS "canRefund",
        refund.status AS "refundStatus"
      FROM payment_links p
      LEFT JOIN merchant_wallet_ledger wallet
        ON wallet.source_type = 'COLLECTION' AND wallet.source_id = p.id AND wallet.merchant_email = p.merchant_email
      LEFT JOIN LATERAL (
        SELECT d.status FROM disbursements d
        WHERE d.refund_payment_id = p.id
        ORDER BY d.created_at DESC LIMIT 1
      ) refund ON TRUE
      WHERE p.merchant_email = $3
        AND p.created_at >= (SELECT created_at FROM merchant_accounts WHERE email = $3)
        AND ($5::date IS NULL OR p.created_at >= $5::date)
        AND ($6::date IS NULL OR p.created_at < $6::date + INTERVAL '1 day')
      UNION ALL
      SELECT d.id::text, d.merchant_reference_no AS "referenceNo", d.institution_code AS "institutionCode",
        CASE WHEN d.refund_payment_id IS NOT NULL THEN 'Refund of collection ' || p.reference_no ELSE d.institution_code END AS description,
        NULL::text AS "institutionName", NULL::text AS "institutionLogoUrl",
        d.recipient_name AS "recipientName", d.recipient_account_number AS "recipientAccountNumber",
        d.remarks, (d.refund_payment_id IS NOT NULL) AS "isRefund",
        d.channel, d.status, -d.amount::float8 AS amount, wallet.amount::float8 AS "walletAmount",
        d.created_at AS "createdAt", 'DISBURSEMENT' AS "transactionType",
        FALSE AS "canRefund", NULL::text AS "refundStatus"
      FROM disbursements d
      LEFT JOIN merchant_wallet_ledger wallet
        ON wallet.source_type = 'DISBURSEMENT' AND wallet.source_id = d.id AND wallet.merchant_email = d.merchant_email
      LEFT JOIN payment_links p ON p.id = d.refund_payment_id
      WHERE d.merchant_email = $3
        AND d.created_at >= (SELECT created_at FROM merchant_accounts WHERE email = $3)
        AND ($5::date IS NULL OR d.created_at >= $5::date)
        AND ($6::date IS NULL OR d.created_at < $6::date + INTERVAL '1 day')
      ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2
    `,
      [limit, offset, req.merchantEmail, maxTransferAmount, fromDate, toDate],
    )
    let institutions = institutionCache.get("all")?.items
    if (!institutions || institutionCache.get("all").expiresAt <= Date.now()) {
      try {
        const { data } = await swiftPayRequest("/disbursements/institutions")
        if (!Array.isArray(data))
          throw new Error(
            "SwiftPay returned an invalid disbursement institution list.",
          )
        institutions = data
        institutionCache.set("all", {
          items: data,
          expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        })
      } catch (error) {
        console.error(
          "Wallet activity institution logos unavailable",
          error.status || "network error",
        )
        institutions = []
      }
    }
    const institutionsByCode = new Map(
      institutions.map((item) => [
        String(item.code || "")
          .trim()
          .toUpperCase(),
        item,
      ]),
    )
    const enrichedRows = rows.map((row) => {
      if (row.transactionType !== "DISBURSEMENT") return row
      const institution = institutionsByCode.get(
        String(row.institutionCode || "")
          .trim()
          .toUpperCase(),
      )
      return institution
        ? {
            ...row,
            institutionName:
              typeof institution.name === "string" ? institution.name : null,
            institutionLogoUrl: getInstitutionLogoUrl(institution),
          }
        : row
    })
    return res.json(enrichedRows)
  } catch (error) {
    console.error(
      "Wallet activity lookup failed",
      error.status || "database error",
    )
    return res
      .status(503)
      .json({ error: "Wallet activity is temporarily unavailable." })
  }
})

function validIdempotencyKey(value) {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 100 &&
    /^[a-zA-Z0-9._:-]+$/.test(value)
  )
}

app.post("/v1/payment-links", paymentLinkLimiter, async (req, res) => {
  const submittedAmount = Number(req.body?.amount)
  const amount = Number.isFinite(submittedAmount)
    ? Math.round(submittedAmount * 100) / 100
    : Number.NaN
  const submittedKrwAmount = req.body?.collectionAmountKrw
  const collectionAmountKrw =
    submittedKrwAmount === undefined ? null : Number(submittedKrwAmount)
  const title =
    typeof req.body?.description === "string"
      ? req.body.description.trim().slice(0, 100)
      : ""
  const customerEmail =
    typeof req.body?.customerEmail === "string"
      ? req.body.customerEmail.trim().toLowerCase()
      : ""
  const institutionCode =
    typeof req.body?.institutionCode === "string"
      ? req.body.institutionCode.trim().toUpperCase()
      : ""
  const institutionName =
    typeof req.body?.institutionName === "string"
      ? req.body.institutionName.trim()
      : ""
  const submittedLogoUrl = req.body?.institutionLogoUrl
  const hasInstitution = [
    req.body?.institutionCode,
    req.body?.institutionName,
    submittedLogoUrl,
    req.body?.institutionDeepLink,
  ].some((value) => value != null && value !== "")
  const institutionLogoUrl =
    submittedLogoUrl == null || submittedLogoUrl === ""
      ? null
      : getInstitutionLogoUrl({ logoUrl: submittedLogoUrl })
  const submittedInstitutionDeepLink = getSafePaymentInstitutionDeepLink(
    req.body?.institutionDeepLink,
  )
  const listedInstitution = paymentInstitutionCache?.items.find(
    (institution) => institution.code === institutionCode,
  )
  const institutionDeepLink =
    paymentInstitutionCache?.expiresAt > Date.now() &&
    submittedInstitutionDeepLink &&
    submittedInstitutionDeepLink === listedInstitution?.deepLink
      ? submittedInstitutionDeepLink
      : null
  const idempotencyKey = req.get("Idempotency-Key")
  if (!validIdempotencyKey(idempotencyKey))
    return res
      .status(400)
      .json({ error: "A valid Idempotency-Key header is required." })
  if (
    !Number.isFinite(amount) ||
    Math.abs(submittedAmount - amount) > 1e-7 ||
    amount <= 0 ||
    amount > 1_000_000 ||
    !title
  )
    return res.status(400).json({
      error:
        "Enter a description and a valid PHP amount with no more than two decimal places.",
    })
  if (
    submittedKrwAmount !== undefined &&
    (!Number.isSafeInteger(collectionAmountKrw) || collectionAmountKrw <= 0)
  ) {
    return res
      .status(400)
      .json({ error: "Enter a valid whole-number KRW collection amount." })
  }
  if (
    customerEmail &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
      customerEmail.length > 254)
  ) {
    return res
      .status(400)
      .json({ error: "Enter a valid customer email address." })
  }
  const savedBranding = await pool.query(
    `SELECT checkout_instructions AS "checkoutInstructions",
       email_subject AS "emailSubject", email_message AS "emailMessage",
       email_brand_color AS "emailBrandColor", email_logo_url AS "emailLogoUrl"
     FROM merchant_checkout_preferences WHERE merchant_email = $1`,
    [req.merchantEmail],
  )
  const merchantBranding = savedBranding.rows[0] || {
    checkoutInstructions: defaultCheckoutInstructions,
    emailSubject: defaultPaymentEmailSubject,
    emailMessage: defaultPaymentEmailMessage,
    emailBrandColor: defaultPaymentEmailColor,
    emailLogoUrl: "",
  }
  const branding = validPaymentBranding({
    ...merchantBranding,
    checkoutInstructions:
      req.body?.checkoutInstructions ?? merchantBranding.checkoutInstructions,
    emailSubject: req.body?.emailSubject ?? merchantBranding.emailSubject,
    emailMessage: req.body?.emailMessage ?? merchantBranding.emailMessage,
    emailBrandColor:
      req.body?.emailBrandColor ?? merchantBranding.emailBrandColor,
    emailLogoUrl: req.body?.emailLogoUrl ?? merchantBranding.emailLogoUrl,
  })
  if (!branding) {
    return res.status(400).json({
      error:
        "Check the checkout instructions, email subject and message, brand color, and secure logo URL.",
    })
  }
  if (
    hasInstitution &&
    (!/^[A-Z0-9_-]{1,64}$/.test(institutionCode) ||
      !institutionName ||
      institutionName.length > 120 ||
      (submittedLogoUrl != null &&
        submittedLogoUrl !== "" &&
        !institutionLogoUrl))
  )
    return res
      .status(400)
      .json({ error: "The selected payment institution is invalid." })

  const existing = await pool.query(
    "SELECT * FROM payment_links WHERE idempotency_key = $1 AND merchant_email = $2",
    [idempotencyKey, req.merchantEmail],
  )
  if (existing.rowCount) {
    const row = existing.rows[0]
    let qrPayload = row.qr_payload
    if (row.payment_token && !qrPayload) {
      try {
        const { data } = await swiftPayPaymentRequest(
          "/payments/transfers/instruction",
          row.payment_token,
        )
        if (typeof data?.qrCode !== "string" || !data.qrCode)
          throw new Error("SwiftPay returned no QR payload.")
        qrPayload = data.qrCode
        await pool.query(
          "UPDATE payment_links SET qr_payload = $1 WHERE id = $2",
          [qrPayload, row.id],
        )
      } catch (error) {
        console.error(
          "SwiftPay QR payload lookup failed",
          error.status || "network error",
        )
        return res
          .status(503)
          .json({ error: "The payment QR is temporarily unavailable." })
      }
    }
    if (row.payment_url) {
      let requestEmailStatus = "no_customer_email"
      try {
        requestEmailStatus = await queueCustomerPaymentRequest(row.id)
      } catch (error) {
        requestEmailStatus = "queue_failed"
        console.error("Customer payment request could not be queued", {
          error: error.code || "database error",
        })
      }
      return res.json({
        id: row.id,
        code: row.code,
        paymentUrl: row.payment_token
          ? buildCheckoutUrl(row.code)
          : row.payment_url,
        qrCode: qrPayload,
        qrImageUrl: row.payment_token
          ? new URL(
              `/v1/public/checkout/${row.code}/qr.png`,
              publicApiOrigin,
            ).toString()
          : undefined,
        status: row.status,
        amount: Number(row.amount),
        currency: row.currency,
        requestEmailStatus,
      })
    }
    return res.status(409).json({
      error:
        "The checkout outcome is unknown. Check wallet activity before retrying.",
    })
  }

  const id = randomUUID()
  const referenceNo = `DRP-${randomUUID()}`
  const code = randomBytes(32).toString("base64url")
  try {
    await pool.query(
      `INSERT INTO payment_links (
      id, idempotency_key, reference_no, code, title, amount, collection_amount_krw,
      payment_institution_code, payment_institution_name, payment_institution_logo_url,
      payment_institution_deep_link, checkout_instructions, email_subject,
      email_message, email_brand_color, email_logo_url,
      checkout_type, status, merchant_email, customer_email
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'DIRECT_QRPH', 'CREATING', $17, $18)`,
      [
        id,
        idempotencyKey,
        referenceNo,
        code,
        title,
        amount,
        collectionAmountKrw,
        institutionCode || null,
        institutionName || null,
        institutionLogoUrl,
        institutionDeepLink,
        branding.checkoutInstructions,
        branding.emailSubject,
        branding.emailMessage,
        branding.emailBrandColor,
        branding.emailLogoUrl,
        req.merchantEmail,
        customerEmail || null,
      ],
    )
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({
        error:
          "The checkout outcome is unknown. Check wallet activity before retrying.",
      })
    throw error
  }

  try {
    const { data } = await swiftPaySignedRequest("/bootstrap/qrph?type=P2M", {
      x_access_key: swiftPayAccessKey,
      x_amount: amount.toFixed(2),
      x_currency: "PHP",
      x_reference_no: referenceNo,
      reject_qrph_duplicated_payments: true,
    })
    if (
      typeof data?.paymentId !== "string" ||
      !data.paymentId ||
      typeof data.qrCode !== "string" ||
      !data.qrCode
    ) {
      throw new Error("SwiftPay returned an incomplete QR payment.")
    }
    const status = data.paymentStatus || "PENDING"
    if (!validPaymentStatus(status))
      throw new Error("SwiftPay returned an invalid initial payment status.")
    const checkoutUrl = buildCheckoutUrl(code)
    const actualAmount = Number(data.amount ?? amount)
    if (!Number.isFinite(actualAmount) || actualAmount <= 0)
      throw new Error("SwiftPay returned an invalid payment amount.")
    await pool.query(
      "UPDATE payment_links SET payment_token = $1, qr_payload = $2, payment_url = $3, status = $4, amount = $5, updated_at = NOW() WHERE id = $6",
      [data.paymentId, data.qrCode, checkoutUrl, status, actualAmount, id],
    )
    let requestEmailStatus = "no_customer_email"
    try {
      requestEmailStatus = await queueCustomerPaymentRequest(id)
    } catch (error) {
      requestEmailStatus = "queue_failed"
      console.error("Customer payment request could not be queued", {
        error: error.code || "database error",
      })
    }
    if (status === "EXECUTED") await settleSuccessfulCollection(id)
    await queueSuccessfulTransaction("PAYMENT", id)
    await queueTransactionWebhook("PAYMENT", id)
    const qrImageUrl = new URL(
      `/v1/public/checkout/${code}/qr.png`,
      publicApiOrigin,
    ).toString()
    return res.status(201).json({
      id,
      code,
      paymentUrl: checkoutUrl,
      qrCode: data.qrCode,
      qrImageUrl,
      status,
      amount: actualAmount,
      currency: "PHP",
      requestEmailStatus,
    })
  } catch (error) {
    const isAmbiguous = !error.status || error.status >= 500
    await updatePaymentLinkStatus(
      id,
      isAmbiguous ? "OUTCOME_UNKNOWN" : "FAILED",
    )
    console.error(
      "SwiftPay QR checkout creation failed",
      error.status || "network error",
    )
    return res.status(isAmbiguous ? 503 : 502).json({
      error: isAmbiguous
        ? "The checkout outcome is unknown. Check wallet activity before retrying."
        : "SwiftPay could not create the QR checkout.",
    })
  }
})

app.get("/v1/payment-links/:code", async (req, res) => {
  const record = await pool.query(
    "SELECT * FROM payment_links WHERE code = $1 AND merchant_email = $2",
    [req.params.code, req.merchantEmail],
  )
  if (!record.rowCount)
    return res.status(404).json({ error: "Payment link not found." })
  if (record.rows[0].status === "MANUALLY_PAID") {
    return res.set("Cache-Control", "no-store").json({
      code: record.rows[0].code,
      paymentUrl: buildCheckoutUrl(record.rows[0].code),
      status: "MANUALLY_PAID",
      amount: Number(record.rows[0].amount),
      currency: record.rows[0].currency,
      referenceNo: record.rows[0].reference_no,
    })
  }
  try {
    if (record.rows[0].payment_token) {
      const { data } = await swiftPayPaymentRequest(
        "/payments/status",
        record.rows[0].payment_token,
      )
      const status = paymentStatusFromResponse(data)
      await updatePaymentLinkStatus(record.rows[0].id, status)
      return res.json({
        code: record.rows[0].code,
        paymentUrl: buildCheckoutUrl(record.rows[0].code),
        status,
        amount: Number(record.rows[0].amount),
        currency: record.rows[0].currency,
        referenceNo: record.rows[0].reference_no,
      })
    }
    const { data } = await swiftPayRequest(
      `/payments/links/${encodeURIComponent(req.params.code)}`,
    )
    const status = data.linkStatus || record.rows[0].status
    await updatePaymentLinkStatus(record.rows[0].id, status)
    return res.json({
      code: data.code,
      paymentUrl: data.paymentUrl,
      status,
      amount: Number(data.amount),
      currency: data.currency,
      referenceNo: data.referenceNo,
    })
  } catch (error) {
    console.error(
      "Payment-link status lookup failed",
      error.status || "network error",
    )
    return res
      .status(503)
      .json({ error: "Payment status is temporarily unavailable." })
  }
})

app.post("/v1/disbursements", transferLimiter, async (req, res) => {
  const submittedAmount = Number(req.body?.amount)
  const amount = Number.isFinite(submittedAmount)
    ? Math.round(submittedAmount * 100) / 100
    : Number.NaN
  const channel = req.body?.channel
  const institutionCode =
    typeof req.body?.institutionCode === "string"
      ? req.body.institutionCode.trim()
      : ""
  const accountNumber =
    typeof req.body?.accountNumber === "string"
      ? req.body.accountNumber.replace(/\s/g, "")
      : ""
  const fullName =
    typeof req.body?.fullName === "string" ? req.body.fullName.trim() : ""
  const remarks =
    typeof req.body?.remarks === "string" ? req.body.remarks.trim() : ""
  const refundPaymentId =
    typeof req.body?.refundPaymentId === "string"
      ? req.body.refundPaymentId
      : ""
  const idempotencyKey = req.get("Idempotency-Key")
  if (!validIdempotencyKey(idempotencyKey))
    return res
      .status(400)
      .json({ error: "A valid Idempotency-Key header is required." })
  if (
    refundPaymentId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      refundPaymentId,
    )
  ) {
    return res
      .status(400)
      .json({ error: "The collection reference for this refund is invalid." })
  }
  if (
    !Number.isFinite(amount) ||
    Math.abs(submittedAmount - amount) > 1e-7 ||
    amount <= 0 ||
    amount > maxTransferAmount
  )
    return res.status(400).json({
      error: `Transfer amount must be greater than zero, no more than PHP ${maxTransferAmount.toLocaleString("en-PH")}, and have no more than two decimal places.`,
    })
  if (channel === "INSTAPAY" && amount > maxInstapayAmount) {
    return res.status(400).json({
      error:
        "InstaPay transfers are limited to PHP 50,000 per transfer. Choose PESONET for a larger amount.",
    })
  }
  if (!remarks)
    return res.status(400).json({ error: "Transfer remarks are required." })
  if (remarks.length > 80)
    return res
      .status(400)
      .json({ error: "Transfer remarks must be 80 characters or fewer." })
  if (
    !["INSTAPAY", "PESONET"].includes(channel) ||
    !institutionCode ||
    institutionCode.length > 16
  )
    return res
      .status(400)
      .json({ error: "Choose a valid bank and transfer rail." })
  if (
    !/^[0-9]{5,64}$/.test(accountNumber) ||
    !fullName ||
    fullName.length > 128
  )
    return res
      .status(400)
      .json({ error: "Check the recipient name and account number." })

  const existing = await pool.query(
    "SELECT * FROM disbursements WHERE idempotency_key = $1 AND merchant_email = $2",
    [idempotencyKey, req.merchantEmail],
  )
  if (existing.rowCount) {
    const row = existing.rows[0]
    if ((row.refund_payment_id || "") !== refundPaymentId) {
      return res.status(409).json({
        error:
          "This idempotency key was already used for a different transfer.",
      })
    }
    const outcomeUnknown = ["REQUESTING", "OUTCOME_UNKNOWN"].includes(
      row.status,
    )
    return res.json({
      id: row.swiftpay_id,
      referenceNo: row.merchant_reference_no,
      status: outcomeUnknown ? "OUTCOME_UNKNOWN" : row.status,
      outcomeUnknown,
      message: row.error_message,
    })
  }

  const security = await pool.query(
    "SELECT pin_hash FROM merchant_security WHERE email = $1",
    [req.merchantEmail],
  )
  if (!security.rows[0]?.pin_hash) {
    return res
      .status(403)
      .json({ error: "Set up an MPIN before transferring." })
  }
  const stepUpToken = req.get("X-Step-Up-Token") || ""
  const expectedFingerprint = transferSecurityFingerprint(
    req.merchantEmail,
    req.body,
    idempotencyKey,
  )
  let stepUpPayload
  try {
    ;({
      payload: stepUpPayload,
    } = await jwtVerify(stepUpToken, jwtSecret, { algorithms: ["HS256"] }))
  } catch {
    return res
      .status(403)
      .json({ error: "Confirm this transfer with your MPIN." })
  }
  if (
    stepUpPayload.sub !== req.merchantEmail ||
    stepUpPayload.purpose !== "transfer_step_up" ||
    stepUpPayload.fingerprint !== expectedFingerprint ||
    typeof stepUpPayload.jti !== "string"
  ) {
    return res.status(403).json({
      error:
        "The security confirmation does not match this transfer. Verify again.",
    })
  }
  const institutions = institutionCache.get(channel)
  let selectedInstitution =
    institutions?.expiresAt > Date.now()
      ? institutions.items.find((item) => item.code === institutionCode)
      : null
  if (!selectedInstitution) {
    try {
      const { data } = await swiftPayRequest(
        `/disbursements/institutions?channel=${channel}`,
      )
      institutionCache.set(channel, {
        items: data,
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      })
      selectedInstitution = data.find((item) => item.code === institutionCode)
    } catch {
      return res.status(503).json({
        error: "Could not verify the selected institution. Try again later.",
      })
    }
  }
  if (!selectedInstitution) return res.status(400).json({
      error: "That institution is not enabled for the selected transfer rail.",
    })

  if (refundPaymentId) {
    let refundDetails
    try {
      refundDetails = await getRefundTransferDetails(
        refundPaymentId,
        req.merchantEmail,
      )
    } catch (error) {
      console.error(
        "Collection refund validation failed",
        error.status || "provider error",
      )
      return res.status(error.status || 503).json({
        error: error.status
          ? error.message
          : "Refund eligibility could not be verified.",
      })
    }
    if (
      amount !== refundDetails.amount ||
      channel !== refundDetails.channel ||
      institutionCode !== refundDetails.institutionCode ||
      accountNumber !== refundDetails.accountNumber ||
      fullName.toLowerCase() !== refundDetails.fullName.toLowerCase() ||
      remarks !== refundDetails.remarks
    ) {
      return res.status(400).json({
        error:
          "The refund details do not match the confirmed collection and payer account.",
      })
    }
  }

  const requestFingerprintFields = [
    req.merchantEmail,
    amount.toFixed(2),
    channel,
    institutionCode,
    accountNumber,
    fullName.toLowerCase(),
  ]
  if (refundPaymentId) requestFingerprintFields.push(refundPaymentId)
  const requestFingerprint = createHmac("sha256", jwtSecretValue)
    .update(JSON.stringify(requestFingerprintFields))
    .digest("hex")
  const activeRequest = await pool.query(
    `SELECT merchant_reference_no, status FROM disbursements
    WHERE merchant_email = $1 AND request_fingerprint = $2
      AND status NOT IN ('EXECUTED', 'SUCCESS', 'COMPLETED', 'REJECTED', 'ERROR', 'FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REVERSED')
    LIMIT 1`,
    [req.merchantEmail, requestFingerprint],
  )
  if (activeRequest.rowCount) return res.status(409).json({
      error: `A matching transfer is already ${activeRequest.rows[0].status.toLowerCase()}. Check wallet activity before creating another.`,
    })

  await pool.query("DELETE FROM used_step_up_tokens WHERE expires_at <= NOW()")

  const id = randomUUID()
  const merchantReferenceNo = `DRP-${randomUUID()}`
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const merchant = await client.query(
      "SELECT email FROM merchant_accounts WHERE email = $1 AND active = TRUE FOR UPDATE",
      [req.merchantEmail],
    )
    if (!merchant.rowCount) {
      await client.query("ROLLBACK")
      return res
        .status(401)
        .json({ error: "This merchant account is no longer active." })
    }
    const matchingRequest = await client.query(
      `SELECT status FROM disbursements
       WHERE merchant_email = $1 AND request_fingerprint = $2
         AND status NOT IN ('EXECUTED', 'SUCCESS', 'COMPLETED', 'REJECTED', 'ERROR', 'FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REVERSED')
       LIMIT 1`,
      [req.merchantEmail, requestFingerprint],
    )
    if (matchingRequest.rowCount) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error: `A matching transfer is already ${matchingRequest.rows[0].status.toLowerCase()}. Check wallet activity before creating another.`,
      })
    }
    let walletDebitAmount = amount
    let transferFee = 0
    if (refundPaymentId) {
      const collection = await client.query(
        `SELECT p.status, GREATEST(p.amount - COALESCE(f.amount, 0), 0)::numeric AS net_amount
         FROM payment_links p
         LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
         WHERE p.id = $1 AND p.merchant_email = $2
         FOR UPDATE OF p`,
        [refundPaymentId, req.merchantEmail],
      )
      if (collection.rows[0]?.status !== "EXECUTED") {
        await client.query("ROLLBACK")
        return res
          .status(409)
          .json({ error: "Only completed collections can be refunded." })
      }
      const previousRefund = await client.query(
        `SELECT status FROM disbursements WHERE refund_payment_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [refundPaymentId],
      )
      const previousStatus = previousRefund.rows[0]?.status
      if (
        previousStatus &&
        !["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(
          previousStatus.toUpperCase(),
        )
      ) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error:
            "A refund transfer for this collection is already in progress or complete.",
        })
      }
      walletDebitAmount = Number(collection.rows[0].net_amount)
    } else {
      const feeSetting = await client.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'transfer_fee_fixed'",
      )
      transferFee = Number(feeSetting.rows[0]?.setting_value || 0)
      if (
        !Number.isFinite(transferFee) ||
        transferFee < 0 ||
        Math.abs(transferFee * 100 - Math.round(transferFee * 100)) > 1e-7
      ) {
        throw new Error("The configured transfer fee is invalid.")
      }
      walletDebitAmount = calculateTransferDebit(amount, transferFee)
    }
    const wallet = await getMerchantWalletState(client, req.merchantEmail)
    const availableBalance = Number(wallet.balance) - Number(wallet.reserved)
    if (availableBalance + 0.000001 < walletDebitAmount) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error: `Insufficient merchant wallet balance. PHP ${Math.max(0, availableBalance).toFixed(2)} is available after pending transfers; the transfer amount plus its fee is PHP ${walletDebitAmount.toFixed(2)}.`,
      })
    }
    const consumedStepUp = await client.query(
      `INSERT INTO used_step_up_tokens (jti, merchant_email, expires_at)
       VALUES ($1, $2, to_timestamp($3))
       ON CONFLICT (jti) DO NOTHING RETURNING jti`,
      [stepUpPayload.jti, req.merchantEmail, stepUpPayload.exp],
    )
    if (!consumedStepUp.rowCount) {
      await client.query("ROLLBACK")
      return res.status(403).json({
        error:
          "This security confirmation has already been used. Verify again.",
      })
    }
    await client.query(
      `INSERT INTO disbursements
       (id, idempotency_key, merchant_reference_no, amount, transfer_fee, channel, institution_code, recipient_name, recipient_account_number, remarks, request_fingerprint, status, merchant_email, refund_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'REQUESTING', $12, $13)`,
      [
        id,
        idempotencyKey,
        merchantReferenceNo,
        amount,
        transferFee.toFixed(2),
        channel,
        institutionCode,
        fullName,
        accountNumber,
        remarks,
        requestFingerprint,
        req.merchantEmail,
        refundPaymentId || null,
      ],
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    if (error.code === "23505") return res.status(409).json({
        error:
          "A matching transfer is already being processed. Check wallet activity before retrying.",
      })
    throw error
  } finally {
    client.release()
  }

  let data
  try {
    const result = await swiftPayRequest("/disbursements/send", {
      method: "POST",
      body: {
        merchantReferenceNo,
        channel,
        type: "P2P",
        institutionCode,
        creditInformation: { amount, remarks },
        recipientInformation: { accountNumber, fullName },
      },
    })
    data = result.data
    if (!data?.id) throw new Error("SwiftPay returned no disbursement id.")
  } catch (error) {
    const isAmbiguous = !error.status || error.status >= 500
    const status = isAmbiguous ? "OUTCOME_UNKNOWN" : "REJECTED"
    const message = isAmbiguous
      ? "Transfer outcome is unknown. Do not retry until it is reconciled."
      : error.providerMessage ||
        `SwiftPay rejected the transfer request (${error.status}).`
    await updateDisbursementStatus(id, null, status, message)
    console.error(
      "SwiftPay disbursement request failed",
      error.status || "network error",
    )
    const responseStatus = isAmbiguous ? 503 : error.status === 400 ? 400 : 502
    return res.status(responseStatus).json({
      referenceNo: merchantReferenceNo,
      status,
      outcomeUnknown: isAmbiguous,
      message,
    })
  }
  const status =
    typeof data.status === "string" ? data.status.toUpperCase() : "PENDING"
  const failed = [
    "REJECTED",
    "ERROR",
    "FAILED",
    "CANCELED",
    "CANCELLED",
  ].includes(status)
  const settled = ["EXECUTED", "SUCCESS", "COMPLETED"].includes(status)
  const message = failed
    ? data.errorMessage || "SwiftPay rejected the transfer."
    : settled
      ? "SwiftPay confirmed the transfer as settled."
      : "Provider accepted the transfer; settlement is not yet confirmed."
  await updateDisbursementStatus(id, data.id, status, failed ? message : null)
  return res
    .status(202)
    .json({ id: data.id, referenceNo: merchantReferenceNo, status, message })
})

app.use(express.static(clientBuildDirectory))
app.use((req, res, next) => {
  if (
    req.method !== "GET" ||
    req.path === "/v1" ||
    req.path.startsWith("/v1/") ||
    req.path === "/healthz"
  )
    return next()
  return res.sendFile(join(clientBuildDirectory, "index.html"), (error) => {
    if (error) next(error)
  })
})

app.use((error, _req, res, _next) => {
  console.error(
    "API request failed",
    error.status || error.code || "unexpected error",
  )
  if (res.headersSent) return
  return res.status(500).json({ error: "The request could not be completed." })
})

async function start() {
  const missing = requiredEnvironment()
  if (missing.length)
    throw new Error(
      `Missing or invalid server configuration: ${missing.join(", ")}`,
    )
  await initializeDatabase()
  const port = Number(process.env.PORT || 10000)
  app.listen(port, "0.0.0.0", () => {
    console.log(`DRPAY API listening on ${port} (${swiftPayEnvironment})`)
    startNotificationWorker()
    void reconcilePending().catch((error) => {
      console.error(
        "Initial transaction notification cycle failed",
        error.status || error.message || "unexpected error",
      )
    })
  })
}

start().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})

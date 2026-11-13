import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"
import { reserveTransactionReference } from "./transaction-reference.js"
import { PostgresRateLimitStore } from "./postgres-rate-limit-store.js"
import { verifyPinWithAttemptLimit } from "./pin-attempts.js"
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  matchingTotpStep,
  totpProvisioningUri,
} from "./admin-mfa.js"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
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
import { createRemoteJWKSet, importPKCS8, SignJWT, jwtVerify } from "jose"
import { OAuth2Client } from "google-auth-library"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import pg from "pg"
import {
  createPaymentInvoicePdf,
  createPaymentReceiptPdf,
} from "./payment-documents.js"
import {
  getBearerToken,
  hasApiKeyPermission,
  isCustomerSession,
  isMerchantSession,
} from "./access.js"
import {
  createCustomerOtpHash,
  customerVisiblePaymentStatus,
  matchesCustomerOtp,
  normalizeCustomerEmail,
} from "./customer-auth.js"
import { createCustomerOtpEmail } from "./customer-otp-email.js"
import { canAdminAccess } from "./admin-access.js"
import { createAdminInvitationEmail } from "./admin-invitation-email.js"
import { postBalancedJournal } from "./accounting.js"
import { parseBankCsv } from "./bank-csv.js"
import { createFloatingTransferRequest } from "./floating-transfers.js"
import { disbursementReplayMatches } from "./disbursement-idempotency.js"
import {
  createLedgerService,
  MAX_DOWNLINE_COMMISSION_PERCENT,
  PLATFORM_FEE_LEDGER_SOURCE_TYPES,
} from "./ledger.js"
import {
  addMinorUnits,
  formatMinorUnits,
  minorUnitsToNumber,
  parseMinorUnits,
  subtractMinorUnits,
} from "./money.js"
import {
  formatTokenBalance,
  formatUsdtAmount,
  parseUsdtAmount,
  tronAddressPayload,
} from "./tron-usdt.js"
import {
  MERCHANT_USDT_BALANCE_MILESTONE,
  getPostAssignmentUsdtBalance,
  isMerchantFullyActivated,
  meetsUsdtMinimumBalance,
} from "./merchant-activation.js"
import {
  createCustomerPaymentRequestEmail,
  createTaxInvoiceEmailCopy,
} from "./customer-payment-email.js"
import {
  createMerchantActivationEmail,
  createMerchantApiGuideEmail,
} from "./merchant-activation-email.js"
import { sendMerchantEmails } from "./merchant-email-delivery.js"
import { createMerchantKybReviewEmail } from "./merchant-kyb-review-email.js"
import { createMerchantOtpEmail } from "./merchant-otp-email.js"
import { createMerchantApiIntegrationGuidePdf } from "./merchant-api-integration-guide.js"
import { createAlipayPlusAgreementPdf } from "./alipay-plus-agreement.js"
import { createMerchantAgreementPdf } from "./merchant-agreement.js"
import { sendMerchantInvitationEmail } from "./merchant-invitation-email.js"
import {
  isSupportedPaymentLinkCurrency,
  isValidEstimatedDeliveryDate,
  paymentLinkRequestFingerprint,
} from "./payment-link-idempotency.js"
import {
  VIRTUAL_ACCOUNT_INSTITUTION_CODE,
  virtualAccountInformationFromProvider,
  virtualAccountInformationFromRow,
} from "./virtual-account-info.js"
import {
  canManuallyConfirmPayment,
  createPaymentStateService,
} from "./payment-state.js"
import {
  formatAdminTelegramNotification,
  sendTelegramMessage,
} from "./telegram-notifications.js"
import { createPinnedLookup } from "./pinned-lookup.js"
import { getPrivateDocumentUploadUrl } from "./private-document-upload.js"
import {
  createSumsubSdkAccessToken,
  mapSumsubWebhook,
  verifySumsubWebhookDigest,
} from "./sumsub-kyb.js"
import {
  ensureMerchantKybDocumentSchema,
  ensureMerchantRegistrationDocumentSchema,
} from "./registration-document-schema.js"
import {
  getMissingRequiredKybDocuments,
  requiredKybDocumentTypes,
} from "./kyb-review.js"

const { Pool } = pg
function tryParseMinorUnits(value) {
  try {
    return parseMinorUnits(value)
  } catch {
    return null
  }
}

const platformFeeLedgerSourceTypesSql = PLATFORM_FEE_LEDGER_SOURCE_TYPES.map(
  (sourceType) => `'${sourceType}'`,
).join(", ")
const defaultCheckoutInstructions =
  "Open your {bank} or supported banking app.\nOpen your {bank} QR scanner and scan the code above.\nConfirm the PHP amount before completing payment."
const defaultVirtualAccountCheckoutInstructions =
  "Scan this QR with your supported bank app, or use the Virtual Account number and InstaPay bank code below to make a bank transfer.\nConfirm the PHP amount and payment reference before completing payment."
const defaultPaymentEmailSubject = "DRPAY: Payment request · {{reference}}"
const defaultPaymentEmailMessage =
  "A payment has been requested. Review the details below to continue."
const defaultPaymentEmailColor = "#153e2c"
const app = express()
const clientBuildDirectory = fileURLToPath(new URL("../dist", import.meta.url))
const clientIndexFile = join(clientBuildDirectory, "index.html")
app.set("trust proxy", 1)

app.get("/", (req, res, next) => {
  if (existsSync(clientIndexFile)) {
    return res.sendFile(clientIndexFile, (error) => {
      if (error) next(error)
    })
  }
  return res.json({ status: "ok", service: "drpay-api" })
})

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: {
      directives: {
        scriptSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://apis.google.com",
          "https://oauth.telegram.org",
        ],
        frameSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://www.google.com",
          "https://oauth.telegram.org",
        ],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://apis.google.com",
          "https://oauth.telegram.org",
          "https://drpay-merchant-production.up.railway.app",
          "https://api.live.denpay.cc",
          "https://api.sandbox.denpay.cc",
          "https://*.r2.cloudflarestorage.com",
        ],
      },
    },
  }),
)
app.post(
  "/v1/webhooks/sumsub",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    const secretKey = process.env.SUMSUB_WEBHOOK_SECRET
    if (!secretKey) {
      return res.status(503).json({
        error: "Sumsub webhooks are not configured on this server.",
      })
    }
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: "Invalid webhook payload." })
    }

    const validDigest = verifySumsubWebhookDigest({
      rawBody: req.body,
      digest: req.get("x-payload-digest"),
      algorithm: req.get("x-payload-digest-alg") || "HMAC_SHA256_HEX",
      secretKey,
    })
    if (!validDigest) {
      return res.status(401).json({ error: "Invalid webhook signature." })
    }

    let payload
    try {
      payload = JSON.parse(req.body.toString("utf8"))
    } catch {
      return res.status(400).json({ error: "Invalid webhook payload." })
    }

    const event = mapSumsubWebhook(payload)
    if (!event) return res.sendStatus(200)
    if (!event.applicantId) {
      return res.status(400).json({ error: "Webhook applicant is missing." })
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `UPDATE merchant_kyb_profiles
       SET sumsub_applicant_id = COALESCE(sumsub_applicant_id, $2),
           sumsub_review_status = CASE
             WHEN sumsub_review_status IN ('APPROVED', 'REJECTED')
             THEN sumsub_review_status
             ELSE $3
           END,
           sumsub_review_answer = COALESCE($4, sumsub_review_answer),
           sumsub_last_event_type = $5,
           updated_at = NOW()
       WHERE sumsub_external_user_id = $1
         AND (sumsub_applicant_id IS NULL OR sumsub_applicant_id = $2)`,
        [
          event.externalUserId,
          event.applicantId,
          event.reviewStatus,
          event.reviewAnswer,
          event.type,
        ],
      )
      await client.query(
        `UPDATE merchant_registration_otps
         SET sumsub_applicant_id = COALESCE(sumsub_applicant_id, $2),
             sumsub_review_status = CASE
               WHEN sumsub_review_status IN ('APPROVED', 'REJECTED')
               THEN sumsub_review_status
               ELSE $3
             END,
             sumsub_review_answer = COALESCE($4, sumsub_review_answer),
             sumsub_last_event_type = $5
         WHERE sumsub_external_user_id = $1
           AND (sumsub_applicant_id IS NULL OR sumsub_applicant_id = $2)`,
        [
          event.externalUserId,
          event.applicantId,
          event.reviewStatus,
          event.reviewAnswer,
          event.type,
        ],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    return res.sendStatus(200)
  },
)
app.use(express.static(clientBuildDirectory))
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
    publicApiOrigin,
    "https://merchant.denpay.cc",
    "https://drpay-merchant-production.up.railway.app",
    "https://denpay.cc",
    "https://www.denpay.cc",
    "https://pay.live.denpay.cc",
    "https://pay.sandbox.denpay.cc",
    "https://live.merchant.swiftpay.site",
    "https://drpay-web.onrender.com",
    ...(process.env.DRPAY_ADDITIONAL_FRONTEND_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim()),
    "http://localhost:5173",
    "http://localhost:8443",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8443",
    "https://localhost",
    "capacitor://localhost",
  ].filter(Boolean),
)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true)
      let hostname = ""
      try {
        hostname = new URL(origin).hostname.toLowerCase()
      } catch {
        return callback(null, false)
      }
      if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".denpay.cc") ||
        hostname.endsWith(".swiftpay.site") ||
        hostname.endsWith(".onrender.com")
      ) {
        return callback(null, true)
      }
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
const adminMfaEncryptionKey = process.env.DRPAY_ADMIN_MFA_ENCRYPTION_KEY
const jwtSecretValue = process.env.DRPAY_JWT_SECRET
const jwtSecret = jwtSecretValue
  ? new TextEncoder().encode(jwtSecretValue)
  : null
const resendApiKey = process.env.RESEND_API_KEY
const resendFromEmail = process.env.RESEND_FROM_EMAIL
const privateFcmConfig = {
  projectId: process.env.FCM_PROJECT_ID,
  serviceAccountEmail: process.env.FCM_SERVICE_ACCOUNT_EMAIL,
  serviceAccountPrivateKey:
    process.env.FCM_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
}
const publicFcmConfig = {
  projectId: process.env.FCM_PUBLIC_PROJECT_ID || "drpay-merchant",
  serviceAccountEmail:
    process.env.FCM_PUBLIC_SERVICE_ACCOUNT_EMAIL ||
    "firebase-adminsdk-fbsvc@drpay-merchant.iam.gserviceaccount.com",
  serviceAccountPrivateKey:
    process.env.FCM_PUBLIC_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
}
const googleClientId = process.env.DRPAY_GOOGLE_CLIENT_ID?.trim() || ""
const googleAuthClient = googleClientId
  ? new OAuth2Client(googleClientId)
  : null
const configuredTelegramLoginClientId =
  process.env.DRPAY_TELEGRAM_LOGIN_CLIENT_ID?.trim() || ""
const telegramLoginClientId = /^\d{1,20}$/.test(configuredTelegramLoginClientId)
  ? configuredTelegramLoginClientId
  : ""
if (configuredTelegramLoginClientId && !telegramLoginClientId) {
  console.error(
    "DRPAY_TELEGRAM_LOGIN_CLIENT_ID must be a numeric BotFather client ID.",
  )
}
const telegramJwks = createRemoteJWKSet(
  new URL("https://oauth.telegram.org/.well-known/jwks.json"),
)
const passkeyRpId =
  process.env.DRPAY_PASSKEY_RP_ID?.trim() ||
  (frontendOrigin ? new URL(frontendOrigin).hostname : "")
const passkeyExpectedOrigin = frontendOrigin
  ? new URL(frontendOrigin).origin
  : ""
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramChatId = process.env.TELEGRAM_CHAT_ID
const swiftPayAccessKey = process.env.SWIFTPAY_ACCESS_KEY
const swiftPaySecretKey = process.env.SWIFTPAY_SECRET_KEY
const swiftPayEnvironment = process.env.SWIFTPAY_ENV || "sandbox"
const tatumApiKey = process.env.TATUM_API_KEY
const tronGridApiKey = process.env.TRONGRID_API_KEY
const tronUsdtNetwork = process.env.TRON_USDT_NETWORK || "disabled"
const tronUsdtWithdrawalMinimum = 20_000_000n
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
const allowedTaxInvoiceAttachmentTypes = new Set(["application/pdf"])
const allowedDocumentContentTypes = new Set([
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
function normalizeDocumentContentType(fileName, contentType) {
  const normalized =
    typeof contentType === "string" ? contentType.trim().toLowerCase() : ""
  if (normalized === "image/jpg" || normalized === "image/pjpeg") {
    return "image/jpeg"
  }
  if (allowedDocumentContentTypes.has(normalized)) {
    return normalized
  }
  const extension =
    typeof fileName === "string" ? fileName.split(".").pop()?.toLowerCase() : ""
  if (extension === "pdf") return "application/pdf"
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
  if (extension === "png") return "image/png"
  return ""
}

function hasValidDocumentSignature(contentType, bytes) {
  return contentType === "application/pdf"
    ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
    : contentType === "image/jpeg"
      ? bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      : contentType === "image/png"
        ? bytes.length >= 8 &&
          bytes
            .subarray(0, 8)
            .equals(
              Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            )
        : false
}

const liveMoneyAcknowledgement = process.env.SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED
const swiftPayBaseUrl =
  swiftPayEnvironment === "production"
    ? "https://api.pay.live.swiftpay.ph/api"
    : "https://api.pay.sandbox.live.swiftpay.ph/api"
const maxTransferAmount = Number(process.env.DRPAY_MAX_TRANSFER_PHP || "100000")
const maxInstapayAmount = 50_000
const loginLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "login"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const registrationLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "registration"),
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const registrationOtpLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "registration-otp"),
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const pinAttemptLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "pin-attempt"),
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.merchantEmail || "merchant-pin",
})
const customerOtpLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "customer-otp"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const paymentLinkLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "payment-link"),
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const transferLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "transfer"),
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const merchantApiLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "merchant-api"),
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKeyId || req.ip,
})
const cryptoWalletLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "crypto-wallet"),
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.merchantEmail,
})
const sumsubKybLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "sumsub-kyb"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.merchantEmail || "sumsub-kyb",
})
const publicCheckoutLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "public-checkout"),
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
})
const publicQrImageLimiter = rateLimit({
  store: new PostgresRateLimitStore(pool, "public-qr"),
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
const fcmAccessTokens = new Map()
let reconcilingPending = false
let scanningTelegramUsdtDeposits = false
const notificationWorkerId = `${process.pid}:${randomUUID()}`

function requiredEnvironment() {
  const missing = []
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL")
  if (!authEmail) missing.push("DRPAY_MERCHANT_EMAIL")
  if (!superAdminEmail) missing.push("DRPAY_SUPER_ADMIN_EMAIL")
  if (!superAdminPassword || superAdminPassword.length < 16)
    missing.push("DRPAY_SUPER_ADMIN_PASSWORD (16+ characters)")
  if (!passwordSalt || passwordSalt.length < 32)
    missing.push("DRPAY_PASSWORD_SALT (32+ characters)")
  if (!adminMfaEncryptionKey || !/^[0-9a-f]{64}$/i.test(adminMfaEncryptionKey))
    missing.push("DRPAY_ADMIN_MFA_ENCRYPTION_KEY (32-byte hex key)")
  if (!jwtSecretValue || jwtSecretValue.length < 32)
    missing.push("DRPAY_JWT_SECRET (32+ characters)")
  if (!resendApiKey) missing.push("RESEND_API_KEY")
  if (!resendFromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resendFromEmail))
    missing.push("RESEND_FROM_EMAIL (verified sender address)")
  if (swiftPayEnvironment === "production") {
    if (!swiftPayAccessKey) missing.push("SWIFTPAY_ACCESS_KEY")
    if (!swiftPaySecretKey) missing.push("SWIFTPAY_SECRET_KEY")
  }
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
  const amount = formatMinorUnits(parseMinorUnits(body?.amount))
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
    amount,
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

async function issueCustomerSession(email) {
  const accessToken = await new SignJWT({ role: "customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("drpay-customer")
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(jwtSecret)
  return { accessToken, expiresInSeconds: 60 * 60, email, role: "customer" }
}

async function createMerchantAuthChallenge(
  provider,
  purpose,
  merchantEmail,
  challenge,
) {
  const id = randomUUID()
  await pool.query(
    "DELETE FROM merchant_auth_challenges WHERE expires_at <= NOW()",
  )
  await pool.query(
    `INSERT INTO merchant_auth_challenges
       (id, provider, purpose, merchant_email, challenge, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 minutes')`,
    [id, provider, purpose, merchantEmail || null, challenge],
  )
  return id
}

async function consumeMerchantAuthChallenge(id, provider, purpose) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const result = await pool.query(
    `DELETE FROM merchant_auth_challenges
     WHERE id = $1 AND provider = $2 AND purpose = $3 AND expires_at > NOW()
     RETURNING merchant_email AS "merchantEmail", challenge`,
    [id, provider, purpose],
  )
  return result.rows[0] || null
}

async function getMerchantAuthChallenge(id, provider, purpose) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const result = await pool.query(
    `SELECT merchant_email AS "merchantEmail"
     FROM merchant_auth_challenges
     WHERE id = $1 AND provider = $2 AND purpose = $3 AND expires_at > NOW()`,
    [id, provider, purpose],
  )
  return result.rows[0] || null
}

async function createMerchantSignInStepUp(provider, email) {
  const security = await pool.query(
    "SELECT pin_hash FROM merchant_security WHERE email = $1",
    [email],
  )
  if (!security.rows[0]?.pin_hash) {
    return {
      ...(await issueMerchantSession(email)),
      pinConfigured: false,
    }
  }
  const challengeId = await createMerchantAuthChallenge(
    provider,
    "login",
    email,
    randomBytes(32).toString("base64url"),
  )
  return { email, challengeId, pinConfigured: true }
}

async function verifyGoogleIdentityToken(idToken, expectedNonce) {
  if (!googleAuthClient)
    throw new Error("Google sign-in is not configured for this service.")
  if (typeof idToken !== "string" || idToken.length > 12_000)
    throw new Error("Google sign-in could not be verified.")
  const ticket = await googleAuthClient.verifyIdToken({
    idToken,
    audience: googleClientId,
  })
  const payload = ticket.getPayload()
  if (
    !payload?.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    payload.nonce !== expectedNonce ||
    !["https://accounts.google.com", "accounts.google.com"].includes(
      payload.iss,
    )
  ) {
    throw new Error("Use a verified Google account to continue.")
  }
  return { subject: payload.sub, email: payload.email.toLowerCase() }
}

async function verifyTelegramIdentityToken(idToken, expectedNonce) {
  if (!telegramLoginClientId)
    throw new Error("Telegram sign-in is not configured for this service.")
  if (typeof idToken !== "string" || idToken.length > 12_000)
    throw new Error("Telegram sign-in could not be verified.")
  const { payload } = await jwtVerify(idToken, telegramJwks, {
    algorithms: ["RS256", "ES256", "EdDSA", "ES256K"],
    issuer: "https://oauth.telegram.org",
    audience: telegramLoginClientId,
  })
  if (
    typeof payload.sub !== "string" ||
    payload.sub.length > 128 ||
    payload.nonce !== expectedNonce
  ) {
    throw new Error("Telegram sign-in could not be verified.")
  }
  return { subject: payload.sub }
}

async function linkMerchantAuthIdentity(merchantEmail, provider, subject) {
  const inserted = await pool.query(
    `INSERT INTO merchant_auth_identities (provider, provider_subject, merchant_email)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING merchant_email`,
    [provider, subject, merchantEmail],
  )
  if (inserted.rowCount) return { linked: true }
  const existing = await pool.query(
    `SELECT merchant_email FROM merchant_auth_identities
     WHERE provider = $1 AND provider_subject = $2`,
    [provider, subject],
  )
  if (existing.rows[0]?.merchant_email === merchantEmail)
    return { linked: true, alreadyLinked: true }
  if (existing.rowCount)
    throw new Error(
      "This sign-in method is already linked to another merchant account.",
    )
  throw new Error(
    `A different ${provider} account is already linked to this merchant account.`,
  )
}

function deviceTokenHash(deviceToken) {
  return createHash("sha256").update(deviceToken).digest("hex")
}

function biometricSecretHash(secret) {
  return createHmac("sha256", jwtSecretValue)
    .update(`merchant-biometric:${secret}`)
    .digest("hex")
}

async function sendMerchantOtp(email, code, purpose) {
  const message = createMerchantOtpEmail({ code, purpose })
  if (!resendFromEmail) {
    throw new Error(
      "A verified sender address is required to send verification codes.",
    )
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + resendApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [email],
      ...message,
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

async function sendCustomerOtp(email, code) {
  const message = createCustomerOtpEmail(code)
  if (!resendFromEmail) {
    throw new Error(
      "A verified sender address is required to send verification codes.",
    )
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + resendApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [email],
      ...message,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    console.error("Resend customer OTP delivery failed", {
      status: response.status,
      name: typeof body?.name === "string" ? body.name : "provider error",
    })
    throw new Error("Verification email could not be sent.")
  }
}

async function sendMerchantAccessReadyEmails(merchants) {
  const portalUrl = new URL("/login", frontendOrigin).toString()
  await sendMerchantEmails({
    from: resendFromEmail,
    apiKey: resendApiKey,
    messages: merchants.map((merchant) => ({
      to: merchant.email,
      email: createMerchantActivationEmail({
        contactPerson:
          merchant.contactPerson || merchant.businessName || merchant.email,
        businessName: merchant.businessName || merchant.email,
        portalUrl,
      }),
    })),
  })
}

async function sendMerchantKybReviewNotification(
  merchant,
  status,
  reviewNotes,
) {
  const portalUrl = new URL("/login", frontendOrigin).toString()
  await sendMerchantEmails({
    from: resendFromEmail,
    apiKey: resendApiKey,
    messages: [
      {
        to: merchant.email,
        email: createMerchantKybReviewEmail({
          contactPerson:
            merchant.contactPerson || merchant.businessName || merchant.email,
          status,
          reviewNotes: reviewNotes || "",
          accessEnabled: merchant.active,
          portalUrl,
        }),
      },
    ],
  })
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
    "",
    "A PDF payment receipt is attached to this email.",
    "Keep this receipt for your records.",
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
          <p style="margin:16px 0 0;color:#52647c;font-size:12px;line-height:1.6">Your official PDF payment receipt is attached to this email. Keep it for your records.</p>
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
      attachments: [
        {
          filename: `DRPAY-Receipt-${payment.reference_no}.pdf`,
          content: (
            await createPaymentReceiptPdf({
              amount: payment.amount,
              referenceNo: payment.reference_no,
              title: payment.title,
              status: payment.status,
              createdAt: new Date(),
            })
          ).toString("base64"),
          content_type: "application/pdf",
        },
      ],
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

function getFcmConfig(appId) {
  return appId === "ph.drpays.merchant.public"
    ? publicFcmConfig
    : privateFcmConfig
}

function fcmConfigIsComplete(config) {
  return Boolean(
    config.projectId &&
      config.serviceAccountEmail &&
      config.serviceAccountPrivateKey,
  )
}

function fcmConfigured() {
  return (
    fcmConfigIsComplete(privateFcmConfig) ||
    fcmConfigIsComplete(publicFcmConfig)
  )
}

async function getFcmAccessToken(config, appId) {
  const cachedToken = fcmAccessTokens.get(appId)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000)
    return cachedToken.value
  const key = await importPKCS8(config.serviceAccountPrivateKey, "RS256")
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(config.serviceAccountEmail)
    .setSubject(config.serviceAccountEmail)
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
  fcmAccessTokens.set(appId, {
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  })
  return token.access_token
}

async function sendTransactionPush(notification, device) {
  const config = getFcmConfig(device.app_id)
  if (!fcmConfigIsComplete(config)) return null
  const incoming = notification.transaction_type === "PAYMENT"
  const type = incoming
    ? "Incoming payment received"
    : "Outgoing transfer completed"
  const amount = `PHP ${Number(notification.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Bearer " + (await getFcmAccessToken(config, device.app_id)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: device.token,
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

async function queueSuccessfulTransaction(
  transactionType,
  transactionId,
  executor = pool,
) {
  const query =
    transactionType === "PAYMENT"
      ? `SELECT merchant_email, customer_email, reference_no, amount, status FROM payment_links WHERE id = $1`
      : `SELECT merchant_email, merchant_reference_no AS reference_no, amount, status FROM disbursements WHERE id = $1`
  const result = await executor.query(query, [transactionId])
  const transaction = result.rows[0]
  const successful =
    transactionType === "PAYMENT"
      ? ["EXECUTED", "MANUALLY_PAID"].includes(transaction?.status)
      : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(
          transaction?.status?.toUpperCase(),
        )
  if (!successful) return
  if (transaction?.merchant_email) {
    await executor.query(
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
    await queueAdminMoneyNotification(
      {
        eventType: transactionType,
        eventId: transactionId,
        merchantEmail: transaction.merchant_email,
        direction: transactionType === "PAYMENT" ? "IN" : "OUT",
        amount: transaction.amount,
        currency: "PHP",
        reference: transaction.reference_no,
        details:
          transactionType === "PAYMENT"
            ? "Merchant payment confirmed"
            : "Merchant transfer completed",
      },
      executor,
    )
  }
  if (transactionType === "PAYMENT" && transaction?.customer_email) {
    await executor.query(
      `INSERT INTO customer_payment_notifications (id, payment_id, customer_email)
         VALUES ($1, $2, $3)
         ON CONFLICT (payment_id) DO NOTHING`,
      [randomUUID(), transactionId, transaction.customer_email],
    )
  }
}

async function queueAdminMoneyNotification(notification, executor = pool) {
  await executor.query(
    `INSERT INTO admin_telegram_notifications
       (id, event_type, event_id, merchant_email, direction, amount, currency, reference, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (event_type, event_id) DO NOTHING`,
    [
      randomUUID(),
      notification.eventType,
      notification.eventId,
      notification.merchantEmail,
      notification.direction,
      notification.amount,
      notification.currency,
      notification.reference,
      notification.details,
    ],
  )
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

async function ensureMerchantReferralCode(email) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await pool.query(
      "SELECT referral_code AS code FROM merchant_accounts WHERE email = $1",
      [email],
    )
    if (!existing.rowCount) return null
    if (existing.rows[0].code) return existing.rows[0].code

    const code = randomBytes(8).toString("hex").toUpperCase()
    try {
      const updated = await pool.query(
        `UPDATE merchant_accounts SET referral_code = $2
         WHERE email = $1 AND referral_code IS NULL
         RETURNING referral_code AS code`,
        [email, code],
      )
      if (updated.rowCount) return updated.rows[0].code
    } catch (error) {
      if (error.code !== "23505") throw error
    }
  }
  throw new Error("Could not assign a unique merchant referral code.")
}

const { updatePaymentLinkStatus } = createPaymentStateService({
  pool,
  settleSuccessfulCollection,
  queueSuccessfulTransaction,
  queueTransactionWebhook,
})

async function claimPendingOutboxRows(table, selectSql, values = []) {
  const allowedTables = new Set([
    "transaction_notifications",
    "customer_payment_notifications",
    "payment_request_notifications",
    "admin_telegram_notifications",
    "merchant_webhook_deliveries",
  ])
  if (!allowedTables.has(table)) {
    throw new Error("The requested outbox table cannot be claimed.")
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const claimed = await client.query(selectSql, values)
    if (claimed.rowCount) {
      await client.query(
        `UPDATE ${table}
         SET claimed_by = $1, claimed_until = NOW() + INTERVAL '5 minutes'
         WHERE id = ANY($2::uuid[])`,
        [notificationWorkerId, claimed.rows.map((row) => row.id)],
      )
    }
    await client.query("COMMIT")
    return claimed.rows
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function releaseOutboxClaim(table, id) {
  await pool.query(
    `UPDATE ${table}
     SET claimed_by = NULL, claimed_until = NULL
     WHERE id = $1 AND claimed_by = $2`,
    [id, notificationWorkerId],
  )
}

async function dispatchTransactionNotifications() {
  const rows = await claimPendingOutboxRows(
    "transaction_notifications",
    `
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
    WHERE (n.email_sent_at IS NULL OR n.push_sent_at IS NULL)
      AND (n.claimed_until IS NULL OR n.claimed_until < NOW())
    ORDER BY n.created_at ASC
    LIMIT 25
    FOR UPDATE OF n SKIP LOCKED
  `,
  )
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
      await releaseOutboxClaim("transaction_notifications", notification.id)
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
          "SELECT token, app_id FROM merchant_push_devices WHERE merchant_email = $1",
          [notification.merchant_email],
        )
        for (const device of devices.rows) {
          const priorDelivery = await pool.query(
            "SELECT 1 FROM transaction_push_deliveries WHERE notification_id = $1 AND token = $2",
            [notification.id, device.token],
          )
          if (priorDelivery.rowCount) continue
          const sent = await sendTransactionPush(notification, device)
          if (sent === null) continue
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
    await releaseOutboxClaim("transaction_notifications", notification.id)
  }
}

async function dispatchCustomerPaymentNotifications() {
  const pending = await claimPendingOutboxRows(
    "customer_payment_notifications",
    `SELECT n.id, n.payment_id, n.customer_email, n.attempts,
       p.title, p.reference_no, p.amount, p.status
     FROM customer_payment_notifications n
     JOIN payment_links p ON p.id = n.payment_id
     WHERE n.sent_at IS NULL AND n.next_attempt_at <= NOW() AND n.attempts < 8
       AND (n.claimed_until IS NULL OR n.claimed_until < NOW())
     ORDER BY n.created_at ASC
     LIMIT 25
     FOR UPDATE OF n SKIP LOCKED`,
    [],
  )
  for (const notification of pending) {
    try {
      await sendCustomerPaymentEmail(notification)
      await pool.query(
        `UPDATE customer_payment_notifications
         SET sent_at = NOW(), attempts = attempts + 1,
           claimed_by = NULL, claimed_until = NULL
         WHERE id = $1 AND claimed_by = $2`,
        [notification.id, notificationWorkerId],
      )
    } catch (error) {
      const delaySeconds = Math.min(3600, 30 * 2 ** notification.attempts)
      await pool.query(
        `UPDATE customer_payment_notifications
         SET attempts = attempts + 1,
           next_attempt_at = NOW() + ($2 * INTERVAL '1 second'),
           claimed_by = NULL, claimed_until = NULL
         WHERE id = $1 AND claimed_by = $3`,
        [notification.id, delaySeconds, notificationWorkerId],
      )
      console.error("Customer payment confirmation remains queued for retry", {
        notificationId: notification.id,
        attempt: notification.attempts + 1,
        error: error.message,
      })
    }
  }
}

async function dispatchAdminTelegramNotifications() {
  if (!telegramBotToken || !telegramChatId) return
  const pending = await claimPendingOutboxRows(
    "admin_telegram_notifications",
    `SELECT notification.id, notification.merchant_email,
       COALESCE(NULLIF(BTRIM(merchant.business_name), ''), notification.merchant_email) AS merchant_name,
       notification.direction, notification.amount, notification.currency,
       notification.reference, notification.details, notification.attempts
     FROM admin_telegram_notifications notification
     LEFT JOIN merchant_accounts merchant ON merchant.email = notification.merchant_email
     WHERE notification.sent_at IS NULL AND notification.next_attempt_at <= NOW()
       AND (notification.claimed_until IS NULL OR notification.claimed_until < NOW())
     ORDER BY notification.created_at ASC
     LIMIT 25
     FOR UPDATE OF notification SKIP LOCKED`,
    [],
  )
  for (const notification of pending) {
    try {
      const walletState = await getMerchantWalletState(
        pool,
        notification.merchant_email,
      )
      await sendTelegramMessage({
        botToken: telegramBotToken,
        chatId: telegramChatId,
        text: formatAdminTelegramNotification(notification, walletState),
      })
      await pool.query(
        `UPDATE admin_telegram_notifications
         SET sent_at = NOW(), attempts = attempts + 1,
           claimed_by = NULL, claimed_until = NULL
         WHERE id = $1 AND claimed_by = $2`,
        [notification.id, notificationWorkerId],
      )
    } catch (error) {
      const delaySeconds = Math.min(3600, 30 * 2 ** notification.attempts)
      await pool.query(
        `UPDATE admin_telegram_notifications
         SET attempts = attempts + 1, last_error = $2, last_attempt_at = NOW(),
           next_attempt_at = NOW() + ($3 * INTERVAL '1 second'),
           claimed_by = NULL, claimed_until = NULL
         WHERE id = $1 AND claimed_by = $4`,
        [notification.id, error.message, delaySeconds, notificationWorkerId],
      )
      console.error("Telegram transaction notification remains queued", {
        notificationId: notification.id,
        attempt: notification.attempts + 1,
        error: error.message,
      })
    }
  }
}

async function dispatchCustomerPaymentRequests() {
  const pending = await claimPendingOutboxRows(
    "payment_request_notifications",
    `SELECT n.id, n.payment_id, n.customer_email, n.attempts,
       p.title, p.reference_no, p.amount, p.code, p.created_at, p.email_subject,
       p.email_message, p.email_brand_color, p.email_logo_url,
       p.bir_payee_name, p.bir_payee_tin, p.bir_payee_address,
       p.bir_payor_name, p.bir_payor_tin, p.bir_payor_address,
       a.object_key AS attachment_object_key, a.file_name AS attachment_file_name,
       a.content_type AS attachment_content_type, a.size_bytes AS attachment_size_bytes
     FROM payment_request_notifications n
     JOIN payment_links p ON p.id = n.payment_id
     LEFT JOIN admin_tax_invoice_attachments a ON a.payment_id = p.id
     WHERE n.sent_at IS NULL AND n.next_attempt_at <= NOW() AND n.attempts < 8
       AND (n.claimed_until IS NULL OR n.claimed_until < NOW())
     ORDER BY n.created_at ASC
     LIMIT 25
     FOR UPDATE OF n SKIP LOCKED`,
    [],
  )
  for (const notification of pending) {
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
          attachmentBytes.length !==
            Number(notification.attachment_size_bytes) ||
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
      const generatedInvoiceAttachment = await createPaymentInvoicePdf({
        amount: notification.amount,
        referenceNo: notification.reference_no,
        title: notification.title,
        createdAt: notification.created_at,
        isTaxInvoice:
          notification.email_subject?.startsWith("DRPAY: BIR 2307") ||
          notification.email_subject?.startsWith("DRPAY: Tax invoice"),
        birPayeeName: notification.bir_payee_name,
        birPayeeTin: notification.bir_payee_tin,
        birPayeeAddress: notification.bir_payee_address,
        birPayorName: notification.bir_payor_name,
        birPayorTin: notification.bir_payor_tin,
        birPayorAddress: notification.bir_payor_address,
      })
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
          generatedInvoiceAttachment,
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
        `UPDATE payment_request_notifications
         SET sent_at = NOW(), attempts = attempts + 1,
           claimed_by = NULL, claimed_until = NULL
         WHERE id = $1 AND claimed_by = $2`,
        [notification.id, notificationWorkerId],
      )
    } catch (error) {
      const delaySeconds = Math.min(3600, 30 * 2 ** notification.attempts)
      await pool.query(
        `UPDATE payment_request_notifications
         SET attempts = attempts + 1,
           next_attempt_at = NOW() + ($2 * INTERVAL '1 second'),
           claimed_by = NULL, claimed_until = NULL
         WHERE id = $1 AND claimed_by = $3`,
        [notification.id, delaySeconds, notificationWorkerId],
      )
      console.error("Customer payment request remains queued for retry", {
        notificationId: notification.id,
        attempt: notification.attempts + 1,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { type: typeof error, message: String(error) },
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

async function backfillAccountingJournals() {
  const marker = await pool.query(
    `SELECT setting_value FROM system_settings
     WHERE setting_key = 'accounting_journal_backfill_v1'`,
  )
  if (marker.rows[0]?.setting_value === "complete") return

  async function postOrSuspend(entry) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await postBalancedJournal(client, entry)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      if (!(error instanceof Error) || error.message !== "The accounting journal is not balanced.") {
        throw error
      }
      const caseId = randomUUID()
      const externalReference = `legacy:${entry.sourceType}:${entry.sourceId}`
      const reconciliation = await pool.query(
        `INSERT INTO financial_reconciliation_cases
           (id, source_type, external_reference, direction, amount, currency,
            external_status, internal_id, internal_reference, status, details)
         VALUES ($1, 'SWIFTPAY', $2, 'IN', $3, 'PHP', 'LEGACY_UNBALANCED',
            $4, $5, 'amount_mismatch', $6::jsonb)
         ON CONFLICT (source_type, external_reference)
           WHERE source_type = 'SWIFTPAY'
         DO UPDATE SET details = EXCLUDED.details, status = EXCLUDED.status
         RETURNING id`,
        [
          caseId,
          externalReference,
          entry.suspenseAmount,
          entry.sourceId,
          entry.reference,
          JSON.stringify({ sourceType: entry.sourceType }),
        ],
      )
      await pool.query(
        `INSERT INTO accounting_suspense_items (id, reconciliation_case_id)
         VALUES ($1, $2) ON CONFLICT (reconciliation_case_id) DO NOTHING`,
        [randomUUID(), reconciliation.rows[0].id],
      )
      console.error("Legacy ledger source needs accounting reconciliation", {
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
      })
    } finally {
      client.release()
    }
  }

  const collections = await pool.query(
    `SELECT payment.id, payment.reference_no, payment.amount::text AS gross,
       COALESCE(fee.amount, 0)::text AS fee,
       COALESCE(commission.amount, 0)::text AS commission,
       COALESCE(wallet.amount, 0)::text AS merchant_credit
     FROM payment_links payment
     JOIN merchant_wallet_ledger wallet
       ON wallet.source_type = 'COLLECTION' AND wallet.source_id = payment.id
     LEFT JOIN platform_fee_ledger fee
       ON fee.source_type = 'COLLECTION' AND fee.source_id = payment.id
     LEFT JOIN downline_commissions commission
       ON commission.payment_id = payment.id
     WHERE payment.status IN ('EXECUTED', 'MANUALLY_PAID')`,
  )
  for (const row of collections.rows) {
    const fee = parseMinorUnits(row.fee)
    const commission = parseMinorUnits(row.commission)
    const merchantCredit = parseMinorUnits(row.merchant_credit)
    const gross = parseMinorUnits(row.gross)
    await postOrSuspend({
      sourceType: "COLLECTION",
      sourceId: row.id,
      reference: row.reference_no,
      suspenseAmount: formatMinorUnits(gross),
      lines: [
        { accountCode: "SWIFTPAY_CLEARING", side: "debit", amount: row.gross },
        ...(merchantCredit > 0n
          ? [{ accountCode: "MERCHANT_PAYABLE", side: "credit", amount: row.merchant_credit }]
          : []),
        ...(commission > 0n
          ? [{ accountCode: "REFERRER_PAYABLE", side: "credit", amount: row.commission }]
          : []),
        ...(fee > 0n
          ? [{ accountCode: "PLATFORM_FEE_REVENUE", side: "credit", amount: row.fee }]
          : []),
      ],
    })
  }

  const activations = await pool.query(
    `SELECT fee.source_id AS id, wallet.reference_no,
       ABS(wallet.amount)::text AS amount
     FROM platform_fee_ledger fee
     JOIN merchant_wallet_ledger wallet
       ON wallet.source_type = 'ACTIVATION_FEE'
       AND wallet.source_id = fee.source_id
     WHERE fee.source_type = 'ACTIVATION_FEE'`,
  )
  for (const row of activations.rows) {
    await postOrSuspend({
      sourceType: "ACTIVATION_FEE",
      sourceId: row.id,
      reference: row.reference_no,
      suspenseAmount: row.amount,
      lines: [
        { accountCode: "MERCHANT_PAYABLE", side: "debit", amount: row.amount },
        { accountCode: "PLATFORM_FEE_REVENUE", side: "credit", amount: row.amount },
      ],
    })
  }

  const disbursements = await pool.query(
    `SELECT transfer.id, transfer.merchant_reference_no AS reference,
       transfer.amount::text AS amount, transfer.transfer_fee::text AS transfer_fee,
       transfer.refund_payment_id,
       COALESCE(collection.amount, 0)::text AS refund_gross,
       COALESCE(collection_fee.amount, 0)::text AS refund_fee,
       COALESCE(commission.amount, 0)::text AS refund_commission
     FROM disbursements transfer
     JOIN merchant_wallet_ledger wallet
       ON wallet.source_type = 'DISBURSEMENT' AND wallet.source_id = transfer.id
     LEFT JOIN payment_links collection ON collection.id = transfer.refund_payment_id
     LEFT JOIN platform_fee_ledger collection_fee
       ON collection_fee.source_type = 'COLLECTION'
       AND collection_fee.source_id = transfer.refund_payment_id
     LEFT JOIN downline_commissions commission
       ON commission.payment_id = transfer.refund_payment_id
     WHERE transfer.status IN ('EXECUTED', 'SUCCESS', 'COMPLETED')`,
  )
  for (const row of disbursements.rows) {
    const fee = parseMinorUnits(
      row.refund_payment_id ? row.refund_fee : row.transfer_fee,
    )
    const gross = parseMinorUnits(
      row.refund_payment_id ? row.refund_gross : row.amount,
    )
    const commission = parseMinorUnits(row.refund_commission)
    const net = row.refund_payment_id
      ? subtractMinorUnits(subtractMinorUnits(gross, fee), commission)
      : addMinorUnits(gross, fee)
    await postOrSuspend({
      sourceType: "DISBURSEMENT",
      sourceId: row.id,
      reference: row.reference,
      suspenseAmount: formatMinorUnits(gross),
      lines: row.refund_payment_id
        ? [
            ...(net > 0n
              ? [{ accountCode: "MERCHANT_PAYABLE", side: "debit", amount: formatMinorUnits(net) }]
              : []),
            ...(commission > 0n
              ? [{ accountCode: "REFERRER_PAYABLE", side: "debit", amount: formatMinorUnits(commission) }]
              : []),
            ...(fee > 0n
              ? [{ accountCode: "PLATFORM_FEE_REVENUE", side: "debit", amount: formatMinorUnits(fee) }]
              : []),
            { accountCode: "BANK_CLEARING", side: "credit", amount: formatMinorUnits(gross) },
          ]
        : [
            {
              accountCode: "MERCHANT_PAYABLE",
              side: "debit",
              amount: formatMinorUnits(net),
            },
            { accountCode: "BANK_CLEARING", side: "credit", amount: formatMinorUnits(gross) },
            ...(fee > 0n
              ? [{ accountCode: "PLATFORM_FEE_REVENUE", side: "credit", amount: formatMinorUnits(fee) }]
              : []),
          ],
    })
  }

  const reversedDisbursements = await pool.query(
    `SELECT transfer.id, transfer.merchant_reference_no AS reference,
       transfer.amount::text AS amount, transfer.transfer_fee::text AS transfer_fee,
       transfer.refund_payment_id, collection.amount::text AS refund_gross,
       COALESCE(collection_fee.amount, 0)::text AS refund_fee,
       COALESCE(commission.amount, 0)::text AS refund_commission
     FROM disbursements transfer
     JOIN merchant_wallet_ledger reversal
       ON reversal.source_type = 'DISBURSEMENT_REVERSAL'
       AND reversal.source_id = transfer.id
     LEFT JOIN payment_links collection ON collection.id = transfer.refund_payment_id
     LEFT JOIN platform_fee_ledger collection_fee
       ON collection_fee.source_type = 'COLLECTION'
       AND collection_fee.source_id = transfer.refund_payment_id
     LEFT JOIN downline_commissions commission
       ON commission.payment_id = transfer.refund_payment_id
     WHERE transfer.status = 'REVERSED'`,
  )
  for (const row of reversedDisbursements.rows) {
    const fee = parseMinorUnits(
      row.refund_payment_id ? row.refund_fee : row.transfer_fee,
    )
    const gross = parseMinorUnits(
      row.refund_payment_id ? row.refund_gross : row.amount,
    )
    const commission = parseMinorUnits(row.refund_commission)
    const merchantAmount = row.refund_payment_id
      ? subtractMinorUnits(subtractMinorUnits(gross, fee), commission)
      : addMinorUnits(gross, fee)
    await postOrSuspend({
      sourceType: "DISBURSEMENT_REVERSAL",
      sourceId: row.id,
      reference: row.reference,
      suspenseAmount: formatMinorUnits(gross),
      lines: [
        { accountCode: "BANK_CLEARING", side: "debit", amount: formatMinorUnits(gross) },
        ...(merchantAmount > 0n
          ? [{ accountCode: "MERCHANT_PAYABLE", side: "credit", amount: formatMinorUnits(merchantAmount) }]
          : []),
        ...(row.refund_payment_id && commission > 0n
          ? [{ accountCode: "REFERRER_PAYABLE", side: "credit", amount: formatMinorUnits(commission) }]
          : []),
        ...(fee > 0n
          ? [{ accountCode: "PLATFORM_FEE_REVENUE", side: "credit", amount: formatMinorUnits(fee) }]
          : []),
      ],
    })
  }

  const adjustments = await pool.query(
    `SELECT id, reference_no, amount::text AS amount
     FROM merchant_wallet_adjustments`,
  )
  for (const row of adjustments.rows) {
    const signedAmount = parseMinorUnits(row.amount)
    const amount = formatMinorUnits(signedAmount < 0n ? -signedAmount : signedAmount)
    await postOrSuspend({
      sourceType: "MERCHANT_WALLET_ADJUSTMENT",
      sourceId: row.id,
      reference: row.reference_no,
      suspenseAmount: amount,
      lines:
        signedAmount > 0n
          ? [
              { accountCode: "OPERATIONS_SUSPENSE", side: "debit", amount },
              { accountCode: "MERCHANT_PAYABLE", side: "credit", amount },
            ]
          : [
              { accountCode: "MERCHANT_PAYABLE", side: "debit", amount },
              { accountCode: "OPERATIONS_SUSPENSE", side: "credit", amount },
            ],
    })
  }

  const internalAdjustments = await pool.query(
    `SELECT id, reason, amount::text AS amount
     FROM internal_wallet_adjustments
     WHERE adjusted_by NOT LIKE 'system:%'
       AND reason NOT LIKE 'Floating-balance transfer request %'`,
  )
  for (const row of internalAdjustments.rows) {
    const signedAmount = parseMinorUnits(row.amount)
    const amount = formatMinorUnits(signedAmount < 0n ? -signedAmount : signedAmount)
    await postOrSuspend({
      sourceType: "INTERNAL_WALLET_ADJUSTMENT",
      sourceId: row.id,
      reference: row.id,
      suspenseAmount: amount,
      lines:
        signedAmount > 0n
          ? [
              { accountCode: "OPERATIONS_SUSPENSE", side: "debit", amount },
              { accountCode: "MERCHANT_FLOATING_PAYABLE", side: "credit", amount },
            ]
          : [
              { accountCode: "MERCHANT_FLOATING_PAYABLE", side: "debit", amount },
              { accountCode: "OPERATIONS_SUSPENSE", side: "credit", amount },
            ],
    })
  }

  const floatingTransfers = await pool.query(
    `SELECT id, amount::text AS amount, transfer_fee::text AS transfer_fee,
       payout_reference
     FROM floating_transfer_requests WHERE status = 'SUCCESSFUL'`,
  )
  for (const row of floatingTransfers.rows) {
    const amount = parseMinorUnits(row.amount)
    const fee = parseMinorUnits(row.transfer_fee)
    await postOrSuspend({
      sourceType: "FLOATING_TRANSFER",
      sourceId: row.id,
      reference: row.payout_reference || row.id,
      suspenseAmount: formatMinorUnits(addMinorUnits(amount, fee)),
      lines: [
        {
          accountCode: "MERCHANT_FLOATING_PAYABLE",
          side: "debit",
          amount: formatMinorUnits(addMinorUnits(amount, fee)),
        },
        { accountCode: "BANK_CLEARING", side: "credit", amount: row.amount },
        ...(fee > 0n
          ? [{ accountCode: "PLATFORM_FEE_REVENUE", side: "credit", amount: row.transfer_fee }]
          : []),
      ],
    })
  }

  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES ('accounting_journal_backfill_v1', 'complete')
     ON CONFLICT (setting_key) DO UPDATE SET
       setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
  )
}

async function initializeDatabase() {
  const initializationStartedAt = Date.now()
  console.info("Database schema initialization started")
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_accounts (
      email TEXT PRIMARY KEY,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      referral_code TEXT,
      referred_by_email TEXT REFERENCES merchant_accounts(email) ON DELETE SET NULL,
      downline_manually_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      business_name TEXT NOT NULL DEFAULT '',
      contact_person TEXT NOT NULL DEFAULT '',
      phone_number TEXT NOT NULL DEFAULT '',
      business_address TEXT NOT NULL DEFAULT '',
      invitation_accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMPTZ;
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS registration_pending BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS referral_code TEXT;
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS referred_by_email TEXT REFERENCES merchant_accounts(email) ON DELETE SET NULL;
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS downline_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS downline_manually_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE merchant_accounts
      DROP CONSTRAINT IF EXISTS merchant_accounts_downline_commission_rate_check;
    ALTER TABLE merchant_accounts
      ADD CONSTRAINT merchant_accounts_downline_commission_rate_check
      CHECK (downline_commission_rate >= 0 AND downline_commission_rate <= ${MAX_DOWNLINE_COMMISSION_PERCENT});
    CREATE UNIQUE INDEX IF NOT EXISTS merchant_accounts_referral_code_idx
      ON merchant_accounts (referral_code) WHERE referral_code IS NOT NULL;
    UPDATE merchant_accounts
      SET referral_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 16))
      WHERE referral_code IS NULL;
    CREATE TABLE IF NOT EXISTS merchant_usdt_wallets (
      merchant_email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE ON UPDATE CASCADE,
      address TEXT NOT NULL UNIQUE,
      network TEXT NOT NULL DEFAULT 'TRON_MAINNET' CHECK (network IN ('TRON_SHASTA', 'TRON_MAINNET')),
      assigned_by TEXT NOT NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      starting_balance NUMERIC(24, 6),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE merchant_usdt_wallets
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE merchant_usdt_wallets
      ADD COLUMN IF NOT EXISTS starting_balance NUMERIC(24, 6);
    CREATE TABLE IF NOT EXISTS crypto_withdrawal_requests (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      amount NUMERIC(20, 6) NOT NULL CHECK (amount > 0),
      from_address TEXT NOT NULL,
      destination TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'REJECTED')),
      transaction_id TEXT,
      rejection_reason TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT
    );
    CREATE INDEX IF NOT EXISTS crypto_withdrawal_requests_merchant_idx
      ON crypto_withdrawal_requests (merchant_email, requested_at DESC);
    CREATE INDEX IF NOT EXISTS crypto_withdrawal_requests_pending_idx
      ON crypto_withdrawal_requests (requested_at ASC) WHERE status = 'PENDING';
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
    CREATE TABLE IF NOT EXISTS merchant_registration_otps (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ,
      referral_code TEXT,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customer_accounts (
      email TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
      email_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_authenticated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customer_email_otps (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS customer_email_otps_email_created_idx
      ON customer_email_otps (email, created_at DESC);
    ALTER TABLE merchant_registration_otps
      DROP COLUMN IF EXISTS business_name,
      DROP COLUMN IF EXISTS contact_person,
      DROP COLUMN IF EXISTS business_address;
    ALTER TABLE merchant_registration_otps
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
    ALTER TABLE merchant_registration_otps
      ADD COLUMN IF NOT EXISTS referral_code TEXT;
    ALTER TABLE merchant_registration_otps
      ADD COLUMN IF NOT EXISTS sumsub_external_user_id TEXT,
      ADD COLUMN IF NOT EXISTS sumsub_applicant_id TEXT,
      ADD COLUMN IF NOT EXISTS sumsub_review_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      ADD COLUMN IF NOT EXISTS sumsub_review_answer TEXT,
      ADD COLUMN IF NOT EXISTS sumsub_last_event_type TEXT,
      ADD COLUMN IF NOT EXISTS sumsub_consent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS sumsub_consent_version TEXT,
      ADD COLUMN IF NOT EXISTS sumsub_registration_data JSONB;
    CREATE UNIQUE INDEX IF NOT EXISTS merchant_registration_sumsub_external_user_idx
      ON merchant_registration_otps (sumsub_external_user_id)
      WHERE sumsub_external_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS merchant_registration_otps_email_created_idx
      ON merchant_registration_otps (email, created_at DESC);
    CREATE TABLE IF NOT EXISTS merchant_registration_documents (
      id UUID PRIMARY KEY,
      challenge_id UUID NOT NULL REFERENCES merchant_registration_otps(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL CHECK (document_type IN ('business_registration', 'identity_front', 'identity_back', 'proof_of_address')),
      object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (challenge_id, document_type)
    );
    CREATE TABLE IF NOT EXISTS merchant_devices (
      email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      device_token_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (email, device_token_hash)
    );
    UPDATE merchant_accounts account
    SET invitation_accepted_at = devices.first_verified_at
    FROM (
      SELECT email, MIN(created_at) AS first_verified_at
      FROM merchant_devices
      GROUP BY email
    ) devices
    WHERE account.email = devices.email
      AND account.invitation_accepted_at IS NULL;
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
    CREATE TABLE IF NOT EXISTS merchant_auth_identities (
      provider TEXT NOT NULL CHECK (provider IN ('google', 'telegram')),
      provider_subject TEXT NOT NULL,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE ON UPDATE CASCADE,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (provider, provider_subject),
      UNIQUE (merchant_email, provider)
    );
    CREATE TABLE IF NOT EXISTS merchant_passkeys (
      credential_id TEXT PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE ON UPDATE CASCADE,
      public_key BYTEA NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS merchant_passkeys_email_idx
      ON merchant_passkeys (merchant_email);
    CREATE TABLE IF NOT EXISTS merchant_auth_challenges (
      id UUID PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('google', 'passkey', 'telegram')),
      purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login', 'link')),
      merchant_email TEXT REFERENCES merchant_accounts(email) ON DELETE CASCADE ON UPDATE CASCADE,
      challenge TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'merchant_auth_challenges'::regclass
          AND conname = 'merchant_auth_challenges_provider_check'
          AND pg_get_constraintdef(oid) LIKE '%google%'
      ) THEN
        ALTER TABLE merchant_auth_challenges
          DROP CONSTRAINT IF EXISTS merchant_auth_challenges_provider_check;
        ALTER TABLE merchant_auth_challenges
          ADD CONSTRAINT merchant_auth_challenges_provider_check
          CHECK (provider IN ('google', 'passkey', 'telegram'));
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS merchant_auth_challenges_expiry_idx
      ON merchant_auth_challenges (expires_at);
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
    CREATE TABLE IF NOT EXISTS api_rate_limit_hits (
      scope_key TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      hits INTEGER NOT NULL CHECK (hits >= 0),
      PRIMARY KEY (scope_key, window_start)
    );
    CREATE INDEX IF NOT EXISTS api_rate_limit_hits_window_idx
      ON api_rate_limit_hits (window_start);
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
      source_type TEXT NOT NULL CHECK (source_type IN (${platformFeeLedgerSourceTypesSql})),
      source_id UUID NOT NULL,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 0 OR source_type = 'DISBURSEMENT_REVERSAL'),
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
    CREATE TABLE IF NOT EXISTS accounting_journal_entries (
      id UUID PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id UUID NOT NULL,
      reference TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_type, source_id)
    );
    CREATE TABLE IF NOT EXISTS accounting_journal_lines (
      id UUID PRIMARY KEY,
      entry_id UUID NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
      line_number INTEGER NOT NULL CHECK (line_number > 0),
      account_code TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (entry_id, line_number)
    );
    CREATE INDEX IF NOT EXISTS accounting_journal_lines_account_created_idx
      ON accounting_journal_lines (account_code, created_at DESC);
    CREATE TABLE IF NOT EXISTS bank_reconciliation_batches (
      id UUID PRIMARY KEY,
      filename TEXT NOT NULL,
      content_hash TEXT,
      uploaded_by TEXT NOT NULL,
      row_count INTEGER NOT NULL CHECK (row_count > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE bank_reconciliation_batches
      ADD COLUMN IF NOT EXISTS content_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_batches_hash_idx
      ON bank_reconciliation_batches (content_hash)
      WHERE content_hash IS NOT NULL;
    CREATE TABLE IF NOT EXISTS financial_reconciliation_cases (
      id UUID PRIMARY KEY,
      source_type TEXT NOT NULL CHECK (source_type IN ('SWIFTPAY', 'BANK_CSV')),
      batch_id UUID REFERENCES bank_reconciliation_batches(id) ON DELETE RESTRICT,
      line_number INTEGER,
      external_reference TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL,
      external_status TEXT NOT NULL,
      internal_id UUID,
      internal_reference TEXT,
      status TEXT NOT NULL CHECK (status IN (
        'matched', 'amount_mismatch', 'currency_mismatch',
        'status_mismatch', 'unmatched_suspense', 'provider_retry'
      )),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((source_type = 'BANK_CSV') = (batch_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_case_line_unique_idx
      ON financial_reconciliation_cases (batch_id, line_number)
      WHERE batch_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS swiftpay_reconciliation_external_ref_unique_idx
      ON financial_reconciliation_cases (source_type, external_reference)
      WHERE source_type = 'SWIFTPAY';
    CREATE INDEX IF NOT EXISTS financial_reconciliation_cases_created_idx
      ON financial_reconciliation_cases (created_at DESC);
    CREATE TABLE IF NOT EXISTS accounting_suspense_items (
      id UUID PRIMARY KEY,
      reconciliation_case_id UUID NOT NULL UNIQUE
        REFERENCES financial_reconciliation_cases(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      owner_email TEXT,
      owner_assigned_at TIMESTAMPTZ,
      resolution_note TEXT,
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE accounting_suspense_items
      ADD COLUMN IF NOT EXISTS owner_email TEXT;
    ALTER TABLE accounting_suspense_items
      ADD COLUMN IF NOT EXISTS owner_assigned_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS accounting_suspense_events (
      id UUID PRIMARY KEY,
      suspense_item_id UUID NOT NULL
        REFERENCES accounting_suspense_items(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL CHECK (event_type IN ('assigned', 'resolved')),
      actor_email TEXT NOT NULL,
      owner_email TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS accounting_suspense_events_item_idx
      ON accounting_suspense_events (suspense_item_id, created_at);
    ALTER TABLE merchant_wallet_ledger
      DROP CONSTRAINT IF EXISTS merchant_wallet_ledger_source_type_check;
    ALTER TABLE merchant_wallet_ledger
      ADD CONSTRAINT merchant_wallet_ledger_source_type_check
      CHECK (source_type IN (
        'COLLECTION', 'DISBURSEMENT', 'ACTIVATION_FEE',
        'DISBURSEMENT_REVERSAL', 'DOWNLINE_COMMISSION',
        'DOWNLINE_COMMISSION_REVERSAL', 'DOWNLINE_COMMISSION_RESTORATION'
      ));
    CREATE TABLE IF NOT EXISTS merchant_wallet_adjustments (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      amount NUMERIC(18, 2) NOT NULL CHECK (amount <> 0),
      reference_no TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL,
      adjusted_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    ALTER TABLE merchant_api_keys
      ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['read'];
    ALTER TABLE merchant_api_keys
      ADD COLUMN IF NOT EXISTS merchant_email TEXT;
    DO $migration$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant_api_keys'
          AND column_name = 'email'
      ) THEN
        UPDATE merchant_api_keys
        SET merchant_email = email
        WHERE merchant_email IS NULL;

        ALTER TABLE merchant_api_keys
          ALTER COLUMN email DROP NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM merchant_api_keys WHERE merchant_email IS NULL
      ) THEN
        RAISE EXCEPTION 'Could not associate every merchant API key with a merchant account';
      END IF;

      ALTER TABLE merchant_api_keys
        ALTER COLUMN merchant_email SET NOT NULL;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'merchant_api_keys'::regclass
          AND conname = 'merchant_api_keys_merchant_email_fkey'
      ) THEN
        ALTER TABLE merchant_api_keys
          ADD CONSTRAINT merchant_api_keys_merchant_email_fkey
          FOREIGN KEY (merchant_email) REFERENCES merchant_accounts(email)
          ON DELETE CASCADE;
      END IF;
    END
    $migration$;
    CREATE TABLE IF NOT EXISTS merchant_webhook_settings (
      merchant_email TEXT PRIMARY KEY REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      endpoint_url TEXT NOT NULL,
      events TEXT[] NOT NULL,
      signing_secret TEXT NOT NULL,
      callback_url TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE merchant_webhook_settings ADD COLUMN IF NOT EXISTS callback_url TEXT;
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
    CREATE TABLE IF NOT EXISTS admin_staff (
      email TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'finance', 'compliance', 'auditor')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'disabled')),
      password_salt TEXT,
      password_hash TEXT,
      totp_secret_encrypted TEXT,
      totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      last_totp_step BIGINT NOT NULL DEFAULT -1,
      invited_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((password_salt IS NULL) = (password_hash IS NULL))
    );
    CREATE TABLE IF NOT EXISTS admin_staff_invitations (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL REFERENCES admin_staff(email) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('finance', 'compliance', 'auditor')),
      invited_by TEXT NOT NULL REFERENCES admin_staff(email),
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS admin_staff_invitations_pending_idx
      ON admin_staff_invitations (expires_at) WHERE accepted_at IS NULL;
    CREATE TABLE IF NOT EXISTS admin_approval_requests (
      id UUID PRIMARY KEY,
      action_key TEXT NOT NULL,
      target_key TEXT NOT NULL,
      payload JSONB NOT NULL,
      requested_by TEXT NOT NULL REFERENCES admin_staff(email),
      approved_by TEXT REFERENCES admin_staff(email),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'consumed')),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      consumed_at TIMESTAMPTZ,
      CHECK (approved_by IS NULL OR approved_by <> requested_by)
    );
    CREATE INDEX IF NOT EXISTS admin_approval_requests_pending_idx
      ON admin_approval_requests (requested_at DESC) WHERE status = 'pending';
    CREATE TABLE IF NOT EXISTS payment_links (
      id UUID PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
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
      virtual_account_bank_account_number TEXT,
      virtual_account_instapay_bank_code TEXT,
      virtual_account_reference_no TEXT,
      payment_url TEXT,
      checkout_type TEXT NOT NULL DEFAULT 'PAYMENT_LINK',
      payment_token TEXT,
      qr_payload TEXT,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS downline_commissions (
      id UUID PRIMARY KEY,
      payment_id UUID NOT NULL UNIQUE REFERENCES payment_links(id) ON DELETE CASCADE,
      referrer_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      downline_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      rate NUMERIC(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= ${MAX_DOWNLINE_COMMISSION_PERCENT}),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
      reversed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS downline_commissions_referrer_created_idx
      ON downline_commissions (referrer_email, created_at DESC);
    CREATE TABLE IF NOT EXISTS disbursements (
      id UUID PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS transaction_references (
      reference_no TEXT PRIMARY KEY CHECK (reference_no ~ '^[0-9]{6}$'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO transaction_references (reference_no)
      SELECT reference_no FROM payment_links
      WHERE reference_no ~ '^[0-9]{6}$'
      ON CONFLICT (reference_no) DO NOTHING;
    INSERT INTO transaction_references (reference_no)
      SELECT merchant_reference_no FROM disbursements
      WHERE merchant_reference_no ~ '^[0-9]{6}$'
      ON CONFLICT (reference_no) DO NOTHING;
    CREATE TABLE IF NOT EXISTS merchant_push_devices (
      token TEXT PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      app_id TEXT NOT NULL DEFAULT 'ph.drpays.merchant'
        CHECK (app_id IN ('ph.drpays.merchant', 'ph.drpays.merchant.public')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE merchant_push_devices
      ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT 'ph.drpays.merchant';
    DO $migration$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'merchant_push_devices_app_id_check'
      ) THEN
        ALTER TABLE merchant_push_devices
          ADD CONSTRAINT merchant_push_devices_app_id_check
          CHECK (app_id IN ('ph.drpays.merchant', 'ph.drpays.merchant.public'));
      END IF;
    END
    $migration$;
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
    CREATE TABLE IF NOT EXISTS admin_telegram_notifications (
      id UUID PRIMARY KEY,
      event_type TEXT NOT NULL,
      event_id TEXT NOT NULL,
      merchant_email TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
      amount NUMERIC(24, 6) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL,
      reference TEXT NOT NULL,
      details TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempt_at TIMESTAMPTZ,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (event_type, event_id)
    );
    CREATE INDEX IF NOT EXISTS admin_telegram_notifications_pending_idx
      ON admin_telegram_notifications (next_attempt_at, created_at)
      WHERE sent_at IS NULL;
    CREATE TABLE IF NOT EXISTS admin_telegram_wallet_scans (
      merchant_email TEXT PRIMARY KEY,
      first_scan_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    CREATE INDEX IF NOT EXISTS merchant_wallet_adjustments_merchant_created_idx
      ON merchant_wallet_adjustments (merchant_email, created_at DESC);
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
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS virtual_account_bank_account_number TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS virtual_account_instapay_bank_code TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS virtual_account_reference_no TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS merchant_email TEXT REFERENCES merchant_accounts(email) ON DELETE CASCADE;
    ALTER TABLE payment_links
      DROP CONSTRAINT IF EXISTS payment_links_idempotency_key_key;
    CREATE UNIQUE INDEX IF NOT EXISTS payment_links_merchant_idempotency_idx
      ON payment_links (merchant_email, idempotency_key)
      WHERE merchant_email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS payment_links_unowned_idempotency_idx
      ON payment_links (idempotency_key)
      WHERE merchant_email IS NULL;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS customer_email TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS bir_payee_name TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS bir_payee_tin TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS bir_payee_address TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS bir_payor_name TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS bir_payor_tin TEXT;
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS bir_payor_address TEXT;
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
    ALTER TABLE transaction_notifications
      ADD COLUMN IF NOT EXISTS claimed_by TEXT;
    ALTER TABLE transaction_notifications
      ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;
    ALTER TABLE customer_payment_notifications
      ADD COLUMN IF NOT EXISTS claimed_by TEXT;
    ALTER TABLE customer_payment_notifications
      ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;
    ALTER TABLE payment_request_notifications
      ADD COLUMN IF NOT EXISTS claimed_by TEXT;
    ALTER TABLE payment_request_notifications
      ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;
    ALTER TABLE admin_telegram_notifications
      ADD COLUMN IF NOT EXISTS claimed_by TEXT;
    ALTER TABLE admin_telegram_notifications
      ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;
    ALTER TABLE merchant_webhook_deliveries
      ADD COLUMN IF NOT EXISTS claimed_by TEXT;
    ALTER TABLE merchant_webhook_deliveries
      ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;
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
    ALTER TABLE disbursements
      DROP CONSTRAINT IF EXISTS disbursements_idempotency_key_key;
    CREATE UNIQUE INDEX IF NOT EXISTS disbursements_merchant_idempotency_idx
      ON disbursements (merchant_email, idempotency_key)
      WHERE merchant_email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS disbursements_unowned_idempotency_idx
      ON disbursements (idempotency_key)
      WHERE merchant_email IS NULL;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS refund_payment_id UUID REFERENCES payment_links(id);
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS refund_ledger_reversed_at TIMESTAMPTZ;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS transfer_fee NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0);
    ALTER TABLE platform_fee_ledger DROP CONSTRAINT IF EXISTS platform_fee_ledger_source_type_check;
    ALTER TABLE platform_fee_ledger ADD CONSTRAINT platform_fee_ledger_source_type_check
      CHECK (source_type IN (${platformFeeLedgerSourceTypesSql}));
    ALTER TABLE platform_fee_ledger DROP CONSTRAINT IF EXISTS platform_fee_ledger_amount_check;
    ALTER TABLE platform_fee_ledger ADD CONSTRAINT platform_fee_ledger_amount_check
      CHECK (amount >= 0 OR source_type = 'DISBURSEMENT_REVERSAL');
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
    END;
    $migration$;
    CREATE OR REPLACE FUNCTION prevent_financial_record_delete()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'Financial records cannot be deleted; use a correcting entry';
      RETURN OLD;
    END;
    $$;
    DO $migration$
    DECLARE
      table_name TEXT;
      trigger_name TEXT;
    BEGIN
      FOREACH table_name IN ARRAY ARRAY[
        'payment_links', 'disbursements', 'merchant_wallet_ledger',
        'platform_fee_ledger', 'merchant_wallet_adjustments',
        'downline_commissions', 'accounting_journal_entries',
        'accounting_journal_lines', 'bank_reconciliation_batches',
        'financial_reconciliation_cases', 'accounting_suspense_items',
        'accounting_suspense_events'
      ]
      LOOP
        trigger_name := table_name || '_prevent_delete';
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = table_name::regclass
            AND tgname = trigger_name
            AND NOT tgisinternal
        ) THEN
          EXECUTE format(
            'CREATE TRIGGER %I BEFORE DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION prevent_financial_record_delete()',
            trigger_name,
            table_name
          );
        END IF;
      END LOOP;
    END;
    $migration$;
    CREATE INDEX IF NOT EXISTS merchant_push_devices_email_idx ON merchant_push_devices (merchant_email);
    CREATE INDEX IF NOT EXISTS transaction_notifications_pending_idx
      ON transaction_notifications (created_at) WHERE email_sent_at IS NULL OR push_sent_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS disbursements_active_fingerprint_idx
      ON disbursements (request_fingerprint)
      WHERE status IN ('REQUESTING', 'PENDING', 'OUTCOME_UNKNOWN');
  `)
  await ensureMerchantRegistrationDocumentSchema(pool)
  await ensureMerchantKybDocumentSchema(pool)
  await pool.query(
    `INSERT INTO admin_staff
       (email, role, status, password_salt, password_hash)
     VALUES ($1, 'super_admin', 'active', $2, $3)
     ON CONFLICT (email) DO UPDATE SET
       role = 'super_admin', status = 'active',
       password_salt = EXCLUDED.password_salt,
       password_hash = EXCLUDED.password_hash,
       updated_at = NOW()`,
    [
      superAdminEmail,
      passwordSalt,
      scryptSync(superAdminPassword, passwordSalt, 64).toString("hex"),
    ],
  )
  await pool.query(
    `UPDATE admin_staff SET status = 'disabled', updated_at = NOW()
     WHERE role = 'super_admin' AND email <> $1`,
    [superAdminEmail],
  )
  await backfillAccountingJournals()
  console.info("Database schema initialization completed")
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
    INSERT INTO downline_commissions
      (id, payment_id, referrer_email, downline_email, rate, amount, created_at)
    SELECT gen_random_uuid(), payment.id, merchant.referred_by_email,
      payment.merchant_email, 0, 0, payment.created_at
    FROM payment_links payment
    JOIN merchant_wallet_ledger credit
      ON credit.source_type = 'COLLECTION'
      AND credit.source_id = payment.id
      AND credit.merchant_email = payment.merchant_email
    JOIN merchant_accounts merchant ON merchant.email = payment.merchant_email
    WHERE merchant.referred_by_email IS NOT NULL
    ON CONFLICT (payment_id) DO NOTHING
  `)
  await pool.query(`
    INSERT INTO merchant_wallet_ledger (id, merchant_email, source_type, source_id, amount, reference_no, created_at)
    SELECT gen_random_uuid(), d.merchant_email, 'DISBURSEMENT', d.id,
      CASE WHEN d.refund_payment_id IS NOT NULL
        THEN -GREATEST(COALESCE(p.amount, d.amount) - COALESCE(f.amount, 0) - COALESCE(commission.amount, 0), 0)
        ELSE -d.amount
      END,
      d.merchant_reference_no, d.created_at
    FROM disbursements d
    LEFT JOIN payment_links p ON p.id = d.refund_payment_id
    LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
    LEFT JOIN downline_commissions commission ON commission.payment_id = p.id
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
  console.info("Database initialization completed", {
    durationMs: Date.now() - initializationStartedAt,
  })
}

async function swiftPayFetch(
  path,
  { method = "GET", body, headers = {}, timeoutMs = 12_000 } = {},
) {
  requireSwiftPayCredentials()
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

function requireSwiftPayCredentials() {
  if (!swiftPayAccessKey || !swiftPaySecretKey) {
    const error = new Error(
      "SwiftPay credentials are not configured for this environment.",
    )
    error.status = 503
    throw error
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
  requireSwiftPayCredentials()
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
  const authorization = req.get("authorization")
  const bearerToken = getBearerToken(authorization)
  if (!bearerToken || !jwtSecret)
    return res.status(401).json({ error: "Sign in is required." })
  if (bearerToken.startsWith("drp_")) {
    if (!bearerToken.startsWith(`drp_${swiftPayEnvironment}_`)) {
      return res.status(401).json({
        error:
          "The API key is invalid or belongs to another payment environment.",
      })
    }
    const keyHash = createHash("sha256").update(bearerToken).digest("hex")
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
    ;({ payload } = await jwtVerify(bearerToken, jwtSecret, {
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

async function requireCustomer(req, res, next) {
  const bearerToken = getBearerToken(req.get("authorization"))
  if (!bearerToken || !jwtSecret) {
    return res.status(401).json({ error: "Customer sign-in is required." })
  }
  let payload
  try {
    ;({ payload } = await jwtVerify(bearerToken, jwtSecret, {
      algorithms: ["HS256"],
    }))
  } catch {
    return res
      .status(401)
      .json({ error: "Your customer session has expired. Sign in again." })
  }
  if (!isCustomerSession(payload)) {
    return res
      .status(401)
      .json({ error: "A customer session is required." })
  }
  const account = await pool.query(
    `SELECT status, email_verified_at
     FROM customer_accounts WHERE email = $1`,
    [payload.sub],
  )
  if (
    account.rows[0]?.status !== "active" ||
    !account.rows[0]?.email_verified_at
  ) {
    return res.status(401).json({ error: "This customer account is unavailable." })
  }
  req.customerEmail = payload.sub
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
            lookup: createPinnedLookup(address),
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

async function queueTransactionWebhook(
  transactionType,
  transactionId,
  executor = pool,
) {
  const query =
    transactionType === "PAYMENT"
      ? `SELECT merchant_email, id, reference_no, amount, currency, status FROM payment_links WHERE id = $1`
      : `SELECT merchant_email, id, merchant_reference_no AS reference_no, amount, 'PHP' AS currency, status FROM disbursements WHERE id = $1`
  const result = await executor.query(query, [transactionId])
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
  const configured = await executor.query(
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
  await executor.query(
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
  const deliveries = await claimPendingOutboxRows(
    "merchant_webhook_deliveries",
    `SELECT d.id, d.merchant_email, d.event_type, d.payload, d.attempts,
       s.endpoint_url, s.callback_url, s.signing_secret, s.events
     FROM merchant_webhook_deliveries d
     JOIN merchant_webhook_settings s ON s.merchant_email = d.merchant_email AND s.enabled = TRUE
     WHERE d.delivered_at IS NULL AND d.next_attempt_at <= NOW()
       AND d.attempts < 8 AND d.event_type = ANY(s.events)
       AND (d.claimed_until IS NULL OR d.claimed_until < NOW())
     ORDER BY d.created_at ASC LIMIT 25
     FOR UPDATE OF d SKIP LOCKED`,
    [],
  )
  for (const delivery of deliveries) {
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
        `UPDATE merchant_webhook_deliveries
         SET delivered_at = NOW(), last_attempt_at = NOW(),
           attempts = attempts + 1, last_error = NULL,
           claimed_by = NULL, claimed_until = NULL
         WHERE id = $1 AND claimed_by = $2`,
        [delivery.id, notificationWorkerId],
      )
    } else {
      const delaySeconds = Math.min(3600, 30 * 2 ** delivery.attempts)
      await pool.query(
        `UPDATE merchant_webhook_deliveries
         SET attempts = attempts + 1, last_error = $3,
           last_attempt_at = NOW(), next_attempt_at = NOW() + ($2 * INTERVAL '1 second'),
           claimed_by = NULL, claimed_until = NULL
         WHERE id = $1 AND claimed_by = $4`,
        [
          delivery.id,
          delaySeconds,
          failures.join(" ").slice(0, 500),
          notificationWorkerId,
        ],
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
        new DeleteObjectCommand({
          Bucket: r2BucketName,
          Key: upload.object_key,
        }),
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

async function requireAdminSession(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "")
  if (!match || !jwtSecret)
    return res.status(401).json({ error: "Restricted sign-in is required." })
  try {
    const { payload } = await jwtVerify(match[1], jwtSecret, {
      algorithms: ["HS256"],
    })
    if (
      payload.purpose !== "admin_session" ||
      typeof payload.sub !== "string" ||
      !["super_admin", "finance", "compliance", "auditor"].includes(
        payload.role,
      )
    ) {
      throw new Error("Invalid session")
    }
    const staff = await pool.query(
      `SELECT role FROM admin_staff
       WHERE email = $1 AND role = $2 AND status = 'active' AND totp_enabled = TRUE`,
      [payload.sub, payload.role],
    )
    if (!staff.rowCount) throw new Error("Inactive operations session")
    req.adminEmail = payload.sub
    req.adminRole = staff.rows[0].role
    return next()
  } catch {
    return res
      .status(401)
      .json({ error: "Your session has expired. Sign in again." })
  }
}

function requireAdminPermission(req, res, next) {
  const path = req.originalUrl.split("?")[0]
  if (!canAdminAccess(req.adminRole, req.method, path)) {
    return res.status(403).json({
      error: "Your operations role cannot perform this action.",
    })
  }
  return next()
}

function hashAdminInvitationToken(token) {
  return createHash("sha256").update(token).digest("hex")
}

function isValidStaffPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    password.length <= 256
  )
}

async function createAdminChallengeToken(email, role, purpose) {
  return new SignJWT({ adminEmail: email, role, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(purpose === "admin_session" ? "1h" : "10m")
    .sign(jwtSecret)
}

async function verifyAdminChallengeToken(token, allowedPurposes) {
  if (!jwtSecret || typeof token !== "string") return null
  try {
    const { payload } = await jwtVerify(token, jwtSecret, {
      algorithms: ["HS256"],
    })
    if (
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string" ||
      !allowedPurposes.includes(payload.purpose)
    ) {
      return null
    }
    return {
      email: payload.sub,
      role: payload.role,
      purpose: payload.purpose,
    }
  } catch {
    return null
  }
}

async function issueAdminSession(email, role) {
  const accessToken = await createAdminChallengeToken(
    email,
    role,
    "admin_session",
  )
  return {
    accessToken,
    expiresInSeconds: 60 * 60,
    email,
    role,
    authenticated: true,
  }
}

async function issueAdminMfaChallenge(email, role, purpose) {
  return {
    accessToken: await createAdminChallengeToken(email, role, purpose),
    expiresInSeconds: 10 * 60,
    email,
    role,
    requiresMfaSetup: purpose === "admin_mfa_setup",
    requiresMfa: purpose === "admin_mfa_verify",
  }
}

async function prepareAdminApproval({
  req,
  res,
  actionKey,
  targetKey,
  payload,
}) {
  const approvalRequestId =
    typeof req.body?.approvalRequestId === "string"
      ? req.body.approvalRequestId
      : ""
  if (!approvalRequestId) {
    const requestId = randomUUID()
    await pool.query(
      `INSERT INTO admin_approval_requests
         (id, action_key, target_key, payload, requested_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        requestId,
        actionKey,
        targetKey,
        JSON.stringify(payload),
        req.adminEmail,
      ],
    )
    return {
      requestId,
      response: res.status(202).json({
        approvalRequired: true,
        approvalRequestId: requestId,
        status: "pending",
      }),
    }
  }
  const existing = await pool.query(
    `SELECT id FROM admin_approval_requests
     WHERE id = $1 AND action_key = $2 AND target_key = $3
       AND payload = $4::jsonb AND requested_by = $5
       AND status = 'approved' AND approved_by <> $5`,
    [
      approvalRequestId,
      actionKey,
      targetKey,
      JSON.stringify(payload),
      req.adminEmail,
    ],
  )
  if (!existing.rowCount) {
    return {
      error: res.status(409).json({
        error:
          "A different authorized staff member must approve this exact action before it can proceed.",
      }),
    }
  }
  return { requestId: approvalRequestId }
}

async function consumeAdminApproval(
  client,
  { requestId, actionKey, targetKey, payload, actor },
) {
  const consumed = await client.query(
    `UPDATE admin_approval_requests
     SET status = 'consumed', consumed_at = NOW()
     WHERE id = $1 AND action_key = $2 AND target_key = $3
       AND payload = $4::jsonb AND approved_by <> $5 AND status = 'approved'
     RETURNING id`,
    [requestId, actionKey, targetKey, JSON.stringify(payload), actor],
  )
  return consumed.rowCount === 1
}

function walletAdjustmentJournalLines(amountMinor, payableAccount) {
  const amount = formatMinorUnits(amountMinor < 0n ? -amountMinor : amountMinor)
  return amountMinor > 0n
    ? [
        { accountCode: "OPERATIONS_SUSPENSE", side: "debit", amount },
        { accountCode: payableAccount, side: "credit", amount },
      ]
    : [
        { accountCode: payableAccount, side: "debit", amount },
        { accountCode: "OPERATIONS_SUSPENSE", side: "credit", amount },
      ]
}

app.get("/healthz", async (_req, res) => {
  return res.json({ status: "ok", paymentEnvironment: swiftPayEnvironment })
})

let databaseReady = false

app.get("/readyz", async (_req, res) => {
  if (!databaseReady) {
    return res.status(503).json({ status: "unavailable" })
  }
  try {
    await pool.query("SELECT 1")
    return res.json({ status: "ok", paymentEnvironment: swiftPayEnvironment })
  } catch {
    return res.status(503).json({ status: "unavailable" })
  }
})

app.post(
  "/v1/customer/auth/request-otp",
  customerOtpLimiter,
  async (req, res) => {
    const email = normalizeCustomerEmail(req.body?.email)
    if (!email) {
      return res.status(400).json({ error: "Enter a valid email address." })
    }

    const client = await pool.connect()
    const challengeId = randomUUID()
    const code = String(randomInt(100_000, 1_000_000))
    let transactionOpen = false
    try {
      await client.query("BEGIN")
      transactionOpen = true
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email])
      await client.query(
        `DELETE FROM customer_email_otps
         WHERE created_at < NOW() - INTERVAL '30 days'`,
      )
      const recentRequest = await client.query(
        `SELECT id FROM customer_email_otps
         WHERE email = $1 AND consumed_at IS NULL AND attempts < 5
           AND expires_at > NOW()
           AND created_at > NOW() - INTERVAL '60 seconds'
         ORDER BY created_at DESC LIMIT 1`,
        [email],
      )
      if (recentRequest.rowCount) {
        await client.query("COMMIT")
        transactionOpen = false
        return res.set("Cache-Control", "no-store").json({
          challengeId: recentRequest.rows[0].id,
          message: "If the address is valid, a sign-in code has been sent.",
        })
      }
      const recentRequests = await client.query(
        `SELECT COUNT(*)::int AS count FROM customer_email_otps
         WHERE email = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
        [email],
      )
      if (recentRequests.rows[0].count >= 5) {
        await client.query("COMMIT")
        transactionOpen = false
        return res.status(429).json({
          error: "Too many sign-in codes requested. Try again in 15 minutes.",
        })
      }
      await client.query(
        `UPDATE customer_email_otps SET consumed_at = NOW()
         WHERE email = $1 AND consumed_at IS NULL`,
        [email],
      )
      await client.query(
        `INSERT INTO customer_email_otps
         (id, email, code_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
        [
          challengeId,
          email,
          createCustomerOtpHash(jwtSecretValue, challengeId, email, code),
        ],
      )
      await client.query("COMMIT")
      transactionOpen = false
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }

    try {
      await sendCustomerOtp(email, code)
    } catch {
      await pool.query("DELETE FROM customer_email_otps WHERE id = $1", [
        challengeId,
      ])
      return res.status(503).json({
        error: "Verification email could not be sent. Try again later.",
      })
    }
    return res.set("Cache-Control", "no-store").json({
      challengeId,
      message: "If the address is valid, a sign-in code has been sent.",
    })
  },
)

app.post(
  "/v1/customer/auth/verify-otp",
  customerOtpLimiter,
  async (req, res) => {
    const email = normalizeCustomerEmail(req.body?.email)
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : ""
    const challengeId =
      typeof req.body?.challengeId === "string" ? req.body.challengeId : ""
    if (
      !email ||
      !/^\d{6}$/.test(code) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId,
      )
    ) {
      return res.status(400).json({
        error: "Enter the six-digit code sent to your email address.",
      })
    }

    const client = await pool.connect()
    let transactionOpen = false
    try {
      await client.query("BEGIN")
      transactionOpen = true
      const challenge = await client.query(
        `SELECT code_hash FROM customer_email_otps
         WHERE id = $1 AND email = $2 AND consumed_at IS NULL
           AND expires_at > NOW() AND attempts < 5
         FOR UPDATE`,
        [challengeId, email],
      )
      const record = challenge.rows[0]
      if (!record) {
        await client.query("ROLLBACK")
        transactionOpen = false
        return res.status(401).json({
          error: "That code is invalid or expired. Request a new code.",
        })
      }
      await client.query(
        "UPDATE customer_email_otps SET attempts = attempts + 1 WHERE id = $1",
        [challengeId],
      )
      if (
        !matchesCustomerOtp(
          jwtSecretValue,
          challengeId,
          email,
          code,
          record.code_hash,
        )
      ) {
        await client.query("COMMIT")
        transactionOpen = false
        return res.status(401).json({
          error: "That code is invalid or expired. Request a new code.",
        })
      }

      await client.query(
        `INSERT INTO customer_accounts (email)
         VALUES ($1) ON CONFLICT (email) DO NOTHING`,
        [email],
      )
      const account = await client.query(
        `SELECT status FROM customer_accounts WHERE email = $1 FOR UPDATE`,
        [email],
      )
      if (account.rows[0]?.status !== "active") {
        await client.query(
          "UPDATE customer_email_otps SET consumed_at = NOW() WHERE id = $1",
          [challengeId],
        )
        await client.query("COMMIT")
        transactionOpen = false
        return res.status(403).json({
          error: "This customer account is unavailable.",
        })
      }
      await client.query(
        `UPDATE customer_accounts SET last_authenticated_at = NOW(),
           updated_at = NOW() WHERE email = $1`,
        [email],
      )
      await client.query(
        `UPDATE customer_email_otps SET consumed_at = NOW()
         WHERE email = $1 AND consumed_at IS NULL`,
        [email],
      )
      await client.query("COMMIT")
      transactionOpen = false
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    return res
      .set("Cache-Control", "no-store")
      .json(await issueCustomerSession(email))
  },
)

app.get("/v1/customer/payment-history", requireCustomer, async (req, res) => {
  const result = await pool.query(
    `SELECT reference_no, title, amount::text AS amount, currency, status,
       created_at
     FROM payment_links
     WHERE LOWER(BTRIM(customer_email)) = $1
       AND status IN (
         'CREATING', 'ACTIVE', 'PENDING', 'SETTLEMENT_RETRY',
         'EXECUTED', 'MANUALLY_PAID', 'SUCCESS', 'COMPLETED'
       )
     ORDER BY created_at DESC, reference_no DESC
     LIMIT 100`,
    [req.customerEmail],
  )
  return res.set("Cache-Control", "no-store").json({
    payments: result.rows.flatMap((payment) => {
      const status = customerVisiblePaymentStatus(payment.status)
      if (!status) return []
      return [
        {
          referenceNo: payment.reference_no,
          title: payment.title,
          amount: payment.amount,
          currency: payment.currency,
          status,
          createdAt: payment.created_at,
        },
      ]
    }),
  })
})

app.post("/v1/auth/login", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  const password =
    typeof req.body?.password === "string" ? req.body.password : ""
  if (!email || password.length < 1 || password.length > 256) {
    return res.status(401).json({ error: "Email or password is incorrect." })
  }
  const result = await pool.query(
    `SELECT role, status, password_salt, password_hash, totp_enabled
     FROM admin_staff WHERE email = $1`,
    [email],
  )
  const staff = result.rows[0]
  if (
    !staff ||
    staff.status !== "active" ||
    !staff.password_salt ||
    !staff.password_hash ||
    !matchesPasswordHash(password, staff.password_salt, staff.password_hash)
  ) {
    return res.status(401).json({ error: "Email or password is incorrect." })
  }
  return res
    .set("Cache-Control", "no-store")
    .json(
      await issueAdminMfaChallenge(
        email,
        staff.role,
        staff.totp_enabled ? "admin_mfa_verify" : "admin_mfa_setup",
      ),
    )
})

app.post("/v1/auth/admin/invitation/inspect", loginLimiter, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : ""
  if (!/^[\da-f]{64}$/i.test(token)) {
    return res.status(400).json({ error: "The invitation is invalid or expired." })
  }
  const result = await pool.query(
    `SELECT invitation.email, invitation.role
     FROM admin_staff_invitations invitation
     JOIN admin_staff staff ON staff.email = invitation.email
     WHERE invitation.token_hash = $1 AND invitation.accepted_at IS NULL
       AND invitation.expires_at > NOW() AND staff.status = 'invited'`,
    [hashAdminInvitationToken(token)],
  )
  if (!result.rowCount) {
    return res.status(400).json({ error: "The invitation is invalid or expired." })
  }
  return res.json({
    email: result.rows[0].email,
    role: result.rows[0].role,
  })
})

app.post(
  "/v1/auth/admin/invitation/accept",
  loginLimiter,
  async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : ""
    const password = req.body?.password
    if (
      !/^[\da-f]{64}$/i.test(token) ||
      !isValidStaffPassword(password)
    ) {
      return res.status(400).json({
        error: "Use a valid invitation and a password of at least 12 characters.",
      })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const invitation = await client.query(
        `SELECT invitation.email, invitation.role
         FROM admin_staff_invitations invitation
         JOIN admin_staff staff ON staff.email = invitation.email
         WHERE invitation.token_hash = $1 AND invitation.accepted_at IS NULL
           AND invitation.expires_at > NOW() AND staff.status = 'invited'
         FOR UPDATE OF invitation, staff`,
        [hashAdminInvitationToken(token)],
      )
      if (!invitation.rowCount) {
        await client.query("ROLLBACK")
        return res
          .status(400)
          .json({ error: "The invitation is invalid or expired." })
      }
      const { email, role } = invitation.rows[0]
      const salt = randomBytes(32).toString("hex")
      const passwordHash = scryptSync(password, salt, 64).toString("hex")
      await client.query(
        `UPDATE admin_staff SET status = 'active', password_salt = $2,
           password_hash = $3, updated_at = NOW()
         WHERE email = $1`,
        [email, salt, passwordHash],
      )
      await client.query(
        `UPDATE admin_staff_invitations SET accepted_at = NOW()
         WHERE token_hash = $1`,
        [hashAdminInvitationToken(token)],
      )
      await client.query("COMMIT")
      return res
        .set("Cache-Control", "no-store")
        .json(await issueAdminMfaChallenge(email, role, "admin_mfa_setup"))
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Operations invitation acceptance failed", error)
      return res.status(500).json({ error: "Invitation acceptance failed." })
    } finally {
      client.release()
    }
  },
)

app.post("/v1/auth/admin/mfa/setup", loginLimiter, async (req, res) => {
  const challenge = await verifyAdminChallengeToken(req.body?.accessToken, [
    "admin_mfa_setup",
  ])
  if (!challenge || !adminMfaEncryptionKey) {
    return res.status(401).json({ error: "MFA setup session is invalid or expired." })
  }
  const secret = generateTotpSecret()
  const result = await pool.query(
    `UPDATE admin_staff SET totp_secret_encrypted = $3, totp_enabled = FALSE,
       last_totp_step = -1, updated_at = NOW()
     WHERE email = $1 AND role = $2 AND status = 'active' AND totp_enabled = FALSE
     RETURNING email`,
    [
      challenge.email,
      challenge.role,
      encryptTotpSecret(secret, adminMfaEncryptionKey),
    ],
  )
  if (!result.rowCount) {
    return res.status(409).json({ error: "MFA setup is no longer available." })
  }
  return res
    .set("Cache-Control", "no-store")
    .json({
      secret,
      provisioningUri: totpProvisioningUri(challenge.email, secret),
    })
})

app.post("/v1/auth/admin/mfa/verify", loginLimiter, async (req, res) => {
  const challenge = await verifyAdminChallengeToken(req.body?.accessToken, [
    "admin_mfa_setup",
    "admin_mfa_verify",
  ])
  if (!challenge || !adminMfaEncryptionKey) {
    return res.status(401).json({ error: "MFA session is invalid or expired." })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await client.query(
      `SELECT role, status, totp_enabled, totp_secret_encrypted, last_totp_step
       FROM admin_staff WHERE email = $1 FOR UPDATE`,
      [challenge.email],
    )
    const staff = result.rows[0]
    if (
      !staff ||
      staff.status !== "active" ||
      staff.role !== challenge.role ||
      !staff.totp_secret_encrypted ||
      (challenge.purpose === "admin_mfa_setup" && staff.totp_enabled) ||
      (challenge.purpose === "admin_mfa_verify" && !staff.totp_enabled)
    ) {
      await client.query("ROLLBACK")
      return res.status(401).json({ error: "MFA session is invalid or expired." })
    }
    const secret = decryptTotpSecret(
      staff.totp_secret_encrypted,
      adminMfaEncryptionKey,
    )
    const step = matchingTotpStep(
      secret,
      req.body?.code,
      Date.now(),
      Number(staff.last_totp_step),
    )
    if (step === null) {
      await client.query("ROLLBACK")
      return res.status(401).json({ error: "The authenticator code is invalid." })
    }
    await client.query(
      `UPDATE admin_staff SET totp_enabled = TRUE, last_totp_step = $2,
         updated_at = NOW() WHERE email = $1`,
      [challenge.email, step],
    )
    await client.query("COMMIT")
    return res
      .set("Cache-Control", "no-store")
      .json(await issueAdminSession(challenge.email, challenge.role))
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Operations MFA verification failed", error)
    return res.status(500).json({ error: "MFA verification failed." })
  } finally {
    client.release()
  }
})

app.post(
  "/v1/auth/registration/otp/request",
  registrationOtpLimiter,
  async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : ""
    const phoneNumber =
      typeof req.body?.phoneNumber === "string"
        ? req.body.phoneNumber.trim()
        : ""
    const referralCode =
      typeof req.body?.referralCode === "string"
        ? req.body.referralCode.trim().toUpperCase()
        : ""
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: "Enter a valid email address." })
    }
    if (!/^\+?[0-9()\-\s]{7,40}$/.test(phoneNumber)) {
      return res.status(400).json({
        error: "Enter a valid mobile number.",
      })
    }
    if (referralCode && !/^[A-Z0-9]{16}$/.test(referralCode)) {
      return res
        .status(400)
        .json({ error: "Enter a valid merchant referral code." })
    }
    if (referralCode) {
      const referrer = await pool.query(
        "SELECT email FROM merchant_accounts WHERE referral_code = $1 AND active = TRUE",
        [referralCode],
      )
      if (!referrer.rowCount) {
        return res.status(400).json({
          error: "This merchant referral code is invalid or inactive.",
        })
      }
    }
    const account = await pool.query(
      "SELECT email FROM merchant_accounts WHERE email = $1",
      [email],
    )
    if (account.rowCount) {
      return res.status(409).json({
        error: "An account or registration already exists for this email.",
      })
    }
    await pool.query(
      `DELETE FROM merchant_registration_otps
     WHERE created_at < NOW() - INTERVAL '24 hours'
       AND (sumsub_external_user_id IS NULL OR consumed_at IS NOT NULL)`,
    )
    await pool.query(
      `DELETE FROM merchant_registration_otps
     WHERE created_at < NOW() - INTERVAL '30 days'`,
    )
    const recentRequest = await pool.query(
      `SELECT id, referral_code FROM merchant_registration_otps
     WHERE email = $1 AND created_at > NOW() - INTERVAL '60 seconds'
     ORDER BY created_at DESC LIMIT 1`,
      [email],
    )
    if (recentRequest.rowCount) {
      if ((recentRequest.rows[0].referral_code || "") !== referralCode) {
        return res.status(409).json({
          error:
            "A verification code was already sent with a different referral code. Continue with that code or try again in one minute.",
        })
      }
      return res.set("Cache-Control", "no-store").json({
        challengeId: recentRequest.rows[0].id,
        message: "A verification code has already been sent. Check your email.",
      })
    }
    const recentRequests = await pool.query(
      `SELECT COUNT(*)::int AS count FROM merchant_registration_otps
     WHERE email = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
      [email],
    )
    if (recentRequests.rows[0].count >= 5) {
      return res.status(429).json({
        error:
          "Too many verification codes requested. Try again in 15 minutes.",
      })
    }
    const challengeId = randomUUID()
    const code = String(randomInt(100_000, 1_000_000))
    const codeHash = createHmac("sha256", jwtSecretValue)
      .update(`${challengeId}:${email}:${code}`)
      .digest("hex")
    await pool.query(
      `UPDATE merchant_registration_otps SET consumed_at = NOW()
     WHERE email = $1 AND consumed_at IS NULL`,
      [email],
    )
    await pool.query(
      `INSERT INTO merchant_registration_otps
       (id, email, phone_number, code_hash, referral_code, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')`,
      [challengeId, email, phoneNumber, codeHash, referralCode || null],
    )
    try {
      await sendMerchantOtp(email, code, "registration")
    } catch {
      await pool.query("DELETE FROM merchant_registration_otps WHERE id = $1", [
        challengeId,
      ])
      return res.status(503).json({
        error: "Verification email could not be sent. Try again later.",
      })
    }
    return res
      .set("Cache-Control", "no-store")
      .json({ challengeId, message: "A verification code has been sent." })
  },
)

app.post(
  "/v1/auth/registration/otp/verify",
  registrationLimiter,
  async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : ""
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : ""
    const challengeId =
      typeof req.body?.challengeId === "string" ? req.body.challengeId : ""
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !/^\d{6}$/.test(code) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId,
      )
    ) {
      return res
        .status(400)
        .json({ error: "Enter the six-digit email verification code." })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const challenge = await client.query(
        `SELECT code_hash
       FROM merchant_registration_otps
       WHERE id = $1 AND email = $2 AND consumed_at IS NULL
         AND verified_at IS NULL AND expires_at > NOW() AND attempts < 5
       FOR UPDATE`,
        [challengeId, email],
      )
      const record = challenge.rows[0]
      if (!record) {
        await client.query("ROLLBACK")
        return res
          .status(401)
          .json({
            error: "That code is invalid or expired. Request a new code.",
          })
      }
      await client.query(
        "UPDATE merchant_registration_otps SET attempts = attempts + 1 WHERE id = $1",
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
          error: "That code is incorrect. Check your email and try again.",
        })
      }
      await client.query(
        "UPDATE merchant_registration_otps SET verified_at = NOW() WHERE id = $1",
        [challengeId],
      )
      await client.query("COMMIT")
      return res
        .set("Cache-Control", "no-store")
        .json({ email, status: "verified" })
    } catch (error) {
      await client.query("ROLLBACK")
      if (error.code === "23505") {
        return res.status(409).json({
          error: "An account or registration already exists for this email.",
        })
      }
      throw error
    } finally {
      client.release()
    }
  },
)

app.post(
  "/v1/auth/registration/sumsub/access-token",
  registrationLimiter,
  async (req, res) => {
    const appToken = process.env.SUMSUB_APP_TOKEN
    const secretKey = process.env.SUMSUB_SECRET_KEY
    const levelName = process.env.SUMSUB_KYB_LEVEL_NAME
    const webhookSecret = process.env.SUMSUB_WEBHOOK_SECRET
    if (!appToken || !secretKey || !levelName || !webhookSecret) {
      return res.status(503).json({
        error: "Sumsub verification is not configured. Contact DRPAY support.",
      })
    }

    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : ""
    const challengeId =
      typeof req.body?.challengeId === "string" ? req.body.challengeId : ""
    const ownerEmail =
      typeof req.body?.ownerEmail === "string"
        ? req.body.ownerEmail.trim().toLowerCase()
        : ""
    const ownerPhone =
      typeof req.body?.ownerPhone === "string" ? req.body.ownerPhone.trim() : ""
    const registrationData = {
      businessName:
        typeof req.body?.businessName === "string"
          ? req.body.businessName.trim()
          : "",
      registrationNumber:
        typeof req.body?.registrationNumber === "string"
          ? req.body.registrationNumber.trim()
          : "",
      businessType:
        typeof req.body?.businessType === "string"
          ? req.body.businessType.trim()
          : "",
      country:
        typeof req.body?.country === "string" ? req.body.country.trim() : "",
      businessAddress:
        typeof req.body?.businessAddress === "string"
          ? req.body.businessAddress.trim()
          : "",
      ownerFullName:
        typeof req.body?.ownerFullName === "string"
          ? req.body.ownerFullName.trim()
          : "",
      ownerDateOfBirth:
        typeof req.body?.ownerDateOfBirth === "string"
          ? req.body.ownerDateOfBirth.trim()
          : "",
      ownerNationality:
        typeof req.body?.ownerNationality === "string"
          ? req.body.ownerNationality.trim()
          : "",
      ownerEmail,
      ownerPhone,
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId,
      ) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
      ownerEmail.length > 200 ||
      !/^\+?[0-9()\-\s]{7,40}$/.test(ownerPhone) ||
      !registrationData.businessName ||
      registrationData.businessName.length > 160 ||
      !registrationData.registrationNumber ||
      registrationData.registrationNumber.length > 200 ||
      !registrationData.businessType ||
      registrationData.businessType.length > 200 ||
      !registrationData.country ||
      registrationData.country.length > 200 ||
      !registrationData.businessAddress ||
      registrationData.businessAddress.length > 200 ||
      !registrationData.ownerFullName ||
      registrationData.ownerFullName.length > 200 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(registrationData.ownerDateOfBirth) ||
      !registrationData.ownerNationality ||
      registrationData.ownerNationality.length > 200 ||
      req.body?.consent !== true
    ) {
      return res.status(400).json({
        error:
          "Complete your business and owner details, then accept the Sumsub verification consent.",
      })
    }

    const client = await pool.connect()
    let externalUserId
    let reviewStatus
    try {
      await client.query("BEGIN")
      const challenge = await client.query(
        `SELECT sumsub_external_user_id AS "externalUserId",
                sumsub_review_status AS "reviewStatus",
                sumsub_registration_data IS NULL AS "registrationDataEmpty",
                sumsub_registration_data = $3::jsonb AS "registrationDataMatches"
         FROM merchant_registration_otps
         WHERE id = $1 AND email = $2 AND verified_at IS NOT NULL
           AND consumed_at IS NULL
           AND (
             verified_at > NOW() - INTERVAL '24 hours'
             OR (
               sumsub_external_user_id IS NOT NULL
               AND created_at > NOW() - INTERVAL '30 days'
             )
           )
         FOR UPDATE`,
        [challengeId, email, JSON.stringify(registrationData)],
      )
      if (!challenge.rowCount) {
        await client.query("ROLLBACK")
        return res.status(401).json({
          error: "Verify your email again before starting Sumsub verification.",
        })
      }
      reviewStatus = challenge.rows[0].reviewStatus
      if (["APPROVED", "REJECTED"].includes(reviewStatus)) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error:
            "This Sumsub result is final. Contact DRPAY support if you need to appeal.",
        })
      }
      if (
        !challenge.rows[0].registrationDataEmpty &&
        !challenge.rows[0].registrationDataMatches
      ) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error:
            "Your business or owner details changed after verification started. Request a new email code to restart.",
        })
      }
      externalUserId = challenge.rows[0].externalUserId || randomUUID()
      await client.query(
        `UPDATE merchant_registration_otps
         SET sumsub_external_user_id = $2,
             sumsub_consent_at = COALESCE(sumsub_consent_at, NOW()),
             sumsub_consent_version = 'sumsub-kyb-v1',
             sumsub_registration_data =
               COALESCE(sumsub_registration_data, $3::jsonb)
         WHERE id = $1`,
        [challengeId, externalUserId, JSON.stringify(registrationData)],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }

    let accessToken
    try {
      accessToken = await createSumsubSdkAccessToken({
        appToken,
        secretKey,
        levelName,
        externalUserId,
        email: ownerEmail,
        phone: ownerPhone,
      })
    } catch (error) {
      console.error("Sumsub registration access-token request failed", {
        name: error instanceof Error ? error.name : typeof error,
        status:
          error && typeof error === "object" && "status" in error
            ? error.status
            : null,
        providerErrorName:
          error && typeof error === "object" && "providerErrorName" in error
            ? error.providerErrorName
            : null,
      })
      return res.status(502).json({
        error: "Sumsub is temporarily unavailable. Try again shortly.",
      })
    }

    const updatedChallenge = await pool.query(
      `UPDATE merchant_registration_otps
       SET sumsub_review_status = CASE
             WHEN sumsub_review_status IN ('NOT_STARTED', 'IN_PROGRESS')
               THEN 'IN_PROGRESS'
             ELSE sumsub_review_status
           END
       WHERE id = $1 AND sumsub_external_user_id = $2
         AND sumsub_review_status NOT IN ('APPROVED', 'REJECTED')
       RETURNING sumsub_review_status AS "reviewStatus"`,
      [challengeId, externalUserId],
    )
    if (!updatedChallenge.rowCount) {
      return res.status(409).json({
        error:
          "Your verification changed while connecting to Sumsub. Refresh and try again.",
      })
    }
    return res.set("Cache-Control", "no-store").json({
      accessToken,
      sumsubReviewStatus: updatedChallenge.rows[0].reviewStatus,
    })
  },
)

app.post(
  "/v1/auth/registration/sumsub/status",
  registrationLimiter,
  async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : ""
    const challengeId =
      typeof req.body?.challengeId === "string" ? req.body.challengeId : ""
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId,
      )
    ) {
      return res.status(400).json({ error: "Verify your email to continue." })
    }
    const result = await pool.query(
      `SELECT sumsub_review_status AS "reviewStatus"
       FROM merchant_registration_otps
       WHERE id = $1 AND email = $2 AND verified_at IS NOT NULL
         AND consumed_at IS NULL
         AND (
           verified_at > NOW() - INTERVAL '24 hours'
           OR (
             sumsub_external_user_id IS NOT NULL
             AND created_at > NOW() - INTERVAL '30 days'
           )
         )`,
      [challengeId, email],
    )
    if (!result.rowCount) {
      return res.status(401).json({
        error: "Verify your email again before checking Sumsub status.",
      })
    }
    return res.set("Cache-Control", "no-store").json({
      sumsubReviewStatus: result.rows[0].reviewStatus,
    })
  },
)

app.post(
  "/v1/auth/registration/documents/presign",
  registrationLimiter,
  async (req, res) => {
    if (!r2Client || !r2BucketName) {
      return res.status(503).json({
        error: "Private document storage is not configured on this server.",
      })
    }
    const challengeId =
      typeof req.body?.challengeId === "string" ? req.body.challengeId : ""
    const documentType = req.body?.documentType
    const fileName =
      typeof req.body?.fileName === "string" ? req.body.fileName.trim() : ""
    const contentType = req.body?.contentType
    const normalizedContentType = normalizeDocumentContentType(
      fileName,
      contentType,
    )
    const sizeBytes = Number(req.body?.sizeBytes)
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId,
      ) ||
      !allowedKybDocuments.has(documentType) ||
      !fileName ||
      fileName.length > 180 ||
      /[/\\\u0000-\u001f]/.test(fileName) ||
      !allowedDocumentContentTypes.has(normalizedContentType) ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > kybDocumentMaxBytes
    ) {
      return res.status(400).json({
        error: "Choose a PDF, JPEG, or PNG document no larger than 10 MB.",
      })
    }
    const challenge = await pool.query(
      `SELECT id FROM merchant_registration_otps
       WHERE id = $1 AND verified_at > NOW() - INTERVAL '24 hours'
         AND consumed_at IS NULL`,
      [challengeId],
    )
    if (!challenge.rowCount) {
      return res.status(401).json({
        error: "Verify your email again before uploading documents.",
      })
    }
    const existing = await pool.query(
      `SELECT id, completed_at FROM merchant_registration_documents
       WHERE challenge_id = $1 AND document_type = $2`,
      [challengeId, documentType],
    )
    if (existing.rows[0]?.completed_at) {
      return res.status(409).json({
        error: "This document was already uploaded. Continue to the next step.",
      })
    }
    if (existing.rowCount) {
      await pool.query(
        "DELETE FROM merchant_registration_documents WHERE id = $1",
        [existing.rows[0].id],
      )
    }
    const documentId = randomUUID()
    const objectKey = `kyb/${randomUUID()}`
    const safeName = fileName.replace(/[^\w .()-]/g, "_").slice(0, 180)
    await pool.query(
      `INSERT INTO merchant_registration_documents
         (id, challenge_id, document_type, object_key, file_name, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        documentId,
        challengeId,
        documentType,
        objectKey,
        safeName,
        normalizedContentType,
        sizeBytes,
      ],
    )
    try {
      const uploadUrl = await getPrivateDocumentUploadUrl(
        r2Client,
        r2BucketName,
        objectKey,
        normalizedContentType,
        documentId,
      )
      return res.set("Cache-Control", "no-store").json({
        documentId,
        uploadUrl,
        objectKey,
        fileName: safeName,
        headers: {
          "Content-Type": normalizedContentType,
          "x-amz-meta-document-id": documentId,
        },
        expiresInSeconds: 300,
      })
    } catch (error) {
      await pool.query(
        "DELETE FROM merchant_registration_documents WHERE id = $1",
        [documentId],
      )
      console.error(
        "Could not create private registration document upload",
        error.name || "storage error",
      )
      return res.status(503).json({
        error: "Private document upload is temporarily unavailable.",
      })
    }
  },
)

app.post(
  "/v1/auth/registration/documents/:documentId/upload",
  registrationLimiter,
  express.raw({
    type: ["application/pdf", "image/jpeg", "image/png"],
    limit: kybDocumentMaxBytes,
  }),
  async (req, res) => {
    if (!r2Client || !r2BucketName) {
      return res.status(503).json({
        error: "Private document storage is not configured on this server.",
      })
    }
    const documentId = req.params.documentId
    const challengeId =
      typeof req.query.challengeId === "string" ? req.query.challengeId : ""
    const bytes = req.body
    const contentType = normalizeDocumentContentType(
      "",
      req.get("content-type"),
    )
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        documentId,
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId,
      ) ||
      !Buffer.isBuffer(bytes) ||
      bytes.length === 0 ||
      bytes.length > kybDocumentMaxBytes ||
      !allowedDocumentContentTypes.has(contentType) ||
      !hasValidDocumentSignature(contentType, bytes)
    ) {
      return res.status(400).json({
        error:
          "Choose a valid PDF, JPEG, or PNG document no larger than 10 MB.",
      })
    }
    const reservationResult = await pool.query(
      `SELECT object_key, content_type, size_bytes
       FROM merchant_registration_documents
       WHERE id = $1 AND challenge_id = $2 AND completed_at IS NULL`,
      [documentId, challengeId],
    )
    const reservation = reservationResult.rows[0]
    if (
      !reservation ||
      reservation.content_type !== contentType ||
      Number(reservation.size_bytes) !== bytes.length
    ) {
      return res.status(409).json({
        error:
          "This document upload is invalid or expired. Choose the file again.",
      })
    }
    const challenge = await pool.query(
      `SELECT id FROM merchant_registration_otps
       WHERE id = $1 AND verified_at > NOW() - INTERVAL '24 hours'
         AND consumed_at IS NULL`,
      [challengeId],
    )
    if (!challenge.rowCount) {
      return res.status(401).json({
        error: "Verify your email again before uploading documents.",
      })
    }
    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: r2BucketName,
          Key: reservation.object_key,
          Body: bytes,
          ContentType: contentType,
          ContentLength: bytes.length,
          Metadata: { "document-id": documentId },
        }),
      )
      return res.set("Cache-Control", "no-store").json({ uploaded: true })
    } catch (error) {
      console.error("Could not store private registration document", {
        name: error instanceof Error ? error.name : typeof error,
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : null,
      })
      return res
        .status(503)
        .json({ error: "Private document upload is temporarily unavailable." })
    }
  },
)

app.post(
  "/v1/auth/registration/documents/complete",
  registrationLimiter,
  async (req, res) => {
    if (!r2Client || !r2BucketName) {
      return res.status(503).json({
        error: "Private document storage is not configured on this server.",
      })
    }
    const {
      challengeId,
      documentId,
      objectKey,
      documentType,
      fileName,
      contentType,
      sizeBytes,
    } = req.body || {}
    const normalizedContentType = normalizeDocumentContentType(
      typeof fileName === "string" ? fileName : "",
      contentType,
    )
    if (
      !/^[0-9a-f-]{36}$/i.test(challengeId || "") ||
      !/^[0-9a-f-]{36}$/i.test(documentId || "") ||
      typeof objectKey !== "string" ||
      !objectKey.startsWith("kyb/") ||
      !allowedKybDocuments.has(documentType) ||
      typeof fileName !== "string" ||
      fileName.length > 180 ||
      !allowedDocumentContentTypes.has(normalizedContentType) ||
      !Number.isSafeInteger(Number(sizeBytes)) ||
      Number(sizeBytes) <= 0 ||
      Number(sizeBytes) > kybDocumentMaxBytes
    ) {
      return res
        .status(400)
        .json({ error: "The uploaded document details are invalid." })
    }
    const reservation = await pool.query(
      `SELECT document_type, object_key, file_name, content_type, size_bytes
       FROM merchant_registration_documents
       WHERE id = $1 AND challenge_id = $2 AND object_key = $3
         AND completed_at IS NULL`,
      [documentId, challengeId, objectKey],
    )
    const record = reservation.rows[0]
    if (
      !record ||
      record.document_type !== documentType ||
      record.file_name !== fileName ||
      record.content_type !== normalizedContentType ||
      Number(record.size_bytes) !== Number(sizeBytes)
    ) {
      return res.status(409).json({
        error: "This document upload is invalid. Choose the file again.",
      })
    }
    const challenge = await pool.query(
      `SELECT id FROM merchant_registration_otps
       WHERE id = $1 AND verified_at > NOW() - INTERVAL '24 hours'
         AND consumed_at IS NULL`,
      [challengeId],
    )
    if (!challenge.rowCount) {
      return res.status(401).json({
        error: "Verify your email again before uploading documents.",
      })
    }
    try {
      const object = await r2Client.send(
        new HeadObjectCommand({ Bucket: r2BucketName, Key: objectKey }),
      )
      if (
        Number(object.ContentLength) !== Number(sizeBytes) ||
        object.ContentType !== normalizedContentType ||
        object.Metadata?.["document-id"] !== documentId
      ) {
        return res.status(400).json({
          error: "The stored document does not match the selected file.",
        })
      }
      await pool.query(
        "UPDATE merchant_registration_documents SET completed_at = NOW() WHERE id = $1",
        [documentId],
      )
      return res
        .set("Cache-Control", "no-store")
        .json({ uploaded: true, documentType })
    } catch (error) {
      console.error(
        "Could not verify private registration document upload",
        error.name || "storage error",
      )
      return res.status(503).json({
        error: "Could not verify the uploaded document. Try again.",
      })
    }
  },
)

app.post(
  "/v1/auth/registration/submit",
  registrationLimiter,
  async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : ""
    const challengeId =
      typeof req.body?.challengeId === "string" ? req.body.challengeId : ""
    const businessName =
      typeof req.body?.businessName === "string"
        ? req.body.businessName.trim()
        : ""
    const contactPerson =
      typeof req.body?.contactPerson === "string"
        ? req.body.contactPerson.trim()
        : ""
    const businessAddress =
      typeof req.body?.businessAddress === "string"
        ? req.body.businessAddress.trim()
        : ""
    const registrationNumber =
      typeof req.body?.registrationNumber === "string"
        ? req.body.registrationNumber.trim()
        : ""
    const businessType =
      typeof req.body?.businessType === "string"
        ? req.body.businessType.trim()
        : ""
    const country =
      typeof req.body?.country === "string" ? req.body.country.trim() : ""
    const ownerFullName =
      typeof req.body?.ownerFullName === "string"
        ? req.body.ownerFullName.trim()
        : ""
    const ownerDateOfBirth =
      typeof req.body?.ownerDateOfBirth === "string"
        ? req.body.ownerDateOfBirth.trim()
        : ""
    const ownerNationality =
      typeof req.body?.ownerNationality === "string"
        ? req.body.ownerNationality.trim()
        : ""
    const ownerEmail =
      typeof req.body?.ownerEmail === "string"
        ? req.body.ownerEmail.trim().toLowerCase()
        : ""
    const ownerPhone =
      typeof req.body?.ownerPhone === "string" ? req.body.ownerPhone.trim() : ""
    const bankName =
      typeof req.body?.bankName === "string" ? req.body.bankName.trim() : ""
    const accountName =
      typeof req.body?.accountName === "string"
        ? req.body.accountName.trim()
        : ""
    const accountNumber =
      typeof req.body?.accountNumber === "string"
        ? req.body.accountNumber.replace(/\s+/g, "")
        : ""
    const pin = typeof req.body?.pin === "string" ? req.body.pin : ""
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId,
      )
    ) {
      return res.status(400).json({ error: "Verify your email to continue." })
    }
    if (
      !businessName ||
      businessName.length > 160 ||
      !contactPerson ||
      contactPerson.length > 120 ||
      !businessAddress ||
      businessAddress.length > 200 ||
      !registrationNumber ||
      registrationNumber.length > 200 ||
      !businessType ||
      businessType.length > 200 ||
      !country ||
      country.length > 200 ||
      !ownerFullName ||
      ownerFullName.length > 200 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(ownerDateOfBirth) ||
      Number.isNaN(Date.parse(`${ownerDateOfBirth}T00:00:00Z`)) ||
      new Date(`${ownerDateOfBirth}T00:00:00Z`).toISOString().slice(0, 10) !==
        ownerDateOfBirth ||
      new Date(`${ownerDateOfBirth}T00:00:00Z`) >
        new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000) ||
      !ownerNationality ||
      ownerNationality.length > 200 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
      ownerEmail.length > 200 ||
      !/^\+?[0-9()\-\s]{7,40}$/.test(ownerPhone) ||
      !bankName ||
      bankName.length < 2 ||
      bankName.length > 100 ||
      !accountName ||
      accountName.length < 2 ||
      accountName.length > 120 ||
      !/^[A-Za-z0-9-]{4,34}$/.test(accountNumber) ||
      !/^\d{4}$/.test(pin) ||
      req.body?.kybConsent !== true
    ) {
      return res.status(400).json({
        error:
          "Complete each required business, owner, payout, and MPIN field, then confirm the KYB review consent.",
      })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const challenge = await client.query(
        `SELECT phone_number, referral_code
       FROM merchant_registration_otps
       WHERE id = $1 AND email = $2 AND verified_at IS NOT NULL
         AND verified_at > NOW() - INTERVAL '24 hours'
         AND consumed_at IS NULL
       FOR UPDATE`,
        [challengeId, email],
      )
      if (!challenge.rowCount) {
        await client.query("ROLLBACK")
        return res.status(401).json({
          error: "Verify your email before submitting your application.",
        })
      }
      let referredByEmail = null
      if (challenge.rows[0].referral_code) {
        const referrer = await client.query(
          `SELECT email FROM merchant_accounts
         WHERE referral_code = $1 AND active = TRUE`,
          [challenge.rows[0].referral_code],
        )
        if (!referrer.rowCount) {
          await client.query("ROLLBACK")
          return res.status(400).json({
            error: "This merchant referral code is no longer active.",
          })
        }
        referredByEmail = referrer.rows[0].email
      }
      const documents = await client.query(
        `SELECT id, document_type, object_key, file_name, content_type, size_bytes
       FROM merchant_registration_documents
       WHERE challenge_id = $1 AND completed_at IS NOT NULL
       FOR UPDATE`,
        [challengeId],
      )
      const missingDocuments = getMissingRequiredKybDocuments(
        documents.rows.map((document) => document.document_type),
      )
      if (missingDocuments.length) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "Upload the business registration and both sides of the owner's ID before submitting.",
        })
      }
      await client.query(
        `INSERT INTO merchant_accounts
         (email, active, registration_pending, business_name, contact_person,
          phone_number, business_address, referred_by_email)
       VALUES ($1, FALSE, TRUE, $2, $3, $4, $5, $6)`,
        [
          email,
          businessName,
          contactPerson,
          challenge.rows[0].phone_number,
          businessAddress,
          referredByEmail,
        ],
      )
      const pinSalt = randomBytes(16).toString("hex")
      const pinHash = scryptSync(pin, pinSalt, 64).toString("hex")
      await client.query(
        `INSERT INTO merchant_security (email, pin_salt, pin_hash)
       VALUES ($1, $2, $3)`,
        [email, pinSalt, pinHash],
      )
      await client.query(
        `INSERT INTO merchant_kyb_profiles (
         merchant_email, legal_business_name, registration_number, business_type,
         country, business_address, owner_full_name, owner_date_of_birth,
         owner_nationality, owner_email, owner_phone, kyb_consent_at,
         kyb_consent_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'manual-kyb-v1')`,
        [
          email,
          businessName,
          registrationNumber,
          businessType,
          country,
          businessAddress,
          ownerFullName,
          ownerDateOfBirth,
          ownerNationality,
          ownerEmail,
          ownerPhone,
        ],
      )
      await client.query(
        `INSERT INTO merchant_payout_accounts
         (merchant_email, bank_name, account_name, account_number)
       VALUES ($1, $2, $3, $4)`,
        [email, bankName, accountName, accountNumber],
      )
      await recordAdminAuditEvent(client, {
        eventKey: `merchant-registration:${email}`,
        category: "Merchant account",
        action: "Merchant registration submitted",
        target: email,
        actor: null,
        summary: "A merchant KYB application and required documents were submitted for manual review.",
      })
      for (const document of documents.rows) {
        await client.query(
          `INSERT INTO merchant_kyb_documents
           (id, merchant_email, document_type, object_key, file_name, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            document.id,
            email,
            document.document_type,
            document.object_key,
            document.file_name,
            document.content_type,
            document.size_bytes,
          ],
        )
      }
      await client.query(
        "UPDATE merchant_registration_otps SET consumed_at = NOW() WHERE id = $1",
        [challengeId],
      )
      await client.query("COMMIT")
      return res
        .set("Cache-Control", "no-store")
        .status(202)
        .json({ email, status: "pending_review" })
    } catch (error) {
      await client.query("ROLLBACK")
      if (error.code === "23505") {
        return res.status(409).json({
          error: "An account or registration already exists for this email.",
        })
      }
      throw error
    } finally {
      client.release()
    }
  },
)

app.get("/v1/auth/providers", (_req, res) =>
  res.set("Cache-Control", "no-store").json({
    google: Boolean(googleAuthClient),
    googleClientId: googleClientId || null,
    telegram: Boolean(telegramLoginClientId),
    telegramClientId: telegramLoginClientId || null,
    passkeys: Boolean(passkeyRpId && passkeyExpectedOrigin),
  }),
)

app.post("/v1/auth/google/challenge", loginLimiter, async (_req, res) => {
  if (!googleAuthClient)
    return res
      .status(503)
      .json({ error: "Google sign-in is not configured for this service." })
  const nonce = randomBytes(32).toString("base64url")
  const challengeId = await createMerchantAuthChallenge(
    "google",
    "login",
    null,
    nonce,
  )
  return res.set("Cache-Control", "no-store").json({ challengeId, nonce })
})

app.post("/v1/auth/google/login", loginLimiter, async (req, res) => {
  const challenge = await consumeMerchantAuthChallenge(
    req.body?.challengeId,
    "google",
    "login",
  )
  if (!challenge)
    return res.status(401).json({ error: "Google sign-in expired. Try again." })
  let identity
  try {
    identity = await verifyGoogleIdentityToken(
      req.body?.credential,
      challenge.challenge,
    )
  } catch {
    return res.status(401).json({
      error: "Google sign-in could not be verified. Try again or use email.",
    })
  }
  const result = await pool.query(
    `SELECT account.email FROM merchant_auth_identities identity
     JOIN merchant_accounts account ON account.email = identity.merchant_email
     WHERE identity.provider = 'google' AND identity.provider_subject = $1
       AND account.active = TRUE`,
    [identity.subject],
  )
  const merchantEmail = result.rows[0]?.email
  if (!merchantEmail) return res.status(401).json({
      error: "This Google account is not linked to a merchant account.",
    })
  return res
    .set("Cache-Control", "no-store")
    .json(await createMerchantSignInStepUp("google", merchantEmail))
})

app.post("/v1/auth/telegram/challenge", loginLimiter, async (_req, res) => {
  if (!telegramLoginClientId)
    return res
      .status(503)
      .json({ error: "Telegram sign-in is not configured for this service." })
  const nonce = randomBytes(32).toString("base64url")
  const challengeId = await createMerchantAuthChallenge(
    "telegram",
    "login",
    null,
    nonce,
  )
  return res.set("Cache-Control", "no-store").json({
    challengeId,
    nonce,
    clientId: telegramLoginClientId,
  })
})

app.post("/v1/auth/telegram/login", loginLimiter, async (req, res) => {
  const challenge = await consumeMerchantAuthChallenge(
    req.body?.challengeId,
    "telegram",
    "login",
  )
  if (!challenge)
    return res
      .status(401)
      .json({ error: "Telegram sign-in expired. Try again." })
  let identity
  try {
    identity = await verifyTelegramIdentityToken(
      req.body?.idToken,
      challenge.challenge,
    )
  } catch {
    return res.status(401).json({
      error: "Telegram sign-in could not be verified. Try again or use email.",
    })
  }
  const result = await pool.query(
    `SELECT account.email FROM merchant_auth_identities identity
     JOIN merchant_accounts account ON account.email = identity.merchant_email
     WHERE identity.provider = 'telegram' AND identity.provider_subject = $1
       AND account.active = TRUE`,
    [identity.subject],
  )
  const merchantEmail = result.rows[0]?.email
  if (!merchantEmail) return res.status(401).json({
      error: "This Telegram account is not linked to a merchant account.",
    })
  return res
    .set("Cache-Control", "no-store")
    .json(await createMerchantSignInStepUp("telegram", merchantEmail))
})

app.post("/v1/auth/passkey/options", loginLimiter, async (_req, res) => {
  if (!passkeyRpId || !passkeyExpectedOrigin)
    return res
      .status(503)
      .json({ error: "Passkey sign-in is not configured for this service." })
  const options = await generateAuthenticationOptions({
    rpID: passkeyRpId,
    userVerification: "required",
  })
  const challengeId = await createMerchantAuthChallenge(
    "passkey",
    "login",
    null,
    options.challenge,
  )
  return res.set("Cache-Control", "no-store").json({ challengeId, options })
})

app.post("/v1/auth/passkey/verify", loginLimiter, async (req, res) => {
  const challenge = await consumeMerchantAuthChallenge(
    req.body?.challengeId,
    "passkey",
    "login",
  )
  const credentialId =
    typeof req.body?.credential?.id === "string" ? req.body.credential.id : ""
  if (!challenge || !credentialId || credentialId.length > 1024)
    return res
      .status(401)
      .json({ error: "Passkey sign-in expired. Try again." })
  const result = await pool.query(
    `SELECT passkey.credential_id, passkey.public_key, passkey.counter,
       passkey.transports, account.email
     FROM merchant_passkeys passkey
     JOIN merchant_accounts account ON account.email = passkey.merchant_email
     WHERE passkey.credential_id = $1 AND account.active = TRUE`,
    [credentialId],
  )
  const storedCredential = result.rows[0]
  if (!storedCredential) return res.status(401).json({
      error: "This passkey is not linked to an active merchant account.",
    })
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body.credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: passkeyExpectedOrigin,
      expectedRPID: passkeyRpId,
      requireUserVerification: true,
      credential: {
        id: storedCredential.credential_id,
        publicKey: new Uint8Array(storedCredential.public_key),
        counter: Number(storedCredential.counter),
        transports: storedCredential.transports,
      },
    })
  } catch {
    return res
      .status(401)
      .json({ error: "Passkey sign-in could not be verified." })
  }
  if (!verification.verified)
    return res
      .status(401)
      .json({ error: "Passkey sign-in could not be verified." })
  await pool.query(
    `UPDATE merchant_passkeys SET counter = GREATEST(counter, $2), last_used_at = NOW()
     WHERE credential_id = $1`,
    [
      storedCredential.credential_id,
      verification.authenticationInfo.newCounter,
    ],
  )
  return res
    .set("Cache-Control", "no-store")
    .json(await createMerchantSignInStepUp("passkey", storedCredential.email))
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
      await sendMerchantOtp(email, code, "device")
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
    await client.query(
      `UPDATE merchant_accounts
       SET invitation_accepted_at = COALESCE(invitation_accepted_at, NOW())
       WHERE email = $1`,
      [email],
    )
    const security = await client.query(
      "SELECT pin_hash FROM merchant_security WHERE email = $1",
      [email],
    )
    await client.query("COMMIT")
    if (security.rows[0]?.pin_hash) {
      return res.set("Cache-Control", "no-store").json({
        verified: true,
        pinConfigured: true,
        email,
      })
    }
    return res
      .set("Cache-Control", "no-store")
      .json({ ...(await issueMerchantSession(email)), pinConfigured: false })
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.post("/v1/auth/device/pin", loginLimiter, async (req, res) => {
  const providerChallengeId =
    typeof req.body?.providerChallengeId === "string"
      ? req.body.providerChallengeId
      : ""
  const provider =
    typeof req.body?.provider === "string" ? req.body.provider : ""
  const hasProviderStepUp = Boolean(providerChallengeId || provider)
  const stepUpChallenge =
    hasProviderStepUp && ["google", "telegram", "passkey"].includes(provider)
      ? await getMerchantAuthChallenge(providerChallengeId, provider, "login")
      : null
  if (hasProviderStepUp && !stepUpChallenge?.merchantEmail) {
    return res.status(401).json({
      error: "Verify your identity again before entering your MPIN.",
    })
  }
  const email =
    stepUpChallenge?.merchantEmail ||
    (typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "")
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
     LEFT JOIN merchant_devices d ON d.email = a.email AND d.device_token_hash = $2
     JOIN merchant_security s ON s.email = a.email
     WHERE a.email = $1 AND a.active = TRUE
       AND ($3::boolean = TRUE OR d.device_token_hash IS NOT NULL)`,
    [email, deviceTokenHash(deviceToken), hasProviderStepUp],
  )
  const security = rows[0]
  if (!security?.pin_hash) return res.status(403).json({
      error: "Verify this device by email and set up an MPIN to continue.",
    })
  const pinVerification = await verifyPinWithAttemptLimit(
    pool,
    email,
    pin,
    matchesPasswordHash,
  )
  if (pinVerification.status !== 200) {
    return res
      .status(pinVerification.status === 403 ? 401 : pinVerification.status)
      .json({ error: pinVerification.error })
  }
  if (hasProviderStepUp) {
    const consumedChallenge = await consumeMerchantAuthChallenge(
      providerChallengeId,
      provider,
      "login",
    )
    if (consumedChallenge?.merchantEmail !== email) {
      return res.status(401).json({
        error: "Verify your identity again before entering your MPIN.",
      })
    }
    await pool.query(
      `INSERT INTO merchant_devices (email, device_token_hash)
       VALUES ($1, $2) ON CONFLICT (email, device_token_hash)
       DO UPDATE SET last_used_at = NOW()`,
      [email, deviceTokenHash(deviceToken)],
    )
  } else {
    await pool.query(
      "UPDATE merchant_devices SET last_used_at = NOW() WHERE email = $1 AND device_token_hash = $2",
      [email, deviceTokenHash(deviceToken)],
    )
  }
  return res
    .set("Cache-Control", "no-store")
    .json(await issueMerchantSession(email))
})

app.post("/v1/auth/device/biometric", loginLimiter, async (req, res) => {
  const providerChallengeId =
    typeof req.body?.providerChallengeId === "string"
      ? req.body.providerChallengeId
      : ""
  const provider =
    typeof req.body?.provider === "string" ? req.body.provider : ""
  const hasProviderStepUp = Boolean(providerChallengeId || provider)
  const stepUpChallenge =
    hasProviderStepUp && ["google", "telegram", "passkey"].includes(provider)
      ? await getMerchantAuthChallenge(providerChallengeId, provider, "login")
      : null
  if (hasProviderStepUp && !stepUpChallenge?.merchantEmail) {
    return res.status(401).json({
      error: "Verify your identity again before using biometrics.",
    })
  }
  const email =
    stepUpChallenge?.merchantEmail ||
    (typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "")
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
  if (hasProviderStepUp) {
    const consumedChallenge = await consumeMerchantAuthChallenge(
      providerChallengeId,
      provider,
      "login",
    )
    if (consumedChallenge?.merchantEmail !== email) {
      return res.status(401).json({
        error: "Verify your identity again before using biometrics.",
      })
    }
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

app.use("/v1/admin", requireAdminSession, requireAdminPermission)

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

app.post("/v1/admin/staff/invitations", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  const role = req.body?.role
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["finance", "compliance", "auditor"].includes(role)
  ) {
    return res.status(400).json({ error: "A valid email and staff role are required." })
  }
  const token = randomBytes(32).toString("hex")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const existing = await client.query(
      "SELECT role, status FROM admin_staff WHERE email = $1 FOR UPDATE",
      [email],
    )
    if (
      existing.rows[0]?.role === "super_admin" ||
      existing.rows[0]?.status === "active"
    ) {
      await client.query("ROLLBACK")
      return res.status(409).json({ error: "This account cannot be invited." })
    }
    await client.query(
      `INSERT INTO admin_staff
         (email, role, status, invited_by, password_salt, password_hash,
          totp_secret_encrypted, totp_enabled, last_totp_step)
       VALUES ($1, $2, 'invited', $3, NULL, NULL, NULL, FALSE, -1)
       ON CONFLICT (email) DO UPDATE SET
         role = EXCLUDED.role, status = 'invited', invited_by = EXCLUDED.invited_by,
         password_salt = NULL, password_hash = NULL,
         totp_secret_encrypted = NULL, totp_enabled = FALSE, last_totp_step = -1,
         updated_at = NOW()`,
      [email, role, req.adminEmail],
    )
    await client.query(
      `UPDATE admin_staff_invitations SET accepted_at = NOW()
       WHERE email = $1 AND accepted_at IS NULL`,
      [email],
    )
    await client.query(
      `INSERT INTO admin_staff_invitations
         (token_hash, email, role, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours')`,
      [hashAdminInvitationToken(token), email, role, req.adminEmail],
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Operations staff invitation creation failed", error)
    return res.status(500).json({ error: "Invitation creation failed." })
  } finally {
    client.release()
  }

  const invitationUrl = new URL("/bossd", frontendOrigin)
  invitationUrl.searchParams.set("operations_invitation", token)
  try {
    await sendMerchantEmails({
      from: resendFromEmail,
      apiKey: resendApiKey,
      messages: [
        {
          to: email,
          email: createAdminInvitationEmail({
            role,
            invitationUrl: invitationUrl.toString(),
          }),
        },
      ],
    })
  } catch (error) {
    console.error("Operations staff invitation email delivery failed", error)
    return res.status(503).json({
      error: "The invitation was created but email delivery failed. Resend it to continue.",
    })
  }
  return res.status(202).json({ email, role, expiresInHours: 24 })
})

app.get("/v1/admin/staff", async (_req, res) => {
  const result = await pool.query(
    `SELECT email, role, status, invited_by AS "invitedBy",
       totp_enabled AS "mfaEnabled", created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM admin_staff ORDER BY created_at`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post("/v1/admin/staff/:email/disable", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid staff email." })
  }
  if (email === req.adminEmail) {
    return res.status(409).json({ error: "You cannot disable your own account." })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const staff = await client.query(
      "SELECT role, status FROM admin_staff WHERE email = $1 FOR UPDATE",
      [email],
    )
    if (!staff.rowCount || staff.rows[0].role === "super_admin") {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "This staff account cannot be disabled." })
    }
    await client.query(
      `UPDATE admin_staff SET status = 'disabled', updated_at = NOW()
       WHERE email = $1`,
      [email],
    )
    await client.query(
      `UPDATE admin_staff_invitations SET accepted_at = NOW()
       WHERE email = $1 AND accepted_at IS NULL`,
      [email],
    )
    await recordAdminAuditEvent(client, {
      eventKey: `admin-staff-disabled:${email}:${randomUUID()}`,
      category: "Operations access",
      action: "Staff account disabled",
      target: email,
      actor: req.adminEmail,
      summary: `Prior status: ${staff.rows[0].status}`,
    })
    await client.query("COMMIT")
    return res.json({ email, status: "disabled" })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Operations staff disable failed", error)
    return res.status(500).json({ error: "Staff account could not be disabled." })
  } finally {
    client.release()
  }
})

app.get("/v1/admin/approval-requests", async (req, res) => {
  const status = ["pending", "approved", "rejected", "consumed"].includes(
    req.query.status,
  )
    ? req.query.status
    : null
  const result = await pool.query(
    `SELECT id, action_key AS "actionKey", target_key AS "targetKey",
       payload, requested_by AS "requestedBy", approved_by AS "approvedBy",
       status, requested_at AS "requestedAt", reviewed_at AS "reviewedAt",
       consumed_at AS "consumedAt"
     FROM admin_approval_requests
     WHERE ($1::text IS NULL OR status = $1)
     ORDER BY requested_at DESC
     LIMIT 500`,
    [status],
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post(
  "/v1/admin/approval-requests/:id/:decision",
  async (req, res) => {
    const { id, decision } = req.params
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !["approve", "reject"].includes(decision)
    ) {
      return res.status(400).json({ error: "Choose a valid approval decision." })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const request = await client.query(
        `SELECT requested_by, status FROM admin_approval_requests
         WHERE id = $1 FOR UPDATE`,
        [id],
      )
      if (!request.rowCount || request.rows[0].status !== "pending") {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "This approval request is no longer pending.",
        })
      }
      if (request.rows[0].requested_by === req.adminEmail) {
        await client.query("ROLLBACK")
        return res.status(403).json({
          error: "The requester cannot approve or reject their own action.",
        })
      }
      const nextStatus = decision === "approve" ? "approved" : "rejected"
      await client.query(
        `UPDATE admin_approval_requests
         SET status = $2, approved_by = $3, reviewed_at = NOW()
         WHERE id = $1`,
        [id, nextStatus, req.adminEmail],
      )
      await recordAdminAuditEvent(client, {
        eventKey: `admin-approval:${id}:${decision}`,
        category: "Operations approval",
        action: `Sensitive action ${nextStatus}`,
        target: id,
        actor: req.adminEmail,
        summary: `Request by ${request.rows[0].requested_by}`,
      })
      await client.query("COMMIT")
      return res.json({ id, status: nextStatus, reviewedBy: req.adminEmail })
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Operations approval decision failed", error)
      return res.status(500).json({ error: "Approval decision failed." })
    } finally {
      client.release()
    }
  },
)

app.get("/v1/admin/reconciliation/cases", async (_req, res) => {
  const result = await pool.query(
    `SELECT id, source_type AS "sourceType", batch_id AS "batchId",
       line_number AS "lineNumber", external_reference AS "externalReference",
       direction, amount::text AS amount, currency,
       external_status AS "externalStatus", internal_id AS "internalId",
       internal_reference AS "internalReference", status, details,
       created_by AS "createdBy", created_at AS "createdAt"
     FROM financial_reconciliation_cases
     ORDER BY created_at DESC LIMIT 500`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.get("/v1/admin/reconciliation/suspense", async (_req, res) => {
  const result = await pool.query(
    `SELECT suspense.id, suspense.status, suspense.resolution_note AS "resolutionNote",
       suspense.owner_email AS "ownerEmail",
       suspense.resolved_by AS "resolvedBy",
       suspense.resolved_at AS "resolvedAt",
       suspense.created_at AS "createdAt", reconciliation.source_type AS "sourceType",
       reconciliation.external_reference AS "externalReference",
       reconciliation.direction, reconciliation.amount::text AS amount,
       reconciliation.currency, reconciliation.external_status AS "externalStatus",
       reconciliation.details,
       COALESCE((
         SELECT json_agg(json_build_object(
           'eventType', event.event_type,
           'actorEmail', event.actor_email,
           'ownerEmail', event.owner_email,
           'note', event.note,
           'createdAt', event.created_at
         ) ORDER BY event.created_at)
         FROM accounting_suspense_events event
         WHERE event.suspense_item_id = suspense.id
       ), '[]'::json) AS events
     FROM accounting_suspense_items suspense
     JOIN financial_reconciliation_cases reconciliation
       ON reconciliation.id = suspense.reconciliation_case_id
     ORDER BY suspense.created_at DESC LIMIT 500`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post(
  "/v1/admin/reconciliation/suspense/:id/claim",
  async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
      return res.status(400).json({ error: "Choose a valid suspense item." })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const item = await client.query(
        `SELECT status, owner_email FROM accounting_suspense_items
         WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!item.rowCount) {
        await client.query("ROLLBACK")
        return res.status(404).json({ error: "Suspense item not found." })
      }
      if (item.rows[0].status !== "open") {
        await client.query("ROLLBACK")
        return res.status(409).json({ error: "This suspense item is resolved." })
      }
      if (item.rows[0].owner_email && item.rows[0].owner_email !== req.adminEmail) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "This suspense item is assigned to another staff member.",
        })
      }
      if (!item.rows[0].owner_email) {
        await client.query(
          `UPDATE accounting_suspense_items
           SET owner_email = $2, owner_assigned_at = NOW()
           WHERE id = $1`,
          [req.params.id, req.adminEmail],
        )
        await client.query(
          `INSERT INTO accounting_suspense_events
             (id, suspense_item_id, event_type, actor_email, owner_email)
           VALUES ($1, $2, 'assigned', $3, $3)`,
          [randomUUID(), req.params.id, req.adminEmail],
        )
      }
      await client.query("COMMIT")
      return res.json({ id: req.params.id, ownerEmail: req.adminEmail })
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Could not claim accounting suspense item", error)
      return res.status(500).json({ error: "Could not claim suspense item." })
    } finally {
      client.release()
    }
  },
)

app.post(
  "/v1/admin/reconciliation/suspense/:id/resolve",
  async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
      return res.status(400).json({ error: "Choose a valid suspense item." })
    }
    const note =
      typeof req.body?.note === "string" ? req.body.note.trim() : ""
    if (note.length < 10 || note.length > 2000) {
      return res.status(400).json({
        error: "Provide a resolution note between 10 and 2,000 characters.",
      })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const item = await client.query(
        `SELECT status, owner_email FROM accounting_suspense_items
         WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!item.rowCount) {
        await client.query("ROLLBACK")
        return res.status(404).json({ error: "Suspense item not found." })
      }
      if (item.rows[0].status !== "open") {
        await client.query("ROLLBACK")
        return res.status(409).json({ error: "This suspense item is resolved." })
      }
      if (
        req.adminRole !== "super_admin" &&
        item.rows[0].owner_email !== req.adminEmail
      ) {
        await client.query("ROLLBACK")
        return res.status(403).json({
          error: "Claim this suspense item before resolving it.",
        })
      }
      await client.query(
        `UPDATE accounting_suspense_items
         SET status = 'resolved', resolution_note = $2,
             resolved_by = $3, resolved_at = NOW()
         WHERE id = $1`,
        [req.params.id, note, req.adminEmail],
      )
      await client.query(
        `INSERT INTO accounting_suspense_events
           (id, suspense_item_id, event_type, actor_email, owner_email, note)
         VALUES ($1, $2, 'resolved', $3, $4, $5)`,
        [
          randomUUID(),
          req.params.id,
          req.adminEmail,
          item.rows[0].owner_email,
          note,
        ],
      )
      await client.query("COMMIT")
      return res.json({ id: req.params.id, status: "resolved" })
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Could not resolve accounting suspense item", error)
      return res.status(500).json({ error: "Could not resolve suspense item." })
    } finally {
      client.release()
    }
  },
)

app.post(
  "/v1/admin/reconciliation/bank-csv",
  express.text({ type: ["text/csv", "application/csv"], limit: "2mb" }),
  async (req, res) => {
    let records
    try {
      records = parseBankCsv(req.body)
    } catch (error) {
      return res.status(400).json({
        error:
          error instanceof Error ? error.message : "The bank CSV is invalid.",
      })
    }
    const rawFilename = req.get("x-filename") || "bank-statement.csv"
    const filename =
      rawFilename.replace(/[^\w.-]/g, "_").slice(0, 120) ||
      "bank-statement.csv"
    const batchId = randomUUID()
    const contentHash = createHash("sha256").update(req.body).digest("hex")
    const counts = {
      matched: 0,
      amount_mismatch: 0,
      currency_mismatch: 0,
      status_mismatch: 0,
      unmatched_suspense: 0,
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const batch = await client.query(
        `INSERT INTO bank_reconciliation_batches
           (id, filename, content_hash, uploaded_by, row_count)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (content_hash) WHERE content_hash IS NOT NULL DO NOTHING
         RETURNING id`,
        [batchId, filename, contentHash, req.adminEmail, records.length],
      )
      if (!batch.rowCount) {
        const existing = await client.query(
          `SELECT batch.id, batch.filename, batch.row_count AS "importedRows",
             cases.status, COUNT(*)::int AS count
           FROM bank_reconciliation_batches batch
           JOIN financial_reconciliation_cases cases ON cases.batch_id = batch.id
           WHERE batch.content_hash = $1
           GROUP BY batch.id, batch.filename, batch.row_count, cases.status`,
          [contentHash],
        )
        await client.query("COMMIT")
        return res.status(200).json({
          batchId:
            existing.rows[0]?.id || batchId,
          filename: existing.rows[0]?.filename || filename,
          importedRows: Number(existing.rows[0]?.importedRows || records.length),
          counts: Object.fromEntries(
            existing.rows.map((row) => [row.status, row.count]),
          ),
          autoPosted: false,
          duplicate: true,
        })
      }
      for (const [index, record] of records.entries()) {
        let internal = null
        let expectedAmount = null
        let internalStatus = null
        if (record.currency === "PHP" && record.direction === "IN") {
          const result = await client.query(
            `SELECT id, reference_no, amount::numeric AS amount, status
             FROM payment_links
             WHERE reference_no = $1 OR code = $1
             ORDER BY CASE WHEN reference_no = $1 THEN 0 ELSE 1 END
             LIMIT 1`,
            [record.reference],
          )
          internal = result.rows[0] || null
          expectedAmount = internal?.amount
          internalStatus = internal?.status
        } else if (record.currency === "PHP") {
          const result = await client.query(
            `SELECT id, merchant_reference_no AS reference_no,
               (amount + transfer_fee)::numeric AS amount, status
             FROM disbursements WHERE merchant_reference_no = $1`,
            [record.reference],
          )
          internal = result.rows[0] || null
          expectedAmount = internal?.amount
          internalStatus = internal?.status
        }

        let status
        if (record.currency !== "PHP") {
          status = "currency_mismatch"
        } else if (!internal) {
          status = "unmatched_suspense"
        } else if (
          parseMinorUnits(record.amount) !== parseMinorUnits(expectedAmount)
        ) {
          status = "amount_mismatch"
        } else if (
          record.direction === "IN"
            ? !["EXECUTED", "MANUALLY_PAID"].includes(internalStatus)
            : !["EXECUTED", "SUCCESS", "COMPLETED"].includes(internalStatus)
        ) {
          status = "status_mismatch"
        } else {
          status = "matched"
        }
        counts[status] += 1
        const caseId = randomUUID()
        await client.query(
          `INSERT INTO financial_reconciliation_cases
             (id, source_type, batch_id, line_number, external_reference,
              direction, amount, currency, external_status, internal_id,
              internal_reference, status, details, created_by)
           VALUES ($1, 'BANK_CSV', $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12::jsonb, $13)`,
          [
            caseId,
            batchId,
            index + 2,
            record.reference,
            record.direction,
            record.amount,
            record.currency,
            record.status,
            internal?.id || null,
            internal?.reference_no || null,
            status,
            JSON.stringify({
              statementStatus: record.status,
              internalStatus,
              occurredAt: record.occurredAt,
            }),
            req.adminEmail,
          ],
        )
        if (status !== "matched") {
          await client.query(
            `INSERT INTO accounting_suspense_items (id, reconciliation_case_id)
             VALUES ($1, $2)`,
            [randomUUID(), caseId],
          )
        }
      }
      await client.query("COMMIT")
      return res.status(201).json({
        batchId,
        filename,
        importedRows: records.length,
        counts,
        autoPosted: false,
      })
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Bank CSV reconciliation import failed", error)
      return res.status(500).json({ error: "Bank CSV import failed." })
    } finally {
      client.release()
    }
  },
)

app.post("/v1/admin/reconciliation/swiftpay/scan", async (_req, res) => {
  await reconcilePending()
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM financial_reconciliation_cases
     WHERE source_type = 'SWIFTPAY'
     GROUP BY status`,
  )
  return res.json({
    cases: result.rows,
    scannedAt: new Date().toISOString(),
  })
})

app.get("/v1/admin/crypto/usdt-withdrawals", async (_req, res) => {
  const result = await pool.query(
    `SELECT ${usdtWithdrawalRequestColumns()}
     FROM crypto_withdrawal_requests
     ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, requested_at DESC
     LIMIT 500`,
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post(
  "/v1/admin/crypto/usdt-withdrawals/:id/:decision",
  async (req, res) => {
    const { id, decision } = req.params
    if (
      !/^[0-9a-f-]{36}$/i.test(id) ||
      !["completed", "rejected"].includes(decision)
    ) {
      return res.status(400).json({
        error: "Choose a valid crypto withdrawal request and decision.",
      })
    }
    const transactionId =
      typeof req.body?.transactionId === "string"
        ? req.body.transactionId.trim()
        : ""
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : ""
    if (decision === "completed" && !/^[0-9a-f]{64}$/i.test(transactionId)) {
      return res
        .status(400)
        .json({ error: "Enter the 64-character TRON payout transaction ID." })
    }
    if (decision === "rejected" && (!reason || reason.length > 500)) {
      return res
        .status(400)
        .json({ error: "Enter a rejection reason (1–500 characters)." })
    }
    const approvalPayload = {
      decision,
      transactionId: decision === "completed" ? transactionId : "",
      reason: decision === "rejected" ? reason : "",
    }
    const approval = await prepareAdminApproval({
      req,
      res,
      actionKey: "crypto_withdrawal_decision",
      targetKey: id,
      payload: approvalPayload,
    })
    if (approval.response || approval.error) return approval.response || approval.error

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const request = await client.query(
        "SELECT * FROM crypto_withdrawal_requests WHERE id = $1 FOR UPDATE",
        [id],
      )
      if (!request.rowCount) {
        await client.query("ROLLBACK")
        return res
          .status(404)
          .json({ error: "Crypto withdrawal request not found." })
      }
      if (request.rows[0].status !== "PENDING") {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "This crypto withdrawal request has already been reviewed.",
        })
      }
      const approvalConsumed = await consumeAdminApproval(client, {
        requestId: approval.requestId,
        actionKey: "crypto_withdrawal_decision",
        targetKey: id,
        payload: approvalPayload,
        actor: req.adminEmail,
      })
      if (!approvalConsumed) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "The approved action has already been used or is no longer valid.",
        })
      }
      const nextStatus = decision === "completed" ? "COMPLETED" : "REJECTED"
      const updated = await client.query(
        `UPDATE crypto_withdrawal_requests
         SET status = $2, transaction_id = $3, rejection_reason = $4,
           reviewed_at = NOW(), reviewed_by = $5
         WHERE id = $1
         RETURNING ${usdtWithdrawalRequestColumns()}`,
        [
          id,
          nextStatus,
          nextStatus === "COMPLETED" ? transactionId : null,
          nextStatus === "REJECTED" ? reason : null,
          req.adminEmail,
        ],
      )
      await recordAdminAuditEvent(client, {
        eventKey: `crypto-withdrawal-review:${id}`,
        category: "Crypto withdrawal",
        action: `Request marked ${nextStatus.toLowerCase()}`,
        target: request.rows[0].merchant_email,
        actor: req.adminEmail,
        summary:
          `${request.rows[0].amount} USDT · ${request.rows[0].destination} · ` +
          (nextStatus === "COMPLETED"
            ? `TRON transaction ${transactionId}`
            : reason),
      })
      if (nextStatus === "COMPLETED") {
        await queueAdminMoneyNotification(
          {
            eventType: "USDT_WITHDRAWAL",
            eventId: id,
            merchantEmail: request.rows[0].merchant_email,
            direction: "OUT",
            amount: request.rows[0].amount,
            currency: "USDT",
            reference: transactionId,
            details: `USDT withdrawal to ${request.rows[0].destination}`,
          },
          client,
        )
      }
      await client.query("COMMIT")
      return res.set("Cache-Control", "no-store").json(updated.rows[0])
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  },
)

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
  const fileName = submittedFileName.replace(/[^\w .()-]/g, "_").slice(0, 180)
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
      error:
        "Attach the completed BIR Form 2307 as a PDF no larger than 10 MB.",
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
    return res.set("Cache-Control", "no-store").json({
      uploadId: upload.id,
      fileName: upload.file_name,
      completed: false,
    })
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
  return res.set("Cache-Control", "no-store").json({
    uploadId,
    fileName,
    completed: false,
  })
})

app.post(
  "/v1/admin/tax-invoice-attachments/:uploadId",
  express.raw({
    type: "application/pdf",
    limit: taxInvoiceAttachmentMaxBytes,
  }),
  async (req, res) => {
    if (!r2Client || !r2BucketName) {
      return res.status(503).json({
        error: "Private document storage is not configured on this server.",
      })
    }
    const uploadId = req.params.uploadId
    const bytes = req.body
    if (
      !/^[0-9a-f-]{36}$/i.test(uploadId) ||
      !Buffer.isBuffer(bytes) ||
      bytes.length === 0 ||
      bytes.length > taxInvoiceAttachmentMaxBytes ||
      bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      return res.status(400).json({
        error: "Attach a valid BIR Form 2307 PDF no larger than 10 MB.",
      })
    }
    const reservationResult = await pool.query(
      `SELECT object_key, content_type, size_bytes, completed_at
       FROM admin_tax_invoice_uploads
       WHERE id = $1 AND admin_email = $2 AND expires_at > NOW()`,
      [uploadId, req.adminEmail],
    )
    const reservation = reservationResult.rows[0]
    if (!reservation) {
      return res.status(409).json({
        error:
          "This attachment upload is invalid or expired. Select the file again.",
      })
    }
    if (
      reservation.content_type !== "application/pdf" ||
      Number(reservation.size_bytes) !== bytes.length
    ) {
      return res.status(400).json({
        error: "The uploaded PDF does not match the reserved attachment.",
      })
    }
    if (reservation.completed_at) {
      return res.set("Cache-Control", "no-store").json({ uploadId })
    }
    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: r2BucketName,
          Key: reservation.object_key,
          Body: bytes,
          ContentType: reservation.content_type,
          ContentLength: bytes.length,
        }),
      )
      const completed = await pool.query(
        `UPDATE admin_tax_invoice_uploads SET completed_at = NOW()
         WHERE id = $1 AND admin_email = $2 AND completed_at IS NULL
           AND expires_at > NOW()
         RETURNING id`,
        [uploadId, req.adminEmail],
      )
      if (!completed.rowCount) {
        return res.status(409).json({
          error: "This attachment upload expired before it could be completed.",
        })
      }
      return res.set("Cache-Control", "no-store").json({ uploadId })
    } catch (error) {
      console.error("Could not store private tax invoice attachment", {
        name: error instanceof Error ? error.name : typeof error,
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : null,
      })
      return res
        .status(503)
        .json({ error: "Private document upload is temporarily unavailable." })
    }
  },
)

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
      error:
        "This attachment upload is invalid or expired. Select the file again.",
    })
  }
  try {
    const object = await r2Client.send(
      new HeadObjectCommand({ Bucket: r2BucketName, Key: objectKey }),
    )
    if (
      Number(object.ContentLength) !== sizeBytes ||
      object.ContentType !== contentType
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
    return res.status(503).json({
      error: "Private document verification is temporarily unavailable.",
    })
  }
})

app.post("/v1/admin/tax-invoices", async (req, res) => {
  const amountMinor = tryParseMinorUnits(req.body?.amount)
  const amount =
    amountMinor === null ? Number.NaN : minorUnitsToNumber(amountMinor)
  const description =
    typeof req.body?.description === "string" ? req.body.description.trim() : ""
  const customerEmail =
    typeof req.body?.customerEmail === "string"
      ? req.body.customerEmail.trim().toLowerCase()
      : ""
  const birPayeeName =
    typeof req.body?.payeeName === "string" ? req.body.payeeName.trim() : ""
  const birPayeeTin =
    typeof req.body?.payeeTin === "string" ? req.body.payeeTin.trim() : ""
  const birPayeeAddress =
    typeof req.body?.payeeAddress === "string"
      ? req.body.payeeAddress.trim()
      : ""
  const birPayorName =
    typeof req.body?.payorName === "string" ? req.body.payorName.trim() : ""
  const birPayorTin =
    typeof req.body?.payorTin === "string" ? req.body.payorTin.trim() : ""
  const birPayorAddress =
    typeof req.body?.payorAddress === "string"
      ? req.body.payorAddress.trim()
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
    amountMinor === null ||
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
    birPayeeName.length > 120 ||
    birPayeeTin.length > 15 ||
    birPayeeAddress.length > 250 ||
    birPayorName.length > 120 ||
    birPayorTin.length > 15 ||
    birPayorAddress.length > 250
  ) {
    return res.status(400).json({
      error: "Payee and payor details are too long.",
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
  if (!attachmentId) {
    return res.status(400).json({
      error:
        "Upload the completed BIR Form 2307 before creating the tax invoice.",
    })
  }
  const invoice = createTaxInvoiceEmailCopy(description, amount)
  if (invoice.amount > 1_000_000) {
    return res.status(400).json({
      error: "The taxable amount plus VAT cannot exceed PHP 1,000,000.00.",
    })
  }
  const existing = await pool.query(
    `SELECT p.id, p.code, p.title, p.amount, p.customer_email, p.payment_url,
       p.payment_token, p.qr_payload, p.status, p.email_message,
       p.bir_payee_name, p.bir_payee_tin, p.bir_payee_address,
       p.bir_payor_name, p.bir_payor_tin, p.bir_payor_address,
       a.upload_id AS attachment_id
     FROM payment_links p
     LEFT JOIN admin_tax_invoice_attachments a ON a.payment_id = p.id
     WHERE p.idempotency_key = $1 AND p.merchant_email IS NULL`,
    [idempotencyKey],
  )
  if (existing.rowCount) {
    const row = existing.rows[0]
    if (
      row.title !== invoice.title ||
      Number(row.amount) !== invoice.amount ||
      row.customer_email !== customerEmail ||
      row.email_message !== invoice.emailMessage ||
      row.bir_payee_name !== birPayeeName ||
      row.bir_payee_tin !== birPayeeTin ||
      row.bir_payee_address !== birPayeeAddress ||
      row.bir_payor_name !== birPayorName ||
      row.bir_payor_tin !== birPayorTin ||
      row.bir_payor_address !== birPayorAddress ||
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
        merchant_email, customer_email, bir_payee_name, bir_payee_tin,
        bir_payee_address, bir_payor_name, bir_payor_tin, bir_payor_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        'DIRECT_QRPH', 'CREATING', NULL, $12, $13, $14, $15, $16, $17, $18)`,
      [
        id,
        idempotencyKey,
        referenceNo,
        code,
        invoice.title,
        invoice.amount,
        defaultCheckoutInstructions,
        invoice.emailSubject,
        invoice.emailMessage,
        defaultPaymentEmailColor,
        "",
        customerEmail,
        birPayeeName,
        birPayeeTin,
        birPayeeAddress,
        birPayorName,
        birPayorTin,
        birPayorAddress,
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
      summary: `WI830 expanded withholding tax at 0.50% on gross remittances PHP ${invoice.grossRemittances.toFixed(2)}; unpaid tax PHP ${amount.toFixed(2)} for ${customerEmail}.`,
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
      x_amount: invoice.amount.toFixed(2),
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
    const actualAmount = Number(data.amount ?? invoice.amount)
    if (!Number.isFinite(actualAmount) || actualAmount <= 0)
      throw new Error("SwiftPay returned an invalid payment amount.")
    await pool.query(
      `UPDATE payment_links
       SET payment_token = $1, qr_payload = $2, payment_url = $3,
         status = $4, amount = $5, updated_at = NOW()
       WHERE id = $6`,
      [
        data.paymentId,
        data.qrCode,
        checkoutUrl,
        status === "EXECUTED" ? "PENDING" : status,
        actualAmount,
        id,
      ],
    )
    let requestEmailStatus = "queued"
    if (status === "EXECUTED") {
      try {
        await updatePaymentLinkStatus(id, status)
        requestEmailStatus = "not_required"
      } catch (error) {
        console.error("Confirmed tax payment settlement is queued for retry", {
          paymentId: id,
          error: error instanceof Error ? error.message : String(error),
        })
        return res.status(503).json({
          error:
            "The payment provider confirmed this checkout, but wallet settlement is being retried. Do not create another checkout.",
        })
      }
    } else {
      try {
        requestEmailStatus = await queueCustomerPaymentRequest(id)
      } catch (error) {
        requestEmailStatus = "queue_failed"
        console.error("Tax invoice email could not be queued", {
          error: error.code || "database error",
        })
      }
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
  const approval = await prepareAdminApproval({
    req,
    res,
    actionKey: "manual_payment_confirmation",
    targetKey: paymentId,
    payload: { verificationNote },
  })
  if (approval.response || approval.error) return approval.response || approval.error

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
    const approvalConsumed = await consumeAdminApproval(client, {
      requestId: approval.requestId,
      actionKey: "manual_payment_confirmation",
      targetKey: paymentId,
      payload: { verificationNote },
      actor: req.adminEmail,
    })
    if (!approvalConsumed) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error: "The approved action has already been used or is no longer valid.",
      })
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
    await queueSuccessfulTransaction("PAYMENT", paymentId, client)
    await queueTransactionWebhook("PAYMENT", paymentId, client)
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
  const collectionFeeMinor = tryParseMinorUnits(
    settings.collection_fee_percent || "0",
  )
  const transferFeeMinor = tryParseMinorUnits(
    settings.transfer_fee_fixed || "0",
  )
  const collectionFeePercent =
    collectionFeeMinor === null
      ? Number.NaN
      : minorUnitsToNumber(collectionFeeMinor)
  const transferFeeFixed =
    transferFeeMinor === null ? Number.NaN : minorUnitsToNumber(transferFeeMinor)
  if (
    collectionFeeMinor === null ||
    collectionFeeMinor < 0n ||
    collectionFeeMinor > 10_000n ||
    transferFeeMinor === null ||
    transferFeeMinor < 0n
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
  const collectionFeeMinor = tryParseMinorUnits(
    req.body?.collectionFeePercent,
  )
  const transferFeeMinor = tryParseMinorUnits(req.body?.transferFeeFixed)
  const collectionFeePercent =
    collectionFeeMinor === null
      ? Number.NaN
      : minorUnitsToNumber(collectionFeeMinor)
  const transferFeeFixed =
    transferFeeMinor === null ? Number.NaN : minorUnitsToNumber(transferFeeMinor)
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
    collectionFeeMinor === null ||
    collectionFeeMinor < 0n ||
    collectionFeeMinor > 10_000n
  ) {
    return res
      .status(400)
      .json({ error: "Collection fee must be between 0% and 100%." })
  }
  if (
    transferFeeMinor === null ||
    transferFeeMinor < 0n ||
    transferFeeMinor > 100_000_000n
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
      ["collection_fee_percent", formatMinorUnits(collectionFeeMinor)],
      ["transfer_fee_fixed", formatMinorUnits(transferFeeMinor)],
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
      summary: `Collection fee ${formatMinorUnits(collectionFeeMinor)}%; transfer fee PHP ${formatMinorUnits(transferFeeMinor)}; ${
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
       merchant.downline_manually_enabled AS "downlineManuallyEnabled",
       merchant.contact_person AS "contactPerson", merchant.phone_number AS "phoneNumber",
       merchant.business_address AS "businessAddress",
       COALESCE(payout.bank_name, '') AS "bankName",
       COALESCE(payout.account_name, '') AS "accountName",
       COALESCE(payout.account_number, '') AS "accountNumber",
       crypto.address AS "usdtAddress",
       merchant.invitation_accepted_at AS "invitationAcceptedAt",
       merchant.registration_pending AS "registrationPending",
       kyb.status AS "kybStatus",
       merchant.created_at AS "createdAt", merchant.updated_at AS "updatedAt"
     FROM merchant_accounts merchant
     LEFT JOIN merchant_payout_accounts payout ON payout.merchant_email = merchant.email
     LEFT JOIN merchant_usdt_wallets crypto ON crypto.merchant_email = merchant.email
     LEFT JOIN merchant_kyb_profiles kyb ON kyb.merchant_email = merchant.email
     ORDER BY merchant.created_at DESC`,
  )
  return res.json(result.rows)
})

app.post("/v1/admin/merchants/:email/downline/activate", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res
      .status(400)
      .json({ error: "Enter a valid merchant email address." })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const account = await client.query(
      `SELECT downline_manually_enabled
       FROM merchant_accounts WHERE email = $1 FOR UPDATE`,
      [email],
    )
    if (!account.rowCount) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Merchant account not found." })
    }
    if (!account.rows[0].downline_manually_enabled) {
      await client.query(
        `UPDATE merchant_accounts
         SET downline_manually_enabled = TRUE, updated_at = NOW()
         WHERE email = $1`,
        [email],
      )
      await recordAdminAuditEvent(client, {
        eventKey: `merchant-downline:${randomUUID()}`,
        category: "Merchant account",
        action: "Merchant downline manually enabled",
        target: email,
        actor: req.adminEmail,
        summary:
          "Merchant downline access was enabled manually, bypassing downline eligibility requirements only.",
      })
    }
    await client.query("COMMIT")
    return res.json({ email, downlineManuallyEnabled: true })
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.post("/v1/admin/merchants/activate", async (req, res) => {
  const requestedEmails = req.body?.emails
  if (
    !Array.isArray(requestedEmails) ||
    requestedEmails.length === 0 ||
    requestedEmails.length > 100 ||
    requestedEmails.some(
      (email) =>
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        email.trim().length > 254,
    )
  ) {
    return res.status(400).json({
      error: "Select between 1 and 100 valid merchant email addresses.",
    })
  }
  const emails = requestedEmails.map((email) => email.trim().toLowerCase())
  if (new Set(emails).size !== emails.length) {
    return res
      .status(400)
      .json({ error: "Each merchant account can only be selected once." })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(84172031)")
    const accounts = await client.query(
      `SELECT account.email, account.active, account.registration_pending,
         profile.status AS kyb_status
       FROM merchant_accounts account
       LEFT JOIN merchant_kyb_profiles profile
         ON profile.merchant_email = account.email
       WHERE account.email = ANY($1)
       ORDER BY account.email
       FOR UPDATE OF account`,
      [emails],
    )
    if (accounts.rowCount !== emails.length) {
      await client.query("ROLLBACK")
      return res.status(404).json({
        error: "One or more selected merchant accounts could not be found.",
      })
    }
    if (
      accounts.rows.some(
        (account) =>
          account.registration_pending && account.kyb_status !== "APPROVED",
      )
    ) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error:
          "Review and approve the selected merchant KYB applications before enabling registration access.",
      })
    }

    const activated = await client.query(
      `UPDATE merchant_accounts SET
         active = TRUE,
         registration_pending = FALSE,
         updated_at = NOW()
       WHERE email = ANY($1) AND active = FALSE
         RETURNING email, business_name AS "businessName",
           contact_person AS "contactPerson"`,
      [emails],
    )
    for (const account of activated.rows) {
      await recordAdminAuditEvent(client, {
        eventKey: `merchant-status:${randomUUID()}`,
        category: "Merchant account",
        action: "Merchant access enabled",
        target: account.email,
        actor: req.adminEmail,
        summary: "Merchant account access was enabled.",
      })
    }
    await client.query("COMMIT")
    let activationEmailFailureCount = 0
    if (activated.rows.length) {
      try {
        await sendMerchantAccessReadyEmails(activated.rows)
      } catch (error) {
        activationEmailFailureCount = activated.rows.length
        console.error("Merchant access-ready email delivery failed", {
          recipientCount: activated.rows.length,
          error: error instanceof Error ? error.name : "email provider error",
        })
      }
    }
    return res.json({
      activatedEmails: activated.rows.map((account) => account.email),
      activationEmailFailureCount,
    })
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

async function sendMerchantInvitation(merchant) {
  const settingsResult = await pool.query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key = ANY($1)`,
    [
      [
        "collection_fee_percent",
        "transfer_fee_fixed",
        "agreement_activation_fee",
      ],
    ],
  )
  const settings = Object.fromEntries(
    settingsResult.rows.map((row) => [row.setting_key, row.setting_value]),
  )
  const createdAt = new Date()
  const agreementId = randomUUID()
  const [merchantAgreement, alipayPlusAgreement] = await Promise.all([
    createMerchantAgreementPdf({
      agreementId,
      merchantEmail: merchant.email,
      businessName: merchant.businessName,
      contactPerson: merchant.contactPerson,
      businessAddress: merchant.businessAddress,
      phoneNumber: merchant.phoneNumber,
      collectionFeePercent: Number(settings.collection_fee_percent ?? 0.5),
      transferFeeFixed: Number(settings.transfer_fee_fixed ?? 15),
      activationFee: Number(settings.agreement_activation_fee ?? 5000),
      createdAt,
    }),
    createAlipayPlusAgreementPdf({
      agreementId: `alipay-${agreementId}`,
      merchantName: merchant.businessName,
      merchantEmail: merchant.email,
      merchantAddress: merchant.businessAddress,
      contactPerson: merchant.contactPerson,
      phoneNumber: merchant.phoneNumber,
      createdAt,
    }),
  ])
  const attachments = [
    ["Merchant-Services-Agreement.pdf", merchantAgreement],
    ["Alipay-Plus-Service-Addendum.pdf", alipayPlusAgreement],
  ].map(([filename, content]) => ({
    filename,
    content: content.toString("base64"),
    content_type: "application/pdf",
  }))
  const invitationUrl = new URL("/login", frontendOrigin).toString()
  await sendMerchantInvitationEmail({
    to: merchant.email,
    from: resendFromEmail,
    apiKey: resendApiKey,
    attachments,
    invitation: {
      contactPerson: merchant.contactPerson,
      providerName: "DRPAY",
      businessName: merchant.businessName,
      invitationUrl,
    },
  })
}

async function sendMerchantIntegrationGuide(merchant) {
  const [guide, collection] = await Promise.all([
    createMerchantApiIntegrationGuidePdf({
      merchantName: merchant.businessName || merchant.email,
      apiBaseUrl: publicApiOrigin,
      checkoutOrigin,
      paymentEnvironment: swiftPayEnvironment,
    }),
    readFile(
      new URL(
        "../public/postman/DRPAY-Merchant-API.postman_collection.json",
        import.meta.url,
      ),
    ),
  ])
  const portalUrl = new URL("/login", frontendOrigin).toString()
  const postmanCollectionUrl = new URL(
    "/postman/DRPAY-Merchant-API.postman_collection.json",
    frontendOrigin,
  ).toString()
  const email = createMerchantApiGuideEmail({
    contactPerson:
      merchant.contactPerson || merchant.businessName || merchant.email,
    portalUrl,
    postmanCollectionUrl,
  })
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [merchant.email],
      ...email,
      attachments: [
        {
          filename: "DRPAY-Merchant-API-Integration-Guide.pdf",
          content: guide.toString("base64"),
          content_type: "application/pdf",
        },
        {
          filename: "DRPAY-Merchant-API.postman_collection.json",
          content: collection.toString("base64"),
          content_type: "application/json",
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`Resend returned HTTP ${response.status}.`)
  }
}

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

app.get("/v1/admin/merchants/:email/wallet", async (req, res) => {
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

  const [balanceResult, transactionResult] = await Promise.all([
    pool.query(
      `SELECT (
         COALESCE((SELECT SUM(amount) FROM merchant_wallet_ledger WHERE merchant_email = $1), 0) +
         COALESCE((SELECT SUM(amount) FROM merchant_wallet_adjustments WHERE merchant_email = $1), 0)
       )::float8 AS balance`,
      [email],
    ),
    pool.query(
      `SELECT wallet.id, wallet.source_type AS "sourceType",
         wallet.source_id::text AS "sourceId",
         wallet.reference_no AS "referenceNo",
         CASE
           WHEN wallet.source_type = 'COLLECTION'
             THEN COALESCE(payment.title, 'Payment collection')
           WHEN disbursement.refund_payment_id IS NOT NULL
             THEN 'Collection refund'
           ELSE COALESCE(disbursement.institution_code, 'Merchant transfer')
         END AS description,
         CASE
           WHEN wallet.source_type = 'COLLECTION' THEN payment.status
           ELSE disbursement.status
         END AS status,
         wallet.amount::float8 AS amount, wallet.created_at AS "createdAt"
       FROM merchant_wallet_ledger wallet
       LEFT JOIN payment_links payment
         ON wallet.source_type = 'COLLECTION' AND payment.id = wallet.source_id
       LEFT JOIN disbursements disbursement
         ON wallet.source_type = 'DISBURSEMENT' AND disbursement.id = wallet.source_id
       WHERE wallet.merchant_email = $1
       UNION ALL
       SELECT adjustment.id, 'ADMIN_ADJUSTMENT' AS "sourceType",
         adjustment.id::text AS "sourceId",
         adjustment.reference_no AS "referenceNo",
         adjustment.reason AS description, 'RECORDED' AS status,
         adjustment.amount::float8 AS amount,
         adjustment.created_at AS "createdAt"
       FROM merchant_wallet_adjustments adjustment
       WHERE adjustment.merchant_email = $1
       ORDER BY "createdAt" DESC, id DESC
       LIMIT 100`,
      [email],
    ),
  ])
  return res.set("Cache-Control", "no-store").json({
    merchantEmail: email,
    currency: "PHP",
    balance: balanceResult.rows[0].balance,
    transactions: transactionResult.rows,
  })
})

app.post("/v1/admin/merchants/:email/wallet/adjustments", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  const amountMinor = tryParseMinorUnits(req.body?.amount)
  const amount =
    amountMinor === null ? Number.NaN : minorUnitsToNumber(amountMinor)
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : ""
  if (
    amountMinor === null ||
    amountMinor === 0n ||
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
  const approvalPayload = {
    amount: formatMinorUnits(amountMinor),
    reason,
  }
  const approval = await prepareAdminApproval({
    req,
    res,
    actionKey: "merchant_wallet_adjustment",
    targetKey: email,
    payload: approvalPayload,
  })
  if (approval.response || approval.error) return approval.response || approval.error
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
    const wallet = await client.query(
      `WITH balance AS (
           SELECT
             COALESCE((SELECT SUM(amount) FROM merchant_wallet_ledger WHERE merchant_email = $1), 0) +
             COALESCE((SELECT SUM(amount) FROM merchant_wallet_adjustments WHERE merchant_email = $1), 0) AS amount
         ), reservations AS (
           SELECT COALESCE(SUM(
             CASE WHEN d.refund_payment_id IS NOT NULL
               THEN GREATEST(COALESCE(p.amount, d.amount) - COALESCE(f.amount, 0) - COALESCE(commission.amount, 0), 0)
               ELSE d.amount + d.transfer_fee
             END
           ), 0) AS amount
           FROM disbursements d
           LEFT JOIN payment_links p ON p.id = d.refund_payment_id
           LEFT JOIN platform_fee_ledger f
             ON f.source_type = 'COLLECTION' AND f.source_id = p.id
           LEFT JOIN downline_commissions commission ON commission.payment_id = p.id
           WHERE d.merchant_email = $1
             AND d.status NOT IN ('EXECUTED', 'SUCCESS', 'COMPLETED', 'REJECTED',
               'ERROR', 'FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REVERSED')
         )
         SELECT balance.amount::numeric AS balance,
           reservations.amount::numeric AS reserved
         FROM balance CROSS JOIN reservations`,
      [email],
    )
    if (
      addMinorUnits(
        parseMinorUnits(wallet.rows[0].balance),
        amountMinor,
      ) < parseMinorUnits(wallet.rows[0].reserved)
    ) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error:
          "This adjustment would reduce the merchant wallet below pending transfers.",
      })
    }
    const approvalConsumed = await consumeAdminApproval(client, {
      requestId: approval.requestId,
      actionKey: "merchant_wallet_adjustment",
      targetKey: email,
      payload: approvalPayload,
      actor: req.adminEmail,
    })
    if (!approvalConsumed) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error: "The approved action has already been used or is no longer valid.",
      })
    }
    const adjustmentId = randomUUID()
    const referenceNo = `ADMIN-${adjustmentId}`
    const result = await client.query(
      `INSERT INTO merchant_wallet_adjustments
           (id, merchant_email, amount, reference_no, reason, adjusted_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, 'ADMIN_ADJUSTMENT' AS "sourceType",
           id::text AS "sourceId", reference_no AS "referenceNo",
           reason AS description, 'RECORDED' AS status,
           amount::float8 AS amount, created_at AS "createdAt"`,
      [
        adjustmentId,
        email,
        formatMinorUnits(amountMinor),
        referenceNo,
        reason,
        req.adminEmail,
      ],
    )
    await postBalancedJournal(client, {
      sourceType: "MERCHANT_WALLET_ADJUSTMENT",
      sourceId: adjustmentId,
      reference: referenceNo,
      lines: walletAdjustmentJournalLines(amountMinor, "MERCHANT_PAYABLE"),
    })
    await recordAdminAuditEvent(client, {
      eventKey: `merchant-wallet-adjustment:${adjustmentId}`,
      category: "Merchant wallet",
      action: amount < 0 ? "Balance debited" : "Balance credited",
      target: email,
      actor: req.adminEmail,
      summary: `PHP ${formatMinorUnits(amountMinor)} · ${reason}`,
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

app.post("/v1/admin/internal-wallets/:email/adjustments", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  const amountMinor = tryParseMinorUnits(req.body?.amount)
  const amount =
    amountMinor === null ? Number.NaN : minorUnitsToNumber(amountMinor)
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : ""
  if (
    amountMinor === null ||
    amountMinor === 0n ||
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
  const approvalPayload = {
    amount: formatMinorUnits(amountMinor),
    reason,
  }
  const approval = await prepareAdminApproval({
    req,
    res,
    actionKey: "internal_wallet_adjustment",
    targetKey: email,
    payload: approvalPayload,
  })
  if (approval.response || approval.error) return approval.response || approval.error
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
      addMinorUnits(
        parseMinorUnits(balances.rows[0].balance),
        amountMinor,
      ) < parseMinorUnits(balances.rows[0].reserved)
    ) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error:
          "This adjustment would reduce the floating balance below pending transfer requests.",
      })
    }
    const approvalConsumed = await consumeAdminApproval(client, {
      requestId: approval.requestId,
      actionKey: "internal_wallet_adjustment",
      targetKey: email,
      payload: approvalPayload,
      actor: req.adminEmail,
    })
    if (!approvalConsumed) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error: "The approved action has already been used or is no longer valid.",
      })
    }
    const adjustmentId = randomUUID()
    const result = await client.query(
      `INSERT INTO internal_wallet_adjustments (id, merchant_email, amount, reason, adjusted_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, amount::float8 AS amount, reason, adjusted_by AS "adjustedBy", created_at AS "createdAt"`,
      [
        adjustmentId,
        email,
        formatMinorUnits(amountMinor),
        reason,
        req.adminEmail,
      ],
    )
    await postBalancedJournal(client, {
      sourceType: "INTERNAL_WALLET_ADJUSTMENT",
      sourceId: adjustmentId,
      reference: `FLOATING-${adjustmentId}`,
      lines: walletAdjustmentJournalLines(
        amountMinor,
        "MERCHANT_FLOATING_PAYABLE",
      ),
    })
    await recordAdminAuditEvent(client, {
      eventKey: `wallet-adjustment:${adjustmentId}`,
      category: "Floating balance",
      action: amount < 0 ? "Balance debited" : "Balance credited",
      target: email,
      actor: req.adminEmail,
      summary: `PHP ${formatMinorUnits(amountMinor)} · ${reason}`,
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
    const approvalPayload = {
      decision,
      failureReason: decision === "failed" ? failureReason : "",
      payoutReference: decision === "successful" ? payoutReference : "",
      payoutNote: decision === "successful" ? payoutNote : "",
    }
    const approval = await prepareAdminApproval({
      req,
      res,
      actionKey: "floating_transfer_decision",
      targetKey: id,
      payload: approvalPayload,
    })
    if (approval.response || approval.error) return approval.response || approval.error
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
      const approvalConsumed = await consumeAdminApproval(client, {
        requestId: approval.requestId,
        actionKey: "floating_transfer_decision",
        targetKey: id,
        payload: approvalPayload,
        actor: req.adminEmail,
      })
      if (!approvalConsumed) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "The approved action has already been used or is no longer valid.",
        })
      }
      const nextStatus = decision === "successful" ? "SUCCESSFUL" : "FAILED"
      if (nextStatus === "SUCCESSFUL") {
        const requestAmountMinor = parseMinorUnits(request.rows[0].amount)
        const transferFeeMinor = parseMinorUnits(
          request.rows[0].transfer_fee,
        )
        const debitAmountMinor = addMinorUnits(
          requestAmountMinor,
          transferFeeMinor,
        )
        await client.query(
          `INSERT INTO internal_wallet_adjustments (id, merchant_email, amount, reason, adjusted_by)
         VALUES ($1, $2, $3, $4, $5)`,
          [
            randomUUID(),
            email,
            formatMinorUnits(-debitAmountMinor),
            `Floating-balance transfer request ${id} including PHP ${formatMinorUnits(transferFeeMinor)} fee`,
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
            formatMinorUnits(transferFeeMinor),
          ],
        )
        await postBalancedJournal(client, {
          sourceType: "FLOATING_TRANSFER",
          sourceId: id,
          reference: payoutReference,
          lines: [
            {
              accountCode: "MERCHANT_FLOATING_PAYABLE",
              side: "debit",
              amount: formatMinorUnits(
                addMinorUnits(requestAmountMinor, transferFeeMinor),
              ),
            },
            {
              accountCode: "BANK_CLEARING",
              side: "credit",
              amount: formatMinorUnits(requestAmountMinor),
            },
            ...(transferFeeMinor > 0n
              ? [
                  {
                    accountCode: "PLATFORM_FEE_REVENUE",
                    side: "credit",
                    amount: formatMinorUnits(transferFeeMinor),
                  },
                ]
              : []),
          ],
        })
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
      if (nextStatus === "SUCCESSFUL") {
        await queueAdminMoneyNotification(
          {
            eventType: "FLOATING_TRANSFER",
            eventId: id,
            merchantEmail: email,
            direction: "OUT",
            amount: request.rows[0].amount,
            currency: "PHP",
            reference: payoutReference,
            details: `Floating-balance payout via ${request.rows[0].bank_name}; fee PHP ${Number(request.rows[0].transfer_fee).toFixed(2)}`,
          },
          client,
        )
      }
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
  const businessName =
    typeof req.body?.businessName === "string"
      ? req.body.businessName.trim()
      : ""
  const contactPerson =
    typeof req.body?.contactPerson === "string"
      ? req.body.contactPerson.trim()
      : ""
  const businessAddress =
    typeof req.body?.businessAddress === "string"
      ? req.body.businessAddress.trim()
      : ""
  const phoneNumber =
    typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber.trim() : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res
      .status(400)
      .json({ error: "Enter a valid merchant email address." })
  }
  if (
    !businessName ||
    businessName.length > 160 ||
    !contactPerson ||
    contactPerson.length > 120 ||
    !businessAddress ||
    businessAddress.length > 500 ||
    phoneNumber.length > 40
  ) {
    return res.status(400).json({
      error: "Enter valid business name, contact, address, and phone details.",
    })
  }
  const client = await pool.connect()
  let merchant
  try {
    await client.query("BEGIN")
    const result = await client.query(
      `INSERT INTO merchant_accounts
         (email, business_name, contact_person, phone_number, business_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING email, active, business_name AS "businessName", contact_person AS "contactPerson",
         phone_number AS "phoneNumber", business_address AS "businessAddress",
         '' AS "bankName", '' AS "accountName", '' AS "accountNumber",
         NULL AS "usdtAddress",
         FALSE AS "registrationPending",
         created_at AS "createdAt", updated_at AS "updatedAt"`,
      [email, businessName, contactPerson, phoneNumber, businessAddress],
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
    merchant = result.rows[0]
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
  try {
    await sendMerchantInvitation(merchant)
  } catch (error) {
    console.error("Merchant invitation email delivery failed", {
      email,
      error: error instanceof Error ? error.message : "unknown error",
    })
    return res.status(503).json({
      error:
        "Merchant account was created, but the invitation email could not be sent. Resend the invitation to retry.",
    })
  }
  return res.status(201).json({
    ...merchant,
    invitationEmailStatus: "sent",
  })
})

app.post("/v1/admin/merchants/:email/invitation", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Choose a valid merchant account." })
  }
  const result = await pool.query(
    `SELECT email, business_name AS "businessName",
       contact_person AS "contactPerson", phone_number AS "phoneNumber",
       business_address AS "businessAddress"
     FROM merchant_accounts WHERE email = $1 AND active = TRUE`,
    [email],
  )
  if (!result.rowCount) {
    return res.status(404).json({ error: "Active merchant account not found." })
  }
  try {
    await sendMerchantInvitation(result.rows[0])
  } catch (error) {
    console.error("Merchant invitation email resend failed", {
      email,
      error: error instanceof Error ? error.message : "unknown error",
    })
    return res.status(503).json({
      error:
        "The merchant invitation email could not be sent. Try again later.",
    })
  }
  return res.json({ email, invitationEmailStatus: "sent" })
})

app.post("/v1/admin/merchants/:email/integration-guide", async (req, res) => {
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Choose a valid merchant account." })
  }
  const result = await pool.query(
    `SELECT email, business_name AS "businessName",
       contact_person AS "contactPerson"
     FROM merchant_accounts WHERE email = $1 AND active = TRUE`,
    [email],
  )
  if (!result.rowCount) {
    return res.status(404).json({ error: "Active merchant account not found." })
  }
  try {
    await sendMerchantIntegrationGuide(result.rows[0])
  } catch (error) {
    console.error("Merchant API integration guide delivery failed", {
      email,
      error: error instanceof Error ? error.message : "unknown error",
    })
    return res.status(503).json({
      error:
        "The merchant API integration guide could not be sent. Try again later.",
    })
  }
  return res.json({ email, integrationEmailStatus: "sent" })
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
        `INSERT INTO merchant_usdt_wallets
           (merchant_email, address, network, assigned_by, assigned_at, starting_balance)
           SELECT email, $2, 'TRON_MAINNET', $3, NOW(), NULL
         FROM merchant_accounts WHERE email = $1
         ON CONFLICT (merchant_email) DO UPDATE SET address = EXCLUDED.address,
           network = EXCLUDED.network, assigned_by = EXCLUDED.assigned_by,
           assigned_at = EXCLUDED.assigned_at,
           starting_balance = EXCLUDED.starting_balance, updated_at = NOW()
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
           registration_pending AS "registrationPending",
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
      "SELECT email, active FROM merchant_accounts WHERE email = $1",
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
    if (req.body.active === true) {
      const registration = await client.query(
        `SELECT account.registration_pending, profile.status AS kyb_status
         FROM merchant_accounts account
         LEFT JOIN merchant_kyb_profiles profile ON profile.merchant_email = account.email
         WHERE account.email = $1`,
        [email],
      )
      if (
        registration.rows[0].registration_pending &&
        registration.rows[0].kyb_status !== "APPROVED"
      ) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error:
            "Review and approve the merchant KYB application before enabling registration access.",
        })
      }
    }
    const result = await client.query(
      `UPDATE merchant_accounts SET
         active = $2,
         registration_pending = CASE WHEN $2 THEN FALSE ELSE registration_pending END,
         updated_at = NOW()
       WHERE email = $1
       RETURNING email, active, business_name AS "businessName", contact_person AS "contactPerson",
         phone_number AS "phoneNumber", business_address AS "businessAddress",
         registration_pending AS "registrationPending",
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
    let activationEmailStatus
    if (req.body.active && !account.rows[0].active) {
      try {
        await sendMerchantAccessReadyEmails([result.rows[0]])
        activationEmailStatus = "sent"
      } catch (error) {
        activationEmailStatus = "failed"
        console.error("Merchant access-ready email delivery failed", {
          error: error instanceof Error ? error.name : "email provider error",
        })
      }
    }
    return res.json({
      ...result.rows[0],
      ...payout.rows[0],
      ...(activationEmailStatus ? { activationEmailStatus } : {}),
    })
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
       (p.kyb_consent_at IS NOT NULL) AS "kybConsentGiven",
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
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const application = await client.query(
      `SELECT kyb_consent_at AS "consentAt"
       FROM merchant_kyb_profiles
       WHERE merchant_email = $1
       FOR UPDATE`,
      [email],
    )
    if (!application.rowCount) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "KYB application not found." })
    }
    if (status === "APPROVED") {
      if (!application.rows[0].consentAt) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "The merchant must confirm the KYB review consent before approval.",
        })
      }
      const documents = await client.query(
        `SELECT document_type
         FROM merchant_kyb_documents
         WHERE merchant_email = $1 AND document_type = ANY($2::text[])`,
        [email, requiredKybDocumentTypes],
      )
      const missingDocuments = getMissingRequiredKybDocuments(
        documents.rows.map((document) => document.document_type),
      )
      if (missingDocuments.length) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error: "Business registration and both sides of the owner's ID are required before approval.",
        })
      }
    }
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
    const merchant = await client.query(
      `SELECT email, active, business_name AS "businessName",
         contact_person AS "contactPerson"
       FROM merchant_accounts WHERE email = $1`,
      [email],
    )
    if (!merchant.rowCount) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Merchant account not found." })
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
    let emailNotificationStatus
    try {
      await sendMerchantKybReviewNotification(
        merchant.rows[0],
        status,
        reviewNotes,
      )
      emailNotificationStatus = "sent"
    } catch (error) {
      emailNotificationStatus = "failed"
      console.error("Merchant KYB notification email delivery failed", {
        status,
        error: error instanceof Error ? error.name : "email provider error",
      })
    }
    return res.json({ ...result.rows[0], emailNotificationStatus })
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
      `SELECT id, code, title, reference_no, amount::float8 AS amount, currency, status, payment_token, qr_payload,
        payment_institution_code, payment_institution_name, payment_institution_logo_url,
        payment_institution_deep_link, virtual_account_bank_account_number,
        virtual_account_instapay_bank_code, virtual_account_reference_no,
        checkout_instructions, email_subject,
        email_brand_color, email_logo_url, customer_email,
        to_char(estimated_delivery_date, 'YYYY-MM-DD') AS estimated_delivery_date
     FROM payment_links WHERE code = $1 AND checkout_type = 'DIRECT_QRPH'`,
      [code],
    )
    const row = record.rows[0]
    if (!row?.payment_token)
      return res.status(404).json({ error: "Checkout not found." })

    let status = row.status
    let statusCheckUnavailable = false
    if (
      ![
        "EXECUTED",
        "MANUALLY_PAID",
        "CANCELED",
        "REJECTED",
        "EXPIRED",
      ].includes(status)
    ) {
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
      customerEmail:
        ["EXECUTED", "MANUALLY_PAID"].includes(status) &&
        row.estimated_delivery_date &&
        row.customer_email
          ? row.customer_email
          : undefined,
      estimatedDeliveryDate:
        ["EXECUTED", "MANUALLY_PAID"].includes(status) &&
        row.estimated_delivery_date &&
        row.customer_email
          ? row.estimated_delivery_date
          : undefined,
      amount: row.amount,
      currency: row.currency,
      status,
      statusCheckUnavailable,
      qrCode: row.qr_payload,
      isTaxInvoice:
        row.email_subject?.startsWith("DRPAY: BIR 2307") ||
        row.email_subject?.startsWith("DRPAY: Tax invoice"),
      institutionCode: row.payment_institution_code,
      institutionName: row.payment_institution_name,
      institutionLogoUrl: row.payment_institution_logo_url,
      institutionDeepLink: row.payment_institution_deep_link,
      virtualAccountInfo: virtualAccountInformationFromRow(row),
      checkoutInstructions:
        row.payment_institution_code === VIRTUAL_ACCOUNT_INSTITUTION_CODE &&
        row.checkout_instructions === defaultCheckoutInstructions
          ? defaultVirtualAccountCheckoutInstructions
          : row.checkout_instructions.replaceAll(
              "{bank}",
              row.payment_institution_name || "bank",
            ),
      brandColor: row.email_brand_color,
      logoUrl: row.email_logo_url,
    })
  },
)

app.use("/v1", requireMerchant)

function requireInteractiveMerchantSession(req, res, next) {
  if (req.apiKey) return res.status(403).json({
      error:
        "Sign in with a merchant session to manage linked sign-in methods.",
    })
  return next()
}

app.use("/v1/security/auth-methods", requireInteractiveMerchantSession)
app.use("/v1/security/passkeys", requireInteractiveMerchantSession)

app.get("/v1/security/auth-methods", async (req, res) => {
  const [identities, passkeys] = await Promise.all([
    pool.query(
      `SELECT provider FROM merchant_auth_identities
       WHERE merchant_email = $1`,
      [req.merchantEmail],
    ),
    pool.query(
      `SELECT credential_id AS id, created_at AS "createdAt"
       FROM merchant_passkeys WHERE merchant_email = $1
       ORDER BY created_at ASC`,
      [req.merchantEmail],
    ),
  ])
  return res.set("Cache-Control", "no-store").json({
    google: identities.rows.some((row) => row.provider === "google"),
    telegram: identities.rows.some((row) => row.provider === "telegram"),
    passkeys: passkeys.rows,
  })
})

app.post(
  "/v1/security/auth-methods/google/challenge",
  loginLimiter,
  async (req, res) => {
    if (!googleAuthClient) return res.status(503).json({
        error: "Google sign-in is not configured for this service.",
      })
    const nonce = randomBytes(32).toString("base64url")
    const challengeId = await createMerchantAuthChallenge(
      "google",
      "link",
      req.merchantEmail,
      nonce,
    )
    return res.set("Cache-Control", "no-store").json({ challengeId, nonce })
  },
)

app.post("/v1/security/auth-methods/google", loginLimiter, async (req, res) => {
  const challenge = await consumeMerchantAuthChallenge(
    req.body?.challengeId,
    "google",
    "link",
  )
  if (!challenge || challenge.merchantEmail !== req.merchantEmail)
    return res.status(401).json({ error: "Google linking expired. Try again." })
  let identity
  try {
    identity = await verifyGoogleIdentityToken(
      req.body?.credential,
      challenge.challenge,
    )
  } catch {
    return res.status(401).json({
      error: "Google sign-in could not be verified. Try again.",
    })
  }
  try {
    return res
      .set("Cache-Control", "no-store")
      .json(
        await linkMerchantAuthIdentity(
          req.merchantEmail,
          "google",
          identity.subject,
        ),
      )
  } catch (error) {
    if (error instanceof Error && error.message.includes("already linked"))
      return res.status(409).json({ error: error.message })
    throw error
  }
})

app.delete("/v1/security/auth-methods/:provider", async (req, res) => {
  const provider = req.params.provider
  if (!["google", "telegram"].includes(provider))
    return res.status(400).json({ error: "Choose a valid sign-in method." })
  await pool.query(
    `DELETE FROM merchant_auth_identities
     WHERE merchant_email = $1 AND provider = $2`,
    [req.merchantEmail, provider],
  )
  return res.set("Cache-Control", "no-store").json({ linked: false })
})

app.post(
  "/v1/security/auth-methods/telegram/challenge",
  loginLimiter,
  async (req, res) => {
    if (!telegramLoginClientId)
      return res
        .status(503)
        .json({ error: "Telegram sign-in is not configured for this service." })
    const nonce = randomBytes(32).toString("base64url")
    const challengeId = await createMerchantAuthChallenge(
      "telegram",
      "link",
      req.merchantEmail,
      nonce,
    )
    return res.set("Cache-Control", "no-store").json({
      challengeId,
      nonce,
      clientId: telegramLoginClientId,
    })
  },
)

app.post(
  "/v1/security/auth-methods/telegram",
  loginLimiter,
  async (req, res) => {
    const challenge = await consumeMerchantAuthChallenge(
      req.body?.challengeId,
      "telegram",
      "link",
    )
    if (!challenge || challenge.merchantEmail !== req.merchantEmail)
      return res
        .status(401)
        .json({ error: "Telegram linking expired. Try again." })
    let identity
    try {
      identity = await verifyTelegramIdentityToken(
        req.body?.idToken,
        challenge.challenge,
      )
    } catch {
      return res.status(401).json({
        error: "Telegram sign-in could not be verified. Try again.",
      })
    }
    try {
      return res
        .set("Cache-Control", "no-store")
        .json(
          await linkMerchantAuthIdentity(
            req.merchantEmail,
            "telegram",
            identity.subject,
          ),
        )
    } catch (error) {
      if (error instanceof Error && error.message.includes("already linked"))
        return res.status(409).json({ error: error.message })
      throw error
    }
  },
)

app.post(
  "/v1/security/passkeys/register/options",
  loginLimiter,
  async (req, res) => {
    if (!passkeyRpId || !passkeyExpectedOrigin)
      return res
        .status(503)
        .json({ error: "Passkey linking is not configured for this service." })
    const existing = await pool.query(
      `SELECT credential_id AS id, transports FROM merchant_passkeys
     WHERE merchant_email = $1`,
      [req.merchantEmail],
    )
    const options = await generateRegistrationOptions({
      rpName: "DRPAY Merchant",
      rpID: passkeyRpId,
      userName: req.merchantEmail,
      userDisplayName: req.merchantEmail,
      userID: createHash("sha256").update(req.merchantEmail).digest(),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: existing.rows.map((row) => ({
        id: row.id,
        transports: row.transports,
      })),
    })
    const challengeId = await createMerchantAuthChallenge(
      "passkey",
      "register",
      req.merchantEmail,
      options.challenge,
    )
    return res.set("Cache-Control", "no-store").json({ challengeId, options })
  },
)

app.post(
  "/v1/security/passkeys/register/verify",
  loginLimiter,
  async (req, res) => {
    const challenge = await consumeMerchantAuthChallenge(
      req.body?.challengeId,
      "passkey",
      "register",
    )
    if (!challenge || challenge.merchantEmail !== req.merchantEmail)
      return res
        .status(401)
        .json({ error: "Passkey setup expired. Try again." })
    if (!passkeyRpId || !passkeyExpectedOrigin)
      return res
        .status(503)
        .json({ error: "Passkey linking is not configured for this service." })
    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: req.body?.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: passkeyExpectedOrigin,
        expectedRPID: passkeyRpId,
        requireUserVerification: true,
      })
    } catch {
      return res
        .status(400)
        .json({ error: "Passkey setup could not be verified." })
    }
    if (!verification.verified)
      return res
        .status(400)
        .json({ error: "Passkey setup could not be verified." })
    const { credential } = verification.registrationInfo
    try {
      await pool.query(
        `INSERT INTO merchant_passkeys
         (credential_id, merchant_email, public_key, counter, transports)
       VALUES ($1, $2, $3, $4, $5)`,
        [
          credential.id,
          req.merchantEmail,
          Buffer.from(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports || []),
        ],
      )
    } catch (error) {
      if (error.code === "23505")
        return res
          .status(409)
          .json({ error: "This passkey is already registered." })
      throw error
    }
    return res.set("Cache-Control", "no-store").json({ registered: true })
  },
)

app.delete("/v1/security/passkeys/:credentialId", async (req, res) => {
  const credentialId = req.params.credentialId
  if (
    typeof credentialId !== "string" ||
    credentialId.length < 1 ||
    credentialId.length > 1024
  )
    return res.status(400).json({ error: "Choose a valid passkey." })
  await pool.query(
    `DELETE FROM merchant_passkeys
     WHERE merchant_email = $1 AND credential_id = $2`,
    [req.merchantEmail, credentialId],
  )
  return res.set("Cache-Control", "no-store").json({ removed: true })
})

async function getAssignedMainnetUsdtAddress(email) {
  const { rows } = await pool.query(
    "SELECT address FROM merchant_usdt_wallets WHERE merchant_email = $1 AND network = 'TRON_MAINNET'",
    [email],
  )
  return rows[0]?.address || null
}

function isUsdtWithdrawalRequestAvailable(address) {
  return tronUsdtNetwork === "mainnet" && Boolean(address)
}

app.get(
  "/v1/crypto/usdt-withdrawal-config",
  cryptoWalletLimiter,
  async (req, res) => {
    const address = await getAssignedMainnetUsdtAddress(req.merchantEmail)
    const enabled = isUsdtWithdrawalRequestAvailable(address)
    return res.set("Cache-Control", "no-store").json({
      enabled,
      minimum: formatUsdtAmount(tronUsdtWithdrawalMinimum),
      message:
        tronUsdtNetwork !== "mainnet"
          ? "USDT withdrawal requests are unavailable in this API environment."
          : !address
            ? "A TRON mainnet wallet must be assigned before requesting a withdrawal."
            : null,
    })
  },
)

function usdtWithdrawalRequestColumns() {
  return `id, merchant_email AS "merchantEmail", amount::text AS amount,
    from_address AS "fromAddress", destination, status,
    requested_at AS "requestedAt", reviewed_at AS "reviewedAt",
    reviewed_by AS "reviewedBy", transaction_id AS "transactionId",
    rejection_reason AS "rejectionReason"`
}

app.get("/v1/crypto/usdt-withdrawals", async (req, res) => {
  const result = await pool.query(
    `SELECT ${usdtWithdrawalRequestColumns()}
     FROM crypto_withdrawal_requests
     WHERE merchant_email = $1
     ORDER BY requested_at DESC LIMIT 50`,
    [req.merchantEmail],
  )
  return res.set("Cache-Control", "no-store").json(result.rows)
})

app.post("/v1/crypto/usdt-withdrawals", pinAttemptLimiter, async (req, res) => {
  const pin = typeof req.body?.pin === "string" ? req.body.pin : ""
  const amountText = typeof req.body?.amount === "string" ? req.body.amount : ""
  const destination =
    typeof req.body?.destination === "string" ? req.body.destination.trim() : ""
  const amount = parseUsdtAmount(amountText)
  const fromAddress = await getAssignedMainnetUsdtAddress(req.merchantEmail)
  if (!isUsdtWithdrawalRequestAvailable(fromAddress)) {
    return res.status(403).json({
      error:
        "A TRON mainnet wallet and an available USDT withdrawal request limit are required.",
    })
  }
  if (
    !/^\d{4}$/.test(pin) ||
    amount === null ||
    amount < tronUsdtWithdrawalMinimum ||
    !tronAddressPayload(destination) ||
    destination === fromAddress
  ) {
    return res.status(400).json({
      error: `Enter a valid destination and an amount of at least ${formatUsdtAmount(tronUsdtWithdrawalMinimum)} USDT, then confirm with your four-digit MPIN.`,
    })
  }
  const pinResult = await verifyMerchantPin(req.merchantEmail, pin)
  if (pinResult.status !== 200)
    return res.status(pinResult.status).json({ error: pinResult.error })

  const result = await pool.query(
    `INSERT INTO crypto_withdrawal_requests
        (id, merchant_email, amount, from_address, destination, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING ${usdtWithdrawalRequestColumns()}`,
    [
      randomUUID(),
      req.merchantEmail,
      formatUsdtAmount(amount),
      fromAddress,
      destination,
    ],
  )
  return res.status(201).set("Cache-Control", "no-store").json(result.rows[0])
})

async function fetchMainnetUsdtBalance(address) {
  const addressPayload = tronAddressPayload(address)
  const contractPayload = tronAddressPayload(tronMainnetUsdtContract)
  if (!addressPayload || !contractPayload) {
    throw new Error("The assigned wallet address or USDT contract is invalid.")
  }
  const response = await fetch(
    "https://tron-mainnet.gateway.tatum.io/wallet/triggerconstantcontract",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": tatumApiKey,
      },
      body: JSON.stringify({
        owner_address: address,
        contract_address: tronMainnetUsdtContract,
        function_selector: "balanceOf(address)",
        parameter: addressPayload.subarray(1).toString("hex").padStart(64, "0"),
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
    throw new Error("Tatum did not return a valid TRC20 contract result.")
  }
  const balance = formatTokenBalance(rawBalance, tronMainnetUsdtDecimals)
  if (balance === null)
    throw new Error("Tatum returned an invalid token balance.")
  return balance
}

async function getMerchantActivation(email) {
  const [walletResult, feeResult, settingResult, walletState] =
    await Promise.all([
      pool.query(
        `SELECT address, network, assigned_at, starting_balance
         FROM merchant_usdt_wallets WHERE merchant_email = $1`,
        [email],
      ),
      pool.query(
        `SELECT amount FROM merchant_wallet_ledger
         WHERE merchant_email = $1 AND source_type = 'ACTIVATION_FEE'
         LIMIT 1`,
        [email],
      ),
      pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'agreement_activation_fee'",
      ),
      getMerchantWalletState(pool, email),
    ])
  const assigned = walletResult.rows[0] || null
  const requiredAmountMinor = tryParseMinorUnits(
    settingResult.rows[0]?.setting_value ?? "5000",
  )
  if (requiredAmountMinor === null || requiredAmountMinor < 0n) {
    throw new Error("The configured merchant activation fee is invalid.")
  }
  const requiredAmount = minorUnitsToNumber(requiredAmountMinor)
  let currentBalance = null
  let configured = Boolean(tronUsdtNetwork === "mainnet" && tatumApiKey)
  let message = assigned
    ? null
    : "We're working on assigning your USDT address."
  if (assigned?.network !== "TRON_MAINNET" && assigned) {
    configured = false
    message =
      "A TRON mainnet wallet is required to complete merchant service activation."
  } else if (assigned && !configured) {
    message =
      "Mainnet USDT balance lookup is disabled or Tatum is not configured on this API service."
  } else if (assigned) {
    currentBalance = await fetchMainnetUsdtBalance(assigned.address)
    if (assigned.starting_balance === null) {
      const baseline = await pool.query(
        `UPDATE merchant_usdt_wallets SET starting_balance = $2
         WHERE merchant_email = $1 AND starting_balance IS NULL
         RETURNING starting_balance, assigned_at`,
        [email, currentBalance],
      )
      if (baseline.rowCount) {
        assigned.starting_balance = baseline.rows[0].starting_balance
        assigned.assigned_at = baseline.rows[0].assigned_at
      } else {
        const latest = await pool.query(
          `SELECT starting_balance, assigned_at FROM merchant_usdt_wallets
           WHERE merchant_email = $1`,
          [email],
        )
        assigned.starting_balance = latest.rows[0]?.starting_balance ?? null
        assigned.assigned_at =
          latest.rows[0]?.assigned_at ?? assigned.assigned_at
      }
    }
  }
  const qualifyingBalance = getPostAssignmentUsdtBalance(
    currentBalance,
    assigned?.starting_balance === null ||
      assigned?.starting_balance === undefined
      ? null
      : String(assigned.starting_balance),
  )
  const activationFeePaid = feeResult.rowCount > 0
  const availableWalletBalanceMinor = subtractMinorUnits(
    parseMinorUnits(walletState.balance_exact),
    parseMinorUnits(walletState.reserved_exact),
  )
  const availableWalletBalance = minorUnitsToNumber(
    availableWalletBalanceMinor > 0n ? availableWalletBalanceMinor : 0n,
  )
  const fullyActivated = isMerchantFullyActivated({
    activationFeePaid,
    qualifyingUsdtBalance: qualifyingBalance,
  })
  return {
    activation: {
      activationFee: {
        requiredAmount,
        chargedAmount: activationFeePaid
          ? Math.abs(Number(feeResult.rows[0].amount))
          : 0,
        availableWalletBalance: activationFeePaid
          ? null
          : availableWalletBalance,
        complete: activationFeePaid,
      },
      usdtBalance: {
        requiredAmount: MERCHANT_USDT_BALANCE_MILESTONE,
        currentBalance,
        qualifyingBalance,
        assignedAt: assigned?.assigned_at || null,
        complete: meetsUsdtMinimumBalance(qualifyingBalance),
        message,
      },
      fullyActivated,
    },
    address: assigned?.address || null,
    network: assigned?.network || "TRON_MAINNET",
    balance: currentBalance,
    qualifyingBalance,
    configured,
    message,
  }
}

async function getMerchantDownlineStatus(email) {
  const account = await pool.query(
    `SELECT downline_manually_enabled
     FROM merchant_accounts WHERE email = $1`,
    [email],
  )
  if (account.rows[0]?.downline_manually_enabled) {
    return { enabled: true, message: null }
  }
  const wallet = await getMerchantActivation(email)
  return {
    enabled: wallet.activation.fullyActivated,
    message:
      wallet.activation.usdtBalance.message ||
      "Merchant downline unlocks after the activation fee is paid and 100 qualifying USDT is held in your assigned wallet.",
  }
}

app.get("/v1/crypto/usdt-wallet", cryptoWalletLimiter, async (req, res) => {
  try {
    const wallet = await getMerchantActivation(req.merchantEmail)
    return res.set("Cache-Control", "no-store").json(wallet)
  } catch (error) {
    console.error(
      "TRON mainnet USDT balance lookup failed",
      error.name || "RPC error",
    )
    return res.status(503).set("Cache-Control", "no-store").json({
      error:
        "Could not retrieve your wallet activation status. Try again shortly.",
    })
  }
})

app.get("/v1/merchant/downline", cryptoWalletLimiter, async (req, res) => {
  if (req.apiKey) {
    return res.status(403).json({
      error: "Sign in with your merchant account to access your downline.",
    })
  }
  try {
    const downlineStatus = await getMerchantDownlineStatus(req.merchantEmail)
    if (!downlineStatus.enabled) {
      return res.set("Cache-Control", "no-store").json({
        enabled: false,
        referralCode: null,
        referrals: [],
        message: downlineStatus.message,
      })
    }
    const referralCode = await ensureMerchantReferralCode(req.merchantEmail)
    const result = await pool.query(
      `SELECT email, business_name AS "businessName", active,
         registration_pending AS "registrationPending",
         downline_commission_rate::float8 AS "commissionRate",
         created_at AS "createdAt"
       FROM merchant_accounts
       WHERE referred_by_email = $1
       ORDER BY created_at DESC`,
      [req.merchantEmail],
    )
    return res.set("Cache-Control", "no-store").json({
      enabled: true,
      referralCode,
      referrals: result.rows,
      message: null,
    })
  } catch (error) {
    console.error(
      "Merchant downline lookup failed",
      error.code || error.name || "unknown error",
    )
    return res.status(503).json({
      error: "Could not load your downline. Try again shortly.",
    })
  }
})

app.put("/v1/merchant/downline/:email/rate", async (req, res) => {
  if (req.apiKey) {
    return res.status(403).json({
      error: "Sign in with your merchant account to manage commission rates.",
    })
  }
  const email =
    typeof req.params.email === "string"
      ? req.params.email.trim().toLowerCase()
      : ""
  const rate = req.body?.rate
  const rateMinor = tryParseMinorUnits(rate)
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    typeof rate !== "number" ||
    rateMinor === null ||
    rateMinor < 0n ||
    rateMinor > BigInt(MAX_DOWNLINE_COMMISSION_PERCENT * 100)
  ) {
    return res.status(400).json({
      error: `Enter a commission rate from 0 to ${MAX_DOWNLINE_COMMISSION_PERCENT}% with no more than two decimal places.`,
    })
  }
  try {
    const downlineStatus = await getMerchantDownlineStatus(req.merchantEmail)
    if (!downlineStatus.enabled) {
      return res.status(403).json({
        error: "Complete merchant wallet activation to manage downline rates.",
      })
    }
    const updated = await pool.query(
      `UPDATE merchant_accounts downline
       SET downline_commission_rate = $3, updated_at = NOW()
       FROM merchant_accounts referrer
       WHERE downline.email = $1
         AND downline.referred_by_email = referrer.email
         AND referrer.email = $2
       RETURNING downline.email,
         downline.downline_commission_rate::float8 AS "commissionRate"`,
      [email, req.merchantEmail, formatMinorUnits(rateMinor)],
    )
    if (!updated.rowCount) {
      return res.status(404).json({
        error: "That merchant is not in your downline.",
      })
    }
    return res.set("Cache-Control", "no-store").json(updated.rows[0])
  } catch (error) {
    console.error(
      "Merchant downline commission update failed",
      error.code || error.name || "unknown error",
    )
    return res.status(503).json({
      error: "Could not save this commission rate. Try again shortly.",
    })
  }
})

async function fetchConfirmedUsdtDeposits(address) {
  const endpoint = new URL(
    `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20`,
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
    throw new Error(`TRON transaction service returned HTTP ${response.status}`)
  const result = await response.json()
  if (!Array.isArray(result?.data)) {
    throw new Error("TRON transaction service returned an invalid deposit list")
  }
  return result.data
    .filter(
      (item) =>
        typeof item?.to === "string" &&
        item.to.toLowerCase() === address.toLowerCase() &&
        String(item?.token_info?.address || "").toLowerCase() ===
          tronMainnetUsdtContract.toLowerCase() &&
        String(item?.token_info?.symbol || "").toUpperCase() === "USDT" &&
        Number(item?.token_info?.decimals) === tronMainnetUsdtDecimals &&
        typeof item?.value === "string" &&
        /^[0-9]+$/.test(item.value) &&
        typeof item?.from === "string" &&
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
}

async function scanTelegramUsdtDeposits() {
  if (!telegramBotToken || !telegramChatId || tronUsdtNetwork !== "mainnet") {
    return
  }
  if (scanningTelegramUsdtDeposits) return
  scanningTelegramUsdtDeposits = true
  try {
    const wallets = await pool.query(
      `SELECT merchant_email, address FROM merchant_usdt_wallets
       WHERE network = 'TRON_MAINNET' ORDER BY merchant_email`,
    )
    for (const wallet of wallets.rows) {
      let scanStage = "recording wallet scan state"
      try {
        const state = await pool.query(
          `INSERT INTO admin_telegram_wallet_scans (merchant_email)
           VALUES ($1) ON CONFLICT (merchant_email) DO UPDATE
             SET merchant_email = EXCLUDED.merchant_email
           RETURNING first_scan_at`,
          [wallet.merchant_email],
        )
        const firstScanAt = new Date(state.rows[0].first_scan_at)
        // Include recent confirmations while keeping older wallet history out of the first alert batch.
        const depositScanCutoff = firstScanAt.getTime() - 5 * 60_000
        scanStage = "fetching confirmed TRON deposits"
        const deposits = await fetchConfirmedUsdtDeposits(wallet.address)
        for (const deposit of deposits) {
          if (new Date(deposit.blockTimestamp).getTime() < depositScanCutoff)
            continue
          scanStage = "queuing Telegram deposit notification"
          await queueAdminMoneyNotification({
            eventType: "USDT_DEPOSIT",
            eventId: `${deposit.transactionId}:${deposit.from}:${deposit.amount}`,
            merchantEmail: wallet.merchant_email,
            direction: "IN",
            amount: deposit.amount,
            currency: "USDT",
            reference: deposit.transactionId,
            details: `Confirmed USDT deposit to ${wallet.address}`,
          })
        }
      } catch (error) {
        console.error("Telegram USDT deposit scan failed", {
          merchantEmail: wallet.merchant_email,
          stage: scanStage,
          error: error instanceof Error ? error.message : String(error),
          errorCode: error?.code,
        })
      }
    }
  } finally {
    scanningTelegramUsdtDeposits = false
  }
}

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
    const deposits = await fetchConfirmedUsdtDeposits(assigned.address)
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
         status, review_notes AS "reviewNotes", updated_at AS "updatedAt",
         (kyb_consent_at IS NOT NULL) AS "kybConsentGiven"
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

app.post("/v1/kyb/sumsub/access-token", sumsubKybLimiter, async (req, res) => {
  const appToken = process.env.SUMSUB_APP_TOKEN
  const secretKey = process.env.SUMSUB_SECRET_KEY
  const levelName = process.env.SUMSUB_KYB_LEVEL_NAME
  const webhookSecret = process.env.SUMSUB_WEBHOOK_SECRET
  if (!appToken || !secretKey || !levelName || !webhookSecret) {
    return res.status(503).json({
      error: "Sumsub KYB is not configured on this server.",
    })
  }
  if (req.body?.consent !== true) {
    return res.status(400).json({
      error: "Consent is required before starting Sumsub verification.",
    })
  }

  const client = await pool.connect()
  let externalUserId
  let ownerEmail
  let ownerPhone
  try {
    await client.query("BEGIN")
    const profile = await client.query(
      `SELECT owner_email AS "ownerEmail", owner_phone AS "ownerPhone",
              sumsub_external_user_id AS "externalUserId",
              sumsub_review_status AS "reviewStatus", status
       FROM merchant_kyb_profiles WHERE merchant_email = $1 FOR UPDATE`,
      [req.merchantEmail],
    )
    if (!profile.rowCount) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error: "Save your business and beneficial-owner details first.",
      })
    }
    if (profile.rows[0].status === "APPROVED") {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error: "Your KYB application is already approved.",
      })
    }
    if (["APPROVED", "REJECTED"].includes(profile.rows[0].reviewStatus)) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error:
          "This Sumsub result is final. Contact DRPAY support if you need to appeal.",
      })
    }
    externalUserId = profile.rows[0].externalUserId || randomUUID()
    ownerEmail = profile.rows[0].ownerEmail
    ownerPhone = profile.rows[0].ownerPhone
    await client.query(
      `UPDATE merchant_kyb_profiles
       SET sumsub_external_user_id = $2,
           sumsub_consent_at = NOW(),
           sumsub_consent_version = 'sumsub-kyb-v1',
           updated_at = NOW()
       WHERE merchant_email = $1`,
      [req.merchantEmail, externalUserId],
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  let accessToken
  try {
    accessToken = await createSumsubSdkAccessToken({
      appToken,
      secretKey,
      levelName,
      externalUserId,
      email: ownerEmail,
      phone: ownerPhone,
    })
  } catch (error) {
    console.error("Sumsub access-token request failed", {
      name: error instanceof Error ? error.name : typeof error,
      status:
        error && typeof error === "object" && "status" in error
          ? error.status
          : null,
      providerErrorName:
        error && typeof error === "object" && "providerErrorName" in error
          ? error.providerErrorName
          : null,
    })
    return res.status(502).json({
      error: "Sumsub is temporarily unavailable. Try again shortly.",
    })
  }

  const updatedProfile = await pool.query(
    `UPDATE merchant_kyb_profiles
     SET sumsub_review_status = CASE
           WHEN sumsub_review_status IN ('NOT_STARTED', 'IN_PROGRESS')
             THEN 'IN_PROGRESS'
           ELSE sumsub_review_status
         END,
         updated_at = NOW()
     WHERE merchant_email = $1 AND sumsub_external_user_id = $2
       AND sumsub_review_status NOT IN ('APPROVED', 'REJECTED')
     RETURNING sumsub_review_status AS "reviewStatus"`,
    [req.merchantEmail, externalUserId],
  )
  if (!updatedProfile.rowCount) {
    return res.status(409).json({
      error:
        "Your verification changed while connecting to Sumsub. Refresh the KYB status and try again.",
    })
  }
  return res.set("Cache-Control", "no-store").json({
    accessToken,
    sumsubReviewStatus: updatedProfile.rows[0].reviewStatus,
  })
})

app.put("/v1/kyb", async (req, res) => {
  const lockedProfile = await pool.query(
    `SELECT status FROM merchant_kyb_profiles WHERE merchant_email = $1`,
    [req.merchantEmail],
  )
  if (lockedProfile.rows[0]?.status === "APPROVED")
    return res.status(409).json({
      error:
        "Your verification result is final. Contact DRPAY support to request a review or profile change.",
    })
  if (req.body?.kybConsent !== true) {
    return res.status(400).json({
      error: "Confirm the KYB review consent before saving your application.",
    })
  }
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
       owner_full_name, owner_date_of_birth, owner_nationality, owner_email, owner_phone,
       status, kyb_consent_at, kyb_consent_version, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', NOW(), 'manual-kyb-v1', NOW())
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
       status = 'PENDING', review_notes = NULL, reviewed_by = NULL, reviewed_at = NULL,
       kyb_consent_at = NOW(), kyb_consent_version = 'manual-kyb-v1',
       updated_at = NOW()
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
  const normalizedContentType = normalizeDocumentContentType(
    fileName,
    req.body?.contentType,
  )
  const sizeBytes = Number(req.body?.sizeBytes)
  if (
    !allowedKybDocuments.has(documentType) ||
    !fileName ||
    fileName.length > 180 ||
    /[/\\\u0000-\u001f]/.test(fileName) ||
    !allowedDocumentContentTypes.has(normalizedContentType) ||
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
      normalizedContentType,
      sizeBytes,
    ],
  )
  try {
    const uploadUrl = await getPrivateDocumentUploadUrl(
      r2Client,
      r2BucketName,
      objectKey,
      normalizedContentType,
      documentId,
    )
    return res.set("Cache-Control", "no-store").json({
      documentId,
      uploadUrl,
      objectKey,
      fileName: safeName,
      headers: {
        "Content-Type": normalizedContentType,
        "x-amz-meta-document-id": documentId,
      },
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
  const normalizedContentType = normalizeDocumentContentType(
    typeof fileName === "string" ? fileName : "",
    contentType,
  )
  if (
    !/^[0-9a-f-]{36}$/i.test(documentId || "") ||
    typeof objectKey !== "string" ||
    !objectKey.startsWith("kyb/") ||
    !allowedKybDocuments.has(documentType) ||
    typeof fileName !== "string" ||
    fileName.length > 180 ||
    !allowedDocumentContentTypes.has(normalizedContentType) ||
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
    reservation.content_type !== normalizedContentType ||
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
      object.ContentType !== normalizedContentType ||
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
    if (!hasValidDocumentSignature(normalizedContentType, bytes)) {
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
  const amountMinor = tryParseMinorUnits(req.body?.amount)
  const amount =
    amountMinor === null ? Number.NaN : minorUnitsToNumber(amountMinor)
  if (
    amountMinor === null ||
    amount <= 0 ||
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
  const appId =
    typeof req.body?.appId === "string" ? req.body.appId : "ph.drpays.merchant"
  if (!["ph.drpays.merchant", "ph.drpays.merchant.public"].includes(appId))
    return res.status(400).json({ error: "A valid app ID is required." })
  await pool.query(
    `INSERT INTO merchant_push_devices (token, merchant_email, app_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET
       merchant_email = EXCLUDED.merchant_email,
       app_id = EXCLUDED.app_id,
       updated_at = NOW()`,
    [token, req.merchantEmail, appId],
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

async function verifyMerchantPin(email, pin) {
  return verifyPinWithAttemptLimit(pool, email, pin, matchesPasswordHash)
}

app.post("/v1/security/transfer/pin", pinAttemptLimiter, async (req, res) => {
  const pin = typeof req.body?.pin === "string" ? req.body.pin : ""
  const idempotencyKey =
    typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : ""
  if (!/^\d{4}$/.test(pin) || !validIdempotencyKey(idempotencyKey)) {
    return res
      .status(400)
      .json({ error: "Enter your four-digit MPIN to authorize this transfer." })
  }
  const pinResult = await verifyMerchantPin(req.merchantEmail, pin)
  if (pinResult.status !== 200)
    return res.status(pinResult.status).json({ error: pinResult.error })
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

app.post(
  "/v1/security/transfer/biometric",
  pinAttemptLimiter,
  async (req, res) => {
    const secret = typeof req.body?.secret === "string" ? req.body.secret : ""
    const deviceToken =
      typeof req.body?.deviceToken === "string" ? req.body.deviceToken : ""
    const idempotencyKey =
      typeof req.body?.idempotencyKey === "string"
        ? req.body.idempotencyKey
        : ""
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(secret) ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(deviceToken) ||
      !validIdempotencyKey(idempotencyKey)
    ) {
      return res.status(400).json({
        error: "Biometric verification is unavailable. Use your MPIN instead.",
      })
    }

    const deviceHash = deviceTokenHash(deviceToken)
    const { rows } = await pool.query(
      `SELECT credential.secret_hash
       FROM merchant_accounts account
       JOIN merchant_devices device ON device.email = account.email
       JOIN merchant_biometric_credentials credential
         ON credential.email = device.email
         AND credential.device_token_hash = device.device_token_hash
       WHERE account.email = $1 AND account.active = TRUE
         AND device.device_token_hash = $2`,
      [req.merchantEmail, deviceHash],
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
      return res.status(403).json({
        error: "Biometric verification failed. Use your MPIN or try again.",
      })
    }

    await pool.query(
      `UPDATE merchant_biometric_credentials SET last_used_at = NOW()
       WHERE email = $1 AND device_token_hash = $2`,
      [req.merchantEmail, deviceHash],
    )
    await pool.query(
      `UPDATE merchant_devices SET last_used_at = NOW()
       WHERE email = $1 AND device_token_hash = $2`,
      [req.merchantEmail, deviceHash],
    )
    const fingerprint = transferSecurityFingerprint(
      req.merchantEmail,
      req.body,
      idempotencyKey,
    )
    const stepUpToken = await new SignJWT({
      purpose: "transfer_step_up",
      fingerprint,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(req.merchantEmail)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(jwtSecret)
    return res.set("Cache-Control", "no-store").json({ stepUpToken })
  },
)

app.get("/v1/internal-wallet", async (req, res) => {
  const [result, feeSetting] = await Promise.all([
    pool.query(
      `WITH wallet AS (
       SELECT COALESCE(SUM(amount), 0)::numeric AS balance
       FROM internal_wallet_adjustments
      WHERE merchant_email = $1 AND adjusted_by NOT LIKE 'system:%'
     )
     SELECT wallet.balance::text AS balance_exact,
       wallet.balance::float8 AS balance,
       COALESCE((SELECT SUM(amount + transfer_fee) FROM floating_transfer_requests WHERE merchant_email = $1 AND status = 'PENDING'), 0)::text AS reserved_exact,
       COALESCE((SELECT SUM(amount + transfer_fee) FROM floating_transfer_requests WHERE merchant_email = $1 AND status = 'PENDING'), 0)::float8 AS reserved
     FROM wallet`,
      [req.merchantEmail],
    ),
    pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'transfer_fee_fixed'",
    ),
  ])
  const balance = result.rows[0].balance
  const transferFeeMinor = tryParseMinorUnits(
    feeSetting.rows[0]?.setting_value || "0",
  )
  if (transferFeeMinor === null || transferFeeMinor < 0n) {
    return res
      .status(503)
      .json({ error: "The configured transfer fee is invalid." })
  }
  const transferFeeFixed = minorUnitsToNumber(transferFeeMinor)
  const availableBalance = minorUnitsToNumber(
    subtractMinorUnits(
      parseMinorUnits(result.rows[0].balance_exact),
      parseMinorUnits(result.rows[0].reserved_exact),
    ),
  )
  return res.set("Cache-Control", "no-store").json({
    currency: "PHP",
    balance,
    availableBalance,
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

async function recordSwiftPayReconciliationCase(
  paymentId,
  providerStatus,
  reconciliationStatus,
) {
  const paymentResult = await pool.query(
    `SELECT id, reference_no, payment_token, code, amount, currency, status
     FROM payment_links WHERE id = $1`,
    [paymentId],
  )
  const payment = paymentResult.rows[0]
  if (!payment) return
  await pool.query(
    `INSERT INTO financial_reconciliation_cases
       (id, source_type, external_reference, direction, amount, currency,
        external_status, internal_id, internal_reference, status, details)
     VALUES ($1, 'SWIFTPAY', $2, 'IN', $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (source_type, external_reference)
       WHERE source_type = 'SWIFTPAY'
     DO UPDATE SET external_status = EXCLUDED.external_status,
       internal_reference = EXCLUDED.internal_reference,
       status = EXCLUDED.status, details = EXCLUDED.details`,
    [
      randomUUID(),
      payment.payment_token || payment.code || payment.id,
      payment.amount,
      payment.currency,
      providerStatus || "UNKNOWN",
      payment.id,
      payment.reference_no,
      reconciliationStatus,
      JSON.stringify({
        providerStatus: providerStatus || "UNKNOWN",
        internalStatus: payment.status,
        merchantSettlementRetry: payment.status === "SETTLEMENT_RETRY",
      }),
    ],
  )
}

async function reconcilePending() {
  if (reconcilingPending) return
  reconcilingPending = true
  const cycleStartedAt = Date.now()
  console.info("Pending transaction reconciliation started")
  try {
    const [links, transfers] = await Promise.all([
      pool.query(
        "SELECT id, code, payment_token FROM payment_links WHERE status IN ('CREATING', 'ACTIVE', 'PENDING', 'OUTCOME_UNKNOWN', 'SETTLEMENT_RETRY') AND code IS NOT NULL ORDER BY created_at DESC LIMIT 50",
      ),
      pool.query(
        `SELECT d.id, d.swiftpay_id, d.merchant_reference_no, d.status
         FROM disbursements d
         WHERE d.status IN ('REQUESTING', 'PENDING', 'OUTCOME_UNKNOWN')
           OR (d.status = 'REVERSED'
             AND EXISTS (
               SELECT 1 FROM merchant_wallet_ledger debit
               WHERE debit.source_type = 'DISBURSEMENT'
                 AND debit.source_id = d.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM merchant_wallet_ledger reversal
               WHERE reversal.source_type = 'DISBURSEMENT_REVERSAL'
                 AND reversal.source_id = d.id
             ))
         ORDER BY d.created_at DESC LIMIT 50`,
      ),
    ])
    await Promise.allSettled([
      ...links.rows.map(async (row) => {
        let providerStatus = ""
        try {
          if (row.payment_token) {
            const { data } = await swiftPayPaymentRequest(
              "/payments/status",
              row.payment_token,
            )
            providerStatus = paymentStatusFromResponse(data)
          } else {
            const { data } = await swiftPayRequest(
              `/payments/links/${encodeURIComponent(row.code)}`,
            )
            providerStatus = data.linkStatus || "ACTIVE"
          }
          await updatePaymentLinkStatus(row.id, providerStatus)
          const current = await pool.query(
            `SELECT p.status,
               EXISTS (SELECT 1 FROM merchant_wallet_ledger wallet
                 WHERE wallet.source_type = 'COLLECTION' AND wallet.source_id = p.id) AS ledger_posted,
               EXISTS (SELECT 1 FROM accounting_journal_entries journal
                 WHERE journal.source_type = 'COLLECTION' AND journal.source_id = p.id) AS journal_posted
             FROM payment_links p WHERE p.id = $1`,
            [row.id],
          )
          const reconciliationStatus =
            providerStatus === "EXECUTED" &&
            (!current.rows[0]?.ledger_posted ||
              !current.rows[0]?.journal_posted)
              ? "provider_retry"
              : current.rows[0]?.status === providerStatus ||
                  (providerStatus === "EXECUTED" &&
                    current.rows[0]?.status === "MANUALLY_PAID")
                ? "matched"
                : "status_mismatch"
          await recordSwiftPayReconciliationCase(
            row.id,
            providerStatus,
            reconciliationStatus,
          )
        } catch (error) {
          await recordSwiftPayReconciliationCase(
            row.id,
            providerStatus || "UNKNOWN",
            "provider_retry",
          )
          console.error("Payment reconciliation failed", {
            paymentId: row.id,
            error:
              error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      }),
      ...transfers.rows.map(async (row) => {
        if (row.status === "REVERSED") {
          await updateDisbursementStatus(
            row.id,
            row.swiftpay_id,
            "REVERSED",
            null,
          )
          return
        }
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
    console.info("Pending transaction statuses reconciled", {
      paymentCount: links.rowCount,
      disbursementCount: transfers.rowCount,
    })
    await dispatchTransactionNotifications()
    await dispatchAdminTelegramNotifications()
    await dispatchCustomerPaymentRequests()
    await dispatchCustomerPaymentNotifications()
    await dispatchMerchantWebhooks()
  } finally {
    reconcilingPending = false
    console.info("Pending transaction reconciliation completed", {
      durationMs: Date.now() - cycleStartedAt,
    })
  }
}

function startNotificationWorker() {
  if (!fcmConfigIsComplete(privateFcmConfig)) {
    console.warn(
      "Private Android push delivery is disabled until FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_EMAIL, and FCM_SERVICE_ACCOUNT_PRIVATE_KEY are configured.",
    )
  }
  if (!fcmConfigIsComplete(publicFcmConfig)) {
    console.warn(
      "Public Android push delivery is disabled until FCM_PUBLIC_SERVICE_ACCOUNT_PRIVATE_KEY is configured.",
    )
  }
  if (!telegramBotToken || !telegramChatId) {
    console.warn(
      "Telegram transaction alerts are disabled until TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured.",
    )
  } else {
    void scanTelegramUsdtDeposits().catch((error) => {
      console.error("Telegram USDT deposit scan failed", {
        error: error instanceof Error ? error.message : String(error),
        errorName: error?.name,
        errorCode: error?.code,
      })
    })
    const telegramDepositTimer = setInterval(() => {
      void scanTelegramUsdtDeposits().catch((error) => {
        console.error("Telegram USDT deposit scan failed", {
          error: error instanceof Error ? error.message : String(error),
          errorName: error?.name,
          errorCode: error?.code,
        })
      })
    }, 5 * 60_000)
    telegramDepositTimer.unref()
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
    `SELECT id, reference_no, amount::text AS amount, status, payment_token
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
    ![
      "REJECTED",
      "ERROR",
      "FAILED",
      "CANCELED",
      "CANCELLED",
      "REVERSED",
    ].includes(previousStatus.toUpperCase())
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
  const providerAmountMinor = tryParseMinorUnits(data?.amount)
  const paymentAmountMinor = tryParseMinorUnits(payment.amount)
  if (
    data?.paymentStatus !== "EXECUTED" ||
    providerAmountMinor === null ||
    paymentAmountMinor === null ||
    providerAmountMinor !== paymentAmountMinor
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
          AND (refund.status IS NULL OR refund.status IN ('REJECTED', 'ERROR', 'FAILED', 'CANCELED', 'CANCELLED', 'REVERSED'))) AS "canRefund",
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
        d.channel, d.status, -d.amount::float8 AS amount,
        (COALESCE(wallet.amount, 0) + COALESCE(reversal.amount, 0))::float8 AS "walletAmount",
        d.created_at AS "createdAt", 'DISBURSEMENT' AS "transactionType",
        FALSE AS "canRefund", NULL::text AS "refundStatus"
      FROM disbursements d
      LEFT JOIN merchant_wallet_ledger wallet
        ON wallet.source_type = 'DISBURSEMENT' AND wallet.source_id = d.id AND wallet.merchant_email = d.merchant_email
      LEFT JOIN merchant_wallet_ledger reversal
        ON reversal.source_type = 'DISBURSEMENT_REVERSAL' AND reversal.source_id = d.id AND reversal.merchant_email = d.merchant_email
      LEFT JOIN payment_links p ON p.id = d.refund_payment_id
      WHERE d.merchant_email = $3
        AND d.created_at >= (SELECT created_at FROM merchant_accounts WHERE email = $3)
        AND ($5::date IS NULL OR d.created_at >= $5::date)
        AND ($6::date IS NULL OR d.created_at < $6::date + INTERVAL '1 day')
      UNION ALL
      SELECT adjustment.id::text, adjustment.reference_no AS "referenceNo",
        NULL::text AS "institutionCode", adjustment.reason AS description,
        NULL::text AS "institutionName", NULL::text AS "institutionLogoUrl",
        NULL::text AS "recipientName", NULL::text AS "recipientAccountNumber",
        NULL::text AS remarks, FALSE AS "isRefund",
        'Admin adjustment' AS channel, 'SUCCESS' AS status,
        adjustment.amount::float8 AS amount, adjustment.amount::float8 AS "walletAmount",
        adjustment.created_at AS "createdAt", 'ADMIN_ADJUSTMENT' AS "transactionType",
        FALSE AS "canRefund", NULL::text AS "refundStatus"
      FROM merchant_wallet_adjustments adjustment
      WHERE adjustment.merchant_email = $3
        AND adjustment.created_at >= (SELECT created_at FROM merchant_accounts WHERE email = $3)
        AND ($5::date IS NULL OR adjustment.created_at >= $5::date)
        AND ($6::date IS NULL OR adjustment.created_at < $6::date + INTERVAL '1 day')
      UNION ALL
      SELECT wallet.id::text, wallet.reference_no AS "referenceNo",
        NULL::text AS "institutionCode",
        CASE wallet.source_type
          WHEN 'DOWNLINE_COMMISSION' THEN 'Commission from referred merchant collection'
          WHEN 'DOWNLINE_COMMISSION_REVERSAL' THEN 'Reversal of downline collection commission'
          ELSE 'Restored downline commission after reversed refund'
        END AS description,
        NULL::text AS "institutionName", NULL::text AS "institutionLogoUrl",
        NULL::text AS "recipientName", NULL::text AS "recipientAccountNumber",
        NULL::text AS remarks, FALSE AS "isRefund",
        CASE wallet.source_type
          WHEN 'DOWNLINE_COMMISSION' THEN 'Downline commission'
          WHEN 'DOWNLINE_COMMISSION_REVERSAL' THEN 'Commission reversal'
          ELSE 'Commission restored'
        END AS channel,
        'SUCCESS' AS status, wallet.amount::float8 AS amount,
        wallet.amount::float8 AS "walletAmount", wallet.created_at AS "createdAt",
        wallet.source_type AS "transactionType",
        FALSE AS "canRefund", NULL::text AS "refundStatus"
      FROM merchant_wallet_ledger wallet
      WHERE wallet.merchant_email = $3
        AND wallet.source_type IN (
          'DOWNLINE_COMMISSION', 'DOWNLINE_COMMISSION_REVERSAL',
          'DOWNLINE_COMMISSION_RESTORATION'
        )
        AND wallet.created_at >= (SELECT created_at FROM merchant_accounts WHERE email = $3)
        AND ($5::date IS NULL OR wallet.created_at >= $5::date)
        AND ($6::date IS NULL OR wallet.created_at < $6::date + INTERVAL '1 day')
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
  if (!isSupportedPaymentLinkCurrency(req.body?.currency)) {
    return res.status(400).json({
      error: "Only PHP payment links are supported.",
    })
  }
  const amountMinor = tryParseMinorUnits(req.body?.amount)
  const amount =
    amountMinor === null ? Number.NaN : minorUnitsToNumber(amountMinor)
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
  const estimatedDeliveryDate =
    typeof req.body?.estimatedDeliveryDate === "string"
      ? req.body.estimatedDeliveryDate.trim()
      : ""
  const institutionCode =
    typeof req.body?.institutionCode === "string"
      ? req.body.institutionCode.trim().toUpperCase()
      : ""
  const institutionName =
    typeof req.body?.institutionName === "string"
      ? req.body.institutionName.trim()
      : ""
  const isVirtualAccount = institutionCode === VIRTUAL_ACCOUNT_INSTITUTION_CODE
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
    amountMinor === null ||
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
  if (
    estimatedDeliveryDate &&
    !isValidEstimatedDeliveryDate(estimatedDeliveryDate)
  ) {
    return res
      .status(400)
      .json({ error: "Enter a valid delivery date that is today or later." })
  }
  if (estimatedDeliveryDate && !customerEmail) {
    return res.status(400).json({
      error: "Enter a customer email to use the delivery-date review opt-in.",
    })
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
      (isVirtualAccount && institutionName !== "Virtual Account") ||
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
    const replayInstitutionDeepLink =
      row.payment_institution_deep_link &&
      submittedInstitutionDeepLink === row.payment_institution_deep_link
        ? row.payment_institution_deep_link
        : institutionDeepLink
    const requestFingerprint = paymentLinkRequestFingerprint({
      amount,
      collectionAmountKrw,
      description: title,
      customerEmail,
      estimatedDeliveryDate,
      paymentInstitutionCode: institutionCode,
      paymentInstitutionName: institutionName,
      paymentInstitutionLogoUrl: institutionLogoUrl,
      paymentInstitutionDeepLink: replayInstitutionDeepLink,
      ...branding,
    })
    const storedFingerprint = paymentLinkRequestFingerprint({
      amount: row.amount,
      collectionAmountKrw: row.collection_amount_krw,
      description: row.title,
      customerEmail: row.customer_email,
      estimatedDeliveryDate: row.estimated_delivery_date
        ? new Date(row.estimated_delivery_date).toISOString().slice(0, 10)
        : null,
      paymentInstitutionCode: row.payment_institution_code,
      paymentInstitutionName: row.payment_institution_name,
      paymentInstitutionLogoUrl: row.payment_institution_logo_url,
      paymentInstitutionDeepLink: row.payment_institution_deep_link,
      checkoutInstructions: row.checkout_instructions,
      emailSubject: row.email_subject,
      emailMessage: row.email_message,
      emailBrandColor: row.email_brand_color,
      emailLogoUrl: row.email_logo_url,
    })
    if (storedFingerprint !== requestFingerprint) {
      return res.status(409).json({
        error:
          "This Idempotency-Key was already used with different payment details.",
      })
    }
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
        virtualAccountInfo: virtualAccountInformationFromRow(row),
        requestEmailStatus,
      })
    }
    return res.status(409).json({
      error:
        "The checkout outcome is unknown. Check wallet activity before retrying.",
    })
  }

  const id = randomUUID()
  const code = randomBytes(32).toString("base64url")
  const client = await pool.connect()
  let referenceNo
  try {
    await client.query("BEGIN")
    referenceNo = await reserveTransactionReference(client)
    await client.query(
      `INSERT INTO payment_links (
      id, idempotency_key, reference_no, code, title, amount, collection_amount_krw,
      payment_institution_code, payment_institution_name, payment_institution_logo_url,
      payment_institution_deep_link, checkout_instructions, email_subject,
      email_message, email_brand_color, email_logo_url,
      checkout_type, status, merchant_email, customer_email, estimated_delivery_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'DIRECT_QRPH', 'CREATING', $17, $18, $19)`,
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
        estimatedDeliveryDate || null,
      ],
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    if (error.code === "23505") return res.status(409).json({
        error:
          "The checkout outcome is unknown. Check wallet activity before retrying.",
      })
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
    const virtualAccountInfo = isVirtualAccount
      ? virtualAccountInformationFromProvider(data, referenceNo)
      : undefined
    await pool.query(
      `UPDATE payment_links SET payment_token = $1, qr_payload = $2, payment_url = $3,
        status = $4, amount = $5, virtual_account_bank_account_number = $6,
        virtual_account_instapay_bank_code = $7, virtual_account_reference_no = $8,
        updated_at = NOW() WHERE id = $9`,
      [
        data.paymentId,
        data.qrCode,
        checkoutUrl,
        status === "EXECUTED" ? "PENDING" : status,
        actualAmount,
        virtualAccountInfo?.bankAccountNumber ?? null,
        virtualAccountInfo?.instapayBankCode ?? null,
        virtualAccountInfo?.referenceNo ?? null,
        id,
      ],
    )
    let requestEmailStatus = "no_customer_email"
    if (status === "EXECUTED") {
      try {
        await updatePaymentLinkStatus(id, status)
        requestEmailStatus = customerEmail ? "not_required" : "no_customer_email"
      } catch (error) {
        console.error("Confirmed payment settlement is queued for retry", {
          paymentId: id,
          error: error instanceof Error ? error.message : String(error),
        })
        return res.status(503).json({
          error:
            "The payment provider confirmed this checkout, but wallet settlement is being retried. Do not create another checkout.",
        })
      }
    } else {
      try {
        requestEmailStatus = await queueCustomerPaymentRequest(id)
      } catch (error) {
        requestEmailStatus = "queue_failed"
        console.error("Customer payment request could not be queued", {
          error: error.code || "database error",
        })
      }
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
      virtualAccountInfo,
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
  const amountMinor = tryParseMinorUnits(req.body?.amount)
  const amount =
    amountMinor === null ? Number.NaN : minorUnitsToNumber(amountMinor)
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
    amountMinor === null ||
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
    if (
      !disbursementReplayMatches(row, {
        amount,
        channel,
        institutionCode,
        accountNumber,
        fullName,
        remarks,
        refundPaymentId,
      })
    ) {
      return res.status(409).json({
        error:
          "This idempotency key was already used with different transfer details.",
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
    } catch (error) {
      console.error(
        "Transfer institution verification failed",
        error.status || error.message || "network error",
      )
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
    remarks,
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
  let merchantReferenceNo
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
    let walletDebitAmountMinor = amountMinor
    let transferFeeMinor = 0n
    if (refundPaymentId) {
      const collection = await client.query(
        `SELECT p.status, GREATEST(p.amount - COALESCE(f.amount, 0) - COALESCE(commission.amount, 0), 0)::numeric AS net_amount
         FROM payment_links p
         LEFT JOIN platform_fee_ledger f ON f.source_type = 'COLLECTION' AND f.source_id = p.id
         LEFT JOIN downline_commissions commission ON commission.payment_id = p.id
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
        ![
          "REJECTED",
          "ERROR",
          "FAILED",
          "CANCELED",
          "CANCELLED",
          "REVERSED",
        ].includes(previousStatus.toUpperCase())
      ) {
        await client.query("ROLLBACK")
        return res.status(409).json({
          error:
            "A refund transfer for this collection is already in progress or complete.",
        })
      }
      walletDebitAmountMinor = parseMinorUnits(collection.rows[0].net_amount)
    } else {
      const feeSetting = await client.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'transfer_fee_fixed'",
      )
      transferFeeMinor = tryParseMinorUnits(
        feeSetting.rows[0]?.setting_value || "0",
      )
      if (transferFeeMinor === null || transferFeeMinor < 0n) {
        throw new Error("The configured transfer fee is invalid.")
      }
      walletDebitAmountMinor = addMinorUnits(amountMinor, transferFeeMinor)
    }
    const wallet = await getMerchantWalletState(client, req.merchantEmail)
    const availableBalanceMinor = subtractMinorUnits(
      parseMinorUnits(wallet.balance_exact),
      parseMinorUnits(wallet.reserved_exact),
    )
    if (availableBalanceMinor < walletDebitAmountMinor) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        error: `Insufficient merchant wallet balance. PHP ${formatMinorUnits(availableBalanceMinor > 0n ? availableBalanceMinor : 0n)} is available after pending transfers; the transfer amount plus its fee is PHP ${formatMinorUnits(walletDebitAmountMinor)}.`,
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
    merchantReferenceNo = await reserveTransactionReference(client)
    await client.query(
      `INSERT INTO disbursements
       (id, idempotency_key, merchant_reference_no, amount, transfer_fee, channel, institution_code, recipient_name, recipient_account_number, remarks, request_fingerprint, status, merchant_email, refund_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'REQUESTING', $12, $13)`,
      [
        id,
        idempotencyKey,
        merchantReferenceNo,
        formatMinorUnits(amountMinor),
        formatMinorUnits(transferFeeMinor),
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

app.use((req, res, next) => {
  if (
    req.method !== "GET" ||
    req.path === "/v1" ||
    req.path.startsWith("/v1/") ||
    req.path === "/healthz" ||
    !existsSync(clientIndexFile)
  )
    return next()
  return res.sendFile(clientIndexFile, (error) => {
    if (error) next(error)
  })
})

app.use((error, req, res, _next) => {
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500
  const requestId = randomUUID()
  console.error("API request failed", {
    requestId,
    method: req.method,
    path: req.path,
    status,
    code: error.code || null,
    message: error.message || "unexpected error",
  })
  if (res.headersSent) return
  return res.status(status).json({
    error:
      status === 413
        ? "The uploaded attachment exceeds the 10 MB limit."
        : "The request could not be completed.",
    requestId,
  })
})

async function start() {
  const missing = requiredEnvironment()
  if (missing.length) {
    throw new Error(
      `Missing or invalid server configuration: ${missing.join(", ")}`,
    )
  }

  const port = Number(process.env.PORT || 10000)
  while (!databaseReady) {
    try {
      await initializeDatabase()
      databaseReady = true
      console.info("Database ready; starting background workers")
      startNotificationWorker()
      void reconcilePending().catch((error) => {
        console.error(
          "Initial transaction notification cycle failed",
          error.status || error.message || "unexpected error",
        )
      })
    } catch (error) {
      console.error("Database initialization failed; retrying", {
        code: error.code || null,
        schema: error.schema || null,
        table: error.table || null,
        column: error.column || null,
        constraint: error.constraint || null,
        position: error.position || null,
      })
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`DRPAY API listening on ${port} (${swiftPayEnvironment})`)
  })
  server.on("error", (error) => {
    console.error("DRPAY API listener failed", error.code || error.message)
  })
}

start().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})

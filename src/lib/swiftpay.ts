import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser"

export type Session = {
  accessToken: string
  expiresAt: number
  email: string
  role:
    | "customer"
    | "merchant"
    | "super_admin"
    | "finance"
    | "compliance"
    | "auditor"
}

export function normalizeDocumentContentType(
  file: Pick<File, "name" | "type">,
): "application/pdf" | "image/jpeg" | "image/png" | "" {
  const rawType = file.type?.trim().toLowerCase()
  const normalizedType =
    rawType === "image/jpg" || rawType === "image/pjpeg"
      ? "image/jpeg"
      : rawType

  if (
    normalizedType === "application/pdf" ||
    normalizedType === "image/jpeg" ||
    normalizedType === "image/png"
  ) {
    return normalizedType
  }

  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension === "pdf") return "application/pdf"
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
  if (extension === "png") return "image/png"

  return ""
}

export type AuthProviderConfig = {
  google: boolean
  googleClientId: string | null
  telegram: boolean
  telegramClientId: string | null
  passkeys: boolean
}

export type LoginProvider = "google" | "telegram" | "passkey"

export type ProviderStepUp = {
  email: string
  challengeId: string
}

export type ProviderSignInResult =
  | { stepUp: ProviderStepUp }
  | { session: Session }

type ProviderSignInResponse =
  | {
      email: string
      challengeId: string
      pinConfigured: true
    }
  | {
      accessToken: string
      expiresInSeconds: number
      email: string
      role: Session["role"]
      pinConfigured: false
    }

export type MerchantAuthMethods = {
  google: boolean
  telegram: boolean
  passkeys: { id: string; createdAt: string }[]
}

export type Transaction = {
  id: string
  customer: string
  email: string
  initials: string
  color: "lime" | "blue" | "peach" | "violet" | "mint"
  reference: string
  channel: string
  institutionCode?: string
  institutionName?: string
  institutionLogoUrl?: string
  recipientName?: string
  recipientAccountNumber?: string
  remarks?: string
  isRefund?: boolean
  createdAt?: string
  date: string
  status: "Completed" | "Pending" | "Failed"
  rawStatus: string
  amount: string
  numericAmount: number
  walletAmount?: number | null
  description: string
  canRefund?: boolean
  refundStatus?: string | null
}

export type DashboardData = {
  availableBalance: string
  balance: number
  reservedBalance: number
  internalWalletBalance: string
  cumulativeKrwCollections: number
  floatingBalance: number
  availableFloatingBalance: number
  transferFeeFixed: number
  grossVolume: string
  successfulPayments: string
  averageTransaction: string
  accountNumber?: string
  walletMode: "internal" | "pooled" | "customer"
  paymentEnvironment: "sandbox" | "production"
  transactions: Transaction[]
}

export type MerchantActivityTrendPoint = {
  date: string
  collections: number
  transfers: number
}

export type QrPayment = {
  paymentId: string
  referenceNo: string
  status: string
  amount: number
  currency: string
  qrImageBase64?: string
  checkoutUrl?: string
}

export type InstitutionBrand = {
  code: string
  name: string
  logoUrl?: string
  deepLink?: string
}

export type Institution = InstitutionBrand & {
  instapayEnabled: boolean
  pesonetEnabled: boolean
}

export type PaymentInstitution = InstitutionBrand & {
  category: string
}

export const VIRTUAL_ACCOUNT_INSTITUTION_CODE = "DRPAY_VIRTUAL_ACCOUNT"

export type TransferResult = {
  id?: string
  referenceNo?: string
  status: string
  outcomeUnknown?: boolean
  message?: string
}

export type MerchantSecurityStatus = {
  pinConfigured: boolean
}

export type TransferAuthorizationInput = {
  amount: number
  channel: "INSTAPAY" | "PESONET"
  institutionCode: string
  accountNumber: string
  fullName: string
  remarks: string
  idempotencyKey: string
  refundPaymentId?: string
}

export type CollectionRefundDetails = Pick<TransferAuthorizationInput, "amount" | "channel" | "institutionCode" | "accountNumber" | "fullName" | "remarks">

export type VirtualAccountInfo = {
  bankAccountNumber?: string
  instapayBankCode?: string
  referenceNo?: string
}

export type PaymentLinkResult = {
  id?: string
  code: string
  paymentUrl: string
  qrCode?: string
  qrImageUrl?: string
  status?: string
  amount?: number
  currency?: string
  virtualAccountInfo?: VirtualAccountInfo
  requestEmailStatus?:
    | "queued"
    | "sent"
    | "no_customer_email"
    | "queue_failed"
    | "not_required"
}

export type MerchantCheckoutPreferences = {
  checkoutInstructions: string
  emailSubject: string
  emailMessage: string
  emailBrandColor: string
  emailLogoUrl: string
}

export type AdminPaymentLink = {
  id: string
  merchantEmail: string | null
  customerEmail: string | null
  referenceNo: string
  title: string
  amount: number
  currency: string
  status: string
  createdAt: string
  manuallyPaidBy: string | null
  manuallyPaidAt: string | null
  manualPaidReason: string | null
  customerNotification?: "queued" | "no_customer_email" | "queued_for_retry" | "sent"
}

export type PublicCheckout = {
  title: string
  referenceNo: string
  amount: number
  currency: string
  status: string
  statusCheckUnavailable: boolean
  qrCode: string
  customerEmail?: string | null
  estimatedDeliveryDate?: string | null
  isTaxInvoice: boolean
  institutionCode?: string | null
  institutionName?: string | null
  institutionLogoUrl?: string | null
  institutionDeepLink?: string | null
  virtualAccountInfo?: VirtualAccountInfo
  checkoutInstructions?: string
  brandColor?: string
  logoUrl?: string
}

export type CurrencyQuote = {
  baseCurrency: "KRW"
  quoteCurrency: "PHP"
  rate: number
  date: string
  updatedAt: string
  source: string
}

export type AdminSettings = {
  krwToPhpRate: number | null
  usdtAddress: string
  usdtNetwork: string
  collectionFeePercent: number
  transferFeeFixed: number
  agreementProviderName: string
  agreementProviderAddress: string
  agreementProviderRegistration: string
  agreementActivationFee: number
  superAdminFeeWallet: number
}

export type MerchantMaintenanceStatus = {
  enabled: boolean
}

export type AdminAuditEvent = {
  id: string
  category: string
  action: string
  target: string
  actor: string | null
  summary: string
  occurredAt: string
}

export type AdminMerchantAccount = {
  email: string
  active: boolean
  downlineManuallyEnabled?: boolean
  registrationPending: boolean
  businessName: string
  contactPerson: string
  phoneNumber: string
  businessAddress: string
  bankName: string
  accountName: string
  accountNumber: string
  usdtAddress: string | null
  createdAt: string
  updatedAt: string
  invitationAcceptedAt?: string | null
  kybStatus?: KybProfile["status"] | null
}

export type MerchantUsdtWallet = {
  address: string | null
  network: "TRON_MAINNET" | "TRON_SHASTA"
  balance: string | null
  qualifyingBalance?: string | null
  configured: boolean
  message: string | null
  activation?: {
    activationFee: {
      requiredAmount: number
      chargedAmount: number
      availableWalletBalance: number | null
      complete: boolean
    }
    usdtBalance: {
      requiredAmount: number
      currentBalance: string | null
      qualifyingBalance: string | null
      assignedAt: string | null
      complete: boolean
      message: string | null
    }
    fullyActivated: boolean
  }
  integrationEmailStatus?: string
}

export type MerchantUsdtDeposit = {
  transactionId: string
  amount: string
  from: string
  blockTimestamp: string
  confirmed: boolean
}

export type MerchantUsdtDepositHistory = {
  deposits: MerchantUsdtDeposit[]
  configured: boolean
  assignedAt?: string | null
  message: string | null
}

export type MerchantUsdtWithdrawalConfig = {
  enabled: boolean
  minimum: string
  message: string | null
}

export type UsdtWithdrawalRequest = {
  id: string
  merchantEmail?: string
  amount: string
  fromAddress: string
  destination: string
  status: "PENDING" | "COMPLETED" | "REJECTED"
  requestedAt: string
  reviewedAt: string | null
  reviewedBy?: string | null
  transactionId: string | null
  rejectionReason: string | null
}

export type AdminInternalWalletSummary = {
  email: string
  active: boolean
  balance: number
  lastAdjustedAt: string | null
}

export type InternalWalletAdjustment = {
  id: string
  amount: number
  reason: string
  adjustedBy: string
  createdAt: string
}

export type AdminInternalWallet = {
  merchantEmail: string
  currency: "PHP"
  balance: number
  availableBalance: number
  adjustments: InternalWalletAdjustment[]
}

export type AdminMerchantWalletTransaction = {
  id: string
  sourceType: "COLLECTION" | "DISBURSEMENT" | "ADMIN_ADJUSTMENT"
  sourceId: string
  referenceNo: string
  description: string
  status: string | null
  amount: number
  createdAt: string
}

export type AdminMerchantWallet = {
  merchantEmail: string
  currency: "PHP"
  balance: number
  transactions: AdminMerchantWalletTransaction[]
}

export type MerchantPayoutAccount = {
  bankName: string
  accountName: string
  accountNumber: string
}

export type FloatingTransferRequest = {
  id: string
  merchantEmail?: string
  amount: number
  transferFee: number
  status: "PENDING" | "SUCCESSFUL" | "FAILED"
  bankName: string
  accountName: string
  accountNumber: string
  requestedAt: string
  reviewedAt: string | null
  reviewedBy?: string | null
  failureReason: string | null
  payoutReference?: string | null
  payoutNote?: string | null
}

export type MerchantNotificationPreferences = {
  emailEnabled: boolean
  pushEnabled: boolean
  paymentsEnabled: boolean
  transfersEnabled: boolean
}

export type MerchantNotification = {
  id: string
  type: "PAYMENT" | "DISBURSEMENT"
  title: string
  description: string
  reference: string
  amount: number
  createdAt: string
  readAt: string | null
}

export type MerchantNotificationInboxPage = {
  notifications: MerchantNotification[]
  unreadCount: number
  hasMore: boolean
}

export type WebhookDelivery = {
  id: string
  eventType: string
  resourceId: string
  payload: Record<string, unknown>
  attempts: number
  nextAttemptAt: string
  deliveredAt: string | null
  lastError: string | null
  lastAttemptAt: string | null
  attemptHistory: {
    attemptedAt: string
    delivered: boolean
    error: string | null
  }[]
  createdAt: string
}

export type KybDocument = {
  id: string
  documentType: string
  fileName: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
}

export type KybProfile = {
  legalBusinessName: string
  registrationNumber: string
  businessType: string
  country: string
  businessAddress: string
  ownerFullName: string
  ownerDateOfBirth: string
  ownerNationality: string
  ownerEmail: string
  ownerPhone: string
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED"
  reviewNotes: string | null
  updatedAt: string
  kybConsentGiven: boolean
}

export type MerchantApiKey = {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt?: string | null
  revokedAt?: string | null
  key?: string
}

export type MerchantWebhookSettings = {
  endpointUrl: string
  callbackUrl: string | null
  events: string[]
  enabled: boolean
  updatedAt: string
  signingSecret?: string
}

export type AdminKybApplication = KybProfile & {
  merchantEmail: string
  documents: KybDocument[]
  createdAt: string
}

type WalletBalanceResponse = {
  balance: number
  availableBalance?: number
  reservedBalance?: number
  cumulativeKrwCollections: number
  walletMode?: string
  paymentEnvironment?: "sandbox" | "production"
}

type InternalWalletResponse = {
  currency: "PHP"
  balance: number
  availableBalance: number
  transferFeeFixed: number
  label: string
}

type WalletActivityResponse = {
  id: string
  referenceNo: string
  institutionCode?: string
  institutionName?: string
  institutionLogoUrl?: string
  recipientName?: string
  recipientAccountNumber?: string
  remarks?: string
  isRefund?: boolean
  amount: number
  status: string
  channel: string
  transactionType: string
  description: string
  createdAt: string
  canRefund: boolean
  walletAmount?: number | null
  refundStatus: string | null
}

type CollectionInstitution = {
  code: string
  name: string
  logoUrl?: string
}

function readStorageItem(
  storageName: "local" | "session",
  key: string,
): string | null {
  try {
    const storage =
      storageName === "local" ? globalThis.localStorage : globalThis.sessionStorage
    return storage ? storage.getItem(key) : null
  } catch {
    return null
  }
}

function writeStorageItem(
  storageName: "local" | "session",
  key: string,
  value: string,
) {
  try {
    const storage =
      storageName === "local" ? globalThis.localStorage : globalThis.sessionStorage
    if (storage) storage.setItem(key, value)
  } catch {
    return
  }
}

function removeStorageItem(storageName: "local" | "session", key: string) {
  try {
    const storage =
      storageName === "local" ? globalThis.localStorage : globalThis.sessionStorage
    if (storage) storage.removeItem(key)
  } catch {
    return
  }
}

function getCachedCollectionInstitution(
  id: string,
): CollectionInstitution | undefined {
  if (typeof localStorage === "undefined") return undefined
  const serialized = localStorage.getItem(COLLECTION_INSTITUTION_CACHE_KEY)
  if (!serialized) return undefined
  try {
    const entries: unknown = JSON.parse(serialized)
    if (!Array.isArray(entries)) return undefined
    const match = entries.find(
      (entry) =>
        entry && typeof entry === "object" && "id" in entry && entry.id === id,
    )
    if (!match || typeof match !== "object" || !("institution" in match))
      return undefined
    const institution = match.institution
    if (
      !institution ||
      typeof institution !== "object" ||
      !("code" in institution) ||
      !("name" in institution)
    )
      return undefined
    if (
      typeof institution.code !== "string" ||
      typeof institution.name !== "string"
    )
      return undefined
    return {
      code: institution.code,
      name: institution.name,
      logoUrl:
        "logoUrl" in institution && typeof institution.logoUrl === "string"
          ? institution.logoUrl
          : undefined,
    }
  } catch (error) {
    console.error(
      "Could not read cached collection institution branding",
      error,
    )
    return undefined
  }
}

function cacheCollectionInstitution(
  id: string,
  institution: CollectionInstitution,
) {
  if (typeof localStorage === "undefined") return
  try {
    const serialized = localStorage.getItem(COLLECTION_INSTITUTION_CACHE_KEY)
    const entries: unknown = serialized ? JSON.parse(serialized) : []
    const validEntries = Array.isArray(entries)
      ? entries.filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            "id" in entry &&
            typeof entry.id === "string",
        )
      : []
    const nextEntries = [
      { id, institution },
      ...validEntries.filter((entry) => entry.id !== id),
    ].slice(0, 100)
    localStorage.setItem(
      COLLECTION_INSTITUTION_CACHE_KEY,
      JSON.stringify(nextEntries),
    )
  } catch (error) {
    console.error(
      "Could not cache collection institution branding for activity",
      error,
    )
  }
}

const defaultApiBaseUrl = import.meta.env.VITE_DRPAY_BACKEND_URL || ""
const liveApiBaseUrl =
  import.meta.env.VITE_DRPAY_LIVE_BACKEND_URL ||
  "https://drpay-live-api.onrender.com"
const sandboxApiBaseUrl =
  import.meta.env.VITE_DRPAY_SANDBOX_BACKEND_URL || defaultApiBaseUrl

function getConfiguredApiBaseUrl() {
  const hostname =
    typeof window === "undefined" ? "" : window.location.hostname.toLowerCase()
  if (
    hostname === "sandbox.paypulse.live"
  )
    return sandboxApiBaseUrl
  if (
    hostname === "paypulse.live" ||
    hostname === "www.paypulse.live"
  )
    return liveApiBaseUrl
  return defaultApiBaseUrl
}

export function getApiBaseUrl() {
  return getConfiguredApiBaseUrl().replace(/\/$/, "")
}
const SESSION_KEY = "drpay_session"
export const SESSION_EXPIRED_EVENT = "drpay:session-expired"
const PAYMENT_LINK_KEY = "drpay_pending_payment_link_key"
const COLLECTION_INSTITUTION_CACHE_KEY = "drpay_collection_institutions"
const DEVICE_TOKEN_PREFIX = "drpay_device_"
const VERIFIED_DEVICE_PREFIX = "drpay_verified_device_"
const LAST_MERCHANT_EMAIL_KEY = "drpay_last_merchant_email"

export function isBackendConfigured() {
  return Boolean(getConfiguredApiBaseUrl())
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false
  const session = value as Partial<Session>
  return (
    typeof session.accessToken === "string" &&
    session.accessToken.length > 0 &&
    typeof session.expiresAt === "number" &&
    Number.isFinite(session.expiresAt) &&
    typeof session.email === "string" &&
    session.email.length > 0 &&
    (session.role === "customer" ||
      session.role === "merchant" ||
      session.role === "super_admin" ||
      session.role === "finance" ||
      session.role === "compliance" ||
      session.role === "auditor")
  )
}

export function getSession(): Session | null {
  const stored = readStorageItem("session", SESSION_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as unknown
    if (!isSession(parsed)) {
      removeStorageItem("session", SESSION_KEY)
      return null
    }
    if (parsed.expiresAt <= Date.now()) {
      removeStorageItem("session", SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    removeStorageItem("session", SESSION_KEY)
    return null
  }
}

export function saveSession(session: Session) {
  if (!isSession(session)) {
    throw new Error("Invalid PayPulse session.")
  }
  writeStorageItem("session", SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  removeStorageItem("session", SESSION_KEY)
}

function getDeviceToken(email: string) {
  const key = `${DEVICE_TOKEN_PREFIX}${email}`
  const existing = readStorageItem("local", key)
  if (existing) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  writeStorageItem("local", key, token)
  return token
}

export function hasTrustedDevice(email: string) {
  return readStorageItem("local", `${VERIFIED_DEVICE_PREFIX}${email}`) === "true"
}

export function getLastMerchantEmail() {
  return readStorageItem("local", LAST_MERCHANT_EMAIL_KEY) || ""
}

export function getPaymentLinkIdempotencyKey() {
  const existing = readStorageItem("session", PAYMENT_LINK_KEY)
  if (existing) return existing
  const key = crypto.randomUUID()
  writeStorageItem("session", PAYMENT_LINK_KEY, key)
  return key
}

export function resetPaymentLinkIdempotencyKey() {
  removeStorageItem("session", PAYMENT_LINK_KEY)
  return getPaymentLinkIdempotencyKey()
}

export function clearPaymentLinkIdempotencyKey() {
  removeStorageItem("session", PAYMENT_LINK_KEY)
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function parseResponse<T>(
  response: Response,
  expireSessionOnUnauthorized = true,
): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    requestId?: string
  }
  const withRequestReference = (message: string) =>
    body.requestId ? `${message} (Reference: ${body.requestId})` : message
  const errorMessage =
    body.error ===
    "Pay the one-time PHP activation fee and maintain 100 USDT above the assigned address's starting balance to enable this merchant service."
      ? "Please pay the required TAX or contact support."
      : body.error
        ? withRequestReference(body.error)
        : undefined
  if (
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504
  ) {
    throw new ApiError(
      errorMessage ||
        "PayPulse is temporarily unavailable. Please try again in a few minutes.",
      response.status,
      body.requestId,
    )
  }
  if (response.status === 401 && expireSessionOnUnauthorized) clearSession()
  throw new ApiError(
    errorMessage ||
      (response.status === 401
        ? "Your session has expired. Sign in again."
        : `Request failed (${response.status})`),
    response.status,
    body.requestId,
  )
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error
  }

  throw new ApiError(
    "PayPulse is temporarily unavailable. Check your connection and try again.",
    503,
  )
}

async function publicRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const apiBaseUrl = getConfiguredApiBaseUrl()
  if (!apiBaseUrl)
    throw new Error(
      "Live transactions are disabled because the PayPulse backend is not configured.",
    )
  const response = await apiFetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  })
  return parseResponse<T>(response)
}

async function backendRequest<T>(
  path: string,
  options?: RequestInit,
  expireSessionOnUnauthorized = true,
): Promise<T> {
  const apiBaseUrl = getConfiguredApiBaseUrl()
  if (!apiBaseUrl)
    throw new Error(
      "Live transactions are disabled because the PayPulse backend is not configured.",
    )
  const session = getSession()
  if (!session) throw new ApiError("A verified PayPulse session is required", 401)
  const response = await apiFetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      ...options?.headers,
    },
  })
  if (
    response.status === 401 &&
    expireSessionOnUnauthorized &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  }
  return parseResponse<T>(response, expireSessionOnUnauthorized)
}

export type AdminLoginChallenge = {
  accessToken: string
  expiresInSeconds: number
  email: string
  role: "super_admin" | "finance" | "compliance" | "auditor"
  requiresMfaSetup: boolean
  requiresMfa: boolean
}

function sessionFromResponse(
  response: {
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
  },
  fallbackEmail: string,
) {
  const session: Session = {
    accessToken: response.accessToken,
    expiresAt: Date.now() + response.expiresInSeconds * 1000,
    email: response.email || fallbackEmail,
    role: response.role || "merchant",
  }
  saveSession(session)
  return session
}

export type CustomerPaymentHistoryItem = {
  referenceNo: string
  title: string
  amount: string
  currency: string
  status: "PENDING" | "COMPLETED"
  createdAt: string
}

export async function requestCustomerOtp(
  email: string,
): Promise<{ challengeId: string; message: string }> {
  return publicRequest<{ challengeId: string; message: string }>(
    "/v1/customer/auth/request-otp",
    {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    },
  )
}

export async function verifyCustomerOtp(
  email: string,
  challengeId: string,
  code: string,
): Promise<Session> {
  const response = await publicRequest<{
    accessToken: string
    expiresInSeconds: number
    email: string
    role: "customer"
  }>("/v1/customer/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      challengeId,
      code: code.trim(),
    }),
  })
  return sessionFromResponse(response, email)
}

export async function getCustomerPaymentHistory(): Promise<
  CustomerPaymentHistoryItem[]
> {
  const response = await backendRequest<{
    payments: CustomerPaymentHistoryItem[]
  }>("/v1/customer/payment-history")
  return response.payments
}

export async function login(
  email: string,
  password: string,
): Promise<Session | AdminLoginChallenge> {
  const response = await publicRequest<{
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
    authenticated?: boolean
    requiresMfaSetup?: boolean
    requiresMfa?: boolean
  }>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  if (response.authenticated) {
    return sessionFromResponse(response, email)
  }
  return {
    accessToken: response.accessToken,
    expiresInSeconds: response.expiresInSeconds,
    email: response.email || email,
    role:
      response.role === "finance" ||
      response.role === "compliance" ||
      response.role === "auditor"
        ? response.role
        : "super_admin",
    requiresMfaSetup: Boolean(response.requiresMfaSetup),
    requiresMfa: Boolean(response.requiresMfa),
  }
}

export async function setupAdminMfa(accessToken: string) {
  return publicRequest<{ secret: string; provisioningUri: string }>(
    "/v1/auth/admin/mfa/setup",
    {
      method: "POST",
      body: JSON.stringify({ accessToken }),
    },
  )
}

export async function verifyAdminMfa(
  accessToken: string,
  code: string,
): Promise<Session> {
  const response = await publicRequest<{
    accessToken: string
    expiresInSeconds: number
    email: string
    role: Session["role"]
    authenticated: boolean
  }>("/v1/auth/admin/mfa/verify", {
    method: "POST",
    body: JSON.stringify({ accessToken, code }),
  })
  return sessionFromResponse(response, response.email)
}

export async function inspectAdminInvitation(token: string) {
  return publicRequest<{ email: string; role: AdminLoginChallenge["role"] }>(
    "/v1/auth/admin/invitation/inspect",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    },
  )
}

export async function acceptAdminInvitation(
  token: string,
  password: string,
): Promise<AdminLoginChallenge> {
  const response = await publicRequest<AdminLoginChallenge>(
    "/v1/auth/admin/invitation/accept",
    {
      method: "POST",
      body: JSON.stringify({ token, password }),
    },
  )
  return {
    ...response,
    requiresMfaSetup: true,
    requiresMfa: false,
  }
}

function saveMerchantSession(
  email: string,
  response: {
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
  },
) {
  const merchantEmail = (response.email || email).trim().toLowerCase()
  const session: Session = {
    accessToken: response.accessToken,
    expiresAt: Date.now() + response.expiresInSeconds * 1000,
    email: merchantEmail,
    role: response.role || "merchant",
  }
  saveSession(session)
  writeStorageItem("local", LAST_MERCHANT_EMAIL_KEY, merchantEmail)
  return session
}

export async function requestDeviceOtp(email: string) {
  return publicRequest<{ challengeId: string; message: string }>(
    "/v1/auth/device/otp/request",
    {
      method: "POST",
      body: JSON.stringify({ email, deviceToken: getDeviceToken(email) }),
    },
  )
}

export type MerchantRegistrationInput = {
  email: string
  phoneNumber: string
  referralCode?: string
}

export type MerchantDownlineReferral = {
  email: string
  businessName: string
  active: boolean
  registrationPending: boolean
  commissionRate: number
  createdAt: string
}

export type MerchantDownline = {
  enabled: boolean
  referralCode: string | null
  referrals: MerchantDownlineReferral[]
  message: string | null
}

export type MerchantBusinessDetails = {
  businessName: string
  contactPerson: string
  businessAddress: string
  registrationNumber: string
  businessType: string
  country: string
  ownerFullName: string
  ownerDateOfBirth: string
  ownerNationality: string
  ownerEmail: string
  ownerPhone: string
  bankName: string
  accountName: string
  accountNumber: string
}

export type RegistrationDocumentType = "business_registration" | "identity_front" | "identity_back" | "proof_of_address"

export async function requestMerchantRegistrationOtp(
  input: MerchantRegistrationInput,
) {
  return publicRequest<{ challengeId: string; message: string }>(
    "/v1/auth/registration/otp/request",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export async function verifyMerchantRegistrationOtp(
  email: string,
  challengeId: string,
  code: string,
) {
  return publicRequest<{ email: string; status: "verified" }>(
    "/v1/auth/registration/otp/verify",
    {
      method: "POST",
      body: JSON.stringify({ email, challengeId, code }),
    },
  )
}

export async function submitMerchantRegistration(
  email: string,
  challengeId: string,
  details: MerchantBusinessDetails,
  pin: string,
  kybConsent: true,
) {
  return publicRequest<{ email: string; status: "pending_review" }>(
    "/v1/auth/registration/submit",
    {
      method: "POST",
      body: JSON.stringify({ email, challengeId, ...details, pin, kybConsent }),
    },
  )
}

export async function uploadMerchantRegistrationDocument(
  challengeId: string,
  documentType: RegistrationDocumentType,
  file: File,
) {
  const contentType = normalizeDocumentContentType(file)
  if (!contentType) {
    throw new Error("Choose a PDF, JPEG, or PNG document no larger than 10 MB.")
  }

  const signed = await publicRequest<{
    documentId: string
    uploadUrl: string
    objectKey: string
    fileName: string
    headers: Record<string, string>
  }>("/v1/auth/registration/documents/presign", {
    method: "POST",
    body: JSON.stringify({
      challengeId,
      documentType,
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    }),
  })
  await publicRequest<{ uploaded: true }>(
    `/v1/auth/registration/documents/${encodeURIComponent(signed.documentId)}/upload?challengeId=${encodeURIComponent(challengeId)}`,
    {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: file,
    },
  )
  return publicRequest<{ uploaded: true; documentType: string }>(
    "/v1/auth/registration/documents/complete",
    {
      method: "POST",
      body: JSON.stringify({
        challengeId,
        documentId: signed.documentId,
        objectKey: signed.objectKey,
        documentType,
        fileName: signed.fileName,
        contentType,
        sizeBytes: file.size,
      }),
    },
  )
}

export async function verifyDeviceOtp(
  email: string,
  challengeId: string,
  code: string,
): Promise<Session | null> {
  const response = await publicRequest<{
    pinConfigured: boolean
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
  }>("/v1/auth/device/otp/verify", {
    method: "POST",
    body: JSON.stringify({
      email,
      challengeId,
      code,
      deviceToken: getDeviceToken(email),
    }),
  })
  writeStorageItem("local", `${VERIFIED_DEVICE_PREFIX}${email}`, "true")
  if (response.pinConfigured) return null
  return saveMerchantSession(email, response)
}

export async function loginWithPin(
  email: string,
  pin: string,
): Promise<Session> {
  const response = await publicRequest<{
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
  }>("/v1/auth/device/pin", {
    method: "POST",
    body: JSON.stringify({ email, pin, deviceToken: getDeviceToken(email) }),
  })
  return saveMerchantSession(email, response)
}

export async function loginWithBiometric(
  email: string,
  secret: string,
): Promise<Session> {
  const response = await publicRequest<{
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
  }>("/v1/auth/device/biometric", {
    method: "POST",
    body: JSON.stringify({ email, secret, deviceToken: getDeviceToken(email) }),
  })
  return saveMerchantSession(email, response)
}

export async function completeProviderLoginWithPin(
  email: string,
  provider: LoginProvider,
  providerChallengeId: string,
  pin: string,
): Promise<Session> {
  const response = await publicRequest<{
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
  }>("/v1/auth/device/pin", {
    method: "POST",
    body: JSON.stringify({
      email,
      pin,
      provider,
      providerChallengeId,
      deviceToken: getDeviceToken(email),
    }),
  })
  writeStorageItem("local", `${VERIFIED_DEVICE_PREFIX}${email}`, "true")
  return saveMerchantSession(email, response)
}

export async function completeProviderLoginWithBiometric(
  email: string,
  provider: LoginProvider,
  providerChallengeId: string,
  secret: string,
): Promise<Session> {
  const response = await publicRequest<{
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
  }>("/v1/auth/device/biometric", {
    method: "POST",
    body: JSON.stringify({
      email,
      secret,
      provider,
      providerChallengeId,
      deviceToken: getDeviceToken(email),
    }),
  })
  return saveMerchantSession(email, response)
}

export function getAuthProviderConfig() {
  return publicRequest<AuthProviderConfig>("/v1/auth/providers", {
    cache: "no-store",
  })
}

function resolveProviderSignIn(
  response: ProviderSignInResponse,
): ProviderSignInResult {
  if (response.pinConfigured) {
    return {
      stepUp: { email: response.email, challengeId: response.challengeId },
    }
  }
  return {
    session: saveMerchantSession(response.email, response),
  }
}

export async function loginWithGoogleCredential(
  challengeId: string,
  credential: string,
): Promise<ProviderSignInResult> {
  const response = await publicRequest<ProviderSignInResponse>("/v1/auth/google/login", {
    method: "POST",
    body: JSON.stringify({ challengeId, credential }),
  })
  return resolveProviderSignIn(response)
}

export type TelegramAuthChallenge = {
  challengeId: string
  nonce: string
  clientId: string
}

export type GoogleAuthChallenge = {
  challengeId: string
  nonce: string
}

export function createGoogleLoginChallenge() {
  return publicRequest<GoogleAuthChallenge>("/v1/auth/google/challenge", {
    method: "POST",
  })
}

export function createTelegramLoginChallenge() {
  return publicRequest<TelegramAuthChallenge>("/v1/auth/telegram/challenge", {
    method: "POST",
  })
}

export async function loginWithTelegramToken(
  challengeId: string,
  idToken: string,
): Promise<ProviderSignInResult> {
  const response = await publicRequest<ProviderSignInResponse>("/v1/auth/telegram/login", {
    method: "POST",
    body: JSON.stringify({ challengeId, idToken }),
  })
  return resolveProviderSignIn(response)
}

export async function loginWithPasskey(): Promise<ProviderSignInResult> {
  const challenge = await publicRequest<{
    challengeId: string
    options: PublicKeyCredentialRequestOptionsJSON
  }>("/v1/auth/passkey/options", { method: "POST" })
  const credential = await startAuthentication({
    optionsJSON: challenge.options,
  })
  const response = await publicRequest<ProviderSignInResponse>("/v1/auth/passkey/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      credential,
    }),
  })
  return resolveProviderSignIn(response)
}

export function getMerchantAuthMethods() {
  return backendRequest<MerchantAuthMethods>("/v1/security/auth-methods", {
    cache: "no-store",
  })
}

export async function createGoogleLinkChallenge() {
  return backendRequest<GoogleAuthChallenge>(
    "/v1/security/auth-methods/google/challenge",
    { method: "POST" },
  )
}

export async function linkGoogleIdentity(
  challengeId: string,
  credential: string,
) {
  return backendRequest<{ linked: true; alreadyLinked?: boolean }>(
    "/v1/security/auth-methods/google",
    { method: "POST", body: JSON.stringify({ challengeId, credential }) },
  )
}

export function createTelegramLinkChallenge() {
  return backendRequest<TelegramAuthChallenge>(
    "/v1/security/auth-methods/telegram/challenge",
    { method: "POST" },
  )
}

export function linkTelegramIdentity(challengeId: string, idToken: string) {
  return backendRequest<{ linked: true; alreadyLinked?: boolean }>(
    "/v1/security/auth-methods/telegram",
    { method: "POST", body: JSON.stringify({ challengeId, idToken }) },
  )
}

export async function registerMerchantPasskey() {
  const challenge = await backendRequest<{
    challengeId: string
    options: PublicKeyCredentialCreationOptionsJSON
  }>("/v1/security/passkeys/register/options", { method: "POST" })
  const credential = await startRegistration({
    optionsJSON: challenge.options,
  })
  return backendRequest<{ registered: true }>(
    "/v1/security/passkeys/register/verify",
    {
      method: "POST",
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        credential,
      }),
    },
  )
}

export function removeMerchantPasskey(credentialId: string) {
  return backendRequest<{ removed: true }>(
    `/v1/security/passkeys/${encodeURIComponent(credentialId)}`,
    { method: "DELETE" },
  )
}

export function unlinkMerchantAuthMethod(provider: "google" | "telegram") {
  return backendRequest<{ linked: false }>(
    `/v1/security/auth-methods/${provider}`,
    { method: "DELETE" },
  )
}

export async function registerBiometricCredential(secret: string) {
  const session = getSession()
  if (!session) throw new Error("Sign in before enabling biometric access.")
  return backendRequest<{ enabled: true }>("/v1/security/biometric", {
    method: "POST",
    body: JSON.stringify({
      secret,
      deviceToken: getDeviceToken(session.email),
    }),
  })
}

export async function removeBiometricCredential() {
  const session = getSession()
  if (!session) throw new Error("Sign in before disabling biometric access.")
  return backendRequest<{ enabled: false }>("/v1/security/biometric/remove", {
    method: "POST",
    body: JSON.stringify({ deviceToken: getDeviceToken(session.email) }),
  })
}

export function getMerchantSecurityStatus() {
  return backendRequest<MerchantSecurityStatus>("/v1/security/status")
}

export async function getMerchantActivityTrend(): Promise<MerchantActivityTrendPoint[]> {
  return backendRequest<MerchantActivityTrendPoint[]>(
    "/v1/wallet/activity/trend",
  )
}

export async function getMerchantActivityPage(
  input: {
    limit?: number
    offset?: number
    from?: string
    to?: string
  } = {},
): Promise<Transaction[]> {
  const params = new URLSearchParams({
    limit: String(input.limit ?? 50),
    offset: String(input.offset ?? 0),
  })
  if (input.from) params.set("from", input.from)
  if (input.to) params.set("to", input.to)
  const rows = await backendRequest<WalletActivityResponse[]>(
    `/v1/wallet/activity?${params.toString()}`,
  )
  return rows.map(toTransaction)
}

export async function registerPushDevice(token: string, appId: string) {
  return backendRequest<{ registered: true }>("/v1/notifications/push-token", {
    method: "POST",
    body: JSON.stringify({ token, appId }),
  })
}

export async function removePushDevice(token: string) {
  return backendRequest<{ removed: true }>(
    "/v1/notifications/push-token/remove",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    },
  )
}

export async function getMerchantNotificationInbox(
  input: {
    limit?: number
    offset?: number
  } = {},
): Promise<MerchantNotificationInboxPage> {
  const params = new URLSearchParams({
    limit: String(input.limit ?? 20),
    offset: String(input.offset ?? 0),
  })
  return backendRequest<MerchantNotificationInboxPage>(
    `/v1/notifications/inbox?${params.toString()}`,
  )
}

export async function markMerchantNotificationRead(id: string) {
  return backendRequest<{ readAt: string }>(
    `/v1/notifications/inbox/${encodeURIComponent(id)}/read`,
    { method: "POST" },
  )
}

export async function markAllMerchantNotificationsRead() {
  return backendRequest<{ updated: number; unreadCount: number }>(
    "/v1/notifications/inbox/read-all",
    { method: "POST" },
  )
}

export async function getMerchantNotificationPreferences(): Promise<MerchantNotificationPreferences> {
  return backendRequest<MerchantNotificationPreferences>(
    "/v1/notifications/preferences",
  )
}

export async function saveMerchantNotificationPreferences(
  input: MerchantNotificationPreferences,
): Promise<MerchantNotificationPreferences> {
  return backendRequest<MerchantNotificationPreferences>(
    "/v1/notifications/preferences",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  )
}

export async function getMerchantCheckoutPreferences(): Promise<MerchantCheckoutPreferences> {
  return backendRequest<MerchantCheckoutPreferences>("/v1/checkout/preferences")
}

export async function saveMerchantCheckoutPreferences(
  input: MerchantCheckoutPreferences,
): Promise<MerchantCheckoutPreferences> {
  return backendRequest<MerchantCheckoutPreferences>(
    "/v1/checkout/preferences",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  )
}

export async function setMerchantPin(pin: string) {
  return backendRequest<{ pinConfigured: true }>("/v1/security/pin", {
    method: "POST",
    body: JSON.stringify({ pin }),
  })
}

export async function authorizeTransferWithPin(
  input: TransferAuthorizationInput,
  pin: string,
) {
  return backendRequest<{ stepUpToken: string }>("/v1/security/transfer/pin", {
    method: "POST",
    body: JSON.stringify({ ...input, pin }),
  })
}

export async function authorizeTransferWithBiometric(
  input: TransferAuthorizationInput,
  secret: string,
) {
  const session = getSession()
  if (!session) throw new Error("Sign in before authorizing a transfer.")
  return backendRequest<{ stepUpToken: string }>(
    "/v1/security/transfer/biometric",
    {
      method: "POST",
      body: JSON.stringify({
        ...input,
        secret,
        deviceToken: getDeviceToken(session.email),
      }),
    },
  )
}

export async function getCollectionRefundDetails(
  paymentId: string,
): Promise<CollectionRefundDetails> {
  return backendRequest<CollectionRefundDetails>(
    `/v1/payment-links/${encodeURIComponent(paymentId)}/refund-details`,
  )
}

function formatMoney(amount: number, showSign = false) {
  const sign = amount < 0 ? "−" : showSign ? "+" : ""
  return `${sign}₱${Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toStatus(status: string): Transaction["status"] {
  const normalized = status.toUpperCase()
  if (
    ["EXECUTED", "MANUALLY_PAID", "SUCCESS", "COMPLETED", "PAID"].includes(
      normalized,
    )
  )
    return "Completed"
  if (
    [
      "FAILED",
      "ERROR",
      "REJECTED",
      "CANCELED",
      "CANCELLED",
      "EXPIRED",
      "REVERSED",
    ].includes(normalized)
  )
    return "Failed"
  return "Pending"
}

function toTransaction(
  item: WalletActivityResponse,
  index: number,
): Transaction {
  const isCredit = item.amount >= 0
  const type = item.transactionType.toUpperCase()
  const cachedInstitution = type.includes("PAYMENT")
    ? getCachedCollectionInstitution(item.id)
    : undefined
  return {
    id: item.id,
    customer: type.includes("DISBURSEMENT")
      ? item.institutionName || item.description || "Bank transfer"
      : item.description ||
        (isCredit ? "Payment link collection" : "Bank transfer"),
    email: isCredit ? "Money received" : "Money sent",
    initials: type.includes("ADMIN_ADJUSTMENT")
      ? "AD"
      : type.includes("ACTIVATION_FEE")
        ? "AF"
        : type.includes("DOWNLINE_COMMISSION")
          ? "DC"
        : type.includes("DISBURSEMENT")
          ? "TX"
          : type.includes("DEPOSIT")
            ? "DP"
            : item.channel === "QR Ph checkout"
              ? "QR"
              : "PL",
    color: ["lime", "blue", "peach", "violet", "mint"][
      index % 5
    ] as Transaction["color"],
    reference: item.referenceNo,
    channel: type.includes("ADMIN_ADJUSTMENT")
      ? "Admin adjustment"
      : type === "DOWNLINE_COMMISSION"
        ? "Downline commission"
        : type === "DOWNLINE_COMMISSION_REVERSAL"
          ? "Commission reversal"
          : type.includes("DISBURSEMENT")
            ? item.channel
            : type.includes("DEPOSIT")
              ? "Bank"
              : item.channel,
    institutionCode: item.institutionCode || cachedInstitution?.code,
    institutionName: item.institutionName || cachedInstitution?.name,
    institutionLogoUrl: item.institutionLogoUrl || cachedInstitution?.logoUrl,
    recipientName: item.recipientName,
    recipientAccountNumber: item.recipientAccountNumber,
    remarks: item.remarks,
    isRefund: item.isRefund,
    createdAt: item.createdAt,
    date: new Date(item.createdAt).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    status: toStatus(item.status),
    rawStatus: item.status,
    amount: formatMoney(item.amount, true),
    numericAmount: item.amount,
    walletAmount: item.walletAmount,
    description: item.description,
    canRefund: item.canRefund,
    refundStatus: item.refundStatus,
  }
}

export async function getMerchantDashboard(): Promise<DashboardData> {
  const [wallet, activity, internalWallet] = await Promise.all([
    backendRequest<WalletBalanceResponse>("/v1/wallet/balance"),
    backendRequest<WalletActivityResponse[]>(
      "/v1/wallet/activity?limit=50&offset=0",
    ),
    backendRequest<InternalWalletResponse>("/v1/internal-wallet"),
  ])
  const transactions = activity.map(toTransaction)
  const settledCredits = transactions.filter(
    (item) =>
      item.status === "Completed" &&
      item.numericAmount > 0 &&
      item.channel !== "Downline commission",
  )
  const volume = settledCredits.reduce(
    (sum, item) => sum + item.numericAmount,
    0,
  )
  const balance = wallet.balance
  const availableBalance = wallet.availableBalance ?? balance
  return {
    availableBalance: formatMoney(availableBalance),
    balance: availableBalance,
    reservedBalance: wallet.reservedBalance ?? 0,
    internalWalletBalance: formatMoney(internalWallet.balance),
    cumulativeKrwCollections: wallet.cumulativeKrwCollections,
    floatingBalance: internalWallet.balance,
    availableFloatingBalance: internalWallet.availableBalance,
    transferFeeFixed: internalWallet.transferFeeFixed,
    grossVolume: formatMoney(volume),
    successfulPayments: String(settledCredits.length),
    averageTransaction: formatMoney(
      settledCredits.length ? volume / settledCredits.length : 0,
    ),
    walletMode: wallet.walletMode === "pooled" ? "pooled" : "internal",
    paymentEnvironment:
      wallet.paymentEnvironment === "production" ? "production" : "sandbox",
    transactions,
  }
}

export async function getMerchantDownline(): Promise<MerchantDownline> {
  return backendRequest<MerchantDownline>("/v1/merchant/downline")
}

export async function setMerchantDownlineCommissionRate(
  email: string,
  rate: number,
): Promise<{ email: string; commissionRate: number }> {
  return backendRequest<{ email: string; commissionRate: number }>(
    `/v1/merchant/downline/${encodeURIComponent(email)}/rate`,
    {
      method: "PUT",
      body: JSON.stringify({ rate }),
    },
  )
}

export async function getInstitutions(): Promise<Institution[]> {
  return backendRequest<Institution[]>("/v1/disbursement-institutions")
}

export async function getPaymentInstitutions(): Promise<PaymentInstitution[]> {
  return backendRequest<PaymentInstitution[]>("/v1/payment-institutions")
}

export async function getKrwPhpQuote(): Promise<CurrencyQuote> {
  return backendRequest<CurrencyQuote>("/v1/exchange-rates/krw-php")
}

export async function getAdminSettings(): Promise<AdminSettings> {
  return backendRequest<AdminSettings>("/v1/admin/settings")
}

export async function getPublicMaintenanceStatus(): Promise<MerchantMaintenanceStatus> {
  return publicRequest<MerchantMaintenanceStatus>("/v1/maintenance-status")
}

export async function getAdminMaintenanceMode(): Promise<MerchantMaintenanceStatus> {
  return backendRequest<MerchantMaintenanceStatus>(
    "/v1/admin/maintenance-mode",
  )
}

export async function setAdminMaintenanceMode(
  enabled: boolean,
): Promise<MerchantMaintenanceStatus> {
  return backendRequest<MerchantMaintenanceStatus>(
    "/v1/admin/maintenance-mode",
    {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    },
  )
}

export type AdminApprovalRequest = {
  id: string
  actionKey: string
  targetKey: string
  payload: Record<string, unknown>
  requestedBy: string
  approvedBy: string | null
  status: "pending" | "approved" | "rejected" | "consumed"
  requestedAt: string
  reviewedAt: string | null
  consumedAt: string | null
}

export type AdminStaffMember = {
  email: string
  role: "super_admin" | "finance" | "compliance" | "auditor"
  status: "invited" | "active" | "disabled"
  invitedBy: string | null
  mfaEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type AdminReconciliationCase = {
  id: string
  sourceType: "SWIFTPAY" | "BANK_CSV"
  batchId: string | null
  lineNumber: number | null
  externalReference: string
  direction: "IN" | "OUT"
  amount: string
  currency: string
  externalStatus: string
  internalId: string | null
  internalReference: string | null
  status:
    | "matched"
    | "amount_mismatch"
    | "currency_mismatch"
    | "status_mismatch"
    | "unmatched_suspense"
    | "provider_retry"
  details: Record<string, unknown>
  createdBy: string | null
  createdAt: string
}

export type AdminSuspenseItem = {
  id: string
  status: "open" | "resolved"
  resolutionNote: string | null
  ownerEmail: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  sourceType: "SWIFTPAY" | "BANK_CSV"
  externalReference: string
  direction: "IN" | "OUT"
  amount: string
  currency: string
  externalStatus: string
  details: Record<string, unknown>
  events: {
    eventType: "assigned" | "resolved"
    actorEmail: string
    ownerEmail: string | null
    note: string | null
    createdAt: string
  }[]
}

export type AdminApprovalRequired = {
  approvalRequired: true
  approvalRequestId: string
  status: "pending"
}

export type AdminActionResult<T> = T | AdminApprovalRequired

async function submitAdminApprovalAction<T>(
  actionKey: string,
  targetKey: string,
  path: string,
  input: Record<string, unknown>,
): Promise<AdminActionResult<T>> {
  const sessionEmail = getSession()?.email || "unknown"
  const storageKey = `drpay_admin_approval_${sessionEmail}_${actionKey}_${targetKey}`
  const inputFingerprint = JSON.stringify(input)
  let approvalRequestId: string | undefined
  const storedValue = readStorageItem("session", storageKey)
  if (storedValue) {
    try {
      const stored = JSON.parse(storedValue) as {
        approvalRequestId?: string
        inputFingerprint?: string
      }
      if (stored.inputFingerprint === inputFingerprint) {
        approvalRequestId = stored.approvalRequestId
      } else {
        removeStorageItem("session", storageKey)
      }
    } catch {
      removeStorageItem("session", storageKey)
    }
  }
  const result = await backendRequest<T | AdminApprovalRequired>(path, {
    method: "POST",
    body: JSON.stringify({
      ...input,
      ...(approvalRequestId ? { approvalRequestId } : {}),
    }),
  })
  if (
    typeof result === "object" &&
    result !== null &&
    "approvalRequired" in result &&
    result.approvalRequired === true &&
    "approvalRequestId" in result &&
    typeof result.approvalRequestId === "string"
  ) {
    writeStorageItem(
      "session",
      storageKey,
      JSON.stringify({
        approvalRequestId: result.approvalRequestId,
        inputFingerprint,
      }),
    )
    return result
  }
  removeStorageItem("session", storageKey)
  return result
}

export async function getAdminAuditEvents(): Promise<AdminAuditEvent[]> {
  return backendRequest<AdminAuditEvent[]>("/v1/admin/audit")
}

export async function getAdminApprovalRequests(
  status?: AdminApprovalRequest["status"],
): Promise<AdminApprovalRequest[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ""
  return backendRequest<AdminApprovalRequest[]>(
    `/v1/admin/approval-requests${query}`,
  )
}

export async function reviewAdminApprovalRequest(
  id: string,
  decision: "approve" | "reject",
): Promise<{ id: string; status: "approved" | "rejected"; reviewedBy: string }> {
  return backendRequest(
    `/v1/admin/approval-requests/${encodeURIComponent(id)}/${decision}`,
    { method: "POST" },
  )
}

export async function inviteAdminStaff(
  email: string,
  role: "finance" | "compliance" | "auditor",
): Promise<{ email: string; role: string; expiresInHours: number }> {
  return backendRequest("/v1/admin/staff/invitations", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  })
}

export async function getAdminStaff(): Promise<AdminStaffMember[]> {
  return backendRequest("/v1/admin/staff")
}

export async function disableAdminStaff(email: string) {
  return backendRequest<{ email: string; status: "disabled" }>(
    `/v1/admin/staff/${encodeURIComponent(email)}/disable`,
    { method: "POST" },
  )
}

export async function getAdminReconciliationCases(): Promise<
  AdminReconciliationCase[]
> {
  return backendRequest("/v1/admin/reconciliation/cases")
}

export async function getAdminSuspenseItems(): Promise<AdminSuspenseItem[]> {
  return backendRequest("/v1/admin/reconciliation/suspense")
}

export async function claimAdminSuspenseItem(id: string) {
  return backendRequest<{ id: string; ownerEmail: string }>(
    `/v1/admin/reconciliation/suspense/${encodeURIComponent(id)}/claim`,
    { method: "POST" },
  )
}

export async function resolveAdminSuspenseItem(id: string, note: string) {
  return backendRequest<{ id: string; status: "resolved" }>(
    `/v1/admin/reconciliation/suspense/${encodeURIComponent(id)}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({ note }),
    },
  )
}

export async function uploadAdminBankCsv(file: File) {
  const content = await file.text()
  return backendRequest<{
    batchId: string
    filename: string
    importedRows: number
    counts: Record<string, number>
    autoPosted: false
    duplicate?: boolean
  }>("/v1/admin/reconciliation/bank-csv", {
    method: "POST",
    headers: {
      "Content-Type": "text/csv",
      "X-Filename": file.name.replace(/[^\w.-]/g, "_").slice(0, 120),
    },
    body: content,
  })
}

export async function runAdminSwiftPayReconciliation() {
  return backendRequest<{
    cases: { status: string; count: number }[]
    scannedAt: string
  }>("/v1/admin/reconciliation/swiftpay/scan", { method: "POST" })
}

export async function getAdminPaymentLinks(): Promise<AdminPaymentLink[]> {
  return backendRequest<AdminPaymentLink[]>("/v1/admin/payment-links")
}

export async function createAdminTaxInvoice(
  input: {
    description: string
    amount: number
    customerEmail: string
    payeeName: string
    payeeTin: string
    payeeAddress: string
    payorName: string
    payorTin: string
    payorAddress: string
  },
  idempotencyKey: string,
  attachment?: File,
): Promise<PaymentLinkResult> {
  let attachmentId: string | undefined
  if (attachment) {
    const extension = attachment.name.toLowerCase().split(".").pop()
    const contentType =
      attachment.type ||
      (extension === "pdf"
        ? "application/pdf"
        : extension === "jpg" || extension === "jpeg"
          ? "image/jpeg"
          : extension === "png"
            ? "image/png"
            : "")
    const uploadReservation = await backendRequest<{
      uploadId: string
      fileName: string
      completed: boolean
    }>("/v1/admin/tax-invoice-attachments/presign", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        fileName: attachment.name,
        contentType,
        sizeBytes: attachment.size,
      }),
    })
    if (!uploadReservation.completed) {
      await backendRequest<{ uploadId: string }>(
        `/v1/admin/tax-invoice-attachments/${encodeURIComponent(uploadReservation.uploadId)}`,
        {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: attachment,
        },
      )
    }
    attachmentId = uploadReservation.uploadId
  }
  return backendRequest<PaymentLinkResult>("/v1/admin/tax-invoices", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      ...input,
      ...(attachmentId ? { attachmentId } : {}),
    }),
  })
}

export async function markAdminPaymentLinkPaid(
  id: string,
  verificationNote: string,
): Promise<AdminActionResult<AdminPaymentLink>> {
  return submitAdminApprovalAction<AdminPaymentLink>(
    "manual_payment_confirmation",
    id,
    `/v1/admin/payment-links/${encodeURIComponent(id)}/mark-paid`,
    { verificationNote },
  )
}

export async function updateAdminSettings(
  settings: AdminSettings,
): Promise<AdminSettings> {
  return backendRequest<AdminSettings>("/v1/admin/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  })
}

export async function getAdminMerchantAccounts(): Promise<AdminMerchantAccount[]> {
  return backendRequest<AdminMerchantAccount[]>("/v1/admin/merchants")
}

export async function activateAdminMerchantAccounts(
  emails: string[],
): Promise<{
  activatedEmails: string[];
  activationEmailFailureCount: number;
}> {
  const activatedEmails: string[] = []
  let activationEmailFailureCount = 0
  for (let start = 0; start < emails.length; start += 100) {
    try {
      const result = await backendRequest<{
        activatedEmails: string[];
        activationEmailFailureCount?: number;
      }>("/v1/admin/merchants/activate", {
        method: "POST",
        body: JSON.stringify({ emails: emails.slice(start, start + 100) }),
      })
      activatedEmails.push(...result.activatedEmails)
      activationEmailFailureCount += result.activationEmailFailureCount ?? 0
    } catch (error) {
      if (activatedEmails.length && error instanceof Error) {
        throw new Error(
          `Activation completed for ${activatedEmails.length} accounts before the next batch failed: ${error.message}`,
        )
      }
      throw error
    }
  }
  return { activatedEmails, activationEmailFailureCount }
}

export async function activateAdminMerchantDownline(
  email: string,
): Promise<{ email: string; downlineManuallyEnabled: boolean }> {
  return backendRequest(
    `/v1/admin/merchants/${encodeURIComponent(email)}/downline/activate`,
    { method: "POST" },
  )
}

export async function updateAdminMerchantUsdtWallet(
  email: string,
  address: string,
): Promise<{ address: string | null; network: string }> {
  return backendRequest(
    `/v1/admin/merchants/${encodeURIComponent(email)}/usdt-wallet`,
    {
      method: "PUT",
      body: JSON.stringify({ address }),
    },
  )
}

export async function getMerchantUsdtWallet(): Promise<MerchantUsdtWallet> {
  return backendRequest<MerchantUsdtWallet>("/v1/crypto/usdt-wallet")
}

export async function getMerchantUsdtDeposits(): Promise<MerchantUsdtDepositHistory> {
  return backendRequest<MerchantUsdtDepositHistory>("/v1/crypto/usdt-deposits")
}

export async function getMerchantUsdtWithdrawalConfig(): Promise<MerchantUsdtWithdrawalConfig> {
  return backendRequest<MerchantUsdtWithdrawalConfig>(
    "/v1/crypto/usdt-withdrawal-config",
  )
}

export async function getMerchantUsdtWithdrawalRequests(): Promise<UsdtWithdrawalRequest[]> {
  return backendRequest<UsdtWithdrawalRequest[]>("/v1/crypto/usdt-withdrawals")
}

export async function createMerchantUsdtWithdrawalRequest(input: {
  amount: string
  destination: string
  pin: string
}): Promise<UsdtWithdrawalRequest> {
  return backendRequest<UsdtWithdrawalRequest>("/v1/crypto/usdt-withdrawals", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function getAdminUsdtWithdrawalRequests(): Promise<UsdtWithdrawalRequest[]> {
  return backendRequest<UsdtWithdrawalRequest[]>(
    "/v1/admin/crypto/usdt-withdrawals",
  )
}

export async function reviewAdminUsdtWithdrawalRequest(
  id: string,
  decision: "completed" | "rejected",
  input: { transactionId?: string; reason?: string },
): Promise<AdminActionResult<UsdtWithdrawalRequest>> {
  return submitAdminApprovalAction<UsdtWithdrawalRequest>(
    "crypto_withdrawal_decision",
    id,
    `/v1/admin/crypto/usdt-withdrawals/${encodeURIComponent(id)}/${decision}`,
    {
      transactionId: input.transactionId || "",
      reason: input.reason || "",
    },
  )
}

export async function getAdminInternalWallets(): Promise<AdminInternalWalletSummary[]> {
  return backendRequest<AdminInternalWalletSummary[]>(
    "/v1/admin/internal-wallets",
  )
}

export async function getAdminInternalWallet(
  email: string,
): Promise<AdminInternalWallet> {
  return backendRequest<AdminInternalWallet>(
    `/v1/admin/internal-wallets/${encodeURIComponent(email)}`,
  )
}

export async function getAdminMerchantWallet(
  email: string,
): Promise<AdminMerchantWallet> {
  return backendRequest<AdminMerchantWallet>(
    `/v1/admin/merchants/${encodeURIComponent(email)}/wallet`,
  )
}

export async function createAdminMerchantWalletAdjustment(
  email: string,
  input: { amount: number; reason: string },
): Promise<AdminActionResult<AdminMerchantWalletTransaction>> {
  return submitAdminApprovalAction<AdminMerchantWalletTransaction>(
    "merchant_wallet_adjustment",
    email.trim().toLowerCase(),
    `/v1/admin/merchants/${encodeURIComponent(email)}/wallet/adjustments`,
    input,
  )
}

export async function getAdminFloatingTransferRequests(): Promise<FloatingTransferRequest[]> {
  return backendRequest<FloatingTransferRequest[]>(
    "/v1/admin/floating-transfer-requests",
  )
}

export async function reviewAdminFloatingTransferRequest(
  id: string,
  decision: "successful" | "failed",
  input: {
    reason?: string
    payoutReference?: string
    payoutNote?: string
  } = {},
): Promise<AdminActionResult<FloatingTransferRequest>> {
  return submitAdminApprovalAction<FloatingTransferRequest>(
    "floating_transfer_decision",
    id,
    `/v1/admin/floating-transfer-requests/${encodeURIComponent(id)}/${decision}`,
    {
      reason: decision === "failed" ? input.reason || "" : "",
      payoutReference:
        decision === "successful" ? input.payoutReference || "" : "",
      payoutNote: decision === "successful" ? input.payoutNote || "" : "",
    },
  )
}

export async function createAdminInternalWalletAdjustment(
  email: string,
  input: { amount: number; reason: string },
): Promise<AdminActionResult<InternalWalletAdjustment>> {
  return submitAdminApprovalAction<InternalWalletAdjustment>(
    "internal_wallet_adjustment",
    email.trim().toLowerCase(),
    `/v1/admin/internal-wallets/${encodeURIComponent(email)}/adjustments`,
    input,
  )
}

export async function getMerchantPayoutAccount(): Promise<MerchantPayoutAccount> {
  return backendRequest<MerchantPayoutAccount>(
    "/v1/floating-balance/payout-account",
  )
}

export async function updateMerchantPayoutAccount(
  input: MerchantPayoutAccount,
): Promise<MerchantPayoutAccount> {
  return backendRequest<MerchantPayoutAccount>(
    "/v1/floating-balance/payout-account",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  )
}

export async function getMerchantFloatingTransferRequests(): Promise<FloatingTransferRequest[]> {
  return backendRequest<FloatingTransferRequest[]>(
    "/v1/floating-balance/transfer-requests",
  )
}

export async function getMerchantWebhookDeliveries(): Promise<WebhookDelivery[]> {
  return backendRequest<WebhookDelivery[]>("/v1/webhook/deliveries")
}

export async function retryMerchantWebhookDelivery(id: string): Promise<void> {
  await backendRequest<{ queued: true }>(
    `/v1/webhook/deliveries/${encodeURIComponent(id)}/retry`,
    {
      method: "POST",
    },
  )
}

export async function createMerchantFloatingTransferRequest(input: {
  amount: number
}): Promise<FloatingTransferRequest> {
  return backendRequest<FloatingTransferRequest>(
    "/v1/floating-balance/transfer-requests",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export async function createAdminMerchantAccount(input: {
  email: string
  businessName: string
  contactPerson: string
  businessAddress: string
  phoneNumber: string
}): Promise<AdminMerchantAccount> {
  return backendRequest<AdminMerchantAccount>("/v1/admin/merchants", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function sendAdminMerchantInvitation(
  email: string,
): Promise<{ email: string; invitationEmailStatus: "sent" }> {
  return backendRequest(
    `/v1/admin/merchants/${encodeURIComponent(email)}/invitation`,
    { method: "POST" },
  )
}

export async function sendAdminMerchantIntegrationGuide(
  email: string,
): Promise<{ email: string; integrationEmailStatus: "sent" }> {
  return backendRequest(
    `/v1/admin/merchants/${encodeURIComponent(email)}/integration-guide`,
    { method: "POST" },
  )
}

export async function updateAdminMerchantAccount(
  email: string,
  input: { active: boolean } | {
    email: string
    businessName: string
    contactPerson: string
    phoneNumber: string
    businessAddress: string
    bankName: string
    accountName: string
    accountNumber: string
  },
): Promise<
  AdminMerchantAccount & { activationEmailStatus?: "sent" | "failed" }
> {
  return backendRequest<
    AdminMerchantAccount & { activationEmailStatus?: "sent" | "failed" }
  >(
    `/v1/admin/merchants/${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  )
}

export async function getMerchantKyb(): Promise<{
  profile: KybProfile | null
  documents: KybDocument[]
}> {
  return backendRequest("/v1/kyb")
}

export async function saveMerchantKybProfile(
  input: Omit<
    KybProfile,
    "status" | "reviewNotes" | "updatedAt" | "kybConsentGiven"
  >,
  kybConsent: true,
) {
  return backendRequest<{ status: KybProfile["status"]; updatedAt: string }>(
    "/v1/kyb",
    {
      method: "PUT",
      body: JSON.stringify({ ...input, kybConsent }),
    },
  )
}

export async function uploadKybDocument(documentType: string, file: File) {
  const contentType = normalizeDocumentContentType(file)
  if (!contentType) {
    throw new Error("Upload a PDF, JPEG, or PNG document no larger than 10 MB.")
  }

  const signed = await backendRequest<{
    documentId: string
    uploadUrl: string
    objectKey: string
    fileName: string
    headers: Record<string, string>
  }>("/v1/kyb/documents/presign", {
    method: "POST",
    body: JSON.stringify({
      documentType,
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    }),
  })
  const upload = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: signed.headers,
    body: file,
  })
  if (!upload.ok)
    throw new Error(`Private document upload failed (${upload.status}).`)
  return backendRequest<{ uploaded: true; documentType: string }>(
    "/v1/kyb/documents/complete",
    {
      method: "POST",
      body: JSON.stringify({
        documentId: signed.documentId,
        objectKey: signed.objectKey,
        documentType,
        fileName: signed.fileName,
        contentType,
        sizeBytes: file.size,
      }),
    },
  )
}

export async function getMerchantApiKeys(): Promise<MerchantApiKey[]> {
  return backendRequest("/v1/api-keys")
}

export async function createMerchantApiKey(input: {
  name: string
  scopes: string[]
}): Promise<MerchantApiKey> {
  return backendRequest("/v1/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function revokeMerchantApiKey(id: string) {
  return backendRequest<{ revoked: true }>(
    `/v1/api-keys/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  )
}

export async function getMerchantWebhook(): Promise<MerchantWebhookSettings | null> {
  return backendRequest("/v1/webhook")
}

export async function saveMerchantWebhook(input: {
  endpointUrl: string
  callbackUrl: string
  events: string[]
}): Promise<MerchantWebhookSettings> {
  return backendRequest("/v1/webhook", {
    method: "PUT",
    body: JSON.stringify(input),
  })
}

export async function deleteMerchantWebhook() {
  return backendRequest<{ deleted: true }>("/v1/webhook", { method: "DELETE" })
}

export async function getAdminKybApplications(): Promise<AdminKybApplication[]> {
  return backendRequest("/v1/admin/kyb")
}

export async function reviewAdminKybApplication(
  email: string,
  input: {
    status: "IN_REVIEW" | "APPROVED" | "REJECTED"
    reviewNotes: string
  },
) {
  return backendRequest<{
    merchantEmail: string
    status: AdminKybApplication["status"]
    reviewNotes: string | null
    emailNotificationStatus?: "sent" | "failed"
  }>(`/v1/admin/kyb/${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export async function getAdminKybDocumentUrl(
  email: string,
  documentType: string,
) {
  return backendRequest<{ url: string; expiresInSeconds: number }>(
    `/v1/admin/kyb/${encodeURIComponent(email)}/documents/${encodeURIComponent(documentType)}/url`,
  )
}

export async function createTransfer(input: {
  amount: number
  channel: "INSTAPAY" | "PESONET"
  institutionCode: string
  accountNumber: string
  fullName: string
  remarks: string
  idempotencyKey: string
  stepUpToken: string
  refundPaymentId?: string
}): Promise<TransferResult> {
  return backendRequest<TransferResult>("/v1/disbursements", {
    method: "POST",
    headers: {
      "Idempotency-Key": input.idempotencyKey,
      "X-Step-Up-Token": input.stepUpToken,
    },
    body: JSON.stringify({
      amount: input.amount,
      channel: input.channel,
      institutionCode: input.institutionCode,
      accountNumber: input.accountNumber,
      fullName: input.fullName,
      remarks: input.remarks,
      refundPaymentId: input.refundPaymentId,
    }),
  })
}

export async function createPaymentLink(
  input: {
    amount: number
    description: string
    customerEmail?: string
    estimatedDeliveryDate?: string
    institution?: PaymentInstitution
    collectionAmountKrw?: number
    branding?: MerchantCheckoutPreferences
  },
  idempotencyKey: string = crypto.randomUUID(),
): Promise<PaymentLinkResult> {
  const result = await backendRequest<PaymentLinkResult>("/v1/payment-links", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      amount: input.amount,
      currency: "PHP",
      description: input.description,
      customerEmail: input.customerEmail?.trim() || undefined,
      estimatedDeliveryDate: input.estimatedDeliveryDate || undefined,
      collectionAmountKrw: input.collectionAmountKrw,
      referenceNo: `LINK-${Date.now()}`,
      institutionCode: input.institution?.code,
      institutionName: input.institution?.name,
      institutionLogoUrl: input.institution?.logoUrl,
      institutionDeepLink: input.institution?.deepLink,
      ...input.branding,
    }),
  })
  if (input.institution && result.id) {
    cacheCollectionInstitution(result.id, input.institution)
  }
  return result
}

export async function getPaymentLinkStatus(
  code: string,
): Promise<PaymentLinkResult> {
  return backendRequest<PaymentLinkResult>(
    `/v1/payment-links/${encodeURIComponent(code)}`,
  )
}

export async function getPublicCheckout(code: string): Promise<PublicCheckout> {
  return publicRequest<PublicCheckout>(
    `/v1/public/checkout/${encodeURIComponent(code)}`,
  )
}

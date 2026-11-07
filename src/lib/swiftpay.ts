export type Session = {
  accessToken: string
  expiresAt: number
  email: string
  role: "customer" | "merchant" | "super_admin"
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

export type PaymentLinkResult = {
  id?: string
  code: string
  paymentUrl: string
  qrCode?: string
  qrImageUrl?: string
  status?: string
  amount?: number
  currency?: string
  requestEmailStatus?: "queued" | "sent" | "no_customer_email" | "queue_failed"
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
  isTaxInvoice: boolean
  institutionCode?: string | null
  institutionName?: string | null
  institutionLogoUrl?: string | null
  institutionDeepLink?: string | null
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
  "https://drpay-merchant-production.up.railway.app"
const sandboxApiBaseUrl =
  import.meta.env.VITE_DRPAY_SANDBOX_BACKEND_URL || defaultApiBaseUrl

function getConfiguredApiBaseUrl() {
  const hostname =
    typeof window === "undefined" ? "" : window.location.hostname.toLowerCase()
  if (
    hostname === "pay.sandbox.denpay.cc" ||
    hostname === "merchant.sandbox.denpay.cc"
  )
    return sandboxApiBaseUrl
  if (
    hostname === "pay.live.denpay.cc" ||
    hostname === "merchant.denpay.cc" ||
    hostname === "live.merchant.swiftpay.site"
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
      session.role === "super_admin")
  )
}

export function getSession(): Session | null {
  const stored = sessionStorage.getItem(SESSION_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as unknown
    if (!isSession(parsed)) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function saveSession(session: Session) {
  if (!isSession(session)) {
    throw new Error("Invalid DRPAY session.")
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

function getDeviceToken(email: string) {
  const key = `${DEVICE_TOKEN_PREFIX}${email}`
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  localStorage.setItem(key, token)
  return token
}

export function hasTrustedDevice(email: string) {
  return localStorage.getItem(`${VERIFIED_DEVICE_PREFIX}${email}`) === "true"
}

export function getLastMerchantEmail() {
  return localStorage.getItem(LAST_MERCHANT_EMAIL_KEY) || ""
}

export function getPaymentLinkIdempotencyKey() {
  const existing = sessionStorage.getItem(PAYMENT_LINK_KEY)
  if (existing) return existing
  const key = crypto.randomUUID()
  sessionStorage.setItem(PAYMENT_LINK_KEY, key)
  return key
}

export function resetPaymentLinkIdempotencyKey() {
  sessionStorage.removeItem(PAYMENT_LINK_KEY)
  return getPaymentLinkIdempotencyKey()
}

export function clearPaymentLinkIdempotencyKey() {
  sessionStorage.removeItem(PAYMENT_LINK_KEY)
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
        "DRPAY is temporarily unavailable. Please try again in a few minutes.",
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
    "DRPAY is temporarily unavailable. Check your connection and try again.",
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
      "Live transactions are disabled because the DRPAY backend is not configured.",
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
      "Live transactions are disabled because the DRPAY backend is not configured.",
    )
  const session = getSession()
  if (!session) throw new ApiError("A verified DRPAY session is required", 401)
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

export async function login(email: string, password: string): Promise<Session> {
  const response = await publicRequest<{
    accessToken: string
    expiresInSeconds: number
    email?: string
    role?: Session["role"]
  }>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  const session: Session = {
    accessToken: response.accessToken,
    expiresAt: Date.now() + response.expiresInSeconds * 1000,
    email: response.email || email,
    role: response.role || "merchant",
  }
  saveSession(session)
  return session
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
  localStorage.setItem(LAST_MERCHANT_EMAIL_KEY, merchantEmail)
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
) {
  return publicRequest<{ email: string; status: "pending_review" }>(
    "/v1/auth/registration/submit",
    {
      method: "POST",
      body: JSON.stringify({ email, challengeId, ...details, pin }),
    },
  )
}

export async function uploadMerchantRegistrationDocument(
  challengeId: string,
  documentType: RegistrationDocumentType,
  file: File,
) {
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
      contentType: file.type,
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
        contentType: file.type,
        sizeBytes: file.size,
      }),
    },
  )
}

export async function verifyDeviceOtp(
  email: string,
  challengeId: string,
  code: string,
): Promise<Session> {
  const response = await publicRequest<{
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
  localStorage.setItem(`${VERIFIED_DEVICE_PREFIX}${email}`, "true")
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

export async function registerPushDevice(token: string) {
  return backendRequest<{ registered: true }>("/v1/notifications/push-token", {
    method: "POST",
    body: JSON.stringify({ token }),
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
    (item) => item.status === "Completed" && item.numericAmount > 0,
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

export async function getAdminAuditEvents(): Promise<AdminAuditEvent[]> {
  return backendRequest<AdminAuditEvent[]>("/v1/admin/audit")
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
): Promise<AdminPaymentLink> {
  return backendRequest<AdminPaymentLink>(
    `/v1/admin/payment-links/${encodeURIComponent(id)}/mark-paid`,
    {
      method: "POST",
      body: JSON.stringify({ verificationNote }),
    },
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
): Promise<{ activatedEmails: string[] }> {
  const activatedEmails: string[] = []
  for (let start = 0; start < emails.length; start += 100) {
    try {
      const result = await backendRequest<{ activatedEmails: string[] }>(
        "/v1/admin/merchants/activate",
        {
          method: "POST",
          body: JSON.stringify({ emails: emails.slice(start, start + 100) }),
        },
      )
      activatedEmails.push(...result.activatedEmails)
    } catch (error) {
      if (activatedEmails.length && error instanceof Error) {
        throw new Error(
          `Activation completed for ${activatedEmails.length} accounts before the next batch failed: ${error.message}`,
        )
      }
      throw error
    }
  }
  return { activatedEmails }
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
): Promise<UsdtWithdrawalRequest> {
  return backendRequest<UsdtWithdrawalRequest>(
    `/v1/admin/crypto/usdt-withdrawals/${encodeURIComponent(id)}/${decision}`,
    {
      method: "POST",
      body: JSON.stringify(input),
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
): Promise<AdminMerchantWalletTransaction> {
  return backendRequest<AdminMerchantWalletTransaction>(
    `/v1/admin/merchants/${encodeURIComponent(email)}/wallet/adjustments`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
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
): Promise<FloatingTransferRequest> {
  return backendRequest<FloatingTransferRequest>(
    `/v1/admin/floating-transfer-requests/${encodeURIComponent(id)}/${decision}`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export async function createAdminInternalWalletAdjustment(
  email: string,
  input: { amount: number; reason: string },
): Promise<InternalWalletAdjustment> {
  return backendRequest<InternalWalletAdjustment>(
    `/v1/admin/internal-wallets/${encodeURIComponent(email)}/adjustments`,
    { method: "POST", body: JSON.stringify(input) },
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
): Promise<AdminMerchantAccount> {
  return backendRequest<AdminMerchantAccount>(
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
  input: Omit<KybProfile, "status" | "reviewNotes" | "updatedAt">,
) {
  return backendRequest<{ status: KybProfile["status"]; updatedAt: string }>(
    "/v1/kyb",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  )
}

export async function uploadKybDocument(documentType: string, file: File) {
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
      contentType: file.type,
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
        contentType: file.type,
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

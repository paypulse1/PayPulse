export type Session = {
  accessToken: string;
  expiresAt: number;
  email: string;
  role: "customer" | "merchant" | "super_admin";
};

export type Transaction = {
  id: string;
  customer: string;
  email: string;
  initials: string;
  color: "lime" | "blue" | "peach" | "violet" | "mint";
  reference: string;
  channel: string;
  institutionCode?: string;
  institutionName?: string;
  institutionLogoUrl?: string;
  recipientName?: string;
  recipientAccountNumber?: string;
  remarks?: string;
  isRefund?: boolean;
  date: string;
  status: "Completed" | "Pending" | "Failed";
  rawStatus: string;
  amount: string;
  numericAmount: number;
  description: string;
  canRefund?: boolean;
  refundStatus?: string | null;
};

export type DashboardData = {
  availableBalance: string;
  balance: number;
  internalWalletBalance: string;
  cumulativeKrwCollections: number;
  floatingBalance: number;
  availableFloatingBalance: number;
  transferFeeFixed: number;
  grossVolume: string;
  successfulPayments: string;
  averageTransaction: string;
  accountNumber?: string;
  walletMode: "internal" | "pooled" | "customer";
  paymentEnvironment: "sandbox" | "production";
  transactions: Transaction[];
};

export type MerchantActivityTrendPoint = {
  date: string;
  collections: number;
  transfers: number;
};

export type QrPayment = {
  paymentId: string;
  referenceNo: string;
  status: string;
  amount: number;
  currency: string;
  qrImageBase64?: string;
  checkoutUrl?: string;
};

export type InstitutionBrand = {
  code: string;
  name: string;
  logoUrl?: string;
};

export type Institution = InstitutionBrand & {
  instapayEnabled: boolean;
  pesonetEnabled: boolean;
};

export type PaymentInstitution = InstitutionBrand & {
  category: string;
};

export type TransferResult = {
  id?: string;
  referenceNo?: string;
  status: string;
  outcomeUnknown?: boolean;
  message?: string;
};

export type MerchantSecurityStatus = {
  pinConfigured: boolean;
};

export type TransferAuthorizationInput = {
  amount: number;
  channel: "INSTAPAY" | "PESONET";
  institutionCode: string;
  accountNumber: string;
  fullName: string;
  remarks: string;
  idempotencyKey: string;
  refundPaymentId?: string;
};

export type CollectionRefundDetails = Pick<
  TransferAuthorizationInput,
  "amount" | "channel" | "institutionCode" | "accountNumber" | "fullName" | "remarks"
>;

export type PaymentLinkResult = {
  id?: string;
  code: string;
  paymentUrl: string;
  qrCode?: string;
  qrImageUrl?: string;
  status?: string;
  amount?: number;
  currency?: string;
};

export type PublicCheckout = {
  title: string;
  referenceNo: string;
  amount: number;
  currency: string;
  status: string;
  statusCheckUnavailable: boolean;
  qrCode: string;
};

export type CurrencyQuote = {
  baseCurrency: "KRW";
  quoteCurrency: "PHP";
  rate: number;
  date: string;
  updatedAt: string;
  source: string;
};

export type AdminSettings = {
  krwToPhpRate: number | null;
  usdtAddress: string;
  usdtNetwork: string;
  collectionFeePercent: number;
  transferFeeFixed: number;
  superAdminFeeWallet: number;
};

export type AdminMerchantAccount = {
  email: string;
  active: boolean;
  businessName: string;
  contactPerson: string;
  phoneNumber: string;
  businessAddress: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminInternalWalletSummary = {
  email: string;
  active: boolean;
  balance: number;
  lastAdjustedAt: string | null;
};

export type InternalWalletAdjustment = {
  id: string;
  amount: number;
  reason: string;
  adjustedBy: string;
  createdAt: string;
};

export type AdminInternalWallet = {
  merchantEmail: string;
  currency: "PHP";
  balance: number;
  availableBalance: number;
  adjustments: InternalWalletAdjustment[];
};

export type MerchantPayoutAccount = {
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export type FloatingTransferRequest = {
  id: string;
  merchantEmail?: string;
  amount: number;
  transferFee: number;
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  bankName: string;
  accountName: string;
  accountNumber: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy?: string | null;
  failureReason: string | null;
};

type WalletBalanceResponse = {
  balance: number;
  cumulativeKrwCollections: number;
  adjustedBalance?: number;
  accountNumber?: string;
  walletMode?: string;
  paymentEnvironment?: "sandbox" | "production";
};

type InternalWalletResponse = {
  currency: "PHP";
  balance: number;
  availableBalance: number;
  transferFeeFixed: number;
  label: string;
};

type WalletActivityResponse = {
  id: string;
  referenceNo: string;
  institutionCode?: string;
  institutionName?: string;
  institutionLogoUrl?: string;
  recipientName?: string;
  recipientAccountNumber?: string;
  remarks?: string;
  isRefund?: boolean;
  amount: number;
  status: string;
  channel: string;
  transactionType: string;
  description: string;
  createdAt: string;
  canRefund: boolean;
  refundStatus: string | null;
};

type CollectionInstitution = {
  code: string;
  name: string;
  logoUrl?: string;
};

function getCachedCollectionInstitution(id: string): CollectionInstitution | undefined {
  if (typeof localStorage === "undefined") return undefined;
  const serialized = localStorage.getItem(COLLECTION_INSTITUTION_CACHE_KEY);
  if (!serialized) return undefined;
  try {
    const entries: unknown = JSON.parse(serialized);
    if (!Array.isArray(entries)) return undefined;
    const match = entries.find((entry) =>
      entry && typeof entry === "object" && "id" in entry && entry.id === id,
    );
    if (!match || typeof match !== "object" || !("institution" in match)) return undefined;
    const institution = match.institution;
    if (!institution || typeof institution !== "object" || !("code" in institution) || !("name" in institution)) return undefined;
    if (typeof institution.code !== "string" || typeof institution.name !== "string") return undefined;
    return {
      code: institution.code,
      name: institution.name,
      logoUrl: "logoUrl" in institution && typeof institution.logoUrl === "string" ? institution.logoUrl : undefined,
    };
  } catch (error) {
    console.error("Could not read cached collection institution branding", error);
    return undefined;
  }
}

function cacheCollectionInstitution(id: string, institution: CollectionInstitution) {
  if (typeof localStorage === "undefined") return;
  try {
    const serialized = localStorage.getItem(COLLECTION_INSTITUTION_CACHE_KEY);
    const entries: unknown = serialized ? JSON.parse(serialized) : [];
    const validEntries = Array.isArray(entries)
      ? entries.filter((entry) => entry && typeof entry === "object" && "id" in entry && typeof entry.id === "string")
      : [];
    const nextEntries = [
      { id, institution },
      ...validEntries.filter((entry) => entry.id !== id),
    ].slice(0, 100);
    localStorage.setItem(COLLECTION_INSTITUTION_CACHE_KEY, JSON.stringify(nextEntries));
  } catch (error) {
    console.error("Could not cache collection institution branding for activity", error);
  }
}

const apiBaseUrl = import.meta.env.VITE_DRPAY_BACKEND_URL || "";
const SESSION_KEY = "drpay_session";
const PAYMENT_LINK_KEY = "drpay_pending_payment_link_key";
const COLLECTION_INSTITUTION_CACHE_KEY = "drpay_collection_institutions";
const DEVICE_TOKEN_PREFIX = "drpay_device_";
const VERIFIED_DEVICE_PREFIX = "drpay_verified_device_";
const LAST_MERCHANT_EMAIL_KEY = "drpay_last_merchant_email";

export function isBackendConfigured() {
  return Boolean(apiBaseUrl);
}

export function getSession(): Session | null {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored) as Session;
    if (session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function getDeviceToken(email: string) {
  const key = `${DEVICE_TOKEN_PREFIX}${email}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  localStorage.setItem(key, token);
  return token;
}

export function hasTrustedDevice(email: string) {
  return localStorage.getItem(`${VERIFIED_DEVICE_PREFIX}${email}`) === "true";
}

export function getLastMerchantEmail() {
  return localStorage.getItem(LAST_MERCHANT_EMAIL_KEY) || "";
}

export function getPaymentLinkIdempotencyKey() {
  const existing = sessionStorage.getItem(PAYMENT_LINK_KEY);
  if (existing) return existing;
  const key = crypto.randomUUID();
  sessionStorage.setItem(PAYMENT_LINK_KEY, key);
  return key;
}

export function resetPaymentLinkIdempotencyKey() {
  sessionStorage.removeItem(PAYMENT_LINK_KEY);
  return getPaymentLinkIdempotencyKey();
}

export function clearPaymentLinkIdempotencyKey() {
  sessionStorage.removeItem(PAYMENT_LINK_KEY);
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (response.status === 401) clearSession();
  throw new Error(body.error || (response.status === 401 ? "Your session has expired. Sign in again." : `Request failed (${response.status})`));
}

async function publicRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error("Live transactions are disabled because the DRPAY backend is not configured.");
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  return parseResponse<T>(response);
}

async function backendRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error("Live transactions are disabled because the DRPAY backend is not configured.");
  const session = getSession();
  if (!session) throw new Error("A verified DRPAY session is required");
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      ...options?.headers,
    },
  });
  return parseResponse<T>(response);
}

export async function login(email: string, password: string): Promise<Session> {
  const response = await publicRequest<{
    accessToken: string;
    expiresInSeconds: number;
    email?: string;
    role?: Session["role"];
  }>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const session: Session = {
    accessToken: response.accessToken,
    expiresAt: Date.now() + response.expiresInSeconds * 1000,
    email: response.email || email,
    role: response.role || "merchant",
  };
  saveSession(session);
  return session;
}

function saveMerchantSession(email: string, response: { accessToken: string; expiresInSeconds: number; email?: string; role?: Session["role"] }) {
  const merchantEmail = (response.email || email).trim().toLowerCase();
  const session: Session = {
    accessToken: response.accessToken,
    expiresAt: Date.now() + response.expiresInSeconds * 1000,
    email: merchantEmail,
    role: response.role || "merchant",
  };
  saveSession(session);
  localStorage.setItem(LAST_MERCHANT_EMAIL_KEY, merchantEmail);
  return session;
}

export async function requestDeviceOtp(email: string) {
  return publicRequest<{ challengeId: string; message: string }>("/v1/auth/device/otp/request", {
    method: "POST",
    body: JSON.stringify({ email, deviceToken: getDeviceToken(email) }),
  });
}

export async function verifyDeviceOtp(email: string, challengeId: string, code: string): Promise<Session> {
  const response = await publicRequest<{ accessToken: string; expiresInSeconds: number; email?: string; role?: Session["role"] }>("/v1/auth/device/otp/verify", {
    method: "POST",
    body: JSON.stringify({ email, challengeId, code, deviceToken: getDeviceToken(email) }),
  });
  localStorage.setItem(`${VERIFIED_DEVICE_PREFIX}${email}`, "true");
  return saveMerchantSession(email, response);
}

export async function loginWithPin(email: string, pin: string): Promise<Session> {
  const response = await publicRequest<{ accessToken: string; expiresInSeconds: number; email?: string; role?: Session["role"] }>("/v1/auth/device/pin", {
    method: "POST",
    body: JSON.stringify({ email, pin, deviceToken: getDeviceToken(email) }),
  });
  return saveMerchantSession(email, response);
}

export async function loginWithBiometric(email: string, secret: string): Promise<Session> {
  const response = await publicRequest<{ accessToken: string; expiresInSeconds: number; email?: string; role?: Session["role"] }>("/v1/auth/device/biometric", {
    method: "POST",
    body: JSON.stringify({ email, secret, deviceToken: getDeviceToken(email) }),
  });
  return saveMerchantSession(email, response);
}

export async function registerBiometricCredential(secret: string) {
  const session = getSession();
  if (!session) throw new Error("Sign in before enabling biometric access.");
  return backendRequest<{ enabled: true }>("/v1/security/biometric", {
    method: "POST",
    body: JSON.stringify({ secret, deviceToken: getDeviceToken(session.email) }),
  });
}

export async function removeBiometricCredential() {
  const session = getSession();
  if (!session) throw new Error("Sign in before disabling biometric access.");
  return backendRequest<{ enabled: false }>("/v1/security/biometric/remove", {
    method: "POST",
    body: JSON.stringify({ deviceToken: getDeviceToken(session.email) }),
  });
}

export function getMerchantSecurityStatus() {
  return backendRequest<MerchantSecurityStatus>("/v1/security/status");
}

export async function getMerchantActivityTrend(): Promise<MerchantActivityTrendPoint[]> {
  return backendRequest<MerchantActivityTrendPoint[]>("/v1/wallet/activity/trend");
}

export async function registerPushDevice(token: string) {
  return backendRequest<{ registered: true }>("/v1/notifications/push-token", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function removePushDevice(token: string) {
  return backendRequest<{ removed: true }>("/v1/notifications/push-token/remove", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function setMerchantPin(pin: string) {
  return backendRequest<{ pinConfigured: true }>("/v1/security/pin", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export async function authorizeTransferWithPin(input: TransferAuthorizationInput, pin: string) {
  return backendRequest<{ stepUpToken: string }>("/v1/security/transfer/pin", {
    method: "POST",
    body: JSON.stringify({ ...input, pin }),
  });
}

export async function getCollectionRefundDetails(paymentId: string): Promise<CollectionRefundDetails> {
  return backendRequest<CollectionRefundDetails>(`/v1/payment-links/${encodeURIComponent(paymentId)}/refund-details`);
}

function formatMoney(amount: number, showSign = false) {
  const sign = amount < 0 ? "−" : showSign ? "+" : "";
  return `${sign}₱${Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toStatus(status: string): Transaction["status"] {
  const normalized = status.toUpperCase();
  if (["EXECUTED", "SUCCESS", "COMPLETED", "PAID"].includes(normalized)) return "Completed";
  if (["FAILED", "ERROR", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED", "REVERSED"].includes(normalized)) return "Failed";
  return "Pending";
}

function toTransaction(item: WalletActivityResponse, index: number): Transaction {
  const isCredit = item.amount >= 0;
  const type = item.transactionType.toUpperCase();
  const cachedInstitution = type.includes("PAYMENT") ? getCachedCollectionInstitution(item.id) : undefined;
  return {
    id: item.id,
    customer: type.includes("DISBURSEMENT")
      ? item.institutionName || item.description || "Bank transfer"
      : item.description || (isCredit ? "Payment link collection" : "Bank transfer"),
    email: isCredit ? "Money received" : "Money sent",
    initials: type.includes("DISBURSEMENT") ? "TX" : type.includes("DEPOSIT") ? "DP" : item.channel === "QR Ph checkout" ? "QR" : "PL",
    color: ["lime", "blue", "peach", "violet", "mint"][index % 5] as Transaction["color"],
    reference: item.referenceNo,
    channel: type.includes("DISBURSEMENT") ? item.channel : type.includes("DEPOSIT") ? "Bank" : item.channel,
    institutionCode: item.institutionCode || cachedInstitution?.code,
    institutionName: item.institutionName || cachedInstitution?.name,
    institutionLogoUrl: item.institutionLogoUrl || cachedInstitution?.logoUrl,
    recipientName: item.recipientName,
    recipientAccountNumber: item.recipientAccountNumber,
    remarks: item.remarks,
    isRefund: item.isRefund,
    date: new Date(item.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    status: toStatus(item.status),
    rawStatus: item.status,
    amount: formatMoney(item.amount, true),
    numericAmount: item.amount,
    description: item.description,
    canRefund: item.canRefund,
    refundStatus: item.refundStatus,
  };
}

export async function getMerchantDashboard(): Promise<DashboardData> {
  const [wallet, activity, internalWallet] = await Promise.all([
    backendRequest<WalletBalanceResponse>("/v1/wallet/balance"),
    backendRequest<WalletActivityResponse[]>("/v1/wallet/activity?limit=50&offset=0"),
    backendRequest<InternalWalletResponse>("/v1/internal-wallet"),
  ]);
  const transactions = activity.map(toTransaction);
  const settledCredits = transactions.filter((item) => item.status === "Completed" && item.numericAmount > 0);
  const volume = settledCredits.reduce((sum, item) => sum + item.numericAmount, 0);
  return {
    availableBalance: formatMoney(wallet.adjustedBalance ?? wallet.balance),
    balance: wallet.adjustedBalance ?? wallet.balance,
    internalWalletBalance: formatMoney(internalWallet.balance),
    cumulativeKrwCollections: wallet.cumulativeKrwCollections,
    floatingBalance: internalWallet.balance,
    availableFloatingBalance: internalWallet.availableBalance,
    transferFeeFixed: internalWallet.transferFeeFixed,
    grossVolume: formatMoney(volume),
    successfulPayments: String(settledCredits.length),
    averageTransaction: formatMoney(settledCredits.length ? volume / settledCredits.length : 0),
    accountNumber: wallet.accountNumber,
    walletMode: wallet.walletMode === "pooled" ? "pooled" : "internal",
    paymentEnvironment: wallet.paymentEnvironment === "production" ? "production" : "sandbox",
    transactions,
  };
}

export async function getInstitutions(): Promise<Institution[]> {
  return backendRequest<Institution[]>("/v1/disbursement-institutions");
}

export async function getPaymentInstitutions(): Promise<PaymentInstitution[]> {
  return backendRequest<PaymentInstitution[]>("/v1/payment-institutions");
}

export async function getKrwPhpQuote(): Promise<CurrencyQuote> {
  return backendRequest<CurrencyQuote>("/v1/exchange-rates/krw-php");
}

export async function getAdminSettings(): Promise<AdminSettings> {
  return backendRequest<AdminSettings>("/v1/admin/settings");
}

export async function updateAdminSettings(settings: AdminSettings): Promise<AdminSettings> {
  return backendRequest<AdminSettings>("/v1/admin/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getAdminMerchantAccounts(): Promise<AdminMerchantAccount[]> {
  return backendRequest<AdminMerchantAccount[]>("/v1/admin/merchants");
}

export async function getAdminInternalWallets(): Promise<AdminInternalWalletSummary[]> {
  return backendRequest<AdminInternalWalletSummary[]>("/v1/admin/internal-wallets");
}

export async function getAdminInternalWallet(email: string): Promise<AdminInternalWallet> {
  return backendRequest<AdminInternalWallet>(`/v1/admin/internal-wallets/${encodeURIComponent(email)}`);
}

export async function getAdminFloatingTransferRequests(): Promise<FloatingTransferRequest[]> {
  return backendRequest<FloatingTransferRequest[]>("/v1/admin/floating-transfer-requests");
}

export async function reviewAdminFloatingTransferRequest(
  id: string,
  decision: "successful" | "failed",
  reason?: string,
): Promise<FloatingTransferRequest> {
  return backendRequest<FloatingTransferRequest>(`/v1/admin/floating-transfer-requests/${encodeURIComponent(id)}/${decision}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function createAdminInternalWalletAdjustment(
  email: string,
  input: { amount: number; reason: string },
): Promise<InternalWalletAdjustment> {
  return backendRequest<InternalWalletAdjustment>(
    `/v1/admin/internal-wallets/${encodeURIComponent(email)}/adjustments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function getMerchantPayoutAccount(): Promise<MerchantPayoutAccount> {
  return backendRequest<MerchantPayoutAccount>("/v1/floating-balance/payout-account");
}

export async function updateMerchantPayoutAccount(input: MerchantPayoutAccount): Promise<MerchantPayoutAccount> {
  return backendRequest<MerchantPayoutAccount>("/v1/floating-balance/payout-account", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function getMerchantFloatingTransferRequests(): Promise<FloatingTransferRequest[]> {
  return backendRequest<FloatingTransferRequest[]>("/v1/floating-balance/transfer-requests");
}

export async function createMerchantFloatingTransferRequest(input: { amount: number }): Promise<FloatingTransferRequest> {
  return backendRequest<FloatingTransferRequest>("/v1/floating-balance/transfer-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createAdminMerchantAccount(input: { email: string }): Promise<AdminMerchantAccount> {
  return backendRequest<AdminMerchantAccount>("/v1/admin/merchants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminMerchantAccount(
  email: string,
  input: { active: boolean } | {
    email: string;
    businessName: string;
    contactPerson: string;
    phoneNumber: string;
    businessAddress: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
  },
): Promise<AdminMerchantAccount> {
  return backendRequest<AdminMerchantAccount>(`/v1/admin/merchants/${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createTransfer(input: {
  amount: number;
  channel: "INSTAPAY" | "PESONET";
  institutionCode: string;
  accountNumber: string;
  fullName: string;
  remarks: string;
  idempotencyKey: string;
  stepUpToken: string;
  refundPaymentId?: string;
}): Promise<TransferResult> {
  return backendRequest<TransferResult>("/v1/disbursements", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey, "X-Step-Up-Token": input.stepUpToken },
    body: JSON.stringify({
      amount: input.amount,
      channel: input.channel,
      institutionCode: input.institutionCode,
      accountNumber: input.accountNumber,
      fullName: input.fullName,
      remarks: input.remarks,
      refundPaymentId: input.refundPaymentId,
    }),
  });
}

export async function createPaymentLink(
  input: { amount: number; description: string; customerEmail?: string; institution?: PaymentInstitution; collectionAmountKrw?: number },
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
    }),
  });
  if (input.institution && result.id) {
    cacheCollectionInstitution(result.id, input.institution);
  }
  return result;
}

export async function getPaymentLinkStatus(code: string): Promise<PaymentLinkResult> {
  return backendRequest<PaymentLinkResult>(`/v1/payment-links/${encodeURIComponent(code)}`);
}

export async function getPublicCheckout(code: string): Promise<PublicCheckout> {
  return publicRequest<PublicCheckout>(`/v1/public/checkout/${encodeURIComponent(code)}`);
}

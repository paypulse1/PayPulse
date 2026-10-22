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
  date: string;
  status: "Paid" | "Pending" | "Failed";
  rawStatus: string;
  amount: string;
  numericAmount: number;
  description: string;
};

export type DashboardData = {
  availableBalance: string;
  balance: number;
  internalWalletBalance: string;
  grossVolume: string;
  successfulPayments: string;
  averageTransaction: string;
  accountNumber?: string;
  walletMode: "internal" | "pooled" | "customer";
  paymentEnvironment: "sandbox" | "production";
  transactions: Transaction[];
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
};

export type AdminMerchantAccount = {
  email: string;
  active: boolean;
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
  transferable: false;
  adjustments: InternalWalletAdjustment[];
};

type WalletBalanceResponse = {
  balance: number;
  adjustedBalance?: number;
  accountNumber?: string;
  walletMode?: string;
  paymentEnvironment?: "sandbox" | "production";
};

type InternalWalletResponse = {
  currency: "PHP";
  balance: number;
  transferable: false;
  label: string;
};

type WalletActivityResponse = {
  id: string;
  referenceNo: string;
  amount: number;
  status: string;
  channel: string;
  transactionType: string;
  description: string;
  createdAt: string;
};

const apiBaseUrl = import.meta.env.VITE_DRPAY_BACKEND_URL || "";
const SESSION_KEY = "drpay_session";
const PAYMENT_LINK_KEY = "drpay_pending_payment_link_key";

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
  throw new Error(
    response.status === 401
      ? "Your session has expired. Sign in again."
      : body.error || `Request failed (${response.status})`,
  );
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

function formatMoney(amount: number, showSign = false) {
  const sign = amount < 0 ? "−" : showSign ? "+" : "";
  return `${sign}₱${Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toStatus(status: string): Transaction["status"] {
  const normalized = status.toUpperCase();
  if (["EXECUTED", "SUCCESS", "COMPLETED", "PAID"].includes(normalized)) return "Paid";
  if (["FAILED", "ERROR", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED", "REVERSED"].includes(normalized)) return "Failed";
  return "Pending";
}

function toTransaction(item: WalletActivityResponse, index: number): Transaction {
  const isCredit = item.amount >= 0;
  const type = item.transactionType.toUpperCase();
  return {
    id: item.id,
    customer: item.description || (isCredit ? "Payment link collection" : "Bank transfer"),
    email: isCredit ? "Money received" : "Money sent",
    initials: type.includes("DISBURSEMENT") ? "TX" : type.includes("DEPOSIT") ? "DP" : item.channel === "QR Ph checkout" ? "QR" : "PL",
    color: ["lime", "blue", "peach", "violet", "mint"][index % 5] as Transaction["color"],
    reference: item.referenceNo,
    channel: type.includes("DISBURSEMENT") ? item.channel : type.includes("DEPOSIT") ? "Bank" : item.channel,
    date: new Date(item.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    status: toStatus(item.status),
    rawStatus: item.status,
    amount: formatMoney(item.amount, true),
    numericAmount: item.amount,
    description: item.description,
  };
}

export async function getMerchantDashboard(): Promise<DashboardData> {
  const [wallet, activity, internalWallet] = await Promise.all([
    backendRequest<WalletBalanceResponse>("/v1/wallet/balance"),
    backendRequest<WalletActivityResponse[]>("/v1/wallet/activity?limit=50&offset=0"),
    backendRequest<InternalWalletResponse>("/v1/internal-wallet"),
  ]);
  const transactions = activity.map(toTransaction);
  const settledCredits = transactions.filter((item) => item.status === "Paid" && item.numericAmount > 0);
  const volume = settledCredits.reduce((sum, item) => sum + item.numericAmount, 0);
  return {
    availableBalance: formatMoney(wallet.adjustedBalance ?? wallet.balance),
    balance: wallet.adjustedBalance ?? wallet.balance,
    internalWalletBalance: formatMoney(internalWallet.balance),
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

export async function createAdminInternalWalletAdjustment(
  email: string,
  input: { amount: number; reason: string },
): Promise<InternalWalletAdjustment> {
  return backendRequest<InternalWalletAdjustment>(
    `/v1/admin/internal-wallets/${encodeURIComponent(email)}/adjustments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function createAdminMerchantAccount(input: { email: string; password: string }): Promise<AdminMerchantAccount> {
  return backendRequest<AdminMerchantAccount>("/v1/admin/merchants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminMerchantAccount(
  email: string,
  input: { active?: boolean; password?: string },
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
}): Promise<TransferResult> {
  return backendRequest<TransferResult>("/v1/disbursements", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      amount: input.amount,
      channel: input.channel,
      institutionCode: input.institutionCode,
      accountNumber: input.accountNumber,
      fullName: input.fullName,
      remarks: input.remarks,
    }),
  });
}

export async function createPaymentLink(
  input: { amount: number; description: string },
  idempotencyKey: string = crypto.randomUUID(),
): Promise<PaymentLinkResult> {
  return backendRequest<PaymentLinkResult>("/v1/payment-links", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ amount: input.amount, currency: "PHP", description: input.description, referenceNo: `LINK-${Date.now()}` }),
  });
}

export async function getPaymentLinkStatus(code: string): Promise<PaymentLinkResult> {
  return backendRequest<PaymentLinkResult>(`/v1/payment-links/${encodeURIComponent(code)}`);
}

export async function getPublicCheckout(code: string): Promise<PublicCheckout> {
  return publicRequest<PublicCheckout>(`/v1/public/checkout/${encodeURIComponent(code)}`);
}

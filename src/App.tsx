import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Download,
  Eye,
  Fingerprint,
  Home,
  KeyRound,
  Link2,
  LoaderCircle,
  Lock,
  LogOut,
  MoreHorizontal,
  Plus,
  QrCode,
  RefreshCw,
  ReceiptText,
  Search,
  Share2,
  Send,
  Settings,
  ShieldCheck,
  Store,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  clearSession,
  authorizeTransferWithPin,
  createPaymentLink,
  getCollectionRefundDetails,
  createAdminMerchantAccount,
  createTransfer,
  clearPaymentLinkIdempotencyKey,
  createAdminInternalWalletAdjustment,
  getInstitutions,
  getKrwPhpQuote,
  getAdminInternalWallet,
  getAdminFloatingTransferRequests,
  getAdminInternalWallets,
  getAdminMerchantAccounts,
  getAdminSettings,
  getMerchantActivityTrend,
  getMerchantDashboard,
  createMerchantFloatingTransferRequest,
  getMerchantPayoutAccount,
  getMerchantSecurityStatus,
  getPaymentLinkIdempotencyKey,
  getPaymentLinkStatus,
  getSession,
  getLastMerchantEmail,
  loginWithBiometric,
  hasTrustedDevice,
  isBackendConfigured,
  login,
  loginWithPin,
  registerPushDevice,
  registerBiometricCredential,
  removeBiometricCredential,
  removePushDevice,
  requestDeviceOtp,
  resetPaymentLinkIdempotencyKey,
  setMerchantPin,
  verifyDeviceOtp,
  updateAdminMerchantAccount,
  updateAdminSettings,
  reviewAdminFloatingTransferRequest,
  type AdminMerchantAccount,
  type AdminInternalWallet,
  type AdminInternalWalletSummary,
  type FloatingTransferRequest,
  type AdminSettings,
  type CollectionRefundDetails,
  type DashboardData,
  type MerchantActivityTrendPoint,
  type MerchantPayoutAccount,
  type MerchantSecurityStatus,
  type CurrencyQuote,
  type Institution,
  type PaymentInstitution,
  type PaymentLinkResult,
  type Session,
  type Transaction,
  type TransferResult,
  type TransferAuthorizationInput,
} from "./lib/swiftpay";
import type { MerchantQrDetails, TransferQrDetails } from "./lib/transferQr";
import { parseScannedQr } from "./lib/transferQr";
import {
  createBiometricSecret,
  deleteBiometricSecret,
  hasBiometricLogin,
  isBiometricLoginAvailable,
  markBiometricLoginDisabled,
  markBiometricLoginEnabled,
  markBiometricOfferDismissed,
  readBiometricSecret,
  storeBiometricSecret,
  supportsBiometricLogin,
  wasBiometricOfferDismissed,
} from "./lib/biometric";
import Checkout from "./Checkout";
import MarketingHome from "./MarketingHome";
import LegalPage, { getLegalPage } from "./LegalPages";
import QrPaymentDisplay, { InstitutionLogo } from "./QrPaymentDisplay";
import InstitutionSelectionScreen from "./InstitutionSelectionScreen";

function isTerminalPaymentStatus(status: string) {
  return ["PAID", "EXECUTED", "INACTIVE", "CANCELED", "REJECTED", "EXPIRED", "FAILED"].includes(status.toUpperCase());
}

function isConfirmedPaymentStatus(status: string) {
  return ["PAID", "EXECUTED"].includes(status.toUpperCase());
}

function isQrNotFoundError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "NotFoundException"
    || /no (?:multi.?format )?readers? (?:were )?able to detect/i.test(error.message);
}

function compareAppVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function UpdateAvailablePrompt({ version, downloadUrl, onDismiss }: {
  version: string;
  downloadUrl: string;
  onDismiss: () => void;
}) {
  const [error, setError] = useState("");

  async function openDownload() {
    setError("");
    try {
      await Browser.open({ url: downloadUrl });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Could not open the APK download.");
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="payment-sheet" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div><span className="eyebrow">APP UPDATE</span><h2 id="app-update-title">DRPAY {version} is ready</h2></div>
          <IconButton label="Remind me later" onClick={onDismiss}><X size={19} /></IconButton>
        </header>
        <p className="profile-info-note">Download the latest version to get improvements and fixes. Android will ask you to confirm installation; the update will not install silently.</p>
        {error && <div className="inline-error" role="alert"><AlertCircle size={15} />{error}</div>}
        <Button icon={<Download size={16} />} onClick={() => void openDownload()}>Download update</Button>
        <Button variant="secondary" onClick={onDismiss}>Remind me later</Button>
      </section>
    </div>
  );
}

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function useBalanceVisibility() {
  const email = getSession()?.email.toLowerCase() || "default";
  const storageKey = `drpay.balance-visibility.${encodeURIComponent(email)}`;
  const [preference, setPreference] = useState(() => ({
    storageKey,
    visible: localStorage.getItem(storageKey) !== "hidden",
  }));
  const balanceVisible =
    preference.storageKey === storageKey
      ? preference.visible
      : localStorage.getItem(storageKey) !== "hidden";

  useEffect(() => {
    setPreference({
      storageKey,
      visible: localStorage.getItem(storageKey) !== "hidden",
    });
  }, [storageKey]);

  const toggleBalanceVisibility = useCallback(() => {
    const visible = !balanceVisible;
    localStorage.setItem(storageKey, visible ? "visible" : "hidden");
    setPreference({ storageKey, visible });
  }, [balanceVisible, storageKey]);

  return { balanceVisible, toggleBalanceVisibility };
}

type ButtonProps = {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "quiet";
  disabled?: boolean;
};

function Button({
  children,
  className = "",
  icon,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}

function IconButton({
  children,
  label,
  onClick,
  dark = false,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  dark?: boolean;
}) {
  return (
    <button
      className={`icon-button ${dark ? "icon-button-dark" : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="DRPAY">
      <span className="brand-mark">
        <img src="/drpay-mark.png" alt="" />
      </span>
      <strong>DRPAY</strong>
    </div>
  );
}

function PoweredByFooter() {
  return (
    <footer className="auth-powered-by">
      <span>POWERED BY</span>
      <span className="auth-powered-by-signature" role="img" aria-label="DRPAY signature" />
    </footer>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span>{icon}</span>
      <strong>{label}</strong>
    </button>
  );
}

function StatusBadge({ status }: { status: Transaction["status"] }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <i />
      {status}
    </span>
  );
}

function DashboardLoading() {
  return (
    <main className="dashboard-loading-screen" role="status" aria-label="Loading merchant dashboard">
      <div className="dashboard-loading-brand"><Brand /><span className="loading-indicator" /></div>
      <div className="dashboard-loading-content" aria-hidden="true">
        <div className="loading-skeleton loading-balance">
          <span />
          <strong />
          <span />
        </div>
        <div className="loading-actions">
          {[0, 1, 2, 3].map((item) => <span className="loading-skeleton" key={item} />)}
        </div>
        <div className="loading-skeleton loading-summary">
          <span />
          <strong />
          <span />
          <span />
        </div>
      </div>
      <span className="dashboard-loading-label">Loading your merchant workspace…</span>
    </main>
  );
}

function TransactionRow({ transaction, onClick }: { transaction: Transaction; onClick?: () => void }) {
  return (
    <button className="transaction-row" onClick={onClick}>
      {transaction.institutionCode
        ? <InstitutionLogo
            institution={{
              code: transaction.institutionCode,
              name: transaction.institutionName || transaction.customer,
              logoUrl: transaction.institutionLogoUrl,
            }}
            className="transaction-institution-logo"
          />
        : <span className={`transaction-avatar avatar-${transaction.color}`}>
            {transaction.channel === "QR Ph checkout" ? <QrCode size={18} aria-hidden="true" /> : transaction.initials}
          </span>}
      <span className="transaction-copy">
        <strong>{transaction.customer}</strong>
        <small>{transaction.channel} · {transaction.date.split(",")[0]}</small>
      </span>
      <span className="transaction-value">
        <strong>{transaction.amount}</strong>
        <StatusBadge status={transaction.status} />
      </span>
      <ChevronRight size={16} />
    </button>
  );
}

function SignIn({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [email, setEmail] = useState(() => getLastMerchantEmail());
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [stage, setStage] = useState<"email" | "pin" | "otp">(() => hasTrustedDevice(getLastMerchantEmail()) ? "pin" : "email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendOtp() {
    const normalizedEmail = email.trim().toLowerCase();
    setBusy(true);
    setError("");
    try {
      const response = await requestDeviceOtp(normalizedEmail);
      setChallengeId(response.challengeId);
      setStage("otp");
      setOtp("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send a verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onAuthenticated(await loginWithPin(email.trim().toLowerCase(), pin));
    } catch (requestError) {
      setPin("");
      setError(requestError instanceof Error ? requestError.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitBiometric() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setBusy(true);
    setError("");
    try {
      const secret = await readBiometricSecret(normalizedEmail);
      onAuthenticated(await loginWithBiometric(normalizedEmail, secret));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Biometric sign-in failed. Use your MPIN or verify this device by email.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onAuthenticated(await verifyDeviceOtp(email.trim().toLowerCase(), challengeId, otp));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Device verification failed.");
    } finally {
      setBusy(false);
    }
  }

  function continueWithEmail(event: FormEvent) {
    event.preventDefault();
    if (hasTrustedDevice(email.trim().toLowerCase())) setStage("pin");
    else void sendOtp();
  }

  return (
    <main className="auth-screen auth-screen-with-footer">
      <div className="auth-brand"><Brand /></div>
      <section className="auth-card">
        <span className="eyebrow">MERCHANT ACCESS</span>
        <h1>Welcome to DRPAY</h1>
        <p>{stage === "otp" ? "Enter the six-digit code sent to your merchant email to verify this device." : stage === "pin" ? "Enter your MPIN on this verified device." : "Use your MPIN on a verified device, or verify a new device by email."}</p>
        {stage === "email" && <form onSubmit={continueWithEmail}>
          <label>
            <span>Merchant email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="merchant@company.ph" required autoComplete="username" autoFocus />
          </label>
          {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
          <Button type="submit" disabled={busy || !email} icon={busy ? <LoaderCircle className="spin" size={17} /> : <Lock size={17} />}>
            {busy ? "Continuing…" : hasTrustedDevice(email.trim().toLowerCase()) ? "Continue with MPIN" : "Verify device by email"}
          </Button>
          {supportsBiometricLogin() && email.trim() && hasBiometricLogin(email) && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void submitBiometric()} icon={<Fingerprint size={17} />}>
              Sign in with biometrics
            </Button>
          )}
        </form>}
        {stage === "pin" && <form onSubmit={(event) => void submitPin(event)}>
          <label><span>Merchant email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></label>
          <label><span>Four-digit MPIN</span><input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="one-time-code" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} required autoFocus aria-describedby={error ? "signin-error" : undefined} /></label>
          {error && <div className="inline-error" id="signin-error" role="alert"><AlertCircle size={15} />{error}</div>}
          <Button type="submit" disabled={busy || pin.length !== 4} icon={busy ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}>{busy ? "Signing in…" : "Sign in with MPIN"}</Button>
          {supportsBiometricLogin() && hasBiometricLogin(email) && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void submitBiometric()} icon={<Fingerprint size={17} />}>Use biometrics instead</Button>
          )}
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void sendOtp()}>Forgot MPIN? Verify with email code</Button>
          <button type="button" className="authorization-back" disabled={busy} onClick={() => { setStage("email"); setEmail(""); setPin(""); setError(""); }}>Use a different email</button>
        </form>}
        {stage === "otp" && <form onSubmit={(event) => void submitOtp(event)}>
          <label><span>Merchant email</span><input type="email" value={email} readOnly /></label>
          <label><span>Six-digit email code</span><input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label>
          {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
          <Button type="submit" disabled={busy || otp.length !== 6} icon={busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}>{busy ? "Verifying…" : "Verify device"}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void sendOtp()}>Send a new code</Button>
          <button type="button" className="authorization-back" disabled={busy} onClick={() => { setStage("email"); setOtp(""); setError(""); }}>Back</button>
        </form>}
        <div className="auth-trust"><ShieldCheck size={16} /><span>New devices require an email code. Previously verified devices use your MPIN or optional biometric sign-in. Sessions expire automatically after eight hours.</span></div>
      </section>
      <PoweredByFooter />
    </main>
  );
}

function SecuritySetupScreen({
  initialStatus,
  onComplete,
  onSignOut,
}: {
  initialStatus: MerchantSecurityStatus;
  onComplete: (status: MerchantSecurityStatus) => void;
  onSignOut: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function savePin(event: FormEvent) {
    event.preventDefault();
    if (pin !== confirmPin) {
      setError("The MPINs do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setMerchantPin(pin);
      const nextStatus = { ...status, pinConfigured: true };
      setStatus(nextStatus);
      setPin("");
      setConfirmPin("");
      onComplete(nextStatus);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your MPIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand"><Brand /></div>
      <section className="auth-card security-setup-card">
        <span className="auth-mark"><ShieldCheck size={26} /></span>
        <span className="eyebrow">SECURE YOUR ACCOUNT</span>
        <h1>Set up your MPIN</h1>
        <p>Create a four-digit MPIN for future sign-ins on this verified device and to approve every transfer.</p>
        {!status.pinConfigured ? (
          <form onSubmit={(event) => void savePin(event)}>
            <label><span>Four-digit MPIN</span><input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} required /></label>
            <label>
              <span>Confirm MPIN</span>
              <input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} required />
            </label>
            {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
            <Button type="submit" disabled={busy || pin.length !== 4 || confirmPin.length !== 4} icon={busy ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}>
              {busy ? "Saving MPIN…" : "Save MPIN"}
            </Button>
          </form>
        ) : (
          <div className="security-setup-complete"><ShieldCheck size={16} /> MPIN is set</div>
        )}
        {error && status.pinConfigured && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
        <div className="auth-trust"><Lock size={15} /><span>Your MPIN is hashed on the backend and is required for future sign-ins and transfers.</span></div>
        <Button type="button" variant="quiet" onClick={onSignOut}>Sign out</Button>
      </section>
    </main>
  );
}

function BiometricEnrollmentPrompt({
  busy,
  error,
  onEnable,
  onSkip,
}: {
  busy: boolean;
  error: string;
  onEnable: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="sheet-backdrop biometric-backdrop">
      <section className="payment-sheet biometric-prompt" role="dialog" aria-modal="true" aria-labelledby="biometric-prompt-title">
        <span className="sheet-handle" />
        <span className="biometric-prompt-icon"><Fingerprint size={25} /></span>
        <span className="eyebrow">OPTIONAL SIGN-IN</span>
        <h2 id="biometric-prompt-title">Set up biometric sign-in</h2>
        <p>Use your enrolled fingerprint or face to sign in on this device. Your MPIN is never stored; a device-bound key is protected by Android biometrics.</p>
        {error && <div className="inline-error" role="alert"><AlertCircle size={15} />{error}</div>}
        <Button disabled={busy} onClick={onEnable} icon={busy ? <LoaderCircle className="spin" size={17} /> : <Fingerprint size={17} />}>
          {busy ? "Setting up…" : "Enable biometric sign-in"}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onSkip}>Not now</Button>
      </section>
    </div>
  );
}

function SuperAdminSignIn({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await login(email.trim().toLowerCase(), password);
      if (session.role !== "super_admin") {
        clearSession();
        throw new Error("This account is not authorized for the super-admin console.");
      }
      onAuthenticated(session);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Admin sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen auth-screen-with-footer">
      <div className="auth-brand"><Brand /></div>
      <section className="auth-card">
        <span className="auth-mark"><ShieldCheck size={27} /></span>
        <span className="eyebrow">RESTRICTED ACCESS</span>
        <h1>Super-admin sign in</h1>
        <p>Use the separately configured DRPAY super-admin account.</p>
        <form onSubmit={submit}>
          <label>
            <span>Admin email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" autoFocus />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </label>
          {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
          <Button type="submit" disabled={busy || !email || !password} icon={busy ? <LoaderCircle className="spin" size={17} /> : <Lock size={17} />}>
            {busy ? "Signing in…" : "Open admin console"}
          </Button>
        </form>
        <div className="auth-trust"><ShieldCheck size={16} /><span>Separate one-hour admin session. Provider secrets and payment execution are not exposed here.</span></div>
      </section>
      <PoweredByFooter />
    </main>
  );
}

function SuperAdminConsole({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [activePage, setActivePage] = useState<"overview" | "merchants" | "ledger" | "requests" | "settings">("overview");
  const [settings, setSettings] = useState<AdminSettings>({
    krwToPhpRate: null,
    usdtAddress: "",
    usdtNetwork: "",
    collectionFeePercent: 0,
    transferFeeFixed: 0,
    superAdminFeeWallet: 0,
  });
  const [merchants, setMerchants] = useState<AdminMerchantAccount[]>([]);
  const [editingMerchant, setEditingMerchant] = useState<(AdminMerchantAccount & { originalEmail: string }) | null>(null);
  const [internalWallets, setInternalWallets] = useState<AdminInternalWalletSummary[]>([]);
  const [transferRequests, setTransferRequests] = useState<FloatingTransferRequest[]>([]);
  const [merchantSearch, setMerchantSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState<"all" | "active" | "disabled">("all");
  const [selectedWalletEmail, setSelectedWalletEmail] = useState("");
  const [selectedWallet, setSelectedWallet] = useState<AdminInternalWallet | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingMerchant, setSavingMerchant] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState("");
  const [failedRequestId, setFailedRequestId] = useState("");
  const [failedRequestReason, setFailedRequestReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const filteredMerchants = useMemo(() => {
    const query = merchantSearch.trim().toLowerCase();
    return merchants.filter((merchant) => {
      const matchesSearch = !query || merchant.email.toLowerCase().includes(query);
      const matchesStatus = merchantFilter === "all" || (merchantFilter === "active" ? merchant.active : !merchant.active);
      return matchesSearch && matchesStatus;
    });
  }, [merchants, merchantSearch, merchantFilter]);
  const activeMerchantCount = merchants.filter((merchant) => merchant.active).length;
  const totalLedgerBalance = internalWallets.reduce((total, wallet) => total + wallet.balance, 0);

  async function loadConsole() {
    setLoading(true);
    setError("");
    try {
      const [nextSettings, nextMerchants, nextWallets, nextTransferRequests] = await Promise.all([
        getAdminSettings(),
        getAdminMerchantAccounts(),
        getAdminInternalWallets(),
        getAdminFloatingTransferRequests(),
      ]);
      setSettings(nextSettings);
      setMerchants(nextMerchants);
      setInternalWallets(nextWallets);
      setTransferRequests(nextTransferRequests);
      setSelectedWalletEmail((current) => nextWallets.some((wallet) => wallet.email === current)
        ? current
        : nextWallets[0]?.email || "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load admin console data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadConsole(); }, []);

  useEffect(() => {
    let active = true;
    if (!selectedWalletEmail) {
      setSelectedWallet(null);
      return () => { active = false; };
    }
    getAdminInternalWallet(selectedWalletEmail).then((wallet) => {
      if (active) setSelectedWallet(wallet);
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Could not load internal ledger.");
    });
    return () => { active = false; };
  }, [selectedWalletEmail]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSavingSettings(true);
    setError("");
    setNotice("");
    try {
      const saved = await updateAdminSettings(settings);
      setSettings(saved);
      setNotice("Settings saved. New successful collections and transfer requests use these fee rates.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function addMerchant(event: FormEvent) {
    event.preventDefault();
    setSavingMerchant(true);
    setError("");
    setNotice("");
    try {
      await createAdminMerchantAccount({ email: newEmail });
      setNewEmail("");
      setNotice("Merchant account created.");
      await loadConsole();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create merchant account.");
    } finally {
      setSavingMerchant(false);
    }
  }

  async function saveMerchantProfile(event: FormEvent) {
    event.preventDefault();
    if (!editingMerchant) return;
    setSavingMerchant(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateAdminMerchantAccount(editingMerchant.originalEmail, {
        email: editingMerchant.email,
        businessName: editingMerchant.businessName,
        contactPerson: editingMerchant.contactPerson,
        phoneNumber: editingMerchant.phoneNumber,
        businessAddress: editingMerchant.businessAddress,
        bankName: editingMerchant.bankName,
        accountName: editingMerchant.accountName,
        accountNumber: editingMerchant.accountNumber,
      });
      await loadConsole();
      setEditingMerchant(null);
      setNotice("Merchant profile updated. If the login email changed, the merchant must sign in again using the new email.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update merchant profile.");
    } finally {
      setSavingMerchant(false);
    }
  }

  async function setMerchantActive(account: AdminMerchantAccount) {
    setError("");
    setNotice("");
    try {
      await updateAdminMerchantAccount(account.email, { active: !account.active });
      setMerchants((current) => current.map((item) => item.email === account.email ? { ...item, active: !account.active } : item));
      setNotice(`Merchant account ${account.active ? "disabled" : "enabled"}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update merchant account.");
    }
  }

  async function adjustInternalWallet(event: FormEvent) {
    event.preventDefault();
    if (!selectedWalletEmail) return;
    setSavingAdjustment(true);
    setError("");
    setNotice("");
    try {
      await createAdminInternalWalletAdjustment(selectedWalletEmail, {
        amount: Number(adjustmentAmount),
        reason: adjustmentReason,
      });
      setAdjustmentAmount("");
      setAdjustmentReason("");
      const [wallet, wallets] = await Promise.all([
        getAdminInternalWallet(selectedWalletEmail),
        getAdminInternalWallets(),
      ]);
      setSelectedWallet(wallet);
      setInternalWallets(wallets);
      setNotice("Floating-balance adjustment recorded. Pending transfer requests remain reserved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not record internal adjustment.");
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function reviewTransferRequest(request: FloatingTransferRequest, decision: "successful" | "failed") {
    const reason = failedRequestReason.trim();
    if (decision === "failed" && !reason) {
      setError("Enter a reason before marking the floating-balance request failed.");
      return;
    }
    setReviewingRequestId(request.id);
    setError("");
    setNotice("");
    try {
      const reviewed = await reviewAdminFloatingTransferRequest(request.id, decision, decision === "failed" ? reason : undefined);
      setTransferRequests((current) => current.map((item) => item.id === reviewed.id ? reviewed : item));
      setFailedRequestId("");
      setFailedRequestReason("");
      setNotice(decision === "successful"
        ? "Request marked successful; the requested amount and fixed transfer fee were debited. Arrange the payout to the displayed bank account outside the app."
        : "Request marked failed. The reserved balance is available to the merchant again.");
      try {
        const [wallets, wallet, refreshedSettings] = await Promise.all([
          getAdminInternalWallets(),
          selectedWalletEmail ? getAdminInternalWallet(selectedWalletEmail) : Promise.resolve(null),
          getAdminSettings(),
        ]);
        setInternalWallets(wallets);
        if (wallet) setSelectedWallet(wallet);
        setSettings(refreshedSettings);
      } catch (refreshError) {
        setError(refreshError instanceof Error ? `Request reviewed, but balance totals could not be refreshed: ${refreshError.message}` : "Request reviewed, but balance totals could not be refreshed.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not review transfer request.");
    } finally {
      setReviewingRequestId("");
    }
  }

  return (
    <main className="admin-screen">
      <header className="admin-header">
        <Brand />
        <div><span>SUPER ADMIN</span><strong>{session.email}</strong></div>
        <Button variant="secondary" icon={<LogOut size={15} />} onClick={onSignOut}>Sign out</Button>
      </header>
      <div className="admin-content">
        <div className="page-title">
          <span className="eyebrow">CONTROL PLANE</span>
          <div className="admin-page-heading">
            <div><h1>{activePage === "overview" ? "Backoffice overview" : activePage === "merchants" ? "Merchant accounts" : activePage === "ledger" ? "Floating balance" : activePage === "requests" ? "Transfer requests" : "Collection settings"}</h1>
            <p>{activePage === "overview" ? "Monitor merchant access and floating balances." : activePage === "merchants" ? "Create merchant access and manage account status." : activePage === "ledger" ? "Adjust merchant floating balances and review their audit entries." : activePage === "requests" ? "Mark requests successful or failed and arrange payouts for successful requests." : "Configure collection references used by the merchant app."}</p></div>
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => void loadConsole()} disabled={loading}>Refresh</Button>
          </div>
        </div>
        <nav className="admin-nav" aria-label="Super-admin pages">
          {([
            ["overview", "Overview", Home],
            ["merchants", "Merchants", Users],
            ["ledger", "Floating balance", WalletCards],
            ["requests", `Transfer requests${transferRequests.filter((request) => request.status === "PENDING").length ? ` (${transferRequests.filter((request) => request.status === "PENDING").length})` : ""}`, Send],
            ["settings", "Settings", Settings],
          ] as const).map(([page, label, Icon]) => (
            <button key={page} type="button" className={activePage === page ? "active" : ""} aria-current={activePage === page ? "page" : undefined} onClick={() => { setActivePage(page); setError(""); setNotice(""); }}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>
        {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
        {notice && <div className="admin-notice"><ShieldCheck size={15} />{notice}</div>}
        {loading ? <div className="admin-loading" role="status"><LoaderCircle className="spin" size={20} />Loading console…</div> : (
          <>
            {activePage === "overview" && (
              <>
                <section className="admin-stat-grid" aria-label="Backoffice summary">
                  <article><span>Merchant accounts</span><strong>{merchants.length}</strong><small>{activeMerchantCount} active · {merchants.length - activeMerchantCount} disabled</small></article>
                  <article><span>Floating balance total</span><strong>₱{totalLedgerBalance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Pending requests are reserved · PHP</small></article>
                  <article><span>Pending transfer requests</span><strong>{transferRequests.filter((request) => request.status === "PENDING").length}</strong><small>Awaiting admin review</small></article>
                  <article><span>Super-admin fee wallet</span><strong>₱{settings.superAdminFeeWallet.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Recorded collection and transfer fees</small></article>
                  <article><span>Collection rate</span><strong>{settings.krwToPhpRate ? `${settings.krwToPhpRate.toLocaleString("en-PH")} PHP` : "Automatic"}</strong><small>{settings.krwToPhpRate ? "KRW → PHP manual override" : "Live reference rate"}</small></article>
                  <article><span>USDT collection</span><strong>{settings.usdtAddress ? "Configured" : "Not configured"}</strong><small>{settings.usdtNetwork || "No receiving network set"}</small></article>
                </section>
                <section className="admin-card">
                  <div className="admin-card-heading"><span className="setting-icon"><Users size={19} /></span><div><h2>Merchant access</h2><p>Recently added accounts and their current access status.</p></div><button className="admin-text-action" onClick={() => setActivePage("merchants")}>Manage merchants</button></div>
                  <div className="admin-account-list">
                    {merchants.slice(0, 5).map((account) => (
                      <div className="admin-account-row" key={account.email}>
                        <div><strong>{account.email}</strong><small>Added {new Date(account.createdAt).toLocaleDateString()}</small></div>
                        <span className={`admin-status-pill ${account.active ? "active" : "disabled"}`}>{account.active ? "Active" : "Disabled"}</span>
                      </div>
                    ))}
                    {merchants.length === 0 && <p className="admin-empty">No merchant accounts yet. Create one to get started.</p>}
                  </div>
                </section>
                <section className="admin-card admin-overview-note">
                  <ShieldCheck size={18} /><p>Successful collections credit merchants net of the collection fee. Successful floating-balance requests debit the requested amount plus the fixed transfer fee. Both fees are recorded in the super-admin fee wallet; bank payouts remain manually handled outside this app.</p>
                </section>
              </>
            )}
            {activePage === "ledger" && <section className="admin-card">
              <div className="admin-card-heading"><span className="setting-icon"><WalletCards size={19} /></span><div><h2>Merchant floating balance</h2><p>PHP balance used for transfer requests. Pending requests reserve funds until marked successful or failed.</p></div></div>
              {merchants.length === 0 ? <p className="admin-empty">Create a merchant account before recording ledger adjustments.</p> : (
                <>
                  <label className="admin-wallet-select">
                    <span>Merchant account</span>
                    <select value={selectedWalletEmail} onChange={(event) => setSelectedWalletEmail(event.target.value)}>
                      {merchants.map((merchant) => <option key={merchant.email} value={merchant.email}>{merchant.email}</option>)}
                    </select>
                  </label>
                  <div className="internal-ledger-balance">
                    <span>Floating balance · PHP</span>
                    <strong>{selectedWallet ? `₱${selectedWallet.balance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Loading…"}</strong>
                    <small>{selectedWallet ? `₱${selectedWallet.availableBalance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available after pending requests` : "Loading available balance…"}</small>
                  </div>
                  <form className="admin-ledger-form" onSubmit={adjustInternalWallet}>
                    <label><span>Adjustment amount (PHP)</span><input type="number" step="0.01" min="-1000000000" max="1000000000" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} placeholder="Positive adds; negative subtracts" required /></label>
                    <label><span>Reason for audit record</span><input maxLength={250} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} required placeholder="Internal bookkeeping reason" /></label>
                    <Button type="submit" disabled={savingAdjustment || !selectedWalletEmail || !adjustmentAmount || Number(adjustmentAmount) === 0 || !adjustmentReason.trim()}>{savingAdjustment ? "Recording…" : "Adjust floating balance"}</Button>
                  </form>
                  <div className="admin-adjustment-list">
                    <strong>Recent audit entries</strong>
                    {!selectedWallet?.adjustments.length ? <p className="admin-empty">No internal adjustments recorded.</p> : selectedWallet.adjustments.map((adjustment) => (
                      <div className="admin-adjustment-row" key={adjustment.id}>
                        <span className={adjustment.amount < 0 ? "debit" : "credit"}>{adjustment.amount < 0 ? "−" : "+"}₱{Math.abs(adjustment.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <div><strong>{adjustment.reason}</strong><small>By {adjustment.adjustedBy} · {new Date(adjustment.createdAt).toLocaleString()}</small></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>}
            {activePage === "requests" && <section className="admin-card">
              <div className="admin-card-heading"><span className="setting-icon"><Send size={19} /></span><div><h2>Floating-balance transfer requests</h2><p>Successful requests debit the balance; failed requests require a merchant-visible reason.</p></div></div>
              <div className="admin-transfer-request-list">
                {transferRequests.length === 0 ? <p className="admin-empty">No transfer requests have been submitted.</p> : transferRequests.map((request) => (
                  <article className="admin-transfer-request" key={request.id}>
                    <div className="admin-transfer-request-heading">
                      <div><strong>{request.merchantEmail}</strong><small>{new Date(request.requestedAt).toLocaleString()}</small></div>
                      <span className={`admin-status-pill ${request.status.toLowerCase()}`}>{request.status.charAt(0) + request.status.slice(1).toLowerCase()}</span>
                    </div>
                    <strong className="admin-transfer-request-amount">₱{request.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    <dl>
                      <div><dt>Transfer fee</dt><dd>₱{request.transferFee.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
                      <div><dt>Bank</dt><dd>{request.bankName}</dd></div>
                      <div><dt>Account name</dt><dd>{request.accountName}</dd></div>
                      <div><dt>Account number</dt><dd>{request.accountNumber}</dd></div>
                    </dl>
                    {request.status === "FAILED" && request.failureReason && <p className="admin-transfer-failure-reason"><strong>Failure reason for merchant</strong>{request.failureReason}</p>}
                    {request.status === "PENDING" ? <div className="admin-transfer-request-actions">
                      <Button disabled={reviewingRequestId === request.id} onClick={() => void reviewTransferRequest(request, "successful")}>{reviewingRequestId === request.id ? "Updating…" : "Mark successful"}</Button>
                      <Button variant="secondary" disabled={reviewingRequestId === request.id} onClick={() => { setFailedRequestId(request.id); setFailedRequestReason(""); setError(""); }}>Mark failed</Button>
                      {failedRequestId === request.id && <form className="admin-transfer-failure-form" onSubmit={(event) => { event.preventDefault(); void reviewTransferRequest(request, "failed"); }}>
                        <label><span>Reason for failed settlement (visible to merchant)</span><textarea value={failedRequestReason} onChange={(event) => setFailedRequestReason(event.target.value)} maxLength={500} rows={3} required placeholder="Explain why the settlement failed" /></label>
                        <div><Button type="submit" disabled={reviewingRequestId === request.id || !failedRequestReason.trim()}>{reviewingRequestId === request.id ? "Saving…" : "Confirm failed"}</Button><Button variant="quiet" disabled={reviewingRequestId === request.id} onClick={() => { setFailedRequestId(""); setFailedRequestReason(""); }}>Cancel</Button></div>
                      </form>}
                    </div> : request.reviewedAt && <small className="admin-transfer-reviewed">Reviewed {new Date(request.reviewedAt).toLocaleString()}{request.reviewedBy ? ` · ${request.reviewedBy}` : ""}</small>}
                  </article>
                ))}
              </div>
            </section>}
            {activePage === "settings" && <section className="admin-card">
              <div className="admin-card-heading"><span className="setting-icon"><Settings size={19} /></span><div><h2>Collection and fee configuration</h2><p>Collection fees reduce merchant net collections; fixed transfer fees apply only on successful settlements.</p></div></div>
              <form onSubmit={saveSettings}>
                <label>
                  <span>Collection fee (%)</span>
                  <input type="number" min="0" max="100" step="0.01" value={settings.collectionFeePercent} onChange={(event) => setSettings({ ...settings, collectionFeePercent: event.target.value ? Number(event.target.value) : 0 })} />
                  <small>Deducted from each successful merchant collection before its net amount is credited to the floating balance.</small>
                </label>
                <label>
                  <span>Floating-balance transfer fee (PHP)</span>
                  <input type="number" min="0" max="1000000" step="0.01" value={settings.transferFeeFixed} onChange={(event) => setSettings({ ...settings, transferFeeFixed: event.target.value ? Number(event.target.value) : 0 })} />
                  <small>Reserved with each pending request, charged only when marked Successful, and credited to the super-admin fee wallet.</small>
                </label>
                <div className="internal-ledger-balance">
                  <span>Super-admin fee wallet · PHP</span>
                  <strong>₱{settings.superAdminFeeWallet.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <small>Accumulated fee ledger total</small>
                </div>
                <label>
                  <span>Optional manual KRW → PHP rate</span>
                  <input type="number" min="0.000001" max="1000" step="0.000001" value={settings.krwToPhpRate ?? ""} onChange={(event) => setSettings({ ...settings, krwToPhpRate: event.target.value ? Number(event.target.value) : null })} placeholder="Optional override" />
                  <small>Leave blank to use the live reference-rate API. A configured rate overrides it; neither rate guarantees the payer’s final SwiftPay conversion.</small>
                </label>
                <label>
                  <span>USDT receiving network</span>
                  <input value={settings.usdtNetwork} onChange={(event) => setSettings({ ...settings, usdtNetwork: event.target.value })} placeholder="For example: TRON (TRC20)" />
                </label>
                <label>
                  <span>USDT receiving address</span>
                  <input value={settings.usdtAddress} onChange={(event) => setSettings({ ...settings, usdtAddress: event.target.value })} placeholder="Leave both USDT fields empty until configured" autoComplete="off" />
                </label>
                <Button type="submit" disabled={savingSettings}>{savingSettings ? "Saving…" : "Save configuration"}</Button>
              </form>
            </section>}

            {activePage === "merchants" && <section className="admin-card">
              <div className="admin-card-heading"><span className="setting-icon"><Users size={19} /></span><div><h2>Merchant accounts</h2><p>Create email-verified accounts or disable access. Disabling an account revokes its trusted devices.</p></div></div>
              <div className="admin-merchant-tools">
                <label className="admin-search"><Search size={16} /><input aria-label="Search merchant emails" value={merchantSearch} onChange={(event) => setMerchantSearch(event.target.value)} placeholder="Search by merchant email" /></label>
                <label className="admin-filter"><span>Status</span><select value={merchantFilter} onChange={(event) => setMerchantFilter(event.target.value as typeof merchantFilter)}><option value="all">All accounts</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
              </div>
              <div className="admin-account-list">
                {filteredMerchants.map((account) => (
                  <div className="admin-account-row" key={account.email}>
                    <div><strong>{account.email}</strong><small>Added {new Date(account.createdAt).toLocaleDateString()} · Updated {new Date(account.updatedAt).toLocaleDateString()}</small></div>
                    <span className={`admin-status-pill ${account.active ? "active" : "disabled"}`}>{account.active ? "Active" : "Disabled"}</span>
                    <button type="button" className="admin-text-action" onClick={() => setEditingMerchant({ ...account, originalEmail: account.email })}>Edit profile</button>
                    <button type="button" className="admin-text-action" onClick={() => void setMerchantActive(account)}>{account.active ? "Disable access" : "Enable access"}</button>
                  </div>
                ))}
                {filteredMerchants.length === 0 && <p className="admin-empty">{merchants.length ? "No accounts match your search." : "No merchant accounts yet."}</p>}
              </div>
              {editingMerchant && <form className="admin-merchant-profile-form" onSubmit={saveMerchantProfile}>
                <div className="admin-card-heading"><span className="setting-icon"><Store size={19} /></span><div><h2>Edit merchant profile</h2><p>Updating the login email requires the merchant to sign in again.</p></div></div>
                <label><span>Merchant email / login</span><input type="email" value={editingMerchant.email} onChange={(event) => setEditingMerchant({ ...editingMerchant, email: event.target.value })} required maxLength={254} /></label>
                <label><span>Business or display name</span><input value={editingMerchant.businessName} onChange={(event) => setEditingMerchant({ ...editingMerchant, businessName: event.target.value })} maxLength={160} /></label>
                <label><span>Contact person</span><input value={editingMerchant.contactPerson} onChange={(event) => setEditingMerchant({ ...editingMerchant, contactPerson: event.target.value })} maxLength={120} /></label>
                <label><span>Phone number</span><input type="tel" value={editingMerchant.phoneNumber} onChange={(event) => setEditingMerchant({ ...editingMerchant, phoneNumber: event.target.value })} maxLength={40} /></label>
                <label><span>Business address</span><textarea value={editingMerchant.businessAddress} onChange={(event) => setEditingMerchant({ ...editingMerchant, businessAddress: event.target.value })} maxLength={500} rows={3} /></label>
                <div className="admin-profile-payout-heading"><strong>Saved payout account</strong><small>Leave all fields blank to remove the saved payout account.</small></div>
                <label><span>Bank or wallet name</span><input value={editingMerchant.bankName} onChange={(event) => setEditingMerchant({ ...editingMerchant, bankName: event.target.value })} maxLength={100} /></label>
                <label><span>Account holder name</span><input value={editingMerchant.accountName} onChange={(event) => setEditingMerchant({ ...editingMerchant, accountName: event.target.value })} maxLength={120} /></label>
                <label><span>Account number</span><input value={editingMerchant.accountNumber} onChange={(event) => setEditingMerchant({ ...editingMerchant, accountNumber: event.target.value })} maxLength={34} autoComplete="off" /></label>
                <div className="admin-transfer-request-actions">
                  <Button type="submit" disabled={savingMerchant}>{savingMerchant ? "Saving…" : "Save merchant profile"}</Button>
                  <Button variant="secondary" disabled={savingMerchant} onClick={() => setEditingMerchant(null)}>Cancel</Button>
                </div>
              </form>}
              <form onSubmit={addMerchant}>
                <label><span>New merchant email</span><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required autoComplete="off" /></label>
                <Button type="submit" disabled={savingMerchant || !newEmail}>{savingMerchant ? "Creating…" : "Create merchant account"}</Button>
              </form>
            </section>}
          </>
        )}
      </div>
    </main>
  );
}

function PaymentSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [currency, setCurrency] = useState<"PHP" | "KRW" | "USDT">("PHP");
  const [krwPhpQuote, setKrwPhpQuote] = useState<CurrencyQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [result, setResult] = useState<PaymentLinkResult | "error" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => getPaymentLinkIdempotencyKey());
  const [paymentStatus, setPaymentStatus] = useState("");
  const [selectingInstitution, setSelectingInstitution] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<PaymentInstitution | null>(null);

  useEffect(() => {
    if (currency !== "KRW") {
      setKrwPhpQuote(null);
      setQuoteLoading(false);
      return;
    }
    let active = true;
    setQuoteLoading(true);
    setError("");
    getKrwPhpQuote().then((quote) => {
      if (active) setKrwPhpQuote(quote);
    }).catch((requestError) => {
      if (active) {
        setKrwPhpQuote(null);
        setError(requestError instanceof Error ? requestError.message : "Could not load the KRW/PHP rate.");
      }
    }).finally(() => {
      if (active) setQuoteLoading(false);
    });
    return () => { active = false; };
  }, [currency]);

  useEffect(() => {
    if (!result || result === "error") return;
    setPaymentStatus(result.status || "PENDING");
    if (isTerminalPaymentStatus(result.status || "")) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getPaymentLinkStatus(result.code);
        const status = latest.status || "PENDING";
        setPaymentStatus(status);
        if (isTerminalPaymentStatus(status)) window.clearInterval(timer);
      } catch {
        // Keep the checkout usable if a temporary status request fails.
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [result]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSelectingInstitution(true);
  }

  async function createCheckout(institution: PaymentInstitution) {
    const enteredAmount = Number(amount);
    const phpAmount = currency === "KRW" && krwPhpQuote
      ? Math.round(enteredAmount * krwPhpQuote.rate * 100) / 100
      : enteredAmount;
    if (currency === "USDT" || (currency === "KRW" && !krwPhpQuote)) return;
    setSelectedInstitution(institution);
    setSubmitting(true);
    setError("");
    try {
      const description = currency === "KRW" && krwPhpQuote
        ? `${name} · ${enteredAmount.toLocaleString("en-US")} KRW @ ${krwPhpQuote.rate} PHP/KRW`
        : name;
      const response = await createPaymentLink({
        amount: phpAmount,
        description,
        customerEmail,
        institution,
        collectionAmountKrw: currency === "KRW" ? enteredAmount : undefined,
      }, idempotencyKey);
      setResult(response);
      clearPaymentLinkIdempotencyKey();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not create QR checkout.";
      setError(message);
      if (!message.toLowerCase().includes("unknown") && !message.toLowerCase().includes("reconcil")) {
        setIdempotencyKey(resetPaymentLinkIdempotencyKey());
      }
      setResult("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="payment-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <span className="eyebrow">DRPAY · SELF-HOSTED QR CHECKOUT</span>
            <h2 id="sheet-title">{result ? "Collection ready" : selectingInstitution ? "Choose payment app" : "Collect payment"}</h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>

        {result ? (
          <div className="link-result">
            {result === "error" ? (
              <>
                <div className="result-icon result-error"><X size={23} /></div>
                <strong>Couldn’t create this checkout</strong>
                <p>{error}</p>
                {error.toLowerCase().includes("outcome is unknown") ? (
                  <Button variant="secondary" onClick={onClose}>Close and check activity</Button>
                ) : (
                  <Button onClick={() => setResult(null)}>Try again</Button>
                )}
              </>
            ) : (
              <>
                <div className="result-icon"><QrCode size={25} /></div>
                <strong>Scan to collect payment</strong>
                <p>
                  {currency === "KRW"
                    ? `Collect KRW ${Number(amount).toLocaleString("en-US")} (about PHP ${Number(result.amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} at the reference rate). Show this QR to the customer to scan.`
                    : `Show this QR to collect PHP ${Number(result.amount || amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}.`}
                </p>
                {customerEmail.trim() && <p className="accepted-channels">Payment request queued for {customerEmail.trim()}. We’ll email them again when payment is confirmed.</p>}
                <span className={`payment-state state-${paymentStatus.toLowerCase()}`}>{isConfirmedPaymentStatus(paymentStatus) ? "Payment confirmed by SwiftPay" : `Checkout status: ${paymentStatus || result.status || "PENDING"}`}</span>
                <QrPaymentDisplay value={result.qrCode} institution={selectedInstitution || undefined} />
                <Button onClick={onClose}>Done</Button>
              </>
            )}
          </div>
        ) : selectingInstitution ? (
          <InstitutionSelectionScreen
            onBack={() => setSelectingInstitution(false)}
            onConfirm={(institution) => void createCheckout(institution)}
            showKoreanQrApps={currency === "KRW"}
            busy={submitting}
            submissionError={error}
          />
        ) : (
          <form onSubmit={submit}>
            <div className="collection-currencies" role="group" aria-label="Collection currency">
              <button type="button" className={currency === "PHP" ? "active" : ""} aria-pressed={currency === "PHP"} onClick={() => setCurrency("PHP")}>PHP</button>
              <button type="button" className={currency === "KRW" ? "active" : ""} aria-pressed={currency === "KRW"} onClick={() => setCurrency("KRW")}>KRW</button>
              <button type="button" className="currency-unavailable" aria-disabled="true" disabled title="USDT collection is not configured">USDT <small>Unavailable</small></button>
            </div>
            <label>
              <span>Reference or note</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Invoice 1048"
                required
              />
            </label>
            <label>
              <span>Amount in {currency}</span>
              <div className="amount-field">
                <span>{currency === "KRW" ? "₩" : currency === "USDT" ? "₮" : "₱"}</span>
                <input
                  type="number"
                  min="1"
                  step={currency === "KRW" ? "1" : "0.01"}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
                <small>{currency}</small>
              </div>
            </label>
            <label>
              <span>Customer email <small>(optional)</small></span>
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="customer@example.com"
                autoComplete="email"
                maxLength={254}
              />
              <small>We’ll email the checkout link and send a payment-confirmed email after the customer pays.</small>
            </label>
            {currency === "KRW" && (
              <div className="currency-quote" aria-live="polite">
                {quoteLoading ?                 <span>Loading live KRW/PHP reference rate…</span> : krwPhpQuote ? (
                  <>
                    <strong>
                      {amount && Number(amount) > 0
                        ? `≈ PHP ${(Number(amount) * krwPhpQuote.rate).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : `1 KRW = PHP ${krwPhpQuote.rate.toFixed(5)}`}
                    </strong>
                    <span>{krwPhpQuote.source} · published {new Date(krwPhpQuote.updatedAt).toLocaleString()}. This is a reference rate, not a guaranteed real-time SwiftPay rate. Checkout and settlement are in PHP; the payer’s final conversion may differ.</span>
                  </>
                ) : <span>{error || "KRW collection is unavailable until a live exchange rate can be loaded."}</span>}
              </div>
            )}
            <div className="accepted-channels">
              <span>Customers scan the QR Ph code on your DRPAY checkout page. KRW amounts are converted to PHP using the displayed reference rate.</span>
            </div>
            <Button
              type="submit"
              className="sheet-submit"
              disabled={submitting || currency === "USDT" || (currency === "KRW" && (!krwPhpQuote || quoteLoading))}
              icon={<Link2 size={18} />}
            >
              {submitting ? "Creating checkout…" : "Create self-hosted checkout"}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}

function TransactionSheet({
  transaction,
  onClose,
  onComplete,
  onRepeatTransfer,
}: {
  transaction: Transaction;
  onClose: () => void;
  onComplete: () => void;
  onRepeatTransfer: (details: TransferQrDetails) => void;
}) {
  const [refundDetails, setRefundDetails] = useState<CollectionRefundDetails | null>(null);
  const [refundPin, setRefundPin] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState(() => crypto.randomUUID());

  async function copyReference() {
    await navigator.clipboard?.writeText(transaction.reference);
  }

  const isTransfer = transaction.numericAmount < 0;
  const canRepeatTransfer = isTransfer
    && !transaction.isRefund
    && Boolean(transaction.institutionCode && transaction.recipientName && transaction.recipientAccountNumber);
  const receiptText = [
    "DRPAY TRANSFER RECEIPT",
    "",
    `Amount: ${formatPeso(Math.abs(transaction.numericAmount))}`,
    `Status: ${transaction.rawStatus}`,
    `Reference: ${transaction.reference}`,
    `Network: ${transaction.channel}`,
    `Institution: ${transaction.institutionName || transaction.customer}`,
    ...(transaction.recipientName ? [`Recipient: ${transaction.recipientName}`] : []),
    ...(transaction.recipientAccountNumber ? [`Account ending: ${transaction.recipientAccountNumber.slice(-4)}`] : []),
    ...(transaction.remarks ? [`Remarks: ${transaction.remarks}`] : []),
    `Date: ${transaction.date}`,
    "",
    "This receipt reflects the transfer status reported by the payment provider.",
  ].join("\n");

  function downloadReceipt() {
    const receiptUrl = URL.createObjectURL(new Blob([receiptText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = receiptUrl;
    link.download = `drpay-transfer-${transaction.reference.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(receiptUrl), 1000);
  }

  async function shareReceipt() {
    setReceiptError("");
    try {
      const { value } = await Share.canShare();
      if (!value) throw new Error("Sharing is not available on this device. Download the receipt instead.");
      await Share.share({
        title: "DRPAY transfer receipt",
        text: receiptText,
        dialogTitle: "Share transfer receipt",
      });
    } catch (shareError) {
      setReceiptError(shareError instanceof Error ? shareError.message : "Could not share the receipt. Download it instead.");
    }
  }

  function repeatTransfer() {
    if (!canRepeatTransfer || !transaction.institutionCode || !transaction.recipientName || !transaction.recipientAccountNumber) return;
    onRepeatTransfer({
      bank: transaction.institutionCode,
      accountNumber: transaction.recipientAccountNumber,
      fullName: transaction.recipientName,
      channel: transaction.channel === "PESONET" ? "PESONET" : "INSTAPAY",
    });
  }

  async function loadRefundDetails() {
    setRefundLoading(true);
    setRefundError("");
    try {
      setRefundDetails(await getCollectionRefundDetails(transaction.id));
    } catch (requestError) {
      setRefundError(requestError instanceof Error ? requestError.message : "Could not verify refund eligibility.");
    } finally {
      setRefundLoading(false);
    }
  }

  async function submitRefund(event: FormEvent) {
    event.preventDefault();
    if (!refundDetails) return;
    setRefundSubmitting(true);
    setRefundError("");
    try {
      const authorizationInput: TransferAuthorizationInput = {
        ...refundDetails,
        idempotencyKey: refundIdempotencyKey,
        refundPaymentId: transaction.id,
      };
      const authorization = await authorizeTransferWithPin(authorizationInput, refundPin);
      const result = await createTransfer({
        ...refundDetails,
        idempotencyKey: refundIdempotencyKey,
        stepUpToken: authorization.stepUpToken,
        refundPaymentId: transaction.id,
      });
      if (["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(result.status.toUpperCase())) {
        setRefundError(result.message || "SwiftPay rejected the refund transfer.");
        setRefundIdempotencyKey(crypto.randomUUID());
        return;
      }
      onComplete();
      onClose();
    } catch (requestError) {
      setRefundError(requestError instanceof Error ? requestError.message : "Could not submit the refund transfer.");
    } finally {
      setRefundSubmitting(false);
    }
  }

  const refundInProgress = ["REQUESTING", "PENDING", "OUTCOME_UNKNOWN"].includes((transaction.refundStatus || "").toUpperCase());
  const refundCompleted = ["EXECUTED", "SUCCESS", "COMPLETED"].includes((transaction.refundStatus || "").toUpperCase());

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="payment-sheet detail-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div><span className="eyebrow">TRANSACTION DETAILS</span><h2>{transaction.customer}</h2></div>
          <IconButton label="Close" onClick={onClose}><X size={19} /></IconButton>
        </header>
        <section className="transaction-detail-hero">
          {transaction.institutionCode && transaction.institutionName && (
            <InstitutionLogo institution={{
              code: transaction.institutionCode,
              name: transaction.institutionName,
              logoUrl: transaction.institutionLogoUrl,
            }} className="transaction-detail-logo" />
          )}
          <div>
            <div className={`detail-amount ${transaction.numericAmount >= 0 ? "credit" : "debit"}`}>{transaction.amount}</div>
            <StatusBadge status={transaction.status} />
          </div>
        </section>
        <dl className="detail-list">
          <div><dt>Provider status</dt><dd>{transaction.rawStatus}</dd></div>
          <div><dt>Channel</dt><dd>{transaction.channel}</dd></div>
          <div><dt>Date</dt><dd>{transaction.date}</dd></div>
          <div><dt>Description</dt><dd>{transaction.description || "—"}</dd></div>
          {transaction.recipientName && <div><dt>Recipient</dt><dd>{transaction.recipientName}</dd></div>}
          {transaction.recipientAccountNumber && <div><dt>Account</dt><dd>Ending {transaction.recipientAccountNumber.slice(-4)}</dd></div>}
          {transaction.remarks && <div><dt>Remarks</dt><dd>{transaction.remarks}</dd></div>}
          <div><dt>Reference</dt><dd><button onClick={copyReference}>{transaction.reference}<Copy size={14} /></button></dd></div>
        </dl>
        <p className="detail-note"><ShieldCheck size={15} /> Status was last reconciled by the DRPAY server with SwiftPay.</p>
        {isTransfer && (
          <div className="transaction-receipt-actions">
            {canRepeatTransfer && <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={repeatTransfer}>Repeat transfer</Button>}
            <Button variant="secondary" icon={<Download size={15} />} onClick={downloadReceipt}>Download receipt</Button>
            <Button variant="secondary" icon={<Share2 size={15} />} onClick={() => void shareReceipt()}>Share receipt</Button>
            {receiptError && <div className="inline-error" role="alert"><AlertCircle size={14} />{receiptError}</div>}
          </div>
        )}
        {refundCompleted && <div className="refund-status refund-status-complete"><ShieldCheck size={15} />Refund transfer completed.</div>}
        {refundInProgress && <div className="refund-status"><LoaderCircle size={15} className="spin" />Refund transfer is being processed. Check Wallet activity for its latest status.</div>}
        {transaction.canRefund && !refundDetails && (
          <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => void loadRefundDetails()} disabled={refundLoading}>
            {refundLoading ? "Checking refund…" : "Refund to payer"}
          </Button>
        )}
        {refundDetails && (
          <form className="refund-confirmation" onSubmit={submitRefund}>
            <strong>Refund to the original payer</strong>
            <p>{formatPeso(refundDetails.amount)} will be transferred via {refundDetails.channel} to {refundDetails.fullName} · {refundDetails.institutionCode}, account ending {refundDetails.accountNumber.slice(-4)}. The platform fee will not be refunded.</p>
            <label>
              <span>Confirm with your MPIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                pattern="[0-9]{4}"
                value={refundPin}
                onChange={(event) => setRefundPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                required
              />
            </label>
            {refundError && <div className="inline-error" role="alert"><AlertCircle size={14} />{refundError}</div>}
            <Button type="submit" disabled={refundSubmitting || refundPin.length !== 4}>
              {refundSubmitting ? "Submitting refund…" : `Confirm refund · ${formatPeso(refundDetails.amount)}`}
            </Button>
            <Button variant="quiet" onClick={() => { setRefundDetails(null); setRefundPin(""); setRefundError(""); }}>Cancel</Button>
          </form>
        )}
        {!transaction.canRefund && !refundInProgress && !refundCompleted && transaction.refundStatus && (
          <div className="refund-status">The previous refund transfer failed. This collection can be retried.</div>
        )}
        {refundError && !refundDetails && <div className="inline-error" role="alert"><AlertCircle size={14} />{refundError}</div>}
        <Button onClick={onClose}>Done</Button>
      </section>
    </div>
  );
}

function TransferSheet({
  balance,
  onClose,
  onComplete,
  initialValues,
}: {
  balance: number;
  onClose: () => void;
  onComplete: () => void;
  initialValues?: TransferQrDetails;
}) {
  const { balanceVisible } = useBalanceVisibility();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [bank, setBank] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState("");
  const [bankLoadAttempt, setBankLoadAttempt] = useState(0);
  const [channel, setChannel] = useState<"INSTAPAY" | "PESONET">(initialValues?.channel || "INSTAPAY");
  const [name, setName] = useState(initialValues?.fullName || "");
  const [account, setAccount] = useState(initialValues?.accountNumber || "");
  const [amount, setAmount] = useState(initialValues?.amount ? String(initialValues.amount) : "");
  const [remarks, setRemarks] = useState("Bank transfer");
  const [reviewing, setReviewing] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TransferResult | null>(null);
  const [receiptDetails, setReceiptDetails] = useState<{
    amount: number;
    channel: "INSTAPAY" | "PESONET";
    institutionName: string;
    accountNumber: string;
    recipientName: string;
    remarks: string;
    reference: string;
    status: string;
    createdAt: string;
  } | null>(null);
  const [receiptActionError, setReceiptActionError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    setBanksLoading(true);
    setBanksError("");
    getInstitutions().then((items) => {
      setInstitutions(items);
      const requestedBank = initialValues?.bank.trim().toLowerCase();
      const matchedBank = requestedBank
        ? items.find((item) => item.code.toLowerCase() === requestedBank || item.name.trim().toLowerCase() === requestedBank)
        : undefined;
      setBank(matchedBank?.code || (initialValues ? "" : items[0]?.code || ""));
      if (initialValues && !matchedBank) setError(`The QR bank “${initialValues.bank}” is not supported for transfers. Choose a bank to continue.`);
    }).catch((requestError) => {
      setBanksError(requestError instanceof Error ? requestError.message : "Could not load banks");
    }).finally(() => setBanksLoading(false));
  }, [bankLoadAttempt, initialValues]);

  const transferAuthorization: TransferAuthorizationInput = {
    amount: Number(amount),
    channel,
    institutionCode: bank,
    accountNumber: account,
    fullName: name,
    remarks,
    idempotencyKey,
  };

  async function submitWithAuthorization() {
    setBusy(true);
    setError("");
    setReceiptActionError("");
    try {
      const authorization = await authorizeTransferWithPin(transferAuthorization, pin);
      const response = await createTransfer({ ...transferAuthorization, stepUpToken: authorization.stepUpToken });
      setResult(response);
      setReceiptDetails({
        amount: Number(amount),
        channel,
        institutionName: selectedBank?.name || bank,
        accountNumber: account,
        recipientName: name,
        remarks,
        reference: response.referenceNo || response.id || "Not provided",
        status: response.status,
        createdAt: new Date().toISOString(),
      });
      onComplete();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Transfer failed";
      setError(message);
      if (!message.toLowerCase().includes("unknown") && !message.toLowerCase().includes("already") && !message.toLowerCase().includes("reconcil")) {
        setIdempotencyKey(crypto.randomUUID());
      }
    } finally {
      setBusy(false);
    }
  }

  const selectedBank = institutions.find((item) => item.code === bank);
  const filteredInstitutions = useMemo(() => {
    const query = bankSearch.trim().toLowerCase();
    if (!query) return institutions;
    return institutions.filter((item) =>
      `${item.name} ${item.code}`.toLowerCase().includes(query),
    );
  }, [bankSearch, institutions]);
  const invalidAmount = Number(amount) <= 0 || Number(amount) > balance;
  const channelAvailable = channel === "INSTAPAY"
    ? selectedBank?.instapayEnabled !== false
    : selectedBank?.pesonetEnabled !== false;
  const receiptText = receiptDetails ? [
    "DRPAY TRANSFER RECEIPT",
    "",
    `Amount: ${formatPeso(receiptDetails.amount)}`,
    `Status: ${receiptDetails.status}`,
    `Reference: ${receiptDetails.reference}`,
    `Network: ${receiptDetails.channel}`,
    `Institution: ${receiptDetails.institutionName}`,
    `Recipient: ${receiptDetails.recipientName}`,
    `Account: ending ${receiptDetails.accountNumber.slice(-4)}`,
    `Remarks: ${receiptDetails.remarks}`,
    `Date: ${new Date(receiptDetails.createdAt).toLocaleString()}`,
    "",
    "This receipt confirms the transfer request status shown above. A pending request is not proof of settlement.",
  ].join("\n") : "";

  function downloadTransferReceipt() {
    if (!receiptText || !receiptDetails) return;
    const receiptUrl = URL.createObjectURL(new Blob([receiptText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = receiptUrl;
    link.download = `drpay-transfer-${receiptDetails.reference.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(receiptUrl), 1000);
  }

  async function shareTransferReceipt() {
    if (!receiptText) return;
    setReceiptActionError("");
    try {
      const { value } = await Share.canShare();
      if (!value) {
        setReceiptActionError("Sharing is not available on this device. Download the receipt instead.");
        return;
      }
      await Share.share({
        title: "DRPAY transfer receipt",
        text: receiptText,
        dialogTitle: "Share transfer receipt",
      });
    } catch (shareError) {
      setReceiptActionError(shareError instanceof Error ? shareError.message : "Could not share the transfer receipt. Download it instead.");
    }
  }

  function selectBank(code: string) {
    const institution = institutions.find((item) => item.code === code);
    setBank(code);
    setBankSearch("");
    setBankPickerOpen(false);
    setError("");
    if (channel === "INSTAPAY" && institution?.instapayEnabled === false && institution.pesonetEnabled) {
      setChannel("PESONET");
    } else if (channel === "PESONET" && institution?.pesonetEnabled === false && institution.instapayEnabled) {
      setChannel("INSTAPAY");
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="payment-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div><span className="eyebrow">BANK TRANSFER</span><h2>{result ? "Transfer submitted" : bankPickerOpen ? "Choose a bank or wallet" : reviewing ? authorizing ? "Verify transfer" : "Review transfer" : "Send money"}</h2></div>
          <IconButton label="Close" onClick={onClose}><X size={19} /></IconButton>
        </header>
        {result ? (
          <div className="link-result">
            <div className="result-icon"><Send size={23} /></div>
            <strong>{result.outcomeUnknown ? "Outcome needs review" : ["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(result.status.toUpperCase()) ? "Transfer not sent" : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(result.status.toUpperCase()) ? "Transfer settled" : "Transfer accepted for processing"}</strong>
            <p>{result.outcomeUnknown ? "The provider response was ambiguous. Do not retry until the transfer is reconciled." : ["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(result.status.toUpperCase()) ? result.message || "SwiftPay rejected the transfer." : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(result.status.toUpperCase()) ? result.message || "SwiftPay confirmed settlement." : result.message || "Provider acceptance is not final settlement. Track the terminal status in Wallet activity."}</p>
            <span className="payment-state">Status: {result.status}</span>
            {receiptDetails && !result.outcomeUnknown && !["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(result.status.toUpperCase()) && (
              <>
                <dl className="detail-list">
                  <div><dt>Amount</dt><dd>{formatPeso(receiptDetails.amount)}</dd></div>
                  <div><dt>Reference</dt><dd>{receiptDetails.reference}</dd></div>
                  <div><dt>Recipient</dt><dd>{receiptDetails.recipientName}</dd></div>
                  <div><dt>Institution</dt><dd>{receiptDetails.institutionName}</dd></div>
                  <div><dt>Account</dt><dd>Ending {receiptDetails.accountNumber.slice(-4)}</dd></div>
                  <div><dt>Network</dt><dd>{receiptDetails.channel}</dd></div>
                  <div><dt>Date</dt><dd>{new Date(receiptDetails.createdAt).toLocaleString()}</dd></div>
                </dl>
                <div className="result-actions">
                  <Button variant="secondary" icon={<Download size={15} />} onClick={downloadTransferReceipt}>Download receipt</Button>
                  <Button variant="secondary" icon={<Share2 size={15} />} onClick={() => void shareTransferReceipt()}>Share receipt</Button>
                </div>
                {receiptActionError && <div className="inline-error" role="alert"><AlertCircle size={14} />{receiptActionError}</div>}
              </>
            )}
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : bankPickerOpen ? (
          <section className="bank-selection" aria-label="Choose transfer destination">
            <button type="button" className="institution-back" onClick={() => { setBankPickerOpen(false); setBankSearch(""); }}>
              <ChevronLeft size={16} /> Back to transfer
            </button>
            <p className="bank-selection-note">Choose where you’re sending money. Available transfer networks are shown for each destination.</p>
            <label className="bank-picker-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={bankSearch}
                onChange={(event) => setBankSearch(event.target.value)}
                placeholder="Search banks or wallets"
                aria-label="Search banks or wallets"
                autoFocus
              />
            </label>
            {banksError ? (
              <div className="bank-load-error" role="alert">
                <span>{banksError}</span>
                <Button type="button" variant="secondary" onClick={() => setBankLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
              </div>
            ) : banksLoading ? (
              <div className="bank-picker-empty" role="status"><LoaderCircle className="spin" size={16} /> Loading banks and wallets…</div>
            ) : (
              <div className="bank-selection-list" role="listbox" aria-label="Supported banks and wallets">
                {filteredInstitutions.length > 0 ? filteredInstitutions.map((item) => {
                  const supportsInstapay = item.instapayEnabled !== false;
                  const supportsPesonet = item.pesonetEnabled !== false;
                  const unavailable = !supportsInstapay && !supportsPesonet;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      role="option"
                      aria-selected={item.code === bank}
                      className="bank-selection-option"
                      disabled={unavailable}
                      onClick={() => selectBank(item.code)}
                    >
                      <InstitutionLogo institution={item} className="institution-selection-logo" />
                      <span className="institution-option-copy">
                        <strong>{item.name}</strong>
                        <small>{unavailable ? "Transfers unavailable" : [supportsInstapay && "InstaPay", supportsPesonet && "PESONet"].filter(Boolean).join(" · ")}</small>
                      </span>
                      {item.code === bank && <ShieldCheck className="bank-selection-check" size={17} aria-label="Selected" />}
                      {!unavailable && item.code !== bank && <ChevronRight size={16} aria-hidden="true" />}
                    </button>
                  );
                }) : (
                  <p className="bank-picker-empty">{banksLoading ? "Loading banks and wallets…" : "No banks or wallets match your search."}</p>
                )}
              </div>
            )}
            <p className="bank-selection-footnote"><ShieldCheck size={14} /> Transfer availability depends on the selected bank and network.</p>
          </section>
        ) : reviewing ? (
          <div className="transfer-review">
            <div className="transfer-step-heading">
              <span>Step 2 of 2</span>
              <strong>{authorizing ? "Verify with your MPIN" : "Review before sending"}</strong>
              <small>{authorizing ? "Your MPIN securely authorizes this transfer." : "Check the recipient and account details carefully. Transfers may not be reversible."}</small>
            </div>
            <div className="review-total"><span>You’re sending</span><strong>₱{Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong></div>
            <dl className="detail-list">
              <div><dt>Recipient</dt><dd>{name}</dd></div>
              <div><dt>Bank</dt><dd>{selectedBank?.name}</dd></div>
              <div><dt>Account number</dt><dd>{account}</dd></div>
              <div><dt>Transfer network</dt><dd>{channel === "INSTAPAY" ? "InstaPay" : "PESONet"}</dd></div>
              {remarks.trim() && <div><dt>Remarks</dt><dd>{remarks.trim()}</dd></div>}
            </dl>
            {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
            {!authorizing ? (
              <div className="result-actions">
                <Button variant="secondary" onClick={() => setReviewing(false)}>Back</Button>
                <Button disabled={busy} onClick={() => { setAuthorizing(true); setError(""); }} icon={<ShieldCheck size={16} />}>Continue to MPIN</Button>
              </div>
            ) : (
              <div className="transfer-authorization">
                <p>Enter your MPIN to approve this transfer.</p>
                <label>
                  <span>Four-digit MPIN</span>
                  <input type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} />
                </label>
                <Button disabled={busy || pin.length !== 4} onClick={() => void submitWithAuthorization()} icon={busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}>
                  {busy ? "Verifying…" : "Verify MPIN and send"}
                </Button>
                <button type="button" className="authorization-back" disabled={busy} onClick={() => { setAuthorizing(false); setPin(""); setError(""); }}>Back to transfer details</button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); setReviewing(true); }}>
            <div className="transfer-step-heading">
              <span>Step 1 of 2</span>
              <strong>Enter transfer details</strong>
              <small>Choose a destination and confirm the recipient information.</small>
            </div>
            {error && <div className="inline-error" role="alert"><AlertCircle size={15} />{error}</div>}
            <div className="bank-picker">
              <span className="bank-picker-label" id="transfer-bank-label">Bank or wallet</span>
              <button
                type="button"
                className="bank-picker-trigger"
                aria-labelledby="transfer-bank-label"
                aria-haspopup="dialog"
                disabled={banksLoading || Boolean(banksError)}
                onClick={() => setBankPickerOpen(true)}
              >
                <span className="bank-picker-name">
                  {selectedBank && <InstitutionLogo key={selectedBank.code} institution={selectedBank} className="bank-picker-logo" />}
                  {banksLoading ? "Loading banks…" : selectedBank?.name || "Choose a bank or wallet"}
                </span>
                <span className="bank-picker-trigger-action">{selectedBank ? "Change" : "Choose"} <ChevronRight size={16} /></span>
              </button>
            </div>
            <div className="transfer-field-group">
              <span className="bank-picker-label">Transfer network</span>
              <div className="rail-selector">
                {(["INSTAPAY", "PESONET"] as const).map((item) => {
                  const available = item === "INSTAPAY" ? selectedBank?.instapayEnabled !== false : selectedBank?.pesonetEnabled !== false;
                  const networkName = item === "INSTAPAY" ? "InstaPay" : "PESONet";
                  return (
                    <button key={item} type="button" className={channel === item ? "active" : ""} aria-label={`${networkName} — ${item === "INSTAPAY" ? "real-time transfers" : "batch bank transfers"}`} aria-pressed={channel === item} onClick={() => setChannel(item)} disabled={!selectedBank || !available}>
                      <span className="transfer-network-logo-frame">
                        <img src={`/bank-logos/${item === "INSTAPAY" ? "instapay" : "pesonet"}.png`} alt="" aria-hidden="true" />
                      </span>
                      <small>{item === "INSTAPAY" ? "Real-time transfers" : "Batch bank transfers"}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="transfer-recipient-fields">
              <label><span>Recipient full name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name on bank account" required /></label>
              <label><span>Account number</span><input inputMode="numeric" autoComplete="off" value={account} onChange={(event) => setAccount(event.target.value.replace(/\D/g, ""))} placeholder="Enter account number" required /></label>
            </div>
            <label className="transfer-amount-label">
              <span>Amount <small>Available {balanceVisible ? formatPeso(balance) : "₱ ••••••"}</small></span>
              <div className="amount-field"><span>₱</span><input type="number" min="1" max={balance} step=".01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /><small>PHP</small></div>
            </label>
            <label><span>Remarks</span><input value={remarks} onChange={(event) => setRemarks(event.target.value.slice(0, 80))} maxLength={80} required placeholder="What is this transfer for?" /></label>
            {invalidAmount && amount && <div className="inline-error"><AlertCircle size={15} />Enter an amount within your available balance.</div>}
            <Button type="submit" disabled={banksLoading || Boolean(banksError) || invalidAmount || !bank || !channelAvailable || !account.trim() || !name.trim() || !remarks.trim()}>Review transfer <ChevronRight size={16} /></Button>
          </form>
        )}
      </section>
    </div>
  );
}

function ScannerSheet({
  onClose,
  onTransferQr,
}: {
  onClose: () => void;
  onTransferQr: (details: TransferQrDetails) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"scan" | "collect" | "merchant">("scan");
  const [cameraError, setCameraError] = useState("");
  const [cameraRetry, setCameraRetry] = useState(0);
  const [decodingUpload, setDecodingUpload] = useState(false);
  const [merchantQr, setMerchantQr] = useState<MerchantQrDetails | null>(null);

  function handlePayload(payload: string) {
    const scannedQr = parseScannedQr(payload);
    if (!scannedQr) {
      setCameraError("This QR format is not recognized. Scan a QR Ph P2P recipient code or QR Ph P2M merchant code.");
      return;
    }
    if (scannedQr.type === "p2p") {
      onTransferQr(scannedQr.transfer);
      return;
    }
    setMerchantQr(scannedQr.merchant);
    setMode("merchant");
  }

  useEffect(() => {
    if (mode !== "scan" || decodingUpload || !videoRef.current) return;
    let active = true;
    let stopScanner: (() => void) | undefined;
    void import("@zxing/browser").then(({ BrowserQRCodeReader }) => {
      if (!active || !videoRef.current) return;
      return new BrowserQRCodeReader().decodeFromVideoDevice(undefined, videoRef.current, (result, error) => {
        if (!active) return;
        if (result) {
          active = false;
          stopScanner?.();
          handlePayload(result.getText());
        } else if (error && !isQrNotFoundError(error)) {
          setCameraError(error.message || "Could not read the camera QR code.");
        }
      });
    }).then((controls) => {
      if (!controls) return;
      if (active) stopScanner = () => controls.stop();
      else controls.stop();
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
        setCameraError("Camera access was denied. Allow camera permission for DRPAY in your device settings, then try again.");
      } else if (error instanceof DOMException && error.name === "NotFoundError") {
        setCameraError("No camera was found on this device. You can still upload a QR image.");
      } else if (error instanceof DOMException && error.name === "NotReadableError") {
        setCameraError("The camera is already in use by another app. Close it and try again.");
      } else {
        setCameraError(error instanceof Error ? error.message : "Camera access is unavailable. You can still upload a QR image.");
      }
    });
    return () => {
      active = false;
      stopScanner?.();
    };
  }, [mode, decodingUpload, cameraRetry]);

  async function scanImage(file?: File) {
    if (!file) return;
    setCameraError("");
    if (!file.type.startsWith("image/")) {
      setCameraError("Choose a valid image file containing a QR code.");
      if (uploadRef.current) uploadRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCameraError("This image is larger than 10 MB. Choose a smaller QR image.");
      if (uploadRef.current) uploadRef.current.value = "";
      return;
    }
    setDecodingUpload(true);
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 24_000_000) {
        throw new Error("This image is too large to scan safely. Choose an image under 24 megapixels.");
      }
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(imageUrl);
      handlePayload(result.getText());
    } catch (error) {
      setCameraError(isQrNotFoundError(error)
        ? "No QR code was found in that image."
        : error instanceof Error ? `Could not read the uploaded QR: ${error.message}` : "Could not read the uploaded QR.");
    } finally {
      URL.revokeObjectURL(imageUrl);
      setDecodingUpload(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="payment-sheet scanner-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div><span className="eyebrow">QR SCANNER</span><h2>{mode === "scan" ? "Scan a QR" : mode === "collect" ? "Open-amount QR Ph" : "Merchant QR details"}</h2></div>
          <IconButton label="Close" onClick={onClose}><X size={19} /></IconButton>
        </header>
        {mode === "scan" ? (
          <>
            <div className="scanner-camera">
              <video ref={videoRef} muted playsInline aria-label="Live QR scanner" />
              <span className="scanner-frame" aria-hidden="true" />
              <span className="scanner-hint">Scan a QR Ph recipient or merchant code</span>
            </div>
            {cameraError && (
              <div className="inline-error" role="alert">
                <AlertCircle size={15} />
                <span>{cameraError}</span>
                <button className="camera-retry" onClick={() => { setCameraError(""); setCameraRetry((retry) => retry + 1); }}>Retry camera</button>
              </div>
            )}
            {decodingUpload && <p className="institution-list-state" role="status"><LoaderCircle className="spin" size={16} />Reading uploaded QR…</p>}
            <input
              ref={uploadRef}
              className="scanner-file-input"
              type="file"
              accept="image/*"
              onChange={(event) => void scanImage(event.target.files?.[0])}
            />
            <div className="scanner-actions">
              <Button variant="secondary" disabled={decodingUpload} onClick={() => uploadRef.current?.click()} icon={<Download size={17} />}>
                Upload a QR
              </Button>
              <Button onClick={() => { setCameraError(""); setMode("collect"); }} icon={<QrCode size={17} />}>
                Generate QR
              </Button>
            </div>
          </>
        ) : mode === "collect" ? (
          <div className="static-qr-collection">
            <p>Customer enters the amount in their QR Ph payment app.</p>
            <img src="/static-qrph.jpg" alt="SwiftPay static QR Ph merchant code" />
            <a className="button button-secondary" href="/static-qrph.jpg" download="swiftpay-static-qrph.jpg">
              <Download size={16} /> Download QR
            </a>
            <Button variant="quiet" onClick={() => setMode("scan")}>Back to scanner</Button>
          </div>
        ) : (
          <div className="merchant-qr-details">
            <span className="merchant-qr-icon"><QrCode size={24} /></span>
            <strong>QR Ph merchant code</strong>
            <dl className="detail-list">
              <div><dt>Merchant</dt><dd>{merchantQr?.merchantName || "Not provided"}</dd></div>
              <div><dt>Merchant ID</dt><dd>{merchantQr?.merchantId || "Not provided"}</dd></div>
              <div><dt>Amount</dt><dd>{merchantQr?.amount
                ? `${merchantQr.currency || "PHP"} ${merchantQr.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "Open amount"}</dd></div>
              {merchantQr?.city && <div><dt>City</dt><dd>{merchantQr.city}</dd></div>}
              {merchantQr?.reference && <div><dt>Reference</dt><dd>{merchantQr.reference}</dd></div>}
            </dl>
            <p>This QR is a merchant payment code. Use it in a payer app to complete the payment.</p>
            <Button onClick={() => { setMerchantQr(null); setCameraError(""); setMode("scan"); }}>Scan another QR</Button>
          </div>
        )}
      </section>
    </div>
  );
}

function PaymentLinkSheet({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [url, setUrl] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [selectingInstitution, setSelectingInstitution] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<PaymentInstitution | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => getPaymentLinkIdempotencyKey());

  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getPaymentLinkStatus(code);
        const status = latest.status || "PENDING";
        setPaymentStatus(status);
        if (isTerminalPaymentStatus(status)) window.clearInterval(timer);
      } catch {
        // Keep the QR visible while a temporary status request is unavailable.
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [code]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSelectingInstitution(true);
  }
  async function createCheckout(institution: PaymentInstitution) {
    setSelectedInstitution(institution);
    setBusy(true);
    setError("");
    try {
      const result = await createPaymentLink({ amount: Number(amount), description, customerEmail, institution }, idempotencyKey);
      setUrl(result.paymentUrl);
      setQrCode(result.qrCode || "");
      setCode(result.code);
      setPaymentStatus(result.status || "PENDING");
      clearPaymentLinkIdempotencyKey();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not create QR checkout";
      setError(message);
      if (!message.toLowerCase().includes("unknown") && !message.toLowerCase().includes("reconcil")) {
        setIdempotencyKey(resetPaymentLinkIdempotencyKey());
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="payment-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <span className="sheet-handle" />
        <header className="sheet-header"><div><span className="eyebrow">POOLED MERCHANT TOOL</span><h2>{url ? "QR checkout" : selectingInstitution ? "Choose payment app" : "QR checkout"}</h2></div><IconButton label="Close" onClick={onClose}><X size={19} /></IconButton></header>
        {url ? <div className="link-result"><div className="result-icon"><QrCode size={23} /></div><strong>Scan to collect payment</strong><p>Show this QR to your customer to scan.</p>{customerEmail.trim() && <p className="accepted-channels">Payment request queued for {customerEmail.trim()}. We’ll email them again when payment is confirmed.</p>}<span className={`payment-state state-${paymentStatus.toLowerCase()}`}>{isConfirmedPaymentStatus(paymentStatus) ? "Payment confirmed by SwiftPay" : `Checkout status: ${paymentStatus || "PENDING"}`}</span><QrPaymentDisplay value={qrCode} institution={selectedInstitution || undefined} /><Button variant="quiet" onClick={onClose}>Done</Button></div> :
          selectingInstitution ? <InstitutionSelectionScreen onBack={() => setSelectingInstitution(false)} onConfirm={(institution) => void createCheckout(institution)} busy={busy} submissionError={error} /> :
          <form onSubmit={submit}><label><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} required /></label><label><span>Fixed amount</span><div className="amount-field"><span>₱</span><input type="number" min="1" step=".01" value={amount} onChange={(event) => setAmount(event.target.value)} required /><small>PHP</small></div></label><label><span>Customer email <small>(optional)</small></span><input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="customer@example.com" autoComplete="email" maxLength={254} /><small>We’ll email the checkout link and send a payment-confirmed email after the customer pays.</small></label>{error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}<Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create QR checkout"}</Button></form>}
      </section>
    </div>
  );
}

function HomeView({
  data,
  onRequestPayment,
  onTransfer,
  onScan,
  onActivity,
  onTransaction,
  onWithdraw,
}: {
  data: DashboardData;
  onRequestPayment: () => void;
  onTransfer: () => void;
  onScan: () => void;
  onActivity: () => void;
  onTransaction: (transaction: Transaction) => void;
  onWithdraw: () => void;
}) {
  const { balanceVisible, toggleBalanceVisibility } = useBalanceVisibility();

  return (
    <>
      <section className="balance-card">
        <div className="balance-top">
          <span>AVAILABLE BALANCE</span>
          <button
            onClick={toggleBalanceVisibility}
            aria-label={balanceVisible ? "Hide balances" : "Show balances"}
            aria-pressed={!balanceVisible}
          >
            <Eye size={15} /> PHP
          </button>
        </div>
        <strong className="balance-value">{balanceVisible ? data.availableBalance : "₱ ••••••"}</strong>
        <div className="balance-floating">
          <div>
            <span className="balance-floating-label">
              <img src="/bank-logos/alipay-plus.svg" alt="Alipay+" />
              Balance
            </span>
            <strong>{balanceVisible ? data.internalWalletBalance : "₱ ••••••"}</strong>
          </div>
          <button type="button" className="balance-withdraw-button" onClick={onWithdraw}>
            Withdraw
          </button>
        </div>
      </section>

      <section className="quick-actions" aria-label="Quick actions">
        <QuickAction icon={<CreditCard size={22} />} label="Collect" onClick={onRequestPayment} />
        <QuickAction icon={<Send size={21} />} label="Transfer" onClick={onTransfer} />
        <QuickAction icon={<QrCode size={21} />} label="Scan QR" onClick={onScan} />
        <QuickAction icon={<ReceiptText size={21} />} label="Activity" onClick={onActivity} />
      </section>

      <section className="summary-card">
        <header className="section-header">
          <div>
            <span className="eyebrow">RECENT WALLET ACTIVITY</span>
            <h2>Money movement</h2>
          </div>
          <button className="period-button">
            Latest 50 <ChevronDown size={14} />
          </button>
        </header>
        <div className="summary-grid">
          <div>
            <span>Incoming payments</span>
            <strong>{data.grossVolume}</strong>
            <small>Confirmed credits</small>
          </div>
          <div>
            <span>Completed payments</span>
            <strong>{data.successfulPayments}</strong>
            <small>Provider-confirmed collections</small>
          </div>
        </div>
        <div className="average-row">
          <span>Average completed payment</span>
          <strong>{data.averageTransaction}</strong>
        </div>
      </section>

      <MerchantActivityChart />

      <section className="activity-section">
        <header className="section-header">
          <div>
            <span className="eyebrow">ACTIVITY</span>
            <h2>Recent activity</h2>
          </div>
          <button className="text-button" onClick={onActivity}>See all</button>
        </header>
        <div className="transaction-list">
          {data.transactions.slice(0, 4).map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} onClick={() => onTransaction(transaction)} />
          ))}
        </div>
      </section>
    </>
  );
}

function MerchantActivityChart() {
  const [points, setPoints] = useState<MerchantActivityTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const requestInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (requestInFlight.current) return;
      requestInFlight.current = true;
      try {
        const result = await getMerchantActivityTrend();
        if (active) {
          setPoints(result);
          setError("");
          setUpdatedAt(new Date());
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load activity.");
      } finally {
        requestInFlight.current = false;
        if (active) setLoading(false);
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [retryKey]);

  const maxValue = Math.max(1, ...points.flatMap((point) => [point.collections, point.transfers]));
  const chartHeight = 150;
  const chartTop = 12;
  const chartBottom = 124;
  const chartLeft = 44;
  const chartRight = 360;
  const yFor = (value: number) => chartBottom - (value / maxValue) * (chartBottom - chartTop);
  const xFor = (index: number) => chartLeft + (index * (chartRight - chartLeft)) / Math.max(points.length - 1, 1);
  const seriesPath = (field: "collections" | "transfers") =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point[field])}`).join(" ");
  const hasActivity = points.some((point) => point.collections > 0 || point.transfers > 0);
  const formatAxisValue = (value: number) =>
    value >= 1000 ? `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `₱${Math.round(value)}`;

  return (
    <section className="merchant-trend-card" aria-labelledby="merchant-trend-title">
      <header className="section-header">
        <div>
          <span className="eyebrow">LAST 7 DAYS</span>
          <h2 id="merchant-trend-title">Collections & transfers</h2>
        </div>
        <span className="merchant-trend-live"><i /> LIVE · 10 SEC</span>
      </header>
      {loading && points.length === 0 ? (
        <p className="merchant-trend-message">Loading activity…</p>
      ) : error && points.length === 0 ? (
        <div className="merchant-trend-message merchant-trend-error" role="status">
          <span>{error}</span>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)}>Retry</button>
        </div>
      ) : (
        <>
          <div className="merchant-trend-legend">
            <span><i className="merchant-trend-collection-dot" /> Collections</span>
            <span><i className="merchant-trend-transfer-dot" /> Transfers</span>
          </div>
          <svg
            className="merchant-trend-svg"
            viewBox={`0 0 380 ${chartHeight}`}
            role="img"
            aria-label="Successful collections and transfers by day over the last seven days"
          >
            {[0, 0.5, 1].map((fraction) => {
              const y = chartBottom - fraction * (chartBottom - chartTop);
              return (
                <g key={fraction}>
                  <line x1={chartLeft} x2={chartRight} y1={y} y2={y} className="merchant-trend-gridline" />
                  <text x={chartLeft - 6} y={y + 3} textAnchor="end" className="merchant-trend-axis">
                    {formatAxisValue(maxValue * fraction)}
                  </text>
                </g>
              );
            })}
            {points.length > 0 && (
              <>
                <path d={seriesPath("collections")} className="merchant-trend-line merchant-trend-collection-line" />
                <path d={seriesPath("transfers")} className="merchant-trend-line merchant-trend-transfer-line" />
                {points.map((point, index) => (
                  <g key={point.date}>
                    <circle cx={xFor(index)} cy={yFor(point.collections)} r="3" className="merchant-trend-collection-point">
                      <title>{`${point.date}: collections ${formatPeso(point.collections)}`}</title>
                    </circle>
                    <circle cx={xFor(index)} cy={yFor(point.transfers)} r="3" className="merchant-trend-transfer-point">
                      <title>{`${point.date}: transfers ${formatPeso(point.transfers)}`}</title>
                    </circle>
                    <text x={xFor(index)} y={chartBottom + 18} textAnchor="middle" className="merchant-trend-axis">
                      {new Date(`${point.date}T00:00:00`).toLocaleDateString("en-PH", { day: "numeric", month: "short" })}
                    </text>
                  </g>
                ))}
              </>
            )}
          </svg>
          {!hasActivity && <p className="merchant-trend-empty">No successful collections or transfers in this period.</p>}
          <div className="merchant-trend-updated">
            {error ? `Update failed: ${error}` : updatedAt ? `Updated ${updatedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : ""}
          </div>
        </>
      )}
    </section>
  );
}

const WALLET_ACTIVITY_FILTERS = ["All activity", "Money in", "Money out", "Completed", "Pending", "Failed"];

function WalletBalancePanel({
  data,
  balanceVisible,
  onToggleBalanceVisibility,
}: {
  data: DashboardData;
  balanceVisible: boolean;
  onToggleBalanceVisibility: () => void;
}) {
  return (
    <section className="wallet-balance-panel">
      <div className="wallet-balance-heading">
        <span>Available balance</span>
        <button type="button" onClick={onToggleBalanceVisibility} aria-label={balanceVisible ? "Hide balances" : "Show balances"} aria-pressed={!balanceVisible}>
          <Eye size={15} /> {balanceVisible ? "Hide" : "Show"}
        </button>
      </div>
      <strong className="wallet-balance-value">{balanceVisible ? data.availableBalance : "₱ ••••••"}</strong>
      <div className="wallet-balance-foot">
        <span><i /> SwiftPay payout account</span>
        <span>{data.paymentEnvironment === "production" ? "Live" : "Sandbox"}</span>
      </div>
    </section>
  );
}

function WalletFloatingBalanceCard({
  data,
  balanceVisible,
}: {
  data: DashboardData;
  balanceVisible: boolean;
}) {
  const [payoutAccount, setPayoutAccount] = useState<MerchantPayoutAccount | null>(null);
  const [payoutAccountLoading, setPayoutAccountLoading] = useState(true);
  const [payoutAccountError, setPayoutAccountError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const collectionTargetKrw = 1_000_000;
  const currentCollectionsKrw = Math.max(0, data.cumulativeKrwCollections);
  const collectionProgress = Math.min(100, (currentCollectionsKrw / collectionTargetKrw) * 100);
  const formatKrw = (amount: number) => `₩${Math.floor(amount).toLocaleString("en-US")}`;
  const [availableToRequest, setAvailableToRequest] = useState(() =>
    Math.max(0, data.availableFloatingBalance - data.transferFeeFixed),
  );
  const maxRequestAmount = Math.min(
    availableToRequest,
    Math.max(0, Math.floor((data.availableFloatingBalance - data.transferFeeFixed) * 100) / 100),
  );
  const thresholdReached = currentCollectionsKrw >= collectionTargetKrw;
  const unlocked = data.paymentEnvironment === "production" && thresholdReached;

  useEffect(() => {
    let active = true;
    getMerchantPayoutAccount().then((account) => {
      if (active) setPayoutAccount(account);
    }).catch((error) => {
      if (active) setPayoutAccountError(error instanceof Error ? error.message : "Could not load the saved payout account.");
    }).finally(() => {
      if (active) setPayoutAccountLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function submitTransferRequest() {
    setRequestError("");
    setRequestMessage("");
    const amount = maxRequestAmount;
    if (amount <= 0) return;
    setRequestSubmitting(true);
    try {
      await createMerchantFloatingTransferRequest({ amount });
      setAvailableToRequest((available) => Math.max(0, available - amount - data.transferFeeFixed));
      setRequestMessage(`${formatPeso(amount)} payout request sent to a super admin for review.`);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Could not submit transfer request.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  return (
    <section className="floating-balance-card">
      <div className="floating-balance-heading"><span className="wallet-ledger-icon"><WalletCards size={18} aria-hidden="true" /></span><div><strong>Unsettled Funds</strong><p>Shared progress across merchants using the same DRPAY PHP wallet.</p></div></div>
      <div className="floating-balance-values">
        <div><small>Total balance</small><strong>{balanceVisible ? data.internalWalletBalance : "₱ ••••••"}</strong></div>
      </div>
      <div className="collection-progress" aria-label={`Shared maintained KRW collections: ${formatKrw(currentCollectionsKrw)} of ${formatKrw(collectionTargetKrw)}`}>
        <p>Shared maintained KRW collections <strong>{balanceVisible ? formatKrw(currentCollectionsKrw) : "₩ ••••••"}</strong></p>
        <div
          className="collection-progress-track"
          role="progressbar"
          aria-label="Shared KRW collections toward the live-wallet unlock threshold"
          aria-valuemin={0}
          aria-valuemax={collectionTargetKrw}
          aria-valuenow={Math.min(collectionTargetKrw, Math.floor(currentCollectionsKrw))}
        >
          <span style={{ width: `${collectionProgress}%` }} />
        </div>
      </div>
      <div className="unsettled-payout-account" aria-label="Saved payout bank account">
        <CreditCard size={17} aria-hidden="true" />
        <div>
          <strong>Payout account</strong>
          {payoutAccountLoading ? <small>Loading saved account…</small> : payoutAccount?.accountNumber ? (
            <>
              <span>{payoutAccount.bankName}</span>
              <small>{payoutAccount.accountName} ···· {payoutAccount.accountNumber.slice(-4)}</small>
            </>
          ) : <small>{payoutAccountError || "No payout account saved. Contact your super admin."}</small>}
        </div>
      </div>
      <div className={`unsettled-unlock-status ${unlocked ? "unsettled-unlock-status-ready" : ""}`} role="status">
        <ShieldCheck size={16} />
        <p>{unlocked
          ? "Unlocked. This progress is shared across merchants and decreases by the KRW equivalent of successful transfers. A super admin will transfer your unsettled funds to your external live SwiftPay PHP wallet."
          : data.paymentEnvironment !== "production"
            ? "All merchants share this progress, and successful transfers reduce it by their KRW equivalent. You can request a transfer before the threshold if admin-set funds are available. This is a sandbox wallet."
            : "At ₩1,000,000 in shared maintained collections, funds unlock for transfer by a super admin. Successful transfers reduce progress by their KRW equivalent. Requests are available before the threshold if admin-set funds are available."}</p>
      </div>
      <section className="unsettled-request-section" aria-label="Request payout">
        <Button icon={<Send size={16} />} onClick={() => void submitTransferRequest()} disabled={requestSubmitting || maxRequestAmount <= 0}>
          {requestSubmitting ? "Requesting…" : "Request Payout"}
        </Button>
        {requestError && <div className="inline-error" role="alert"><AlertCircle size={15} />{requestError}</div>}
        {requestMessage && <p className="unsettled-request-success" role="status">{requestMessage}</p>}
      </section>
    </section>
  );
}

function WalletActivitySection({
  transactions,
  totalTransactions,
  filter,
  query,
  onFilterChange,
  onQueryChange,
  onTransaction,
}: {
  transactions: Transaction[];
  totalTransactions: number;
  filter: string;
  query: string;
  onFilterChange: (filter: string) => void;
  onQueryChange: (query: string) => void;
  onTransaction: (transaction: Transaction) => void;
}) {
  return (
    <>
      <header className="wallet-activity-heading">
        <div><span className="eyebrow">LATEST 50 RECORDS</span><h2>Wallet activity</h2></div>
        <span>{transactions.length} shown</span>
      </header>
      <label className="activity-search"><Search size={16} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search description or reference" aria-label="Search wallet activity" /></label>
      <div className="filter-row">
        {WALLET_ACTIVITY_FILTERS.map((item) => (
          <button key={item} type="button" aria-pressed={filter === item} className={filter === item ? "active" : ""} onClick={() => onFilterChange(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="transaction-list full-list">
        {transactions.length > 0 ? transactions.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} onClick={() => onTransaction(transaction)} />
        )) : (
          <div className="wallet-empty-state">
            <WalletCards size={23} />
            <strong>{totalTransactions ? "No matching activity" : "No wallet activity yet"}</strong>
            <p>{totalTransactions ? "Try a different filter or search term." : "Incoming payments and outgoing transfers will appear here."}</p>
          </div>
        )}
      </div>
    </>
  );
}

function WalletView({
  data,
  onTransaction,
  showUnsettledFunds,
  onOpenUnsettledFunds,
  onCloseUnsettledFunds,
}: {
  data: DashboardData;
  onTransaction: (transaction: Transaction) => void;
  showUnsettledFunds: boolean;
  onOpenUnsettledFunds: () => void;
  onCloseUnsettledFunds: () => void;
}) {
  const [filter, setFilter] = useState("All activity");
  const [query, setQuery] = useState("");
  const { balanceVisible, toggleBalanceVisibility } = useBalanceVisibility();
  const transactions = useMemo(
    () => data.transactions.filter((item) => {
      const matchesFilter =
        filter === "All activity" ||
        (filter === "Money in" && item.numericAmount > 0) ||
        (filter === "Money out" && item.numericAmount < 0) ||
        item.status === filter;
      const matchesQuery = `${item.reference} ${item.customer} ${item.description}`.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    }),
    [data.transactions, filter, query],
  );

  if (showUnsettledFunds) {
    return (
      <section className="wallet-page wallet-unsettled-page">
        <Button variant="quiet" icon={<ChevronLeft size={17} />} onClick={onCloseUnsettledFunds}>Back to Wallet</Button>
        <div className="wallet-subpage-heading">
          <span className="eyebrow">WALLET</span>
          <h2>Unsettled Funds</h2>
          <p>Track your Alipay+ collection threshold for transferring unsettled funds to your live SwiftPay PHP wallet.</p>
        </div>
        <WalletFloatingBalanceCard
          data={data}
          balanceVisible={balanceVisible}
        />
      </section>
    );
  }

  return (
    <section className="wallet-page">
      <WalletBalancePanel data={data} balanceVisible={balanceVisible} onToggleBalanceVisibility={toggleBalanceVisibility} />
      <button type="button" className="wallet-unsettled-entry" onClick={onOpenUnsettledFunds}>
        <span className="wallet-ledger-icon"><WalletCards size={18} aria-hidden="true" /></span>
        <span className="wallet-unsettled-entry-copy">
          <strong>Unsettled Funds</strong>
          <small>Track your live-wallet threshold and fund release</small>
        </span>
        <ChevronRight size={18} />
      </button>
      <WalletActivitySection
        transactions={transactions}
        totalTransactions={data.transactions.length}
        filter={filter}
        query={query}
        onFilterChange={setFilter}
        onQueryChange={setQuery}
        onTransaction={onTransaction}
      />
    </section>
  );
}

function TransfersView({
  data,
  onTransfer,
  onTransaction,
}: {
  data: DashboardData;
  onTransfer: () => void;
  onTransaction: (transaction: Transaction) => void;
}) {
  const { balanceVisible } = useBalanceVisibility();
  const recentTransfers = data.transactions.filter((transaction) => transaction.numericAmount < 0).slice(0, 4);

  return (
    <section className="transfers-page">
      <section className="transfer-balance-panel">
        <div>
          <span>Available balance</span>
          <strong>{balanceVisible ? data.availableBalance : "₱ ••••••"}</strong>
          <small>Provided by your SwiftPay payout account</small>
        </div>
        <Button icon={<Send size={17} />} onClick={onTransfer}>New transfer</Button>
      </section>
      <section className="transfer-methods-card">
        <h2>Choose a transfer network</h2>
        <div className="transfer-method-row">
          <img className="transfer-method-logo" src="/bank-logos/instapay.png" alt="InstaPay logo" />
          <div><strong>InstaPay</strong><p>Real-time network for eligible banks and wallets.</p></div>
        </div>
        <div className="transfer-method-row">
          <img className="transfer-method-logo" src="/bank-logos/pesonet.png" alt="PESONet logo" />
          <div><strong>PESONet</strong><p>Batch network for eligible bank transfers.</p></div>
        </div>
      </section>
      <aside className="transfer-security-note">
        <ShieldCheck size={17} />
        <p><strong>Review before sending</strong> Check the recipient and account details carefully. Approve every transfer with your MPIN, then track its provider-confirmed status in Wallet.</p>
      </aside>
      <section className="transfer-activity-section">
        <header className="wallet-activity-heading">
          <div><span className="eyebrow">MONEY OUT</span><h2>Recent transfers</h2></div>
          <span>{recentTransfers.length} shown</span>
        </header>
        {recentTransfers.length ? (
          <div className="transaction-list full-list">
            {recentTransfers.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} onClick={() => onTransaction(transaction)} />
            ))}
          </div>
        ) : (
          <div className="wallet-empty-state transfer-empty-state">
            <Send size={22} />
            <strong>No transfers yet</strong>
            <p>Your outgoing transfers will appear here after you submit one.</p>
            <Button variant="secondary" onClick={onTransfer}>Start a transfer</Button>
          </div>
        )}
      </section>
    </section>
  );
}

function MoreView({
  session,
  data,
  onPaymentLink,
  onInfo,
  onSignOut,
}: {
  session: Session;
  data: DashboardData;
  onPaymentLink: () => void;
  onInfo: (title: string) => void;
  onSignOut: () => void;
}) {
  const items = [
    { label: "Merchant profile", description: "Business and account details", icon: Store, action: () => onInfo("Merchant profile") },
    ...(data.walletMode === "pooled" ? [{ label: "QR checkouts", description: "Create a self-hosted QR Ph checkout", icon: QrCode, action: onPaymentLink }] : []),
    { label: "Transfer banks", description: "InstaPay and PESONet", icon: CreditCard, action: () => onInfo("Transfer banks") },
    { label: "Statements", description: "View and download wallet activity", icon: ReceiptText, action: () => onInfo("Statements") },
    { label: "Notifications", description: "Email and push alerts", icon: Bell, action: () => onInfo("Notifications") },
    { label: "Security", description: "Session and device protection", icon: ShieldCheck, action: () => onInfo("Security") },
    { label: "API documentation", description: "Merchant integration guide", icon: Settings, action: () => onInfo("API documentation") },
    { label: "Help center", description: "DRPAY merchant support", icon: CircleHelp, action: () => onInfo("Help center") },
  ];

  return (
    <section className="more-page">
      <div className="profile-card">
        <span className="profile-avatar">DV</span>
        <div>
          <strong>{session.email}</strong>
          <span>{session.role.replace("_", " ")} · {data.walletAccounting === "merchant_ledger" ? "merchant-specific PHP ledger" : data.walletMode + " PHP wallet"}</span>
          <span className="merchant-verified-badge"><ShieldCheck size={12} aria-hidden="true" /> Verified</span>
        </div>
        <ShieldCheck size={20} />
      </div>
      <div className="settings-list">
        {items.map(({ label, description, icon: Icon, action }) => (
          <button key={label} onClick={action}>
            <span className="setting-icon"><Icon size={19} /></span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <Button variant="secondary" className="sign-out-button" icon={<LogOut size={17} />} onClick={onSignOut}>Sign out</Button>
      <div className="powered-by">
        <Brand />
        <span>Secure payments powered by SwiftPay</span>
      </div>
      <nav className="app-legal-links" aria-label="Legal and support">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/contact">Contact Us</a>
      </nav>
    </section>
  );
}

function ProfileInfoPage({
  title,
  session,
  data,
  securityStatus,
  notificationPermission,
  pushRegistrationState,
  pushError,
  biometricAvailable,
  biometricEnabled,
  biometricBusy,
  biometricError,
  onClose,
  onExport,
  onEnablePush,
  onEnableBiometric,
  onDisableBiometric,
}: {
  title: string;
  session: Session;
  data: DashboardData;
  securityStatus: MerchantSecurityStatus | null;
  notificationPermission: string;
  pushRegistrationState: "idle" | "registering" | "registered" | "error";
  pushError: string;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricBusy: boolean;
  biometricError: string;
  onClose: () => void;
  onExport: () => void;
  onEnablePush: () => void;
  onEnableBiometric: () => void;
  onDisableBiometric: () => void;
}) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(false);
  const [institutionsError, setInstitutionsError] = useState("");
  const [retryInstitutions, setRetryInstitutions] = useState(0);
  const { balanceVisible } = useBalanceVisibility();

  useEffect(() => {
    if (title !== "Transfer banks") return;
    let active = true;
    setInstitutionsLoading(true);
    setInstitutionsError("");
    getInstitutions().then((result) => {
      if (active) setInstitutions(result);
    }).catch((requestError) => {
      if (active) setInstitutionsError(requestError instanceof Error ? requestError.message : "Could not load transfer banks.");
    }).finally(() => {
      if (active) setInstitutionsLoading(false);
    });
    return () => { active = false; };
  }, [title, retryInstitutions]);

  const successfulTransactions = data.transactions.filter((transaction) => transaction.status === "Completed");
  const pendingTransactions = data.transactions.filter((transaction) => transaction.status === "Pending");
  const failedTransactions = data.transactions.filter((transaction) => transaction.status === "Failed");

  return (
    <section className="profile-info-page" aria-label={title}>
      <header className="profile-info-page-header">
        <button className="profile-back-button" onClick={onClose}><ChevronLeft size={16} /> Profile</button>
      </header>

        {title === "Merchant profile" && (
          <>
            <div className="profile-detail-hero">
              <span className="profile-avatar"><Store size={20} /></span>
              <div>
                <strong>{session.email}</strong>
                <span className="merchant-verified-badge"><ShieldCheck size={12} aria-hidden="true" /> Verified merchant</span>
              </div>
            </div>
            <dl className="detail-list">
              <div><dt>Account role</dt><dd>{session.role.replace("_", " ")}</dd></div>
              <div><dt>Wallet type</dt><dd>{data.walletAccounting === "merchant_ledger" ? "Merchant-specific DRPAY ledger" : data.walletAccounting === "provider_wallet" ? "Pooled provider wallet" : "Internal ledger"}</dd></div>
              <div><dt>Account number</dt><dd>{data.accountNumber ? `•••• ${data.accountNumber.slice(-4)}` : "Not provided"}</dd></div>
              <div><dt>Available balance</dt><dd>{balanceVisible ? data.availableBalance : "₱ ••••••"}</dd></div>
              <div><dt>Environment</dt><dd>{data.paymentEnvironment === "production" ? "Live" : "Sandbox"}</dd></div>
            </dl>
            <div className="profile-info-intro"><strong>Merchant wallet accounting</strong><p>Your DRPAY balance is calculated from collections attributed to this merchant, less completed transfers and pending requests. SwiftPay settlement still uses DRPAY's pooled provider account.</p></div>
            <div className="profile-info-intro"><strong>Unsettled funds release</strong><p>After the live-wallet collection threshold is reached, a super admin transfers unlocked funds to your external live SwiftPay PHP wallet. Your regular transfer flow remains unchanged.</p></div>
          </>
        )}

        {title === "Transfer banks" && (
          <>
            <div className="profile-info-intro"><strong>Supported transfer destinations</strong><p>Availability is provided by SwiftPay. Each bank may support InstaPay, PESONet, or both.</p></div>
            {institutionsLoading ? <div className="profile-sheet-state" role="status"><LoaderCircle className="spin" size={17} />Loading supported banks…</div> : institutionsError ? (
              <div className="inline-error" role="alert"><AlertCircle size={15} />{institutionsError}<button className="profile-inline-action" onClick={() => setRetryInstitutions((attempt) => attempt + 1)}>Retry</button></div>
            ) : institutions.length === 0 ? <p className="profile-sheet-state">No transfer banks are currently available.</p> : (
              <div className="profile-bank-list">
                {institutions.map((institution) => (
                  <div className="profile-bank-row" key={institution.code}>
                    <InstitutionLogo institution={institution} className="profile-bank-logo" />
                    <strong>{institution.name}</strong>
                    <span className="profile-rails">
                      {institution.instapayEnabled && <small>InstaPay</small>}
                      {institution.pesonetEnabled && <small>PESONet</small>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {title === "Statements" && (
          <>
            <div className="profile-statement-summary">
              <div><strong>{data.transactions.length}</strong><span>Transactions</span></div>
              <div><strong>{successfulTransactions.length}</strong><span>Completed</span></div>
              <div><strong>{pendingTransactions.length}</strong><span>Pending</span></div>
              <div><strong>{failedTransactions.length}</strong><span>Failed</span></div>
            </div>
            <div className="profile-info-intro"><strong>Recent wallet activity</strong><p>Download the available activity as a CSV statement for your records.</p></div>
            {data.transactions.length > 0 ? (
              <div className="profile-recent-list">
                {data.transactions.slice(0, 5).map((transaction) => (
                  <div key={transaction.id}><span><strong>{transaction.description}</strong><small>{transaction.date} · {transaction.status}</small></span><strong>{transaction.amount}</strong></div>
                ))}
              </div>
            ) : <p className="profile-sheet-state">No wallet activity is available yet.</p>}
            <Button icon={<Download size={16} />} onClick={onExport}>Download CSV statement</Button>
          </>
        )}

        {title === "Security" && (
          <>
            <div className="profile-security-status"><span><ShieldCheck size={20} /></span><div><strong>Account protection</strong><small>Security controls for this merchant session</small></div></div>
            <dl className="detail-list">
              <div><dt>Device verification</dt><dd>Email code required</dd></div>
              <div><dt>Transfer approval</dt><dd>{securityStatus?.pinConfigured ? "MPIN enabled" : "MPIN setup required"}</dd></div>
              <div><dt>Biometric sign-in</dt><dd>{biometricEnabled ? "Enabled on this device" : biometricAvailable ? "Available on this device" : "Not available on this device"}</dd></div>
              <div><dt>Session expires</dt><dd>{new Date(session.expiresAt).toLocaleString()}</dd></div>
            </dl>
            {biometricError && <div className="inline-error" role="alert"><AlertCircle size={15} />{biometricError}</div>}
            {(biometricAvailable || biometricEnabled) && (
              <>
                <Button disabled={biometricBusy} variant={biometricEnabled ? "secondary" : "primary"} onClick={biometricEnabled ? onDisableBiometric : onEnableBiometric} icon={biometricBusy ? <LoaderCircle className="spin" size={16} /> : <Fingerprint size={16} />}>
                  {biometricBusy ? "Updating…" : biometricEnabled ? "Disable biometric sign-in" : "Enable biometric sign-in"}
                </Button>
              </>
            )}
            {!biometricAvailable && supportsBiometricLogin() && <p className="profile-info-note">Enroll a strong biometric in Android settings to use biometric sign-in. Your MPIN and email verification remain available.</p>}
            <p className="profile-info-note">Never share your one-time code or MPIN. Every outgoing transfer requires MPIN approval.</p>
          </>
        )}

        {title === "Notifications" && (
          <>
            <div className="profile-notification-option">
              <span className="profile-notification-icon"><ReceiptText size={18} /></span>
              <div><strong>Email notifications</strong><small>Successful incoming payments and outgoing transfers</small><small>{session.email}</small></div>
              <span className="profile-notification-state">ON</span>
            </div>
            <div className="profile-notification-option">
              <span className="profile-notification-icon"><Bell size={18} /></span>
              <div>
                <strong>Push notifications</strong>
                <small>{notificationPermission === "unavailable"
                  ? "Push notifications are available in the Android app"
                  : notificationPermission === "denied"
                    ? "Permission is blocked in device settings"
                    : pushRegistrationState === "registered"
                      ? "This device is registered for transaction alerts"
                      : pushRegistrationState === "registering"
                        ? "Registering this device for transaction alerts…"
                        : pushRegistrationState === "error"
                          ? "Device registration needs attention"
                          : notificationPermission === "granted"
                            ? "Permission is enabled; finish device registration"
                            : "Enable alerts on this device for successful transactions"}</small>
              </div>
              <span className={`profile-notification-state ${pushRegistrationState === "registered" ? "enabled" : ""}`}>
                {notificationPermission === "unavailable" ? "APP ONLY" : notificationPermission === "denied" ? "BLOCKED" : pushRegistrationState === "registered" ? "ON" : pushRegistrationState === "registering" ? "SETUP" : notificationPermission === "granted" ? "RETRY" : "OFF"}
              </span>
            </div>
            {pushError && <div className="inline-error" role="alert"><AlertCircle size={15} />{pushError}</div>}
            {notificationPermission !== "unavailable" && (
              <Button onClick={onEnablePush} disabled={pushRegistrationState === "registering"} icon={<Bell size={16} />}>{notificationPermission === "granted" ? "Retry push setup" : notificationPermission === "denied" ? "Check notification permission" : "Enable push notifications"}</Button>
            )}
            {notificationPermission === "denied" && <p className="profile-info-note">If access is still blocked, enable notifications in Android Settings → Apps → DRPAY → Notifications.</p>}
            <p className="profile-info-note">Email alerts are sent after the payment provider confirms the transaction. Push alerts require notification permission and Firebase setup on this device and server.</p>
          </>
        )}

        {title === "API documentation" && (
          <>
            <div className="profile-info-intro"><strong>Merchant API reference</strong><p>The merchant app calls your configured DRPAY backend. Authenticated endpoints use the merchant session; provider credentials remain server-side.</p></div>
            <div className="profile-guide-list">
              <div><span>GET</span><p><strong>/v1/wallet/balance</strong>Retrieve the merchant wallet balance.</p></div>
              <div><span>GET</span><p><strong>/v1/wallet/activity</strong>Read wallet transactions with limit and offset pagination.</p></div>
              <div><span>GET</span><p><strong>/v1/disbursement-institutions</strong>List supported transfer destinations and rails.</p></div>
              <div><span>POST</span><p><strong>/v1/payment-links</strong>Create a PHP hosted checkout using an idempotency key.</p></div>
              <div><span>POST</span><p><strong>/v1/disbursements</strong>Submit a transfer with MPIN step-up authorization and an idempotency key.</p></div>
            </div>
            <p className="profile-info-note">These routes are served by your configured backend. Ask your DRPAY administrator for the API base URL and integration access. Never expose SwiftPay secret keys in client code.</p>
          </>
        )}

        {title === "Help center" && (
          <>
            <div className="profile-info-intro"><strong>How can we help?</strong><p>Use these steps to resolve common account and payment questions.</p></div>
            <div className="profile-guide-list">
              <div><span><CircleHelp size={16} /></span><p><strong>Payment or transfer issue</strong>Keep the transaction reference and current status available when requesting help.</p></div>
              <div><span><WalletCards size={16} /></span><p><strong>Balance question</strong>Refresh the dashboard and compare the wallet activity with your statement.</p></div>
              <div><span><ShieldCheck size={16} /></span><p><strong>Sign-in or security</strong>Verify your device using the email code. Never share your MPIN or one-time code.</p></div>
            </div>
            <p className="profile-info-note">Contact DRPAY support at <a href="mailto:support@denpay.cc">support@denpay.cc</a>. Include the transaction reference and status, but never send your MPIN or one-time verification code.</p>
          </>
        )}

      <Button variant="secondary" onClick={onClose}>Back to profile</Button>
    </section>
  );
}

const tabs = [
  { label: "Home", icon: Home },
  { label: "Wallet", icon: WalletCards },
  { label: "Collect", icon: Plus },
  { label: "Transfer", icon: Send },
  { label: "Profile", icon: Store },
];

export default function App() {
  const checkoutCode = /^\/checkout\/([A-Za-z0-9_-]{40,50})\/?$/.exec(window.location.pathname)?.[1] || "";
  const isAdminConsole = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
  const isDashboard = Capacitor.isNativePlatform() || window.location.pathname === "/app" || window.location.pathname.startsWith("/app/");
  const [session, setSession] = useState<Session | null>(() => isDashboard || isAdminConsole ? getSession() : null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [securityStatus, setSecurityStatus] = useState<MerchantSecurityStatus | null>(null);
  const [activeTab, setActiveTab] = useState("Home");
  const [walletSubscreen, setWalletSubscreen] = useState<"overview" | "unsettled-funds">("overview");
  const [profileSection, setProfileSection] = useState("");
  const [pushPermission, setPushPermission] = useState("prompt");
  const [pushRegistrationState, setPushRegistrationState] = useState<"idle" | "registering" | "registered" | "error">("idle");
  const [pushError, setPushError] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricOfferEmail, setBiometricOfferEmail] = useState("");
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState("");
  const pushTokenRef = useRef("");
  const biometricOfferPendingRef = useRef(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [transferQrPrefill, setTransferQrPrefill] = useState<TransferQrDetails | undefined>();
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; downloadUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dismissedUpdateVersionRef = useRef("");

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let active = true;
    let lastCheckAt = 0;
    let retryTimer = 0;
    let requestController: AbortController | null = null;

    async function checkForUpdate() {
      if (!active || !navigator.onLine || Date.now() - lastCheckAt < 5 * 60 * 1000) return;
      lastCheckAt = Date.now();
      requestController = new AbortController();
      try {
        const [appInfo, response] = await Promise.all([
          CapacitorApp.getInfo(),
          fetch("https://api.github.com/repos/blackhorsecn/drpay-merchant/releases/latest", {
            headers: { Accept: "application/vnd.github+json" },
            cache: "no-store",
            signal: requestController.signal,
          }),
        ]);
        if (!response.ok) throw new Error(`Release check failed (${response.status}).`);
        const release = await response.json() as {
          tag_name?: string;
          draft?: boolean;
          prerelease?: boolean;
          assets?: { name?: string; browser_download_url?: string }[];
        };
        const versionMatch = /^android-v(\d+\.\d+\.\d+)$/.exec(release.tag_name || "");
        const apk = release.assets?.find((asset) => asset.name === "drpay.apk");
        if (!active || release.draft || release.prerelease || !versionMatch || !apk?.browser_download_url) return;
        const downloadUrl = new URL(apk.browser_download_url);
        if (downloadUrl.protocol !== "https:" || downloadUrl.hostname !== "github.com") {
          throw new Error("The latest APK release has an invalid download URL.");
        }
        const latestVersion = versionMatch[1];
        if (compareAppVersions(latestVersion, appInfo.version) > 0
          && dismissedUpdateVersionRef.current !== latestVersion) {
          setUpdateAvailable({ version: latestVersion, downloadUrl: downloadUrl.toString() });
        }
      } catch (checkError) {
        if (active && !(checkError instanceof DOMException && checkError.name === "AbortError")) {
          console.warn("Could not check for an Android app update", checkError);
        }
      }
    }

    const handleOnline = () => {
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        lastCheckAt = 0;
        void checkForUpdate();
      }, 500);
    };
    const handleOffline = () => requestController?.abort();

    void checkForUpdate();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
      requestController?.abort();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const enablePushNotifications = useCallback(async () => {
    if (Capacitor.getPlatform() !== "android") {
      setPushPermission("unavailable");
      return;
    }
    setPushError("");
    setPushRegistrationState("registering");
    try {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === "denied") {
        setPushPermission("denied");
        setPushRegistrationState("idle");
        setPushError("Notifications are blocked for DRPAY. Enable them in Android Settings > Apps > DRPAY > Notifications.");
        return;
      }
      if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
      setPushPermission(permission.receive);
      if (permission.receive !== "granted") {
        setPushRegistrationState("idle");
        setPushError("Allow notifications to receive transaction alerts on this device.");
        return;
      }
      await PushNotifications.createChannel({
        id: "drpay-transactions",
        name: "Transaction alerts",
        description: "Successful incoming payments and outgoing transfers",
        importance: 4,
        visibility: 0,
        vibration: true,
      });
      await PushNotifications.register();
    } catch (requestError) {
      setPushRegistrationState("error");
      setPushError(requestError instanceof Error ? requestError.message : "Push notification setup failed.");
    }
  }, []);

  function handleMerchantAuthenticated(nextSession: Session) {
    biometricOfferPendingRef.current = true;
    setBiometricOfferEmail("");
    setBiometricError("");
    setSession(nextSession);
  }

  function dismissBiometricOffer() {
    if (biometricOfferEmail) markBiometricOfferDismissed(biometricOfferEmail);
    setBiometricOfferEmail("");
    setBiometricError("");
  }

  async function enableBiometricSignIn() {
    if (!session || session.role !== "merchant") return;
    setBiometricBusy(true);
    setBiometricError("");
    const secret = createBiometricSecret();
    let localCredentialStored = false;
    try {
      await storeBiometricSecret(session.email, secret);
      localCredentialStored = true;
      await registerBiometricCredential(secret);
      markBiometricLoginEnabled(session.email);
      setBiometricEnabled(true);
      setBiometricOfferEmail("");
    } catch (requestError) {
      if (localCredentialStored) {
        try {
          await deleteBiometricSecret(session.email);
        } catch (cleanupError) {
          console.error("Could not remove incomplete biometric credential", cleanupError);
        }
      }
      setBiometricError(requestError instanceof Error ? requestError.message : "Could not enable biometric sign-in.");
    } finally {
      setBiometricBusy(false);
    }
  }

  async function disableBiometricSignIn() {
    if (!session || session.role !== "merchant") return;
    setBiometricBusy(true);
    setBiometricError("");
    try {
      await removeBiometricCredential();
      markBiometricLoginDisabled(session.email);
      setBiometricEnabled(false);
      try {
        await deleteBiometricSecret(session.email);
      } catch (cleanupError) {
        console.error("Biometric credential was revoked, but local cleanup failed", cleanupError);
        setBiometricError("Biometric sign-in is disabled on the server, but this device could not remove its saved key.");
      }
    } catch (requestError) {
      setBiometricError(requestError instanceof Error ? requestError.message : "Could not disable biometric sign-in.");
    } finally {
      setBiometricBusy(false);
    }
  }

  useEffect(() => {
    if (!session || session.role !== "merchant" || !isDashboard || !supportsBiometricLogin()) {
      setBiometricAvailable(false);
      setBiometricEnabled(false);
      return;
    }
    let active = true;
    const enabled = hasBiometricLogin(session.email);
    setBiometricEnabled(enabled);
    void isBiometricLoginAvailable().then((available) => {
      if (!active) return;
      setBiometricAvailable(available);
      if (biometricOfferPendingRef.current) {
        biometricOfferPendingRef.current = false;
        if (available && !enabled && !wasBiometricOfferDismissed(session.email)) {
          setBiometricOfferEmail(session.email);
        }
      }
    }).catch((requestError: unknown) => {
      if (!active) return;
      biometricOfferPendingRef.current = false;
      setBiometricAvailable(false);
      setBiometricError(requestError instanceof Error ? requestError.message : "Could not check biometric availability on this device.");
      console.error("Could not check native biometric availability", requestError);
    });
    return () => { active = false; };
  }, [session?.email, session?.role, isDashboard]);

  async function loadDashboard() {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const [dashboard, security] = await Promise.all([getMerchantDashboard(), getMerchantSecurityStatus()]);
      setData(dashboard);
      setSecurityStatus(security);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load your wallet";
      setError(message);
      if (message.toLowerCase().includes("session")) setSession(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isDashboard) return;
    void loadDashboard();
    // Session changes are the intended refresh boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isDashboard]);

  useEffect(() => {
    if (!session || !isDashboard || Capacitor.getPlatform() !== "android") {
      if (Capacitor.getPlatform() !== "android") {
        setPushPermission("unavailable");
        setPushRegistrationState("idle");
      }
      return;
    }
    let active = true;
    const listeners: { remove: () => Promise<void> }[] = [];
    async function registerDevice() {
      setPushRegistrationState("idle");
      setPushError("");
      try {
        listeners.push(await PushNotifications.addListener("registration", ({ value }) => {
          if (!active || !getSession()) return;
          pushTokenRef.current = value;
          setPushRegistrationState("registering");
          void registerPushDevice(value).then(() => {
            if (active) {
              setPushRegistrationState("registered");
              setPushError("");
            }
          }).catch((requestError: unknown) => {
            if (active) {
              setPushRegistrationState("error");
              setPushError(requestError instanceof Error ? requestError.message : "Could not register this device for push notifications.");
            }
          });
        }));
        listeners.push(await PushNotifications.addListener("registrationError", (registrationError) => {
          if (active) {
            setPushRegistrationState("error");
            setPushError(registrationError.error || "Firebase push registration failed. Check the Android Firebase app configuration.");
          }
        }));
        const permission = await PushNotifications.checkPermissions();
        if (!active) return;
        setPushPermission(permission.receive);
        if (permission.receive === "granted") await enablePushNotifications();
      } catch (requestError) {
        if (active) {
          setPushRegistrationState("error");
          setPushError(requestError instanceof Error ? requestError.message : "Push notification setup failed.");
        }
      }
    }
    void registerDevice();
    return () => {
      active = false;
      for (const listener of listeners) void listener.remove();
    };
  }, [session?.email, isDashboard, enablePushNotifications]);

  function signOut() {
    clearSession();
    if (pushTokenRef.current) {
      void removePushDevice(pushTokenRef.current).catch((requestError: unknown) => {
        console.error("Could not remove signed-out device push token", requestError);
      });
      pushTokenRef.current = "";
    }
    if (Capacitor.getPlatform() === "android") {
      void PushNotifications.unregister().catch((requestError: unknown) => {
        console.error("Could not unregister signed-out device push notifications", requestError);
      });
    }
    setPushRegistrationState("idle");
    setPushError("");
    setSession(null);
    setData(null);
    setSecurityStatus(null);
    setBiometricOfferEmail("");
    setBiometricError("");
    biometricOfferPendingRef.current = false;
    setProfileSection("");
    setActiveTab("Home");
  }

  function exportActivity() {
    if (!data) return;
    const rows = data.transactions.map((item) =>
      [item.date, item.reference, item.description, item.channel, item.rawStatus, item.numericAmount].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","),
    );
    const blob = new Blob(
      [[["Date", "Reference", "Description", "Channel", "Status", "Amount PHP"].join(","), ...rows].join("\n")],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drpay-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function dismissUpdatePrompt() {
    if (!updateAvailable) return;
    dismissedUpdateVersionRef.current = updateAvailable.version;
    setUpdateAvailable(null);
  }

  const legalPage = getLegalPage(window.location.pathname);
  if (checkoutCode) return <Checkout code={checkoutCode} />;
  if (legalPage) return <LegalPage page={legalPage} />;
  if (!isDashboard && !isAdminConsole) return <MarketingHome />;

  if (!isBackendConfigured()) {
    return (
      <>
        <main className="auth-screen">
          <div className="auth-brand"><Brand /></div>
          <section className="auth-card">
            <span className="auth-mark"><AlertCircle size={27} /></span>
            <span className="eyebrow">LIVE PAYMENTS DISABLED</span>
            <h1>Backend connection required</h1>
            <p>DRPAY is not connected to a merchant backend. Wallet balances, sign-in, collections, and transfers are unavailable until the backend is configured.</p>
            <div className="inline-error"><Lock size={15} />No simulated balances or transactions are shown.</div>
          </section>
        </main>
        {updateAvailable && <UpdateAvailablePrompt {...updateAvailable} onDismiss={dismissUpdatePrompt} />}
      </>
    );
  }

  if (isAdminConsole) {
    if (!session) return <SuperAdminSignIn onAuthenticated={setSession} />;
    if (session.role !== "super_admin") {
      return (
        <main className="auth-screen">
          <div className="auth-brand"><Brand /></div>
          <section className="auth-card">
            <span className="auth-mark"><Lock size={25} /></span>
            <span className="eyebrow">ACCESS DENIED</span>
            <h1>Admin role required</h1>
            <p>This account cannot access the super-admin console.</p>
            <Button variant="secondary" onClick={signOut}>Sign out</Button>
          </section>
        </main>
      );
    }
    return <SuperAdminConsole session={session} onSignOut={signOut} />;
  }

  if (!session) {
    return (
      <>
        <SignIn onAuthenticated={handleMerchantAuthenticated} />
        {updateAvailable && <UpdateAvailablePrompt {...updateAvailable} onDismiss={dismissUpdatePrompt} />}
      </>
    );
  }

  if (session.role === "merchant" && securityStatus && !securityStatus.pinConfigured) {
    return (
      <>
        <SecuritySetupScreen initialStatus={securityStatus} onComplete={setSecurityStatus} onSignOut={signOut} />
        {updateAvailable && <UpdateAvailablePrompt {...updateAvailable} onDismiss={dismissUpdatePrompt} />}
      </>
    );
  }

  if (!data && loading) {
    return (
      <>
        <DashboardLoading />
        {updateAvailable && <UpdateAvailablePrompt {...updateAvailable} onDismiss={dismissUpdatePrompt} />}
      </>
    );
  }

  if (!data) {
    return (
      <>
        <main className="dashboard-error-screen error-screen" role="alert">
          <AlertCircle size={28} />
          <h1>Wallet unavailable</h1>
          <p>{error || "We couldn’t load your merchant wallet."}</p>
          <Button variant="secondary" onClick={loadDashboard} icon={<RefreshCw size={16} />}>Retry</Button>
          <Button variant="quiet" onClick={signOut}>Sign out</Button>
        </main>
        {updateAvailable && <UpdateAvailablePrompt {...updateAvailable} onDismiss={dismissUpdatePrompt} />}
      </>
    );
  }

  return (
    <div className="app-stage">
      <main className="mobile-app">
        <header className="app-header">
          <h1 className="app-header-title">
            {activeTab === "Home" ? "Dashboard" : activeTab === "Transfer" ? "Transfers" : activeTab === "Profile" ? profileSection || "Profile" : activeTab === "Wallet" && walletSubscreen === "unsettled-funds" ? "Unsettled Funds" : activeTab}
          </h1>
          <div className="header-actions">
            <span className={`live-pill environment-${data.paymentEnvironment}`}><i />{data.paymentEnvironment === "production" ? "Live" : "Sandbox"}</span>
            <IconButton label="Refresh wallet" onClick={loadDashboard}>
              <RefreshCw className={loading ? "spin" : ""} size={18} />
            </IconButton>
            <IconButton label="Notifications" onClick={() => setShowNotifications(true)}>
              <Bell size={19} />
            </IconButton>
          </div>
        </header>

        <div className="app-scroll">
          {error && <div className="data-warning"><AlertCircle size={15} />{error}<button onClick={loadDashboard}>Retry</button></div>}
          <div key={activeTab} className="page-transition" role="region" aria-label={`${activeTab} page`}>
            {activeTab === "Home" && (
              <HomeView
                data={data}
                onRequestPayment={() => setShowPayment(true)}
                onTransfer={() => setShowTransfer(true)}
                onScan={() => setShowScanner(true)}
                onActivity={() => setActiveTab("Wallet")}
                onTransaction={setSelectedTransaction}
                onWithdraw={() => { setWalletSubscreen("unsettled-funds"); setActiveTab("Wallet"); }}
              />
            )}
            {activeTab === "Wallet" && <WalletView
              data={data}
              onTransaction={setSelectedTransaction}
              showUnsettledFunds={walletSubscreen === "unsettled-funds"}
              onOpenUnsettledFunds={() => setWalletSubscreen("unsettled-funds")}
              onCloseUnsettledFunds={() => setWalletSubscreen("overview")}
            />}
            {activeTab === "Transfer" && (
              <TransfersView data={data} onTransfer={() => setShowTransfer(true)} onTransaction={setSelectedTransaction} />
            )}
            {activeTab === "Profile" && (profileSection ? (
              <ProfileInfoPage
                title={profileSection}
                session={session}
                data={data}
                securityStatus={securityStatus}
                notificationPermission={pushPermission}
                pushRegistrationState={pushRegistrationState}
                pushError={pushError}
                biometricAvailable={biometricAvailable}
                biometricEnabled={biometricEnabled}
                biometricBusy={biometricBusy}
                biometricError={biometricError}
                onClose={() => setProfileSection("")}
                onExport={exportActivity}
                onEnablePush={() => void enablePushNotifications()}
                onEnableBiometric={() => void enableBiometricSignIn()}
                onDisableBiometric={() => void disableBiometricSignIn()}
              />
            ) : (
              <MoreView session={session} data={data} onPaymentLink={() => setShowPaymentLink(true)} onInfo={setProfileSection} onSignOut={signOut} />
            ))}
          </div>
        </div>

        <nav className="bottom-nav" aria-label="App navigation">
          {tabs.map(({ label, icon: Icon }) => {
            const isPay = label === "Collect";
            return (
              <button
                key={label}
                className={`${activeTab === label ? "active" : ""} ${isPay ? "pay-tab" : ""}`}
                onClick={() => {
                  if (isPay) {
                    setShowPayment(true);
                    return;
                  }
                  setWalletSubscreen("overview");
                  setActiveTab(label);
                }}
              >
                <span><Icon size={isPay ? 23 : 20} strokeWidth={isPay ? 2.4 : 1.9} /></span>
                <small>{label}</small>
              </button>
            );
          })}
        </nav>
      </main>

      {showPayment && <PaymentSheet onClose={() => { setShowPayment(false); void loadDashboard(); }} />}
      {showTransfer && (
        <TransferSheet
          balance={data.balance}
          initialValues={transferQrPrefill}
          onClose={() => { setShowTransfer(false); setTransferQrPrefill(undefined); }}
          onComplete={loadDashboard}
        />
      )}
      {showScanner && (
        <ScannerSheet
          onClose={() => setShowScanner(false)}
          onTransferQr={(details) => {
            setTransferQrPrefill(details);
            setShowScanner(false);
            setShowTransfer(true);
          }}
        />
      )}
      {showPaymentLink && <PaymentLinkSheet onClose={() => { setShowPaymentLink(false); void loadDashboard(); }} />}
      {selectedTransaction && (
        <TransactionSheet
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onComplete={() => void loadDashboard()}
          onRepeatTransfer={(details) => {
            setSelectedTransaction(null);
            setTransferQrPrefill(details);
            setShowTransfer(true);
          }}
        />
      )}
      {biometricOfferEmail && session?.role === "merchant" && session.email === biometricOfferEmail && securityStatus?.pinConfigured && (
        <BiometricEnrollmentPrompt
          busy={biometricBusy}
          error={biometricError}
          onEnable={() => void enableBiometricSignIn()}
          onSkip={dismissBiometricOffer}
        />
      )}
      {showNotifications && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setShowNotifications(false)}>
          <section className="payment-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <span className="sheet-handle" />
            <header className="sheet-header"><div><span className="eyebrow">ACCOUNT ACTIVITY</span><h2>Notifications</h2></div><IconButton label="Close" onClick={() => setShowNotifications(false)}><X size={19} /></IconButton></header>
            <div className="notification-list">
              {data.transactions.slice(0, 5).map((transaction) => (
                <div key={transaction.id}>
                  <span className="notification-icon">{transaction.numericAmount >= 0 ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
                  <div>
                    <strong>{transaction.status === "Completed" ? "Transaction completed" : `Transaction ${transaction.status.toLowerCase()}`}</strong>
                    <p>{transaction.customer} · {transaction.amount}</p>
                    <small>{transaction.date} · {transaction.reference}</small>
                  </div>
                </div>
              ))}
              {data.transactions.length === 0 && <p>No wallet activity yet.</p>}
            </div>
            <Button variant="secondary" onClick={() => setShowNotifications(false)}>Done</Button>
          </section>
        </div>
      )}
      {updateAvailable && <UpdateAvailablePrompt {...updateAvailable} onDismiss={() => {
        dismissedUpdateVersionRef.current = updateAvailable.version;
        setUpdateAvailable(null);
      }} />}
    </div>
  );
}

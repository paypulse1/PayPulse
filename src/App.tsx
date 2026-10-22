import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Download,
  Eye,
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
  createAdminMerchantAccount,
  createTransfer,
  clearPaymentLinkIdempotencyKey,
  createAdminInternalWalletAdjustment,
  getInstitutions,
  getKrwPhpQuote,
  getAdminInternalWallet,
  getAdminInternalWallets,
  getAdminMerchantAccounts,
  getAdminSettings,
  getMerchantDashboard,
  getMerchantSecurityStatus,
  getPaymentLinkIdempotencyKey,
  getPaymentLinkStatus,
  getSession,
  hasTrustedDevice,
  isBackendConfigured,
  login,
  loginWithPin,
  requestDeviceOtp,
  resetPaymentLinkIdempotencyKey,
  setMerchantPin,
  verifyDeviceOtp,
  updateAdminMerchantAccount,
  updateAdminSettings,
  type AdminMerchantAccount,
  type AdminInternalWallet,
  type AdminInternalWalletSummary,
  type AdminSettings,
  type DashboardData,
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
import Checkout from "./Checkout";
import MarketingHome from "./MarketingHome";
import QrPaymentDisplay, { InstitutionLogo } from "./QrPaymentDisplay";
import InstitutionSelectionScreen from "./InstitutionSelectionScreen";

function isTerminalPaymentStatus(status: string) {
  return ["PAID", "EXECUTED", "INACTIVE", "CANCELED", "REJECTED", "EXPIRED", "FAILED"].includes(status.toUpperCase());
}

function isConfirmedPaymentStatus(status: string) {
  return ["PAID", "EXECUTED"].includes(status.toUpperCase());
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
        : <span className={`transaction-avatar avatar-${transaction.color}`}>{transaction.initials}</span>}
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
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [stage, setStage] = useState<"email" | "pin" | "otp">("email");
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
      setError(requestError instanceof Error ? requestError.message : "Sign-in failed");
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
    <main className="auth-screen">
      <div className="auth-brand"><Brand /></div>
      <section className="auth-card">
        <span className="auth-mark"><img src="/drpay-mark.png" alt="" /></span>
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
        </form>}
        {stage === "pin" && <form onSubmit={(event) => void submitPin(event)}>
          <label><span>Merchant email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></label>
          <label><span>Four-digit MPIN</span><input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} required autoFocus /></label>
          {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
          <Button type="submit" disabled={busy || pin.length !== 4} icon={busy ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}>{busy ? "Signing in…" : "Sign in with MPIN"}</Button>
          <button type="button" className="authorization-back" disabled={busy} onClick={() => { setStage("email"); setPin(""); setError(""); }}>Use a different email</button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void sendOtp()}>Verify with email code</Button>
        </form>}
        {stage === "otp" && <form onSubmit={(event) => void submitOtp(event)}>
          <label><span>Merchant email</span><input type="email" value={email} readOnly /></label>
          <label><span>Six-digit email code</span><input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label>
          {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
          <Button type="submit" disabled={busy || otp.length !== 6} icon={busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}>{busy ? "Verifying…" : "Verify device"}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void sendOtp()}>Send a new code</Button>
          <button type="button" className="authorization-back" disabled={busy} onClick={() => { setStage("email"); setOtp(""); setError(""); }}>Back</button>
        </form>}
        <div className="auth-trust"><ShieldCheck size={16} /><span>New devices require an email code. Previously verified devices use your MPIN. Sessions expire automatically after eight hours.</span></div>
      </section>
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
    <main className="auth-screen">
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
    </main>
  );
}

function SuperAdminConsole({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [settings, setSettings] = useState<AdminSettings>({ krwToPhpRate: null, usdtAddress: "", usdtNetwork: "" });
  const [merchants, setMerchants] = useState<AdminMerchantAccount[]>([]);
  const [internalWallets, setInternalWallets] = useState<AdminInternalWalletSummary[]>([]);
  const [selectedWalletEmail, setSelectedWalletEmail] = useState("");
  const [selectedWallet, setSelectedWallet] = useState<AdminInternalWallet | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingMerchant, setSavingMerchant] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadConsole() {
    setLoading(true);
    setError("");
    try {
      const [nextSettings, nextMerchants, nextWallets] = await Promise.all([
        getAdminSettings(),
        getAdminMerchantAccounts(),
        getAdminInternalWallets(),
      ]);
      setSettings(nextSettings);
      setMerchants(nextMerchants);
      setInternalWallets(nextWallets);
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
      setNotice("Settings saved. KRW collection uses this configured rate.");
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
      setNotice("Bookkeeping entry recorded. It does not change SwiftPay funds and cannot be transferred.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not record internal adjustment.");
    } finally {
      setSavingAdjustment(false);
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
          <h1>Super-admin console</h1>
          <p>Manage collection configuration and merchant access.</p>
        </div>
        {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
        {notice && <div className="admin-notice"><ShieldCheck size={15} />{notice}</div>}
        {loading ? <div className="admin-loading" role="status"><LoaderCircle className="spin" size={20} />Loading console…</div> : (
          <>
            <section className="admin-card">
              <div className="admin-card-heading"><span className="setting-icon"><WalletCards size={19} /></span><div><h2>Internal bookkeeping wallet</h2><p>Manual PHP ledger for records only. It is not a SwiftPay balance and cannot be withdrawn or transferred.</p></div></div>
              {merchants.length === 0 ? <p className="admin-empty">Create a merchant account before recording ledger adjustments.</p> : (
                <>
                  <label className="admin-wallet-select">
                    <span>Merchant account</span>
                    <select value={selectedWalletEmail} onChange={(event) => setSelectedWalletEmail(event.target.value)}>
                      {merchants.map((merchant) => <option key={merchant.email} value={merchant.email}>{merchant.email}</option>)}
                    </select>
                  </label>
                  <div className="internal-ledger-balance">
                    <span>DRPAY internal ledger · PHP</span>
                    <strong>{selectedWallet ? `₱${selectedWallet.balance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Loading…"}</strong>
                    <small>Bookkeeping only — not transferable</small>
                  </div>
                  <form className="admin-ledger-form" onSubmit={adjustInternalWallet}>
                    <label><span>Adjustment amount (PHP)</span><input type="number" step="0.01" min="-1000000000" max="1000000000" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} placeholder="Positive adds; negative subtracts" required /></label>
                    <label><span>Reason for audit record</span><input maxLength={250} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} required placeholder="Internal bookkeeping reason" /></label>
                    <Button type="submit" disabled={savingAdjustment || !selectedWalletEmail || !adjustmentAmount || Number(adjustmentAmount) === 0 || !adjustmentReason.trim()}>{savingAdjustment ? "Recording…" : "Record ledger adjustment"}</Button>
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
            </section>
            <section className="admin-card">
              <div className="admin-card-heading"><span className="setting-icon"><Settings size={19} /></span><div><h2>Collection configuration</h2><p>Provider secrets are not displayed or editable here.</p></div></div>
              <form onSubmit={saveSettings}>
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
            </section>

            <section className="admin-card">
              <div className="admin-card-heading"><span className="setting-icon"><Users size={19} /></span><div><h2>Merchant accounts</h2><p>Create email-verified accounts or disable access.</p></div></div>
              <div className="admin-account-list">
                {merchants.map((account) => (
                  <div className="admin-account-row" key={account.email}>
                    <div><strong>{account.email}</strong><small>{account.active ? "Active" : "Disabled"} · added {new Date(account.createdAt).toLocaleDateString()}</small></div>
                    <button type="button" className="admin-text-action" onClick={() => void setMerchantActive(account)}>{account.active ? "Disable" : "Enable"}</button>
                  </div>
                ))}
                {merchants.length === 0 && <p className="admin-empty">No merchant accounts yet.</p>}
              </div>
              <form onSubmit={addMerchant}>
                <label><span>New merchant email</span><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required autoComplete="off" /></label>
                <Button type="submit" disabled={savingMerchant || !newEmail}>{savingMerchant ? "Creating…" : "Create merchant account"}</Button>
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function PaymentSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
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
      const response = await createPaymentLink({ amount: phpAmount, description }, idempotencyKey);
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

function TransactionSheet({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  async function copyReference() {
    await navigator.clipboard?.writeText(transaction.reference);
  }
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="payment-sheet detail-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div><span className="eyebrow">TRANSACTION DETAILS</span><h2>{transaction.customer}</h2></div>
          <IconButton label="Close" onClick={onClose}><X size={19} /></IconButton>
        </header>
        <div className={`detail-amount ${transaction.numericAmount >= 0 ? "credit" : "debit"}`}>{transaction.amount}</div>
        <StatusBadge status={transaction.status} />
        <dl className="detail-list">
          <div><dt>Provider status</dt><dd>{transaction.rawStatus}</dd></div>
          <div><dt>Channel</dt><dd>{transaction.channel}</dd></div>
          <div><dt>Date</dt><dd>{transaction.date}</dd></div>
          <div><dt>Description</dt><dd>{transaction.description || "—"}</dd></div>
          <div><dt>Reference</dt><dd><button onClick={copyReference}>{transaction.reference}<Copy size={14} /></button></dd></div>
        </dl>
        <p className="detail-note"><ShieldCheck size={15} /> Status was last reconciled by the DRPAY server with SwiftPay.</p>
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
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [bank, setBank] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
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
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    getInstitutions().then((items) => {
      setInstitutions(items);
      const requestedBank = initialValues?.bank.trim().toLowerCase();
      const matchedBank = requestedBank
        ? items.find((item) => item.code.toLowerCase() === requestedBank || item.name.trim().toLowerCase() === requestedBank)
        : undefined;
      setBank(matchedBank?.code || (initialValues ? "" : items[0]?.code || ""));
      if (initialValues && !matchedBank) setError(`The QR bank “${initialValues.bank}” is not supported for transfers. Choose a bank to continue.`);
    }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load banks"));
  }, [initialValues]);

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
    try {
      const authorization = await authorizeTransferWithPin(transferAuthorization, pin);
      const response = await createTransfer({ ...transferAuthorization, stepUpToken: authorization.stepUpToken });
      setResult(response);
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

  function selectBank(code: string) {
    const institution = institutions.find((item) => item.code === code);
    setBank(code);
    setBankSearch("");
    setBankPickerOpen(false);
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
          <div><span className="eyebrow">BANK TRANSFER</span><h2>{result ? "Transfer submitted" : reviewing ? "Review transfer" : "Send money"}</h2></div>
          <IconButton label="Close" onClick={onClose}><X size={19} /></IconButton>
        </header>
        {result ? (
          <div className="link-result">
            <div className="result-icon"><Send size={23} /></div>
            <strong>{result.outcomeUnknown ? "Outcome needs review" : ["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(result.status.toUpperCase()) ? "Transfer not sent" : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(result.status.toUpperCase()) ? "Transfer settled" : "Transfer accepted for processing"}</strong>
            <p>{result.outcomeUnknown ? "The provider response was ambiguous. Do not retry until the transfer is reconciled." : ["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(result.status.toUpperCase()) ? result.message || "SwiftPay rejected the transfer." : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(result.status.toUpperCase()) ? result.message || "SwiftPay confirmed settlement." : result.message || "Provider acceptance is not final settlement. Track the terminal status in Wallet activity."}</p>
            <span className="payment-state">Status: {result.status}</span>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : reviewing ? (
          <div className="transfer-review">
            <div className="review-total"><span>You’re sending</span><strong>₱{Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong></div>
            <dl className="detail-list">
              <div><dt>Recipient</dt><dd>{name}</dd></div>
              <div><dt>Bank</dt><dd>{selectedBank?.name}</dd></div>
              <div><dt>Account</dt><dd>•••• {account.slice(-4)}</dd></div>
              <div><dt>Rail</dt><dd>{channel}</dd></div>
              {remarks.trim() && <div><dt>Remarks</dt><dd>{remarks.trim()}</dd></div>}
            </dl>
            {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
            {!authorizing ? (
              <div className="result-actions">
                <Button variant="secondary" onClick={() => setReviewing(false)}>Back</Button>
                <Button disabled={busy} onClick={() => { setAuthorizing(true); setError(""); }} icon={<ShieldCheck size={16} />}>Verify and send</Button>
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
            <div className="bank-picker">
              <span className="bank-picker-label" id="transfer-bank-label">Bank or wallet</span>
              <button
                type="button"
                className="bank-picker-trigger"
                aria-labelledby="transfer-bank-label"
                aria-haspopup="listbox"
                aria-expanded={bankPickerOpen}
                disabled={institutions.length === 0}
                onClick={() => setBankPickerOpen((open) => !open)}
              >
                <span className="bank-picker-name">
                  {selectedBank && <InstitutionLogo key={selectedBank.code} institution={selectedBank} className="bank-picker-logo" />}
                  {selectedBank?.name || "Loading banks…"}
                </span>
                <ChevronDown size={17} />
              </button>
              {bankPickerOpen && (
                <div className="bank-picker-menu">
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
                  <div className="bank-picker-options" role="listbox" aria-label="Banks and wallets">
                    {filteredInstitutions.length > 0 ? filteredInstitutions.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        role="option"
                        aria-selected={item.code === bank}
                        className="bank-picker-option"
                        onClick={() => selectBank(item.code)}
                      >
                        <span className="bank-picker-name">
                          <InstitutionLogo institution={item} className="bank-picker-logo" />
                          {item.name}
                        </span>
                        <small>
                          {[
                            item.instapayEnabled && "InstaPay",
                            item.pesonetEnabled && "PESONet",
                          ].filter(Boolean).join(" · ") || "Unavailable"}
                        </small>
                      </button>
                    )) : <p className="bank-picker-empty">No matching banks or wallets.</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="rail-selector">
              {(["INSTAPAY", "PESONET"] as const).map((item) => <button key={item} type="button" className={channel === item ? "active" : ""} onClick={() => setChannel(item)} disabled={item === "INSTAPAY" ? selectedBank?.instapayEnabled === false : selectedBank?.pesonetEnabled === false}>{item}</button>)}
            </div>
            <label><span>Recipient full name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label><span>Account number</span><input inputMode="numeric" value={account} onChange={(event) => setAccount(event.target.value.replace(/\D/g, ""))} required /></label>
            <label><span>Amount · Available ₱{balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span><div className="amount-field"><span>₱</span><input type="number" min="1" step=".01" value={amount} onChange={(event) => setAmount(event.target.value)} required /><small>PHP</small></div></label>
            <label><span>Remarks (required)</span><input value={remarks} onChange={(event) => setRemarks(event.target.value.slice(0, 80))} maxLength={80} required placeholder="Enter transfer remarks" /></label>
            {invalidAmount && amount && <div className="inline-error"><AlertCircle size={15} />Enter an amount within your available balance.</div>}
            {!remarks.trim() && <div className="inline-error"><AlertCircle size={15} />Enter remarks for this transfer.</div>}
            <Button type="submit" disabled={invalidAmount || !bank || !channelAvailable || !account || !name || !remarks.trim()}>Review transfer</Button>
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
    void import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      if (!active || !videoRef.current) return;
      return new BrowserMultiFormatReader().decodeFromVideoDevice(undefined, videoRef.current, (result, error) => {
        if (!active) return;
        if (result) {
          active = false;
          stopScanner?.();
          handlePayload(result.getText());
        } else if (error && error.name !== "NotFoundException") {
          setCameraError(error.message || "Could not read the camera QR code.");
        }
      });
    }).then((controls) => {
      if (!controls) return;
      if (active) stopScanner = () => controls.stop();
      else controls.stop();
    }).catch((error: unknown) => {
      if (active) setCameraError(error instanceof Error ? error.message : "Camera access is unavailable.");
    });
    return () => {
      active = false;
      stopScanner?.();
    };
  }, [mode, decodingUpload]);

  async function scanImage(file?: File) {
    if (!file) return;
    setCameraError("");
    setDecodingUpload(true);
    const imageUrl = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(imageUrl);
      handlePayload(result.getText());
    } catch (error) {
      setCameraError(error instanceof Error && error.name === "NotFoundException"
        ? "No QR code was found in that image."
        : error instanceof Error ? error.message : "Could not read the uploaded QR.");
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
            {cameraError && <div className="inline-error" role="alert"><AlertCircle size={15} />{cameraError}</div>}
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
      const result = await createPaymentLink({ amount: Number(amount), description }, idempotencyKey);
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
        {url ? <div className="link-result"><div className="result-icon"><QrCode size={23} /></div><strong>Scan to collect payment</strong><p>Show this QR to your customer to scan.</p><span className={`payment-state state-${paymentStatus.toLowerCase()}`}>{isConfirmedPaymentStatus(paymentStatus) ? "Payment confirmed by SwiftPay" : `Checkout status: ${paymentStatus || "PENDING"}`}</span><QrPaymentDisplay value={qrCode} institution={selectedInstitution || undefined} /><Button variant="quiet" onClick={onClose}>Done</Button></div> :
          selectingInstitution ? <InstitutionSelectionScreen onBack={() => setSelectingInstitution(false)} onConfirm={(institution) => void createCheckout(institution)} busy={busy} submissionError={error} /> :
          <form onSubmit={submit}><label><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} required /></label><label><span>Fixed amount</span><div className="amount-field"><span>₱</span><input type="number" min="1" step=".01" value={amount} onChange={(event) => setAmount(event.target.value)} required /><small>PHP</small></div></label>{error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}<Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create QR checkout"}</Button></form>}
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
  onWalletDetails,
}: {
  data: DashboardData;
  onRequestPayment: () => void;
  onTransfer: () => void;
  onScan: () => void;
  onActivity: () => void;
  onTransaction: (transaction: Transaction) => void;
  onWalletDetails: () => void;
}) {
  const [balanceVisible, setBalanceVisible] = useState(true);

  return (
    <>
      <section className="balance-card">
        <div className="balance-top">
          <span>DISBURSEMENT WALLET AVAILABLE</span>
          <button onClick={() => setBalanceVisible(!balanceVisible)} aria-label="Toggle balance visibility">
            <Eye size={15} /> PHP
          </button>
        </div>
        <strong className="balance-value">{balanceVisible ? data.availableBalance : "₱ ••••••"}</strong>
        <div className="balance-bottom">
          <span>
            <i />
            SwiftPay account connected
          </span>
          <button onClick={onWalletDetails}>
            Wallet details <ChevronRight size={14} />
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
            <span>Money received</span>
            <strong>{data.grossVolume}</strong>
            <small>Confirmed credits</small>
          </div>
          <div>
            <span>Settled</span>
            <strong>{data.successfulPayments}</strong>
            <small>Provider-confirmed collections</small>
          </div>
        </div>
        <div className="average-row">
          <span>Average confirmed credit</span>
          <strong>{data.averageTransaction}</strong>
        </div>
      </section>

      <section className="settlement-card">
        <div className="settlement-icon">
          <WalletCards size={21} />
        </div>
        <div>
          <span>SwiftPay disbursement wallet</span>
          <strong>Available payout balance</strong>
          <small>Balance and transfer status are fetched from SwiftPay</small>
        </div>
        <ChevronRight size={18} />
      </section>

      <section className="internal-wallet-card">
        <div className="internal-wallet-heading">
          <WalletCards size={18} />
          <span>DRPAY internal bookkeeping balance</span>
          <strong>{data.internalWalletBalance}</strong>
        </div>
        <p>For internal records only. This balance is separate from SwiftPay funds and is not available for transfer or withdrawal.</p>
      </section>

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

function ActivityView({ data, onTransaction }: { data: DashboardData; onTransaction: (transaction: Transaction) => void }) {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const transactions = useMemo(
    () => data.transactions.filter((item) => {
      const matchesFilter =
        filter === "All" ||
        (filter === "Income" && item.numericAmount > 0) ||
        (filter === "Expense" && item.numericAmount < 0) ||
        (filter === "Deposits" && item.channel === "Bank") ||
        item.status === filter;
      const matchesQuery = `${item.reference} ${item.customer} ${item.description}`.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    }),
    [data.transactions, filter, query],
  );

  return (
    <section className="activity-page">
      <div className="page-title">
        <span className="eyebrow">MONEY MOVEMENT</span>
        <h1>Activity</h1>
        <p>Collections and payouts with status from SwiftPay.</p>
      </div>
      <label className="activity-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference or description" /></label>
      <div className="filter-row">
        {["All", "Income", "Expense", "Deposits", "Pending", "Failed"].map((item) => (
          <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="transaction-list full-list">
        {transactions.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} onClick={() => onTransaction(transaction)} />
        ))}
      </div>
    </section>
  );
}

function MoreView({
  session,
  data,
  onPaymentLink,
  onExport,
  onInfo,
  onSignOut,
}: {
  session: Session;
  data: DashboardData;
  onPaymentLink: () => void;
  onExport: () => void;
  onInfo: (title: string) => void;
  onSignOut: () => void;
}) {
  const items = [
    { label: "Merchant profile", description: "Business and account details", icon: Store, action: () => onInfo("Merchant profile") },
    ...(data.walletMode === "pooled" ? [{ label: "QR checkouts", description: "Create a self-hosted QR Ph checkout", icon: QrCode, action: onPaymentLink }] : []),
    { label: "Transfer banks", description: "InstaPay and PESONET", icon: CreditCard, action: () => onInfo("Transfer banks") },
    { label: "Statements", description: "Download wallet activity", icon: ReceiptText, action: onExport },
    { label: "Security", description: "Session and device protection", icon: ShieldCheck, action: () => onInfo("Security") },
    { label: "API documentation", description: "Merchant integration guide", icon: Settings, action: () => onInfo("API documentation") },
    { label: "Help center", description: "DRPAY merchant support", icon: CircleHelp, action: () => onInfo("Help center") },
  ];

  return (
    <section className="more-page">
      <div className="page-title">
        <span className="eyebrow">YOUR BUSINESS</span>
        <h1>Profile</h1>
        <p>Manage your merchant wallet and security.</p>
      </div>
      <div className="profile-card">
        <span className="profile-avatar">DV</span>
        <div>
          <strong>{session.email}</strong>
          <span>{session.role.replace("_", " ")} · {data.walletMode} PHP wallet</span>
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
  const [showPayment, setShowPayment] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [transferQrPrefill, setTransferQrPrefill] = useState<TransferQrDetails | undefined>();
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [infoTool, setInfoTool] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  function signOut() {
    clearSession();
    setSession(null);
    setData(null);
    setSecurityStatus(null);
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

  if (checkoutCode) return <Checkout code={checkoutCode} />;
  if (!isDashboard && !isAdminConsole) return <MarketingHome />;

  if (!isBackendConfigured()) {
    return (
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

  if (!session) return <SignIn onAuthenticated={setSession} />;

  if (session.role === "merchant" && securityStatus && !securityStatus.pinConfigured) {
    return <SecuritySetupScreen initialStatus={securityStatus} onComplete={setSecurityStatus} onSignOut={signOut} />;
  }

  if (!data && loading) {
    return <DashboardLoading />;
  }

  if (!data) {
    return (
      <main className="dashboard-error-screen error-screen" role="alert">
        <AlertCircle size={28} />
        <h1>Wallet unavailable</h1>
        <p>{error || "We couldn’t load your merchant wallet."}</p>
        <Button variant="secondary" onClick={loadDashboard} icon={<RefreshCw size={16} />}>Retry</Button>
        <Button variant="quiet" onClick={signOut}>Sign out</Button>
      </main>
    );
  }

  return (
    <div className="app-stage">
      <main className="mobile-app">
        <header className="app-header">
          <div className="merchant-greeting">
            <span className="merchant-avatar">
              <img src="/drpay-mark.png" alt="" />
            </span>
            <div>
              <span>Welcome back</span>
              <strong>Merchant account</strong>
            </div>
          </div>
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
                onWalletDetails={() => setInfoTool("Merchant profile")}
              />
            )}
            {activeTab === "Wallet" && <ActivityView data={data} onTransaction={setSelectedTransaction} />}
            {activeTab === "Transfer" && (
              <section className="empty-page">
                <span className="empty-icon"><Send size={25} /></span>
                <h1>Send money</h1>
                <p>Transfer from your PHP ledger through InstaPay or PESONET. Provider acceptance is not final settlement.</p>
                <Button icon={<Send size={18} />} onClick={() => setShowTransfer(true)}>Start transfer</Button>
              </section>
            )}
            {activeTab === "Profile" && <MoreView session={session} data={data} onPaymentLink={() => setShowPaymentLink(true)} onExport={exportActivity} onInfo={setInfoTool} onSignOut={signOut} />}
          </div>
        </div>

        <nav className="bottom-nav" aria-label="App navigation">
          {tabs.map(({ label, icon: Icon }) => {
            const isPay = label === "Collect";
            return (
              <button
                key={label}
                className={`${activeTab === label ? "active" : ""} ${isPay ? "pay-tab" : ""}`}
                onClick={() => isPay ? setShowPayment(true) : setActiveTab(label)}
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
      {selectedTransaction && <TransactionSheet transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />}
      {infoTool && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setInfoTool("")}>
          <section className="payment-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <span className="sheet-handle" />
            <header className="sheet-header"><div><span className="eyebrow">DRPAY MERCHANT</span><h2>{infoTool}</h2></div><IconButton label="Close" onClick={() => setInfoTool("")}><X size={19} /></IconButton></header>
            <div className="tool-info">
              {infoTool === "Merchant profile" && <><strong>{session.email}</strong><p>Role: {session.role.replace("_", " ")}<br />Wallet mode: {data.walletMode}<br />Account: {data.accountNumber ? `•••• ${data.accountNumber.slice(-4)}` : "Internal merchant ledger"}</p></>}
              {infoTool === "Transfer banks" && <><strong>Supported rails</strong><p>Eligible institutions are loaded directly from SwiftPay. InstaPay and PESONET availability is enforced per institution during transfer setup.</p></>}
              {infoTool === "Security" && <><strong>Device and transfer security</strong><p>New devices must be verified using a one-time code sent to your merchant email. Previously verified devices use your four-digit MPIN for sign-in, and every outgoing transfer also requires MPIN approval. Sessions expire automatically after eight hours.</p></>}
              {infoTool === "API documentation" && <><strong>Trusted backend boundary</strong><p>Collections use SwiftPay hosted payment links, wallet data comes from the disbursement account API, and transfers use SwiftPay disbursements. SwiftPay secret keys never belong in this client.</p></>}
              {infoTool === "Help center" && <><strong>Need assistance?</strong><p>Keep the payment or transfer reference available when contacting your payment support team. Never send a password, access token, or secret key.</p></>}
            </div>
            <Button onClick={() => setInfoTool("")}>Done</Button>
          </section>
        </div>
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
                    <strong>{transaction.status === "Paid" ? "Transaction settled" : `Transaction ${transaction.status.toLowerCase()}`}</strong>
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
    </div>
  );
}

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Download,
  Eye,
  Home,
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
  Share2,
  Settings,
  ShieldCheck,
  Store,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  clearSession,
  createPaymentLink,
  createTransfer,
  clearPaymentLinkIdempotencyKey,
  getInstitutions,
  getMerchantDashboard,
  getPaymentLinkIdempotencyKey,
  getPaymentLinkStatus,
  getSession,
  isBackendConfigured,
  login,
  resetPaymentLinkIdempotencyKey,
  type DashboardData,
  type Institution,
  type PaymentLinkResult,
  type Session,
  type Transaction,
  type TransferResult,
} from "./lib/swiftpay";
import MarketingHome from "./MarketingHome";

async function openHostedCheckout(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
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

function TransactionRow({ transaction, onClick }: { transaction: Transaction; onClick?: () => void }) {
  return (
    <button className="transaction-row" onClick={onClick}>
      <span className={`transaction-avatar avatar-${transaction.color}`}>
        {transaction.initials}
      </span>
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
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onAuthenticated(await login(email.trim().toLowerCase(), password));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand"><Brand /></div>
      <section className="auth-card">
        <span className="auth-mark"><img src="/drpay-mark.png" alt="" /></span>
        <span className="eyebrow">MERCHANT ACCESS</span>
        <h1>Welcome to DRPAY</h1>
        <p>Sign in with the merchant account configured for your DRPAY backend.</p>
        <form onSubmit={submit}>
          <label>
            <span>Merchant email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="merchant@company.ph" required autoComplete="username" autoFocus />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </label>
          {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
          <Button type="submit" disabled={busy || !email || !password} icon={busy ? <LoaderCircle className="spin" size={17} /> : <Lock size={17} />}>
            {busy ? "Signing in…" : "Sign in securely"}
          </Button>
        </form>
        <div className="auth-trust"><ShieldCheck size={16} /><span>Eight-hour signed session. Password verification stays on the DRPAY backend.</span></div>
      </section>
    </main>
  );
}

function PaymentSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<PaymentLinkResult | "error" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => getPaymentLinkIdempotencyKey());
  const [paymentStatus, setPaymentStatus] = useState("");

  useEffect(() => {
    if (!result || result === "error") return;
    setPaymentStatus(result.status || "ACTIVE");
    if (["PAID", "INACTIVE"].includes((result.status || "").toUpperCase())) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getPaymentLinkStatus(result.code);
        const status = latest.status || "ACTIVE";
        setPaymentStatus(status);
        if (["PAID", "INACTIVE"].includes(status.toUpperCase())) window.clearInterval(timer);
      } catch {
        // Keep the checkout usable if a temporary status request fails.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [result]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await createPaymentLink({ amount: Number(amount), description: name }, idempotencyKey);
      setResult(response);
      clearPaymentLinkIdempotencyKey();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not create payment link.";
      setError(message);
      if (!message.toLowerCase().includes("unknown") && !message.toLowerCase().includes("reconcil")) {
        setIdempotencyKey(resetPaymentLinkIdempotencyKey());
      }
      setResult("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (result && result !== "error") {
      await navigator.clipboard?.writeText(result.paymentUrl);
    }
  }

  async function sharePayment() {
    if (!result || result === "error") return;
    const url = result.paymentUrl;
    if (navigator.share) await navigator.share({ title: "DRPAY payment request", text: `Pay ${result.currency || "PHP"} ${Number(result.amount ?? amount).toFixed(2)}`, url });
    else await navigator.clipboard?.writeText(url);
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
            <span className="eyebrow">SWIFTPAY · HOSTED CHECKOUT</span>
            <h2 id="sheet-title">{result ? "Collection ready" : "Collect payment"}</h2>
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
                <strong>Couldn’t create your link</strong>
                <p>{error}</p>
                {error.toLowerCase().includes("outcome is unknown") ? (
                  <Button variant="secondary" onClick={onClose}>Close and check activity</Button>
                ) : (
                  <Button onClick={() => setResult(null)}>Try again</Button>
                )}
              </>
            ) : (
              <>
                <div className="result-icon"><Link2 size={25} /></div>
                <strong>Hosted payment link created</strong>
                <p>
                  Collect {result.currency || "PHP"} {Number(result.amount || amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}. Settlement status is confirmed by SwiftPay, not by opening the link.
                </p>
                <span className={`payment-state state-${paymentStatus.toLowerCase()}`}>{paymentStatus === "PAID" ? "Payment confirmed by SwiftPay" : `Link status: ${paymentStatus || result.status || "ACTIVE"}`}</span>
                <button className="copy-link" onClick={copyLink}>
                  <span>{result.paymentUrl}</span>
                  <Copy size={17} />
                </button>
                <div className="result-actions">
                  <Button variant="secondary" icon={<Share2 size={16} />} onClick={sharePayment}>Share</Button>
                  <Button icon={<ArrowUpRight size={16} />} onClick={() => void openHostedCheckout(result.paymentUrl)}>Open checkout</Button>
                </div>
                <Button onClick={onClose}>Done</Button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={submit}>
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
              <span>Amount</span>
              <div className="amount-field">
                <span>₱</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
                <small>PHP</small>
              </div>
            </label>
            <div className="accepted-channels">
              <span>Available payment methods are shown securely on the SwiftPay-hosted checkout.</span>
            </div>
            <Button
              type="submit"
              className="sheet-submit"
              disabled={submitting}
              icon={<Link2 size={18} />}
            >
              {submitting ? "Creating checkout…" : "Create hosted checkout"}
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

function TransferSheet({ balance, onClose, onComplete }: { balance: number; onClose: () => void; onComplete: () => void }) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [bank, setBank] = useState("");
  const [channel, setChannel] = useState<"INSTAPAY" | "PESONET">("INSTAPAY");
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TransferResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    getInstitutions().then((items) => {
      setInstitutions(items);
      setBank(items[0]?.code || "");
    }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load banks"));
  }, []);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await createTransfer({
        amount: Number(amount),
        channel,
        institutionCode: bank,
        accountNumber: account,
        fullName: name,
        remarks,
        idempotencyKey,
      });
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
  const invalidAmount = Number(amount) <= 0 || Number(amount) > balance;
  const channelAvailable = channel === "INSTAPAY"
    ? selectedBank?.instapayEnabled !== false
    : selectedBank?.pesonetEnabled !== false;

  function selectBank(code: string) {
    const institution = institutions.find((item) => item.code === code);
    setBank(code);
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
            </dl>
            {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
            <div className="result-actions">
              <Button variant="secondary" onClick={() => setReviewing(false)}>Back</Button>
              <Button disabled={busy} onClick={submit} icon={busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}>{busy ? "Submitting…" : "Confirm transfer"}</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); setReviewing(true); }}>
            <label><span>Bank or wallet</span><select value={bank} onChange={(event) => selectBank(event.target.value)} required>{institutions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
            <div className="rail-selector">
              {(["INSTAPAY", "PESONET"] as const).map((item) => <button key={item} type="button" className={channel === item ? "active" : ""} onClick={() => setChannel(item)} disabled={item === "INSTAPAY" ? selectedBank?.instapayEnabled === false : selectedBank?.pesonetEnabled === false}>{item}</button>)}
            </div>
            <label><span>Recipient full name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label><span>Account number</span><input inputMode="numeric" value={account} onChange={(event) => setAccount(event.target.value.replace(/\D/g, ""))} required /></label>
            <label><span>Amount · Available ₱{balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span><div className="amount-field"><span>₱</span><input type="number" min="1" step=".01" value={amount} onChange={(event) => setAmount(event.target.value)} required /><small>PHP</small></div></label>
            <label><span>Remarks</span><input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional" /></label>
            {invalidAmount && amount && <div className="inline-error"><AlertCircle size={15} />Enter an amount within your available balance.</div>}
            <Button type="submit" disabled={invalidAmount || !bank || !channelAvailable || !account || !name}>Review transfer</Button>
          </form>
        )}
      </section>
    </div>
  );
}

function ScannerSheet({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  const [cameraError, setCameraError] = useState("");

  async function scanImage(file?: File) {
    if (!file) return;
    try {
      const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector) throw new Error("QR image scanning is not supported by this browser.");
      const bitmap = await createImageBitmap(file);
      const codes = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
      if (!codes[0]) throw new Error("No QR code was found in that image.");
      setValue(codes[0].rawValue);
    } catch (requestError) {
      setCameraError(requestError instanceof Error ? requestError.message : "Could not scan QR");
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="payment-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <span className="sheet-handle" />
        <header className="sheet-header"><div><span className="eyebrow">QR READER</span><h2>Read QR payload</h2></div><IconButton label="Close" onClick={onClose}><X size={19} /></IconButton></header>
        <label className="camera-drop">
          <Camera size={27} />
          <strong>Open camera or choose QR image</strong>
          <span>Your browser processes the image on this device.</span>
          <input type="file" accept="image/*" capture="environment" onChange={(event) => scanImage(event.target.files?.[0])} />
        </label>
        <div className="divider"><span>or paste payload</span></div>
        <label><span>QR payload</span><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="Paste the QR Ph payload here" /></label>
        {cameraError && <div className="inline-error"><AlertCircle size={15} />{cameraError}</div>}
        {value && <div className="scan-result"><ShieldCheck size={18} /><div><strong>QR captured</strong><span>{value.slice(0, 48)}{value.length > 48 ? "…" : ""}</span></div></div>}
        <Button disabled={!value} onClick={() => navigator.clipboard?.writeText(value)} icon={<Copy size={16} />}>Copy QR text</Button>
      </section>
    </div>
  );
}

function PaymentLinkSheet({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => getPaymentLinkIdempotencyKey());

  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getPaymentLinkStatus(code);
        const status = latest.status || "ACTIVE";
        setPaymentStatus(status);
        if (["PAID", "INACTIVE"].includes(status.toUpperCase())) window.clearInterval(timer);
      } catch {
        // Leave the hosted link available while a status request is unavailable.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [code]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await createPaymentLink({ amount: Number(amount), description }, idempotencyKey);
      setUrl(result.paymentUrl);
      setCode(result.code);
      setPaymentStatus(result.status || "ACTIVE");
      clearPaymentLinkIdempotencyKey();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not create payment link";
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
        <header className="sheet-header"><div><span className="eyebrow">POOLED MERCHANT TOOL</span><h2>Payment link</h2></div><IconButton label="Close" onClick={onClose}><X size={19} /></IconButton></header>
        {url ? <div className="link-result"><div className="result-icon"><Link2 size={23} /></div><strong>Hosted link created</strong><p>Share this SwiftPay checkout with your customer.</p><span className={`payment-state state-${paymentStatus.toLowerCase()}`}>{paymentStatus === "PAID" ? "Payment confirmed by SwiftPay" : `Link status: ${paymentStatus || "ACTIVE"}`}</span><button className="copy-link" onClick={() => navigator.clipboard?.writeText(url)}><span>{url}</span><Copy size={17} /></button><Button onClick={() => void openHostedCheckout(url)} icon={<ArrowUpRight size={16} />}>Open checkout</Button><Button variant="quiet" onClick={onClose}>Done</Button></div> :
          <form onSubmit={submit}><label><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} required /></label><label><span>Fixed amount</span><div className="amount-field"><span>₱</span><input type="number" min="1" step=".01" value={amount} onChange={(event) => setAmount(event.target.value)} required /><small>PHP</small></div></label>{error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}<Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create link"}</Button></form>}
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
        <QuickAction icon={<QrCode size={22} />} label="Collect" onClick={onRequestPayment} />
        <QuickAction icon={<Send size={21} />} label="Transfer" onClick={onTransfer} />
        <QuickAction icon={<CreditCard size={21} />} label="Scan QR" onClick={onScan} />
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
    ...(data.walletMode === "pooled" ? [{ label: "Payment links", description: "Create a fixed-amount checkout", icon: Link2, action: onPaymentLink }] : []),
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
  const isDashboard = Capacitor.isNativePlatform() || window.location.pathname === "/app" || window.location.pathname.startsWith("/app/");
  const [session, setSession] = useState<Session | null>(() => getSession());
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState("Home");
  const [showPayment, setShowPayment] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
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
      setData(await getMerchantDashboard());
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

  if (!isDashboard) return <MarketingHome />;

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

  if (!session) return <SignIn onAuthenticated={setSession} />;

  if (!data && loading) {
    return (
      <main className="loading-screen">
        <Brand />
        <span className="loading-line" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-screen error-screen">
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
      {showTransfer && <TransferSheet balance={data.balance} onClose={() => setShowTransfer(false)} onComplete={loadDashboard} />}
      {showScanner && <ScannerSheet onClose={() => setShowScanner(false)} />}
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
              {infoTool === "Security" && <><strong>Verified session</strong><p>This browser session expires automatically after eight hours. Signing out clears the bearer token. SwiftPay credentials remain on the DRPAY server.</p></>}
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

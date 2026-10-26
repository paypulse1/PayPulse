import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { Capacitor } from "@capacitor/core"
import { App as CapacitorApp } from "@capacitor/app"
import { Browser } from "@capacitor/browser"
import { PushNotifications } from "@capacitor/push-notifications"
import { Share } from "@capacitor/share"
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
} from "lucide-react"
import {
  ApiError,
  clearSession,
  authorizeTransferWithPin,
  createPaymentLink,
  getCollectionRefundDetails,
  createTransfer,
  clearPaymentLinkIdempotencyKey,
  getInstitutions,
  getKrwPhpQuote,
  getApiBaseUrl,
  getMerchantActivityTrend,
  getMerchantDashboard,
  getMerchantActivityPage,
  createMerchantFloatingTransferRequest,
  getMerchantFloatingTransferRequests,
  getMerchantNotificationPreferences,
  saveMerchantNotificationPreferences,
  getMerchantPayoutAccount,
  getMerchantUsdtWallet,
  getMerchantUsdtDeposits,
  getMerchantSecurityStatus,
  getPaymentLinkIdempotencyKey,
  getPaymentLinkStatus,
  getSession,
  isBackendConfigured,
  registerPushDevice,
  registerBiometricCredential,
  removeBiometricCredential,
  removePushDevice,
  resetPaymentLinkIdempotencyKey,
  SESSION_EXPIRED_EVENT,
  setMerchantPin,
  type CollectionRefundDetails,
  type DashboardData,
  type MerchantActivityTrendPoint,
  type MerchantPayoutAccount,
  type FloatingTransferRequest,
  type MerchantNotificationPreferences,
  type MerchantUsdtWallet,
  type MerchantUsdtDeposit,
  type MerchantSecurityStatus,
  type CurrencyQuote,
  type Institution,
  type PaymentInstitution,
  type PaymentLinkResult,
  type Session,
  type Transaction,
  type TransferResult,
  type TransferAuthorizationInput,
} from "./lib/swiftpay"
import type { MerchantQrDetails, TransferQrDetails } from "./lib/transferQr"
import { parseScannedQr } from "./lib/transferQr"
import {
  downloadTransferReceiptImage,
  shareTransferReceiptImage,
} from "./lib/transferReceipt"
import {
  createBiometricSecret,
  deleteBiometricSecret,
  hasBiometricLogin,
  isBiometricLoginAvailable,
  markBiometricLoginDisabled,
  markBiometricLoginEnabled,
  markBiometricOfferDismissed,
  storeBiometricSecret,
  supportsBiometricLogin,
  wasBiometricOfferDismissed,
} from "./lib/biometric"
import Checkout from "./Checkout"
import MarketingHome from "./MarketingHome"
import LegalPage, { getLegalPage } from "./LegalPages"
import QrPaymentDisplay, { InstitutionLogo } from "./QrPaymentDisplay"
import InstitutionSelectionScreen from "./InstitutionSelectionScreen"
import { DeveloperSetupPanel, KybSetupPanel } from "./MerchantSetup"
import { Brand, Button } from "./AppPrimitives"
import { SuperAdminConsole } from "./SuperAdminConsole"
import MerchantSignIn from "./MerchantSignIn"
import OperationsSignIn from "./OperationsSignIn"
import {
  DashboardLoading,
  formatWalletMovement,
  StatusBadge,
  TransactionRow,
} from "./MerchantDashboardPrimitives"

function isTerminalPaymentStatus(status: string) {
  return [
    "PAID",
    "EXECUTED",
    "MANUALLY_PAID",
    "INACTIVE",
    "CANCELED",
    "REJECTED",
    "EXPIRED",
    "FAILED",
  ].includes(status.toUpperCase())
}

function isConfirmedPaymentStatus(status: string) {
  return ["PAID", "EXECUTED", "MANUALLY_PAID"].includes(status.toUpperCase())
}

function isQrDecodeMiss(error: unknown) {
  if (!(error instanceof Error)) return false
  return (
    ["NotFoundException", "ChecksumException", "FormatException"].includes(
      error.name,
    ) ||
    /no (?:multi.?format )?readers? (?:were )?able to detect/i.test(
      error.message,
    )
  )
}

function isDetectedQrUnreadable(error: unknown) {
  return (
    error instanceof Error &&
    ["ChecksumException", "FormatException"].includes(error.name)
  )
}

function compareAppVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index])
      return leftParts[index] - rightParts[index]
  }
  return 0
}

function UpdateAvailablePrompt({
  version,
  downloadUrl,
  onDismiss,
}: {
  version: string
  downloadUrl: string
  onDismiss: () => void
}) {
  const [error, setError] = useState("")

  async function openDownload() {
    setError("")
    try {
      await Browser.open({ url: downloadUrl })
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Could not open the APK download.",
      )
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation">
      <section
        className="payment-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
      >
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <span className="eyebrow">APP UPDATE</span>
            <h2 id="app-update-title">DRPAY {version} is ready</h2>
          </div>
          <IconButton label="Remind me later" onClick={onDismiss}>
            <X size={19} />
          </IconButton>
        </header>
        <p className="profile-info-note">
          Download the latest version to get improvements and fixes. Android
          will ask you to confirm installation; the update will not install
          silently.
        </p>
        {error && (
          <div className="inline-error" role="alert">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        <Button
          icon={<Download size={16} />}
          onClick={() => void openDownload()}
        >
          Download update
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          Remind me later
        </Button>
      </section>
    </div>
  )
}

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function PaymentLinkActions({ url }: { url: string }) {
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function copyLink() {
    setError("")
    try {
      await navigator.clipboard.writeText(url)
      setMessage("Payment link copied.")
    } catch {
      setMessage("")
      setError(
        "Could not copy the payment link. Open it and copy the URL from your browser.",
      )
    }
  }

  async function shareLink() {
    setError("")
    setMessage("")
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: "Payment link",
          url,
          dialogTitle: "Share payment link",
        })
      } else if (navigator.share) {
        await navigator.share({ title: "Payment link", url })
      } else {
        await copyLink()
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError")
        return
      setError(
        shareError instanceof Error
          ? shareError.message
          : "Could not share this payment link.",
      )
    }
  }

  return (
    <section className="payment-link-share" aria-label="Share payment link">
      <span className="eyebrow">YOUR HOSTED CHECKOUT LINK</span>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
      <div className="payment-link-share-actions">
        <Button
          variant="secondary"
          icon={<Copy size={15} />}
          onClick={() => void copyLink()}
        >
          Copy link
        </Button>
        <Button
          variant="secondary"
          icon={<Share2 size={15} />}
          onClick={() => void shareLink()}
        >
          Share link
        </Button>
      </div>
      {message && (
        <p className="payment-link-share-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="payment-link-share-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function ApiCodeBlock({ title, code }: { title: string; code: string }) {
  const [copyState, setCopyState] = useState("")

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState("Copied")
    } catch {
      setCopyState("Copy unavailable; select the code to copy.")
    }
  }

  return (
    <section className="api-code-block">
      <header>
        <strong>{title}</strong>
        <button type="button" onClick={() => void copyCode()}>
          <Copy size={13} /> Copy
        </button>
      </header>
      <pre>
        <code>{code}</code>
      </pre>
      {copyState && <p role="status">{copyState}</p>}
    </section>
  )
}

function useBalanceVisibility() {
  const email = getSession()?.email.toLowerCase() || "default"
  const storageKey = `drpay.balance-visibility.${encodeURIComponent(email)}`
  const [preference, setPreference] = useState(() => ({
    storageKey,
    visible: localStorage.getItem(storageKey) !== "hidden",
  }))
  const balanceVisible =
    preference.storageKey === storageKey
      ? preference.visible
      : localStorage.getItem(storageKey) !== "hidden"

  useEffect(() => {
    setPreference({
      storageKey,
      visible: localStorage.getItem(storageKey) !== "hidden",
    })
  }, [storageKey])

  const toggleBalanceVisibility = useCallback(() => {
    const visible = !balanceVisible
    localStorage.setItem(storageKey, visible ? "visible" : "hidden")
    setPreference({ storageKey, visible })
  }, [balanceVisible, storageKey])

  return { balanceVisible, toggleBalanceVisibility }
}

function IconButton({
  children,
  label,
  onClick,
  dark = false,
}: {
  children: ReactNode
  label: string
  onClick?: () => void
  dark?: boolean
}) {
  return (
    <button
      className={`icon-button ${dark ? "icon-button-dark" : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span>{icon}</span>
      <strong>{label}</strong>
    </button>
  )
}

function SecuritySetupScreen({
  initialStatus,
  onComplete,
  onSignOut,
}: {
  initialStatus: MerchantSecurityStatus
  onComplete: (status: MerchantSecurityStatus) => void
  onSignOut: () => void
}) {
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [status, setStatus] = useState(initialStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function savePin(event: FormEvent) {
    event.preventDefault()
    if (pin !== confirmPin) {
      setError("The MPINs do not match.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await setMerchantPin(pin)
      const nextStatus = { ...status, pinConfigured: true }
      setStatus(nextStatus)
      setPin("")
      setConfirmPin("")
      onComplete(nextStatus)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save your MPIN.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand">
        <Brand />
      </div>
      <section className="auth-card security-setup-card">
        <span className="auth-mark">
          <ShieldCheck size={26} />
        </span>
        <span className="eyebrow">SECURE YOUR ACCOUNT</span>
        <h1>Set up your MPIN</h1>
        <p>
          Create a four-digit MPIN for future sign-ins on this verified device
          and to approve every transfer.
        </p>
        {!status.pinConfigured ? (
          <form onSubmit={(event) => void savePin(event)}>
            <label>
              <span>Four-digit MPIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="new-password"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                required
              />
            </label>
            <label>
              <span>Confirm MPIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="new-password"
                value={confirmPin}
                onChange={(event) =>
                  setConfirmPin(
                    event.target.value.replace(/\D/g, "").slice(0, 4),
                  )
                }
                required
              />
            </label>
            {error && (
              <div className="inline-error">
                <AlertCircle size={15} />
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={busy || pin.length !== 4 || confirmPin.length !== 4}
              icon={
                busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <KeyRound size={17} />
                )
              }
            >
              {busy ? "Saving MPIN…" : "Save MPIN"}
            </Button>
          </form>
        ) : (
          <div className="security-setup-complete">
            <ShieldCheck size={16} /> MPIN is set
          </div>
        )}
        {error && status.pinConfigured && (
          <div className="inline-error">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        <div className="auth-trust">
          <Lock size={15} />
          <span>
            Your MPIN is hashed on the backend and is required for future
            sign-ins and transfers.
          </span>
        </div>
        <Button type="button" variant="quiet" onClick={onSignOut}>
          Sign out
        </Button>
      </section>
    </main>
  )
}

function BiometricEnrollmentPrompt({
  busy,
  error,
  onEnable,
  onSkip,
}: {
  busy: boolean
  error: string
  onEnable: () => void
  onSkip: () => void
}) {
  return (
    <div className="sheet-backdrop biometric-backdrop">
      <section
        className="payment-sheet biometric-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="biometric-prompt-title"
      >
        <span className="sheet-handle" />
        <span className="biometric-prompt-icon">
          <Fingerprint size={25} />
        </span>
        <span className="eyebrow">OPTIONAL SIGN-IN</span>
        <h2 id="biometric-prompt-title">Set up biometric sign-in</h2>
        <p>
          Use your enrolled fingerprint or face to sign in on this device. Your
          MPIN is never stored; a device-bound key is protected by Android
          biometrics.
        </p>
        {error && (
          <div className="inline-error" role="alert">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        <Button
          disabled={busy}
          onClick={onEnable}
          icon={
            busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Fingerprint size={17} />
            )
          }
        >
          {busy ? "Setting up…" : "Enable biometric sign-in"}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onSkip}>
          Not now
        </Button>
      </section>
    </div>
  )
}

function PaymentSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [currency, setCurrency] = useState<"PHP" | "KRW" | "USDT">("PHP")
  const [krwPhpQuote, setKrwPhpQuote] = useState<CurrencyQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [result, setResult] = useState<PaymentLinkResult | "error" | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    getPaymentLinkIdempotencyKey(),
  )
  const [paymentStatus, setPaymentStatus] = useState("")
  const [selectingInstitution, setSelectingInstitution] = useState(false)
  const [selectedInstitution, setSelectedInstitution] =
    useState<PaymentInstitution | null>(null)

  useEffect(() => {
    if (currency !== "KRW") {
      setKrwPhpQuote(null)
      setQuoteLoading(false)
      return
    }
    let active = true
    setQuoteLoading(true)
    setError("")
    getKrwPhpQuote()
      .then((quote) => {
        if (active) setKrwPhpQuote(quote)
      })
      .catch((requestError) => {
        if (active) {
          setKrwPhpQuote(null)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load the KRW/PHP rate.",
          )
        }
      })
      .finally(() => {
        if (active) setQuoteLoading(false)
      })
    return () => {
      active = false
    }
  }, [currency])

  useEffect(() => {
    if (!result || result === "error") return
    setPaymentStatus(result.status || "PENDING")
    if (isTerminalPaymentStatus(result.status || "")) return
    const timer = window.setInterval(async () => {
      try {
        const latest = await getPaymentLinkStatus(result.code)
        const status = latest.status || "PENDING"
        setPaymentStatus(status)
        if (isTerminalPaymentStatus(status)) window.clearInterval(timer)
      } catch {
        // Keep the checkout usable if a temporary status request fails.
      }
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [result])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSelectingInstitution(true)
  }

  async function createCheckout(institution: PaymentInstitution) {
    const enteredAmount = Number(amount)
    const phpAmount =
      currency === "KRW" && krwPhpQuote
        ? Math.round(enteredAmount * krwPhpQuote.rate * 100) / 100
        : enteredAmount
    if (currency === "USDT" || (currency === "KRW" && !krwPhpQuote)) return
    setSelectedInstitution(institution)
    setSubmitting(true)
    setError("")
    try {
      const description =
        currency === "KRW" && krwPhpQuote
          ? `${name} · ${enteredAmount.toLocaleString("en-US")} KRW @ ${krwPhpQuote.rate} PHP/KRW`
          : name
      const response = await createPaymentLink(
        {
          amount: phpAmount,
          description,
          customerEmail,
          institution,
          collectionAmountKrw: currency === "KRW" ? enteredAmount : undefined,
        },
        idempotencyKey,
      )
      setResult(response)
      clearPaymentLinkIdempotencyKey()
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not create QR checkout."
      setError(message)
      if (
        !message.toLowerCase().includes("unknown") &&
        !message.toLowerCase().includes("reconcil")
      ) {
        setIdempotencyKey(resetPaymentLinkIdempotencyKey())
      }
      setResult("error")
    } finally {
      setSubmitting(false)
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
            <span className="eyebrow">DRPAY · SELF-HOSTED CHECKOUT</span>
            <h2 id="sheet-title">
              {result
                ? "Collection ready"
                : selectingInstitution
                  ? "Choose payment app"
                  : "Collect payment"}
            </h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>

        {result ? (
          <div className="link-result">
            {result === "error" ? (
              <>
                <div className="result-icon result-error">
                  <X size={23} />
                </div>
                <strong>Couldn’t create this checkout</strong>
                <p>{error}</p>
                {error.toLowerCase().includes("outcome is unknown") ? (
                  <Button variant="secondary" onClick={onClose}>
                    Close and check activity
                  </Button>
                ) : (
                  <Button onClick={() => setResult(null)}>Try again</Button>
                )}
              </>
            ) : (
              <>
                <div className="result-icon">
                  <QrCode size={25} />
                </div>
                <strong>Scan to collect payment</strong>
                <p>
                  {currency === "KRW"
                    ? `Collect KRW ${Number(amount).toLocaleString("en-US")} (about PHP ${Number(result.amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} at the reference rate). Show this QR to the customer to scan.`
                    : `Show this QR or share the hosted payment link to collect PHP ${Number(result.amount || amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}.`}
                </p>
                {customerEmail.trim() && (
                  <p className="accepted-channels">
                    Payment request queued for {customerEmail.trim()}. We’ll
                    email them again when payment is confirmed.
                  </p>
                )}
                <span
                  className={`payment-state state-${paymentStatus.toLowerCase()}`}
                >
                  {isConfirmedPaymentStatus(paymentStatus)
                    ? "Payment confirmed by SwiftPay"
                    : `Checkout status: ${paymentStatus || result.status || "PENDING"}`}
                </span>
                <QrPaymentDisplay
                  value={result.qrCode}
                  institution={selectedInstitution || undefined}
                />
                <PaymentLinkActions url={result.paymentUrl} />
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
            <div
              className="collection-currencies"
              role="group"
              aria-label="Collection currency"
            >
              <button
                type="button"
                className={currency === "PHP" ? "active" : ""}
                aria-pressed={currency === "PHP"}
                onClick={() => setCurrency("PHP")}
              >
                PHP
              </button>
              <button
                type="button"
                className={currency === "KRW" ? "active" : ""}
                aria-pressed={currency === "KRW"}
                onClick={() => setCurrency("KRW")}
              >
                KRW
              </button>
              <button
                type="button"
                className="currency-unavailable"
                aria-disabled="true"
                disabled
                title="USDT collection is not configured"
              >
                USDT <small>Unavailable</small>
              </button>
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
                <span>
                  {currency === "KRW" ? "₩" : currency === "USDT" ? "₮" : "₱"}
                </span>
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
              <span>
                Customer email <small>(optional)</small>
              </span>
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="customer@example.com"
                autoComplete="email"
                maxLength={254}
              />
              <small>
                We’ll email the checkout link and send a payment-confirmed email
                after the customer pays.
              </small>
            </label>
            {currency === "KRW" && (
              <div className="currency-quote" aria-live="polite">
                {quoteLoading ? (
                  <span>Loading live KRW/PHP reference rate…</span>
                ) : krwPhpQuote ? (
                  <>
                    <strong>
                      {amount && Number(amount) > 0
                        ? `≈ PHP ${(Number(amount) * krwPhpQuote.rate).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : `1 KRW = PHP ${krwPhpQuote.rate.toFixed(5)}`}
                    </strong>
                    <span>
                      {krwPhpQuote.source} · published{" "}
                      {new Date(krwPhpQuote.updatedAt).toLocaleString()}. This
                      is a reference rate, not a guaranteed real-time SwiftPay
                      rate. Checkout and settlement are in PHP; the payer’s
                      final conversion may differ.
                    </span>
                  </>
                ) : (
                  <span>
                    {error ||
                      "KRW collection is unavailable until a live exchange rate can be loaded."}
                  </span>
                )}
              </div>
            )}
            <div className="accepted-channels">
              <span>
                Generate a QR and a shareable link to your own DRPAY-hosted
                checkout page. KRW amounts are converted to PHP using the
                displayed reference rate.
              </span>
            </div>
            <Button
              type="submit"
              className="sheet-submit"
              disabled={
                submitting ||
                currency === "USDT" ||
                (currency === "KRW" && (!krwPhpQuote || quoteLoading))
              }
              icon={<Link2 size={18} />}
            >
              {submitting ? "Creating checkout…" : "Create QR and payment link"}
            </Button>
          </form>
        )}
      </section>
    </div>
  )
}

function TransactionSheet({
  transaction,
  onClose,
  onComplete,
  onRepeatTransfer,
}: {
  transaction: Transaction
  onClose: () => void
  onComplete: () => void
  onRepeatTransfer: (details: TransferQrDetails) => void
}) {
  const [refundDetails, setRefundDetails] =
    useState<CollectionRefundDetails | null>(null)
  const [refundPin, setRefundPin] = useState("")
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [refundError, setRefundError] = useState("")
  const [receiptError, setReceiptError] = useState("")
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  )

  async function copyReference() {
    await navigator.clipboard?.writeText(transaction.reference)
  }

  const isTransfer = transaction.numericAmount < 0
  const canRepeatTransfer =
    isTransfer &&
    !transaction.isRefund &&
    Boolean(
      transaction.institutionCode &&
        transaction.recipientName &&
        transaction.recipientAccountNumber,
    )
  const receipt = {
    amount: Math.abs(transaction.numericAmount),
    status: transaction.rawStatus,
    reference: transaction.reference,
    channel: transaction.channel,
    institutionName: transaction.institutionName || transaction.customer,
    recipientName: transaction.recipientName,
    accountNumber: transaction.recipientAccountNumber,
    remarks: transaction.remarks,
    createdAt: transaction.date,
  }

  async function downloadReceipt() {
    setReceiptError("")
    try {
      await downloadTransferReceiptImage(receipt)
    } catch (receiptDownloadError) {
      setReceiptError(
        receiptDownloadError instanceof Error
          ? receiptDownloadError.message
          : "Could not download the transfer receipt image.",
      )
    }
  }

  async function shareReceipt() {
    setReceiptError("")
    try {
      await shareTransferReceiptImage(receipt)
    } catch (shareError) {
      setReceiptError(
        shareError instanceof Error
          ? shareError.message
          : "Could not share the transfer receipt image. Download it instead.",
      )
    }
  }

  function repeatTransfer() {
    if (
      !canRepeatTransfer ||
      !transaction.institutionCode ||
      !transaction.recipientName ||
      !transaction.recipientAccountNumber
    )
      return
    onRepeatTransfer({
      bank: transaction.institutionCode,
      accountNumber: transaction.recipientAccountNumber,
      fullName: transaction.recipientName,
      channel: transaction.channel === "PESONET" ? "PESONET" : "INSTAPAY",
    })
  }

  async function loadRefundDetails() {
    setRefundLoading(true)
    setRefundError("")
    try {
      const details = await getCollectionRefundDetails(transaction.id)
      if (Capacitor.isNativePlatform() && details.channel === "PESONET") {
        setRefundError(
          "This refund requires PESONet, which is available only when signed in through a web browser.",
        )
        return
      }
      setRefundDetails(details)
    } catch (requestError) {
      setRefundError(
        requestError instanceof Error
          ? requestError.message
          : "Could not verify refund eligibility.",
      )
    } finally {
      setRefundLoading(false)
    }
  }

  async function submitRefund(event: FormEvent) {
    event.preventDefault()
    if (!refundDetails) return
    setRefundSubmitting(true)
    setRefundError("")
    try {
      const authorizationInput: TransferAuthorizationInput = {
        ...refundDetails,
        idempotencyKey: refundIdempotencyKey,
        refundPaymentId: transaction.id,
      }
      const authorization = await authorizeTransferWithPin(
        authorizationInput,
        refundPin,
      )
      const result = await createTransfer({
        ...refundDetails,
        idempotencyKey: refundIdempotencyKey,
        stepUpToken: authorization.stepUpToken,
        refundPaymentId: transaction.id,
      })
      if (
        ["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(
          result.status.toUpperCase(),
        )
      ) {
        setRefundError(
          result.message || "SwiftPay rejected the refund transfer.",
        )
        setRefundIdempotencyKey(crypto.randomUUID())
        return
      }
      onComplete()
      onClose()
    } catch (requestError) {
      setRefundError(
        requestError instanceof Error
          ? requestError.message
          : "Could not submit the refund transfer.",
      )
    } finally {
      setRefundSubmitting(false)
    }
  }

  const refundInProgress = [
    "REQUESTING",
    "PENDING",
    "OUTCOME_UNKNOWN",
  ].includes((transaction.refundStatus || "").toUpperCase())
  const refundCompleted = ["EXECUTED", "SUCCESS", "COMPLETED"].includes(
    (transaction.refundStatus || "").toUpperCase(),
  )

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="payment-sheet detail-sheet"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <span className="eyebrow">TRANSACTION DETAILS</span>
            <h2>{transaction.customer}</h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        <section className="transaction-detail-hero">
          {transaction.institutionCode && transaction.institutionName && (
            <InstitutionLogo
              institution={{
                code: transaction.institutionCode,
                name: transaction.institutionName,
                logoUrl: transaction.institutionLogoUrl,
              }}
              className="transaction-detail-logo"
            />
          )}
          <div>
            <div
              className={`detail-amount ${
                transaction.numericAmount >= 0 ? "credit" : "debit"
              }`}
            >
              {transaction.amount}
            </div>
            <StatusBadge status={transaction.status} />
          </div>
        </section>
        <dl className="detail-list">
          <div>
            <dt>
              {transaction.rawStatus === "MANUALLY_PAID"
                ? "Payment status"
                : "Provider status"}
            </dt>
            <dd>
              {transaction.rawStatus === "MANUALLY_PAID"
                ? "Manually verified by the DRPAY team"
                : transaction.rawStatus}
            </dd>
          </div>
          {transaction.walletAmount !== undefined &&
            transaction.walletAmount !== null && (
              <div>
                <dt>Merchant ledger impact</dt>
                <dd>{formatWalletMovement(transaction.walletAmount)}</dd>
              </div>
            )}
          <div>
            <dt>Channel</dt>
            <dd>{transaction.channel}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{transaction.date}</dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{transaction.description || "—"}</dd>
          </div>
          {transaction.recipientName && (
            <div>
              <dt>Recipient</dt>
              <dd>{transaction.recipientName}</dd>
            </div>
          )}
          {transaction.recipientAccountNumber && (
            <div>
              <dt>Account</dt>
              <dd>Ending {transaction.recipientAccountNumber.slice(-4)}</dd>
            </div>
          )}
          {transaction.remarks && (
            <div>
              <dt>Remarks</dt>
              <dd>{transaction.remarks}</dd>
            </div>
          )}
          <div>
            <dt>Reference</dt>
            <dd>
              <button onClick={copyReference}>
                {transaction.reference}
                <Copy size={14} />
              </button>
            </dd>
          </div>
        </dl>
        <p className="detail-note">
          <ShieldCheck size={15} /> Status was last reconciled by the DRPAY
          server with SwiftPay.
        </p>
        {isTransfer && (
          <div className="transaction-receipt-actions">
            {canRepeatTransfer && (
              <Button
                variant="secondary"
                icon={<RefreshCw size={15} />}
                onClick={repeatTransfer}
              >
                Repeat transfer
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<Download size={15} />}
              onClick={() => void downloadReceipt()}
            >
              Download receipt image
            </Button>
            <Button
              variant="secondary"
              icon={<Share2 size={15} />}
              onClick={() => void shareReceipt()}
            >
              Share receipt image
            </Button>
            {receiptError && (
              <div className="inline-error" role="alert">
                <AlertCircle size={14} />
                {receiptError}
              </div>
            )}
          </div>
        )}
        {refundCompleted && (
          <div className="refund-status refund-status-complete">
            <ShieldCheck size={15} />
            Refund transfer completed.
          </div>
        )}
        {refundInProgress && (
          <div className="refund-status">
            <LoaderCircle size={15} className="spin" />
            Refund transfer is being processed. Check Wallet activity for its
            latest status.
          </div>
        )}
        {transaction.canRefund && !refundDetails && (
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} />}
            onClick={() => void loadRefundDetails()}
            disabled={refundLoading}
          >
            {refundLoading ? "Checking refund…" : "Refund to payer"}
          </Button>
        )}
        {refundDetails && (
          <form className="refund-confirmation" onSubmit={submitRefund}>
            <strong>Refund to the original payer</strong>
            <p>
              {formatPeso(refundDetails.amount)} will be transferred via{" "}
              {refundDetails.channel} to {refundDetails.fullName} ·{" "}
              {refundDetails.institutionCode}, account ending{" "}
              {refundDetails.accountNumber.slice(-4)}. The platform fee will not
              be refunded.
            </p>
            <label>
              <span>Confirm with your MPIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                pattern="[0-9]{4}"
                value={refundPin}
                onChange={(event) =>
                  setRefundPin(
                    event.target.value.replace(/\D/g, "").slice(0, 4),
                  )
                }
                required
              />
            </label>
            {refundError && (
              <div className="inline-error" role="alert">
                <AlertCircle size={14} />
                {refundError}
              </div>
            )}
            <Button
              type="submit"
              disabled={refundSubmitting || refundPin.length !== 4}
            >
              {refundSubmitting
                ? "Submitting refund…"
                : `Confirm refund · ${formatPeso(refundDetails.amount)}`}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setRefundDetails(null)
                setRefundPin("")
                setRefundError("")
              }}
            >
              Cancel
            </Button>
          </form>
        )}
        {!transaction.canRefund &&
          !refundInProgress &&
          !refundCompleted &&
          transaction.refundStatus && (
            <div className="refund-status">
              The previous refund transfer failed. This collection can be
              retried.
            </div>
          )}
        {refundError && !refundDetails && (
          <div className="inline-error" role="alert">
            <AlertCircle size={14} />
            {refundError}
          </div>
        )}
        <Button onClick={onClose}>Done</Button>
      </section>
    </div>
  )
}

function TransferSheet({
  balance,
  onClose,
  onComplete,
  initialValues,
}: {
  balance: number
  onClose: () => void
  onComplete: () => void
  initialValues?: TransferQrDetails
}) {
  const { balanceVisible } = useBalanceVisibility()
  const pesonetAvailable = !Capacitor.isNativePlatform()
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [bank, setBank] = useState("")
  const [bankSearch, setBankSearch] = useState("")
  const [bankPickerOpen, setBankPickerOpen] = useState(false)
  const [banksLoading, setBanksLoading] = useState(true)
  const [banksError, setBanksError] = useState("")
  const [bankLoadAttempt, setBankLoadAttempt] = useState(0)
  const [channel, setChannel] = useState<"INSTAPAY" | "PESONET">(
    initialValues?.channel === "PESONET" && pesonetAvailable
      ? "PESONET"
      : "INSTAPAY",
  )
  const [name, setName] = useState(initialValues?.fullName || "")
  const [account, setAccount] = useState(initialValues?.accountNumber || "")
  const [amount, setAmount] = useState(
    initialValues?.amount ? String(initialValues.amount) : "",
  )
  const [remarks, setRemarks] = useState("Bank transfer")
  const [reviewing, setReviewing] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<TransferResult | null>(null)
  const [receiptDetails, setReceiptDetails] = useState<{
    amount: number
    channel: "INSTAPAY" | "PESONET"
    institutionName: string
    accountNumber: string
    recipientName: string
    remarks: string
    reference: string
    status: string
    createdAt: string
  } | null>(null)
  const [receiptActionError, setReceiptActionError] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  )

  useEffect(() => {
    setBanksLoading(true)
    setBanksError("")
    getInstitutions()
      .then((items) => {
        setInstitutions(items)
        const requestedBank = initialValues?.bank.trim().toLowerCase()
        const matchedBank = requestedBank
          ? items.find(
              (item) =>
                item.code.toLowerCase() === requestedBank ||
                item.name.trim().toLowerCase() === requestedBank,
            )
          : undefined
        setBank(
          matchedBank?.code || (initialValues ? "" : items[0]?.code || ""),
        )
        if (initialValues && !matchedBank)
          setError(
            `The QR bank “${initialValues.bank}” is not supported for transfers. Choose a bank to continue.`,
          )
      })
      .catch((requestError) => {
        setBanksError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load banks",
        )
      })
      .finally(() => setBanksLoading(false))
  }, [bankLoadAttempt, initialValues])

  const transferAuthorization: TransferAuthorizationInput = {
    amount: Number(amount),
    channel,
    institutionCode: bank,
    accountNumber: account,
    fullName: name,
    remarks,
    idempotencyKey,
  }

  async function submitWithAuthorization() {
    if (!pesonetAvailable && channel === "PESONET") {
      setError("PESONet transfers are available only in a web browser.")
      return
    }
    setBusy(true)
    setError("")
    setReceiptActionError("")
    try {
      const authorization = await authorizeTransferWithPin(
        transferAuthorization,
        pin,
      )
      const response = await createTransfer({
        ...transferAuthorization,
        stepUpToken: authorization.stepUpToken,
      })
      setResult(response)
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
      })
      onComplete()
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Transfer failed"
      setError(message)
      if (
        !message.toLowerCase().includes("unknown") &&
        !message.toLowerCase().includes("already") &&
        !message.toLowerCase().includes("reconcil")
      ) {
        setIdempotencyKey(crypto.randomUUID())
      }
    } finally {
      setBusy(false)
    }
  }

  const selectedBank = institutions.find((item) => item.code === bank)
  const filteredInstitutions = useMemo(() => {
    const query = bankSearch.trim().toLowerCase()
    if (!query) return institutions
    return institutions.filter((item) =>
      `${item.name} ${item.code}`.toLowerCase().includes(query),
    )
  }, [bankSearch, institutions])
  const invalidAmount = Number(amount) <= 0 || Number(amount) > balance
  const channelAvailable =
    channel === "INSTAPAY"
      ? selectedBank?.instapayEnabled !== false
      : pesonetAvailable && selectedBank?.pesonetEnabled !== false
  async function downloadTransferReceipt() {
    if (!receiptDetails) return
    setReceiptActionError("")
    try {
      await downloadTransferReceiptImage(receiptDetails)
    } catch (receiptDownloadError) {
      setReceiptActionError(
        receiptDownloadError instanceof Error
          ? receiptDownloadError.message
          : "Could not download the transfer receipt image.",
      )
    }
  }

  async function shareTransferReceipt() {
    if (!receiptDetails) return
    setReceiptActionError("")
    try {
      await shareTransferReceiptImage(receiptDetails)
    } catch (shareError) {
      setReceiptActionError(
        shareError instanceof Error
          ? shareError.message
          : "Could not share the transfer receipt image. Download it instead.",
      )
    }
  }

  function selectBank(code: string) {
    const institution = institutions.find((item) => item.code === code)
    setBank(code)
    setBankSearch("")
    setBankPickerOpen(false)
    setError("")
    if (
      channel === "INSTAPAY" &&
      institution?.instapayEnabled === false &&
      pesonetAvailable &&
      institution.pesonetEnabled
    ) {
      setChannel("PESONET")
    } else if (
      channel === "PESONET" &&
      institution?.pesonetEnabled === false &&
      institution.instapayEnabled
    ) {
      setChannel("INSTAPAY")
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="payment-sheet"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <span className="eyebrow">BANK TRANSFER</span>
            <h2>
              {result
                ? "Transfer submitted"
                : bankPickerOpen
                  ? "Choose a bank or wallet"
                  : reviewing
                    ? authorizing
                      ? "Verify transfer"
                      : "Review transfer"
                    : "Send money"}
            </h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {result ? (
          <div className="link-result">
            <div className="result-icon">
              <Send size={23} />
            </div>
            <strong>
              {result.outcomeUnknown
                ? "Outcome needs review"
                : [
                      "REJECTED",
                      "ERROR",
                      "FAILED",
                      "CANCELED",
                      "CANCELLED",
                    ].includes(result.status.toUpperCase())
                  ? "Transfer not sent"
                  : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(
                        result.status.toUpperCase(),
                      )
                    ? "Transfer settled"
                    : "Transfer accepted for processing"}
            </strong>
            <p>
              {result.outcomeUnknown
                ? "The provider response was ambiguous. Do not retry until the transfer is reconciled."
                : [
                      "REJECTED",
                      "ERROR",
                      "FAILED",
                      "CANCELED",
                      "CANCELLED",
                    ].includes(result.status.toUpperCase())
                  ? result.message || "SwiftPay rejected the transfer."
                  : ["EXECUTED", "SUCCESS", "COMPLETED"].includes(
                        result.status.toUpperCase(),
                      )
                    ? result.message || "SwiftPay confirmed settlement."
                    : result.message ||
                      "Provider acceptance is not final settlement. Track the terminal status in Wallet activity."}
            </p>
            <span className="payment-state">Status: {result.status}</span>
            {receiptDetails &&
              !result.outcomeUnknown &&
              ![
                "REJECTED",
                "ERROR",
                "FAILED",
                "CANCELED",
                "CANCELLED",
              ].includes(result.status.toUpperCase()) && (
                <>
                  <dl className="detail-list">
                    <div>
                      <dt>Amount</dt>
                      <dd>{formatPeso(receiptDetails.amount)}</dd>
                    </div>
                    <div>
                      <dt>Reference</dt>
                      <dd>{receiptDetails.reference}</dd>
                    </div>
                    <div>
                      <dt>Recipient</dt>
                      <dd>{receiptDetails.recipientName}</dd>
                    </div>
                    <div>
                      <dt>Institution</dt>
                      <dd>{receiptDetails.institutionName}</dd>
                    </div>
                    <div>
                      <dt>Account</dt>
                      <dd>Ending {receiptDetails.accountNumber.slice(-4)}</dd>
                    </div>
                    <div>
                      <dt>Network</dt>
                      <dd>{receiptDetails.channel}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>
                        {new Date(receiptDetails.createdAt).toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                  <div className="result-actions">
                    <Button
                      variant="secondary"
                      icon={<Download size={15} />}
                      onClick={() => void downloadTransferReceipt()}
                    >
                      Download receipt image
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<Share2 size={15} />}
                      onClick={() => void shareTransferReceipt()}
                    >
                      Share receipt image
                    </Button>
                  </div>
                  {receiptActionError && (
                    <div className="inline-error" role="alert">
                      <AlertCircle size={14} />
                      {receiptActionError}
                    </div>
                  )}
                </>
              )}
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : bankPickerOpen ? (
          <section
            className="bank-selection"
            aria-label="Choose transfer destination"
          >
            <button
              type="button"
              className="institution-back"
              onClick={() => {
                setBankPickerOpen(false)
                setBankSearch("")
              }}
            >
              <ChevronLeft size={16} /> Back to transfer
            </button>
            <p className="bank-selection-note">
              Choose where you’re sending money. Available transfer networks are
              shown for each destination.
            </p>
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
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setBankLoadAttempt((attempt) => attempt + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : banksLoading ? (
              <div className="bank-picker-empty" role="status">
                <LoaderCircle className="spin" size={16} /> Loading banks and
                wallets…
              </div>
            ) : (
              <div
                className="bank-selection-list"
                role="listbox"
                aria-label="Supported banks and wallets"
              >
                {filteredInstitutions.length > 0 ? (
                  filteredInstitutions.map((item) => {
                    const supportsInstapay = item.instapayEnabled !== false
                    const supportsPesonet =
                      pesonetAvailable && item.pesonetEnabled !== false
                    const unavailable = !supportsInstapay && !supportsPesonet
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
                        <InstitutionLogo
                          institution={item}
                          className="institution-selection-logo"
                        />
                        <span className="institution-option-copy">
                          <strong>{item.name}</strong>
                          <small>
                            {unavailable
                              ? pesonetAvailable
                                ? "Transfers unavailable"
                                : "Not available in app"
                              : [
                                  supportsInstapay && "InstaPay",
                                  supportsPesonet && "PESONet",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </small>
                        </span>
                        {item.code === bank && (
                          <ShieldCheck
                            className="bank-selection-check"
                            size={17}
                            aria-label="Selected"
                          />
                        )}
                        {!unavailable && item.code !== bank && (
                          <ChevronRight size={16} aria-hidden="true" />
                        )}
                      </button>
                    )
                  })
                ) : (
                  <p className="bank-picker-empty">
                    {banksLoading
                      ? "Loading banks and wallets…"
                      : "No banks or wallets match your search."}
                  </p>
                )}
              </div>
            )}
            <p className="bank-selection-footnote">
              <ShieldCheck size={14} /> Transfer availability depends on the
              selected bank and network.
            </p>
          </section>
        ) : reviewing ? (
          <div className="transfer-review">
            <div className="transfer-step-heading">
              <span>Step 2 of 2</span>
              <strong>
                {authorizing
                  ? "Verify with your MPIN"
                  : "Review before sending"}
              </strong>
              <small>
                {authorizing
                  ? "Your MPIN securely authorizes this transfer."
                  : "Check the recipient and account details carefully. Transfers may not be reversible."}
              </small>
            </div>
            <div className="review-total">
              <span>You’re sending</span>
              <strong>
                ₱
                {Number(amount).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Recipient</dt>
                <dd>{name}</dd>
              </div>
              <div>
                <dt>Bank</dt>
                <dd>{selectedBank?.name}</dd>
              </div>
              <div>
                <dt>Account number</dt>
                <dd>{account}</dd>
              </div>
              <div>
                <dt>Transfer network</dt>
                <dd>{channel === "INSTAPAY" ? "InstaPay" : "PESONet"}</dd>
              </div>
              {remarks.trim() && (
                <div>
                  <dt>Remarks</dt>
                  <dd>{remarks.trim()}</dd>
                </div>
              )}
            </dl>
            {error && (
              <div className="inline-error">
                <AlertCircle size={15} />
                {error}
              </div>
            )}
            {!authorizing ? (
              <div className="result-actions">
                <Button variant="secondary" onClick={() => setReviewing(false)}>
                  Back
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setAuthorizing(true)
                    setError("")
                  }}
                  icon={<ShieldCheck size={16} />}
                >
                  Continue to MPIN
                </Button>
              </div>
            ) : (
              <div className="transfer-authorization">
                <p>Enter your MPIN to approve this transfer.</p>
                <label>
                  <span>Four-digit MPIN</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={pin}
                    onChange={(event) =>
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                  />
                </label>
                <Button
                  disabled={busy || pin.length !== 4}
                  onClick={() => void submitWithAuthorization()}
                  icon={
                    busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <KeyRound size={16} />
                    )
                  }
                >
                  {busy ? "Verifying…" : "Verify MPIN and send"}
                </Button>
                <button
                  type="button"
                  className="authorization-back"
                  disabled={busy}
                  onClick={() => {
                    setAuthorizing(false)
                    setPin("")
                    setError("")
                  }}
                >
                  Back to transfer details
                </button>
              </div>
            )}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setReviewing(true)
            }}
          >
            <div className="transfer-step-heading">
              <span>Step 1 of 2</span>
              <strong>Enter transfer details</strong>
              <small>
                Choose a destination and confirm the recipient information.
              </small>
            </div>
            {error && (
              <div className="inline-error" role="alert">
                <AlertCircle size={15} />
                {error}
              </div>
            )}
            <div className="bank-picker">
              <span className="bank-picker-label" id="transfer-bank-label">
                Bank or wallet
              </span>
              <button
                type="button"
                className="bank-picker-trigger"
                aria-labelledby="transfer-bank-label"
                aria-haspopup="dialog"
                disabled={banksLoading || Boolean(banksError)}
                onClick={() => setBankPickerOpen(true)}
              >
                <span className="bank-picker-name">
                  {selectedBank && (
                    <InstitutionLogo
                      key={selectedBank.code}
                      institution={selectedBank}
                      className="bank-picker-logo"
                    />
                  )}
                  {banksLoading
                    ? "Loading banks…"
                    : selectedBank?.name || "Choose a bank or wallet"}
                </span>
                <span className="bank-picker-trigger-action">
                  {selectedBank ? "Change" : "Choose"}{" "}
                  <ChevronRight size={16} />
                </span>
              </button>
            </div>
            <div className="transfer-field-group">
              <span className="bank-picker-label">Transfer network</span>
              <div className="rail-selector">
                {(pesonetAvailable
                  ? (["INSTAPAY", "PESONET"] as const)
                  : (["INSTAPAY"] as const)
                ).map((item) => {
                  const available =
                    item === "INSTAPAY"
                      ? selectedBank?.instapayEnabled !== false
                      : pesonetAvailable &&
                        selectedBank?.pesonetEnabled !== false
                  const networkName =
                    item === "INSTAPAY" ? "InstaPay" : "PESONet"
                  return (
                    <button
                      key={item}
                      type="button"
                      className={channel === item ? "active" : ""}
                      aria-label={`${networkName} — ${
                        item === "INSTAPAY"
                          ? "real-time transfers"
                          : "batch bank transfers"
                      }`}
                      aria-pressed={channel === item}
                      onClick={() => setChannel(item)}
                      disabled={!selectedBank || !available}
                    >
                      <span className="transfer-network-logo-frame">
                        <img
                          src={`/bank-logos/${
                            item === "INSTAPAY" ? "instapay" : "pesonet"
                          }.png`}
                          alt=""
                          aria-hidden="true"
                        />
                      </span>
                      <small>
                        {item === "INSTAPAY"
                          ? "Real-time transfers"
                          : "Batch bank transfers"}
                      </small>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="transfer-recipient-fields">
              <label>
                <span>Recipient full name</span>
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name on bank account"
                  required
                />
              </label>
              <label>
                <span>Account number</span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  value={account}
                  onChange={(event) =>
                    setAccount(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter account number"
                  required
                />
              </label>
            </div>
            <label className="transfer-amount-label">
              <span>
                Amount{" "}
                <small>
                  Available {balanceVisible ? formatPeso(balance) : "₱ ••••••"}
                </small>
              </span>
              <div className="amount-field">
                <span>₱</span>
                <input
                  type="number"
                  min="1"
                  max={balance}
                  step=".01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
                <small>PHP</small>
              </div>
            </label>
            <label>
              <span>Remarks</span>
              <input
                value={remarks}
                onChange={(event) =>
                  setRemarks(event.target.value.slice(0, 80))
                }
                maxLength={80}
                required
                placeholder="What is this transfer for?"
              />
            </label>
            {invalidAmount && amount && (
              <div className="inline-error">
                <AlertCircle size={15} />
                Enter an amount within your available balance.
              </div>
            )}
            <Button
              type="submit"
              disabled={
                banksLoading ||
                Boolean(banksError) ||
                invalidAmount ||
                !bank ||
                !channelAvailable ||
                !account.trim() ||
                !name.trim() ||
                !remarks.trim()
              }
            >
              Review transfer <ChevronRight size={16} />
            </Button>
          </form>
        )}
      </section>
    </div>
  )
}

function ScannerSheet({
  onClose,
  onTransferQr,
}: {
  onClose: () => void
  onTransferQr: (details: TransferQrDetails) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<"scan" | "collect" | "merchant">("scan")
  const [cameraError, setCameraError] = useState("")
  const [cameraRetry, setCameraRetry] = useState(0)
  const [decodingUpload, setDecodingUpload] = useState(false)
  const [merchantQr, setMerchantQr] = useState<MerchantQrDetails | null>(null)

  function handlePayload(payload: string) {
    const scannedQr = parseScannedQr(payload)
    if (!scannedQr) {
      setCameraError(
        "This QR format is not recognized. Scan a QR Ph P2P recipient code or QR Ph P2M merchant code.",
      )
      return
    }
    if (scannedQr.type === "p2p") {
      onTransferQr(scannedQr.transfer)
      return
    }
    setMerchantQr(scannedQr.merchant)
    setMode("merchant")
  }

  useEffect(() => {
    if (mode !== "scan" || decodingUpload || !videoRef.current) return
    let active = true
    let stopScanner: (() => void) | undefined
    void import("@zxing/browser")
      .then(({ BrowserQRCodeReader }) => {
        if (!active || !videoRef.current) return
        return new BrowserQRCodeReader().decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result, error) => {
            if (!active) return
            if (result) {
              active = false
              stopScanner?.()
              setCameraError("")
              handlePayload(result.getText())
            } else if (isDetectedQrUnreadable(error)) {
              setCameraError(
                "The camera could not read the QR code. Improve the lighting, hold the phone steady, and try again.",
              )
            }
          },
        )
      })
      .then((controls) => {
        if (!controls) return
        if (active) stopScanner = () => controls.stop()
        else controls.stop()
      })
      .catch((error: unknown) => {
        if (!active) return
        if (
          error instanceof DOMException &&
          (error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError")
        ) {
          setCameraError(
            "Camera access was denied. Allow camera permission for DRPAY in your device settings, then try again.",
          )
        } else if (
          error instanceof DOMException &&
          error.name === "NotFoundError"
        ) {
          setCameraError(
            "No camera was found on this device. You can still upload a QR image.",
          )
        } else if (
          error instanceof DOMException &&
          error.name === "NotReadableError"
        ) {
          setCameraError(
            "The camera is already in use by another app. Close it and try again.",
          )
        } else {
          setCameraError(
            error instanceof Error
              ? error.message
              : "Camera access is unavailable. You can still upload a QR image.",
          )
        }
      })
    return () => {
      active = false
      stopScanner?.()
    }
  }, [mode, decodingUpload, cameraRetry])

  async function scanImage(file?: File) {
    if (!file) return
    setCameraError("")
    if (!file.type.startsWith("image/")) {
      setCameraError("Choose a valid image file containing a QR code.")
      if (uploadRef.current) uploadRef.current.value = ""
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setCameraError(
        "This image is larger than 10 MB. Choose a smaller QR image.",
      )
      if (uploadRef.current) uploadRef.current.value = ""
      return
    }
    setDecodingUpload(true)
    const imageUrl = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = imageUrl
      await image.decode()
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 24_000_000
      ) {
        throw new Error(
          "This image is too large to scan safely. Choose an image under 24 megapixels.",
        )
      }
      const { BrowserQRCodeReader } = await import("@zxing/browser")
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(
        imageUrl,
      )
      handlePayload(result.getText())
    } catch (error) {
      setCameraError(
        isQrDecodeMiss(error)
          ? "No QR code was found in that image."
          : error instanceof Error
            ? `Could not read the uploaded QR: ${error.message}`
            : "Could not read the uploaded QR.",
      )
    } finally {
      URL.revokeObjectURL(imageUrl)
      setDecodingUpload(false)
      if (uploadRef.current) uploadRef.current.value = ""
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="payment-sheet scanner-sheet"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <span className="eyebrow">QR SCANNER</span>
            <h2>
              {mode === "scan"
                ? "Scan a QR"
                : mode === "collect"
                  ? "Open-amount QR Ph"
                  : "Merchant QR details"}
            </h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {mode === "scan" ? (
          <>
            <div className="scanner-camera">
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="Live QR scanner"
              />
              <span className="scanner-frame" aria-hidden="true" />
              <span className="scanner-hint">
                Scan a QR Ph recipient or merchant code
              </span>
            </div>
            {cameraError && (
              <div className="inline-error" role="alert">
                <AlertCircle size={15} />
                <span>{cameraError}</span>
                <button
                  className="camera-retry"
                  onClick={() => {
                    setCameraError("")
                    setCameraRetry((retry) => retry + 1)
                  }}
                >
                  Retry camera
                </button>
              </div>
            )}
            {decodingUpload && (
              <p className="institution-list-state" role="status">
                <LoaderCircle className="spin" size={16} />
                Reading uploaded QR…
              </p>
            )}
            <input
              ref={uploadRef}
              className="scanner-file-input"
              type="file"
              accept="image/*"
              onChange={(event) => void scanImage(event.target.files?.[0])}
            />
            <div className="scanner-actions">
              <Button
                variant="secondary"
                disabled={decodingUpload}
                onClick={() => uploadRef.current?.click()}
                icon={<Download size={17} />}
              >
                Upload a QR
              </Button>
              <Button
                onClick={() => {
                  setCameraError("")
                  setMode("collect")
                }}
                icon={<QrCode size={17} />}
              >
                Generate QR
              </Button>
            </div>
          </>
        ) : mode === "collect" ? (
          <div className="static-qr-collection">
            <p>Customer enters the amount in their QR Ph payment app.</p>
            <img
              src="/static-qrph.jpg"
              alt="SwiftPay static QR Ph merchant code"
            />
            <a
              className="button button-secondary"
              href="/static-qrph.jpg"
              download="swiftpay-static-qrph.jpg"
            >
              <Download size={16} /> Download QR
            </a>
            <Button variant="quiet" onClick={() => setMode("scan")}>
              Back to scanner
            </Button>
          </div>
        ) : (
          <div className="merchant-qr-details">
            <span className="merchant-qr-icon">
              <QrCode size={24} />
            </span>
            <strong>QR Ph merchant code</strong>
            <dl className="detail-list">
              <div>
                <dt>Merchant</dt>
                <dd>{merchantQr?.merchantName || "Not provided"}</dd>
              </div>
              <div>
                <dt>Merchant ID</dt>
                <dd>{merchantQr?.merchantId || "Not provided"}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>
                  {merchantQr?.amount
                    ? `${merchantQr.currency || "PHP"} ${merchantQr.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                    : "Open amount"}
                </dd>
              </div>
              {merchantQr?.city && (
                <div>
                  <dt>City</dt>
                  <dd>{merchantQr.city}</dd>
                </div>
              )}
              {merchantQr?.reference && (
                <div>
                  <dt>Reference</dt>
                  <dd>{merchantQr.reference}</dd>
                </div>
              )}
            </dl>
            <p>
              This QR is a merchant payment code. Use it in a payer app to
              complete the payment.
            </p>
            <Button
              onClick={() => {
                setMerchantQr(null)
                setCameraError("")
                setMode("scan")
              }}
            >
              Scan another QR
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function PaymentLinkSheet({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [url, setUrl] = useState("")
  const [qrCode, setQrCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [code, setCode] = useState("")
  const [paymentStatus, setPaymentStatus] = useState("")
  const [selectingInstitution, setSelectingInstitution] = useState(false)
  const [selectedInstitution, setSelectedInstitution] =
    useState<PaymentInstitution | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    getPaymentLinkIdempotencyKey(),
  )

  useEffect(() => {
    if (!code) return
    const timer = window.setInterval(async () => {
      try {
        const latest = await getPaymentLinkStatus(code)
        const status = latest.status || "PENDING"
        setPaymentStatus(status)
        if (isTerminalPaymentStatus(status)) window.clearInterval(timer)
      } catch {
        // Keep the QR visible while a temporary status request is unavailable.
      }
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [code])
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSelectingInstitution(true)
  }
  async function createCheckout(institution: PaymentInstitution) {
    setSelectedInstitution(institution)
    setBusy(true)
    setError("")
    try {
      const result = await createPaymentLink(
        { amount: Number(amount), description, customerEmail, institution },
        idempotencyKey,
      )
      setUrl(result.paymentUrl)
      setQrCode(result.qrCode || "")
      setCode(result.code)
      setPaymentStatus(result.status || "PENDING")
      clearPaymentLinkIdempotencyKey()
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not create QR checkout"
      setError(message)
      if (
        !message.toLowerCase().includes("unknown") &&
        !message.toLowerCase().includes("reconcil")
      ) {
        setIdempotencyKey(resetPaymentLinkIdempotencyKey())
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="payment-sheet"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <span className="eyebrow">SELF-HOSTED CHECKOUT</span>
            <h2>
              {url
                ? "Payment link ready"
                : selectingInstitution
                  ? "Choose payment app"
                  : "Create payment link"}
            </h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {url ? (
          <div className="link-result">
            <div className="result-icon">
              <Link2 size={23} />
            </div>
            <strong>Payment link ready</strong>
            <p>Share this DRPAY-hosted checkout page with your customer.</p>
            {customerEmail.trim() && (
              <p className="accepted-channels">
                Payment request queued for {customerEmail.trim()}. We’ll email
                them again when payment is confirmed.
              </p>
            )}
            <span
              className={`payment-state state-${paymentStatus.toLowerCase()}`}
            >
              {isConfirmedPaymentStatus(paymentStatus)
                ? "Payment confirmed by SwiftPay"
                : `Checkout status: ${paymentStatus || "PENDING"}`}
            </span>
            <PaymentLinkActions url={url} />
            <QrPaymentDisplay
              value={qrCode}
              institution={selectedInstitution || undefined}
            />
            <Button variant="quiet" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : selectingInstitution ? (
          <InstitutionSelectionScreen
            onBack={() => setSelectingInstitution(false)}
            onConfirm={(institution) => void createCheckout(institution)}
            busy={busy}
            submissionError={error}
          />
        ) : (
          <form onSubmit={submit}>
            <label>
              <span>Description</span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Fixed amount</span>
              <div className="amount-field">
                <span>₱</span>
                <input
                  type="number"
                  min="1"
                  step=".01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
                <small>PHP</small>
              </div>
            </label>
            <label>
              <span>
                Customer email <small>(optional)</small>
              </span>
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="customer@example.com"
                autoComplete="email"
                maxLength={254}
              />
              <small>
                We’ll email the checkout link and send a payment-confirmed email
                after the customer pays.
              </small>
            </label>
            {error && (
              <div className="inline-error">
                <AlertCircle size={15} />
                {error}
              </div>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create payment link"}
            </Button>
          </form>
        )}
      </section>
    </div>
  )
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
  data: DashboardData
  onRequestPayment: () => void
  onTransfer: () => void
  onScan: () => void
  onActivity: () => void
  onTransaction: (transaction: Transaction) => void
  onWithdraw: () => void
}) {
  const { balanceVisible, toggleBalanceVisibility } = useBalanceVisibility()

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
        <strong className="balance-value">
          {balanceVisible ? data.availableBalance : "₱ ••••••"}
        </strong>
        <div className="balance-floating">
          <div>
            <span className="balance-floating-label">
              <img src="/bank-logos/alipay-plus.svg" alt="Alipay+" />
              Floating balance
            </span>
            <strong>
              {balanceVisible ? data.internalWalletBalance : "₱ ••••••"}
            </strong>
          </div>
          <button
            type="button"
            className="balance-withdraw-button"
            onClick={onWithdraw}
          >
            Withdraw
          </button>
        </div>
      </section>

      <section className="quick-actions" aria-label="Quick actions">
        <QuickAction
          icon={<CreditCard size={22} />}
          label="Collect"
          onClick={onRequestPayment}
        />
        <QuickAction
          icon={<Send size={21} />}
          label="Transfer"
          onClick={onTransfer}
        />
        <QuickAction
          icon={<QrCode size={21} />}
          label="Scan QR"
          onClick={onScan}
        />
        <QuickAction
          icon={<ReceiptText size={21} />}
          label="Activity"
          onClick={onActivity}
        />
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
          <button className="text-button" onClick={onActivity}>
            See all
          </button>
        </header>
        <div className="transaction-list">
          {data.transactions.slice(0, 4).map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onClick={() => onTransaction(transaction)}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function MerchantActivityChart() {
  const [points, setPoints] = useState<MerchantActivityTrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const requestInFlight = useRef(false)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      if (requestInFlight.current) return
      requestInFlight.current = true
      try {
        const result = await getMerchantActivityTrend()
        if (active) {
          setPoints(result)
          setError("")
          setUpdatedAt(new Date())
        }
      } catch (requestError) {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load activity.",
          )
      } finally {
        requestInFlight.current = false
        if (active) setLoading(false)
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 10_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [retryKey])

  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.collections, point.transfers]),
  )
  const chartHeight = 150
  const chartTop = 12
  const chartBottom = 124
  const chartLeft = 44
  const chartRight = 360
  const yFor = (value: number) =>
    chartBottom - (value / maxValue) * (chartBottom - chartTop)
  const xFor = (index: number) =>
    chartLeft +
    (index * (chartRight - chartLeft)) / Math.max(points.length - 1, 1)
  const seriesPath = (field: "collections" | "transfers") =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point[field])}`,
      )
      .join(" ")
  const hasActivity = points.some(
    (point) => point.collections > 0 || point.transfers > 0,
  )
  const formatAxisValue = (value: number) =>
    value >= 1000
      ? `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
      : `₱${Math.round(value)}`

  return (
    <section
      className="merchant-trend-card"
      aria-labelledby="merchant-trend-title"
    >
      <header className="section-header">
        <div>
          <span className="eyebrow">LAST 7 DAYS</span>
          <h2 id="merchant-trend-title">Collections & transfers</h2>
        </div>
        <span className="merchant-trend-live">
          <i /> LIVE · 10 SEC
        </span>
      </header>
      {loading && points.length === 0 ? (
        <p className="merchant-trend-message">Loading activity…</p>
      ) : error && points.length === 0 ? (
        <div
          className="merchant-trend-message merchant-trend-error"
          role="status"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="merchant-trend-legend">
            <span>
              <i className="merchant-trend-collection-dot" /> Collections
            </span>
            <span>
              <i className="merchant-trend-transfer-dot" /> Transfers
            </span>
          </div>
          <svg
            className="merchant-trend-svg"
            viewBox={`0 0 380 ${chartHeight}`}
            role="img"
            aria-label="Successful collections and transfers by day over the last seven days"
          >
            {[0, 0.5, 1].map((fraction) => {
              const y = chartBottom - fraction * (chartBottom - chartTop)
              return (
                <g key={fraction}>
                  <line
                    x1={chartLeft}
                    x2={chartRight}
                    y1={y}
                    y2={y}
                    className="merchant-trend-gridline"
                  />
                  <text
                    x={chartLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="merchant-trend-axis"
                  >
                    {formatAxisValue(maxValue * fraction)}
                  </text>
                </g>
              )
            })}
            {points.length > 0 && (
              <>
                <path
                  d={seriesPath("collections")}
                  className="merchant-trend-line merchant-trend-collection-line"
                />
                <path
                  d={seriesPath("transfers")}
                  className="merchant-trend-line merchant-trend-transfer-line"
                />
                {points.map((point, index) => (
                  <g key={point.date}>
                    <circle
                      cx={xFor(index)}
                      cy={yFor(point.collections)}
                      r="3"
                      className="merchant-trend-collection-point"
                    >
                      <title>{`${point.date}: collections ${formatPeso(point.collections)}`}</title>
                    </circle>
                    <circle
                      cx={xFor(index)}
                      cy={yFor(point.transfers)}
                      r="3"
                      className="merchant-trend-transfer-point"
                    >
                      <title>{`${point.date}: transfers ${formatPeso(point.transfers)}`}</title>
                    </circle>
                    <text
                      x={xFor(index)}
                      y={chartBottom + 18}
                      textAnchor="middle"
                      className="merchant-trend-axis"
                    >
                      {new Date(`${point.date}T00:00:00`).toLocaleDateString(
                        "en-PH",
                        { day: "numeric", month: "short" },
                      )}
                    </text>
                  </g>
                ))}
              </>
            )}
          </svg>
          {!hasActivity && (
            <p className="merchant-trend-empty">
              No successful collections or transfers in this period.
            </p>
          )}
          <div className="merchant-trend-updated">
            {error
              ? `Update failed: ${error}`
              : updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`
                : ""}
          </div>
        </>
      )}
    </section>
  )
}

const WALLET_ACTIVITY_FILTERS = [
  "All activity",
  "Money in",
  "Money out",
  "Completed",
  "Pending",
  "Failed",
]

function WalletBalancePanel({
  data,
  balanceVisible,
  onToggleBalanceVisibility,
}: {
  data: DashboardData
  balanceVisible: boolean
  onToggleBalanceVisibility: () => void
}) {
  return (
    <section className="wallet-balance-panel">
      <div className="wallet-balance-heading">
        <span>Available balance</span>
        <button
          type="button"
          onClick={onToggleBalanceVisibility}
          aria-label={balanceVisible ? "Hide balances" : "Show balances"}
          aria-pressed={!balanceVisible}
        >
          <Eye size={15} /> {balanceVisible ? "Hide" : "Show"}
        </button>
      </div>
      <strong className="wallet-balance-value">
        {balanceVisible ? data.availableBalance : "₱ ••••••"}
      </strong>
      <div className="wallet-balance-foot">
        <span>
          <i /> Merchant wallet ledger
        </span>
        <span>
          {data.paymentEnvironment === "production" ? "Live" : "Sandbox"}
        </span>
      </div>
      {data.reservedBalance > 0 && (
        <p className="wallet-reserved-note">
          {formatPeso(data.reservedBalance)} reserved for pending transfers
        </p>
      )}
    </section>
  )
}

function WalletFloatingBalanceCard({
  data,
  balanceVisible,
}: {
  data: DashboardData
  balanceVisible: boolean
}) {
  const [payoutAccount, setPayoutAccount] =
    useState<MerchantPayoutAccount | null>(null)
  const [payoutAccountLoading, setPayoutAccountLoading] = useState(true)
  const [payoutAccountError, setPayoutAccountError] = useState("")
  const [requestError, setRequestError] = useState("")
  const [requestMessage, setRequestMessage] = useState("")
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [payoutRequests, setPayoutRequests] = useState<FloatingTransferRequest[]>([])
  const [payoutRequestsError, setPayoutRequestsError] = useState("")
  const [refreshingPayoutRequests, setRefreshingPayoutRequests] = useState(false)
  const collectionTargetKrw = 1_000_000
  const currentCollectionsKrw = Math.max(0, data.cumulativeKrwCollections)
  const collectionProgress = Math.min(
    100,
    (currentCollectionsKrw / collectionTargetKrw) * 100,
  )
  const formatKrw = (amount: number) =>
    `₩${Math.floor(amount).toLocaleString("en-US")}`
  const [availableToRequest, setAvailableToRequest] = useState(() =>
    Math.max(0, data.availableFloatingBalance - data.transferFeeFixed),
  )
  const maxRequestAmount = Math.min(
    availableToRequest,
    Math.max(
      0,
      Math.floor(
        (data.availableFloatingBalance - data.transferFeeFixed) * 100,
      ) / 100,
    ),
  )
  const thresholdReached = currentCollectionsKrw >= collectionTargetKrw
  const unlocked = data.paymentEnvironment === "production" && thresholdReached

  useEffect(() => {
    let active = true
    getMerchantPayoutAccount()
      .then((account) => {
        if (active) setPayoutAccount(account)
      })
      .catch((error) => {
        if (active)
          setPayoutAccountError(
            error instanceof Error
              ? error.message
              : "Could not load the saved payout account.",
          )
      })
      .finally(() => {
        if (active) setPayoutAccountLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function refreshPayoutRequests() {
    setRefreshingPayoutRequests(true)
    setPayoutRequestsError("")
    try {
      setPayoutRequests(await getMerchantFloatingTransferRequests())
    } catch (error) {
      setPayoutRequestsError(
        error instanceof Error
          ? error.message
          : "Could not load payout request history.",
      )
    } finally {
      setRefreshingPayoutRequests(false)
    }
  }

  useEffect(() => {
    let active = true
    getMerchantFloatingTransferRequests()
      .then((requests) => {
        if (active) setPayoutRequests(requests)
      })
      .catch((error) => {
        if (active)
          setPayoutRequestsError(
            error instanceof Error
              ? error.message
              : "Could not load payout request history.",
          )
      })
    return () => {
      active = false
    }
  }, [])

  async function submitTransferRequest() {
    setRequestError("")
    setRequestMessage("")
    const amount = maxRequestAmount
    if (amount <= 0) return
    setRequestSubmitting(true)
    try {
      const request = await createMerchantFloatingTransferRequest({ amount })
      setPayoutRequests((current) => [request, ...current].slice(0, 50))
      setAvailableToRequest((available) =>
        Math.max(0, available - amount - data.transferFeeFixed),
      )
      setRequestMessage(
        `${formatPeso(amount)} payout request sent to the DRPAY team for review.`,
      )
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Could not submit transfer request.",
      )
    } finally {
      setRequestSubmitting(false)
    }
  }

  return (
    <section className="floating-balance-card">
      <div className="floating-balance-heading">
        <span className="wallet-ledger-icon">
          <WalletCards size={18} aria-hidden="true" />
        </span>
        <div>
          <strong>Unsettled Funds</strong>
          <p>
            Shared progress across merchants using the same DRPAY PHP wallet.
          </p>
        </div>
      </div>
      <div className="floating-balance-values">
        <div>
          <small>Total balance</small>
          <strong>
            {balanceVisible ? data.internalWalletBalance : "₱ ••••••"}
          </strong>
        </div>
      </div>
      <div
        className="collection-progress"
        aria-label={`Shared maintained KRW collections: ${formatKrw(currentCollectionsKrw)} of ${formatKrw(collectionTargetKrw)}`}
      >
        <p>
          Shared maintained KRW collections{" "}
          <strong>
            {balanceVisible ? formatKrw(currentCollectionsKrw) : "₩ ••••••"}
          </strong>
        </p>
        <div
          className="collection-progress-track"
          role="progressbar"
          aria-label="Shared KRW collections toward the live-wallet unlock threshold"
          aria-valuemin={0}
          aria-valuemax={collectionTargetKrw}
          aria-valuenow={Math.min(
            collectionTargetKrw,
            Math.floor(currentCollectionsKrw),
          )}
        >
          <span style={{ width: `${collectionProgress}%` }} />
        </div>
      </div>
      <div
        className="unsettled-payout-account"
        aria-label="Saved payout bank account"
      >
        <CreditCard size={17} aria-hidden="true" />
        <div>
          <strong>Payout account</strong>
          {payoutAccountLoading ? (
            <small>Loading saved account…</small>
          ) : payoutAccount?.accountNumber ? (
            <>
              <span>{payoutAccount.bankName}</span>
              <small>
                {payoutAccount.accountName} ····{" "}
                {payoutAccount.accountNumber.slice(-4)}
              </small>
            </>
          ) : (
            <small>
              {payoutAccountError ||
                "No payout account saved. Contact the DRPAY team."}
            </small>
          )}
        </div>
      </div>
      <div
        className={`unsettled-unlock-status ${
          unlocked ? "unsettled-unlock-status-ready" : ""
        }`}
        role="status"
      >
        <ShieldCheck size={16} />
        <p>
          {unlocked
            ? "Unlocked for this merchant. Progress reflects your own completed collections and remaining ledger balance. The DRPAY team will transfer your unsettled funds separately."
            : data.paymentEnvironment !== "production"
              ? "This progress reflects your merchant's own collections and available ledger balance. You can request a floating-balance transfer before the threshold if DRPAY-provided funds are available. This is a sandbox environment."
              : "At ₩1,000,000 in this merchant's maintained collections, funds unlock for transfer by the DRPAY team. Your successful transfers reduce progress. Requests are available before the threshold if DRPAY-provided floating funds are available."}
        </p>
      </div>
      <section
        className="unsettled-request-section"
        aria-label="Request payout"
      >
        <Button
          icon={<Send size={16} />}
          onClick={() => void submitTransferRequest()}
          disabled={requestSubmitting || maxRequestAmount <= 0}
        >
          {requestSubmitting ? "Requesting…" : "Request Payout"}
        </Button>
        {requestError && (
          <div className="inline-error" role="alert">
            <AlertCircle size={15} />
            {requestError}
          </div>
        )}
        {requestMessage && (
          <p className="unsettled-request-success" role="status">
            {requestMessage}
          </p>
        )}
      </section>
      <section className="unsettled-request-history" aria-label="Payout request history">
        <header className="section-header">
          <h3>Request history</h3>
          <button
            type="button"
            className="text-button"
            disabled={refreshingPayoutRequests}
            onClick={() => void refreshPayoutRequests()}
          >
            {refreshingPayoutRequests ? "Refreshing…" : "Refresh"}
          </button>
        </header>
        {payoutRequestsError ? (
          <p className="inline-error" role="alert">{payoutRequestsError}</p>
        ) : payoutRequests.length ? (
          <div className="profile-recent-list">
            {payoutRequests.map((request) => (
              <div key={request.id}>
                <span>
                  <strong>
                    PHP {request.amount.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                  <small>
                    {new Date(request.requestedAt).toLocaleDateString()} · {request.bankName} · {request.status}
                  </small>
                  {request.payoutReference && (
                    <small>Bank reference: {request.payoutReference}</small>
                  )}
                  {request.payoutNote && <small>{request.payoutNote}</small>}
                  {request.failureReason && <small>{request.failureReason}</small>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="profile-info-note">Your payout requests and reconciliation references will appear here.</p>
        )}
      </section>
    </section>
  )
}

function WalletActivitySection({
  transactions,
  totalTransactions,
  filter,
  query,
  fromDate,
  toDate,
  hasMore,
  loadingMore,
  activityError,
  onExport,
  onFilterChange,
  onQueryChange,
  onDateChange,
  onLoadMore,
  onTransaction,
}: {
  transactions: Transaction[]
  totalTransactions: number
  filter: string
  query: string
  fromDate: string
  toDate: string
  hasMore: boolean
  loadingMore: boolean
  activityError: string
  onExport: (fromDate: string, toDate: string) => void
  onFilterChange: (filter: string) => void
  onQueryChange: (query: string) => void
  onDateChange: (key: "from" | "to", value: string) => void
  onLoadMore: () => void
  onTransaction: (transaction: Transaction) => void
}) {
  return (
    <>
      <header className="wallet-activity-heading">
        <div>
          <span className="eyebrow">MERCHANT ACTIVITY</span>
          <h2>Wallet activity</h2>
        </div>
        <span>{transactions.length} shown</span>
        <button
          type="button"
          className="text-button"
          onClick={() => onExport(fromDate, toDate)}
        >
          Export date-range CSV
        </button>
      </header>
      <label className="activity-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search description or reference"
          aria-label="Search wallet activity"
        />
      </label>
      <div className="wallet-date-filters" aria-label="Filter activity by date">
        <label>
          <span>From</span>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => onDateChange("from", event.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => onDateChange("to", event.target.value)}
          />
        </label>
      </div>
      <div className="filter-row">
        {WALLET_ACTIVITY_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            className={filter === item ? "active" : ""}
            onClick={() => onFilterChange(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="transaction-list full-list">
        {transactions.length > 0 ? (
          transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onClick={() => onTransaction(transaction)}
            />
          ))
        ) : (
          <div className="wallet-empty-state">
            <WalletCards size={23} />
            <strong>
              {totalTransactions
                ? "No matching activity"
                : "No wallet activity yet"}
            </strong>
            <p>
              {totalTransactions
                ? "Try a different filter or search term."
                : "Incoming payments and outgoing transfers will appear here."}
            </p>
          </div>
        )}
      </div>
      {activityError && <p className="inline-error" role="alert">{activityError}</p>}
      {hasMore && (
        <Button
          variant="secondary"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "Loading…" : "Load more activity"}
        </Button>
      )}
    </>
  )
}

function MainnetUsdtWallet() {
  const [wallet, setWallet] = useState<MerchantUsdtWallet | null>(null)
  const [deposits, setDeposits] = useState<MerchantUsdtDeposit[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [depositError, setDepositError] = useState("")
  const [depositMessage, setDepositMessage] = useState("")
  const [depositLoading, setDepositLoading] = useState(true)
  const [depositRefreshing, setDepositRefreshing] = useState(false)
  const [copyMessage, setCopyMessage] = useState("")

  async function loadWallet(refresh = false) {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError("")
    try {
      setWallet(await getMerchantUsdtWallet())
    } catch (loadError) {
      setWallet(null)
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the USDT mainnet wallet.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function loadDeposits(refresh = false) {
    if (refresh) setDepositRefreshing(true)
    else setDepositLoading(true)
    setDepositError("")
    try {
      const result = await getMerchantUsdtDeposits()
      setDeposits(result.deposits)
      setDepositMessage(result.message || "")
    } catch (loadError) {
      setDeposits([])
      setDepositError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load confirmed USDT deposits.",
      )
    } finally {
      setDepositLoading(false)
      setDepositRefreshing(false)
    }
  }

  useEffect(() => {
    void loadWallet()
    void loadDeposits()
  }, [])

  async function copyAddress() {
    if (!wallet?.address) return
    setCopyMessage("")
    try {
      await navigator.clipboard.writeText(wallet.address)
      setCopyMessage("Mainnet address copied.")
    } catch {
      setCopyMessage("Could not copy the address. Select and copy it manually.")
    }
  }

  return (
    <section className="crypto-wallet" aria-labelledby="crypto-wallet-title">
      <header className="crypto-wallet-header">
        <div>
          <span className="eyebrow">CRYPTO WALLET</span>
          <h2 id="crypto-wallet-title">USDT wallet</h2>
        </div>
        <span
          className={`crypto-wallet-badge ${
            wallet?.network === "TRON_SHASTA" ? "testnet" : ""
          }`}
        >
          {wallet?.network === "TRON_SHASTA"
            ? "TESTNET · NO REAL FUNDS"
            : "TRON MAINNET"}
        </span>
      </header>
      <div className="crypto-wallet-balance">
        <span>ON-CHAIN USDT BALANCE</span>
        <strong>
          {loading
            ? "Loading…"
            : wallet?.balance === null || !wallet
              ? "Unavailable"
              : `${wallet.balance} USDT`}
        </strong>
      </div>
      <div className="crypto-wallet-address">
        <span>
          DRPAY-ASSIGNED ADDRESS ·{" "}
          {wallet?.network === "TRON_SHASTA"
            ? "TRON SHASTA TESTNET"
            : "TRC20 MAINNET"}
        </span>
        <strong className="crypto-wallet-address-value">
          {wallet?.address || (loading ? "Loading…" : "Not assigned")}
        </strong>
        {wallet?.address && (
          <Button
            variant="secondary"
            className="crypto-wallet-copy"
            icon={<Copy size={13} />}
            onClick={() => void copyAddress()}
          >
            Copy address
          </Button>
        )}
      </div>
      <section className="crypto-deposit-history" aria-label="USDT deposit history">
        <header className="section-header">
          <div>
            <span className="eyebrow">TRON · TRC20</span>
            <h3>Recent USDT deposits</h3>
          </div>
          <Button
            variant="quiet"
            disabled={depositLoading || depositRefreshing}
            onClick={() => void loadDeposits(true)}
          >
            {depositRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </header>
        {depositLoading ? (
          <p className="crypto-wallet-feedback" role="status">Loading confirmed deposits…</p>
        ) : depositError ? (
          <p className="crypto-wallet-feedback crypto-wallet-error" role="alert">{depositError}</p>
        ) : deposits.length ? (
          <div className="crypto-deposit-list">
            {deposits.map((deposit) => (
              <article className="crypto-deposit-row" key={deposit.transactionId}>
                <div>
                  <strong>{deposit.amount} USDT</strong>
                  <small>{new Date(deposit.blockTimestamp).toLocaleString()}</small>
                  <small>From {deposit.from}</small>
                </div>
                <span className="crypto-wallet-badge">
                  {deposit.confirmed ? "CONFIRMED" : "PENDING"}
                </span>
                <a
                  href={`https://tronscan.org/#/transaction/${encodeURIComponent(deposit.transactionId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              </article>
            ))}
          </div>
        ) : (
          <p className="crypto-wallet-feedback" role="status">
            {depositMessage || "No confirmed USDT deposits found in the latest 50 TRC20 transfers."}
          </p>
        )}
        <p className="crypto-wallet-disclaimer">
          Only confirmed incoming transfers of the official TRON USDT contract are shown. This history is read-only and does not establish address ownership or provide withdrawal support.
        </p>
      </section>
      <div
        className="crypto-wallet-actions"
        aria-label="Unavailable crypto operations"
      >
        {["Buy USDT", "Sell USDT", "Deposit", "Withdraw"].map((label) => (
          <Button key={label} variant="secondary" disabled>
            {label}
          </Button>
        ))}
      </div>
      <p className="crypto-wallet-disclaimer">
        {wallet?.network === "TRON_SHASTA"
          ? "This address is marked as Shasta testnet and is not queried on mainnet. It must be deliberately reassigned after confirming the production address."
          : "Read-only real USDT balance from TRON mainnet via Tatum RPC. Verify the address and network before sending; transactions may be irreversible. Buy/sell, deposit monitoring, and withdrawals are not connected."}
      </p>
      {loading && (
        <p className="crypto-wallet-feedback" role="status">
          Loading assigned wallet and mainnet balance…
        </p>
      )}
      {!loading && wallet?.message && (
        <p className="crypto-wallet-feedback" role="status">
          {wallet.message}
        </p>
      )}
      {copyMessage && (
        <p className="crypto-wallet-feedback" role="status">
          {copyMessage}
        </p>
      )}
      {error && (
        <p className="crypto-wallet-feedback crypto-wallet-error" role="alert">
          {error}
        </p>
      )}
      <Button
        variant="quiet"
        className="crypto-wallet-refresh"
        disabled={loading || refreshing || depositLoading || depositRefreshing}
        onClick={() => {
          void loadWallet(true)
          void loadDeposits(true)
        }}
      >
        {refreshing ? "Refreshing…" : "Refresh mainnet balance"}
      </Button>
    </section>
  )
}

function WalletView({
  data,
  onTransaction,
  onExportActivity,
  showUnsettledFunds,
  onOpenUnsettledFunds,
  onCloseUnsettledFunds,
}: {
  data: DashboardData
  onTransaction: (transaction: Transaction) => void
  onExportActivity: (fromDate: string, toDate: string) => void
  showUnsettledFunds: boolean
  onOpenUnsettledFunds: () => void
  onCloseUnsettledFunds: () => void
}) {
  const [filter, setFilter] = useState("All activity")
  const [query, setQuery] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [activity, setActivity] = useState(data.transactions)
  const [activityHasMore, setActivityHasMore] = useState(
    data.transactions.length === 50,
  )
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState("")
  const { balanceVisible, toggleBalanceVisibility } = useBalanceVisibility()
  useEffect(() => {
    if (!fromDate && !toDate) {
      setActivity(data.transactions)
      setActivityHasMore(data.transactions.length === 50)
      setActivityError("")
      setActivityLoading(false)
      return
    }
    let active = true
    setActivityLoading(true)
    setActivityError("")
    getMerchantActivityPage({ limit: 50, offset: 0, from: fromDate, to: toDate })
      .then((page) => {
        if (!active) return
        setActivity(page)
        setActivityHasMore(page.length === 50)
      })
      .catch((loadError) => {
        if (active)
          setActivityError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load wallet activity.",
          )
      })
      .finally(() => {
        if (active) setActivityLoading(false)
      })
    return () => {
      active = false
    }
  }, [fromDate, toDate, data.transactions])

  async function loadMoreActivity() {
    setActivityLoading(true)
    setActivityError("")
    try {
      const page = await getMerchantActivityPage({
        limit: 50,
        offset: activity.length,
        from: fromDate,
        to: toDate,
      })
      setActivity((current) => [...current, ...page])
      setActivityHasMore(page.length === 50)
    } catch (loadError) {
      setActivityError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load more wallet activity.",
      )
    } finally {
      setActivityLoading(false)
    }
  }

  const transactions = useMemo(
    () =>
      activity.filter((item) => {
        const matchesFilter =
          filter === "All activity" ||
          (filter === "Money in" &&
            (item.walletAmount ?? item.numericAmount) > 0) ||
          (filter === "Money out" &&
            (item.walletAmount ?? item.numericAmount) < 0) ||
          item.status === filter
        const matchesQuery =
          `${item.reference} ${item.customer} ${item.description}`
            .toLowerCase()
            .includes(query.toLowerCase())
        return matchesFilter && matchesQuery
      }),
    [activity, filter, query],
  )

  if (showUnsettledFunds) {
    return (
      <section className="wallet-page wallet-unsettled-page">
        <Button
          variant="quiet"
          icon={<ChevronLeft size={17} />}
          onClick={onCloseUnsettledFunds}
        >
          Back to Wallet
        </Button>
        <div className="wallet-subpage-heading">
          <span className="eyebrow">WALLET</span>
          <h2>Unsettled Funds</h2>
          <p>
            Track your Alipay+ collection threshold for transferring unsettled
            funds to your live SwiftPay PHP wallet.
          </p>
        </div>
        <WalletFloatingBalanceCard
          data={data}
          balanceVisible={balanceVisible}
        />
      </section>
    )
  }

  return (
    <section className="wallet-page">
      <WalletBalancePanel
        data={data}
        balanceVisible={balanceVisible}
        onToggleBalanceVisibility={toggleBalanceVisibility}
      />
      <MainnetUsdtWallet />
      <button
        type="button"
        className="wallet-unsettled-entry"
        onClick={onOpenUnsettledFunds}
      >
        <span className="wallet-ledger-icon">
          <WalletCards size={18} aria-hidden="true" />
        </span>
        <span className="wallet-unsettled-entry-copy">
          <strong>Unsettled Funds</strong>
          <small>Track your live-wallet threshold and fund release</small>
        </span>
        <ChevronRight size={18} />
      </button>
      <WalletActivitySection
        transactions={transactions}
        totalTransactions={activity.length}
        filter={filter}
        query={query}
        fromDate={fromDate}
        toDate={toDate}
        hasMore={activityHasMore}
        loadingMore={activityLoading}
        activityError={activityError}
        onExport={onExportActivity}
        onFilterChange={setFilter}
        onQueryChange={setQuery}
        onDateChange={(key, value) => {
          if (key === "from") setFromDate(value)
          else setToDate(value)
        }}
        onLoadMore={() => void loadMoreActivity()}
        onTransaction={onTransaction}
      />
    </section>
  )
}

function TransfersView({
  data,
  onTransfer,
  onTransaction,
}: {
  data: DashboardData
  onTransfer: () => void
  onTransaction: (transaction: Transaction) => void
}) {
  const { balanceVisible } = useBalanceVisibility()
  const recentTransfers = data.transactions
    .filter((transaction) => transaction.numericAmount < 0)
    .slice(0, 4)

  return (
    <section className="transfers-page">
      <section className="transfer-balance-panel">
        <div>
          <span>Available balance</span>
          <strong>{balanceVisible ? data.availableBalance : "₱ ••••••"}</strong>
          <small>Available in your merchant ledger</small>
        </div>
        <Button icon={<Send size={17} />} onClick={onTransfer}>
          New transfer
        </Button>
      </section>
      <section className="transfer-methods-card">
        <h2>Choose a transfer network</h2>
        <div className="transfer-method-row">
          <img
            className="transfer-method-logo"
            src="/bank-logos/instapay.png"
            alt="InstaPay logo"
          />
          <div>
            <strong>InstaPay</strong>
            <p>Real-time network for eligible banks and wallets.</p>
          </div>
        </div>
        {!Capacitor.isNativePlatform() && (
          <div className="transfer-method-row">
            <img
              className="transfer-method-logo"
              src="/bank-logos/pesonet.png"
              alt="PESONet logo"
            />
            <div>
              <strong>PESONet</strong>
              <p>Batch network for eligible bank transfers.</p>
            </div>
          </div>
        )}
      </section>
      <aside className="transfer-security-note">
        <ShieldCheck size={17} />
        <p>
          <strong>Review before sending</strong> Check the recipient and account
          details carefully. Approve every transfer with your MPIN, then track
          its provider-confirmed status in Wallet.
        </p>
      </aside>
      <section className="transfer-activity-section">
        <header className="wallet-activity-heading">
          <div>
            <span className="eyebrow">MONEY OUT</span>
            <h2>Recent transfers</h2>
          </div>
          <span>{recentTransfers.length} shown</span>
        </header>
        {recentTransfers.length ? (
          <div className="transaction-list full-list">
            {recentTransfers.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onClick={() => onTransaction(transaction)}
              />
            ))}
          </div>
        ) : (
          <div className="wallet-empty-state transfer-empty-state">
            <Send size={22} />
            <strong>No transfers yet</strong>
            <p>
              Your outgoing transfers will appear here after you submit one.
            </p>
            <Button variant="secondary" onClick={onTransfer}>
              Start a transfer
            </Button>
          </div>
        )}
      </section>
    </section>
  )
}

function MoreView({
  session,
  data,
  onPaymentLink,
  onInfo,
  onSignOut,
}: {
  session: Session
  data: DashboardData
  onPaymentLink: () => void
  onInfo: (title: string) => void
  onSignOut: () => void
}) {
  const items = [
    {
      label: "Merchant profile",
      description: "Business and account details",
      icon: Store,
      action: () => onInfo("Merchant profile"),
    },
    ...(data.walletMode === "pooled"
      ? [
          {
            label: "Payment link",
            description: "Create and share your branded hosted checkout",
            icon: Link2,
            action: onPaymentLink,
          },
        ]
      : []),
    {
      label: "Transfer banks",
      description: Capacitor.isNativePlatform()
        ? "InstaPay"
        : "InstaPay and PESONet",
      icon: CreditCard,
      action: () => onInfo("Transfer banks"),
    },
    {
      label: "Statements",
      description: "View and download wallet activity",
      icon: ReceiptText,
      action: () => onInfo("Statements"),
    },
    {
      label: "Notifications",
      description: "Email and push alerts",
      icon: Bell,
      action: () => onInfo("Notifications"),
    },
    {
      label: "Security",
      description: "Session and device protection",
      icon: ShieldCheck,
      action: () => onInfo("Security"),
    },
    {
      label: "KYB verification",
      description: "Business and owner verification",
      icon: ShieldCheck,
      action: () => onInfo("KYB verification"),
    },
    {
      label: "Developer settings",
      description: "API keys, webhooks, and callbacks",
      icon: KeyRound,
      action: () => onInfo("Developer settings"),
    },
    {
      label: "API documentation",
      description: "Merchant integration guide",
      icon: Settings,
      action: () => onInfo("API documentation"),
    },
    {
      label: "Help center",
      description: "DRPAY merchant support",
      icon: CircleHelp,
      action: () => onInfo("Help center"),
    },
  ]

  return (
    <section className="more-page">
      <div className="profile-card">
        <span className="profile-avatar">DV</span>
        <div>
          <strong>{session.email}</strong>
          <span>{session.role.replace("_", " ")} · Merchant ledger</span>
          <span className="merchant-verified-badge">
            <ShieldCheck size={12} aria-hidden="true" /> Verified
          </span>
        </div>
        <ShieldCheck size={20} />
      </div>
      <div className="settings-list">
        {items.map(({ label, description, icon: Icon, action }) => (
          <button key={label} onClick={action}>
            <span className="setting-icon">
              <Icon size={19} />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <Button
        variant="secondary"
        className="sign-out-button"
        icon={<LogOut size={17} />}
        onClick={onSignOut}
      >
        Sign out
      </Button>
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
  )
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
  title: string
  session: Session
  data: DashboardData
  securityStatus: MerchantSecurityStatus | null
  notificationPermission: string
  pushRegistrationState: "idle" | "registering" | "registered" | "error"
  pushError: string
  biometricAvailable: boolean
  biometricEnabled: boolean
  biometricBusy: boolean
  biometricError: string
  onClose: () => void
  onExport: () => void
  onEnablePush: () => void
  onEnableBiometric: () => void
  onDisableBiometric: () => void
}) {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [institutionsLoading, setInstitutionsLoading] = useState(false)
  const [institutionsError, setInstitutionsError] = useState("")
  const [retryInstitutions, setRetryInstitutions] = useState(0)
  const [notificationPreferences, setNotificationPreferences] =
    useState<MerchantNotificationPreferences | null>(null)
  const [notificationPreferencesError, setNotificationPreferencesError] =
    useState("")
  const [savingNotificationPreference, setSavingNotificationPreference] =
    useState(false)
  const { balanceVisible } = useBalanceVisibility()

  useEffect(() => {
    if (title !== "Notifications") return
    let active = true
    getMerchantNotificationPreferences()
      .then((preferences) => {
        if (active) setNotificationPreferences(preferences)
      })
      .catch((requestError) => {
        if (active)
          setNotificationPreferencesError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load notification preferences.",
          )
      })
    return () => {
      active = false
    }
  }, [title])

  async function toggleNotificationPreference(
    key: keyof MerchantNotificationPreferences,
  ) {
    if (!notificationPreferences || savingNotificationPreference) return
    setSavingNotificationPreference(true)
    setNotificationPreferencesError("")
    try {
      const updated = await saveMerchantNotificationPreferences({
        ...notificationPreferences,
        [key]: !notificationPreferences[key],
      })
      setNotificationPreferences(updated)
    } catch (requestError) {
      setNotificationPreferencesError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update notification preferences.",
      )
    } finally {
      setSavingNotificationPreference(false)
    }
  }

  useEffect(() => {
    if (title !== "Transfer banks") return
    let active = true
    setInstitutionsLoading(true)
    setInstitutionsError("")
    getInstitutions()
      .then((result) => {
        if (active) setInstitutions(result)
      })
      .catch((requestError) => {
        if (active)
          setInstitutionsError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load transfer banks.",
          )
      })
      .finally(() => {
        if (active) setInstitutionsLoading(false)
      })
    return () => {
      active = false
    }
  }, [title, retryInstitutions])

  const successfulTransactions = data.transactions.filter(
    (transaction) => transaction.status === "Completed",
  )
  const pendingTransactions = data.transactions.filter(
    (transaction) => transaction.status === "Pending",
  )
  const failedTransactions = data.transactions.filter(
    (transaction) => transaction.status === "Failed",
  )

  return (
    <section className="profile-info-page" aria-label={title}>
      <header className="profile-info-page-header">
        <button className="profile-back-button" onClick={onClose}>
          <ChevronLeft size={16} /> Profile
        </button>
      </header>

      {title === "Merchant profile" && (
        <>
          <div className="profile-detail-hero">
            <span className="profile-avatar">
              <Store size={20} />
            </span>
            <div>
              <strong>{session.email}</strong>
              <span className="merchant-verified-badge">
                <ShieldCheck size={12} aria-hidden="true" /> Verified merchant
              </span>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Account role</dt>
              <dd>{session.role.replace("_", " ")}</dd>
            </div>
            <div>
              <dt>Wallet type</dt>
              <dd>Merchant operational ledger</dd>
            </div>
            <div>
              <dt>Available balance</dt>
              <dd>{balanceVisible ? data.availableBalance : "₱ ••••••"}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>
                {data.paymentEnvironment === "production" ? "Live" : "Sandbox"}
              </dd>
            </div>
          </dl>
          <div className="profile-info-intro">
            <strong>Your merchant ledger</strong>
            <p>
              Collections, transfers, pending reservations, and activity are
              tracked separately for this merchant. The DRPAY-funded floating
              balance remains a separate wallet.
            </p>
          </div>
          <div className="profile-info-intro">
            <strong>Unsettled funds release</strong>
            <p>
              Your collection progress is based on this merchant’s activity. The
              DRPAY team separately transfers unlocked unsettled funds; that
              pooled settlement account is not your merchant ledger balance.
            </p>
          </div>
        </>
      )}

      {title === "Transfer banks" && (
        <>
          <div className="profile-info-intro">
            <strong>Supported transfer destinations</strong>
            <p>
              Availability is provided by SwiftPay. Each bank may support
              {Capacitor.isNativePlatform()
                ? " InstaPay. PESONet transfers are available only when signed in through a web browser."
                : " InstaPay, PESONet, or both."}
            </p>
          </div>
          {institutionsLoading ? (
            <div className="profile-sheet-state" role="status">
              <LoaderCircle className="spin" size={17} />
              Loading supported banks…
            </div>
          ) : institutionsError ? (
            <div className="inline-error" role="alert">
              <AlertCircle size={15} />
              {institutionsError}
              <button
                className="profile-inline-action"
                onClick={() => setRetryInstitutions((attempt) => attempt + 1)}
              >
                Retry
              </button>
            </div>
          ) : institutions.length === 0 ? (
            <p className="profile-sheet-state">
              No transfer banks are currently available.
            </p>
          ) : (
            <div className="profile-bank-list">
              {institutions.map((institution) => (
                <div className="profile-bank-row" key={institution.code}>
                  <InstitutionLogo
                    institution={institution}
                    className="profile-bank-logo"
                  />
                  <strong>{institution.name}</strong>
                  <span className="profile-rails">
                    {institution.instapayEnabled && <small>InstaPay</small>}
                    {!Capacitor.isNativePlatform() &&
                      institution.pesonetEnabled && <small>PESONet</small>}
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
            <div>
              <strong>{data.transactions.length}</strong>
              <span>Transactions</span>
            </div>
            <div>
              <strong>{successfulTransactions.length}</strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>{pendingTransactions.length}</strong>
              <span>Pending</span>
            </div>
            <div>
              <strong>{failedTransactions.length}</strong>
              <span>Failed</span>
            </div>
          </div>
          <div className="profile-info-intro">
            <strong>Recent wallet activity</strong>
            <p>
              Download the available activity as a CSV statement for your
              records.
            </p>
          </div>
          {data.transactions.length > 0 ? (
            <div className="profile-recent-list">
              {data.transactions.slice(0, 5).map((transaction) => (
                <div key={transaction.id}>
                  <span>
                    <strong>{transaction.description}</strong>
                    <small>
                      {transaction.date} · {transaction.status}
                    </small>
                  </span>
                  <strong>{transaction.amount}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-sheet-state">
              No wallet activity is available yet.
            </p>
          )}
          <Button icon={<Download size={16} />} onClick={onExport}>
            Download CSV statement
          </Button>
        </>
      )}

      {title === "Security" && (
        <>
          <div className="profile-security-status">
            <span>
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>Account protection</strong>
              <small>Security controls for this merchant session</small>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Device verification</dt>
              <dd>Email code required</dd>
            </div>
            <div>
              <dt>Transfer approval</dt>
              <dd>
                {securityStatus?.pinConfigured
                  ? "MPIN enabled"
                  : "MPIN setup required"}
              </dd>
            </div>
            <div>
              <dt>Biometric sign-in</dt>
              <dd>
                {biometricEnabled
                  ? "Enabled on this device"
                  : biometricAvailable
                    ? "Available on this device"
                    : "Not available on this device"}
              </dd>
            </div>
            <div>
              <dt>Session expires</dt>
              <dd>{new Date(session.expiresAt).toLocaleString()}</dd>
            </div>
          </dl>
          {biometricError && (
            <div className="inline-error" role="alert">
              <AlertCircle size={15} />
              {biometricError}
            </div>
          )}
          {(biometricAvailable || biometricEnabled) && (
            <>
              <Button
                disabled={biometricBusy}
                variant={biometricEnabled ? "secondary" : "primary"}
                onClick={
                  biometricEnabled ? onDisableBiometric : onEnableBiometric
                }
                icon={
                  biometricBusy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Fingerprint size={16} />
                  )
                }
              >
                {biometricBusy
                  ? "Updating…"
                  : biometricEnabled
                    ? "Disable biometric sign-in"
                    : "Enable biometric sign-in"}
              </Button>
            </>
          )}
          {!biometricAvailable && supportsBiometricLogin() && (
            <p className="profile-info-note">
              Enroll a strong biometric in Android settings to use biometric
              sign-in. Your MPIN and email verification remain available.
            </p>
          )}
          <p className="profile-info-note">
            Never share your one-time code or MPIN. Every outgoing transfer
            requires MPIN approval.
          </p>
        </>
      )}

      {title === "Notifications" && (
        <>
          {notificationPreferencesError && (
            <div className="inline-error" role="alert">
              <AlertCircle size={15} />
              {notificationPreferencesError}
            </div>
          )}
          <div className="profile-info-intro">
            <strong>Transaction events</strong>
            <p>Choose which successful transaction types can send alerts.</p>
          </div>
          {(
            [
              ["paymentsEnabled", "Successful incoming payments", "Confirmed collections"],
              ["transfersEnabled", "Successful outgoing transfers", "Provider-confirmed transfers"],
            ] as const
          ).map(([key, label, description]) => (
            <div className="profile-notification-option" key={key}>
              <span className="profile-notification-icon">
                {key === "paymentsEnabled" ? (
                  <ArrowDownLeft size={18} />
                ) : (
                  <Send size={18} />
                )}
              </span>
              <div>
                <strong>{label}</strong>
                <small>{description}</small>
              </div>
              <button
                type="button"
                className={`profile-notification-state ${
                  notificationPreferences?.[key] ? "enabled" : ""
                }`}
                disabled={
                  savingNotificationPreference || !notificationPreferences
                }
                aria-pressed={notificationPreferences?.[key] || false}
                onClick={() => void toggleNotificationPreference(key)}
              >
                {notificationPreferences?.[key] ? "ON" : "OFF"}
              </button>
            </div>
          ))}
          <div className="profile-notification-option">
            <span className="profile-notification-icon">
              <ReceiptText size={18} />
            </span>
            <div>
              <strong>Email notifications</strong>
              <small>Successful incoming payments and outgoing transfers</small>
              <small>{session.email}</small>
            </div>
            <button
              type="button"
              className={`profile-notification-state ${
                notificationPreferences?.emailEnabled ? "enabled" : ""
              }`}
              disabled={
                savingNotificationPreference || !notificationPreferences
              }
              aria-pressed={notificationPreferences?.emailEnabled || false}
              onClick={() => void toggleNotificationPreference("emailEnabled")}
            >
              {notificationPreferences?.emailEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className="profile-notification-option">
            <span className="profile-notification-icon">
              <Bell size={18} />
            </span>
            <div>
              <strong>Push notifications</strong>
              <small>
                {notificationPermission === "unavailable"
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
                            : "Enable alerts on this device for successful transactions"}
              </small>
            </div>
            <button
              type="button"
              className={`profile-notification-state ${
                notificationPreferences?.pushEnabled &&
                pushRegistrationState === "registered"
                  ? "enabled"
                  : ""
              }`}
              disabled={
                savingNotificationPreference || !notificationPreferences
              }
              aria-pressed={notificationPreferences?.pushEnabled || false}
              onClick={() => void toggleNotificationPreference("pushEnabled")}
            >
              {!notificationPreferences?.pushEnabled
                ? "OFF"
                : notificationPermission === "unavailable"
                ? "APP ONLY"
                : notificationPermission === "denied"
                  ? "BLOCKED"
                  : pushRegistrationState === "registered"
                    ? "ON"
                    : pushRegistrationState === "registering"
                      ? "SETUP"
                      : notificationPermission === "granted"
                        ? "RETRY"
                        : "OFF"}
            </button>
          </div>
          {pushError && (
            <div className="inline-error" role="alert">
              <AlertCircle size={15} />
              {pushError}
            </div>
          )}
          {notificationPermission !== "unavailable" && (
            <Button
              onClick={onEnablePush}
              disabled={pushRegistrationState === "registering"}
              icon={<Bell size={16} />}
            >
              {notificationPermission === "granted"
                ? "Retry push setup"
                : notificationPermission === "denied"
                  ? "Check notification permission"
                  : "Enable push notifications"}
            </Button>
          )}
          {notificationPermission === "denied" && (
            <p className="profile-info-note">
              If access is still blocked, enable notifications in Android
              Settings → Apps → DRPAY → Notifications.
            </p>
          )}
          <p className="profile-info-note">
            Email alerts are sent after the payment provider confirms the
            transaction. Push alerts require notification permission and
            Firebase setup on this device and server.
          </p>
        </>
      )}

      {title === "KYB verification" && <KybSetupPanel />}

      {title === "Developer settings" && <DeveloperSetupPanel />}

      {title === "API documentation" && (
        <div className="api-docs">
          <div className="profile-info-intro">
            <strong>Integrate your DRPAY wallet and collections</strong>
            <p>
              Read your merchant-specific PHP wallet, create a QR-backed hosted
              payment link from your platform, and confirm payment status. Your
              customer pays on a DRPAY-hosted checkout page; your server
              receives the link and returns it to your customer.
            </p>
          </div>

          <section className="api-docs-section">
            <h3>1. Set up API access</h3>
            <p>
              Create a key in <strong>Profile → Developer settings</strong>. Use{" "}
              <code>read</code> to retrieve your wallet and activity. Use{" "}
              <code>payments:write</code> to create collections; choose both
              scopes to use the complete integration. Keys are
              environment-specific.
            </p>
            <div className="api-docs-base">
              <span>API base URL for this session</span>
              <code>{getApiBaseUrl()}</code>
              <small>
                Environment:{" "}
                {data.paymentEnvironment === "production"
                  ? "Production / live money"
                  : "Sandbox / test money"}
              </small>
            </div>
            <p>
              Use the base URL shown above for this environment. Store the key
              in your server's secret manager and send it as a Bearer token over
              HTTPS. Never put the key or SwiftPay credentials in browser code,
              a mobile app, source control, or client-side environment
              variables.
            </p>
            <ApiCodeBlock
              title="Server environment variables"
              code={`DRPAY_API_BASE_URL=${getApiBaseUrl()}
DRPAY_API_KEY=your_environment_specific_key`}
            />
          </section>

          <section className="api-docs-section">
            <h3>2. Read wallet balance</h3>
            <p>
              <code>GET /v1/wallet/balance</code> returns this merchant's
              operational ledger only. <code>balance</code> is the posted ledger
              amount; <code>availableBalance</code> subtracts reservations for
              transfers still in progress. The DRPAY-funded floating balance is
              a separate wallet.
            </p>
            <ApiCodeBlock
              title="Request"
              code={`curl "$DRPAY_API_BASE_URL/v1/wallet/balance" \\
  -H "Authorization: Bearer $DRPAY_API_KEY" \\
  -H "Accept: application/json"`}
            />
            <ApiCodeBlock
              title="200 response"
              code={`{
  "balance": 1250.50,
  "availableBalance": 1000.50,
  "reservedBalance": 250.00,
  "walletMode": "pooled",
  "paymentEnvironment": "production",
  "cumulativeKrwCollections": 420000
}`}
            />
            <p>
              Collection credits are posted net of platform fees. Successful
              transfers debit the ledger. Pending or unknown-outcome transfers
              reduce available balance until resolved. Do not treat the shared
              provider account as your merchant balance.
            </p>
          </section>

          <section className="api-docs-section">
            <h3>3. Create a collection on your platform</h3>
            <p>
              <code>POST /v1/payment-links</code> creates a fixed PHP QR Ph
              payment and a self-hosted DRPAY checkout page. The response
              includes <code>paymentUrl</code> to redirect your customer to,{" "}
              <code>qrCode</code> for rendering a QR in your own experience, and{" "}
              <code>qrImageUrl</code> for the QR image. Optionally include{" "}
              <code>customerEmail</code> to email the customer the checkout link
              and a separate payment-confirmed notice after SwiftPay reports{" "}
              <code>EXECUTED</code> or the DRPAY team independently verifies the
              payment. Checkout links use your environment’s branded host:{" "}
              <code>
                {data.paymentEnvironment === "production"
                  ? "pay.live.denpay.cc"
                  : "pay.sandbox.denpay.cc"}
              </code>
              .
            </p>
            <p>
              Generate a new, unique idempotency key for each intended payment
              (at least 16 characters). If the request times out, retry the same
              payment with the same key; do not create another payment with a
              new key until you have checked its outcome.
            </p>
            <ApiCodeBlock
              title="Request"
              code={`curl -X POST "$DRPAY_API_BASE_URL/v1/payment-links" \\
  -H "Authorization: Bearer $DRPAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: invoice-1048-attempt-1" \\
  -d '{
    "amount": 125.50,
    "currency": "PHP",
    "description": "Invoice 1048",
    "customerEmail": "customer@example.com"
  }'`}
            />
            <ApiCodeBlock
              title="201 response"
              code={`{
  "id": "payment-record-uuid",
  "code": "opaque_checkout_code",
  "paymentUrl": "https://pay.live.denpay.cc/?checkout=opaque_checkout_code",
  "qrCode": "qrph://...",
  "qrImageUrl": "https://denpay.cc/v1/public/checkout/opaque_checkout_code/qr.png",
  "status": "PENDING",
  "amount": 125.50,
  "currency": "PHP"
}`}
            />
            <p>
              The API creates the QR payment, so no SwiftPay credentials or
              payment data need to touch your frontend. The hosted page displays
              your payment request, QR, secure checkout branding, reference, and
              payment status. In production mode, payment collection moves real
              money.
            </p>
          </section>

          <section className="api-docs-section">
            <h3>4. Example: create the link from your server</h3>
            <p>
              Call DRPAY from a trusted backend route, then return only the safe
              payment URL and reference to your browser or app. This example
              uses Node.js 18+:
            </p>
            <ApiCodeBlock
              title="Node.js server example"
              code={`import { createHash } from "node:crypto";

export async function createInvoiceCheckout({ amount, invoiceId, customerEmail }) {
  const idempotencyKey = createHash("sha256")
    .update("invoice:" + invoiceId + ":collection")
    .digest("hex");
  const response = await fetch(
    process.env.DRPAY_API_BASE_URL + "/v1/payment-links",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.DRPAY_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({
        amount,
        currency: "PHP",
        description: "Invoice " + invoiceId,
        customerEmail
      })
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Could not create payment link");
  }
  return {
    paymentUrl: result.paymentUrl,
    reference: result.code,
    status: result.status
  };
}`}
            />
            <p>
              On your own frontend, redirect the customer to the returned{" "}
              <code>paymentUrl</code> or show it as a payment button/link. Keep
              the idempotency key associated with your invoice so retries reuse
              it.
            </p>
          </section>

          <section className="api-docs-section">
            <h3>5. Check payment status</h3>
            <p>
              Use <code>GET /v1/payment-links/:code</code> from your server to
              refresh the status of a link owned by your merchant account. Poll
              at a reasonable interval, or configure a webhook for
              server-to-server updates. Treat only <code>EXECUTED</code> as
              paid.
            </p>
            <ApiCodeBlock
              title="Request"
              code={`curl "$DRPAY_API_BASE_URL/v1/payment-links/CHECKOUT_CODE" \\
  -H "Authorization: Bearer $DRPAY_API_KEY" \\
  -H "Accept: application/json"`}
            />
            <ApiCodeBlock
              title="Response"
              code={`{
  "code": "opaque_checkout_code",
  "paymentUrl": "https://pay.live.denpay.cc/?checkout=opaque_checkout_code",
  "status": "EXECUTED",
  "amount": 125.50,
  "currency": "PHP",
  "referenceNo": "DRP-..."
}`}
            />
            <p>
              Status values include <code>PENDING</code>, <code>EXECUTED</code>,{" "}
              <code>CANCELED</code>, <code>REJECTED</code>, and{" "}
              <code>EXPIRED</code>. A successful response to link creation means
              the checkout was created, not that the customer has paid.
            </p>
          </section>

          <section className="api-docs-section">
            <h3>6. Wallet activity</h3>
            <p>
              <code>GET /v1/wallet/activity?limit=50&amp;offset=0</code> returns
              this merchant's latest transactions. <code>limit</code> is 1–100.
              Use offset pagination. The transaction <code>amount</code> is the
              gross payment or transfer amount; <code>walletAmount</code> is the
              signed posted ledger impact after fees/refund accounting, and is
              null until posted.
            </p>
            <ApiCodeBlock
              title="Request"
              code={`curl "$DRPAY_API_BASE_URL/v1/wallet/activity?limit=50&offset=0" \\
  -H "Authorization: Bearer $DRPAY_API_KEY"`}
            />
            <p>
              Each returned item includes <code>id</code>,{" "}
              <code>referenceNo</code>, <code>amount</code>,{" "}
              <code>walletAmount</code>, <code>status</code>,{" "}
              <code>channel</code>, <code>transactionType</code>,{" "}
              <code>description</code>, and <code>createdAt</code>. Additional
              transfer details may include recipient and institution fields.
            </p>
          </section>

          <section className="api-docs-section">
            <h3>Endpoints and permissions</h3>
            <div className="api-docs-endpoints">
              <div>
                <b>GET</b>
                <code>/v1/wallet/balance</code>
                <span>read · merchant wallet balance</span>
              </div>
              <div>
                <b>GET</b>
                <code>/v1/wallet/activity</code>
                <span>read · merchant transactions</span>
              </div>
              <div>
                <b>POST</b>
                <code>/v1/payment-links</code>
                <span>payments:write · create QR checkout and link</span>
              </div>
              <div>
                <b>GET</b>
                <code>/v1/payment-links/:code</code>
                <span>read · refresh owned payment status</span>
              </div>
              <div>
                <b>GET</b>
                <code>/v1/payment-institutions</code>
                <span>read · collection institution list</span>
              </div>
              <div>
                <b>GET</b>
                <code>/v1/disbursement-institutions</code>
                <span>read · transfer institution list</span>
              </div>
              <div>
                <b>GET</b>
                <code>/v1/internal-wallet</code>
                <span>read · separate DRPAY-funded floating wallet</span>
              </div>
            </div>
            <p>
              API keys are limited to 120 requests per minute. API keys cannot
              initiate disbursements or access other merchants' records.
            </p>
          </section>

          <section className="api-docs-section">
            <h3>Payment webhooks</h3>
            <p>
              Configure a public HTTPS webhook in{" "}
              <strong>Profile → Developer settings</strong> to receive{" "}
              <code>payment.succeeded</code> and <code>payment.failed</code>{" "}
              events. Verify <code>DRPAY-Signature</code> using HMAC-SHA256 over
              the exact raw request body and your webhook signing secret.
              Deduplicate by event <code>id</code>; return a 2xx response after
              safely recording the event. Failed deliveries retry with
              exponential backoff, up to eight attempts.
            </p>
          </section>

          <section className="api-docs-section">
            <h3>Errors and safe retries</h3>
            <p>
              Errors use <code>{'{ "error": "..." }'}</code>. Common HTTP
              statuses: <code>400</code> invalid input, <code>401</code> invalid
              key, <code>403</code> missing scope, <code>404</code>{" "}
              unknown/foreign payment link, <code>409</code> idempotency or
              wallet conflict, <code>429</code> rate limit, <code>503</code>{" "}
              temporary service or ambiguous provider outcome.
            </p>
            <p>
              For an ambiguous create result or timeout, keep the original
              idempotency key and reconcile through wallet activity or payment
              status before attempting another collection. Do not mark an
              invoice paid based only on the customer's return to your
              site—verify the status via authenticated API or a verified
              webhook.
            </p>
          </section>

          <p className="profile-info-note">
            Import the{" "}
            <a
              href="/postman/DRPAY-Merchant-API.postman_collection.json"
              download
            >
              Postman collection
            </a>{" "}
            for ready-to-run requests. Configure its base URL for the chosen API
            environment and use a matching merchant API key.
          </p>
        </div>
      )}

      {title === "Help center" && (
        <>
          <div className="profile-info-intro">
            <strong>How can we help?</strong>
            <p>
              Use these steps to resolve common account and payment questions.
            </p>
          </div>
          <div className="profile-guide-list">
            <div>
              <span>
                <CircleHelp size={16} />
              </span>
              <p>
                <strong>Payment or transfer issue</strong>Keep the transaction
                reference and current status available when requesting help.
              </p>
            </div>
            <div>
              <span>
                <WalletCards size={16} />
              </span>
              <p>
                <strong>Balance question</strong>Refresh the dashboard and
                compare the wallet activity with your statement.
              </p>
            </div>
            <div>
              <span>
                <ShieldCheck size={16} />
              </span>
              <p>
                <strong>Sign-in or security</strong>Verify your device using the
                email code. Never share your MPIN or one-time code.
              </p>
            </div>
          </div>
          <p className="profile-info-note">
            Contact DRPAY support at{" "}
            <a href="mailto:support@denpay.cc">support@denpay.cc</a>. Include
            the transaction reference and status, but never send your MPIN or
            one-time verification code.
          </p>
        </>
      )}

      <Button variant="secondary" onClick={onClose}>
        Back to profile
      </Button>
    </section>
  )
}

const tabs = [
  { label: "Home", icon: Home },
  { label: "Wallet", icon: WalletCards },
  { label: "Collect", icon: Plus },
  { label: "Transfer", icon: Send },
  { label: "Profile", icon: Store },
]

function AuxitHomeScreen() {
  const stats = [
    { label: "Care score", value: "92%", tone: "bg-[#dfe9ff] text-[#1c4b9b]" },
    { label: "Needs", value: "3", tone: "bg-[#eef9ee] text-[#176d48]" },
    { label: "Visits", value: "5", tone: "bg-[#fef3d8] text-[#8a5d00]" },
  ]

  const dayPlan = [
    { time: "9:30 AM", label: "Morning check-in", detail: "Medication + hydration", accent: "bg-[#dfe9ff]" },
    { time: "12:15 PM", label: "Care circle update", detail: "Family summary sent", accent: "bg-[#dcf7e8]" },
    { time: "4:00 PM", label: "Recovery session", detail: "Mobility routine", accent: "bg-[#f9ead7]" },
  ]

  const support = [
    { title: "Nurse follow-up", note: "2 tasks remain", tag: "Today" },
    { title: "Home check", note: "Supply restock due", tag: "Tomorrow" },
  ]

  return (
    <div className="min-h-screen bg-[#edf3fb] p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-md overflow-hidden rounded-[32px] border border-slate-200 bg-[#f7f9fc] shadow-[0_30px_70px_rgba(15,23,42,0.12)]">
        <div className="bg-[radial-gradient(circle_at_top,_#f0f7ff_0%,_#e7edf9_32%,_#cfe4ff_100%)] px-5 pb-6 pt-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#0f172a] text-sm font-extrabold text-white">
                A
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Auxit
                </p>
                <h1 className="text-xl font-extrabold tracking-[-0.04em] text-slate-900">
                  Good morning
                </h1>
              </div>
            </div>
            <button type="button" aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ef4444] ring-2 ring-white" />
            </button>
          </div>

          <div className="rounded-[28px] bg-[#0f172a] p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.25)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
                  Care overview
                </p>
                <p className="mt-2 text-3xl font-black tracking-[-0.06em]">$1,280</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-2 text-xs font-bold text-emerald-300">
                +12.4%
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">
                  Recovery plan
                </p>
                <p className="mt-1 text-lg font-bold text-white">4 of 5 steps</p>
              </div>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-xl bg-[#cfe1ff] text-slate-900">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {stats.map((item) => (
              <div key={item.label} className={`rounded-2xl p-3 ${item.tone}`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-75">{item.label}</p>
                <p className="mt-2 text-xl font-extrabold tracking-[-0.04em]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5 px-5 pb-5 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Today
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.05em] text-slate-900">
                Your plan
              </h2>
            </div>
            <button type="button" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">
              View all
            </button>
          </div>

          <div className="space-y-3">
            {dayPlan.map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className={`grid h-11 w-11 place-items-center rounded-xl ${item.accent}`}>
                  <QrCode size={17} className="text-slate-800" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{item.label}</p>
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{item.time}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Priority
                </p>
                <h3 className="mt-1 text-lg font-extrabold tracking-[-0.05em] text-slate-900">
                  Support queue
                </h3>
              </div>
              <button type="button" className="rounded-full bg-[#e9f0ff] p-2 text-[#2456bf]">
                <ShieldCheck size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {support.map((item) => (
                <div key={item.title} className="flex items-center justify-between rounded-2xl bg-[#f3f7ff] p-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.note}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                    {item.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white/80 px-4 py-3 backdrop-blur">
          <div className="grid grid-cols-5 gap-2">
            {[
              { icon: Home, label: "Home", active: true },
              { icon: ReceiptText, label: "Records" },
              { icon: QrCode, label: "Scan" },
              { icon: Users, label: "Circle" },
              { icon: Settings, label: "Setup" },
            ].map(({ icon: Icon, label, active }) => (
              <button
                key={label}
                type="button"
                className={`rounded-2xl px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] ${active ? "bg-[#ecf4ff] text-[#1b4f9c]" : "text-slate-500"}`}
              >
                <span className="mb-1.5 grid place-items-center">
                  <Icon size={18} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const isAuxitRoute =
    window.location.pathname === "/auxit" ||
    window.location.pathname === "/" ||
    new URLSearchParams(window.location.search).get("app") === "auxit"

  if (isAuxitRoute) {
    return <AuxitHomeScreen />
  }

  const pathCheckoutCode =
    /^\/checkout\/([A-Za-z0-9_-]{40,50})\/?$/.exec(
      window.location.pathname,
    )?.[1] || ""
  const queryCheckoutCode =
    new URLSearchParams(window.location.search).get("checkout") || ""
  const checkoutCode =
    pathCheckoutCode ||
    (/^[A-Za-z0-9_-]{40,50}$/.test(queryCheckoutCode) ? queryCheckoutCode : "")
  const hostname = window.location.hostname.toLowerCase()
  const isMerchantHost =
    hostname === "merchant.denpay.cc" ||
    hostname === "live.merchant.swiftpay.site"
  const isAdminConsole =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/")
  const isDashboard =
    isMerchantHost ||
    Capacitor.isNativePlatform() ||
    window.location.pathname === "/app" ||
    window.location.pathname.startsWith("/app/")
  const [session, setSession] = useState<Session | null>(() =>
    isDashboard || isAdminConsole ? getSession() : null,
  )
  const [data, setData] = useState<DashboardData | null>(null)
  const [securityStatus, setSecurityStatus] =
    useState<MerchantSecurityStatus | null>(null)
  const [activeTab, setActiveTab] = useState("Home")
  const [walletSubscreen, setWalletSubscreen] =
    useState<"overview" | "unsettled-funds">("overview")
  const [profileSection, setProfileSection] = useState("")
  const [pushPermission, setPushPermission] = useState("prompt")
  const [pushRegistrationState, setPushRegistrationState] =
    useState<"idle" | "registering" | "registered" | "error">("idle")
  const [pushError, setPushError] = useState("")
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [biometricOfferEmail, setBiometricOfferEmail] = useState("")
  const [biometricBusy, setBiometricBusy] = useState(false)
  const [biometricError, setBiometricError] = useState("")
  const pushTokenRef = useRef("")
  const biometricOfferPendingRef = useRef(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [transferQrPrefill, setTransferQrPrefill] =
    useState<TransferQrDetails | undefined>()
  const [showPaymentLink, setShowPaymentLink] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState<{
    version: string
    downloadUrl: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const dismissedUpdateVersionRef = useRef("")

  useEffect(() => {
    if (session?.role !== "super_admin") return

    function expireAdminSession() {
      clearSession()
      setSession(null)
    }

    const remainingMs = session.expiresAt - Date.now()
    if (remainingMs <= 0) {
      expireAdminSession()
      return
    }
    const timeout = window.setTimeout(expireAdminSession, remainingMs)
    window.addEventListener(SESSION_EXPIRED_EVENT, expireAdminSession)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireAdminSession)
    }
  }, [session?.expiresAt, session?.role])

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return
    let active = true
    let lastCheckAt = 0
    let retryTimer = 0
    let requestController: AbortController | null = null

    async function checkForUpdate() {
      if (
        !active ||
        !navigator.onLine ||
        Date.now() - lastCheckAt < 5 * 60 * 1000
      )
        return
      lastCheckAt = Date.now()
      requestController = new AbortController()
      try {
        const [appInfo, response] = await Promise.all([
          CapacitorApp.getInfo(),
          fetch(
            "https://api.github.com/repos/blackhorsecn/drpay-merchant/releases/latest",
            {
              headers: { Accept: "application/vnd.github+json" },
              cache: "no-store",
              signal: requestController.signal,
            },
          ),
        ])
        if (!response.ok)
          throw new Error(`Release check failed (${response.status}).`)
        const release = (await response.json()) as {
          tag_name?: string
          draft?: boolean
          prerelease?: boolean
          assets?: { name?: string; browser_download_url?: string }[]
        }
        const versionMatch = /^android-v(\d+\.\d+\.\d+)$/.exec(
          release.tag_name || "",
        )
        const apk = release.assets?.find((asset) => asset.name === "drpay.apk")
        if (
          !active ||
          release.draft ||
          release.prerelease ||
          !versionMatch ||
          !apk?.browser_download_url
        )
          return
        const downloadUrl = new URL(apk.browser_download_url)
        if (
          downloadUrl.protocol !== "https:" ||
          downloadUrl.hostname !== "github.com"
        ) {
          throw new Error("The latest APK release has an invalid download URL.")
        }
        const latestVersion = versionMatch[1]
        if (
          compareAppVersions(latestVersion, appInfo.version) > 0 &&
          dismissedUpdateVersionRef.current !== latestVersion
        ) {
          setUpdateAvailable({
            version: latestVersion,
            downloadUrl: downloadUrl.toString(),
          })
        }
      } catch (checkError) {
        if (
          active &&
          !(
            checkError instanceof DOMException &&
            checkError.name === "AbortError"
          )
        ) {
          console.warn("Could not check for an Android app update", checkError)
        }
      }
    }

    const handleOnline = () => {
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => {
        lastCheckAt = 0
        void checkForUpdate()
      }, 500)
    }
    const handleOffline = () => requestController?.abort()

    void checkForUpdate()
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      active = false
      window.clearTimeout(retryTimer)
      requestController?.abort()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const enablePushNotifications = useCallback(async () => {
    if (Capacitor.getPlatform() !== "android") {
      setPushPermission("unavailable")
      return
    }
    setPushError("")
    setPushRegistrationState("registering")
    try {
      let permission = await PushNotifications.checkPermissions()
      if (permission.receive === "denied") {
        setPushPermission("denied")
        setPushRegistrationState("idle")
        setPushError(
          "Notifications are blocked for DRPAY. Enable them in Android Settings > Apps > DRPAY > Notifications.",
        )
        return
      }
      if (permission.receive !== "granted")
        permission = await PushNotifications.requestPermissions()
      setPushPermission(permission.receive)
      if (permission.receive !== "granted") {
        setPushRegistrationState("idle")
        setPushError(
          "Allow notifications to receive transaction alerts on this device.",
        )
        return
      }
      await PushNotifications.createChannel({
        id: "drpay-transactions",
        name: "Transaction alerts",
        description: "Successful incoming payments and outgoing transfers",
        importance: 4,
        visibility: 0,
        vibration: true,
      })
      await PushNotifications.register()
    } catch (requestError) {
      setPushRegistrationState("error")
      setPushError(
        requestError instanceof Error
          ? requestError.message
          : "Push notification setup failed.",
      )
    }
  }, [])

  function handleMerchantAuthenticated(nextSession: Session) {
    biometricOfferPendingRef.current = true
    setBiometricOfferEmail("")
    setBiometricError("")
    setSession(nextSession)
  }

  function dismissBiometricOffer() {
    if (biometricOfferEmail) markBiometricOfferDismissed(biometricOfferEmail)
    setBiometricOfferEmail("")
    setBiometricError("")
  }

  async function enableBiometricSignIn() {
    if (!session || session.role !== "merchant") return
    setBiometricBusy(true)
    setBiometricError("")
    const secret = createBiometricSecret()
    let localCredentialStored = false
    try {
      await storeBiometricSecret(session.email, secret)
      localCredentialStored = true
      await registerBiometricCredential(secret)
      markBiometricLoginEnabled(session.email)
      setBiometricEnabled(true)
      setBiometricOfferEmail("")
    } catch (requestError) {
      if (localCredentialStored) {
        try {
          await deleteBiometricSecret(session.email)
        } catch (cleanupError) {
          console.error(
            "Could not remove incomplete biometric credential",
            cleanupError,
          )
        }
      }
      setBiometricError(
        requestError instanceof Error
          ? requestError.message
          : "Could not enable biometric sign-in.",
      )
    } finally {
      setBiometricBusy(false)
    }
  }

  async function disableBiometricSignIn() {
    if (!session || session.role !== "merchant") return
    setBiometricBusy(true)
    setBiometricError("")
    try {
      await removeBiometricCredential()
      markBiometricLoginDisabled(session.email)
      setBiometricEnabled(false)
      try {
        await deleteBiometricSecret(session.email)
      } catch (cleanupError) {
        console.error(
          "Biometric credential was revoked, but local cleanup failed",
          cleanupError,
        )
        setBiometricError(
          "Biometric sign-in is disabled on the server, but this device could not remove its saved key.",
        )
      }
    } catch (requestError) {
      setBiometricError(
        requestError instanceof Error
          ? requestError.message
          : "Could not disable biometric sign-in.",
      )
    } finally {
      setBiometricBusy(false)
    }
  }

  useEffect(() => {
    if (
      !session ||
      session.role !== "merchant" ||
      !isDashboard ||
      !supportsBiometricLogin()
    ) {
      setBiometricAvailable(false)
      setBiometricEnabled(false)
      return
    }
    let active = true
    const enabled = hasBiometricLogin(session.email)
    setBiometricEnabled(enabled)
    void isBiometricLoginAvailable()
      .then((available) => {
        if (!active) return
        setBiometricAvailable(available)
        if (biometricOfferPendingRef.current) {
          biometricOfferPendingRef.current = false
          if (
            available &&
            !enabled &&
            !wasBiometricOfferDismissed(session.email)
          ) {
            setBiometricOfferEmail(session.email)
          }
        }
      })
      .catch((requestError: unknown) => {
        if (!active) return
        biometricOfferPendingRef.current = false
        setBiometricAvailable(false)
        setBiometricError(
          requestError instanceof Error
            ? requestError.message
            : "Could not check biometric availability on this device.",
        )
        console.error(
          "Could not check native biometric availability",
          requestError,
        )
      })
    return () => {
      active = false
    }
  }, [session?.email, session?.role, isDashboard])

  async function loadDashboard() {
    if (!session) return
    setLoading(true)
    setError("")
    const [dashboardResult, securityResult] = await Promise.allSettled([
      getMerchantDashboard(),
      getMerchantSecurityStatus(),
    ])

    if (securityResult.status === "fulfilled") {
      setSecurityStatus(securityResult.value)
    } else {
      setSecurityStatus(null)
      const securityError = securityResult.reason
      setError(
        securityError instanceof Error
          ? `Security settings could not be loaded: ${securityError.message}`
          : "Security settings could not be loaded.",
      )
      if (securityError instanceof ApiError && securityError.status === 401) {
        setSession(null)
      }
    }

    if (dashboardResult.status === "fulfilled") {
      setData(dashboardResult.value)
    } else {
      const dashboardError = dashboardResult.reason
      setError(
        dashboardError instanceof Error
          ? dashboardError.message
          : "Could not load your wallet",
      )
      if (dashboardError instanceof ApiError && dashboardError.status === 401) {
        setSession(null)
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!isDashboard || isAdminConsole) return
    void loadDashboard()
    // Session changes are the intended refresh boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isDashboard])

  useEffect(() => {
    if (!session || !isDashboard || Capacitor.getPlatform() !== "android") {
      if (Capacitor.getPlatform() !== "android") {
        setPushPermission("unavailable")
        setPushRegistrationState("idle")
      }
      return
    }
    let active = true
    const listeners: { remove: () => Promise<void> }[] = []
    async function registerDevice() {
      setPushRegistrationState("idle")
      setPushError("")
      try {
        listeners.push(
          await PushNotifications.addListener("registration", ({ value }) => {
            if (!active || !getSession()) return
            pushTokenRef.current = value
            setPushRegistrationState("registering")
            void registerPushDevice(value)
              .then(() => {
                if (active) {
                  setPushRegistrationState("registered")
                  setPushError("")
                }
              })
              .catch((requestError: unknown) => {
                if (active) {
                  setPushRegistrationState("error")
                  setPushError(
                    requestError instanceof Error
                      ? requestError.message
                      : "Could not register this device for push notifications.",
                  )
                }
              })
          }),
        )
        listeners.push(
          await PushNotifications.addListener(
            "registrationError",
            (registrationError) => {
              if (active) {
                setPushRegistrationState("error")
                setPushError(
                  registrationError.error ||
                    "Firebase push registration failed. Check the Android Firebase app configuration.",
                )
              }
            },
          ),
        )
        const permission = await PushNotifications.checkPermissions()
        if (!active) return
        setPushPermission(permission.receive)
        if (permission.receive === "granted") await enablePushNotifications()
      } catch (requestError) {
        if (active) {
          setPushRegistrationState("error")
          setPushError(
            requestError instanceof Error
              ? requestError.message
              : "Push notification setup failed.",
          )
        }
      }
    }
    void registerDevice()
    return () => {
      active = false
      for (const listener of listeners) void listener.remove()
    }
  }, [session?.email, isDashboard, enablePushNotifications])

  function signOut() {
    clearSession()
    if (pushTokenRef.current) {
      void removePushDevice(pushTokenRef.current).catch(
        (requestError: unknown) => {
          console.error(
            "Could not remove signed-out device push token",
            requestError,
          )
        },
      )
      pushTokenRef.current = ""
    }
    if (Capacitor.getPlatform() === "android") {
      void PushNotifications.unregister().catch((requestError: unknown) => {
        console.error(
          "Could not unregister signed-out device push notifications",
          requestError,
        )
      })
    }
    setPushRegistrationState("idle")
    setPushError("")
    setSession(null)
    setData(null)
    setSecurityStatus(null)
    setBiometricOfferEmail("")
    setBiometricError("")
    biometricOfferPendingRef.current = false
    setProfileSection("")
    setActiveTab("Home")
  }

  async function exportActivity(fromDate = "", toDate = "") {
    if (!data) return
    try {
      const transactions: Transaction[] = []
      const pageSize = 100
      for (let offset = 0; offset <= 100_000; offset += pageSize) {
        const page = await getMerchantActivityPage({
          limit: pageSize,
          offset,
          from: fromDate,
          to: toDate,
        })
        if (offset === 100_000 && page.length) {
          throw new Error("Statement exceeds the 100,000-record export limit.")
        }
        transactions.push(...page)
        if (page.length < pageSize) break
      }
      const csvCell = (value: string | number) => {
        if (typeof value === "number")
          return Number.isFinite(value) ? String(value) : ""
        const text = String(value)
        const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
        return `"${safeText.replace(/"/g, '""')}"`
      }
      const rows = transactions.map((item) => {
        const ledgerImpact = item.walletAmount ?? item.numericAmount
        const platformFee =
          item.numericAmount > 0 && typeof item.walletAmount === "number"
            ? Math.max(0, item.numericAmount - item.walletAmount)
            : 0
        return [
          item.date,
          item.reference,
          item.description,
          item.channel,
          item.rawStatus,
          item.numericAmount,
          ledgerImpact,
          platformFee,
        ]
          .map(csvCell)
          .join(",")
      })
      const blob = new Blob(
        [
          [
            [
              "Date",
              "Reference",
              "Description",
              "Channel",
              "Status",
              "Gross amount PHP",
              "Merchant ledger impact PHP",
              "Platform fee PHP",
            ].join(","),
            ...rows,
          ].join("\n"),
        ],
        { type: "text/csv" },
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `drpay-activity-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Could not download the full wallet statement.",
      )
    }
  }

  function dismissUpdatePrompt() {
    if (!updateAvailable) return
    dismissedUpdateVersionRef.current = updateAvailable.version
    setUpdateAvailable(null)
  }

  const legalPage = getLegalPage(window.location.pathname)
  if (checkoutCode) return <Checkout code={checkoutCode} />
  if (legalPage) return <LegalPage page={legalPage} />
  if (!isDashboard && !isAdminConsole) return <MarketingHome />

  if (!isBackendConfigured()) {
    return (
      <>
        <main className="auth-screen">
          <div className="auth-brand">
            <Brand />
          </div>
          <section className="auth-card">
            <span className="auth-mark">
              <AlertCircle size={27} />
            </span>
            <span className="eyebrow">LIVE PAYMENTS DISABLED</span>
            <h1>Backend connection required</h1>
            <p>
              DRPAY is not connected to a merchant backend. Wallet balances,
              sign-in, collections, and transfers are unavailable until the
              backend is configured.
            </p>
            <div className="inline-error">
              <Lock size={15} />
              No simulated balances or transactions are shown.
            </div>
          </section>
        </main>
        {updateAvailable && (
          <UpdateAvailablePrompt
            {...updateAvailable}
            onDismiss={dismissUpdatePrompt}
          />
        )}
      </>
    )
  }

  if (isAdminConsole) {
    if (!session) return <OperationsSignIn onAuthenticated={setSession} />
    if (session.role !== "super_admin") {
      return (
        <main className="auth-screen">
          <div className="auth-brand">
            <Brand />
          </div>
          <section className="auth-card">
            <span className="auth-mark">
              <Lock size={25} />
            </span>
            <span className="eyebrow">ACCESS DENIED</span>
            <h1>Restricted access</h1>
            <p>This account cannot access this area.</p>
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </section>
        </main>
      )
    }
    return <SuperAdminConsole session={session} onSignOut={signOut} />
  }

  if (!session) {
    return (
      <>
        <MerchantSignIn onAuthenticated={handleMerchantAuthenticated} />
        {updateAvailable && (
          <UpdateAvailablePrompt
            {...updateAvailable}
            onDismiss={dismissUpdatePrompt}
          />
        )}
      </>
    )
  }

  if (
    session.role === "merchant" &&
    securityStatus &&
    !securityStatus.pinConfigured
  ) {
    return (
      <>
        <SecuritySetupScreen
          initialStatus={securityStatus}
          onComplete={setSecurityStatus}
          onSignOut={signOut}
        />
        {updateAvailable && (
          <UpdateAvailablePrompt
            {...updateAvailable}
            onDismiss={dismissUpdatePrompt}
          />
        )}
      </>
    )
  }

  if (!data && loading) {
    return (
      <>
        <DashboardLoading />
        {updateAvailable && (
          <UpdateAvailablePrompt
            {...updateAvailable}
            onDismiss={dismissUpdatePrompt}
          />
        )}
      </>
    )
  }

  if (!data) {
    return (
      <>
        <main className="dashboard-error-screen error-screen" role="alert">
          <AlertCircle size={28} />
          <h1>Wallet unavailable</h1>
          <p>{error || "We couldn’t load your merchant wallet."}</p>
          <Button
            variant="secondary"
            onClick={loadDashboard}
            icon={<RefreshCw size={16} />}
          >
            Retry
          </Button>
          <Button variant="quiet" onClick={signOut}>
            Sign out
          </Button>
        </main>
        {updateAvailable && (
          <UpdateAvailablePrompt
            {...updateAvailable}
            onDismiss={dismissUpdatePrompt}
          />
        )}
      </>
    )
  }

  return (
    <div className="app-stage">
      <main className="mobile-app">
        <header className="app-header">
          <h1 className="app-header-title">
            {activeTab === "Home"
              ? "Dashboard"
              : activeTab === "Transfer"
                ? "Transfers"
                : activeTab === "Profile"
                  ? profileSection || "Profile"
                  : activeTab === "Wallet" &&
                      walletSubscreen === "unsettled-funds"
                    ? "Unsettled Funds"
                    : activeTab}
          </h1>
          <div className="header-actions">
            <span
              className={`live-pill environment-${data.paymentEnvironment}`}
            >
              <i />
              {data.paymentEnvironment === "production" ? "Live" : "Sandbox"}
            </span>
            <IconButton label="Refresh wallet" onClick={loadDashboard}>
              <RefreshCw className={loading ? "spin" : ""} size={18} />
            </IconButton>
            <IconButton
              label="Notifications"
              onClick={() => setShowNotifications(true)}
            >
              <Bell size={19} />
            </IconButton>
          </div>
        </header>

        <div className="app-scroll">
          {error && (
            <div className="data-warning">
              <AlertCircle size={15} />
              {error}
              <button onClick={loadDashboard}>Retry</button>
            </div>
          )}
          <div
            key={activeTab}
            className="page-transition"
            role="region"
            aria-label={`${activeTab} page`}
          >
            {activeTab === "Home" && (
              <HomeView
                data={data}
                onRequestPayment={() => setShowPayment(true)}
                onTransfer={() => setShowTransfer(true)}
                onScan={() => setShowScanner(true)}
                onActivity={() => setActiveTab("Wallet")}
                onTransaction={setSelectedTransaction}
                onWithdraw={() => {
                  setWalletSubscreen("unsettled-funds")
                  setActiveTab("Wallet")
                }}
              />
            )}
            {activeTab === "Wallet" && (
              <WalletView
                data={data}
                onTransaction={setSelectedTransaction}
                onExportActivity={(fromDate, toDate) =>
                  void exportActivity(fromDate, toDate)
                }
                showUnsettledFunds={walletSubscreen === "unsettled-funds"}
                onOpenUnsettledFunds={() =>
                  setWalletSubscreen("unsettled-funds")
                }
                onCloseUnsettledFunds={() => setWalletSubscreen("overview")}
              />
            )}
            {activeTab === "Transfer" && (
              <TransfersView
                data={data}
                onTransfer={() => setShowTransfer(true)}
                onTransaction={setSelectedTransaction}
              />
            )}
            {activeTab === "Profile" &&
              (profileSection ? (
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
                <MoreView
                  session={session}
                  data={data}
                  onPaymentLink={() => setShowPaymentLink(true)}
                  onInfo={setProfileSection}
                  onSignOut={signOut}
                />
              ))}
          </div>
        </div>

        <nav className="bottom-nav" aria-label="App navigation">
          {tabs.map(({ label, icon: Icon }) => {
            const isPay = label === "Collect"
            return (
              <button
                key={label}
                className={`${activeTab === label ? "active" : ""} ${
                  isPay ? "pay-tab" : ""
                }`}
                onClick={() => {
                  if (isPay) {
                    setShowPayment(true)
                    return
                  }
                  setWalletSubscreen("overview")
                  setActiveTab(label)
                }}
              >
                <span>
                  <Icon
                    size={isPay ? 23 : 20}
                    strokeWidth={isPay ? 2.4 : 1.9}
                  />
                </span>
                <small>{label}</small>
              </button>
            )
          })}
        </nav>
      </main>

      {showPayment && (
        <PaymentSheet
          onClose={() => {
            setShowPayment(false)
            void loadDashboard()
          }}
        />
      )}
      {showTransfer && (
        <TransferSheet
          balance={data.balance}
          initialValues={transferQrPrefill}
          onClose={() => {
            setShowTransfer(false)
            setTransferQrPrefill(undefined)
          }}
          onComplete={loadDashboard}
        />
      )}
      {showScanner && (
        <ScannerSheet
          onClose={() => setShowScanner(false)}
          onTransferQr={(details) => {
            setTransferQrPrefill(details)
            setShowScanner(false)
            setShowTransfer(true)
          }}
        />
      )}
      {showPaymentLink && (
        <PaymentLinkSheet
          onClose={() => {
            setShowPaymentLink(false)
            void loadDashboard()
          }}
        />
      )}
      {selectedTransaction && (
        <TransactionSheet
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onComplete={() => void loadDashboard()}
          onRepeatTransfer={(details) => {
            setSelectedTransaction(null)
            setTransferQrPrefill(details)
            setShowTransfer(true)
          }}
        />
      )}
      {biometricOfferEmail &&
        session?.role === "merchant" &&
        session.email === biometricOfferEmail &&
        securityStatus?.pinConfigured && (
          <BiometricEnrollmentPrompt
            busy={biometricBusy}
            error={biometricError}
            onEnable={() => void enableBiometricSignIn()}
            onSkip={dismissBiometricOffer}
          />
        )}
      {showNotifications && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onMouseDown={() => setShowNotifications(false)}
        >
          <section
            className="payment-sheet"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="sheet-handle" />
            <header className="sheet-header">
              <div>
                <span className="eyebrow">ACCOUNT ACTIVITY</span>
                <h2>Notifications</h2>
              </div>
              <IconButton
                label="Close"
                onClick={() => setShowNotifications(false)}
              >
                <X size={19} />
              </IconButton>
            </header>
            <div className="notification-list">
              {data.transactions.slice(0, 5).map((transaction) => (
                <div key={transaction.id}>
                  <span className="notification-icon">
                    {transaction.numericAmount >= 0 ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {transaction.status === "Completed"
                        ? "Transaction completed"
                        : `Transaction ${transaction.status.toLowerCase()}`}
                    </strong>
                    <p>
                      {transaction.customer} · {transaction.amount}
                    </p>
                    <small>
                      {transaction.date} · {transaction.reference}
                    </small>
                  </div>
                </div>
              ))}
              {data.transactions.length === 0 && <p>No wallet activity yet.</p>}
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowNotifications(false)}
            >
              Done
            </Button>
          </section>
        </div>
      )}
      {updateAvailable && (
        <UpdateAvailablePrompt
          {...updateAvailable}
          onDismiss={() => {
            dismissedUpdateVersionRef.current = updateAvailable.version
            setUpdateAvailable(null)
          }}
        />
      )}
    </div>
  )
}

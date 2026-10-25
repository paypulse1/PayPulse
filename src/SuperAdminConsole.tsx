import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  AlertCircle,
  Home,
  LoaderCircle,
  Lock,
  LogOut,
  RefreshCw,
  ReceiptText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Store,
  Users,
  WalletCards,
} from "lucide-react"
import {
  clearSession,
  createAdminInternalWalletAdjustment,
  createAdminMerchantAccount,
  getAdminFloatingTransferRequests,
  getAdminInternalWallet,
  getAdminInternalWallets,
  getAdminKybDocumentUrl,
  getAdminMerchantAccounts,
  getAdminPaymentLinks,
  getAdminSettings,
  login,
  markAdminPaymentLinkPaid,
  reviewAdminFloatingTransferRequest,
  reviewAdminKybApplication,
  updateAdminMerchantAccount,
  updateAdminMerchantUsdtWallet,
  updateAdminSettings,
  type AdminInternalWallet,
  type AdminInternalWalletSummary,
  type AdminKybApplication,
  type AdminMerchantAccount,
  type AdminPaymentLink,
  type AdminSettings,
  type FloatingTransferRequest,
  type Session,
} from "./lib/swiftpay"
import { Brand, Button, PoweredByFooter } from "./AppPrimitives"

export function SuperAdminSignIn({
  onAuthenticated,
}: {
  onAuthenticated: (session: Session) => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const session = await login(email.trim().toLowerCase(), password)
      if (session.role !== "super_admin") {
        clearSession()
        throw new Error(
          "This account is not authorized for the super-admin console.",
        )
      }
      onAuthenticated(session)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Admin sign-in failed.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen auth-screen-with-footer">
      <div className="auth-brand">
        <Brand />
      </div>
      <section className="auth-card">
        <span className="auth-mark">
          <ShieldCheck size={27} />
        </span>
        <span className="eyebrow">RESTRICTED ACCESS</span>
        <h1>Super-admin sign in</h1>
        <p>Use the separately configured DRPAY super-admin account.</p>
        <form onSubmit={submit}>
          <label>
            <span>Admin email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="username"
              autoFocus
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
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
            disabled={busy || !email || !password}
            icon={
              busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Lock size={17} />
              )
            }
          >
            {busy ? "Signing in…" : "Open admin console"}
          </Button>
        </form>
        <div className="auth-trust">
          <ShieldCheck size={16} />
          <span>
            Separate one-hour admin session. Provider secrets and payment
            execution are not exposed here.
          </span>
        </div>
      </section>
      <PoweredByFooter />
    </main>
  )
}

export function SuperAdminConsole({
  session,
  onSignOut,
}: {
  session: Session
  onSignOut: () => void
}) {
  const [activePage, setActivePage] =
    useState<"overview" | "payments" | "merchants" | "kyb" | "ledger" | "requests" | "settings">(
      "overview",
    )
  const [settings, setSettings] = useState<AdminSettings>({
    krwToPhpRate: null,
    usdtAddress: "",
    usdtNetwork: "",
    collectionFeePercent: 0,
    transferFeeFixed: 0,
    superAdminFeeWallet: 0,
  })
  const [merchants, setMerchants] = useState<AdminMerchantAccount[]>([])
  const [editingMerchant, setEditingMerchant] =
    useState<AdminMerchantAccount & { originalEmail: string } | null>(null)
  const [internalWallets, setInternalWallets] =
    useState<AdminInternalWalletSummary[]>([])
  const [transferRequests, setTransferRequests] =
    useState<FloatingTransferRequest[]>([])
  const [paymentLinks, setPaymentLinks] = useState<AdminPaymentLink[]>([])
  const [paymentVerificationNotes, setPaymentVerificationNotes] =
    useState<Record<string, string>>({})
  const [kybApplications, setKybApplications] = useState<AdminKybApplication[]>(
    [],
  )
  const [kybReviewNotes, setKybReviewNotes] = useState<Record<string, string>>(
    {},
  )
  const [merchantSearch, setMerchantSearch] = useState("")
  const [merchantFilter, setMerchantFilter] =
    useState<"all" | "active" | "disabled">("all")
  const [usdtAddressDrafts, setUsdtAddressDrafts] =
    useState<Record<string, string>>({})
  const [selectedWalletEmail, setSelectedWalletEmail] = useState("")
  const [selectedWallet, setSelectedWallet] =
    useState<AdminInternalWallet | null>(null)
  const [adjustmentAmount, setAdjustmentAmount] = useState("")
  const [adjustmentReason, setAdjustmentReason] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingMerchant, setSavingMerchant] = useState(false)
  const [savingUsdtAddress, setSavingUsdtAddress] = useState("")
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [reviewingRequestId, setReviewingRequestId] = useState("")
  const [markingPaymentId, setMarkingPaymentId] = useState("")
  const [failedRequestId, setFailedRequestId] = useState("")
  const [failedRequestReason, setFailedRequestReason] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const filteredMerchants = useMemo(() => {
    const query = merchantSearch.trim().toLowerCase()
    return merchants.filter((merchant) => {
      const matchesSearch =
        !query || merchant.email.toLowerCase().includes(query)
      const matchesStatus =
        merchantFilter === "all" ||
        (merchantFilter === "active" ? merchant.active : !merchant.active)
      return matchesSearch && matchesStatus
    })
  }, [merchants, merchantSearch, merchantFilter])
  const activeMerchantCount = merchants.filter(
    (merchant) => merchant.active,
  ).length
  const totalLedgerBalance = internalWallets.reduce(
    (total, wallet) => total + wallet.balance,
    0,
  )

  async function loadConsole() {
    setLoading(true)
    setError("")
    try {
      const [
        nextSettings,
        nextMerchants,
        nextWallets,
        nextTransferRequests,
        nextPaymentLinks,
      ] = await Promise.all([
        getAdminSettings(),
        getAdminMerchantAccounts(),
        getAdminInternalWallets(),
        getAdminFloatingTransferRequests(),
        getAdminPaymentLinks(),
      ])
      setSettings(nextSettings)
      setMerchants(nextMerchants)
      setInternalWallets(nextWallets)
      setTransferRequests(nextTransferRequests)
      setPaymentLinks(nextPaymentLinks)
      setSelectedWalletEmail((current) =>
        nextWallets.some((wallet) => wallet.email === current)
          ? current
          : nextWallets[0]?.email || "",
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load admin console data.",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConsole()
  }, [])

  useEffect(() => {
    let active = true
    if (!selectedWalletEmail) {
      setSelectedWallet(null)
      return () => {
        active = false
      }
    }
    getAdminInternalWallet(selectedWalletEmail)
      .then((wallet) => {
        if (active) setSelectedWallet(wallet)
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load internal ledger.",
          )
      })
    return () => {
      active = false
    }
  }, [selectedWalletEmail])

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    setSavingSettings(true)
    setError("")
    setNotice("")
    try {
      const saved = await updateAdminSettings(settings)
      setSettings(saved)
      setNotice(
        "Settings saved. New successful collections and transfer requests use these fee rates.",
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save settings.",
      )
    } finally {
      setSavingSettings(false)
    }
  }

  async function addMerchant(event: FormEvent) {
    event.preventDefault()
    setSavingMerchant(true)
    setError("")
    setNotice("")
    try {
      await createAdminMerchantAccount({ email: newEmail })
      setNewEmail("")
      setNotice("Merchant account created.")
      await loadConsole()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create merchant account.",
      )
    } finally {
      setSavingMerchant(false)
    }
  }

  async function saveMerchantProfile(event: FormEvent) {
    event.preventDefault()
    if (!editingMerchant) return
    setSavingMerchant(true)
    setError("")
    setNotice("")
    try {
      const updated = await updateAdminMerchantAccount(
        editingMerchant.originalEmail,
        {
          email: editingMerchant.email,
          businessName: editingMerchant.businessName,
          contactPerson: editingMerchant.contactPerson,
          phoneNumber: editingMerchant.phoneNumber,
          businessAddress: editingMerchant.businessAddress,
          bankName: editingMerchant.bankName,
          accountName: editingMerchant.accountName,
          accountNumber: editingMerchant.accountNumber,
        },
      )
      await loadConsole()
      setEditingMerchant(null)
      setNotice(
        "Merchant profile updated. If the login email changed, the merchant must sign in again using the new email.",
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update merchant profile.",
      )
    } finally {
      setSavingMerchant(false)
    }
  }

  async function setMerchantActive(account: AdminMerchantAccount) {
    setError("")
    setNotice("")
    try {
      await updateAdminMerchantAccount(account.email, {
        active: !account.active,
      })
      setMerchants((current) =>
        current.map((item) =>
          item.email === account.email
            ? { ...item, active: !account.active }
            : item,
        ),
      )
      setNotice(`Merchant account ${account.active ? "disabled" : "enabled"}.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update merchant account.",
      )
    }
  }

  async function saveMerchantUsdtAddress(
    event: FormEvent<HTMLFormElement>,
    account: AdminMerchantAccount,
  ) {
    event.preventDefault()
    setSavingUsdtAddress(account.email)
    setError("")
    setNotice("")
    try {
      const result = await updateAdminMerchantUsdtWallet(
        account.email,
        usdtAddressDrafts[account.email] ?? account.usdtAddress ?? "",
      )
      setMerchants((current) =>
        current.map((merchant) =>
          merchant.email === account.email
            ? { ...merchant, usdtAddress: result.address }
            : merchant,
        ),
      )
      setUsdtAddressDrafts((current) => ({
        ...current,
        [account.email]: result.address || "",
      }))
      setNotice(
        result.address
          ? `TRON mainnet address assigned to ${account.email}. Verify it carefully before sharing.`
          : `TRON mainnet address removed from ${account.email}.`,
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not assign the merchant mainnet address.",
      )
    } finally {
      setSavingUsdtAddress("")
    }
  }

  async function adjustInternalWallet(event: FormEvent) {
    event.preventDefault()
    if (!selectedWalletEmail) return
    setSavingAdjustment(true)
    setError("")
    setNotice("")
    try {
      await createAdminInternalWalletAdjustment(selectedWalletEmail, {
        amount: Number(adjustmentAmount),
        reason: adjustmentReason,
      })
      setAdjustmentAmount("")
      setAdjustmentReason("")
      const [wallet, wallets] = await Promise.all([
        getAdminInternalWallet(selectedWalletEmail),
        getAdminInternalWallets(),
      ])
      setSelectedWallet(wallet)
      setInternalWallets(wallets)
      setNotice(
        "Floating-balance adjustment recorded. Pending transfer requests remain reserved.",
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not record internal adjustment.",
      )
    } finally {
      setSavingAdjustment(false)
    }
  }

  async function reviewTransferRequest(
    request: FloatingTransferRequest,
    decision: "successful" | "failed",
  ) {
    const reason = failedRequestReason.trim()
    if (decision === "failed" && !reason) {
      setError(
        "Enter a reason before marking the floating-balance request failed.",
      )
      return
    }
    setReviewingRequestId(request.id)
    setError("")
    setNotice("")
    try {
      const reviewed = await reviewAdminFloatingTransferRequest(
        request.id,
        decision,
        decision === "failed" ? reason : undefined,
      )
      setTransferRequests((current) =>
        current.map((item) => (item.id === reviewed.id ? reviewed : item)),
      )
      setFailedRequestId("")
      setFailedRequestReason("")
      setNotice(
        decision === "successful"
          ? "Request marked successful; the requested amount and fixed transfer fee were debited. Arrange the payout to the displayed bank account outside the app."
          : "Request marked failed. The reserved balance is available to the merchant again.",
      )
      try {
        const [wallets, wallet, refreshedSettings] = await Promise.all([
          getAdminInternalWallets(),
          selectedWalletEmail
            ? getAdminInternalWallet(selectedWalletEmail)
            : Promise.resolve(null),
          getAdminSettings(),
        ])
        setInternalWallets(wallets)
        if (wallet) setSelectedWallet(wallet)
        setSettings(refreshedSettings)
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? `Request reviewed, but balance totals could not be refreshed: ${refreshError.message}`
            : "Request reviewed, but balance totals could not be refreshed.",
        )
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not review transfer request.",
      )
    } finally {
      setReviewingRequestId("")
    }
  }

  async function confirmPaymentAsPaid(payment: AdminPaymentLink) {
    const verificationNote = paymentVerificationNotes[payment.id]?.trim() || ""
    if (verificationNote.length < 10) {
      setError(
        "Describe how you independently verified this payment (at least 10 characters).",
      )
      return
    }
    const reference = `${payment.currency} ${payment.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${payment.referenceNo}`
    if (
      !window.confirm(
        `Only continue after independently verifying receipt of ${reference}. This records a manual confirmation; it does not cancel the SwiftPay QR. Make sure this payment will not be paid twice.`,
      )
    ) {
      return
    }
    setMarkingPaymentId(payment.id)
    setError("")
    setNotice("")
    try {
      const updated = await markAdminPaymentLinkPaid(
        payment.id,
        verificationNote,
      )
      setPaymentLinks((current) =>
        current.map((item) => (item.id === payment.id ? updated : item)),
      )
      setPaymentVerificationNotes((current) => ({
        ...current,
        [payment.id]: "",
      }))
      setNotice(
        updated.customerNotification === "no_customer_email"
          ? "Payment marked manually paid and recorded in the audit trail. No customer email is on file."
          : updated.customerNotification === "queued_for_retry"
            ? "Payment marked manually paid. The customer confirmation email is queued for retry."
            : "Payment marked manually paid. The customer confirmation email has been queued.",
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not manually confirm this payment.",
      )
    } finally {
      setMarkingPaymentId("")
    }
  }

  async function reviewKyb(
    application: AdminKybApplication,
    status: "IN_REVIEW" | "APPROVED" | "REJECTED",
  ) {
    const reviewNotes = kybReviewNotes[application.merchantEmail]?.trim() || ""
    if (status === "REJECTED" && !reviewNotes) {
      setError("Add review notes before rejecting a KYB application.")
      return
    }
    setError("")
    setNotice("")
    setReviewingRequestId(application.merchantEmail)
    try {
      await reviewAdminKybApplication(application.merchantEmail, {
        status,
        reviewNotes,
      })
      setKybApplications((current) =>
        current.map((item) =>
          item.merchantEmail === application.merchantEmail
            ? { ...item, status, reviewNotes: reviewNotes || null }
            : item,
        ),
      )
      setNotice(`KYB application ${status.replace("_", " ").toLowerCase()}.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update the KYB review.",
      )
    } finally {
      setReviewingRequestId("")
    }
  }

  async function openKybDocument(
    application: AdminKybApplication,
    documentType: string,
  ) {
    setError("")
    const documentWindow = window.open("about:blank", "_blank")
    if (documentWindow) documentWindow.opener = null
    try {
      const result = await getAdminKybDocumentUrl(
        application.merchantEmail,
        documentType,
      )
      if (documentWindow) documentWindow.location.href = result.url
      else throw new Error("Allow pop-ups to view the private KYB document.")
    } catch (requestError) {
      documentWindow?.close()
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not open the KYB document.",
      )
    }
  }

  return (
    <main className="admin-screen">
      <header className="admin-header">
        <Brand />
        <div>
          <span>SUPER ADMIN</span>
          <strong>{session.email}</strong>
        </div>
        <Button
          variant="secondary"
          icon={<LogOut size={15} />}
          onClick={onSignOut}
        >
          Sign out
        </Button>
      </header>
      <div className="admin-content">
        <div className="page-title">
          <span className="eyebrow">CONTROL PLANE</span>
          <div className="admin-page-heading">
            <div>
              <h1>
                {activePage === "overview"
                  ? "Backoffice overview"
                  : activePage === "payments"
                    ? "QR Ph payments"
                    : activePage === "merchants"
                      ? "Merchant accounts"
                      : activePage === "kyb"
                        ? "KYB applications"
                        : activePage === "ledger"
                          ? "Floating balance"
                          : activePage === "requests"
                            ? "Transfer requests"
                            : "Collection settings"}
              </h1>
              <p>
                {activePage === "overview"
                  ? "Monitor merchant access and floating balances."
                  : activePage === "payments"
                    ? "Review QR checkouts and record independently verified payments."
                    : activePage === "merchants"
                      ? "Create merchant access and manage account status."
                      : activePage === "kyb"
                        ? "Review merchant business and beneficial-owner verification."
                        : activePage === "ledger"
                          ? "Adjust merchant floating balances and review their audit entries."
                          : activePage === "requests"
                            ? "Mark requests successful or failed and arrange payouts for successful requests."
                            : "Configure collection references used by the merchant app."}
              </p>
            </div>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} />}
              onClick={() => void loadConsole()}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>
        <nav className="admin-nav" aria-label="Super-admin pages">
          {([
            ["overview", "Overview", Home],
            [
              "payments",
              `Payments${
                paymentLinks.filter((payment) => payment.status === "PENDING")
                  .length
                  ? ` (${paymentLinks.filter((payment) => payment.status === "PENDING").length})`
                  : ""
              }`,
              ReceiptText,
            ],
            ["merchants", "Merchants", Users],
            [
              "kyb",
              `KYB${
                kybApplications.filter(
                  (application) =>
                    application.status === "PENDING" ||
                    application.status === "IN_REVIEW",
                ).length
                  ? ` (${kybApplications.filter((application) => application.status === "PENDING" || application.status === "IN_REVIEW").length})`
                  : ""
              }`,
              ShieldCheck,
            ],
            ["ledger", "Floating balance", WalletCards],
            [
              "requests",
              `Transfer requests${
                transferRequests.filter(
                  (request) => request.status === "PENDING",
                ).length
                  ? ` (${transferRequests.filter((request) => request.status === "PENDING").length})`
                  : ""
              }`,
              Send,
            ],
            ["settings", "Settings", Settings],
          ] as const).map(([page, label, Icon]) => (
            <button
              key={page}
              type="button"
              className={activePage === page ? "active" : ""}
              aria-current={activePage === page ? "page" : undefined}
              onClick={() => {
                setActivePage(page)
                setError("")
                setNotice("")
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        {error && (
          <div className="inline-error">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        {notice && (
          <div className="admin-notice">
            <ShieldCheck size={15} />
            {notice}
          </div>
        )}
        {loading ? (
          <div className="admin-loading" role="status">
            <LoaderCircle className="spin" size={20} />
            Loading console…
          </div>
        ) : (
          <>
            {activePage === "overview" && (
              <>
                <section
                  className="admin-stat-grid"
                  aria-label="Backoffice summary"
                >
                  <article>
                    <span>Merchant accounts</span>
                    <strong>{merchants.length}</strong>
                    <small>
                      {activeMerchantCount} active ·{" "}
                      {merchants.length - activeMerchantCount} disabled
                    </small>
                  </article>
                  <article>
                    <span>Floating balance total</span>
                    <strong>
                      ₱
                      {totalLedgerBalance.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                    <small>Pending requests are reserved · PHP</small>
                  </article>
                  <article>
                    <span>Pending transfer requests</span>
                    <strong>
                      {
                        transferRequests.filter(
                          (request) => request.status === "PENDING",
                        ).length
                      }
                    </strong>
                    <small>Awaiting admin review</small>
                  </article>
                  <article>
                    <span>Super-admin fee wallet</span>
                    <strong>
                      ₱
                      {settings.superAdminFeeWallet.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                    <small>Recorded collection and transfer fees</small>
                  </article>
                  <article>
                    <span>Collection rate</span>
                    <strong>
                      {settings.krwToPhpRate
                        ? `${settings.krwToPhpRate.toLocaleString("en-PH")} PHP`
                        : "Automatic"}
                    </strong>
                    <small>
                      {settings.krwToPhpRate
                        ? "KRW → PHP manual override"
                        : "Live reference rate"}
                    </small>
                  </article>
                  <article>
                    <span>USDT collection</span>
                    <strong>
                      {settings.usdtAddress ? "Configured" : "Not configured"}
                    </strong>
                    <small>
                      {settings.usdtNetwork || "No receiving network set"}
                    </small>
                  </article>
                </section>
                <section className="admin-card">
                  <div className="admin-card-heading">
                    <span className="setting-icon">
                      <Users size={19} />
                    </span>
                    <div>
                      <h2>Merchant access</h2>
                      <p>
                        Recently added accounts and their current access status.
                      </p>
                    </div>
                    <button
                      className="admin-text-action"
                      onClick={() => setActivePage("merchants")}
                    >
                      Manage merchants
                    </button>
                  </div>
                  <div className="admin-account-list">
                    {merchants.slice(0, 5).map((account) => (
                      <div className="admin-account-row" key={account.email}>
                        <div>
                          <strong>{account.email}</strong>
                          <small>
                            Added{" "}
                            {new Date(account.createdAt).toLocaleDateString()}
                          </small>
                        </div>
                        <span
                          className={`admin-status-pill ${
                            account.active ? "active" : "disabled"
                          }`}
                        >
                          {account.active ? "Active" : "Disabled"}
                        </span>
                      </div>
                    ))}
                    {merchants.length === 0 && (
                      <p className="admin-empty">
                        No merchant accounts yet. Create one to get started.
                      </p>
                    )}
                  </div>
                </section>
                <section className="admin-card admin-overview-note">
                  <ShieldCheck size={18} />
                  <p>
                    Successful collections credit merchants net of the
                    collection fee. Successful floating-balance requests debit
                    the requested amount plus the fixed transfer fee. Both fees
                    are recorded in the super-admin fee wallet; bank payouts
                    remain manually handled outside this app.
                  </p>
                </section>
              </>
            )}
            {activePage === "payments" && (
              <section className="admin-card">
                <div className="admin-card-heading">
                  <span className="setting-icon">
                    <ReceiptText size={19} />
                  </span>
                  <div>
                    <h2>Recent QR Ph checkouts</h2>
                    <p>
                      Manually confirm only after independently verifying the
                      incoming payment. Manual confirmation does not cancel the
                      SwiftPay QR or add funds to the SwiftPay account.
                    </p>
                  </div>
                </div>
                <div className="admin-transfer-request-list">
                  {paymentLinks.length === 0 ? (
                    <p className="admin-empty">
                      No QR Ph checkouts are available.
                    </p>
                  ) : (
                    paymentLinks.map((payment) => {
                      const manuallyPaid = payment.status === "MANUALLY_PAID"
                      const statusLabel = manuallyPaid
                        ? "Manually confirmed"
                        : payment.status === "EXECUTED"
                          ? "Paid · SwiftPay"
                          : payment.status.charAt(0) +
                            payment.status.slice(1).toLowerCase()
                      const verificationNote =
                        paymentVerificationNotes[payment.id] || ""
                      return (
                        <article
                          className="admin-transfer-request"
                          key={payment.id}
                        >
                          <div className="admin-transfer-request-heading">
                            <div>
                              <strong>
                                {payment.merchantEmail || "Unassigned merchant"}
                              </strong>
                              <small>
                                {new Date(payment.createdAt).toLocaleString()}
                              </small>
                            </div>
                            <span
                              className={`admin-status-pill ${payment.status.toLowerCase()}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <strong className="admin-transfer-request-amount">
                            {payment.currency}{" "}
                            {payment.amount.toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                          <dl>
                            <div>
                              <dt>Payment for</dt>
                              <dd>{payment.title}</dd>
                            </div>
                            <div>
                              <dt>Reference</dt>
                              <dd>{payment.referenceNo}</dd>
                            </div>
                            <div>
                              <dt>Customer email</dt>
                              <dd>{payment.customerEmail || "Not provided"}</dd>
                            </div>
                          </dl>
                          {manuallyPaid ? (
                            <p className="admin-transfer-failure-reason">
                              <strong>Manual verification audit</strong>
                              {payment.manualPaidReason}
                              <br />
                              <small>
                                By {payment.manuallyPaidBy || "admin"} ·{" "}
                                {payment.manuallyPaidAt
                                  ? new Date(
                                      payment.manuallyPaidAt,
                                    ).toLocaleString()
                                  : "time unavailable"}
                              </small>
                            </p>
                          ) : payment.status === "PENDING" ? (
                            <form
                              className="admin-transfer-failure-form"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void confirmPaymentAsPaid(payment)
                              }}
                            >
                              <label>
                                <span>
                                  Independent verification details (required;
                                  10–500 characters)
                                </span>
                                <textarea
                                  value={verificationNote}
                                  onChange={(event) =>
                                    setPaymentVerificationNotes((current) => ({
                                      ...current,
                                      [payment.id]: event.target.value,
                                    }))
                                  }
                                  minLength={10}
                                  maxLength={500}
                                  rows={3}
                                  required
                                  placeholder="Describe the independently verified payment evidence and reference"
                                />
                              </label>
                              <Button
                                type="submit"
                                disabled={
                                  markingPaymentId === payment.id ||
                                  verificationNote.trim().length < 10
                                }
                              >
                                {markingPaymentId === payment.id
                                  ? "Confirming…"
                                  : "Mark manually paid"}
                              </Button>
                            </form>
                          ) : null}
                        </article>
                      )
                    })
                  )}
                </div>
              </section>
            )}
            {activePage === "ledger" && (
              <section className="admin-card">
                <div className="admin-card-heading">
                  <span className="setting-icon">
                    <WalletCards size={19} />
                  </span>
                  <div>
                    <h2>Merchant floating balance</h2>
                    <p>
                      PHP balance used for transfer requests. Pending requests
                      reserve funds until marked successful or failed.
                    </p>
                  </div>
                </div>
                {merchants.length === 0 ? (
                  <p className="admin-empty">
                    Create a merchant account before recording ledger
                    adjustments.
                  </p>
                ) : (
                  <>
                    <label className="admin-wallet-select">
                      <span>Merchant account</span>
                      <select
                        value={selectedWalletEmail}
                        onChange={(event) =>
                          setSelectedWalletEmail(event.target.value)
                        }
                      >
                        {merchants.map((merchant) => (
                          <option key={merchant.email} value={merchant.email}>
                            {merchant.email}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="internal-ledger-balance">
                      <span>Floating balance · PHP</span>
                      <strong>
                        {selectedWallet
                          ? `₱${selectedWallet.balance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "Loading…"}
                      </strong>
                      <small>
                        {selectedWallet
                          ? `₱${selectedWallet.availableBalance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available after pending requests`
                          : "Loading available balance…"}
                      </small>
                    </div>
                    <form
                      className="admin-ledger-form"
                      onSubmit={adjustInternalWallet}
                    >
                      <label>
                        <span>Adjustment amount (PHP)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="-1000000000"
                          max="1000000000"
                          value={adjustmentAmount}
                          onChange={(event) =>
                            setAdjustmentAmount(event.target.value)
                          }
                          placeholder="Positive adds; negative subtracts"
                          required
                        />
                      </label>
                      <label>
                        <span>Reason for audit record</span>
                        <input
                          maxLength={250}
                          value={adjustmentReason}
                          onChange={(event) =>
                            setAdjustmentReason(event.target.value)
                          }
                          required
                          placeholder="Internal bookkeeping reason"
                        />
                      </label>
                      <Button
                        type="submit"
                        disabled={
                          savingAdjustment ||
                          !selectedWalletEmail ||
                          !adjustmentAmount ||
                          Number(adjustmentAmount) === 0 ||
                          !adjustmentReason.trim()
                        }
                      >
                        {savingAdjustment
                          ? "Recording…"
                          : "Adjust floating balance"}
                      </Button>
                    </form>
                    <div className="admin-adjustment-list">
                      <strong>Recent audit entries</strong>
                      {!selectedWallet?.adjustments.length ? (
                        <p className="admin-empty">
                          No internal adjustments recorded.
                        </p>
                      ) : (
                        selectedWallet.adjustments.map((adjustment) => (
                          <div
                            className="admin-adjustment-row"
                            key={adjustment.id}
                          >
                            <span
                              className={
                                adjustment.amount < 0 ? "debit" : "credit"
                              }
                            >
                              {adjustment.amount < 0 ? "−" : "+"}₱
                              {Math.abs(adjustment.amount).toLocaleString(
                                "en-PH",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </span>
                            <div>
                              <strong>{adjustment.reason}</strong>
                              <small>
                                By {adjustment.adjustedBy} ·{" "}
                                {new Date(
                                  adjustment.createdAt,
                                ).toLocaleString()}
                              </small>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </section>
            )}
            {activePage === "requests" && (
              <section className="admin-card">
                <div className="admin-card-heading">
                  <span className="setting-icon">
                    <Send size={19} />
                  </span>
                  <div>
                    <h2>Floating-balance transfer requests</h2>
                    <p>
                      Successful requests debit the balance; failed requests
                      require a merchant-visible reason.
                    </p>
                  </div>
                </div>
                <div className="admin-transfer-request-list">
                  {transferRequests.length === 0 ? (
                    <p className="admin-empty">
                      No transfer requests have been submitted.
                    </p>
                  ) : (
                    transferRequests.map((request) => (
                      <article
                        className="admin-transfer-request"
                        key={request.id}
                      >
                        <div className="admin-transfer-request-heading">
                          <div>
                            <strong>{request.merchantEmail}</strong>
                            <small>
                              {new Date(request.requestedAt).toLocaleString()}
                            </small>
                          </div>
                          <span
                            className={`admin-status-pill ${request.status.toLowerCase()}`}
                          >
                            {request.status.charAt(0) +
                              request.status.slice(1).toLowerCase()}
                          </span>
                        </div>
                        <strong className="admin-transfer-request-amount">
                          ₱
                          {request.amount.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </strong>
                        <dl>
                          <div>
                            <dt>Transfer fee</dt>
                            <dd>
                              ₱
                              {request.transferFee.toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </dd>
                          </div>
                          <div>
                            <dt>Bank</dt>
                            <dd>{request.bankName}</dd>
                          </div>
                          <div>
                            <dt>Account name</dt>
                            <dd>{request.accountName}</dd>
                          </div>
                          <div>
                            <dt>Account number</dt>
                            <dd>{request.accountNumber}</dd>
                          </div>
                        </dl>
                        {request.status === "FAILED" &&
                          request.failureReason && (
                            <p className="admin-transfer-failure-reason">
                              <strong>Failure reason for merchant</strong>
                              {request.failureReason}
                            </p>
                          )}
                        {request.status === "PENDING" ? (
                          <div className="admin-transfer-request-actions">
                            <Button
                              disabled={reviewingRequestId === request.id}
                              onClick={() =>
                                void reviewTransferRequest(
                                  request,
                                  "successful",
                                )
                              }
                            >
                              {reviewingRequestId === request.id
                                ? "Updating…"
                                : "Mark successful"}
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={reviewingRequestId === request.id}
                              onClick={() => {
                                setFailedRequestId(request.id)
                                setFailedRequestReason("")
                                setError("")
                              }}
                            >
                              Mark failed
                            </Button>
                            {failedRequestId === request.id && (
                              <form
                                className="admin-transfer-failure-form"
                                onSubmit={(event) => {
                                  event.preventDefault()
                                  void reviewTransferRequest(request, "failed")
                                }}
                              >
                                <label>
                                  <span>
                                    Reason for failed settlement (visible to
                                    merchant)
                                  </span>
                                  <textarea
                                    value={failedRequestReason}
                                    onChange={(event) =>
                                      setFailedRequestReason(event.target.value)
                                    }
                                    maxLength={500}
                                    rows={3}
                                    required
                                    placeholder="Explain why the settlement failed"
                                  />
                                </label>
                                <div>
                                  <Button
                                    type="submit"
                                    disabled={
                                      reviewingRequestId === request.id ||
                                      !failedRequestReason.trim()
                                    }
                                  >
                                    {reviewingRequestId === request.id
                                      ? "Saving…"
                                      : "Confirm failed"}
                                  </Button>
                                  <Button
                                    variant="quiet"
                                    disabled={reviewingRequestId === request.id}
                                    onClick={() => {
                                      setFailedRequestId("")
                                      setFailedRequestReason("")
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </form>
                            )}
                          </div>
                        ) : (
                          request.reviewedAt && (
                            <small className="admin-transfer-reviewed">
                              Reviewed{" "}
                              {new Date(request.reviewedAt).toLocaleString()}
                              {request.reviewedBy
                                ? ` · ${request.reviewedBy}`
                                : ""}
                            </small>
                          )
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>
            )}
            {activePage === "kyb" && (
              <section className="admin-card">
                <div className="admin-card-heading">
                  <span className="setting-icon">
                    <ShieldCheck size={19} />
                  </span>
                  <div>
                    <h2>Merchant identity and business checks</h2>
                    <p>
                      Private documents are served through short-lived signed
                      download URLs.
                    </p>
                  </div>
                </div>
                {kybApplications.length === 0 ? (
                  <p className="admin-empty">
                    KYB review is not enabled on the current production API, so
                    applications cannot be loaded yet. Other admin features
                    remain available.
                  </p>
                ) : (
                  <div className="admin-kyb-list">
                    {kybApplications.map((application) => (
                      <article
                        className="admin-kyb-application"
                        key={application.merchantEmail}
                      >
                        <div className="admin-kyb-heading">
                          <div>
                            <strong>{application.legalBusinessName}</strong>
                            <small>
                              {application.merchantEmail} ·{" "}
                              {application.status.replace("_", " ")}
                            </small>
                          </div>
                        </div>
                        <dl>
                          <div>
                            <dt>Registration</dt>
                            <dd>
                              {application.registrationNumber} ·{" "}
                              {application.businessType}
                            </dd>
                          </div>
                          <div>
                            <dt>Business address</dt>
                            <dd>
                              {application.businessAddress},{" "}
                              {application.country}
                            </dd>
                          </div>
                          <div>
                            <dt>Beneficial owner</dt>
                            <dd>
                              {application.ownerFullName} · Born{" "}
                              {application.ownerDateOfBirth} ·{" "}
                              {application.ownerNationality}
                            </dd>
                          </div>
                          <div>
                            <dt>Owner contact</dt>
                            <dd>
                              {application.ownerEmail} ·{" "}
                              {application.ownerPhone}
                            </dd>
                          </div>
                        </dl>
                        <div className="admin-kyb-documents">
                          {application.documents.map((document) => (
                            <button
                              key={document.id}
                              type="button"
                              className="admin-text-action"
                              onClick={() =>
                                void openKybDocument(
                                  application,
                                  document.documentType,
                                )
                              }
                            >
                              {document.documentType.replace(/_/g, " ")} ·{" "}
                              {document.fileName}
                            </button>
                          ))}
                          {application.documents.length === 0 && (
                            <span>No documents submitted</span>
                          )}
                        </div>
                        <label className="admin-kyb-notes">
                          <span>Review notes (required when rejecting)</span>
                          <textarea
                            value={
                              kybReviewNotes[application.merchantEmail] ??
                              application.reviewNotes ??
                              ""
                            }
                            onChange={(event) =>
                              setKybReviewNotes((current) => ({
                                ...current,
                                [application.merchantEmail]: event.target.value,
                              }))
                            }
                            maxLength={1000}
                            rows={2}
                          />
                        </label>
                        <div className="admin-kyb-actions">
                          <Button
                            variant="secondary"
                            disabled={
                              reviewingRequestId === application.merchantEmail
                            }
                            onClick={() =>
                              void reviewKyb(application, "IN_REVIEW")
                            }
                          >
                            Mark in review
                          </Button>
                          <Button
                            disabled={
                              reviewingRequestId ===
                                application.merchantEmail ||
                              application.documents.length < 3
                            }
                            onClick={() =>
                              void reviewKyb(application, "APPROVED")
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={
                              reviewingRequestId ===
                                application.merchantEmail ||
                              !kybReviewNotes[application.merchantEmail]?.trim()
                            }
                            onClick={() =>
                              void reviewKyb(application, "REJECTED")
                            }
                          >
                            Reject
                          </Button>
                        </div>
                        {application.documents.length < 3 && (
                          <small className="admin-kyb-missing">
                            Approval requires the registration certificate and
                            both identity images.
                          </small>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
            {activePage === "settings" && (
              <section className="admin-card">
                <div className="admin-card-heading">
                  <span className="setting-icon">
                    <Settings size={19} />
                  </span>
                  <div>
                    <h2>Collection and fee configuration</h2>
                    <p>
                      Collection fees reduce merchant net collections; fixed
                      transfer fees apply only on successful settlements.
                    </p>
                  </div>
                </div>
                <form onSubmit={saveSettings}>
                  <label>
                    <span>Collection fee (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={settings.collectionFeePercent}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          collectionFeePercent: event.target.value
                            ? Number(event.target.value)
                            : 0,
                        })
                      }
                    />
                    <small>
                      Deducted from each successful merchant collection before
                      its net amount is credited to the floating balance.
                    </small>
                  </label>
                  <label>
                    <span>Floating-balance transfer fee (PHP)</span>
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      value={settings.transferFeeFixed}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          transferFeeFixed: event.target.value
                            ? Number(event.target.value)
                            : 0,
                        })
                      }
                    />
                    <small>
                      Reserved with each pending request, charged only when
                      marked Successful, and credited to the super-admin fee
                      wallet.
                    </small>
                  </label>
                  <div className="internal-ledger-balance">
                    <span>Super-admin fee wallet · PHP</span>
                    <strong>
                      ₱
                      {settings.superAdminFeeWallet.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                    <small>Accumulated fee ledger total</small>
                  </div>
                  <label>
                    <span>Optional manual KRW → PHP rate</span>
                    <input
                      type="number"
                      min="0.000001"
                      max="1000"
                      step="0.000001"
                      value={settings.krwToPhpRate ?? ""}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          krwToPhpRate: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      placeholder="Optional override"
                    />
                    <small>
                      Leave blank to use the live reference-rate API. A
                      configured rate overrides it; neither rate guarantees the
                      payer’s final SwiftPay conversion.
                    </small>
                  </label>
                  <label>
                    <span>USDT receiving network</span>
                    <input
                      value={settings.usdtNetwork}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          usdtNetwork: event.target.value,
                        })
                      }
                      placeholder="For example: TRON (TRC20)"
                    />
                  </label>
                  <label>
                    <span>USDT receiving address</span>
                    <input
                      value={settings.usdtAddress}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          usdtAddress: event.target.value,
                        })
                      }
                      placeholder="Leave both USDT fields empty until configured"
                      autoComplete="off"
                    />
                  </label>
                  <Button type="submit" disabled={savingSettings}>
                    {savingSettings ? "Saving…" : "Save configuration"}
                  </Button>
                </form>
              </section>
            )}

            {activePage === "merchants" && (
              <section className="admin-card">
                <div className="admin-card-heading">
                  <span className="setting-icon">
                    <Users size={19} />
                  </span>
                  <div>
                    <h2>Merchant accounts</h2>
                    <p>
                      Create email-verified accounts or disable access.
                      Disabling an account revokes its trusted devices.
                    </p>
                  </div>
                </div>
                <div className="admin-merchant-tools">
                  <label className="admin-search">
                    <Search size={16} />
                    <input
                      aria-label="Search merchant emails"
                      value={merchantSearch}
                      onChange={(event) =>
                        setMerchantSearch(event.target.value)
                      }
                      placeholder="Search by merchant email"
                    />
                  </label>
                  <label className="admin-filter">
                    <span>Status</span>
                    <select
                      value={merchantFilter}
                      onChange={(event) =>
                        setMerchantFilter(
                          event.target.value as typeof merchantFilter,
                        )
                      }
                    >
                      <option value="all">All accounts</option>
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                </div>
                <div className="admin-account-list">
                  {filteredMerchants.map((account) => (
                    <div className="admin-merchant-account" key={account.email}>
                      <div className="admin-account-row">
                        <div>
                          <strong>{account.email}</strong>
                          <small>
                            Added{" "}
                            {new Date(account.createdAt).toLocaleDateString()} ·
                            Updated{" "}
                            {new Date(account.updatedAt).toLocaleDateString()}
                          </small>
                        </div>
                        <span
                          className={`admin-status-pill ${
                            account.active ? "active" : "disabled"
                          }`}
                        >
                          {account.active ? "Active" : "Disabled"}
                        </span>
                        <button
                          type="button"
                          className="admin-text-action"
                          onClick={() =>
                            setEditingMerchant({
                              ...account,
                              originalEmail: account.email,
                            })
                          }
                        >
                          Edit profile
                        </button>
                        <button
                          type="button"
                          className="admin-text-action"
                          onClick={() => void setMerchantActive(account)}
                        >
                          {account.active ? "Disable access" : "Enable access"}
                        </button>
                      </div>
                      <form
                        className="admin-usdt-address-form"
                        onSubmit={(event) =>
                          void saveMerchantUsdtAddress(event, account)
                        }
                      >
                        <label>
                          <span>Merchant USDT address · TRON mainnet</span>
                          <input
                            value={
                              usdtAddressDrafts[account.email] ??
                              account.usdtAddress ??
                              ""
                            }
                            onChange={(event) =>
                              setUsdtAddressDrafts((current) => ({
                                ...current,
                                [account.email]: event.target.value,
                              }))
                            }
                            placeholder="Assign a TRON mainnet address"
                            autoComplete="off"
                            maxLength={64}
                          />
                          <small>
                            Confirm the address belongs to this merchant and is
                            for TRON mainnet. TRON address format alone cannot
                            distinguish mainnet from testnet.
                          </small>
                        </label>
                        <Button
                          type="submit"
                          variant="secondary"
                          disabled={savingUsdtAddress === account.email}
                        >
                          {savingUsdtAddress === account.email
                            ? "Saving…"
                            : account.usdtAddress
                              ? "Update address"
                              : "Assign address"}
                        </Button>
                      </form>
                    </div>
                  ))}
                  {filteredMerchants.length === 0 && (
                    <p className="admin-empty">
                      {merchants.length
                        ? "No accounts match your search."
                        : "No merchant accounts yet."}
                    </p>
                  )}
                </div>
                {editingMerchant && (
                  <form
                    className="admin-merchant-profile-form"
                    onSubmit={saveMerchantProfile}
                  >
                    <div className="admin-card-heading">
                      <span className="setting-icon">
                        <Store size={19} />
                      </span>
                      <div>
                        <h2>Edit merchant profile</h2>
                        <p>
                          Updating the login email requires the merchant to sign
                          in again.
                        </p>
                      </div>
                    </div>
                    <label>
                      <span>Merchant email / login</span>
                      <input
                        type="email"
                        value={editingMerchant.email}
                        onChange={(event) =>
                          setEditingMerchant({
                            ...editingMerchant,
                            email: event.target.value,
                          })
                        }
                        required
                        maxLength={254}
                      />
                    </label>
                    <label>
                      <span>Business or display name</span>
                      <input
                        value={editingMerchant.businessName}
                        onChange={(event) =>
                          setEditingMerchant({
                            ...editingMerchant,
                            businessName: event.target.value,
                          })
                        }
                        maxLength={160}
                      />
                    </label>
                    <label>
                      <span>Contact person</span>
                      <input
                        value={editingMerchant.contactPerson}
                        onChange={(event) =>
                          setEditingMerchant({
                            ...editingMerchant,
                            contactPerson: event.target.value,
                          })
                        }
                        maxLength={120}
                      />
                    </label>
                    <label>
                      <span>Phone number</span>
                      <input
                        type="tel"
                        value={editingMerchant.phoneNumber}
                        onChange={(event) =>
                          setEditingMerchant({
                            ...editingMerchant,
                            phoneNumber: event.target.value,
                          })
                        }
                        maxLength={40}
                      />
                    </label>
                    <label>
                      <span>Business address</span>
                      <textarea
                        value={editingMerchant.businessAddress}
                        onChange={(event) =>
                          setEditingMerchant({
                            ...editingMerchant,
                            businessAddress: event.target.value,
                          })
                        }
                        maxLength={500}
                        rows={3}
                      />
                    </label>
                    <div className="admin-profile-payout-heading">
                      <strong>Saved payout account</strong>
                      <small>
                        Leave all fields blank to remove the saved payout
                        account.
                      </small>
                    </div>
                    <label>
                      <span>Bank or wallet name</span>
                      <input
                        value={editingMerchant.bankName}
                        onChange={(event) =>
                          setEditingMerchant({
                            ...editingMerchant,
                            bankName: event.target.value,
                          })
                        }
                        maxLength={100}
                      />
                    </label>
                    <label>
                      <span>Account holder name</span>
                      <input
                        value={editingMerchant.accountName}
                        onChange={(event) =>
                          setEditingMerchant({
                            ...editingMerchant,
                            accountName: event.target.value,
                          })
                        }
                        maxLength={120}
                      />
                    </label>
                    <label>
                      <span>Account number</span>
                      <input
                        value={editingMerchant.accountNumber}
                        onChange={(event) =>
                          setEditingMerchant({
                            ...editingMerchant,
                            accountNumber: event.target.value,
                          })
                        }
                        maxLength={34}
                        autoComplete="off"
                      />
                    </label>
                    <div className="admin-transfer-request-actions">
                      <Button type="submit" disabled={savingMerchant}>
                        {savingMerchant ? "Saving…" : "Save merchant profile"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={savingMerchant}
                        onClick={() => setEditingMerchant(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
                <form onSubmit={addMerchant}>
                  <label>
                    <span>New merchant email</span>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      required
                      autoComplete="off"
                    />
                  </label>
                  <Button type="submit" disabled={savingMerchant || !newEmail}>
                    {savingMerchant ? "Creating…" : "Create merchant account"}
                  </Button>
                </form>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type TouchEvent,
} from "react"
import {
  AlertCircle,
  Activity,
  Download,
  Home,
  LoaderCircle,
  Lock,
  LogOut,
  ReceiptText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Users,
  UserPlus,
  WalletCards,
  type LucideIcon,
} from "lucide-react"
import {
  getAdminAuditEvents,
  createAdminInternalWalletAdjustment,
  createAdminMerchantWalletAdjustment,
  createAdminMerchantAccount,
  getAdminFloatingTransferRequests,
  getAdminInternalWallet,
  getAdminInternalWallets,
  getAdminMerchantWallet,
  getAdminKybDocumentUrl,
  getAdminMerchantAccounts,
  getAdminPaymentLinks,
  getAdminSettings,
  getAdminKybApplications,
  createAdminTaxInvoice,
  markAdminPaymentLinkPaid,
  getAdminUsdtWithdrawalRequests,
  reviewAdminUsdtWithdrawalRequest,
  sendAdminMerchantInvitation,
  reviewAdminFloatingTransferRequest,
  reviewAdminKybApplication,
  sendAdminMerchantIntegrationGuide,
  updateAdminMerchantAccount,
  updateAdminMerchantUsdtWallet,
  updateAdminSettings,
  type AdminInternalWallet,
  type AdminInternalWalletSummary,
  type AdminMerchantWallet,
  type AdminAuditEvent,
  type AdminKybApplication,
  type AdminMerchantAccount,
  type AdminPaymentLink,
  type AdminSettings,
  type PaymentLinkResult,
  type FloatingTransferRequest,
  type UsdtWithdrawalRequest,
  type Session,
} from "./lib/swiftpay"
import { Brand, Button } from "./AppPrimitives"
import AuditAdminSection from "./super-admin/AuditAdminSection"
import MerchantAccountProfileForm, {
  type EditableMerchantAccount,
} from "./super-admin/MerchantAccountProfileForm"
import OverviewAdminSection from "./super-admin/OverviewAdminSection"
import PaymentAdminSection from "./super-admin/PaymentAdminSection"

type AdminPage = "overview" | "payments" | "merchants" | "kyb" | "ledger" | "requests" | "audit" | "settings"

const ADMIN_PAGE_METADATA: Record<AdminPage, {
  title: string
  description: string
  exportLabel: string
}> = {
  overview: {
    title: "Operations overview",
    description: "Prioritize reviews and monitor merchant operations.",
    exportLabel: "workspace",
  },
  payments: {
    title: "QRPH payments",
    description:
      "Review QR checkouts and record independently verified payments.",
    exportLabel: "payments",
  },
  merchants: {
    title: "Merchant accounts",
    description: "Create merchant access and manage account status.",
    exportLabel: "merchants",
  },
  kyb: {
    title: "KYB applications",
    description: "Review merchant business and beneficial-owner verification.",
    exportLabel: "KYB applications",
  },
  ledger: {
    title: "Merchant balances",
    description:
      "Manage merchant floating and wallet balances with audited adjustments.",
    exportLabel: "balances",
  },
  requests: {
    title: "Withdrawal requests",
    description: "Review bank transfers and merchant USDT withdrawal requests.",
    exportLabel: "withdrawal requests",
  },
  audit: {
    title: "Audit history",
    description:
      "Review recorded balance adjustments, transfer decisions, and KYB reviews.",
    exportLabel: "audit history",
  },
  settings: {
    title: "Collection settings",
    description: "Configure collection references used by the merchant app.",
    exportLabel: "workspace",
  },
}

type AdminExportRow = {
  section: string
  record: string
  merchant: string
  status: string
  amount: string | number
  currency: string
  date: string
  actor: string
  summary: string
}

function csvCell(value: string | number) {
  if (typeof value === "number") return String(value)
  const text = String(value)
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

export function SuperAdminConsole({
  session,
  onSignOut,
}: {
  session: Session
  onSignOut: () => void
}) {
  const [activePage, setActivePage] = useState<AdminPage>("overview")
  const [settings, setSettings] = useState<AdminSettings>({
    krwToPhpRate: null,
    usdtAddress: "",
    usdtNetwork: "",
    collectionFeePercent: 0,
    transferFeeFixed: 0,
    agreementProviderName: "DRPAY",
    agreementProviderAddress: "",
    agreementProviderRegistration: "",
    agreementActivationFee: 5000,
    superAdminFeeWallet: 0,
  })
  const [merchants, setMerchants] = useState<AdminMerchantAccount[]>([])
  const [editingMerchant, setEditingMerchant] =
    useState<EditableMerchantAccount | null>(null)
  const [internalWallets, setInternalWallets] =
    useState<AdminInternalWalletSummary[]>([])
  const [transferRequests, setTransferRequests] =
    useState<FloatingTransferRequest[]>([])
  const [cryptoWithdrawalRequests, setCryptoWithdrawalRequests] =
    useState<UsdtWithdrawalRequest[]>([])
  const [paymentLinks, setPaymentLinks] = useState<AdminPaymentLink[]>([])
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([])
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
    useState<"all" | "pending" | "active" | "disabled">("all")
  const [paymentSearch, setPaymentSearch] = useState("")
  const [paymentStatus, setPaymentStatus] = useState("all")
  const [kybSearch, setKybSearch] = useState("")
  const [kybStatus, setKybStatus] = useState("all")
  const [requestSearch, setRequestSearch] = useState("")
  const [requestStatus, setRequestStatus] = useState("all")
  const [auditSearch, setAuditSearch] = useState("")
  const [usdtAddressDrafts, setUsdtAddressDrafts] =
    useState<Record<string, string>>({})
  const [selectedWalletEmail, setSelectedWalletEmail] = useState("")
  const [selectedWallet, setSelectedWallet] =
    useState<AdminInternalWallet | null>(null)
  const [merchantWallet, setMerchantWallet] =
    useState<AdminMerchantWallet | null>(null)
  const [merchantWalletLoading, setMerchantWalletLoading] = useState(false)
  const [merchantWalletError, setMerchantWalletError] = useState("")
  const [merchantAdjustmentAmount, setMerchantAdjustmentAmount] = useState("")
  const [merchantAdjustmentReason, setMerchantAdjustmentReason] = useState("")
  const [savingMerchantAdjustment, setSavingMerchantAdjustment] =
    useState(false)
  const [adjustmentAmount, setAdjustmentAmount] = useState("")
  const [adjustmentReason, setAdjustmentReason] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newBusinessName, setNewBusinessName] = useState("")
  const [newContactPerson, setNewContactPerson] = useState("")
  const [newBusinessAddress, setNewBusinessAddress] = useState("")
  const [newPhoneNumber, setNewPhoneNumber] = useState("")
  const [loading, setLoading] = useState(true)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingMerchant, setSavingMerchant] = useState(false)
  const [savingUsdtAddress, setSavingUsdtAddress] = useState("")
  const [sendingInvitationEmail, setSendingInvitationEmail] = useState("")
  const [sendingIntegrationGuide, setSendingIntegrationGuide] = useState("")
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [reviewingRequestId, setReviewingRequestId] = useState("")
  const [markingPaymentId, setMarkingPaymentId] = useState("")
  const [failedRequestId, setFailedRequestId] = useState("")
  const [failedRequestReason, setFailedRequestReason] = useState("")
  const [successfulRequestId, setSuccessfulRequestId] = useState("")
  const [payoutReference, setPayoutReference] = useState("")
  const [payoutNote, setPayoutNote] = useState("")
  const [cryptoDecisionRequestId, setCryptoDecisionRequestId] = useState("")
  const [cryptoDecision, setCryptoDecision] =
    useState<"completed" | "rejected" | null>(null)
  const [cryptoPayoutTransactionId, setCryptoPayoutTransactionId] = useState("")
  const [cryptoRejectionReason, setCryptoRejectionReason] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const touchStartYRef = useRef<number | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const filteredMerchants = useMemo(() => {
    const query = merchantSearch.trim().toLowerCase()
    return merchants.filter((merchant) => {
      const matchesSearch =
        !query || merchant.email.toLowerCase().includes(query)
      const matchesStatus =
        merchantFilter === "all" ||
        (merchantFilter === "pending"
          ? merchant.registrationPending
          : merchantFilter === "active"
            ? merchant.active
            : !merchant.active && !merchant.registrationPending)
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
  const pendingTransferRequests = transferRequests.filter(
    (request) => request.status === "PENDING",
  )
  const pendingCryptoWithdrawalRequests = cryptoWithdrawalRequests.filter(
    (request) => request.status === "PENDING",
  )
  const reservedTransferBalance = pendingTransferRequests.reduce(
    (total, request) => total + request.amount + request.transferFee,
    0,
  )
  const pendingKybCount = kybApplications.filter(
    (application) =>
      application.status === "PENDING" || application.status === "IN_REVIEW",
  ).length
  const pendingPaymentCount = paymentLinks.filter(
    (payment) => payment.status === "PENDING",
  ).length
  const pendingWithdrawalCount =
    pendingTransferRequests.length + pendingCryptoWithdrawalRequests.length
  const activePageMetadata = ADMIN_PAGE_METADATA[activePage]
  const adminNavigationGroups: {
    label: string
    items: {
      page: AdminPage
      label: string
      icon: LucideIcon
      pendingCount?: number
    }[]
  }[] = [
    {
      label: "Workspace",
      items: [{ page: "overview", label: "Overview", icon: Home }],
    },
    {
      label: "Operations",
      items: [
        {
          page: "payments",
          label: "Payments",
          icon: ReceiptText,
          pendingCount: pendingPaymentCount,
        },
        {
          page: "requests",
          label: "Withdrawal requests",
          icon: Send,
          pendingCount: pendingWithdrawalCount,
        },
        { page: "ledger", label: "Floating balance", icon: WalletCards },
      ],
    },
    {
      label: "Merchants",
      items: [
        { page: "merchants", label: "Accounts", icon: Users },
        {
          page: "kyb",
          label: "KYB review",
          icon: ShieldCheck,
          pendingCount: pendingKybCount,
        },
      ],
    },
    {
      label: "Oversight",
      items: [{ page: "audit", label: "Audit history", icon: Activity }],
    },
    {
      label: "Configuration",
      items: [{ page: "settings", label: "Settings", icon: Settings }],
    },
  ]
  const filteredPayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase()
    return paymentLinks.filter((payment) => {
      const matchesQuery =
        !query ||
        [
          payment.merchantEmail,
          payment.referenceNo,
          payment.title,
          payment.customerEmail,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      return (
        matchesQuery &&
        (paymentStatus === "all" ||
          payment.status.toLowerCase() === paymentStatus)
      )
    })
  }, [paymentLinks, paymentSearch, paymentStatus])
  const filteredKybApplications = useMemo(() => {
    const query = kybSearch.trim().toLowerCase()
    return kybApplications.filter((application) => {
      const matchesQuery =
        !query ||
        [
          application.merchantEmail,
          application.legalBusinessName,
          application.registrationNumber,
          application.ownerFullName,
        ].some((value) => value.toLowerCase().includes(query))
      return (
        matchesQuery &&
        (kybStatus === "all" || application.status.toLowerCase() === kybStatus)
      )
    })
  }, [kybApplications, kybSearch, kybStatus])
  const filteredTransferRequests = useMemo(() => {
    const query = requestSearch.trim().toLowerCase()
    return transferRequests.filter((request) => {
      const matchesQuery =
        !query ||
        [
          request.merchantEmail,
          request.bankName,
          request.accountName,
          request.id,
          request.failureReason,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      return (
        matchesQuery &&
        (requestStatus === "all" ||
          request.status.toLowerCase() === requestStatus)
      )
    })
  }, [transferRequests, requestSearch, requestStatus])
  const filteredCryptoWithdrawalRequests = useMemo(() => {
    const query = requestSearch.trim().toLowerCase()
    return cryptoWithdrawalRequests.filter((request) => {
      const matchesQuery =
        !query ||
        [
          request.merchantEmail,
          request.destination,
          request.id,
          request.rejectionReason,
          request.amount,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      const status =
        request.status === "COMPLETED"
          ? "successful"
          : request.status === "REJECTED"
            ? "failed"
            : "pending"
      return (
        matchesQuery && (requestStatus === "all" || status === requestStatus)
      )
    })
  }, [cryptoWithdrawalRequests, requestSearch, requestStatus])
  const filteredAuditEvents = useMemo(() => {
    const query = auditSearch.trim().toLowerCase()
    return auditEvents.filter(
      (event) =>
        !query ||
        [
          event.category,
          event.action,
          event.target,
          event.actor || "",
          event.summary,
        ].some((value) => value.toLowerCase().includes(query)),
    )
  }, [auditEvents, auditSearch])

  async function refreshAuditEvents() {
    try {
      setAuditEvents(await getAdminAuditEvents())
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? `Action saved, but audit history could not be refreshed: ${requestError.message}`
          : "Action saved, but audit history could not be refreshed.",
      )
    }
  }

  function exportCurrentData() {
    const rows: AdminExportRow[] = []
    const addPayments = (items: AdminPaymentLink[]) => {
      rows.push(
        ...items.map((payment) => ({
          section: "Payment",
          record: payment.referenceNo,
          merchant: payment.merchantEmail || "",
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          date: payment.createdAt,
          actor: payment.manuallyPaidBy || "",
          summary: payment.title,
        })),
      )
    }
    const addKyb = (items: AdminKybApplication[]) => {
      rows.push(
        ...items.map((application) => ({
          section: "KYB",
          record: application.merchantEmail,
          merchant: application.merchantEmail,
          status: application.status,
          amount: "",
          currency: "",
          date: application.updatedAt,
          actor: "",
          summary: application.legalBusinessName,
        })),
      )
    }
    const addRequests = (items: FloatingTransferRequest[]) => {
      rows.push(
        ...items.map((request) => ({
          section: "Transfer request",
          record: request.id,
          merchant: request.merchantEmail || "",
          status: request.status,
          amount: request.amount,
          currency: "PHP",
          date: request.reviewedAt || request.requestedAt,
          actor: request.reviewedBy || "",
          summary: request.payoutReference
            ? `Payout reference ${request.payoutReference}${
                request.payoutNote ? ` · ${request.payoutNote}` : ""
              }`
            : request.failureReason ||
              `Transfer fee PHP ${request.transferFee.toFixed(2)}`,
        })),
      )
    }
    const addCryptoWithdrawalRequests = (items: UsdtWithdrawalRequest[]) => {
      rows.push(
        ...items.map((request) => ({
          section: "Crypto withdrawal request",
          record: request.id,
          merchant: request.merchantEmail || "",
          status: request.status,
          amount: request.amount,
          currency: "USDT",
          date: request.reviewedAt || request.requestedAt,
          actor: request.reviewedBy || "",
          summary: request.transactionId
            ? `TRON transaction ${request.transactionId}`
            : request.rejectionReason || `Destination ${request.destination}`,
        })),
      )
    }
    const addAudit = (items: AdminAuditEvent[]) => {
      rows.push(
        ...items.map((event) => ({
          section: event.category,
          record: event.id,
          merchant: event.target,
          status: event.action,
          amount: "",
          currency: "",
          date: event.occurredAt,
          actor: event.actor || "",
          summary: event.summary,
        })),
      )
    }
    if (activePage === "payments") addPayments(filteredPayments)
    else if (activePage === "kyb") addKyb(filteredKybApplications)
    else if (activePage === "requests") {
      addRequests(filteredTransferRequests)
      addCryptoWithdrawalRequests(filteredCryptoWithdrawalRequests)
    } else if (activePage === "audit") addAudit(filteredAuditEvents)
    else if (activePage === "merchants") {
      rows.push(
        ...filteredMerchants.map((merchant) => ({
          section: "Merchant",
          record: merchant.email,
          merchant: merchant.email,
          status: merchant.active ? "Active" : "Disabled",
          amount: "",
          currency: "",
          date: merchant.updatedAt,
          actor: "",
          summary: merchant.businessName,
        })),
      )
    } else if (activePage === "ledger") {
      rows.push(
        ...(merchantWallet?.transactions || []).map((transaction) => ({
          section: "Merchant wallet transaction",
          record: transaction.referenceNo,
          merchant: selectedWalletEmail,
          status: transaction.sourceType === "COLLECTION" ? "Credit" : "Debit",
          amount: transaction.amount,
          currency: "PHP",
          date: transaction.createdAt,
          actor: "",
          summary: `${transaction.description} · ${transaction.status || "Recorded"}`,
        })),
        ...(selectedWallet?.adjustments || []).map((adjustment) => ({
          section: "Floating balance adjustment",
          record: adjustment.id,
          merchant: selectedWalletEmail,
          status: adjustment.amount < 0 ? "Debit" : "Credit",
          amount: adjustment.amount,
          currency: "PHP",
          date: adjustment.createdAt,
          actor: adjustment.adjustedBy,
          summary: adjustment.reason,
        })),
      )
    } else {
      addPayments(paymentLinks)
      addKyb(kybApplications)
      addRequests(transferRequests)
      addCryptoWithdrawalRequests(cryptoWithdrawalRequests)
      addAudit(auditEvents)
      rows.push(
        ...merchants.map((merchant) => ({
          section: "Merchant",
          record: merchant.email,
          merchant: merchant.email,
          status: merchant.active ? "Active" : "Disabled",
          amount: "",
          currency: "",
          date: merchant.updatedAt,
          actor: "",
          summary: merchant.businessName,
        })),
      )
    }

    const columns: Array<keyof AdminExportRow> = [
      "section",
      "record",
      "merchant",
      "status",
      "amount",
      "currency",
      "date",
      "actor",
      "summary",
    ]
    const csv = [
      columns.join(","),
      ...rows.map((row) =>
        columns.map((column) => csvCell(row[column])).join(","),
      ),
    ].join("\r\n")
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `drpay-operations-${activePage}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function loadConsole() {
    setLoading(true)
    setError("")
    const results = await Promise.allSettled([
      getAdminSettings(),
      getAdminMerchantAccounts(),
      getAdminInternalWallets(),
      getAdminFloatingTransferRequests(),
      getAdminUsdtWithdrawalRequests(),
      getAdminPaymentLinks(),
      getAdminKybApplications(),
      getAdminAuditEvents(),
    ])
    const failures: string[] = []
    const applyResult = <T,>(
      result: PromiseSettledResult<T>,
      label: string,
      update: (value: T) => void,
    ) => {
      if (result.status === "fulfilled") {
        update(result.value)
      } else {
        const detail =
          result.reason instanceof Error ? `: ${result.reason.message}` : ""
        failures.push(`${label}${detail}`)
      }
    }
    const [
      settingsResult,
      merchantsResult,
      walletsResult,
      requestsResult,
      cryptoRequestsResult,
      paymentLinksResult,
      kybResult,
      auditResult,
    ] = results
    applyResult(settingsResult, "Settings", setSettings)
    applyResult(merchantsResult, "merchants", setMerchants)
    applyResult(walletsResult, "floating balances", (nextWallets) => {
      setInternalWallets(nextWallets)
      setSelectedWalletEmail((current) =>
        nextWallets.some((wallet) => wallet.email === current)
          ? current
          : nextWallets[0]?.email || "",
      )
    })
    applyResult(requestsResult, "transfer requests", setTransferRequests)
    applyResult(
      cryptoRequestsResult,
      "crypto withdrawal requests",
      setCryptoWithdrawalRequests,
    )
    applyResult(paymentLinksResult, "payment links", setPaymentLinks)
    applyResult(kybResult, "KYB", setKybApplications)
    applyResult(auditResult, "audit history", setAuditEvents)
    if (failures.length) {
      setError(
        `Could not load ${failures.join("; ")}. Pull down to retry; if your session has expired, sign in again.`,
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadConsole()
  }, [])

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    let target = event.target instanceof Element ? event.target : null
    while (target && target !== event.currentTarget) {
      if (
        target instanceof HTMLElement &&
        ["auto", "scroll", "overlay"].includes(
          window.getComputedStyle(target).overflowY,
        ) &&
        target.scrollHeight > target.clientHeight &&
        target.scrollTop > 0
      ) {
        touchStartYRef.current = null
        touchStartXRef.current = null
        return
      }
      target = target.parentElement
    }
    if (
      loading ||
      pullRefreshing ||
      event.touches.length !== 1 ||
      window.scrollY > 0
    ) {
      touchStartYRef.current = null
      touchStartXRef.current = null
      return
    }
    touchStartYRef.current = event.touches[0].clientY
    touchStartXRef.current = event.touches[0].clientX
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
    const startY = touchStartYRef.current
    const startX = touchStartXRef.current
    if (startY === null || startX === null || event.touches.length !== 1) return
    const deltaY = event.touches[0].clientY - startY
    const deltaX = event.touches[0].clientX - startX
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      touchStartYRef.current = null
      touchStartXRef.current = null
      pullDistanceRef.current = 0
      setPullDistance(0)
      return
    }
    const distance = Math.max(0, deltaY)
    const nextDistance = Math.min(84, distance * 0.55)
    pullDistanceRef.current = nextDistance
    setPullDistance(nextDistance)
  }

  async function handleTouchEnd() {
    const shouldRefresh = !loading && pullDistanceRef.current >= 58
    touchStartYRef.current = null
    touchStartXRef.current = null
    pullDistanceRef.current = 0
    setPullDistance(0)
    if (!shouldRefresh) return
    setPullRefreshing(true)
    try {
      await loadConsole()
    } finally {
      setPullRefreshing(false)
    }
  }

  useEffect(() => {
    let active = true
    if (!selectedWalletEmail) {
      setSelectedWallet(null)
      setMerchantWallet(null)
      setMerchantWalletLoading(false)
      return () => {
        active = false
      }
    }
    setMerchantWallet(null)
    setMerchantWalletError("")
    setMerchantWalletLoading(true)
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
    getAdminMerchantWallet(selectedWalletEmail)
      .then((wallet) => {
        if (active) setMerchantWallet(wallet)
      })
      .catch((requestError) => {
        if (active)
          setMerchantWalletError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load merchant wallet history.",
          )
      })
      .finally(() => {
        if (active) setMerchantWalletLoading(false)
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
        "Settings saved. New successful collections, bank transfers, and payout requests use these fee rates.",
      )
      await refreshAuditEvents()
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
    const invitedEmail = newEmail.trim()
    setSavingMerchant(true)
    setError("")
    setNotice("")
    try {
      await createAdminMerchantAccount({
        email: newEmail,
        businessName: newBusinessName,
        contactPerson: newContactPerson,
        businessAddress: newBusinessAddress,
        phoneNumber: newPhoneNumber,
      })
      setNewEmail("")
      setNewBusinessName("")
      setNewContactPerson("")
      setNewBusinessAddress("")
      setNewPhoneNumber("")
      setNotice(
        `Merchant invitation and agreements emailed to ${invitedEmail}.`,
      )
      await loadConsole()
      await refreshAuditEvents()
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not create merchant account."
      if (message.includes("Merchant account was created")) {
        await loadConsole()
      }
      setError(message)
    } finally {
      setSavingMerchant(false)
    }
  }

  async function resendMerchantInvitation(account: AdminMerchantAccount) {
    setSendingInvitationEmail(account.email)
    setError("")
    setNotice("")
    try {
      await sendAdminMerchantInvitation(account.email)
      setNotice(`Invitation and agreement emailed to ${account.email}.`)
      await refreshAuditEvents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send the merchant invitation.",
      )
    } finally {
      setSendingInvitationEmail("")
    }
  }

  async function resendMerchantIntegrationGuide(account: AdminMerchantAccount) {
    setSendingIntegrationGuide(account.email)
    setError("")
    setNotice("")
    try {
      await sendAdminMerchantIntegrationGuide(account.email)
      setNotice(`API integration guide emailed to ${account.email}.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send the merchant API integration guide.",
      )
    } finally {
      setSendingIntegrationGuide("")
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
      await refreshAuditEvents()
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
            ? {
                ...item,
                active: !account.active,
                registrationPending: account.registrationPending
                  ? false
                  : item.registrationPending,
              }
            : item,
        ),
      )
      setNotice(
        account.registrationPending
          ? `Registration approved. Merchant access enabled for ${account.email}.`
          : account.active
            ? "Merchant account disabled."
            : `Merchant account enabled and API integration guide emailed to ${account.email}.`,
      )
      await refreshAuditEvents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update merchant account.",
      )
      if (
        requestError instanceof Error &&
        requestError.message.includes("account is active")
      ) {
        await loadConsole()
      }
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
      await refreshAuditEvents()
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
      await refreshAuditEvents()
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

  async function adjustMerchantWallet(event: FormEvent) {
    event.preventDefault()
    if (!selectedWalletEmail) return
    setSavingMerchantAdjustment(true)
    setError("")
    setNotice("")
    try {
      const adjustment = await createAdminMerchantWalletAdjustment(
        selectedWalletEmail,
        {
          amount: Number(merchantAdjustmentAmount),
          reason: merchantAdjustmentReason,
        },
      )
      setMerchantAdjustmentAmount("")
      setMerchantAdjustmentReason("")
      setMerchantWallet((current) =>
        current
          ? {
              ...current,
              balance:
                Math.round((current.balance + adjustment.amount) * 100) / 100,
              transactions: [
                adjustment,
                ...current.transactions.filter(
                  (transaction) => transaction.id !== adjustment.id,
                ),
              ].slice(0, 100),
            }
          : current,
      )
      setNotice(
        "Merchant wallet adjustment recorded. Pending transfers remain reserved.",
      )
      await refreshAuditEvents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not record merchant wallet adjustment.",
      )
    } finally {
      setSavingMerchantAdjustment(false)
    }
  }

  async function reviewTransferRequest(
    request: FloatingTransferRequest,
    decision: "successful" | "failed",
  ) {
    const reason = failedRequestReason.trim()
    const payoutRef = payoutReference.trim()
    if (decision === "failed" && !reason) {
      setError(
        "Enter a reason before marking the floating-balance request failed.",
      )
      return
    }
    if (decision === "successful" && !payoutRef) {
      setError("Enter the bank payout reference before confirming settlement.")
      return
    }
    setReviewingRequestId(request.id)
    setError("")
    setNotice("")
    try {
      const reviewed = await reviewAdminFloatingTransferRequest(
        request.id,
        decision,
        decision === "failed"
          ? { reason }
          : { payoutReference: payoutRef, payoutNote: payoutNote.trim() },
      )
      setTransferRequests((current) =>
        current.map((item) => (item.id === reviewed.id ? reviewed : item)),
      )
      setFailedRequestId("")
      setFailedRequestReason("")
      setSuccessfulRequestId("")
      setPayoutReference("")
      setPayoutNote("")
      setNotice(
        decision === "successful"
          ? "Payout confirmed and recorded with its bank reference; the requested amount and fixed transfer fee were debited."
          : "Request marked failed. The reserved balance is available to the merchant again.",
      )
      await refreshAuditEvents()
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

  async function reviewCryptoWithdrawalRequest(
    request: UsdtWithdrawalRequest,
    decision: "completed" | "rejected",
  ) {
    const transactionId = cryptoPayoutTransactionId.trim()
    const reason = cryptoRejectionReason.trim()
    if (decision === "completed" && !/^[0-9a-f]{64}$/i.test(transactionId)) {
      setError("Enter the 64-character TRON payout transaction ID.")
      return
    }
    if (decision === "rejected" && !reason) {
      setError("Enter a reason before rejecting this withdrawal request.")
      return
    }
    setReviewingRequestId(request.id)
    setError("")
    setNotice("")
    try {
      const reviewed = await reviewAdminUsdtWithdrawalRequest(
        request.id,
        decision,
        decision === "completed" ? { transactionId } : { reason },
      )
      setCryptoWithdrawalRequests((current) =>
        current.map((item) => (item.id === reviewed.id ? reviewed : item)),
      )
      setCryptoDecisionRequestId("")
      setCryptoDecision(null)
      setCryptoPayoutTransactionId("")
      setCryptoRejectionReason("")
      setNotice(
        decision === "completed"
          ? "USDT payout recorded as completed."
          : "USDT withdrawal request rejected and the reason recorded.",
      )
      await refreshAuditEvents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not review the crypto withdrawal request.",
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
      await refreshAuditEvents()
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

  async function createTaxInvoice(
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
    setError("")
    setNotice("")
    const result = await createAdminTaxInvoice(
      input,
      idempotencyKey,
      attachment,
    )
    setNotice(
      result.requestEmailStatus === "queued"
        ? "Tax invoice created and payment email queued."
        : result.requestEmailStatus === "sent"
          ? "Tax invoice created; its payment email was already sent."
          : "Tax invoice created, but its payment email could not be queued.",
    )
    try {
      setPaymentLinks(await getAdminPaymentLinks())
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? `Invoice created, but the payments list could not be refreshed: ${requestError.message}`
          : "Invoice created, but the payments list could not be refreshed.",
      )
    }
    await refreshAuditEvents()
    return result
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
      await refreshAuditEvents()
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
    <main
      className="admin-screen"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
      onTouchCancel={() => {
        touchStartYRef.current = null
        touchStartXRef.current = null
        pullDistanceRef.current = 0
        setPullDistance(0)
      }}
    >
      {(pullDistance > 0 || pullRefreshing) && (
        <div className="admin-pull-refresh" role="status" aria-live="polite">
          {pullRefreshing
            ? "Refreshing…"
            : pullDistance >= 58
              ? "Release to refresh"
              : "Pull to refresh"}
        </div>
      )}
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
          <span className="eyebrow">SUPER ADMINISTRATION</span>
          <div className="admin-page-heading">
            <div>
              <h1>{activePageMetadata.title}</h1>
              <p>{activePageMetadata.description}</p>
            </div>
            <div className="admin-header-actions">
              {activePage !== "merchants" && (
                <Button
                  icon={<UserPlus size={15} />}
                  onClick={() => {
                    setActivePage("merchants")
                    setError("")
                    setNotice("")
                  }}
                >
                  Invite merchant
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<Download size={15} />}
                onClick={exportCurrentData}
                disabled={loading}
                aria-label={`Export ${activePageMetadata.exportLabel} as CSV`}
              >
                Export CSV
              </Button>
            </div>
          </div>
        </div>
        <nav
          className="admin-nav"
          aria-label="Super admin dashboard navigation"
        >
          {adminNavigationGroups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <span className="admin-nav-group-label">{group.label}</span>
              {group.items.map(({ page, label, icon: Icon, pendingCount }) => (
                <button
                  key={page}
                  type="button"
                  className={activePage === page ? "active" : ""}
                  aria-current={activePage === page ? "page" : undefined}
                  aria-label={
                    pendingCount
                      ? `${label}, ${pendingCount} items need review`
                      : undefined
                  }
                  onClick={() => {
                    setActivePage(page)
                    setError("")
                    setNotice("")
                  }}
                >
                  <Icon size={16} />
                  <span className="admin-nav-label">{label}</span>
                  {!!pendingCount && (
                    <span className="admin-nav-count" aria-hidden="true">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
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
            Loading workspace…
          </div>
        ) : (
          <>
            {activePage === "overview" && (
              <OverviewAdminSection
                settings={settings}
                merchants={merchants}
                activeMerchantCount={activeMerchantCount}
                totalLedgerBalance={totalLedgerBalance}
                pendingTransferCount={pendingTransferRequests.length}
                pendingCryptoWithdrawalCount={
                  pendingCryptoWithdrawalRequests.length
                }
                reservedTransferBalance={reservedTransferBalance}
                pendingPaymentCount={pendingPaymentCount}
                pendingKybCount={pendingKybCount}
                auditEventCount={auditEvents.length}
                onNavigate={setActivePage}
              />
            )}
            {activePage === "payments" && (
              <PaymentAdminSection
                payments={filteredPayments}
                totalPayments={paymentLinks.length}
                search={paymentSearch}
                onSearchChange={setPaymentSearch}
                status={paymentStatus}
                onStatusChange={setPaymentStatus}
                verificationNotes={paymentVerificationNotes}
                onVerificationNoteChange={(paymentId, note) =>
                  setPaymentVerificationNotes((current) => ({
                    ...current,
                    [paymentId]: note,
                  }))
                }
                markingPaymentId={markingPaymentId}
                onCreateTaxInvoice={createTaxInvoice}
                onConfirmPayment={(payment) => {
                  void confirmPaymentAsPaid(payment)
                }}
              />
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
                        disabled={savingMerchantAdjustment}
                        onChange={(event) => {
                          setSelectedWalletEmail(event.target.value)
                          setMerchantAdjustmentAmount("")
                          setMerchantAdjustmentReason("")
                        }}
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
                          : "Loading Available Balance…"}
                      </small>
                    </div>
                    <div className="internal-ledger-balance admin-merchant-wallet-balance">
                      <span>Merchant wallet balance · PHP</span>
                      <strong>
                        {merchantWallet
                          ? `₱${merchantWallet.balance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : merchantWalletLoading
                            ? "Loading…"
                            : "Unavailable"}
                      </strong>
                      <small>
                        Recorded collections, disbursements, and admin
                        adjustments
                      </small>
                    </div>
                    <form
                      className="admin-ledger-form"
                      onSubmit={adjustMerchantWallet}
                    >
                      <label>
                        <span>Wallet adjustment amount (PHP)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="-1000000000"
                          max="1000000000"
                          value={merchantAdjustmentAmount}
                          onChange={(event) =>
                            setMerchantAdjustmentAmount(event.target.value)
                          }
                          placeholder="Positive adds; negative subtracts"
                          required
                        />
                        <small>
                          A debit cannot reduce the balance below pending
                          transfers.
                        </small>
                      </label>
                      <label>
                        <span>Reason for audit record</span>
                        <input
                          maxLength={250}
                          value={merchantAdjustmentReason}
                          onChange={(event) =>
                            setMerchantAdjustmentReason(event.target.value)
                          }
                          required
                          placeholder="Reason visible in merchant wallet history"
                        />
                      </label>
                      <Button
                        type="submit"
                        disabled={
                          savingMerchantAdjustment ||
                          !selectedWalletEmail ||
                          merchantWalletLoading ||
                          !merchantWallet ||
                          !merchantAdjustmentAmount ||
                          Number(merchantAdjustmentAmount) === 0 ||
                          !merchantAdjustmentReason.trim()
                        }
                      >
                        {savingMerchantAdjustment
                          ? "Recording…"
                          : "Adjust merchant wallet"}
                      </Button>
                    </form>
                    <div className="admin-adjustment-list">
                      <strong>Merchant wallet history · Recent 100</strong>
                      {merchantWalletError ? (
                        <p className="admin-empty" role="alert">
                          {merchantWalletError}
                        </p>
                      ) : merchantWalletLoading ? (
                        <p className="admin-empty" role="status">
                          Loading merchant wallet history…
                        </p>
                      ) : !merchantWallet?.transactions.length ? (
                        <p className="admin-empty">
                          No merchant wallet transactions recorded.
                        </p>
                      ) : (
                        merchantWallet.transactions.map((transaction) => (
                          <div
                            className="admin-adjustment-row"
                            key={transaction.id}
                          >
                            <span
                              className={
                                transaction.amount < 0 ? "debit" : "credit"
                              }
                            >
                              {transaction.amount < 0 ? "−" : "+"}₱
                              {Math.abs(transaction.amount).toLocaleString(
                                "en-PH",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </span>
                            <div>
                              <strong>{transaction.description}</strong>
                              <small>
                                {transaction.sourceType === "ADMIN_ADJUSTMENT"
                                  ? "Super admin adjustment"
                                  : transaction.sourceType === "COLLECTION"
                                    ? "Collection"
                                    : "Disbursement"}{" "}
                                · {transaction.referenceNo} ·{" "}
                                {transaction.status || "Recorded"} ·{" "}
                                {new Date(
                                  transaction.createdAt,
                                ).toLocaleString()}
                              </small>
                            </div>
                          </div>
                        ))
                      )}
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
                <div className="admin-list-controls">
                  <label className="admin-search">
                    <Search size={16} />
                    <input
                      aria-label="Search withdrawal requests"
                      value={requestSearch}
                      onChange={(event) => setRequestSearch(event.target.value)}
                      placeholder="Merchant, bank, destination, account, or request ID"
                    />
                  </label>
                  <label className="admin-filter">
                    <span>Status</span>
                    <select
                      value={requestStatus}
                      onChange={(event) => setRequestStatus(event.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="successful">Successful</option>
                      <option value="failed">Failed</option>
                    </select>
                  </label>
                  <small>
                    {filteredTransferRequests.length} of{" "}
                    {transferRequests.length}
                  </small>
                </div>
                <div className="admin-transfer-request-list">
                  {filteredTransferRequests.length === 0 ? (
                    <p className="admin-empty">
                      {transferRequests.length
                        ? "No requests match these filters."
                        : "No transfer requests have been submitted."}
                    </p>
                  ) : (
                    filteredTransferRequests.map((request) => (
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
                        {request.status === "SUCCESSFUL" &&
                          request.payoutReference && (
                            <p className="admin-transfer-reviewed">
                              <strong>Bank payout reference</strong>{" "}
                              {request.payoutReference}
                              {request.payoutNote && (
                                <>
                                  <br />
                                  <strong>Reconciliation note</strong>{" "}
                                  {request.payoutNote}
                                </>
                              )}
                            </p>
                          )}
                        {request.status === "PENDING" ? (
                          <div className="admin-transfer-request-actions">
                            <Button
                              disabled={reviewingRequestId === request.id}
                              onClick={() => {
                                setSuccessfulRequestId(request.id)
                                setPayoutReference("")
                                setPayoutNote("")
                                setError("")
                              }}
                            >
                              {reviewingRequestId === request.id
                                ? "Updating…"
                                : "Record payout"}
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
                            {successfulRequestId === request.id && (
                              <form
                                className="admin-transfer-failure-form"
                                onSubmit={(event) => {
                                  event.preventDefault()
                                  void reviewTransferRequest(
                                    request,
                                    "successful",
                                  )
                                }}
                              >
                                <label>
                                  <span>Bank payout reference</span>
                                  <input
                                    value={payoutReference}
                                    onChange={(event) =>
                                      setPayoutReference(event.target.value)
                                    }
                                    maxLength={120}
                                    required
                                    placeholder="Enter the bank/provider transaction reference"
                                  />
                                </label>
                                <label>
                                  <span>
                                    Reconciliation note (visible to merchant,
                                    optional)
                                  </span>
                                  <textarea
                                    value={payoutNote}
                                    onChange={(event) =>
                                      setPayoutNote(event.target.value)
                                    }
                                    maxLength={500}
                                    rows={2}
                                    placeholder="Add a note about matching the payout"
                                  />
                                </label>
                                <div>
                                  <Button
                                    type="submit"
                                    disabled={
                                      reviewingRequestId === request.id ||
                                      !payoutReference.trim()
                                    }
                                  >
                                    {reviewingRequestId === request.id
                                      ? "Recording…"
                                      : "Confirm payout sent"}
                                  </Button>
                                  <Button
                                    variant="quiet"
                                    disabled={reviewingRequestId === request.id}
                                    onClick={() => {
                                      setSuccessfulRequestId("")
                                      setPayoutReference("")
                                      setPayoutNote("")
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </form>
                            )}
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
            {activePage === "requests" && (
              <section className="admin-card">
                <div className="admin-card-heading">
                  <span className="setting-icon">
                    <WalletCards size={19} />
                  </span>
                  <div>
                    <h2>USDT withdrawal requests</h2>
                    <p>
                      Review merchant requests and complete payouts manually.
                      Record a payout only after sending USDT on TRON.
                    </p>
                  </div>
                  <span className="admin-crypto-pending-count">
                    <span aria-hidden="true" />
                    {pendingCryptoWithdrawalRequests.length} awaiting review
                  </span>
                </div>
                <div
                  className="admin-crypto-summary"
                  aria-label="USDT withdrawal request totals"
                >
                  <div className="pending">
                    <span>Awaiting review</span>
                    <strong>{pendingCryptoWithdrawalRequests.length}</strong>
                  </div>
                  <div className="completed">
                    <span>Payout sent</span>
                    <strong>
                      {
                        cryptoWithdrawalRequests.filter(
                          (request) => request.status === "COMPLETED",
                        ).length
                      }
                    </strong>
                  </div>
                  <div className="rejected">
                    <span>Rejected</span>
                    <strong>
                      {
                        cryptoWithdrawalRequests.filter(
                          (request) => request.status === "REJECTED",
                        ).length
                      }
                    </strong>
                  </div>
                </div>
                <div className="admin-transfer-request-list">
                  {filteredCryptoWithdrawalRequests.length === 0 ? (
                    <p className="admin-empty">
                      {cryptoWithdrawalRequests.length
                        ? "No crypto requests match these filters."
                        : "No USDT withdrawal requests have been submitted."}
                    </p>
                  ) : (
                    filteredCryptoWithdrawalRequests.map((request) => (
                      <article
                        className={`admin-transfer-request admin-crypto-request ${request.status.toLowerCase()}`}
                        key={request.id}
                      >
                        <div className="admin-transfer-request-heading">
                          <div>
                            <strong>{request.merchantEmail}</strong>
                            <small>
                              Submitted{" "}
                              {new Date(request.requestedAt).toLocaleString()}
                            </small>
                          </div>
                          <span
                            className={`admin-status-pill ${
                              request.status === "COMPLETED"
                                ? "successful"
                                : request.status === "REJECTED"
                                  ? "failed"
                                  : "pending"
                            }`}
                          >
                            {request.status === "PENDING"
                              ? "Awaiting review"
                              : request.status === "COMPLETED"
                                ? "Payout sent"
                                : "Rejected"}
                          </span>
                        </div>
                        <strong className="admin-transfer-request-amount">
                          {request.amount} USDT
                        </strong>
                        <dl>
                          <div>
                            <dt>Merchant assigned wallet</dt>
                            <dd>{request.fromAddress}</dd>
                          </div>
                          <div>
                            <dt>Destination</dt>
                            <dd>{request.destination}</dd>
                          </div>
                          <div>
                            <dt>Request ID</dt>
                            <dd>{request.id}</dd>
                          </div>
                        </dl>
                        {request.transactionId && (
                          <p className="admin-transfer-reviewed">
                            <strong>TRON payout transaction</strong>{" "}
                            <a
                              href={`https://tronscan.org/#/transaction/${encodeURIComponent(request.transactionId)}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {request.transactionId}
                            </a>
                          </p>
                        )}
                        {request.rejectionReason && (
                          <p className="admin-transfer-failure-reason">
                            <strong>Rejection reason</strong>
                            {request.rejectionReason}
                          </p>
                        )}
                        {request.status === "PENDING" ? (
                          <div className="admin-transfer-request-actions">
                            <Button
                              disabled={reviewingRequestId === request.id}
                              onClick={() => {
                                setCryptoDecisionRequestId(request.id)
                                setCryptoDecision("completed")
                                setCryptoPayoutTransactionId("")
                                setCryptoRejectionReason("")
                                setError("")
                              }}
                            >
                              Record payout
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={reviewingRequestId === request.id}
                              onClick={() => {
                                setCryptoDecisionRequestId(request.id)
                                setCryptoDecision("rejected")
                                setCryptoPayoutTransactionId("")
                                setCryptoRejectionReason("")
                                setError("")
                              }}
                            >
                              Reject request
                            </Button>
                            {cryptoDecisionRequestId === request.id && (
                              <div className="admin-transfer-failure-form">
                                {cryptoDecision === "completed" ? (
                                  <form
                                    onSubmit={(event) => {
                                      event.preventDefault()
                                      void reviewCryptoWithdrawalRequest(
                                        request,
                                        "completed",
                                      )
                                    }}
                                  >
                                    <label>
                                      <span>
                                        TRON transaction ID (after payout is
                                        sent)
                                      </span>
                                      <input
                                        autoComplete="off"
                                        maxLength={64}
                                        minLength={64}
                                        required
                                        value={cryptoPayoutTransactionId}
                                        onChange={(event) =>
                                          setCryptoPayoutTransactionId(
                                            event.target.value,
                                          )
                                        }
                                        placeholder="64-character transaction ID"
                                      />
                                    </label>
                                    <Button
                                      type="submit"
                                      disabled={
                                        reviewingRequestId === request.id ||
                                        !/^[0-9a-f]{64}$/i.test(
                                          cryptoPayoutTransactionId.trim(),
                                        )
                                      }
                                    >
                                      {reviewingRequestId === request.id
                                        ? "Saving…"
                                        : "Confirm payout sent"}
                                    </Button>
                                  </form>
                                ) : (
                                  <form
                                    onSubmit={(event) => {
                                      event.preventDefault()
                                      void reviewCryptoWithdrawalRequest(
                                        request,
                                        "rejected",
                                      )
                                    }}
                                  >
                                    <label>
                                      <span>Reason for rejection</span>
                                      <textarea
                                        maxLength={500}
                                        required
                                        rows={3}
                                        value={cryptoRejectionReason}
                                        onChange={(event) =>
                                          setCryptoRejectionReason(
                                            event.target.value,
                                          )
                                        }
                                        placeholder="Explain why this request cannot be approved"
                                      />
                                    </label>
                                    <Button
                                      variant="secondary"
                                      type="submit"
                                      disabled={
                                        reviewingRequestId === request.id ||
                                        !cryptoRejectionReason.trim()
                                      }
                                    >
                                      {reviewingRequestId === request.id
                                        ? "Saving…"
                                        : "Confirm rejection"}
                                    </Button>
                                  </form>
                                )}
                                <Button
                                  variant="quiet"
                                  disabled={reviewingRequestId === request.id}
                                  onClick={() => {
                                    setCryptoDecisionRequestId("")
                                    setCryptoDecision(null)
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
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
                <div className="admin-list-controls">
                  <label className="admin-search">
                    <Search size={16} />
                    <input
                      aria-label="Search KYB applications"
                      value={kybSearch}
                      onChange={(event) => setKybSearch(event.target.value)}
                      placeholder="Merchant, legal business, registration, or owner"
                    />
                  </label>
                  <label className="admin-filter">
                    <span>Status</span>
                    <select
                      value={kybStatus}
                      onChange={(event) => setKybStatus(event.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="in_review">In review</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <small>
                    {filteredKybApplications.length} of {kybApplications.length}
                  </small>
                </div>
                {kybApplications.length === 0 ? (
                  <p className="admin-empty">
                    KYB review is not enabled on the current production API, so
                    applications cannot be loaded yet. Other console features
                    remain available.
                  </p>
                ) : (
                  <div className="admin-kyb-list">
                    {filteredKybApplications.length === 0 ? (
                      <p className="admin-empty">
                        No KYB applications match these filters.
                      </p>
                    ) : (
                      filteredKybApplications.map((application) => (
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
                                  [application.merchantEmail]:
                                    event.target.value,
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
                                !kybReviewNotes[
                                  application.merchantEmail
                                ]?.trim()
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
                      ))
                    )}
                  </div>
                )}
              </section>
            )}
            {activePage === "audit" && (
              <AuditAdminSection
                events={filteredAuditEvents}
                totalEvents={auditEvents.length}
                search={auditSearch}
                onSearchChange={setAuditSearch}
              />
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
                      Collection fees reduce merchant net collections. The fixed
                      transfer fee applies to successful bank transfers and
                      floating-balance payout requests; refunds are exempt.
                    </p>
                  </div>
                </div>
                <form onSubmit={saveSettings}>
                  <div className="admin-card-heading">
                    <span className="setting-icon">
                      <ReceiptText size={19} />
                    </span>
                    <div>
                      <h2>Merchant agreement configuration</h2>
                      <p>
                        These provider details and the activation fee are used
                        in new merchant agreements. Collection and transfer fees
                        below are shared with the live fee configuration.
                        Resending an agreement reuses its original terms.
                      </p>
                    </div>
                  </div>
                  <label>
                    <span>Agreement provider / contracting name</span>
                    <input
                      value={settings.agreementProviderName}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          agreementProviderName: event.target.value,
                        })
                      }
                      required
                      maxLength={160}
                    />
                  </label>
                  <label>
                    <span>Provider registered address</span>
                    <textarea
                      value={settings.agreementProviderAddress}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          agreementProviderAddress: event.target.value,
                        })
                      }
                      maxLength={500}
                      rows={2}
                    />
                  </label>
                  <label>
                    <span>Provider registration number</span>
                    <input
                      value={settings.agreementProviderRegistration}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          agreementProviderRegistration: event.target.value,
                        })
                      }
                      maxLength={120}
                    />
                  </label>
                  <label>
                    <span>One-time account activation fee (PHP)</span>
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      value={settings.agreementActivationFee}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          agreementActivationFee: event.target.value
                            ? Number(event.target.value)
                            : 0,
                        })
                      }
                    />
                    <small>
                      The agreement states that merchant services activate after
                      this amount is collected in the merchant wallet.
                    </small>
                  </label>
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
                    <span>Fixed transfer fee (PHP)</span>
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
                      Reserved with pending transfers and payout requests,
                      charged only when settled, and credited to the platform
                      fee wallet. Refund transfers are exempt.
                    </small>
                  </label>
                  <div className="internal-ledger-balance">
                    <span>Platform fee wallet · PHP</span>
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
                      Invite merchants by email with a personalized agreement,
                      or manage existing account access.
                    </p>
                  </div>
                </div>
                <form className="admin-invite-form" onSubmit={addMerchant}>
                  <div className="admin-card-heading">
                    <span className="setting-icon">
                      <Send size={19} />
                    </span>
                    <div>
                      <h2>Invite a merchant</h2>
                      <p>
                        A personalized Merchant Services Agreement PDF with the
                        service fees and activation terms will be attached to
                        the invitation email.
                      </p>
                    </div>
                  </div>
                  <label>
                    <span>Merchant email</span>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      required
                      autoComplete="off"
                      maxLength={254}
                    />
                  </label>
                  <label>
                    <span>Legal business name</span>
                    <input
                      value={newBusinessName}
                      onChange={(event) =>
                        setNewBusinessName(event.target.value)
                      }
                      required
                      maxLength={200}
                    />
                  </label>
                  <label>
                    <span>Authorized contact person</span>
                    <input
                      value={newContactPerson}
                      onChange={(event) =>
                        setNewContactPerson(event.target.value)
                      }
                      required
                      maxLength={120}
                    />
                  </label>
                  <label>
                    <span>Registered business address</span>
                    <textarea
                      value={newBusinessAddress}
                      onChange={(event) =>
                        setNewBusinessAddress(event.target.value)
                      }
                      required
                      maxLength={500}
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>Contact phone</span>
                    <input
                      type="tel"
                      value={newPhoneNumber}
                      onChange={(event) =>
                        setNewPhoneNumber(event.target.value)
                      }
                      maxLength={40}
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={
                      savingMerchant ||
                      !newEmail ||
                      !newBusinessName ||
                      !newContactPerson ||
                      !newBusinessAddress
                    }
                  >
                    {savingMerchant ? "Sending invitation…" : "Invite merchant"}
                  </Button>
                </form>
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
                      <option value="pending">Pending review</option>
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
                          <small>
                            {account.registrationPending
                              ? `Registration submitted · KYB ${
                                  account.kybStatus?.replace("_", " ") ||
                                  "pending"
                                }`
                              : account.invitationAcceptedAt
                                ? `Invitation accepted ${new Date(
                                    account.invitationAcceptedAt,
                                  ).toLocaleDateString()}`
                                : "Invitation not yet accepted"}
                          </small>
                        </div>
                        <span
                          className={`admin-status-pill ${
                            account.registrationPending
                              ? "pending"
                              : account.active
                                ? "active"
                                : "disabled"
                          }`}
                        >
                          {account.registrationPending
                            ? "Pending review"
                            : account.active
                              ? "Active"
                              : "Disabled"}
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
                          disabled={
                            account.registrationPending &&
                            account.kybStatus !== "APPROVED"
                          }
                          title={
                            account.registrationPending &&
                            account.kybStatus !== "APPROVED"
                              ? "Review and approve this merchant’s KYB application first."
                              : undefined
                          }
                        >
                          {account.registrationPending &&
                          account.kybStatus !== "APPROVED"
                            ? "Review KYB to approve"
                            : account.registrationPending
                              ? "Approve registration"
                              : account.active
                                ? "Disable access"
                                : "Enable access"}
                        </button>
                        <button
                          type="button"
                          className="admin-text-action"
                          onClick={() => void resendMerchantInvitation(account)}
                          disabled={
                            !account.active ||
                            Boolean(account.invitationAcceptedAt) ||
                            sendingInvitationEmail === account.email
                          }
                        >
                          {sendingInvitationEmail === account.email
                            ? "Sending…"
                            : account.invitationAcceptedAt
                              ? "Invitation accepted"
                              : "Resend invitation"}
                        </button>
                        <button
                          type="button"
                          className="admin-text-action"
                          onClick={() =>
                            void resendMerchantIntegrationGuide(account)
                          }
                          disabled={
                            !account.active ||
                            sendingIntegrationGuide === account.email
                          }
                        >
                          {sendingIntegrationGuide === account.email
                            ? "Sending…"
                            : "Resend API guide"}
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
                            distinguish mainnet from testnet. Assignment records
                            its starting balance; changing the address resets
                            the merchant&apos;s USDT qualification and
                            deposit-history window.
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
                  <MerchantAccountProfileForm
                    merchant={editingMerchant}
                    saving={savingMerchant}
                    onChange={setEditingMerchant}
                    onSubmit={saveMerchantProfile}
                    onCancel={() => setEditingMerchant(null)}
                  />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

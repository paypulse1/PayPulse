import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import {
  AlertCircle,
  Download,
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
} from "lucide-react"
import {
  getAdminAuditEvents,
  getAdminApprovalRequests,
  getAdminReconciliationCases,
  getAdminSuspenseItems,
  claimAdminSuspenseItem,
  resolveAdminSuspenseItem,
  inviteAdminStaff,
  getAdminStaff,
  disableAdminStaff,
  runAdminSwiftPayReconciliation,
  reviewAdminApprovalRequest,
  uploadAdminBankCsv,
  createAdminInternalWalletAdjustment,
  createAdminMerchantWalletAdjustment,
  createAdminMerchantAccount,
  getAdminFloatingTransferRequests,
  getAdminInternalWallet,
  getAdminInternalWallets,
  getAdminMerchantWallet,
  getAdminKybDocumentUrl,
  getAdminMerchantAccounts,
  activateAdminMerchantAccounts,
  activateAdminMerchantDownline,
  getAdminPaymentLinks,
  getAdminSettings,
  getAdminMaintenanceMode,
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
  setAdminMaintenanceMode,
  type AdminInternalWallet,
  type AdminInternalWalletSummary,
  type AdminMerchantWallet,
  type AdminAuditEvent,
  type AdminApprovalRequest,
  type AdminStaffMember,
  type AdminReconciliationCase,
  type AdminSuspenseItem,
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
import ScreenTitle from "./ScreenTitle"
import AuditAdminSection from "./super-admin/AuditAdminSection"
import MerchantAccountProfileForm, {
  type EditableMerchantAccount,
} from "./super-admin/MerchantAccountProfileForm"
import OverviewAdminSection from "./super-admin/OverviewAdminSection"
import PaymentAdminSection from "./super-admin/PaymentAdminSection"
import KybApplicationCard, {
  type KybReviewStatus,
} from "./super-admin/KybApplicationCard"
import MerchantAccountRow from "./super-admin/MerchantAccountRow"
import {
  canActivateMerchant,
  updateMerchantKybStatus,
  useAdminConsoleViewModel,
  type AdminPage,
  type MerchantFilter,
} from "./super-admin/useAdminConsoleViewModel"
import PullToRefreshIndicator from "./PullToRefreshIndicator"
import { usePullToRefresh } from "./usePullToRefresh"

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
    agreementProviderName: "PulsePay",
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
  const [approvalRequests, setApprovalRequests] = useState<
    AdminApprovalRequest[]
  >([])
  const [reconciliationCases, setReconciliationCases] = useState<
    AdminReconciliationCase[]
  >([])
  const [suspenseItems, setSuspenseItems] = useState<AdminSuspenseItem[]>([])
  const [bankCsvFile, setBankCsvFile] = useState<File | null>(null)
  const [reconciliationBusy, setReconciliationBusy] = useState(false)
  const [suspenseBusyId, setSuspenseBusyId] = useState("")
  const [suspenseResolutionNotes, setSuspenseResolutionNotes] = useState<
    Record<string, string>
  >({})
  const [staffInviteEmail, setStaffInviteEmail] = useState("")
  const [staffMembers, setStaffMembers] = useState<AdminStaffMember[]>([])
  const [staffInviteRole, setStaffInviteRole] = useState<
    "finance" | "compliance" | "auditor"
  >("finance")
  const [sendingStaffInvitation, setSendingStaffInvitation] = useState(false)
  const [paymentVerificationNotes, setPaymentVerificationNotes] =
    useState<Record<string, string>>({})
  const [kybApplications, setKybApplications] = useState<AdminKybApplication[]>(
    [],
  )
  const [kybReviewNotes, setKybReviewNotes] = useState<Record<string, string>>(
    {},
  )
  const [merchantSearch, setMerchantSearch] = useState("")
  const [selectedMerchantEmails, setSelectedMerchantEmails] =
    useState<string[]>([])
  const [activatingSelectedMerchants, setActivatingSelectedMerchants] =
    useState(false)
  const [activatingDownlineEmail, setActivatingDownlineEmail] = useState("")
  const [merchantFilter, setMerchantFilter] = useState<MerchantFilter>("all")
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
  const {
    handlers: pullRefreshHandlers,
    isRefreshing: pullRefreshing,
    pullDistance,
  } = usePullToRefresh({
    disabled: loading,
    isAtTop: () => window.scrollY <= 0,
    onRefresh: loadConsole,
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [savingMaintenanceMode, setSavingMaintenanceMode] = useState(false)
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
  const {
    activePageMetadata,
    activeMerchantCount,
    adminNavigationGroups,
    filteredAuditEvents,
    filteredCryptoWithdrawalRequests,
    filteredKybApplications,
    filteredMerchants,
    filteredPayments,
    filteredTransferRequests,
    pendingCryptoWithdrawalRequests,
    pendingKybCount,
    pendingPaymentCount,
    pendingTransferRequests,
    pendingWithdrawalCount,
    reservedTransferBalance,
    selectableFilteredMerchants,
    selectedActivatableMerchants,
    totalLedgerBalance,
  } = useAdminConsoleViewModel({
    activePage,
    merchants,
    internalWallets,
    transferRequests,
    cryptoWithdrawalRequests,
    paymentLinks,
    kybApplications,
    auditEvents,
    approvalRequests,
    role: session.role,
    merchantSearch,
    merchantFilter,
    selectedMerchantEmails,
    paymentSearch,
    paymentStatus,
    kybSearch,
    kybStatus,
    requestSearch,
    requestStatus,
    auditSearch,
  })

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

  async function refreshApprovalRequests() {
    setApprovalRequests(await getAdminApprovalRequests("pending"))
  }

  async function showApprovalPending(approvalRequestId: string) {
    setActivePage("approvals")
    setNotice(
      `Action submitted for dual approval (${approvalRequestId}). A different staff member must approve it before you retry the action.`,
    )
    try {
      await refreshApprovalRequests()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? `The approval was submitted, but the queue could not be refreshed: ${requestError.message}`
          : "The approval was submitted, but the queue could not be refreshed.",
      )
    }
  }

  async function decideApproval(
    request: AdminApprovalRequest,
    decision: "approve" | "reject",
  ) {
    if (request.requestedBy === session.email) {
      setError("You cannot review your own approval request.")
      return
    }
    setReviewingRequestId(request.id)
    setError("")
    setNotice("")
    try {
      await reviewAdminApprovalRequest(request.id, decision)
      setApprovalRequests((current) =>
        current.filter((item) => item.id !== request.id),
      )
      setNotice(
        decision === "approve"
          ? "Approval recorded. The requester can now retry the exact action."
          : "The sensitive action was rejected.",
      )
      await refreshAuditEvents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not review this approval request.",
      )
    } finally {
      setReviewingRequestId("")
    }
  }

  async function inviteStaff(event: FormEvent) {
    event.preventDefault()
    setSendingStaffInvitation(true)
    setError("")
    setNotice("")
    try {
      const email = staffInviteEmail.trim().toLowerCase()
      await inviteAdminStaff(email, staffInviteRole)
      setStaffMembers(await getAdminStaff())
      setStaffInviteEmail("")
      setNotice(`Invitation sent to ${email}.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not invite operations staff.",
      )
    } finally {
      setSendingStaffInvitation(false)
    }
  }

  async function disableStaffMember(staff: AdminStaffMember) {
    if (
      staff.role === "super_admin" ||
      !window.confirm(`Disable operations access for ${staff.email}?`)
    ) {
      return
    }
    setReviewingRequestId(staff.email)
    setError("")
    setNotice("")
    try {
      await disableAdminStaff(staff.email)
      setStaffMembers((current) =>
        current.map((member) =>
          member.email === staff.email
            ? { ...member, status: "disabled" }
            : member,
        ),
      )
      setNotice(`Operations access disabled for ${staff.email}.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not disable this staff account.",
      )
    } finally {
      setReviewingRequestId("")
    }
  }

  async function importBankCsv(event: FormEvent) {
    event.preventDefault()
    if (!bankCsvFile) return
    setReconciliationBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await uploadAdminBankCsv(bankCsvFile)
      setBankCsvFile(null)
      const [cases, suspense] = await Promise.all([
        getAdminReconciliationCases(),
        getAdminSuspenseItems(),
        session.role === "super_admin" ? getAdminStaff() : Promise.resolve([]),
      ])
      setReconciliationCases(cases)
      setSuspenseItems(suspense)
      const suspenseCount = Object.entries(result.counts)
        .filter(([status]) => status !== "matched")
        .reduce((total, [, count]) => total + count, 0)
      setNotice(
        `${result.duplicate ? "This statement was already imported. " : ""}${result.importedRows} rows reviewed; ${suspenseCount} unmatched records sent to suspense. No statement rows were auto-posted.`,
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not import the bank statement.",
      )
    } finally {
      setReconciliationBusy(false)
    }
  }

  async function runSwiftPayReconciliation() {
    setReconciliationBusy(true)
    setError("")
    setNotice("")
    try {
      await runAdminSwiftPayReconciliation()
      const [cases, suspense] = await Promise.all([
        getAdminReconciliationCases(),
        getAdminSuspenseItems(),
      ])
      setReconciliationCases(cases)
      setSuspenseItems(suspense)
      setNotice("SwiftPay reconciliation scan completed.")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not run SwiftPay reconciliation.",
      )
    } finally {
      setReconciliationBusy(false)
    }
  }

  async function claimSuspenseItem(id: string) {
    setSuspenseBusyId(id)
    setError("")
    setNotice("")
    try {
      await claimAdminSuspenseItem(id)
      setSuspenseItems(await getAdminSuspenseItems())
      setNotice("Suspense item assigned to you.")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not claim the suspense item.",
      )
    } finally {
      setSuspenseBusyId("")
    }
  }

  async function resolveSuspenseItem(id: string) {
    const note = suspenseResolutionNotes[id]?.trim() || ""
    setSuspenseBusyId(id)
    setError("")
    setNotice("")
    try {
      await resolveAdminSuspenseItem(id, note)
      setSuspenseItems(await getAdminSuspenseItems())
      setSuspenseResolutionNotes((current) => ({ ...current, [id]: "" }))
      setNotice(
        "Suspense investigation marked resolved; no ledger posting was made.",
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not resolve the suspense item.",
      )
    } finally {
      setSuspenseBusyId("")
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
    else if (activePage === "approvals") {
      rows.push(
        ...approvalRequests.map((request) => ({
          section: "Sensitive action approval",
          record: request.id,
          merchant: request.targetKey,
          status: request.status,
          amount: "",
          currency: "",
          date: request.requestedAt,
          actor: request.requestedBy,
          summary: request.actionKey,
        })),
      )
    } else if (activePage === "reconciliation") {
      rows.push(
        ...reconciliationCases.map((item) => ({
          section: `${item.sourceType} reconciliation`,
          record: item.externalReference,
          merchant: item.internalReference || "",
          status: item.status,
          amount: item.amount,
          currency: item.currency,
          date: item.createdAt,
          actor: item.createdBy || "",
          summary: `${item.direction} · ${item.externalStatus}`,
        })),
      )
    }
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
      getAdminMaintenanceMode(),
      getAdminMerchantAccounts(),
      getAdminInternalWallets(),
      getAdminFloatingTransferRequests(),
      getAdminUsdtWithdrawalRequests(),
      getAdminPaymentLinks(),
      getAdminKybApplications(),
      getAdminAuditEvents(),
      getAdminApprovalRequests("pending"),
      getAdminReconciliationCases(),
      getAdminSuspenseItems(),
      session.role === "super_admin" ? getAdminStaff() : Promise.resolve([]),
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
      maintenanceModeResult,
      merchantsResult,
      walletsResult,
      requestsResult,
      cryptoRequestsResult,
      paymentLinksResult,
      kybResult,
      auditResult,
      approvalResult,
      reconciliationResult,
      suspenseResult,
      staffResult,
    ] = results
    applyResult(settingsResult, "Settings", setSettings)
    applyResult(maintenanceModeResult, "Maintenance mode", (result) =>
      setMaintenanceMode(result.enabled),
    )
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
    applyResult(approvalResult, "approval requests", setApprovalRequests)
    applyResult(
      reconciliationResult,
      "reconciliation cases",
      setReconciliationCases,
    )
    applyResult(suspenseResult, "suspense items", setSuspenseItems)
    if (session.role === "super_admin") {
      applyResult(staffResult, "operations staff", setStaffMembers)
    }
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

  async function toggleMaintenanceMode() {
    setSavingMaintenanceMode(true)
    setError("")
    setNotice("")
    try {
      const saved = await setAdminMaintenanceMode(!maintenanceMode)
      setMaintenanceMode(saved.enabled)
      setNotice(
        saved.enabled
          ? "Maintenance mode is on. Merchant workspaces will display the maintenance screen."
          : "Maintenance mode is off. Merchant workspaces are available again.",
      )
      await refreshAuditEvents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update merchant maintenance mode.",
      )
    } finally {
      setSavingMaintenanceMode(false)
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
      setSelectedMerchantEmails((current) =>
        current.filter((email) => email !== editingMerchant.originalEmail),
      )
      setEditingMerchant(null)
      setNotice(
        "Merchant profile updated. If the sign-in email changed, the merchant must sign in again using the new email.",
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
      const updated = await updateAdminMerchantAccount(account.email, {
        active: !account.active,
      })
      setSelectedMerchantEmails((current) =>
        current.filter((email) => email !== account.email),
      )
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
      const emailNotice =
        updated.activationEmailStatus === "sent"
          ? " Access-ready email sent."
          : updated.activationEmailStatus === "failed"
            ? " Access-ready email could not be sent."
            : ""
      setNotice(
        account.registrationPending
          ? `Registration approved. Merchant access enabled for ${account.email}.${emailNotice}`
          : account.active
            ? "Merchant account disabled."
            : `Merchant account enabled.${emailNotice}`,
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

  async function activateMerchantDownline(account: AdminMerchantAccount) {
    if (
      !window.confirm(
        `Manually enable merchant downline for ${account.email}?\n\nThis bypasses downline eligibility requirements only; it does not waive wallet activation.`,
      )
    ) {
      return
    }

    setActivatingDownlineEmail(account.email)
    setError("")
    setNotice("")
    try {
      await activateAdminMerchantDownline(account.email)
      setMerchants((current) =>
        current.map((item) =>
          item.email === account.email
            ? { ...item, downlineManuallyEnabled: true }
            : item,
        ),
      )
      setNotice(`Merchant downline manually enabled for ${account.email}.`)
      await refreshAuditEvents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not manually enable merchant downline.",
      )
    } finally {
      setActivatingDownlineEmail("")
    }
  }

  async function activateSelectedMerchants() {
    const accounts = selectedActivatableMerchants
    if (!accounts.length) return
    const count = accounts.length
    const description = accounts.map((account) => account.email).join("\n")
    if (
      !window.confirm(
        `Enable merchant access for these ${count} selected account${
          count === 1 ? "" : "s"
        }?\n\n${description}`,
      )
    ) {
      return
    }

    setActivatingSelectedMerchants(true)
    setError("")
    setNotice("")
    try {
      const { activatedEmails, activationEmailFailureCount } =
        await activateAdminMerchantAccounts(
          accounts.map((account) => account.email),
        )
      const activatedSet = new Set(activatedEmails)
      setMerchants((current) =>
        current.map((merchant) =>
          activatedSet.has(merchant.email)
            ? {
                ...merchant,
                active: true,
                registrationPending: false,
              }
            : merchant,
        ),
      )
      setSelectedMerchantEmails((current) =>
        current.filter(
          (email) => !accounts.some((account) => account.email === email),
        ),
      )
      setNotice(
        `${
          activatedEmails.length
            ? `Merchant access enabled for ${activatedEmails.length} selected account${
                activatedEmails.length === 1 ? "" : "s"
              }.`
            : "All selected merchant accounts already have access enabled."
        }${
          activationEmailFailureCount
            ? ` ${activationEmailFailureCount} access-ready email${
                activationEmailFailureCount === 1 ? "" : "s"
              } could not be sent.`
            : activatedEmails.length
              ? " Access-ready emails sent."
              : ""
        }`,
      )
      await refreshAuditEvents()
    } catch (requestError) {
      await loadConsole()
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not activate the selected merchant accounts.",
      )
    } finally {
      setActivatingSelectedMerchants(false)
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
      const adjustment = await createAdminInternalWalletAdjustment(selectedWalletEmail, {
        amount: Number(adjustmentAmount),
        reason: adjustmentReason,
      })
      if ("approvalRequired" in adjustment) {
        await showApprovalPending(adjustment.approvalRequestId)
        return
      }
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
      if ("approvalRequired" in adjustment) {
        await showApprovalPending(adjustment.approvalRequestId)
        return
      }
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
      if ("approvalRequired" in reviewed) {
        await showApprovalPending(reviewed.approvalRequestId)
        return
      }
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
      if ("approvalRequired" in reviewed) {
        await showApprovalPending(reviewed.approvalRequestId)
        return
      }
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
      if ("approvalRequired" in updated) {
        await showApprovalPending(updated.approvalRequestId)
        return
      }
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
          : result.requestEmailStatus === "not_required"
            ? "Tax invoice created; payment was already confirmed."
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
    status: KybReviewStatus,
  ) {
    const reviewNotes = (
      kybReviewNotes[application.merchantEmail] ??
      application.reviewNotes ??
      ""
    ).trim()
    if (status === "REJECTED" && !reviewNotes) {
      setError("Add review notes before rejecting a KYB application.")
      return
    }
    setError("")
    setNotice("")
    setReviewingRequestId(application.merchantEmail)
    try {
      const result = await reviewAdminKybApplication(
        application.merchantEmail,
        {
          status,
          reviewNotes,
        },
      )
      setKybApplications((current) =>
        current.map((item) =>
          item.merchantEmail === application.merchantEmail
            ? { ...item, status, reviewNotes: reviewNotes || null }
            : item,
        ),
      )
      setMerchants((current) =>
        updateMerchantKybStatus(current, application.merchantEmail, status),
      )
      const resultNotice = `KYB application ${status.replace("_", " ").toLowerCase()}.`
      setNotice(
        result.emailNotificationStatus === "failed"
          ? `${resultNotice} Merchant notification email could not be sent.`
          : result.emailNotificationStatus === "sent"
            ? `${resultNotice} Merchant notification sent.`
            : resultNotice,
      )
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
    <main className="admin-screen" {...pullRefreshHandlers}>
      <PullToRefreshIndicator
        distance={pullDistance}
        refreshing={pullRefreshing}
        variant="admin"
      />
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
            <ScreenTitle
              title={activePageMetadata.title}
              level="h1"
              description={activePageMetadata.description}
            />
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
                maintenanceMode={maintenanceMode}
                canManageMaintenance={session.role === "super_admin"}
                savingMaintenanceMode={savingMaintenanceMode}
                onToggleMaintenanceMode={() => {
                  void toggleMaintenanceMode()
                }}
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
                        <KybApplicationCard
                          key={application.merchantEmail}
                          application={application}
                          reviewNotes={
                            kybReviewNotes[application.merchantEmail] ??
                            application.reviewNotes ??
                            ""
                          }
                          reviewing={
                            reviewingRequestId === application.merchantEmail
                          }
                          onReviewNotesChange={(notes) =>
                            setKybReviewNotes((current) => ({
                              ...current,
                              [application.merchantEmail]: notes,
                            }))
                          }
                          onOpenDocument={(documentType) =>
                            void openKybDocument(application, documentType)
                          }
                          onReview={(status) =>
                            void reviewKyb(application, status)
                          }
                        />
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
            {activePage === "reconciliation" && (
              <>
                <section className="admin-card">
                  <div className="admin-card-heading">
                    <span className="setting-icon">
                      <ShieldCheck size={19} />
                    </span>
                    <div>
                      <h2>Reconciliation controls</h2>
                      <p>
                        Imported bank statement rows are compared with internal
                        references only. Unmatched or inconsistent entries go
                        to suspense and are never auto-posted.
                      </p>
                    </div>
                  </div>
                  {(session.role === "super_admin" ||
                    session.role === "finance") && (
                    <>
                      <form className="admin-invite-form" onSubmit={importBankCsv}>
                        <label>
                          <span>Bank statement CSV (maximum 2 MB)</span>
                          <input
                            type="file"
                            accept=".csv,text/csv,application/csv"
                            onChange={(event) =>
                              setBankCsvFile(event.target.files?.[0] || null)
                            }
                          />
                        </label>
                        <small>
                          Required headers: reference, amount, currency,
                          direction (IN/OUT), status, occurred_at.
                        </small>
                        <Button
                          type="submit"
                          disabled={reconciliationBusy || !bankCsvFile}
                        >
                          {reconciliationBusy
                            ? "Importing…"
                            : "Import and reconcile statement"}
                        </Button>
                      </form>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={reconciliationBusy}
                        onClick={() => void runSwiftPayReconciliation()}
                      >
                        {reconciliationBusy
                          ? "Scanning…"
                          : "Run SwiftPay status reconciliation"}
                      </Button>
                    </>
                  )}
                  {reconciliationCases.length === 0 ? (
                    <p className="admin-empty">No reconciliation cases yet.</p>
                  ) : (
                    <div className="admin-adjustment-list">
                      <strong>Recent cases · {reconciliationCases.length}</strong>
                      {reconciliationCases.map((item) => (
                        <div className="admin-adjustment-row" key={item.id}>
                          <span
                            className={
                              item.status === "matched" ? "credit" : "debit"
                            }
                          >
                            {item.status.replace(/_/g, " ")}
                          </span>
                          <div>
                            <strong>
                              {item.sourceType} · {item.externalReference}
                            </strong>
                            <small>
                              {item.direction} {item.currency} {item.amount} ·{" "}
                              {item.externalStatus}
                              {item.internalReference
                                ? ` · internal ${item.internalReference}`
                                : ""}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="admin-card">
                  <div className="admin-card-heading">
                    <span className="setting-icon">
                      <AlertCircle size={19} />
                    </span>
                    <div>
                      <h2>Accounting suspense</h2>
                      <p>
                        Open items require an assigned finance owner and a
                        written resolution. Resolving an investigation never
                        creates a journal entry or wallet credit.
                      </p>
                    </div>
                  </div>
                  {!suspenseItems.length ? (
                    <p className="admin-empty">No open suspense items.</p>
                  ) : (
                    <div className="admin-adjustment-list">
                      {suspenseItems.map((item) => (
                        <div className="admin-adjustment-row" key={item.id}>
                          <span
                            className={
                              item.status === "open" ? "debit" : "credit"
                            }
                          >
                            {item.status.toUpperCase()}
                          </span>
                          <div>
                            <strong>
                              {item.sourceType} · {item.externalReference}
                            </strong>
                            <small>
                              {item.direction} {item.currency} {item.amount} ·{" "}
                              {item.externalStatus} ·{" "}
                              {new Date(item.createdAt).toLocaleString()}
                            </small>
                            <small>
                              Owner: {item.ownerEmail || "Unassigned"}
                              {item.resolvedBy
                                ? ` · Resolved by ${item.resolvedBy}`
                                : ""}
                            </small>
                            {item.resolutionNote && (
                              <small>Resolution: {item.resolutionNote}</small>
                            )}
                            {item.events.map((event, index) => (
                              <small key={`${event.eventType}-${index}`}>
                                {event.eventType === "assigned"
                                  ? `Assigned to ${event.ownerEmail || "unknown"}`
                                  : `Resolved by ${event.actorEmail}`}
                                {" · "}
                                {new Date(event.createdAt).toLocaleString()}
                                {event.note ? ` · ${event.note}` : ""}
                              </small>
                            ))}
                            {item.status === "open" &&
                              (session.role === "finance" ||
                                session.role === "super_admin") && (
                                <div className="admin-invite-form">
                                  {!item.ownerEmail && (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      disabled={suspenseBusyId === item.id}
                                      onClick={() =>
                                        void claimSuspenseItem(item.id)
                                      }
                                    >
                                      {suspenseBusyId === item.id
                                        ? "Assigning…"
                                        : "Assign to me"}
                                    </Button>
                                  )}
                                  {(session.role === "super_admin" ||
                                    item.ownerEmail === session.email) && (
                                    <>
                                      <label>
                                        <span>Resolution note</span>
                                        <textarea
                                          rows={2}
                                          maxLength={2000}
                                          value={
                                            suspenseResolutionNotes[item.id] ||
                                            ""
                                          }
                                          onChange={(event) =>
                                            setSuspenseResolutionNotes(
                                              (current) => ({
                                                ...current,
                                                [item.id]: event.target.value,
                                              }),
                                            )
                                          }
                                        />
                                      </label>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={
                                          suspenseBusyId === item.id ||
                                          (suspenseResolutionNotes[item.id] ||
                                            "").trim().length < 10
                                        }
                                        onClick={() =>
                                          void resolveSuspenseItem(item.id)
                                        }
                                      >
                                        {suspenseBusyId === item.id
                                          ? "Resolving…"
                                          : "Resolve investigation"}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
            {activePage === "approvals" && (
              <section className="admin-card">
                <div className="admin-card-heading">
                  <span className="setting-icon">
                    <ShieldCheck size={19} />
                  </span>
                  <div>
                    <h2>Pending sensitive actions</h2>
                    <p>
                      Review the exact request and payload. The requester must
                      retry the action after approval.
                    </p>
                  </div>
                </div>
                {!approvalRequests.length ? (
                  <p className="admin-empty">No pending approvals.</p>
                ) : (
                  <div className="admin-adjustment-list">
                    {approvalRequests.map((request) => (
                      <article className="admin-adjustment-row" key={request.id}>
                        <div>
                          <strong>
                            {request.actionKey.replace(/_/g, " ")}
                          </strong>
                          <small>
                            Requested by {request.requestedBy} ·{" "}
                            {new Date(request.requestedAt).toLocaleString()}
                          </small>
                          <small>Target: {request.targetKey}</small>
                          <pre
                            className="admin-approval-payload"
                            style={{
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {JSON.stringify(request.payload, null, 2)}
                          </pre>
                        </div>
                        <div className="admin-header-actions">
                          <Button
                            type="button"
                            disabled={
                              session.role === "auditor" ||
                              request.requestedBy === session.email ||
                              reviewingRequestId === request.id
                            }
                            onClick={() =>
                              void decideApproval(request, "approve")
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={
                              session.role === "auditor" ||
                              request.requestedBy === session.email ||
                              reviewingRequestId === request.id
                            }
                            onClick={() =>
                              void decideApproval(request, "reject")
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
            {activePage === "settings" && (
              <>
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
                {session.role === "super_admin" ? (
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
                ) : (
                  <p className="admin-empty">
                    Configuration is read-only for your operations role.
                  </p>
                )}
              </section>
              {session.role === "super_admin" && (
                <section className="admin-card">
                  <div className="admin-card-heading">
                    <span className="setting-icon">
                      <UserPlus size={19} />
                    </span>
                    <div>
                      <h2>Invite operations staff</h2>
                      <p>
                        Staff must create a unique password and enroll an
                        authenticator before they can use the console.
                      </p>
                    </div>
                  </div>
                  <form className="admin-invite-form" onSubmit={inviteStaff}>
                    <label>
                      <span>Work email</span>
                      <input
                        type="email"
                        value={staffInviteEmail}
                        onChange={(event) =>
                          setStaffInviteEmail(event.target.value)
                        }
                        maxLength={254}
                        required
                      />
                    </label>
                    <label>
                      <span>Operations role</span>
                      <select
                        value={staffInviteRole}
                        onChange={(event) =>
                          setStaffInviteRole(
                            event.target.value as
                              | "finance"
                              | "compliance"
                              | "auditor",
                          )
                        }
                      >
                        <option value="finance">Finance</option>
                        <option value="compliance">Compliance</option>
                        <option value="auditor">Auditor (read-only)</option>
                      </select>
                    </label>
                    <Button
                      type="submit"
                      disabled={sendingStaffInvitation || !staffInviteEmail}
                    >
                      {sendingStaffInvitation
                        ? "Sending invitation…"
                        : "Invite staff member"}
                    </Button>
                  </form>
                  <div className="admin-adjustment-list">
                    <strong>Operations staff</strong>
                    {staffMembers.map((staff) => (
                      <div className="admin-adjustment-row" key={staff.email}>
                        <div>
                          <strong>{staff.email}</strong>
                          <small>
                            {staff.role.replace(/_/g, " ")} · {staff.status} ·{" "}
                            {staff.role === "super_admin"
                              ? "TOTP optional"
                              : staff.mfaEnabled
                                ? "MFA enabled"
                                : "MFA not enrolled"}
                          </small>
                        </div>
                        {staff.role !== "super_admin" &&
                          staff.status !== "disabled" && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={reviewingRequestId === staff.email}
                              onClick={() => void disableStaffMember(staff)}
                            >
                              Disable access
                            </Button>
                          )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              </>
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
                <div className="admin-merchant-selection">
                  <label>
                    <input
                      type="checkbox"
                      aria-label="Select all eligible merchant accounts shown"
                      checked={
                        selectableFilteredMerchants.length > 0 &&
                        selectableFilteredMerchants.every((account) =>
                          selectedMerchantEmails.includes(account.email),
                        )
                      }
                      onChange={(event) => {
                        const visibleEmails = selectableFilteredMerchants.map(
                          (account) => account.email,
                        )
                        setSelectedMerchantEmails((current) =>
                          event.target.checked
                            ? Array.from(
                                new Set([...current, ...visibleEmails]),
                              )
                            : current.filter(
                                (email) => !visibleEmails.includes(email),
                              ),
                        )
                      }}
                      disabled={
                        activatingSelectedMerchants ||
                        selectableFilteredMerchants.length === 0
                      }
                    />
                    <span>Select all eligible accounts shown</span>
                  </label>
                  <Button
                    type="button"
                    onClick={() => void activateSelectedMerchants()}
                    disabled={
                      activatingSelectedMerchants ||
                      selectedActivatableMerchants.length === 0
                    }
                  >
                    {activatingSelectedMerchants
                      ? "Activating…"
                      : `Activate selected (${selectedActivatableMerchants.length})`}
                  </Button>
                </div>
                <div className="admin-account-list">
                  {filteredMerchants.map((account) => (
                    <MerchantAccountRow
                      key={account.email}
                      account={account}
                      selected={selectedMerchantEmails.includes(account.email)}
                      selectionDisabled={
                        activatingSelectedMerchants ||
                        !canActivateMerchant(account)
                      }
                      downlineBusy={activatingDownlineEmail !== ""}
                      invitationBusy={sendingInvitationEmail === account.email}
                      integrationGuideBusy={
                        sendingIntegrationGuide === account.email
                      }
                      addressSaving={savingUsdtAddress === account.email}
                      addressDraft={
                        usdtAddressDrafts[account.email] ??
                        account.usdtAddress ??
                        ""
                      }
                      onSelect={() =>
                        setSelectedMerchantEmails((current) =>
                          current.includes(account.email)
                            ? current.filter((email) => email !== account.email)
                            : [...current, account.email],
                        )
                      }
                      onEdit={setEditingMerchant}
                      onToggleActive={() => void setMerchantActive(account)}
                      onEnableDownline={() =>
                        void activateMerchantDownline(account)
                      }
                      onResendInvitation={() =>
                        void resendMerchantInvitation(account)
                      }
                      onResendIntegrationGuide={() =>
                        void resendMerchantIntegrationGuide(account)
                      }
                      onAddressDraftChange={(value) =>
                        setUsdtAddressDrafts((current) => ({
                          ...current,
                          [account.email]: value,
                        }))
                      }
                      onSaveAddress={(event) =>
                        void saveMerchantUsdtAddress(event, account)
                      }
                    />
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

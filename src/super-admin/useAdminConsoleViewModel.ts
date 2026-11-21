import { useMemo } from "react"
import {
  Activity,
  Home,
  ReceiptText,
  Send,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  CheckCheck,
  ListChecks,
  type LucideIcon,
} from "lucide-react"
import type {
  AdminAuditEvent,
  AdminInternalWalletSummary,
  AdminKybApplication,
  AdminMerchantAccount,
  AdminPaymentLink,
  AdminApprovalRequest,
  FloatingTransferRequest,
  UsdtWithdrawalRequest,
  Session,
} from "../lib/swiftpay"

export type AdminPage = "overview" | "payments" | "merchants" | "kyb" | "ledger" | "requests" | "reconciliation" | "approvals" | "audit" | "settings"

export type MerchantFilter = "all" | "pending" | "active" | "disabled"

export function isSameAdminIdentity(
  firstEmail: string | null | undefined,
  secondEmail: string | null | undefined,
) {
  const normalize = (email: string | null | undefined) =>
    typeof email === "string" ? email.trim().toLowerCase() : ""
  const first = normalize(firstEmail)
  return first.length > 0 && first === normalize(secondEmail)
}

export function getAdminRoleLabel(role: Session["role"] | undefined) {
  switch (role) {
    case "super_admin":
      return "Super admin"
    case "finance":
      return "Finance"
    case "compliance":
      return "Compliance"
    case "auditor":
      return "Auditor"
    default:
      return "Operations"
  }
}

export const ADMIN_PAGE_METADATA: Record<AdminPage, {
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
  approvals: {
    title: "Dual-approval queue",
    description:
      "Review sensitive financial actions requested by another operations user.",
    exportLabel: "approval requests",
  },
  reconciliation: {
    title: "Financial reconciliation",
    description:
      "Compare provider and bank statement records without automatically posting unmatched items.",
    exportLabel: "reconciliation",
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

export function canActivateMerchant(account: AdminMerchantAccount) {
  return (
    !account.active &&
    (!account.registrationPending || account.kybStatus === "APPROVED")
  )
}

export function updateMerchantKybStatus(
  merchants: AdminMerchantAccount[],
  email: string,
  kybStatus: AdminMerchantAccount["kybStatus"],
) {
  return merchants.map((merchant) =>
    merchant.email === email ? { ...merchant, kybStatus } : merchant,
  )
}

export function canManuallyApproveKyb(
  application: {
    documents: ReadonlyArray<{ documentType: string }>
    kybConsentGiven: boolean
  },
) {
  const uploadedTypes = new Set(
    application.documents.map((document) => document.documentType),
  )
  return (
    application.kybConsentGiven &&
    ["business_registration", "identity_front", "identity_back"].every(
      (documentType) => uploadedTypes.has(documentType),
    )
  )
}

export function useAdminConsoleViewModel({
  activePage,
  merchants,
  internalWallets,
  transferRequests,
  cryptoWithdrawalRequests,
  paymentLinks,
  kybApplications,
  auditEvents,
  approvalRequests,
  role,
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
}: {
  activePage: AdminPage
  merchants: AdminMerchantAccount[]
  internalWallets: AdminInternalWalletSummary[]
  transferRequests: FloatingTransferRequest[]
  cryptoWithdrawalRequests: UsdtWithdrawalRequest[]
  paymentLinks: AdminPaymentLink[]
  kybApplications: AdminKybApplication[]
  auditEvents: AdminAuditEvent[]
  approvalRequests: AdminApprovalRequest[]
  role: Session["role"]
  merchantSearch: string
  merchantFilter: MerchantFilter
  selectedMerchantEmails: string[]
  paymentSearch: string
  paymentStatus: string
  kybSearch: string
  kybStatus: string
  requestSearch: string
  requestStatus: string
  auditSearch: string
}) {
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

  const selectableFilteredMerchants =
    filteredMerchants.filter(canActivateMerchant)
  const selectedActivatableMerchants = merchants.filter(
    (merchant) =>
      selectedMerchantEmails.includes(merchant.email) &&
      canActivateMerchant(merchant),
  )
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
  const pendingApprovalCount = approvalRequests.filter(
    (request) => request.status === "pending",
  ).length

  const allAdminNavigationGroups: {
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
        { page: "reconciliation", label: "Reconciliation", icon: ListChecks },
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
      items: [
        {
          page: "approvals",
          label: "Dual approvals",
          icon: CheckCheck,
          pendingCount: pendingApprovalCount,
        },
        { page: "audit", label: "Audit history", icon: Activity },
      ],
    },
    {
      label: "Configuration",
      items: [{ page: "settings", label: "Settings", icon: Settings }],
    },
  ]
  const pagesByRole: Partial<Record<Session["role"], AdminPage[]>> = {
    super_admin: [
      "overview",
      "payments",
      "requests",
      "reconciliation",
      "ledger",
      "merchants",
      "kyb",
      "approvals",
      "audit",
      "settings",
    ],
    finance: [
      "overview",
      "payments",
      "requests",
      "reconciliation",
      "ledger",
      "approvals",
      "audit",
    ],
    compliance: ["overview", "merchants", "kyb", "approvals", "audit"],
    auditor: [
      "overview",
      "payments",
      "requests",
      "reconciliation",
      "ledger",
      "merchants",
      "kyb",
      "approvals",
      "audit",
    ],
  }
  const adminNavigationGroups = allAdminNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        (pagesByRole[role] || []).includes(item.page),
      ),
    }))
    .filter((group) => group.items.length > 0)

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

  return {
    activePageMetadata: ADMIN_PAGE_METADATA[activePage],
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
  }
}

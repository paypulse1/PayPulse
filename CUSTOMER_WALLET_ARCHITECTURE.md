# Customer Wallet Product and Architecture Specification

## Status and decision gate

The Phase 5 non-money foundation now provides customer accounts authenticated
with email OTP and a read-only payment-history page. The customer identity
tables and JWT role are separate from merchant accounts and merchant sessions.
Customer session tokens also use a customer-specific audience claim.
History is limited to pending or completed checkouts whose normalized customer
email exactly matches the verified account email.

Customer balances, funding, transfers, and withdrawals are not implemented.
The launch jurisdiction is undecided. Netbank and SwiftPay.ph were named as
possible partners, but their legal, custody, safeguarding, and rail roles have
not been approved or verified. Do not accept or move customer funds until
those decisions are approved by legal, compliance, Finance, and the relevant
regulated partners.

The read-only page is available at `/customer`. Customer OTP endpoints are
`POST /v1/customer/auth/request-otp` and
`POST /v1/customer/auth/verify-otp`; the protected history endpoint is
`GET /v1/customer/payment-history`. The history endpoint returns no checkout
capability code, payment credentials, or merchant wallet data.
Production use still requires verified OTP-email delivery and encrypted
database/storage backups under the platform's approved data-protection policy.

## Product boundary

The customer wallet is a separate product from merchant collection balances
and the merchant operations console. It must not reuse merchant wallet
accounts, merchant API keys, merchant settlement logic, or merchant session
claims. A customer is an individual end user; a merchant is a business
recipient. The product owner must decide whether customers can hold a
transferable stored-value balance, use a non-custodial payment instrument, or
only view payment history.

The initial release should not promise interest, deposit protection, cash
withdrawal, cross-border transfers, or reversible settlement unless the
selected legal and partner model explicitly supports those capabilities.

## Target architecture

- **Identity:** separate customer identity and account state; require verified
  email/phone and risk-based step-up authentication for funding, withdrawals,
  new-device use, and security changes. Keep customer and operations tokens
  distinct.
- **Ledger:** use an append-only, double-entry subledger with integer minor
  units and explicit currency. Customer available balance is the ledger
  balance less active holds; never store a mutable balance as the source of
  truth. Every posting has a globally unique idempotency key and immutable
  source reference.
- **Transaction lifecycle:** model `requested`, `pending_review`,
  `submitted`, `settled`, `failed`, `reversed`, and `unknown` states. Provider
  timeouts remain unknown until provider reconciliation establishes an
  outcome. A retry must reuse the original idempotency key.
- **Funding and payout adapters:** isolate each approved rail behind a
  server-side adapter. Verify signed callbacks, persist the raw event safely,
  deduplicate provider event IDs, and reconcile provider statements against
  internal transfers. Do not infer settlement from a client redirect.
- **Risk and compliance:** require jurisdiction-specific KYC/KYB, sanctions
  screening, transaction monitoring, limits, suspicious-activity escalation,
  complaint handling, and documented retention/deletion rules before launch.
- **Operations:** use maker-checker approval for manual ledger adjustments,
  payout release, account freezes, and limit overrides. Keep immutable audit
  events, reconciliation queues, and a suspense workflow. Unmatched statements
  must not create wallet credits automatically.
- **Data isolation:** scope every customer query by authenticated customer ID;
  enforce ownership in the database access layer. Encrypt sensitive identity
  data at rest, minimize PII in logs, and apply explicit access and retention
  policies.

## Minimum workflows

1. Customer registration, identity verification, device enrollment, account
   freeze/unfreeze, and recovery with step-up verification.
2. Display of posted balance, pending holds, available balance, and a
   paginated immutable transaction history.
3. Funding initiation and provider confirmation, with pending/unknown states,
   replay-safe callbacks, and exact-once ledger posting.
4. Internal transfer initiation, recipient validation, limits, fraud checks,
   atomic debit/credit posting, and a customer-visible receipt.
5. Withdrawal initiation, available-balance reservation, risk review, approved
   rail submission, confirmation, and deterministic hold release on failure.
6. Disputes, chargebacks, refunds, and reversals that create compensating
   entries rather than editing prior entries.
7. Daily provider and bank reconciliation, break aging, suspense ownership,
   approval and resolution history, and regulatory reporting.

## Delivery sequence

1. Decide jurisdiction, legal classification, licensing or sponsor-bank model,
   custody and safeguarding model, and customer eligibility.
2. Select permitted funding, transfer, and payout rails; obtain provider
   contracts and sandbox access.
3. Approve customer terms, disclosures, KYC/AML controls, transaction limits,
   complaints process, data retention, and incident procedures.
4. Define the chart of accounts, posting rules, reversals, reconciliation
   controls, and financial reporting with Finance and Compliance.
5. Implement an isolated ledger and identity boundary, then rail adapters and
   customer workflows behind feature flags; validate failure, retry, duplicate,
   reversal, and outage scenarios before any production funds are enabled.

## Open decisions required before implementation

- Launch jurisdiction(s), customer residency, and legal product classification.
- Licensed entity, custodian, safeguarding account, and responsibility for
  customer funds.
- Permitted inbound funding sources and outbound payout rails.
- Whether peer-to-peer transfers, merchant checkout, or cross-border use are
  in scope.
- Fees, balance/transaction limits, hold rules, reversals, and refund policy.
- KYC tiers, sanctions/PEP screening, monitoring thresholds, and escalation
  ownership.
- Required statements, disclosures, reporting, retention, and deletion
  periods.
- Customer support, fraud disputes, account recovery, and freeze authority.

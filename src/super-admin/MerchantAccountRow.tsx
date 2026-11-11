import type { FormEvent } from "react"
import { Button } from "../AppPrimitives"
import type { AdminMerchantAccount } from "../lib/swiftpay"
import type { EditableMerchantAccount } from "./MerchantAccountProfileForm"

export default function MerchantAccountRow({
  account,
  selected,
  selectionDisabled,
  downlineBusy,
  invitationBusy,
  integrationGuideBusy,
  addressSaving,
  addressDraft,
  onSelect,
  onEdit,
  onToggleActive,
  onEnableDownline,
  onResendInvitation,
  onResendIntegrationGuide,
  onAddressDraftChange,
  onSaveAddress,
}: {
  account: AdminMerchantAccount
  selected: boolean
  selectionDisabled: boolean
  downlineBusy: boolean
  invitationBusy: boolean
  integrationGuideBusy: boolean
  addressSaving: boolean
  addressDraft: string
  onSelect: () => void
  onEdit: (account: EditableMerchantAccount) => void
  onToggleActive: () => void
  onEnableDownline: () => void
  onResendInvitation: () => void
  onResendIntegrationGuide: () => void
  onAddressDraftChange: (value: string) => void
  onSaveAddress: (event: FormEvent<HTMLFormElement>) => void
}) {
  const canApproveRegistration =
    !account.registrationPending || account.kybStatus === "APPROVED"
  const registrationReadyForApproval =
    account.registrationPending && account.kybStatus === "APPROVED"

  return (
    <div className="admin-merchant-account">
      <div className="admin-account-row">
        <label className="admin-merchant-select">
          <input
            type="checkbox"
            aria-label={`Select ${account.email} for activation`}
            checked={selected}
            onChange={onSelect}
            disabled={selectionDisabled}
          />
        </label>
        <div>
          <strong>{account.email}</strong>
          <small>
            Added {new Date(account.createdAt).toLocaleDateString()} · Updated{" "}
            {new Date(account.updatedAt).toLocaleDateString()}
          </small>
          <small>
            {account.registrationPending
              ? `Registration submitted · KYB ${
                  account.kybStatus?.replace("_", " ") || "pending"
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
            ? registrationReadyForApproval
              ? "Awaiting access"
              : "Pending review"
            : account.active
              ? "Active"
              : "Disabled"}
        </span>
        <button
          type="button"
          className="admin-text-action"
          onClick={() => onEdit({ ...account, originalEmail: account.email })}
        >
          Edit profile
        </button>
        <button
          type="button"
          className="admin-text-action"
          onClick={onToggleActive}
          disabled={!canApproveRegistration}
          title={
            !canApproveRegistration
              ? "Review and approve this merchant’s KYB application first."
              : undefined
          }
        >
          {!canApproveRegistration
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
          onClick={onEnableDownline}
          disabled={account.downlineManuallyEnabled || downlineBusy}
          title={
            account.downlineManuallyEnabled
              ? "Merchant downline is manually enabled."
              : "Manually enable downline access without wallet activation requirements."
          }
        >
          {downlineBusy
            ? "Enabling downline…"
            : account.downlineManuallyEnabled
              ? "Downline manually enabled"
              : "Enable downline"}
        </button>
        <button
          type="button"
          className="admin-text-action"
          onClick={onResendInvitation}
          disabled={
            !account.active ||
            Boolean(account.invitationAcceptedAt) ||
            invitationBusy
          }
        >
          {invitationBusy
            ? "Sending…"
            : account.invitationAcceptedAt
              ? "Invitation accepted"
              : "Resend invitation"}
        </button>
        <button
          type="button"
          className="admin-text-action"
          onClick={onResendIntegrationGuide}
          disabled={!account.active || integrationGuideBusy}
        >
          {integrationGuideBusy ? "Sending…" : "Resend API guide"}
        </button>
      </div>
      <form className="admin-usdt-address-form" onSubmit={onSaveAddress}>
        <label>
          <span>Merchant USDT address · TRON mainnet</span>
          <input
            value={addressDraft}
            onChange={(event) => onAddressDraftChange(event.target.value)}
            placeholder="Assign a TRON mainnet address"
            autoComplete="off"
            maxLength={64}
          />
          <small>
            Confirm the address belongs to this merchant and is for TRON
            mainnet. TRON address format alone cannot distinguish mainnet from
            testnet. Assignment records its starting balance; changing the
            address resets the merchant&apos;s USDT qualification and
            deposit-history window.
          </small>
        </label>
        <Button type="submit" variant="secondary" disabled={addressSaving}>
          {addressSaving
            ? "Saving…"
            : account.usdtAddress
              ? "Update address"
              : "Assign address"}
        </Button>
      </form>
    </div>
  )
}

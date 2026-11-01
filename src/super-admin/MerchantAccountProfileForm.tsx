import type { FormEvent } from "react"
import { Store } from "lucide-react"
import { Button } from "../AppPrimitives"
import type { AdminMerchantAccount } from "../lib/swiftpay"

export type EditableMerchantAccount = AdminMerchantAccount & {
  originalEmail: string
}

type MerchantAccountProfileFormProps = {
  merchant: EditableMerchantAccount
  saving: boolean
  onChange: (merchant: EditableMerchantAccount) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export default function MerchantAccountProfileForm({
  merchant,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: MerchantAccountProfileFormProps) {
  function updateField<K extends keyof EditableMerchantAccount>(
    field: K,
    value: EditableMerchantAccount[K],
  ) {
    onChange({ ...merchant, [field]: value })
  }

  return (
    <form className="admin-merchant-profile-form" onSubmit={onSubmit}>
      <div className="admin-card-heading">
        <span className="setting-icon">
          <Store size={19} />
        </span>
        <div>
          <h2>Edit merchant profile</h2>
          <p>
            Updating the login email requires the merchant to sign in again.
          </p>
        </div>
      </div>
      <label>
        <span>Merchant email / login</span>
        <input
          type="email"
          value={merchant.email}
          onChange={(event) => updateField("email", event.target.value)}
          required
          maxLength={254}
        />
      </label>
      <label>
        <span>Business or display name</span>
        <input
          value={merchant.businessName}
          onChange={(event) => updateField("businessName", event.target.value)}
          maxLength={160}
        />
      </label>
      <label>
        <span>Contact person</span>
        <input
          value={merchant.contactPerson}
          onChange={(event) => updateField("contactPerson", event.target.value)}
          maxLength={120}
        />
      </label>
      <label>
        <span>Phone number</span>
        <input
          type="tel"
          value={merchant.phoneNumber}
          onChange={(event) => updateField("phoneNumber", event.target.value)}
          maxLength={40}
        />
      </label>
      <label>
        <span>Business address</span>
        <textarea
          value={merchant.businessAddress}
          onChange={(event) =>
            updateField("businessAddress", event.target.value)
          }
          maxLength={500}
          rows={3}
        />
      </label>
      <div className="admin-profile-payout-heading">
        <strong>Saved payout account</strong>
        <small>
          Leave all fields blank to remove the saved payout account.
        </small>
      </div>
      <label>
        <span>Bank or wallet name</span>
        <input
          value={merchant.bankName}
          onChange={(event) => updateField("bankName", event.target.value)}
          maxLength={100}
        />
      </label>
      <label>
        <span>Account holder name</span>
        <input
          value={merchant.accountName}
          onChange={(event) => updateField("accountName", event.target.value)}
          maxLength={120}
        />
      </label>
      <label>
        <span>Account number</span>
        <input
          value={merchant.accountNumber}
          onChange={(event) => updateField("accountNumber", event.target.value)}
          maxLength={34}
          autoComplete="off"
        />
      </label>
      <div className="admin-transfer-request-actions">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save merchant profile"}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

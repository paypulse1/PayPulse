import { useEffect, useState } from "react"
import { Lock, LoaderCircle, Share2, Users } from "lucide-react"
import { Button } from "./AppPrimitives"
import {
  getMerchantDownline,
  setMerchantDownlineCommissionRate,
  type MerchantDownline,
} from "./lib/swiftpay"
import { APP_ROUTES } from "./lib/routes"

export function parseCommissionRate(rawRate: string | number | undefined) {
  const normalized = rawRate === undefined || rawRate === null ? "" : String(rawRate)
  const trimmed = normalized.trim()

  if (trimmed === "") {
    return {
      value: Number.NaN,
      error: "Enter a rate from 0% to 20% with at most two decimals.",
    }
  }

  const value = Number(trimmed)
  const isValid =
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 20 &&
    Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7

  return {
    value: isValid ? value : Number.NaN,
    error: isValid ? "" : "Enter a rate from 0% to 20% with at most two decimals.",
  }
}

function buildReferralLink(referralCode: string) {
  const referralLink = new URL(APP_ROUTES.merchantLogin, window.location.origin)
  referralLink.searchParams.set("ref", referralCode)
  return referralLink.toString()
}

function getReferralStatusClass(merchant: MerchantDownline["referrals"][number]) {
  if (merchant.registrationPending) return "merchant-downline-status is-pending"
  if (merchant.active) return "merchant-downline-status is-active"
  return "merchant-downline-status"
}

function getReferralStatusLabel(
  merchant: MerchantDownline["referrals"][number],
) {
  if (merchant.registrationPending) return "Pending review"
  if (merchant.active) return "Active"
  return "Disabled"
}

function DownlineLockedCard({ message }: { message?: string }) {
  return (
    <div className="merchant-downline-locked" role="status">
      <span className="merchant-downline-icon">
        <Lock size={19} />
      </span>
      <strong>Downline access is locked</strong>
      <p>
        {message ||
          "Complete merchant wallet activation to access your referral network."}
      </p>
      <small>
        Activation requires the PHP fee and at least 100 qualifying USDT in your
        assigned wallet.
      </small>
    </div>
  )
}

function ReferralHeader({
  referralCode,
  copyMessage,
  onCopy,
}: {
  referralCode: string
  copyMessage: string
  onCopy: () => void
}) {
  return (
    <section className="merchant-downline-referral">
      <div className="merchant-downline-referral-header">
        <div>
          <span>Your referral code</span>
          <strong>{referralCode}</strong>
        </div>
        <Button
          className="merchant-downline-copy-button"
          variant="secondary"
          icon={<Share2 size={15} />}
          onClick={() => void onCopy()}
        >
          Copy link
        </Button>
      </div>
      {copyMessage && (
        <small role="status" aria-live="polite">
          {copyMessage}
        </small>
      )}
    </section>
  )
}

function ReferralRow({
  merchant,
  rateDrafts,
  savingRateFor,
  rateMessages,
  onRateChange,
  onSaveRate,
}: {
  merchant: MerchantDownline["referrals"][number]
  rateDrafts: Record<string, string>
  savingRateFor: string
  rateMessages: Record<string, string>
  onRateChange: (email: string, nextValue: string) => void
  onSaveRate: (email: string) => void
}) {
  return (
    <article key={merchant.email}>
      <span className="merchant-downline-icon">
        <Users size={17} />
      </span>
      <div>
        <strong>{merchant.businessName || merchant.email}</strong>
        <small>{merchant.email}</small>
        <small>
          Joined {new Date(merchant.createdAt).toLocaleDateString("en-PH")}
        </small>
      </div>
      <span className={getReferralStatusClass(merchant)}>
        {getReferralStatusLabel(merchant)}
      </span>
      <div className="merchant-downline-rate">
        <label>
          <span>Collection commission</span>
          <span className="merchant-downline-rate-input">
            <input
              type="number"
              min="0"
              max="20"
              step="0.01"
              inputMode="decimal"
              aria-label={`Collection commission for ${merchant.email}`}
              value={rateDrafts[merchant.email] ?? "0"}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  onSaveRate(merchant.email)
                }
              }}
              onChange={(event) =>
                onRateChange(merchant.email, event.target.value)
              }
            />
            <span>%</span>
          </span>
        </label>
        <Button
          className="merchant-downline-save-button"
          variant="secondary"
          disabled={savingRateFor === merchant.email}
          onClick={() => onSaveRate(merchant.email)}
        >
          {savingRateFor === merchant.email ? "Saving…" : "Save rate"}
        </Button>
        {rateMessages[merchant.email] && (
          <small role="status" aria-live="polite">
            {rateMessages[merchant.email]}
          </small>
        )}
      </div>
    </article>
  )
}

export default function MerchantDownlineView({
  refreshVersion,
}: {
  refreshVersion: number
}) {
  const [downline, setDownline] = useState<MerchantDownline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [copyMessage, setCopyMessage] = useState("")
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({})
  const [savingRateFor, setSavingRateFor] = useState("")
  const [rateMessages, setRateMessages] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")

    getMerchantDownline()
      .then((result) => {
        if (!active) return
        setDownline(result)
        setRateDrafts(
          Object.fromEntries(
            result.referrals.map((merchant) => [
              merchant.email,
              String(merchant.commissionRate),
            ]),
          ),
        )
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setDownline(null)
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load your merchant downline.",
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [refreshVersion])

  async function copyReferralLink() {
    if (!downline?.referralCode) return

    try {
      await navigator.clipboard.writeText(buildReferralLink(downline.referralCode))
      setCopyMessage("Referral link copied.")
    } catch {
      setCopyMessage(
        "Could not copy the referral link. Share your code manually.",
      )
    }
  }

  async function saveCommissionRate(email: string) {
    const rawRate = rateDrafts[email]
    const { value: rate, error: rateError } = parseCommissionRate(rawRate)

    if (rateError) {
      setRateMessages((current) => ({
        ...current,
        [email]: rateError,
      }))
      return
    }

    setSavingRateFor(email)
    setRateMessages((current) => ({ ...current, [email]: "" }))

    try {
      const updated = await setMerchantDownlineCommissionRate(email, rate)
      setRateDrafts((current) => ({
        ...current,
        [email]: String(updated.commissionRate),
      }))
      setDownline((current) =>
        current
          ? {
              ...current,
              referrals: current.referrals.map((merchant) =>
                merchant.email === email
                  ? { ...merchant, commissionRate: updated.commissionRate }
                  : merchant,
              ),
            }
          : current,
      )
      setRateMessages((current) => ({ ...current, [email]: "Rate saved." }))
    } catch (saveError) {
      setRateMessages((current) => ({
        ...current,
        [email]:
          saveError instanceof Error
            ? saveError.message
            : "Could not save this commission rate.",
      }))
    } finally {
      setSavingRateFor("")
    }
  }

  return (
    <section className="merchant-downline-page" aria-label="Merchant downline">
      <header>
        <h2>Merchant downline</h2>
        <p>Track merchant accounts registered with your referral code.</p>
      </header>

      {loading ? (
        <div className="empty-state">
          <LoaderCircle className="spin" size={22} />
          <span>Loading your merchant downline…</span>
        </div>
      ) : error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : downline && !downline.enabled ? (
        <DownlineLockedCard message={downline.message ?? undefined} />
      ) : downline ? (
        <>
          <ReferralHeader
            referralCode={downline.referralCode ?? ""}
            copyMessage={copyMessage}
            onCopy={() => void copyReferralLink()}
          />

          <div className="merchant-downline-list-heading">
            <h3>Referred merchants</h3>
            <span>{downline.referrals.length}</span>
          </div>

          {downline.referrals.length ? (
            <div className="merchant-downline-list">
              {downline.referrals.map((merchant) => (
                <ReferralRow
                  key={merchant.email}
                  merchant={merchant}
                  rateDrafts={rateDrafts}
                  savingRateFor={savingRateFor}
                  rateMessages={rateMessages}
                  onRateChange={(email, nextValue) =>
                    setRateDrafts((current) => ({
                      ...current,
                      [email]: nextValue,
                    }))
                  }
                  onSaveRate={(email) => void saveCommissionRate(email)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Users size={21} />
              <span>No referred merchants yet.</span>
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}

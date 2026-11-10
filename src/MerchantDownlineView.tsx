import { useEffect, useState } from "react"
import { Lock, LoaderCircle, Share2, Users } from "lucide-react"
import { Button } from "./AppPrimitives"
import {
  getMerchantDownline,
  setMerchantDownlineCommissionRate,
  type MerchantDownline,
} from "./lib/swiftpay"
import { APP_ROUTES } from "./lib/routes"

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
        if (active) {
          setDownline(result)
          setRateDrafts(
            Object.fromEntries(
              result.referrals.map((merchant) => [
                merchant.email,
                String(merchant.commissionRate),
              ]),
            ),
          )
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setDownline(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your merchant downline.",
          )
        }
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
    const referralLink = new URL(
      APP_ROUTES.merchantLogin,
      window.location.origin,
    )
    referralLink.searchParams.set("ref", downline.referralCode)
    try {
      await navigator.clipboard.writeText(referralLink.toString())
      setCopyMessage("Referral link copied.")
    } catch {
      setCopyMessage(
        "Could not copy the referral link. Share your code manually.",
      )
    }
  }

  async function saveCommissionRate(email: string) {
    const rawRate = rateDrafts[email]
    const rate =
      rawRate === undefined || rawRate.trim() === ""
        ? Number.NaN
        : Number(rawRate)
    if (
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 20 ||
      Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-7
    ) {
      setRateMessages((current) => ({
        ...current,
        [email]: "Enter a rate from 0% to 20% with at most two decimals.",
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
        <div className="merchant-downline-locked" role="status">
          <span className="merchant-downline-icon">
            <Lock size={19} />
          </span>
          <strong>Downline access is locked</strong>
          <p>
            {downline.message ||
              "Complete merchant wallet activation to access your referral network."}
          </p>
          <small>
            Activation requires the PHP fee and at least 100 qualifying USDT in
            your assigned wallet.
          </small>
        </div>
      ) : downline ? (
        <>
          <section className="merchant-downline-referral">
            <div>
              <span>Your referral code</span>
              <strong>{downline.referralCode}</strong>
            </div>
            <Button
              variant="secondary"
              icon={<Share2 size={15} />}
              onClick={() => void copyReferralLink()}
            >
              Copy referral link
            </Button>
            {copyMessage && (
              <small role="status" aria-live="polite">
                {copyMessage}
              </small>
            )}
          </section>
          <div className="merchant-downline-list-heading">
            <h3>Referred merchants</h3>
            <span>{downline.referrals.length}</span>
          </div>
          {downline.referrals.length ? (
            <div className="merchant-downline-list">
              {downline.referrals.map((merchant) => (
                <article key={merchant.email}>
                  <span className="merchant-downline-icon">
                    <Users size={17} />
                  </span>
                  <div>
                    <strong>{merchant.businessName || merchant.email}</strong>
                    <small>{merchant.email}</small>
                    <small>
                      Joined{" "}
                      {new Date(merchant.createdAt).toLocaleDateString("en-PH")}
                    </small>
                  </div>
                  <span
                    className={
                      merchant.registrationPending
                        ? "merchant-downline-status is-pending"
                        : merchant.active
                          ? "merchant-downline-status is-active"
                          : "merchant-downline-status"
                    }
                  >
                    {merchant.registrationPending
                      ? "Pending review"
                      : merchant.active
                        ? "Active"
                        : "Disabled"}
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
                          onChange={(event) =>
                            setRateDrafts((current) => ({
                              ...current,
                              [merchant.email]: event.target.value,
                            }))
                          }
                        />
                        <span>%</span>
                      </span>
                    </label>
                    <Button
                      variant="secondary"
                      disabled={savingRateFor === merchant.email}
                      onClick={() => void saveCommissionRate(merchant.email)}
                    >
                      {savingRateFor === merchant.email
                        ? "Saving…"
                        : "Save rate"}
                    </Button>
                    {rateMessages[merchant.email] && (
                      <small role="status" aria-live="polite">
                        {rateMessages[merchant.email]}
                      </small>
                    )}
                  </div>
                </article>
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

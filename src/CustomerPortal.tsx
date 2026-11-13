import { useEffect, useState, type FormEvent } from "react"
import {
  getCustomerPaymentHistory,
  requestCustomerOtp,
  verifyCustomerOtp,
  type CustomerPaymentHistoryItem,
  type Session,
} from "./lib/swiftpay"

type CustomerPortalProps = {
  session: Session | null
  onAuthenticated: (session: Session) => void
  onSignOut: () => void
}

export default function CustomerPortal({
  session,
  onAuthenticated,
  onSignOut,
}: CustomerPortalProps) {
  const [email, setEmail] = useState(
    session?.role === "customer" ? session.email : "",
  )
  const [challengeId, setChallengeId] = useState("")
  const [code, setCode] = useState("")
  const [payments, setPayments] = useState<CustomerPaymentHistoryItem[]>([])
  const [busy, setBusy] = useState(false)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (session?.role !== "customer") {
      setPayments([])
      setHistoryBusy(false)
      return
    }
    let active = true
    setPayments([])
    setHistoryBusy(true)
    setError("")
    void getCustomerPaymentHistory()
      .then((items) => {
        if (active) setPayments(items)
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Payment history could not be loaded.",
          )
        }
      })
      .finally(() => {
        if (active) setHistoryBusy(false)
      })
    return () => {
      active = false
    }
  }, [session?.accessToken, session?.role])

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await requestCustomerOtp(email)
      setChallengeId(result.challengeId)
      setNotice(result.message)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "A sign-in code could not be sent.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const nextSession = await verifyCustomerOtp(email, challengeId, code)
      onAuthenticated(nextSession)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The code could not be verified.",
      )
    } finally {
      setBusy(false)
    }
  }

  if (session && session.role !== "customer") {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-800">
            DRPAY Customer
          </p>
          <h1 className="mt-3 text-2xl font-bold">Use a customer account</h1>
          <p className="mt-3 text-slate-600">
            Merchant and operations sessions cannot access customer payment
            history. Sign out before signing in with a customer email.
          </p>
          <button
            className="mt-6 rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white"
            onClick={onSignOut}
            type="button"
          >
            Sign out
          </button>
        </section>
      </main>
    )
  }

  if (session?.role === "customer") {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
        <section className="mx-auto max-w-2xl">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-blue-800">
                DRPAY Customer
              </p>
              <h1 className="mt-2 text-3xl font-bold">Payment history</h1>
              <p className="mt-2 text-sm text-slate-600">{session.email}</p>
            </div>
            <button
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
              onClick={onSignOut}
              type="button"
            >
              Sign out
            </button>
          </header>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm text-slate-600">
              Only checkouts addressed to this verified email are shown.
              Customer balances and money movement are not available.
            </p>
            {error && (
              <p
                className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
                role="alert"
              >
                {error}
              </p>
            )}
            {historyBusy ? (
              <p
                className="py-8 text-center text-sm text-slate-600"
                role="status"
              >
                Loading payment history…
              </p>
            ) : payments.length ? (
              <ul className="divide-y divide-slate-200">
                {payments.map((payment) => (
                  <li
                    className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                    key={payment.referenceNo}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{payment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {payment.referenceNo} ·{" "}
                        {new Date(payment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <span className="font-semibold">
                        {payment.currency} {payment.amount}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          payment.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {payment.status === "COMPLETED"
                          ? "Completed"
                          : "Pending"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-slate-600">
                No pending or completed checkouts were found for this email.
              </p>
            )}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-widest text-blue-800">
          DRPAY Customer
        </p>
        <h1 className="mt-3 text-3xl font-bold">View your payment history</h1>
        <p className="mt-3 text-slate-600">
          Verify your email to view pending and completed checkouts addressed to
          you. No customer balance or money movement is enabled.
        </p>
        {error && (
          <p
            className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
            role="status"
          >
            {notice}
          </p>
        )}
        {!challengeId ? (
          <form className="mt-6 space-y-4" onSubmit={sendCode}>
            <label
              className="block text-sm font-semibold"
              htmlFor="customer-email"
            >
              Email address
              <input
                autoComplete="email"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3"
                id="customer-email"
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <button
              className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              type="submit"
            >
              {busy ? "Sending…" : "Send sign-in code"}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={verifyCode}>
            <label
              className="block text-sm font-semibold"
              htmlFor="customer-code"
            >
              Six-digit email code
              <input
                autoComplete="one-time-code"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 tracking-widest"
                id="customer-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                pattern="[0-9]{6}"
                required
                value={code}
              />
            </label>
            <button
              className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
              disabled={busy || code.length !== 6}
              type="submit"
            >
              {busy ? "Verifying…" : "Verify and view history"}
            </button>
            <button
              className="w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                setChallengeId("")
                setCode("")
                setNotice("")
                setError("")
              }}
              type="button"
            >
              Use a different email
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

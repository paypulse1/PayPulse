import { useState, type FormEvent } from "react"
import { AlertCircle, LoaderCircle, Lock, ShieldCheck } from "lucide-react"
import { clearSession, login, type Session } from "./lib/swiftpay"
import { Brand, Button, PoweredByFooter } from "./AppPrimitives"

export default function OperationsSignIn({
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
        throw new Error("This account is not authorized to access this area.")
      }
      onAuthenticated(session)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sign-in failed.",
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
        <h1>DRPAY team sign in</h1>
        <p>Use your separately configured DRPAY team account.</p>
        <form onSubmit={submit}>
          <label>
            <span>Work email</span>
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
            {busy ? "Signing in…" : "Continue"}
          </Button>
        </form>
        <div className="auth-trust">
          <ShieldCheck size={16} />
          <span>
            Separate one-hour team session. Provider secrets and payment
            execution are not exposed here.
          </span>
        </div>
      </section>
      <PoweredByFooter />
    </main>
  )
}

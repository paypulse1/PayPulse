import { useEffect, useState, type FormEvent } from "react"
import {
  AlertCircle,
  LoaderCircle,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react"
import {
  acceptAdminInvitation,
  inspectAdminInvitation,
  login,
  setupAdminMfa,
  verifyAdminMfa,
  type AdminLoginChallenge,
  type Session,
} from "./lib/swiftpay"
import { Brand, Button, PoweredByFooter } from "./AppPrimitives"

type Stage = "credentials" | "invitation" | "setup" | "verify"

export default function OperationsSignIn({
  onAuthenticated,
}: {
  onAuthenticated: (session: Session) => void
}) {
  const [stage, setStage] = useState<Stage>("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [code, setCode] = useState("")
  const [challenge, setChallenge] = useState<AdminLoginChallenge | null>(null)
  const [inviteToken, setInviteToken] = useState("")
  const [inviteRole, setInviteRole] = useState("")
  const [secret, setSecret] = useState("")
  const [provisioningUri, setProvisioningUri] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const url = new URL(window.location.href)
    const token = url.searchParams.get("operations_invitation")
    if (!token) return
    setInviteToken(token)
    setStage("invitation")
    url.searchParams.delete("operations_invitation")
    window.history.replaceState({}, "", url)
    void inspectAdminInvitation(token)
      .then((invitation) => {
        setEmail(invitation.email)
        setInviteRole(invitation.role)
      })
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "This invitation is invalid or expired.",
        )
      })
  }, [])

  async function beginMfaSetup(nextChallenge: AdminLoginChallenge) {
    setChallenge(nextChallenge)
    const setup = await setupAdminMfa(nextChallenge.accessToken)
    setSecret(setup.secret)
    setProvisioningUri(setup.provisioningUri)
    setStage("setup")
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      if (stage === "credentials") {
        const result = await login(email.trim().toLowerCase(), password)
        if ("expiresAt" in result) {
          onAuthenticated(result)
        } else if (result.requiresMfaSetup) {
          await beginMfaSetup(result)
        } else {
          setChallenge(result)
          setStage("verify")
        }
      } else if (stage === "invitation") {
        if (password !== confirmation) {
          throw new Error("The passwords do not match.")
        }
        const result = await acceptAdminInvitation(inviteToken, password)
        setPassword("")
        setConfirmation("")
        await beginMfaSetup(result)
      } else if (stage === "setup" || stage === "verify") {
        if (!challenge) throw new Error("Your sign-in session has expired.")
        const session = await verifyAdminMfa(challenge.accessToken, code)
        onAuthenticated(session)
      }
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

  const heading =
    stage === "invitation"
      ? "Set up your team account"
      : stage === "setup"
        ? "Enable authenticator MFA"
        : stage === "verify"
          ? "Verify your sign-in"
          : "DRPAY team sign in"
  const description =
    stage === "invitation"
      ? `Create a password for your ${inviteRole || "operations"} account.`
      : stage === "setup"
        ? "Add this secret to your authenticator app, then enter its six-digit code."
        : stage === "verify"
          ? "Enter the current six-digit code from your authenticator app."
          : "Use your separately configured DRPAY team account."

  return (
    <main className="auth-screen auth-screen-with-footer">
      <div className="auth-brand">
        <Brand />
      </div>
      <section className="auth-card">
        <span className="auth-mark">
          {stage === "setup" || stage === "verify" ? (
            <Smartphone size={27} />
          ) : (
            <ShieldCheck size={27} />
          )}
        </span>
        <span className="eyebrow">
          {stage === "invitation" ? "STAFF INVITATION" : "RESTRICTED ACCESS"}
        </span>
        <h1>{heading}</h1>
        <p>{description}</p>
        {stage === "setup" && (
          <div className="auth-trust" style={{ wordBreak: "break-all" }}>
            <a href={provisioningUri}>Open in authenticator app</a>
            <span>Manual setup key: {secret}</span>
          </div>
        )}
        <form onSubmit={submit}>
          {(stage === "credentials" || stage === "invitation") && (
            <label>
              <span>Work email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                readOnly={stage === "invitation"}
                autoComplete="username"
                autoFocus
              />
            </label>
          )}
          {(stage === "credentials" || stage === "invitation") && (
            <label>
              <span>{stage === "invitation" ? "Create password" : "Password"}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={stage === "invitation" ? 12 : 1}
                autoComplete={
                  stage === "invitation" ? "new-password" : "current-password"
                }
              />
            </label>
          )}
          {stage === "invitation" && (
            <label>
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
          )}
          {(stage === "setup" || stage === "verify") && (
            <label>
              <span>Authenticator code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
              />
            </label>
          )}
          {error && (
            <div className="inline-error">
              <AlertCircle size={15} />
              {error}
            </div>
          )}
          <Button
            type="submit"
            disabled={
              busy ||
              (stage === "setup" && code.length !== 6) ||
              (stage === "verify" && code.length !== 6)
            }
            icon={
              busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Lock size={17} />
              )
            }
          >
            {busy
              ? "Please wait…"
              : stage === "setup"
                ? "Verify and enable MFA"
                : stage === "verify"
                  ? "Verify and continue"
                  : stage === "invitation"
                    ? "Create account"
                    : "Continue"}
          </Button>
        </form>
        <div className="auth-trust">
          <ShieldCheck size={16} />
          <span>
            Super-admin sign-in does not require TOTP. Other operations roles
            require authenticator verification.
          </span>
        </div>
      </section>
      <PoweredByFooter />
    </main>
  )
}

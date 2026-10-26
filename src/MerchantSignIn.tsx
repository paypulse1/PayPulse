import { useState, type FormEvent } from "react"
import {
  AlertCircle,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  Lock,
  ShieldCheck,
} from "lucide-react"
import {
  getLastMerchantEmail,
  hasTrustedDevice,
  loginWithBiometric,
  loginWithPin,
  requestDeviceOtp,
  verifyDeviceOtp,
  type Session,
} from "./lib/swiftpay"
import {
  hasBiometricLogin,
  readBiometricSecret,
  supportsBiometricLogin,
} from "./lib/biometric"
import { Brand, Button, PoweredByFooter } from "./AppPrimitives"

export default function MerchantSignIn({
  onAuthenticated,
}: {
  onAuthenticated: (session: Session) => void
}) {
  const [email, setEmail] = useState(() => getLastMerchantEmail())
  const [pin, setPin] = useState("")
  const [otp, setOtp] = useState("")
  const [challengeId, setChallengeId] = useState("")
  const [stage, setStage] = useState<"email" | "pin" | "otp">(() =>
    hasTrustedDevice(getLastMerchantEmail()) ? "pin" : "email",
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function sendOtp() {
    const normalizedEmail = email.trim().toLowerCase()
    setBusy(true)
    setError("")
    try {
      const response = await requestDeviceOtp(normalizedEmail)
      setChallengeId(response.challengeId)
      setStage("otp")
      setOtp("")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send a verification code.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitPin(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      onAuthenticated(await loginWithPin(email.trim().toLowerCase(), pin))
    } catch (requestError) {
      setPin("")
      setError(
        requestError instanceof Error ? requestError.message : "Sign-in failed",
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitBiometric() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return
    setBusy(true)
    setError("")
    try {
      const secret = await readBiometricSecret(normalizedEmail)
      onAuthenticated(await loginWithBiometric(normalizedEmail, secret))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Biometric sign-in failed. Use your MPIN or verify this device by email.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitOtp(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      onAuthenticated(
        await verifyDeviceOtp(email.trim().toLowerCase(), challengeId, otp),
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Device verification failed.",
      )
    } finally {
      setBusy(false)
    }
  }

  function continueWithEmail(event: FormEvent) {
    event.preventDefault()
    if (hasTrustedDevice(email.trim().toLowerCase())) setStage("pin")
    else void sendOtp()
  }

  return (
    <main className="auth-screen auth-screen-with-footer">
      <div className="auth-brand">
        <Brand />
      </div>
      <section className="auth-card">
        <span className="eyebrow">MERCHANT ACCESS</span>
        <h1>Welcome to DRPAY</h1>
        <p>
          {stage === "otp"
            ? "Enter the six-digit code sent to your merchant email to verify this device."
            : stage === "pin"
              ? "Enter your MPIN on this verified device."
              : "Use your MPIN on a verified device, or verify a new device by email."}
        </p>
        {stage === "email" && (
          <form onSubmit={continueWithEmail}>
            <label>
              <span>Merchant email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="merchant@company.ph"
                required
                autoComplete="username"
                autoFocus
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
              disabled={busy || !email}
              icon={
                busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Lock size={17} />
                )
              }
            >
              {busy
                ? "Continuing…"
                : hasTrustedDevice(email.trim().toLowerCase())
                  ? "Continue with MPIN"
                  : "Verify device by email"}
            </Button>
            {supportsBiometricLogin() &&
              email.trim() &&
              hasBiometricLogin(email) && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void submitBiometric()}
                  icon={<Fingerprint size={17} />}
                >
                  Sign in with biometrics
                </Button>
              )}
          </form>
        )}
        {stage === "pin" && (
          <form onSubmit={(event) => void submitPin(event)}>
            <label>
              <span>Merchant email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label>
              <span>Four-digit MPIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="one-time-code"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                required
                autoFocus
                aria-describedby={error ? "signin-error" : undefined}
              />
            </label>
            {error && (
              <div className="inline-error" id="signin-error" role="alert">
                <AlertCircle size={15} />
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={busy || pin.length !== 4}
              icon={
                busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <KeyRound size={17} />
                )
              }
            >
              {busy ? "Signing in…" : "Sign in with MPIN"}
            </Button>
            {supportsBiometricLogin() && hasBiometricLogin(email) && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void submitBiometric()}
                icon={<Fingerprint size={17} />}
              >
                Use biometrics instead
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void sendOtp()}
            >
              Forgot MPIN? Verify with email code
            </Button>
            <button
              type="button"
              className="authorization-back"
              disabled={busy}
              onClick={() => {
                setStage("email")
                setEmail("")
                setPin("")
                setError("")
              }}
            >
              Use a different email
            </button>
          </form>
        )}
        {stage === "otp" && (
          <form onSubmit={(event) => void submitOtp(event)}>
            <label>
              <span>Merchant email</span>
              <input type="email" value={email} readOnly />
            </label>
            <label>
              <span>Six-digit email code</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                autoFocus
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
              disabled={busy || otp.length !== 6}
              icon={
                busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <ShieldCheck size={17} />
                )
              }
            >
              {busy ? "Verifying…" : "Verify device"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void sendOtp()}
            >
              Send a new code
            </Button>
            <button
              type="button"
              className="authorization-back"
              disabled={busy}
              onClick={() => {
                setStage("email")
                setOtp("")
                setError("")
              }}
            >
              Back
            </button>
          </form>
        )}
        <div className="auth-trust">
          <ShieldCheck size={16} />
          <span>
            New devices require an email code. Previously verified devices use
            your MPIN or optional biometric sign-in. Sessions expire
            automatically after eight hours.
          </span>
        </div>
      </section>
      <PoweredByFooter />
    </main>
  )
}

import { useState, type FormEvent } from "react"
import { useEffect } from "react"
import { Capacitor } from "@capacitor/core"
import { browserSupportsPasskeys } from "@simplewebauthn/browser"
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
  createGoogleLoginChallenge,
  createTelegramLoginChallenge,
  getAuthProviderConfig,
  loginWithGoogleCredential,
  loginWithPasskey,
  loginWithBiometric,
  loginWithPin,
  loginWithTelegramToken,
  requestDeviceOtp,
  verifyDeviceOtp,
  type AuthProviderConfig,
  type Session,
} from "./lib/swiftpay"
import {
  hasBiometricLogin,
  readBiometricSecret,
  supportsBiometricLogin,
} from "./lib/biometric"
import { Brand, Button, PoweredByFooter } from "./AppPrimitives"
import MerchantRegistration from "./MerchantRegistration"
import {
  GoogleIdentityButton,
  TelegramIdentityButton,
} from "./AuthProviderButtons"

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
  const [registering, setRegistering] = useState(false)
  const [authProviderConfig, setAuthProviderConfig] =
    useState<AuthProviderConfig | null>(null)
  const [authProviderConfigError, setAuthProviderConfigError] = useState("")
  const [passkeysSupported, setPasskeysSupported] = useState(false)

  useEffect(() => {
    let active = true
    getAuthProviderConfig()
      .then((config) => {
        if (active) setAuthProviderConfig(config)
      })
      .catch((requestError: unknown) => {
        if (active)
          setAuthProviderConfigError(
            requestError instanceof Error
              ? requestError.message
              : "Additional sign-in methods are temporarily unavailable.",
          )
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void browserSupportsPasskeys()
      .then((supported) => {
        if (active) setPasskeysSupported(supported)
      })
      .catch(() => {
        if (active) setPasskeysSupported(false)
      })
    return () => {
      active = false
    }
  }, [])

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

  async function submitGoogleCredential(
    challengeId: string,
    credential: string,
  ) {
    setBusy(true)
    setError("")
    try {
      onAuthenticated(await loginWithGoogleCredential(challengeId, credential))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Google sign-in failed. Use your MPIN or email verification.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitTelegramToken(challengeId: string, idToken: string) {
    setBusy(true)
    setError("")
    try {
      onAuthenticated(await loginWithTelegramToken(challengeId, idToken))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Telegram sign-in failed. Use your MPIN or email verification.",
      )
      throw requestError
    } finally {
      setBusy(false)
    }
  }

  async function submitPasskey() {
    setBusy(true)
    setError("")
    try {
      onAuthenticated(await loginWithPasskey())
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Passkey sign-in failed. Use your MPIN or email verification.",
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

  if (registering) {
    return <MerchantRegistration onBack={() => setRegistering(false)} />
  }

  return (
    <main className="auth-screen auth-screen-with-footer auth-login-screen">
      <div className="auth-login-layout">
        <aside className="auth-login-aside">
          <span className="auth-login-kicker">
            <ShieldCheck size={15} />
            SECURE MERCHANT ACCESS
          </span>
          <div className="auth-login-aside-copy">
            <h2>
              Your payments,
              <br />
              <span>in good hands.</span>
            </h2>
            <p>
              A secure workspace to manage your merchant account and stay on top
              of every transaction.
            </p>
          </div>
          <div className="auth-login-benefits">
            <div>
              <span className="auth-login-benefit-icon">
                <Lock size={16} />
              </span>
              <span>
                <strong>Protected sign-in</strong>
                <small>MPIN on your verified devices</small>
              </span>
            </div>
            <div>
              <span className="auth-login-benefit-icon">
                <ShieldCheck size={16} />
              </span>
              <span>
                <strong>Device verification</strong>
                <small>Email code for new devices</small>
              </span>
            </div>
          </div>
          <span className="auth-login-glow" aria-hidden="true" />
        </aside>
        <div className="auth-login-panel">
          <div className="auth-brand">
            <Brand />
          </div>
          <section className="auth-card auth-login-card">
            <span className="eyebrow">MERCHANT PORTAL</span>
            <h1>
              {stage === "otp"
                ? "Verify your device"
                : stage === "pin"
                  ? "Welcome back"
                  : "Sign in to DRPAY"}
            </h1>
            <p>
              {stage === "otp"
                ? "Enter the six-digit code sent to your merchant email."
                : stage === "pin"
                  ? "Enter your MPIN to continue to your account."
                  : "Use your verified device or confirm your identity by email."}
            </p>
            <div className="auth-login-assurance">
              <ShieldCheck size={17} />
              <span>
                <strong>Your account, protected</strong>
              </span>
            </div>
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
                {authProviderConfigError && (
                  <p className="profile-info-note" role="status">
                    {authProviderConfigError}
                  </p>
                )}
                {!Capacitor.isNativePlatform() &&
                  authProviderConfig?.google &&
                  authProviderConfig.googleClientId && (
                    <GoogleIdentityButton
                      clientId={authProviderConfig.googleClientId}
                      disabled={busy}
                      createChallenge={createGoogleLoginChallenge}
                      onCredential={submitGoogleCredential}
                      onError={setError}
                    />
                  )}
                {!Capacitor.isNativePlatform() &&
                  authProviderConfig?.telegram &&
                  authProviderConfig.telegramClientId && (
                    <TelegramIdentityButton
                      clientId={authProviderConfig.telegramClientId}
                      disabled={busy}
                      createChallenge={createTelegramLoginChallenge}
                      onToken={submitTelegramToken}
                      onError={setError}
                    />
                  )}
                {!Capacitor.isNativePlatform() &&
                  authProviderConfig?.passkeys &&
                  passkeysSupported && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void submitPasskey()}
                      icon={<Fingerprint size={17} />}
                    >
                      Sign in with passkey
                    </Button>
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
            {stage === "email" && (
              <button
                type="button"
                className="auth-registration-link"
                onClick={() => setRegistering(true)}
              >
                New to DRPAY? <strong>Create a merchant account</strong>
              </button>
            )}
            <div className="auth-trust">
              <Lock size={15} />
              <span>DO NOT SHARE YOUR MPIN</span>
            </div>
          </section>
          <PoweredByFooter />
        </div>
      </div>
    </main>
  )
}

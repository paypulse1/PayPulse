import { useEffect, useState, type FormEvent } from "react"
import { Capacitor } from "@capacitor/core"
import { browserSupportsPasskeys } from "@simplewebauthn/browser"
import { Lock, ShieldCheck } from "lucide-react"
import {
  getLastMerchantEmail,
  hasTrustedDevice,
  getAuthProviderConfig,
  completeProviderLoginWithBiometric,
  completeProviderLoginWithPin,
  loginWithGoogleCredential,
  loginWithPasskey,
  loginWithBiometric,
  loginWithPin,
  loginWithTelegramToken,
  requestDeviceOtp,
  verifyDeviceOtp,
  type AuthProviderConfig,
  type LoginProvider,
  type Session,
} from "./lib/swiftpay"
import {
  hasBiometricLogin,
  readBiometricSecret,
  supportsBiometricLogin,
} from "./lib/biometric"
import { Button } from "./AppPrimitives"
import MerchantRegistration from "./MerchantRegistration"
import MerchantAuthLayout from "./MerchantAuthLayout"
import {
  EmailSignInStage,
  OtpSignInStage,
  PinSignInStage,
} from "./MerchantSignInStages"

export default function MerchantSignIn({
  onAuthenticated,
}: {
  onAuthenticated: (session: Session) => void
}) {
  const [email, setEmail] = useState(() => getLastMerchantEmail())
  const [pin, setPin] = useState("")
  const [otp, setOtp] = useState("")
  const [challengeId, setChallengeId] = useState("")
  const [providerStepUp, setProviderStepUp] = useState<{
    provider: LoginProvider
    challengeId: string
    email: string
  } | null>(null)
  const [stage, setStage] = useState<"email" | "pin" | "otp">(() =>
    hasTrustedDevice(getLastMerchantEmail()) ? "pin" : "email",
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [registering, setRegistering] = useState(() =>
    Boolean(new URLSearchParams(window.location.search).get("ref")),
  )
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
    setProviderStepUp(null)
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
      const normalizedEmail = email.trim().toLowerCase()
      const session = providerStepUp
        ? await completeProviderLoginWithPin(
            providerStepUp.email,
            providerStepUp.provider,
            providerStepUp.challengeId,
            pin,
          )
        : await loginWithPin(normalizedEmail, pin)
      onAuthenticated(session)
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
      const session = providerStepUp
        ? await completeProviderLoginWithBiometric(
            providerStepUp.email,
            providerStepUp.provider,
            providerStepUp.challengeId,
            secret,
          )
        : await loginWithBiometric(normalizedEmail, secret)
      onAuthenticated(session)
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
      const result = await loginWithGoogleCredential(challengeId, credential)
      if ("session" in result) {
        onAuthenticated(result.session)
        return
      }
      setEmail(result.stepUp.email)
      setPin("")
      setProviderStepUp({
        provider: "google",
        challengeId: result.stepUp.challengeId,
        email: result.stepUp.email,
      })
      setStage("pin")
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
      const result = await loginWithTelegramToken(challengeId, idToken)
      if ("session" in result) {
        onAuthenticated(result.session)
        return
      }
      setEmail(result.stepUp.email)
      setPin("")
      setProviderStepUp({
        provider: "telegram",
        challengeId: result.stepUp.challengeId,
        email: result.stepUp.email,
      })
      setStage("pin")
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
      const result = await loginWithPasskey()
      if ("session" in result) {
        onAuthenticated(result.session)
        return
      }
      setEmail(result.stepUp.email)
      setPin("")
      setProviderStepUp({
        provider: "passkey",
        challengeId: result.stepUp.challengeId,
        email: result.stepUp.email,
      })
      setStage("pin")
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
      const session = await verifyDeviceOtp(
        email.trim().toLowerCase(),
        challengeId,
        otp,
      )
      if (session) onAuthenticated(session)
      else {
        setPin("")
        setStage("pin")
      }
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
    <MerchantAuthLayout
      kicker="SECURE MERCHANT ACCESS"
      kickerIcon={<ShieldCheck size={15} />}
      headline={
        <>
          Your payments,
          <br />
          <span>in good hands.</span>
        </>
      }
      description="A secure workspace to manage your merchant account and stay on top of every transaction."
      benefits={[
        {
          icon: <Lock size={16} />,
          title: "Second-factor sign-in",
          description: "MPIN or biometrics after identity verification",
        },
        {
          icon: <ShieldCheck size={16} />,
          title: "Device verification",
          description: "Google, Telegram, passkey, or email code",
        },
      ]}
      eyebrow="MERCHANT PORTAL"
    >
      <h1>
        {stage === "otp"
          ? "Verify your device"
          : stage === "pin"
            ? providerStepUp
              ? "Identity verified"
              : "Welcome back"
            : "Sign in to DRPAY"}
      </h1>
      <p>
        {stage === "otp"
          ? "Enter the six-digit code sent to your merchant email."
          : stage === "pin"
            ? providerStepUp
              ? "Enter your MPIN or use biometrics to finish signing in."
              : "Enter your MPIN to continue to your account."
            : "Verify with Google, Telegram, a passkey, or an email code."}
      </p>
      <div className="auth-login-assurance">
        <ShieldCheck size={17} />
        <span>
          <strong>Your account, protected</strong>
        </span>
      </div>
      {stage === "email" && (
        <EmailSignInStage
          busy={busy}
          email={email}
          error={error}
          onEmailChange={setEmail}
          onContinue={continueWithEmail}
          authProviderConfig={authProviderConfig}
          authProviderConfigError={authProviderConfigError}
          passkeysSupported={passkeysSupported}
          onPasskey={() => void submitPasskey()}
          onGoogleCredential={submitGoogleCredential}
          onTelegramToken={submitTelegramToken}
          onError={setError}
        />
      )}
      {stage === "pin" && (
        <PinSignInStage
          busy={busy}
          email={email}
          error={error}
          onEmailChange={setEmail}
          onBiometric={() => void submitBiometric()}
          authProviderConfig={authProviderConfig}
          authProviderConfigError={authProviderConfigError}
          passkeysSupported={passkeysSupported}
          onPasskey={() => void submitPasskey()}
          onGoogleCredential={submitGoogleCredential}
          onTelegramToken={submitTelegramToken}
          onError={setError}
          providerVerified={Boolean(providerStepUp)}
          emailReadOnly={Boolean(providerStepUp)}
          pin={pin}
          onPinChange={setPin}
          onSubmit={(event) => void submitPin(event)}
          onForgotPin={() => void sendOtp()}
          onUseDifferentEmail={() => {
            setStage("email")
            setProviderStepUp(null)
            setEmail("")
            setPin("")
            setError("")
          }}
        />
      )}
      {stage === "otp" && (
        <OtpSignInStage
          busy={busy}
          email={email}
          error={error}
          otp={otp}
          onOtpChange={setOtp}
          onSubmit={(event) => void submitOtp(event)}
          onResend={() => void sendOtp()}
          onBack={() => {
            setProviderStepUp(null)
            setStage("email")
            setOtp("")
            setError("")
          }}
        />
      )}
      {stage === "email" && (
        <>
          <button
            type="button"
            className="auth-registration-link"
            onClick={() => setRegistering(true)}
          >
            New to DRPAY? <strong>Start merchant registration</strong>
          </button>
          <p className="auth-registration-note">
            Sign in once merchant access is approved and enabled.
          </p>
        </>
      )}
      <div className="auth-trust">
        <Lock size={15} />
        <span>DO NOT SHARE YOUR MPIN</span>
      </div>
    </MerchantAuthLayout>
  )
}

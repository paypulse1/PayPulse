import type { FormEvent } from "react"
import { Capacitor } from "@capacitor/core"
import {
  AlertCircle,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  Lock,
  ShieldCheck,
} from "lucide-react"
import { Button } from "./AppPrimitives"
import {
  createGoogleLoginChallenge,
  createTelegramLoginChallenge,
  hasTrustedDevice,
  type AuthProviderConfig,
} from "./lib/swiftpay"
import { hasBiometricLogin, supportsBiometricLogin } from "./lib/biometric"
import {
  GoogleIdentityButton,
  TelegramIdentityButton,
} from "./AuthProviderButtons"

type StageProps = {
  busy: boolean
  email: string
  error: string
  onEmailChange: (email: string) => void
  onBiometric: () => void
}

export function EmailSignInStage({
  busy,
  email,
  error,
  onEmailChange,
  onBiometric,
  onContinue,
  authProviderConfig,
  authProviderConfigError,
  passkeysSupported,
  onPasskey,
  onGoogleCredential,
  onTelegramToken,
  onError,
}: StageProps & {
  onContinue: (event: FormEvent) => void
  authProviderConfig: AuthProviderConfig | null
  authProviderConfigError: string
  passkeysSupported: boolean
  onPasskey: () => void
  onGoogleCredential: (challengeId: string, credential: string) => Promise<void>
  onTelegramToken: (challengeId: string, idToken: string) => Promise<void>
  onError: (message: string) => void
}) {
  return (
    <form onSubmit={onContinue}>
      <label>
        <span>Merchant email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="merchant@company.ph"
          required
          autoComplete="username"
          autoFocus
        />
      </label>
      {error && <InlineError message={error} />}
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
            onCredential={onGoogleCredential}
            onError={onError}
          />
        )}
      {!Capacitor.isNativePlatform() &&
        authProviderConfig?.telegram &&
        authProviderConfig.telegramClientId && (
          <TelegramIdentityButton
            clientId={authProviderConfig.telegramClientId}
            disabled={busy}
            createChallenge={createTelegramLoginChallenge}
            onToken={onTelegramToken}
            onError={onError}
          />
        )}
      {!Capacitor.isNativePlatform() &&
        authProviderConfig?.passkeys &&
        passkeysSupported && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onPasskey}
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
      {supportsBiometricLogin() && email.trim() && hasBiometricLogin(email) && (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onBiometric}
          icon={<Fingerprint size={17} />}
        >
          Sign in with biometrics
        </Button>
      )}
    </form>
  )
}

export function PinSignInStage({
  busy,
  email,
  error,
  onEmailChange,
  onBiometric,
  showPasskey,
  onPasskey,
  pin,
  onPinChange,
  onSubmit,
  onForgotPin,
  onUseDifferentEmail,
}: StageProps & {
  pin: string
  showPasskey: boolean
  onPasskey: () => void
  onPinChange: (pin: string) => void
  onSubmit: (event: FormEvent) => void
  onForgotPin: () => void
  onUseDifferentEmail: () => void
}) {
  return (
    <form onSubmit={onSubmit}>
      <label>
        <span>Merchant email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
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
            onPinChange(event.target.value.replace(/\D/g, "").slice(0, 4))
          }
          required
          autoFocus
          aria-describedby={error ? "signin-error" : undefined}
        />
      </label>
      {error && <InlineError id="signin-error" message={error} />}
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
      {showPasskey && (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onPasskey}
          icon={<Fingerprint size={17} />}
        >
          Sign in with passkey
        </Button>
      )}
      {supportsBiometricLogin() && hasBiometricLogin(email) && (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onBiometric}
          icon={<Fingerprint size={17} />}
        >
          Use biometrics instead
        </Button>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={onForgotPin}
      >
        Forgot MPIN? Verify with email code
      </Button>
      <button
        type="button"
        className="authorization-back"
        disabled={busy}
        onClick={onUseDifferentEmail}
      >
        Use a different email
      </button>
    </form>
  )
}

export function OtpSignInStage({
  busy,
  email,
  error,
  otp,
  onOtpChange,
  onSubmit,
  onResend,
  onBack,
}: Pick<StageProps, "busy" | "email" | "error"> & {
  otp: string
  onOtpChange: (otp: string) => void
  onSubmit: (event: FormEvent) => void
  onResend: () => void
  onBack: () => void
}) {
  return (
    <form onSubmit={onSubmit}>
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
            onOtpChange(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          required
          autoFocus
        />
      </label>
      {error && <InlineError message={error} />}
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
        onClick={onResend}
      >
        Send a new code
      </Button>
      <button
        type="button"
        className="authorization-back"
        disabled={busy}
        onClick={onBack}
      >
        Back
      </button>
    </form>
  )
}

type InlineErrorProps = {
  id?: string
  message: string
}

function InlineError({ id, message }: InlineErrorProps) {
  return (
    <div className="inline-error" id={id} role="alert">
      <AlertCircle size={15} />
      {message}
    </div>
  )
}

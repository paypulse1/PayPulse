import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "./AppPrimitives"
import MerchantAuthLayout from "./MerchantAuthLayout"
import { APP_ROUTES } from "./lib/routes"
import {
  startMerchantRegistrationSumsubVerification,
  type SumsubKybStatus,
} from "./lib/swiftpay"
import {
  registrationStageCopy,
  useMerchantRegistration,
  type RegistrationStage,
} from "./useMerchantRegistration"

const sumsubStatusLabels: Record<SumsubKybStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "Submitted — waiting for Sumsub review",
  ON_HOLD: "Additional review in progress",
  RESUBMISSION_REQUIRED: "More information is required",
  APPROVED: "Sumsub checks passed",
  REJECTED: "Unable to verify — contact DRPAY support",
}

const registrationStageTitles: Record<Exclude<RegistrationStage, "submitted">, string> =
  {
    contact: "Create your account",
    verify: "Verify your email",
    owner: "Owner information",
    business: "Business information",
    payout: "Payout account",
    security: "Create your MPIN",
    verification: "Verify your business",
  }

type RegistrationProgressStep = {
  id: string
  label: string
}

function RegistrationProgress({
  stages,
  progressIndex,
}: {
  stages: RegistrationProgressStep[]
  progressIndex: number
}) {
  return (
    <div
      className="registration-progress"
      aria-label={`Step ${progressIndex + 1} of ${stages.length}`}
      style={{
        gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
      }}
    >
      {stages.map((item, index) => (
        <span
          key={item.id}
          className={
            index === progressIndex
              ? "current"
              : index < progressIndex
                ? "complete"
                : ""
          }
          aria-current={index === progressIndex ? "step" : undefined}
          title={item.label}
        >
          <b>{index < progressIndex ? "✓" : index + 1}</b>
          <small>{item.label}</small>
        </span>
      ))}
    </div>
  )
}

function RegistrationComplete({
  email,
  onBack,
}: {
  email: string
  onBack: () => void
}) {
  return (
    <div className="registration-complete">
      <span className="registration-complete-icon">
        <CheckCircle2 size={26} />
      </span>
      <h1>Registration submitted</h1>
      <RegistrationProgress
        stages={[
          { id: "registration", label: "Registration" },
          { id: "approval", label: "Access approval" },
          { id: "sign-in", label: "Sign in" },
        ]}
        progressIndex={1}
      />
      <p>
        Your verification has been submitted. DRPAY will review your
        application separately and email <strong>{email}</strong> when merchant
        access is ready.
      </p>
      <div className="registration-review-note">
        <ShieldCheck size={17} />
        <span>
          <strong>Access approval</strong>
          <small>Sign in after you receive the access-ready email.</small>
        </span>
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={onBack}
        icon={<ArrowLeft size={17} />}
      >
        Return to sign in
      </Button>
    </div>
  )
}

export default function MerchantRegistration({
  onBack,
}: {
  onBack: () => void
}) {
  const sdkContainerRef = useRef<HTMLDivElement | null>(null)
  const sdkInstanceRef = useRef<{ destroy: () => void } | null>(null)
  const [consent, setConsent] = useState(false)
  const [sdkVisible, setSdkVisible] = useState(false)
  const [verificationBusy, setVerificationBusy] = useState(false)
  const [verificationError, setVerificationError] = useState("")
  const [verificationNotice, setVerificationNotice] = useState("")
  const {
    application,
    busy,
    challengeId,
    code,
    confirmPin,
    contact,
    error,
    nextStage,
    pin,
    progressIndex,
    requestCode,
    sendCode,
    setCode,
    setConfirmPin,
    setPin,
    stage,
    stages,
    sumsubReviewStatus,
    submitSecurity,
    submitApplication,
    updateApplication,
    updateContact,
    verifyCode,
    refreshSumsubStatus,
    maximumOwnerDateOfBirth,
  } = useMerchantRegistration()

  useEffect(
    () => () => {
      sdkInstanceRef.current?.destroy()
    },
    [],
  )

  const startVerification = async () => {
    if (!consent) {
      setVerificationError(
        "Please review and accept the verification consent first.",
      )
      return
    }
    setVerificationBusy(true)
    setVerificationError("")
    setVerificationNotice("")
    try {
      const details = {
        ...application,
        ownerEmail: application.ownerEmail || contact.email,
        ownerPhone: application.ownerPhone || contact.phoneNumber,
      }
      const { accessToken } = await startMerchantRegistrationSumsubVerification(
        {
          email: contact.email.trim().toLowerCase(),
          challengeId,
          details,
          consent: true,
        },
      )
      await refreshSumsubStatus()
      const { default: snsWebSdk } = await import("@sumsub/websdk")
      sdkInstanceRef.current?.destroy()
      const instance = snsWebSdk
        .init(accessToken, async () => {
          const refreshed = await startMerchantRegistrationSumsubVerification({
            email: contact.email.trim().toLowerCase(),
            challengeId,
            details,
            consent: true,
          })
          return refreshed.accessToken
        })
        .withConf({ lang: "en", theme: "light" })
        .withOptions({ addViewportTag: false, adaptIframeHeight: true })
        .on("idCheck.onApplicantSubmitted", () => {
          setVerificationNotice(
            "Your verification was submitted. Refresh the status for the latest provider update.",
          )
          void refreshSumsubStatus().catch((statusError) => {
            setVerificationError(
              statusError instanceof Error
                ? statusError.message
                : "Could not refresh Sumsub status.",
            )
          })
        })
        .on("idCheck.onError", () => {
          setVerificationError(
            "Sumsub verification could not continue. Please retry or contact DRPAY support.",
          )
        })
        .build()
      sdkInstanceRef.current = instance
      setSdkVisible(true)
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      if (!sdkContainerRef.current) {
        throw new Error("The Sumsub verification panel could not be opened.")
      }
      instance.launch(sdkContainerRef.current)
    } catch (startError) {
      setVerificationError(
        startError instanceof Error
          ? startError.message
          : "Could not start Sumsub verification.",
      )
    } finally {
      setVerificationBusy(false)
    }
  }

  return (
    <MerchantAuthLayout
      registration
      kicker="DRPAY MERCHANT REGISTRATION"
      kickerIcon={<ShieldCheck size={15} />}
      headline={
        <>
          Business starts
          <br />
          <span>with trust.</span>
        </>
      }
      description="Set up your merchant profile with secure verification and dedicated application review."
      benefits={[
        {
          icon: <Mail size={16} />,
          title: "Verified contact",
          description: "Confirm your email before continuing",
        },
        {
          icon: <ShieldCheck size={16} />,
          title: "Business verification",
          description: "Verify your business and owners with Sumsub",
        },
      ]}
      eyebrow="MERCHANT ACCOUNT"
      cardClassName="merchant-registration-card"
    >
      {stage === "submitted" ? (
        <RegistrationComplete email={contact.email} onBack={onBack} />
      ) : (
        <>
          <h1>{registrationStageTitles[stage]}</h1>
          <p>{registrationStageCopy[stage]}</p>
          <RegistrationProgress stages={stages} progressIndex={progressIndex} />

          {stage === "contact" && (
            <form onSubmit={(event) => void requestCode(event)}>
              <label>
                <span>Mobile number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={contact.phoneNumber}
                  onChange={(event) =>
                    updateContact("phoneNumber", event.target.value)
                  }
                  placeholder="+63 9XX XXX XXXX"
                  maxLength={40}
                  autoComplete="tel"
                  required
                />
              </label>
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={contact.email}
                  onChange={(event) =>
                    updateContact("email", event.target.value)
                  }
                  placeholder="you@business.com"
                  maxLength={254}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                <span>Referral code (optional)</span>
                <input
                  type="text"
                  value={contact.referralCode}
                  onChange={(event) =>
                    updateContact("referralCode", event.target.value)
                  }
                  placeholder="16-character code"
                  maxLength={16}
                  pattern="[A-Z0-9]{16}"
                  title="Enter a 16-character referral code using letters and numbers."
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <small className="registration-step-hint">
                Enter the code from the DRPAY merchant who referred you.
              </small>
              <small className="registration-step-hint">
                A verification code will be sent to your email.
              </small>
              {error && (
                <div className="inline-error" role="alert">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                disabled={busy}
                icon={
                  busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )
                }
              >
                {busy ? "Sending code…" : "Continue"}
              </Button>
              <button
                type="button"
                className="authorization-back"
                disabled={busy}
                onClick={onBack}
              >
                Already registered? Sign in
              </button>
            </form>
          )}

          {stage === "verify" && (
            <form onSubmit={(event) => void verifyCode(event)}>
              <label>
                <span>Six-digit email code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  autoFocus
                  required
                />
              </label>
              {error && (
                <div className="inline-error" role="alert">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                disabled={busy || code.length !== 6}
                icon={
                  busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ShieldCheck size={17} />
                  )
                }
              >
                {busy ? "Verifying…" : "Verify and continue"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void sendCode()}
              >
                Send a new code
              </Button>
              <button
                type="button"
                className="authorization-back"
                disabled={busy}
                onClick={() => nextStage("contact")}
              >
                Change email or mobile number
              </button>
            </form>
          )}

          {stage === "owner" && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                nextStage("business")
              }}
            >
              <label>
                <span>Full legal name</span>
                <input
                  value={application.ownerFullName}
                  onChange={(event) =>
                    updateApplication("ownerFullName", event.target.value)
                  }
                  autoComplete="name"
                  maxLength={200}
                  required
                />
              </label>
              <label>
                <span>Date of birth</span>
                <input
                  type="date"
                  value={application.ownerDateOfBirth}
                  max={maximumOwnerDateOfBirth}
                  onChange={(event) =>
                    updateApplication("ownerDateOfBirth", event.target.value)
                  }
                  autoComplete="bday"
                  required
                />
              </label>
              <label>
                <span>Nationality</span>
                <input
                  value={application.ownerNationality}
                  onChange={(event) =>
                    updateApplication("ownerNationality", event.target.value)
                  }
                  autoComplete="country-name"
                  maxLength={200}
                  required
                />
              </label>
              <label>
                <span>Owner email</span>
                <input
                  type="email"
                  value={application.ownerEmail || contact.email}
                  onChange={(event) =>
                    updateApplication("ownerEmail", event.target.value)
                  }
                  autoComplete="email"
                  maxLength={200}
                  required
                />
              </label>
              <label>
                <span>Owner mobile number</span>
                <input
                  type="tel"
                  value={application.ownerPhone || contact.phoneNumber}
                  onChange={(event) =>
                    updateApplication("ownerPhone", event.target.value)
                  }
                  autoComplete="tel"
                  maxLength={40}
                  required
                />
              </label>
              {error && (
                <div className="inline-error" role="alert">
                  {error}
                </div>
              )}
              <Button type="submit" icon={<ArrowRight size={17} />}>
                Continue
              </Button>
              <button
                type="button"
                className="authorization-back"
                onClick={() => nextStage("contact")}
              >
                Back to contact details
              </button>
            </form>
          )}

          {stage === "business" && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                nextStage("payout")
              }}
            >
              <label>
                <span>Legal business name</span>
                <input
                  value={application.businessName}
                  onChange={(event) =>
                    updateApplication("businessName", event.target.value)
                  }
                  autoComplete="organization"
                  maxLength={160}
                  required
                />
              </label>
              <label>
                <span>Business type</span>
                <select
                  value={application.businessType}
                  onChange={(event) =>
                    updateApplication("businessType", event.target.value)
                  }
                  required
                >
                  <option value="">Select business type</option>
                  <option>Corporation</option>
                  <option>Partnership</option>
                  <option>Sole proprietor</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                <span>Registration number</span>
                <input
                  value={application.registrationNumber}
                  onChange={(event) =>
                    updateApplication("registrationNumber", event.target.value)
                  }
                  maxLength={200}
                  required
                />
              </label>
              <label>
                <span>Country</span>
                <input
                  value={application.country}
                  onChange={(event) =>
                    updateApplication("country", event.target.value)
                  }
                  maxLength={200}
                  required
                />
              </label>
              <label>
                <span>Registered business address</span>
                <textarea
                  value={application.businessAddress}
                  onChange={(event) =>
                    updateApplication("businessAddress", event.target.value)
                  }
                  autoComplete="street-address"
                  maxLength={200}
                  rows={3}
                  required
                />
              </label>
              <label>
                <span>Primary business contact</span>
                <input
                  value={application.contactPerson}
                  onChange={(event) =>
                    updateApplication("contactPerson", event.target.value)
                  }
                  maxLength={120}
                  required
                />
              </label>
              <Button type="submit" icon={<ArrowRight size={17} />}>
                Continue
              </Button>
              <button
                type="button"
                className="authorization-back"
                onClick={() => nextStage("owner")}
              >
                Back
              </button>
            </form>
          )}

          {stage === "payout" && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                nextStage("security")
              }}
            >
              <label>
                <span>Bank name</span>
                <input
                  value={application.bankName}
                  onChange={(event) =>
                    updateApplication("bankName", event.target.value)
                  }
                  autoComplete="off"
                  maxLength={100}
                  required
                />
              </label>
              <label>
                <span>Account holder name</span>
                <input
                  value={application.accountName}
                  onChange={(event) =>
                    updateApplication("accountName", event.target.value)
                  }
                  autoComplete="cc-name"
                  maxLength={120}
                  required
                />
              </label>
              <label>
                <span>Bank account number</span>
                <input
                  value={application.accountNumber}
                  onChange={(event) =>
                    updateApplication("accountNumber", event.target.value)
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={34}
                  required
                />
              </label>
              <small className="registration-step-hint">
                Use an account held by the registered business or its authorized
                owner.
              </small>
              <Button type="submit" icon={<ArrowRight size={17} />}>
                Continue
              </Button>
              <button
                type="button"
                className="authorization-back"
                onClick={() => nextStage("business")}
              >
                Back
              </button>
            </form>
          )}

          {stage === "security" && (
            <form onSubmit={submitSecurity}>
              <label>
                <span>Four-digit MPIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  autoComplete="new-password"
                  value={pin}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  required
                />
              </label>
              <label>
                <span>Confirm MPIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  autoComplete="new-password"
                  value={confirmPin}
                  onChange={(event) =>
                    setConfirmPin(
                      event.target.value.replace(/\D/g, "").slice(0, 4),
                    )
                  }
                  required
                />
              </label>
              {error && (
                <div className="inline-error" role="alert">
                  {error}
                </div>
              )}
              <small className="registration-step-hint">
                Keep your MPIN private. It will be stored as a secure hash, not
                as plain text.
              </small>
              <Button type="submit" icon={<ArrowRight size={17} />}>
                Continue
              </Button>
              <button
                type="button"
                className="authorization-back"
                onClick={() => nextStage("payout")}
              >
                Back
              </button>
            </form>
          )}

          {stage === "verification" && (
            <form onSubmit={(event) => void submitApplication(event)}>
              <p className="registration-document-note">
                Sumsub will guide you through the checks enabled for your
                business, including documents and owner identity checks. DRPAY
                reviews your application separately before account access.
              </p>
              <div className="sumsub-verification">
                <div className="sumsub-verification-heading">
                  <ShieldCheck size={18} />
                  <span>
                    <strong>Secure business verification</strong>
                    <small>
                      Powered by Sumsub; DRPAY receives the verification result.
                    </small>
                  </span>
                </div>
                <label className="sumsub-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    I consent to DRPAY and Sumsub processing the business,
                    beneficial-owner, identity, and biometric data required for
                    verification. See the{" "}
                    <a
                      href={APP_ROUTES.privacy}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
                <div
                  className={`kyb-status status-${sumsubReviewStatus.toLowerCase()}`}
                  role="status"
                >
                  {sumsubStatusLabels[sumsubReviewStatus]}
                </div>
                {verificationNotice && (
                  <p className="registration-step-hint" role="status">
                    {verificationNotice}
                  </p>
                )}
                {verificationError && (
                  <div className="inline-error" role="alert">
                    {verificationError}
                  </div>
                )}
                <div className="sumsub-verification-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      verificationBusy ||
                      ["APPROVED", "REJECTED", "IN_REVIEW", "ON_HOLD"].includes(
                        sumsubReviewStatus,
                      )
                    }
                    onClick={() => void startVerification()}
                    icon={
                      verificationBusy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ArrowRight size={16} />
                      )
                    }
                  >
                    {verificationBusy
                      ? "Connecting to Sumsub…"
                      : sumsubReviewStatus === "RESUBMISSION_REQUIRED"
                        ? "Continue verification"
                        : "Start verification"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || verificationBusy}
                    onClick={() => {
                      setVerificationError("")
                      void refreshSumsubStatus().catch((statusError) => {
                        setVerificationError(
                          statusError instanceof Error
                            ? statusError.message
                            : "Could not refresh Sumsub status.",
                        )
                      })
                    }}
                  >
                    Refresh status
                  </Button>
                </div>
                {sdkVisible && (
                  <div
                    ref={sdkContainerRef}
                    className="sumsub-sdk-container"
                    aria-label="Sumsub verification"
                  />
                )}
              </div>
              {error && (
                <div className="inline-error" role="alert">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                disabled={
                  busy ||
                  verificationBusy ||
                  !["IN_REVIEW", "ON_HOLD", "APPROVED"].includes(
                    sumsubReviewStatus,
                  )
                }
                icon={
                  busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <CheckCircle2 size={17} />
                  )
                }
              >
                {busy ? "Submitting…" : "Submit application"}
              </Button>
              <button
                type="button"
                className="authorization-back"
                onClick={() => nextStage("security")}
              >
                Back
              </button>
            </form>
          )}
        </>
      )}
      <div className="auth-trust">
        <ShieldCheck size={15} />
        <span>
          We use your information to verify your business and protect your
          account.
        </span>
      </div>
    </MerchantAuthLayout>
  )
}

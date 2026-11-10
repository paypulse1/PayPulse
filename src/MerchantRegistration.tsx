import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react"
import { Button } from "./AppPrimitives"
import MerchantAuthLayout from "./MerchantAuthLayout"
import {
  documentRequirements,
  registrationStageCopy,
  requiredDocumentTypes,
  useMerchantRegistration,
  type RegistrationStage,
} from "./useMerchantRegistration"

const registrationStageTitles: Record<Exclude<RegistrationStage, "submitted">, string> =
  {
    contact: "Create your account",
    verify: "Verify your email",
    owner: "Owner information",
    business: "Business information",
    payout: "Payout account",
    security: "Create your MPIN",
    documents: "Upload documents",
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
      <h1>Application received</h1>
      <p>
        Your registration is with our review team. We’ll contact you at{" "}
        <strong>{email}</strong> when the review is complete.
      </p>
      <div className="registration-review-note">
        <ShieldCheck size={17} />
        <span>
          <strong>Pending review</strong>
          <small>Your DRPAY account will be available after approval.</small>
        </span>
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={onBack}
        icon={<ArrowLeft size={17} />}
      >
        Back to sign in
      </Button>
    </div>
  )
}

export default function MerchantRegistration({
  onBack,
}: {
  onBack: () => void
}) {
  const {
    application,
    busy,
    code,
    confirmPin,
    contact,
    error,
    handleFileChange,
    nextStage,
    pin,
    progressIndex,
    requestCode,
    sendCode,
    selectedFiles,
    setCode,
    setConfirmPin,
    setPin,
    stage,
    stages,
    submitSecurity,
    submitApplication,
    updateApplication,
    updateContact,
    uploadedDocuments,
    uploadDocument,
    uploadingDocument,
    verifyCode,
    maximumOwnerDateOfBirth,
  } = useMerchantRegistration()

  return (
    <MerchantAuthLayout
      registration
      kicker="DRPAY MERCHANT SIGN-UP"
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
          title: "Protected information",
          description: "Documents are uploaded to private storage",
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

          {stage === "documents" && (
            <form onSubmit={(event) => void submitApplication(event)}>
              <p className="registration-document-note">
                PDF, JPEG, or PNG · up to 10 MB per file. Required documents are
                marked.
              </p>
              <div className="registration-documents">
                {documentRequirements.map((document) => {
                  const uploadedName = uploadedDocuments[document.type]
                  const selectedFile = selectedFiles[document.type]
                  const isUploading = uploadingDocument === document.type
                  return (
                    <div className="registration-document" key={document.type}>
                      <div className="registration-document-heading">
                        <span className="registration-document-icon">
                          {uploadedName ? (
                            <FileCheck2 size={18} />
                          ) : (
                            <ShieldCheck size={18} />
                          )}
                        </span>
                        <span>
                          <strong>{document.title}</strong>
                          <small>{document.description}</small>
                        </span>
                        <span
                          className={
                            uploadedName
                              ? "registration-document-status uploaded"
                              : document.required
                                ? "registration-document-status required"
                                : "registration-document-status"
                          }
                        >
                          {uploadedName
                            ? "Ready"
                            : document.required
                              ? "Required"
                              : "Optional"}
                        </span>
                      </div>
                      {uploadedName ? (
                        <small className="registration-uploaded-name">
                          {uploadedName}
                        </small>
                      ) : (
                        <div className="registration-document-action">
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            disabled={isUploading}
                            onChange={(event) =>
                              handleFileChange(document.type, event)
                            }
                          />
                          {selectedFile && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isUploading}
                              onClick={() =>
                                void uploadDocument(document.type, selectedFile)
                              }
                              icon={
                                isUploading ? (
                                  <LoaderCircle className="spin" size={16} />
                                ) : (
                                  <ArrowRight size={16} />
                                )
                              }
                            >
                              {isUploading ? "Uploading…" : "Upload"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
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
                  uploadingDocument !== null ||
                  requiredDocumentTypes.some((type) => !uploadedDocuments[type])
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

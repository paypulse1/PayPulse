import { useState, type ChangeEvent, type FormEvent } from "react"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react"
import {
  requestMerchantRegistrationOtp,
  submitMerchantRegistration,
  uploadMerchantRegistrationDocument,
  verifyMerchantRegistrationOtp,
  type MerchantBusinessDetails,
  type MerchantRegistrationInput,
  type RegistrationDocumentType,
} from "./lib/swiftpay"
import { Brand, Button, PoweredByFooter } from "./AppPrimitives"

const initialContact: MerchantRegistrationInput = {
  email: "",
  phoneNumber: "",
}

const initialApplication: MerchantBusinessDetails = {
  businessName: "",
  contactPerson: "",
  businessAddress: "",
  registrationNumber: "",
  businessType: "",
  country: "Philippines",
  ownerFullName: "",
  ownerDateOfBirth: "",
  ownerNationality: "",
  ownerEmail: "",
  ownerPhone: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
}

const documentRequirements: {
  type: RegistrationDocumentType
  title: string
  description: string
  required: boolean
}[] = [
  {
    type: "business_registration",
    title: "Business registration certificate",
    description: "Certificate or government-issued business registration",
    required: true,
  },
  {
    type: "identity_front",
    title: "Owner ID — front",
    description: "A clear image of the beneficial owner’s ID",
    required: true,
  },
  {
    type: "identity_back",
    title: "Owner ID — back",
    description: "The reverse side of the same identity document",
    required: true,
  },
  {
    type: "proof_of_address",
    title: "Business address proof",
    description: "Optional utility bill or other address document",
    required: false,
  },
]

const requiredDocumentTypes = documentRequirements
  .filter((document) => document.required)
  .map((document) => document.type)
const maximumOwnerDateOfBirth = new Date(
  Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000,
)
  .toISOString()
  .slice(0, 10)

type RegistrationStage = "contact" | "verify" | "owner" | "business" | "payout" | "security" | "documents" | "submitted"

const stages: { id: RegistrationStage; label: string }[] = [
  { id: "contact", label: "Contact" },
  { id: "verify", label: "Verify" },
  { id: "owner", label: "Owner" },
  { id: "business", label: "Business" },
  { id: "payout", label: "Payout" },
  { id: "security", label: "Security" },
  { id: "documents", label: "Documents" },
]

const stageCopy: Record<Exclude<RegistrationStage, "submitted">, string> = {
  contact: "Start with your email and mobile number.",
  verify: "Enter the one-time code we sent to your email.",
  owner: "Tell us about the person who owns or controls the business.",
  business: "Enter your registered business information.",
  payout: "Add the bank account for merchant settlements.",
  security: "Create a four-digit MPIN for your DRPAY account.",
  documents: "Upload the documents needed to review your application.",
}

export default function MerchantRegistration({
  onBack,
}: {
  onBack: () => void
}) {
  const [contact, setContact] = useState(initialContact)
  const [application, setApplication] = useState(initialApplication)
  const [stage, setStage] = useState<RegistrationStage>("contact")
  const [challengeId, setChallengeId] = useState("")
  const [code, setCode] = useState("")
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [selectedFiles, setSelectedFiles] =
    useState<Partial<Record<RegistrationDocumentType, File>>>({})
  const [uploadedDocuments, setUploadedDocuments] =
    useState<Partial<Record<RegistrationDocumentType, string>>>({})
  const [uploadingDocument, setUploadingDocument] =
    useState<RegistrationDocumentType | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const stageIndex = stages.findIndex((item) => item.id === stage)
  const progressIndex = stage === "submitted" ? stages.length : stageIndex

  function updateContact(
    field: keyof MerchantRegistrationInput,
    value: string,
  ) {
    setContact((current) => ({ ...current, [field]: value }))
  }

  function updateApplication(
    field: keyof MerchantBusinessDetails,
    value: string,
  ) {
    setApplication((current) => ({ ...current, [field]: value }))
  }

  async function sendCode() {
    setBusy(true)
    setError("")
    try {
      const response = await requestMerchantRegistrationOtp({
        ...contact,
        email: contact.email.trim().toLowerCase(),
      })
      setChallengeId(response.challengeId)
      setCode("")
      setStage("verify")
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

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendCode()
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await verifyMerchantRegistrationOtp(
        contact.email.trim().toLowerCase(),
        challengeId,
        code,
      )
      setStage("owner")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not verify your email.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function uploadDocument(
    documentType: RegistrationDocumentType,
    file: File,
  ) {
    setUploadingDocument(documentType)
    setError("")
    try {
      await uploadMerchantRegistrationDocument(challengeId, documentType, file)
      setUploadedDocuments((current) => ({
        ...current,
        [documentType]: file.name,
      }))
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload this document.",
      )
    } finally {
      setUploadingDocument(null)
    }
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pin !== confirmPin) {
      setError("The MPINs do not match.")
      return
    }
    if (requiredDocumentTypes.some((type) => !uploadedDocuments[type])) {
      setError(
        "Upload the business certificate and both sides of the owner ID.",
      )
      return
    }
    setBusy(true)
    setError("")
    try {
      await submitMerchantRegistration(
        contact.email.trim().toLowerCase(),
        challengeId,
        {
          ...application,
          ownerEmail: application.ownerEmail || contact.email,
          ownerPhone: application.ownerPhone || contact.phoneNumber,
        },
        pin,
      )
      setStage("submitted")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not submit your application.",
      )
    } finally {
      setBusy(false)
    }
  }

  function nextStage(next: RegistrationStage) {
    setError("")
    setStage(next)
  }

  function handleFileChange(
    documentType: RegistrationDocumentType,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    if (!file) return
    setSelectedFiles((current) => ({ ...current, [documentType]: file }))
  }

  return (
    <main className="auth-screen auth-screen-with-footer auth-login-screen">
      <div className="auth-login-layout merchant-registration-layout">
        <aside className="auth-login-aside">
          <span className="auth-login-kicker">
            <ShieldCheck size={15} />
            DRPAY MERCHANT SIGN-UP
          </span>
          <div className="auth-login-aside-copy">
            <h2>
              Business starts
              <br />
              <span>with trust.</span>
            </h2>
            <p>
              Set up your merchant profile with secure verification and
              dedicated application review.
            </p>
          </div>
          <div className="auth-login-benefits">
            <div>
              <span className="auth-login-benefit-icon">
                <Mail size={16} />
              </span>
              <span>
                <strong>Verified contact</strong>
                <small>Confirm your email before continuing</small>
              </span>
            </div>
            <div>
              <span className="auth-login-benefit-icon">
                <ShieldCheck size={16} />
              </span>
              <span>
                <strong>Protected information</strong>
                <small>Documents are uploaded to private storage</small>
              </span>
            </div>
          </div>
          <span className="auth-login-glow" aria-hidden="true" />
        </aside>
        <div className="auth-login-panel">
          <div className="auth-brand">
            <Brand />
          </div>
          <section className="auth-card auth-login-card merchant-registration-card">
            <span className="eyebrow">MERCHANT ACCOUNT</span>
            {stage === "submitted" ? (
              <div className="registration-complete">
                <span className="registration-complete-icon">
                  <CheckCircle2 size={26} />
                </span>
                <h1>Application received</h1>
                <p>
                  Your registration is with our review team. We’ll contact you
                  at <strong>{contact.email}</strong> when the review is
                  complete.
                </p>
                <div className="registration-review-note">
                  <ShieldCheck size={17} />
                  <span>
                    <strong>Pending review</strong>
                    <small>
                      Your DRPAY account will be available after approval.
                    </small>
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
            ) : (
              <>
                <h1>
                  {stage === "contact"
                    ? "Create your account"
                    : stage === "verify"
                      ? "Verify your email"
                      : stage === "owner"
                        ? "Owner information"
                        : stage === "business"
                          ? "Business information"
                          : stage === "payout"
                            ? "Payout account"
                            : stage === "security"
                              ? "Create your MPIN"
                              : "Upload documents"}
                </h1>
                <p>{stageCopy[stage]}</p>
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
                      aria-current={
                        index === progressIndex ? "step" : undefined
                      }
                      title={item.label}
                    >
                      <b>{index < progressIndex ? "✓" : index + 1}</b>
                      <small>{item.label}</small>
                    </span>
                  ))}
                </div>

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
                          setCode(
                            event.target.value.replace(/\D/g, "").slice(0, 6),
                          )
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
                          updateApplication(
                            "ownerDateOfBirth",
                            event.target.value,
                          )
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
                          updateApplication(
                            "ownerNationality",
                            event.target.value,
                          )
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
                          updateApplication(
                            "registrationNumber",
                            event.target.value,
                          )
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
                          updateApplication(
                            "businessAddress",
                            event.target.value,
                          )
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
                      Use an account held by the registered business or its
                      authorized owner.
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
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (pin !== confirmPin) {
                        setError("The MPINs do not match.")
                        return
                      }
                      nextStage("documents")
                    }}
                  >
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
                          setPin(
                            event.target.value.replace(/\D/g, "").slice(0, 4),
                          )
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
                      Keep your MPIN private. It will be stored as a secure
                      hash, not as plain text.
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
                      PDF, JPEG, or PNG · up to 10 MB per file. Required
                      documents are marked.
                    </p>
                    <div className="registration-documents">
                      {documentRequirements.map((document) => {
                        const uploadedName = uploadedDocuments[document.type]
                        const selectedFile = selectedFiles[document.type]
                        const isUploading = uploadingDocument === document.type
                        return (
                          <div
                            className="registration-document"
                            key={document.type}
                          >
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
                                      void uploadDocument(
                                        document.type,
                                        selectedFile,
                                      )
                                    }
                                    icon={
                                      isUploading ? (
                                        <LoaderCircle
                                          className="spin"
                                          size={16}
                                        />
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
                        requiredDocumentTypes.some(
                          (type) => !uploadedDocuments[type],
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
          </section>
          <PoweredByFooter />
        </div>
      </div>
    </main>
  )
}

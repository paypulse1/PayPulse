import { useState, type FormEvent } from "react"
import {
  getMerchantRegistrationSumsubStatus,
  requestMerchantRegistrationOtp,
  submitMerchantRegistration,
  verifyMerchantRegistrationOtp,
  type MerchantBusinessDetails,
  type MerchantRegistrationInput,
  type SumsubKybStatus,
} from "./lib/swiftpay"

export type RegistrationStage = "contact" | "verify" | "owner" | "business" | "payout" | "security" | "verification" | "submitted"

const initialContact: MerchantRegistrationInput = {
  email: "",
  phoneNumber: "",
  referralCode: "",
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

export function normalizeReferralCode(value: string) {
  return value.trim().toUpperCase()
}

type RegistrationStep = {
  id: Exclude<RegistrationStage, "submitted">
  label: string
}

const stages: RegistrationStep[] = [
  { id: "contact", label: "Contact" },
  { id: "verify", label: "Verify" },
  { id: "owner", label: "Owner" },
  { id: "business", label: "Business" },
  { id: "payout", label: "Payout" },
  { id: "security", label: "Security" },
  { id: "verification", label: "Verify" },
]

export const registrationStageCopy: Record<Exclude<RegistrationStage, "submitted">, string> =
  {
    contact: "Start with your email and mobile number.",
    verify: "Enter the one-time code we sent to your email.",
    owner: "Tell us about the person who owns or controls the business.",
    business: "Enter your registered business information.",
    payout: "Add the bank account for merchant settlements.",
    security: "Create a four-digit MPIN for your DRPAY account.",
    verification:
      "Verify your business and beneficial owners securely with Sumsub.",
  }

const maximumOwnerDateOfBirth = new Date(
  Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000,
)
  .toISOString()
  .slice(0, 10)

export function useMerchantRegistration() {
  const [contact, setContact] = useState(() => ({
    ...initialContact,
    referralCode: normalizeReferralCode(
      new URLSearchParams(window.location.search).get("ref") || "",
    ),
  }))
  const [application, setApplication] = useState(initialApplication)
  const [stage, setStage] = useState<RegistrationStage>("contact")
  const [challengeId, setChallengeId] = useState("")
  const [code, setCode] = useState("")
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [sumsubReviewStatus, setSumsubReviewStatus] =
    useState<SumsubKybStatus>("NOT_STARTED")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const stageIndex = stages.findIndex((item) => item.id === stage)
  const progressIndex = stage === "submitted" ? stages.length : stageIndex

  function updateContact(
    field: keyof MerchantRegistrationInput,
    value: string,
  ) {
    setContact((current) => ({
      ...current,
      [field]: field === "referralCode" ? normalizeReferralCode(value) : value,
    }))
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

  async function refreshSumsubStatus() {
    const response = await getMerchantRegistrationSumsubStatus(
      contact.email.trim().toLowerCase(),
      challengeId,
    )
    setSumsubReviewStatus(response.sumsubReviewStatus)
    return response.sumsubReviewStatus
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pin !== confirmPin) {
      setError("The MPINs do not match.")
      return
    }
    if (!["IN_REVIEW", "ON_HOLD", "APPROVED"].includes(sumsubReviewStatus)) {
      setError(
        "Complete and submit your Sumsub verification before submitting this application.",
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

  function submitSecurity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pin !== confirmPin) {
      setError("The MPINs do not match.")
      return
    }
    nextStage("verification")
  }

  function nextStage(next: RegistrationStage) {
    setError("")
    setStage(next)
  }

  return {
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
  }
}

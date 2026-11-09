import { useState, type ChangeEvent, type FormEvent } from "react"
import {
  requestMerchantRegistrationOtp,
  submitMerchantRegistration,
  uploadMerchantRegistrationDocument,
  verifyMerchantRegistrationOtp,
  type MerchantBusinessDetails,
  type MerchantRegistrationInput,
  type RegistrationDocumentType,
} from "./lib/swiftpay"

export type RegistrationStage = "contact" | "verify" | "owner" | "business" | "payout" | "security" | "documents" | "submitted"

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

export const documentRequirements: {
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

export const requiredDocumentTypes = documentRequirements
  .filter((document) => document.required)
  .map((document) => document.type)

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
  { id: "documents", label: "Documents" },
]

export const registrationStageCopy: Record<Exclude<RegistrationStage, "submitted">, string> =
  {
    contact: "Start with your email and mobile number.",
    verify: "Enter the one-time code we sent to your email.",
    owner: "Tell us about the person who owns or controls the business.",
    business: "Enter your registered business information.",
    payout: "Add the bank account for merchant settlements.",
    security: "Create a four-digit MPIN for your DRPAY account.",
    documents: "Upload the documents needed to review your application.",
  }

const maximumOwnerDateOfBirth = new Date(
  Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000,
)
  .toISOString()
  .slice(0, 10)

export function useMerchantRegistration() {
  const [contact, setContact] = useState(() => ({
    ...initialContact,
    referralCode:
      new URLSearchParams(window.location.search)
        .get("ref")
        ?.trim()
        .toUpperCase() || "",
  }))
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

  function submitSecurity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pin !== confirmPin) {
      setError("The MPINs do not match.")
      return
    }
    nextStage("documents")
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

  return {
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
  }
}

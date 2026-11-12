import { Button } from "../AppPrimitives"
import type { AdminKybApplication } from "../lib/swiftpay"
import { hasPassedSumsubKyb } from "./useAdminConsoleViewModel"

export type KybReviewStatus = "IN_REVIEW" | "APPROVED" | "REJECTED"

export default function KybApplicationCard({
  application,
  reviewNotes,
  reviewing,
  onReviewNotesChange,
  onOpenDocument,
  onReview,
}: {
  application: AdminKybApplication
  reviewNotes: string
  reviewing: boolean
  onReviewNotesChange: (notes: string) => void
  onOpenDocument: (documentType: string) => void
  onReview: (status: KybReviewStatus) => void
}) {
  const canApprove = hasPassedSumsubKyb(application)

  return (
    <article className="admin-kyb-application">
      <div className="admin-kyb-heading">
        <div>
          <strong>{application.legalBusinessName}</strong>
          <small>
            {application.merchantEmail} · {application.status.replace("_", " ")}
          </small>
        </div>
      </div>
      <dl>
        <div>
          <dt>Sumsub verification</dt>
          <dd>
            {application.sumsubReviewStatus.replace(/_/g, " ")}
            {application.sumsubApplicantId
              ? ` · Applicant ${application.sumsubApplicantId}`
              : ""}
          </dd>
        </div>
        <div>
          <dt>Registration</dt>
          <dd>
            {application.registrationNumber} · {application.businessType}
          </dd>
        </div>
        <div>
          <dt>Business address</dt>
          <dd>
            {application.businessAddress}, {application.country}
          </dd>
        </div>
        <div>
          <dt>Beneficial owner</dt>
          <dd>
            {application.ownerFullName} · Born {application.ownerDateOfBirth} ·{" "}
            {application.ownerNationality}
          </dd>
        </div>
        <div>
          <dt>Owner contact</dt>
          <dd>
            {application.ownerEmail} · {application.ownerPhone}
          </dd>
        </div>
      </dl>
      <div className="admin-kyb-documents">
        <span>
          Review the detailed provider checks in Sumsub using the applicant ID
          above.
        </span>
        {application.documents.map((document) => (
          <button
            key={document.id}
            type="button"
            className="admin-text-action"
            onClick={() => onOpenDocument(document.documentType)}
          >
            {document.documentType.replace(/_/g, " ")} · {document.fileName}
          </button>
        ))}
        {application.documents.length === 0 && (
          <span>No separate DRPAY documents submitted</span>
        )}
      </div>
      <label className="admin-kyb-notes">
        <span>Review notes (required when rejecting)</span>
        <textarea
          value={reviewNotes}
          onChange={(event) => onReviewNotesChange(event.target.value)}
          maxLength={1000}
          rows={2}
        />
      </label>
      <div className="admin-kyb-actions">
        <Button
          variant="secondary"
          disabled={reviewing}
          onClick={() => onReview("IN_REVIEW")}
        >
          Mark in review
        </Button>
        <Button
          disabled={reviewing || !canApprove}
          onClick={() => onReview("APPROVED")}
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          disabled={reviewing || !reviewNotes.trim()}
          onClick={() => onReview("REJECTED")}
        >
          Reject
        </Button>
      </div>
      {!canApprove && (
        <small className="admin-kyb-missing">
          DRPAY approval requires a positive Sumsub business-verification
          result.
        </small>
      )}
    </article>
  )
}

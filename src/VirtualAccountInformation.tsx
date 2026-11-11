import type { VirtualAccountInfo } from "./lib/swiftpay"

export default function VirtualAccountInformation({
  information,
  showReference = false,
}: {
  information?: VirtualAccountInfo
  showReference?: boolean
}) {
  const hasBankAccountNumber = Boolean(information?.bankAccountNumber)
  const hasBankCode = Boolean(information?.instapayBankCode)
  const hasCompleteBankDetails = hasBankAccountNumber && hasBankCode

  return (
    <section className="virtual-account-info" aria-label="Virtual Account information">
      <h3>Virtual Account Information</h3>
      {!hasCompleteBankDetails && (
        <p className="virtual-account-info-warning" role="alert">
          SwiftPay did not return all Virtual Account details for this QR. Confirm
          the bank details with the merchant before sending a bank transfer.
        </p>
      )}
      <dl>
        {information?.bankAccountNumber && (
          <div>
            <dt>Virtual Account number</dt>
            <dd>{information.bankAccountNumber}</dd>
          </div>
        )}
        {information?.instapayBankCode && (
          <div>
            <dt>InstaPay bank code</dt>
            <dd>{information.instapayBankCode}</dd>
          </div>
        )}
        {showReference && information?.referenceNo && (
          <div>
            <dt>Payment reference</dt>
            <dd>{information.referenceNo}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}

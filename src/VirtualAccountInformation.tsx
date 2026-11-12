import type { VirtualAccountInfo } from "./lib/swiftpay"

export default function VirtualAccountInformation({
  information,
  showReference = false,
}: {
  information?: VirtualAccountInfo
  showReference?: boolean
}) {
  const hasBankAccountNumber = Boolean(information?.bankAccountNumber)

  return (
    <section
      className="virtual-account-info"
      aria-label="Virtual Account information"
    >
      <h3>Virtual Account Information</h3>
      {!hasBankAccountNumber && (
        <p className="virtual-account-info-warning" role="alert">
          SwiftPay did not return the Virtual Account number for this QR.
          Confirm the bank details with the merchant before sending a bank
          transfer.
        </p>
      )}
      <dl>
        {information?.bankAccountNumber && (
          <div>
            <dt>Virtual Account number</dt>
            <dd>{information.bankAccountNumber}</dd>
          </div>
        )}
        <div>
          <dt>Virtual Bank Name</dt>
          <dd>Netbank (Rural Bank of Romblon)</dd>
        </div>
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

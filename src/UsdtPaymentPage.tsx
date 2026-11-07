import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { CheckCircle2, Copy, ShieldCheck, TriangleAlert } from "lucide-react"
import { APP_ROUTES } from "./lib/routes"
import { parseUsdtAmount } from "./lib/tronLink"

const TRON_ADDRESS_PATTERN = /^T[1-9A-HJ-NP-Za-km-z]{33}$/

export default function UsdtPaymentPage() {
  const params = new URLSearchParams(window.location.search)
  const address = params.get("address") || ""
  const amount = params.get("amount") || ""
  const reference = params.get("reference") || ""
  const amountInBaseUnits = parseUsdtAmount(amount)
  const validRequest =
    TRON_ADDRESS_PATTERN.test(address) &&
    amountInBaseUnits !== null &&
    amountInBaseUnits > 0n &&
    reference.trim().length > 0 &&
    reference.length <= 160
  const [qrImage, setQrImage] = useState("")
  const [qrError, setQrError] = useState("")
  const [copyMessage, setCopyMessage] = useState("")

  useEffect(() => {
    let active = true
    setQrImage("")
    setQrError("")
    if (!validRequest) return

    QRCode.toString(address, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#10233f", light: "#ffffff" },
    })
      .then((svg) => {
        if (active)
          setQrImage(
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          )
      })
      .catch(() => {
        if (active) setQrError("Could not prepare the TRON address QR code.")
      })
    return () => {
      active = false
    }
  }, [address, validRequest])

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address)
      setCopyMessage("Address copied.")
    } catch {
      setCopyMessage("Could not copy the address. Select and copy it manually.")
    }
  }

  return (
    <main className="checkout-screen">
      <section className="checkout-card" aria-labelledby="usdt-checkout-title">
        <header className="checkout-brand">
          <img src="/drpay-mark.png" alt="" />
          <span>DRPAY</span>
          <span className="checkout-secure">
            <ShieldCheck size={14} /> Payment details
          </span>
        </header>

        {!validRequest ? (
          <div className="checkout-error">
            <TriangleAlert size={24} />
            <h1 id="usdt-checkout-title">Payment request unavailable</h1>
            <p>
              This USDT payment link is incomplete or invalid. Ask the merchant
              to send you a new link.
            </p>
          </div>
        ) : (
          <>
            <div className="checkout-summary">
              <span className="checkout-label">USDT PAYMENT REQUEST</span>
              <h1 id="usdt-checkout-title">{reference}</h1>
              <strong className="checkout-amount">{amount} USDT</strong>
              <span className="checkout-currency-note">
                TRON mainnet · TRC20 only
              </span>
            </div>

            {qrError ? (
              <p className="checkout-qr-error" role="alert">
                {qrError}
              </p>
            ) : qrImage ? (
              <div className="checkout-qr-frame">
                <img
                  src={qrImage}
                  alt="QR code for the merchant's TRON mainnet address"
                />
              </div>
            ) : (
              <p className="checkout-loading" role="status">
                Preparing address QR…
              </p>
            )}

            <div className="checkout-instructions">
              <strong>How to pay</strong>
              <ol>
                <li>Send exactly {amount} USDT using TRON (TRC20).</li>
                <li>Check the network and address carefully before sending.</li>
                <li>Ask the merchant to confirm the deposit after it arrives.</li>
              </ol>
              <p>
                Do not send USDT using another network. Transfers are
                irreversible and this request is not confirmed automatically.
              </p>
            </div>

            <div className="checkout-reference">
              <span>Merchant TRON mainnet address</span>
              <button type="button" onClick={() => void copyAddress()}>
                <code>{address}</code>
                {copyMessage === "Address copied." ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Copy size={15} />
                )}
              </button>
              {copyMessage && (
                <p
                  className={
                    copyMessage === "Address copied."
                      ? "usdt-copy-message"
                      : "checkout-inline-error"
                  }
                  role="status"
                >
                  {copyMessage}
                </p>
              )}
            </div>
          </>
        )}
      </section>
      <footer className="checkout-footer">
        <nav aria-label="Legal and support">
          <a href={APP_ROUTES.privacy}>Privacy</a>
          <a href={APP_ROUTES.terms}>Terms</a>
          <a href={APP_ROUTES.contact}>Contact</a>
        </nav>
      </footer>
    </main>
  )
}

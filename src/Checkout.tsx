import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2,
  Clock3,
  Copy,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import {
  getPublicCheckout,
  VIRTUAL_ACCOUNT_INSTITUTION_CODE,
  type PublicCheckout,
} from "./lib/swiftpay"
import { APP_ROUTES } from "./lib/routes"
import QrPaymentDisplay from "./QrPaymentDisplay"
import VirtualAccountInformation from "./VirtualAccountInformation"
import PayPulseLogo from "./PayPulseLogo"

type GoogleSurveyOptInApi = {
  load: (api: string, callback: () => void) => void
  surveyoptin?: {
    render: (options: {
      merchant_id: number
      order_id: string
      email: string
      delivery_country: string
      estimated_delivery_date: string
    }) => void
  }
}

declare global {
  interface Window {
    gapi?: GoogleSurveyOptInApi
  }
}

let googleSurveyScript: Promise<GoogleSurveyOptInApi> | null = null

function loadGoogleSurveyScript() {
  if (window.gapi) return Promise.resolve(window.gapi)
  if (googleSurveyScript) return googleSurveyScript

  googleSurveyScript = new Promise<GoogleSurveyOptInApi>((resolve, reject) => {
    const script = document.createElement("script")
    script.id = "google-customer-reviews-script"
    script.src = "https://apis.google.com/js/platform.js"
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.gapi) resolve(window.gapi)
      else reject(new Error("Google Customer Reviews did not initialize."))
    }
    script.onerror = () =>
      reject(new Error("Google Customer Reviews could not be loaded."))
    document.head.append(script)
  }).catch((error: unknown) => {
    googleSurveyScript = null
    throw error
  })

  return googleSurveyScript
}

function statusPresentation(checkout: PublicCheckout) {
  if (checkout.status === "MANUALLY_PAID") {
    return {
      label: "Payment confirmed by the merchant",
      className: "checkout-status-paid",
      icon: <CheckCircle2 size={18} />,
    }
  }
  if (checkout.status === "EXECUTED") {
    return {
      label: "Payment received",
      className: "checkout-status-paid",
      icon: <CheckCircle2 size={18} />,
    }
  }
  if (checkout.status === "EXPIRED") {
    return {
      label: "This checkout has expired",
      className: "checkout-status-terminal",
      icon: <TriangleAlert size={18} />,
    }
  }
  if (["CANCELED", "REJECTED"].includes(checkout.status)) {
    return {
      label: "Payment was not completed",
      className: "checkout-status-terminal",
      icon: <TriangleAlert size={18} />,
    }
  }
  if (checkout.statusCheckUnavailable) {
    return {
      label: "Payment status is temporarily unavailable",
      className: "checkout-status-warning",
      icon: <TriangleAlert size={18} />,
    }
  }
  return {
    label: "Waiting for payment",
    className: "checkout-status-pending",
    icon: <Clock3 size={18} />,
  }
}

export default function Checkout({ code }: { code: string }) {
  const [checkout, setCheckout] = useState<PublicCheckout | null>(null)
  const [error, setError] = useState("")
  const [referenceCopied, setReferenceCopied] = useState(false)
  const surveyOptInRenderedFor = useRef("")

  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const result = await getPublicCheckout(code)
        if (active) {
          setCheckout(result)
          setError("")
        }
      } catch (requestError) {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load this checkout.",
          )
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 10_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [code])

  useEffect(() => {
    const status = checkout?.status
    const customerEmail = checkout?.customerEmail
    const estimatedDeliveryDate = checkout?.estimatedDeliveryDate
    const referenceNo = checkout?.referenceNo
    if (
      !status ||
      !["EXECUTED", "MANUALLY_PAID"].includes(status) ||
      !customerEmail ||
      !estimatedDeliveryDate ||
      !referenceNo ||
      surveyOptInRenderedFor.current === code
    ) {
      return
    }

    surveyOptInRenderedFor.current = code
    let active = true
    void loadGoogleSurveyScript()
      .then((gapi) => {
        gapi.load("surveyoptin", () => {
          if (!active) return
          try {
            const render = gapi.surveyoptin?.render
            if (!render) {
              console.error(
                "Google Customer Reviews survey opt-in API is unavailable.",
              )
              return
            }
            render({
              merchant_id: 5899979224,
              order_id: referenceNo,
              email: customerEmail,
              delivery_country: "PH",
              estimated_delivery_date: estimatedDeliveryDate,
            })
          } catch (requestError) {
            console.error(
              "Google Customer Reviews opt-in could not be rendered.",
              requestError,
            )
          }
        })
      })
      .catch((requestError: unknown) => {
        if (active) {
          console.error(
            "Google Customer Reviews opt-in could not be loaded.",
            requestError,
          )
        }
      })

    return () => {
      active = false
    }
  }, [
    checkout?.status,
    checkout?.customerEmail,
    checkout?.estimatedDeliveryDate,
    checkout?.referenceNo,
    code,
  ])

  async function copyReference() {
    if (!checkout) return
    try {
      await navigator.clipboard.writeText(checkout.referenceNo)
      setReferenceCopied(true)
      window.setTimeout(() => setReferenceCopied(false), 1800)
    } catch {
      setError(
        "Could not copy the payment reference. You can select and copy it manually.",
      )
    }
  }

  const terminal =
    checkout &&
    ["EXECUTED", "MANUALLY_PAID", "CANCELED", "REJECTED", "EXPIRED"].includes(
      checkout.status,
    )
  const presentation = checkout ? statusPresentation(checkout) : null

  return (
    <main className="checkout-screen">
      <section className="checkout-card" aria-labelledby="checkout-title">
        <header className="checkout-brand">
          {checkout?.logoUrl?.startsWith("https://") ? (
            <img src={checkout.logoUrl} alt="" />
          ) : (
            <PayPulseLogo />
          )}
          <span
            style={{
              color: /^#[0-9A-Fa-f]{6}$/.test(checkout?.brandColor || "")
                ? checkout?.brandColor
                : undefined,
            }}
          >
            PayPulse
          </span>
          <span className="checkout-secure">
            <ShieldCheck size={14} /> Secure checkout
          </span>
        </header>

        {!checkout && !error && (
          <div className="checkout-loading" role="status">
            <LoaderCircle size={24} className="checkout-spinner" />
            Loading checkout…
          </div>
        )}

        {error && !checkout && (
          <div className="checkout-error">
            <TriangleAlert size={24} />
            <h1 id="checkout-title">Checkout unavailable</h1>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )}

        {checkout && (
          <>
            <div className="checkout-summary">
              <span className="checkout-label">PAYMENT REQUEST</span>
              <h1 id="checkout-title">{checkout.title}</h1>
              <strong className="checkout-amount">
                {checkout.currency}{" "}
                {checkout.amount.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
              <span className="checkout-currency-note">
                Pay the exact amount shown in PHP.
              </span>
            </div>

            <div
              className={`checkout-status ${presentation?.className}`}
              role="status"
            >
              {presentation?.icon}
              <span>{presentation?.label}</span>
            </div>
            {checkout.statusCheckUnavailable && !terminal && (
              <p className="checkout-status-note">
                You can still scan the QR, but keep this page open while status
                updates reconnect. Do not submit a second payment.
              </p>
            )}

            {checkout.status === "EXECUTED" ||
            checkout.status === "MANUALLY_PAID" ? (
              <div className="checkout-complete">
                <CheckCircle2 size={42} />
                <strong>
                  {checkout.status === "MANUALLY_PAID"
                    ? "The merchant has verified and confirmed your payment."
                    : "Thank you. Your payment is confirmed."}
                </strong>
                <span>You may close this page.</span>
              </div>
            ) : checkout.status === "EXPIRED" ? (
              <div className="checkout-expired">
                Ask the merchant for a new payment request.
              </div>
            ) : checkout.status === "CANCELED" ||
              checkout.status === "REJECTED" ? (
              <div className="checkout-expired">
                This payment request is no longer active. Ask the merchant for
                help.
              </div>
            ) : (
              <>
                <QrPaymentDisplay
                  value={checkout.qrCode}
                  showBirLogo={checkout.isTaxInvoice}
                  institution={
                    checkout.institutionCode && checkout.institutionName
                      ? {
                          code: checkout.institutionCode,
                          name: checkout.institutionName,
                          logoUrl: checkout.institutionLogoUrl || undefined,
                          deepLink: checkout.institutionDeepLink || undefined,
                        }
                      : undefined
                  }
                />
                {checkout.institutionCode ===
                  VIRTUAL_ACCOUNT_INSTITUTION_CODE && (
                  <VirtualAccountInformation
                    information={checkout.virtualAccountInfo}
                    showReference={
                      Boolean(checkout.virtualAccountInfo?.referenceNo) &&
                      checkout.virtualAccountInfo?.referenceNo !==
                        checkout.referenceNo
                    }
                  />
                )}
              </>
            )}

            {!terminal && (
              <div className="checkout-instructions">
                <strong>How to pay</strong>
                <ol>
                  {(
                    checkout.checkoutInstructions ||
                    `Open your ${checkout.institutionName || "bank"} or supported banking app.\nOpen your ${checkout.institutionName || "bank"} QR scanner and scan the code above.\nConfirm the PHP amount before completing payment.`
                  )
                    .split(/\r?\n/)
                    .map((instruction, index) => (
                      <li key={`${index}-${instruction}`}>{instruction}</li>
                    ))}
                </ol>
              </div>
            )}

            <div className="checkout-reference">
              <span>Payment reference</span>
              <button
                type="button"
                onClick={() => void copyReference()}
                aria-label="Copy payment reference"
              >
                <code>{checkout.referenceNo}</code>
                {referenceCopied ? "Copied" : <Copy size={15} />}
              </button>
            </div>
            {error && checkout && (
              <p className="checkout-inline-error">{error}</p>
            )}
          </>
        )}
      </section>
      <footer className="checkout-footer">
        <div
          className="checkout-badges"
          role="group"
          aria-label="Security and regulatory badges"
        >
          <img
            src="/checkout-badges/pci-dss.webp"
            alt="PCI DSS"
            loading="lazy"
          />
          <img
            src="/checkout-badges/iso-iec-27001.webp"
            alt="ISO/IEC 27001"
            loading="lazy"
          />
          <img
            src="/checkout-badges/bangko-sentral-ng-pilipinas.webp"
            alt="Bangko Sentral ng Pilipinas"
            loading="lazy"
          />
        </div>
        <span>Payments are processed through SwiftPay QRPH.</span>
        <nav aria-label="Customer, legal and support">
          <a href={APP_ROUTES.customer}>Customer history</a>
          <a href={APP_ROUTES.privacy}>Privacy</a>
          <a href={APP_ROUTES.terms}>Terms</a>
          <a href={APP_ROUTES.contact}>Contact</a>
        </nav>
      </footer>
    </main>
  )
}

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { getPublicCheckout, type PublicCheckout } from "./lib/swiftpay";
import QrPaymentDisplay from "./QrPaymentDisplay";

function statusPresentation(checkout: PublicCheckout) {
  if (checkout.status === "MANUALLY_PAID") {
    return { label: "Payment confirmed by the merchant", className: "checkout-status-paid", icon: <CheckCircle2 size={18} /> };
  }
  if (checkout.status === "EXECUTED") {
    return { label: "Payment received", className: "checkout-status-paid", icon: <CheckCircle2 size={18} /> };
  }
  if (checkout.status === "EXPIRED") {
    return { label: "This checkout has expired", className: "checkout-status-terminal", icon: <TriangleAlert size={18} /> };
  }
  if (["CANCELED", "REJECTED"].includes(checkout.status)) {
    return { label: "Payment was not completed", className: "checkout-status-terminal", icon: <TriangleAlert size={18} /> };
  }
  if (checkout.statusCheckUnavailable) {
    return { label: "Payment status is temporarily unavailable", className: "checkout-status-warning", icon: <TriangleAlert size={18} /> };
  }
  return { label: "Waiting for payment", className: "checkout-status-pending", icon: <Clock3 size={18} /> };
}

export default function Checkout({ code }: { code: string }) {
  const [checkout, setCheckout] = useState<PublicCheckout | null>(null);
  const [error, setError] = useState("");
  const [referenceCopied, setReferenceCopied] = useState(false);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await getPublicCheckout(code);
        if (active) {
          setCheckout(result);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load this checkout.");
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [code]);

  async function copyReference() {
    if (!checkout) return;
    try {
      await navigator.clipboard.writeText(checkout.referenceNo);
      setReferenceCopied(true);
      window.setTimeout(() => setReferenceCopied(false), 1800);
    } catch {
      setError("Could not copy the payment reference. You can select and copy it manually.");
    }
  }

  const terminal = checkout && ["EXECUTED", "MANUALLY_PAID", "CANCELED", "REJECTED", "EXPIRED"].includes(checkout.status);
  const presentation = checkout ? statusPresentation(checkout) : null;

  return (
    <main className="checkout-screen">
      <section className="checkout-card" aria-labelledby="checkout-title">
        <header className="checkout-brand">
          <img src="/drpay-mark.png" alt="" />
          <span>DRPAY</span>
          <span className="checkout-secure"><ShieldCheck size={14} /> Secure checkout</span>
        </header>

        {!checkout && !error && (
          <div className="checkout-loading" role="status"><LoaderCircle size={24} className="checkout-spinner" />Loading checkout…</div>
        )}

        {error && !checkout && (
          <div className="checkout-error">
            <TriangleAlert size={24} />
            <h1 id="checkout-title">Checkout unavailable</h1>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>Try again</button>
          </div>
        )}

        {checkout && (
          <>
            <div className="checkout-summary">
              <span className="checkout-label">PAYMENT REQUEST</span>
              <h1 id="checkout-title">{checkout.title}</h1>
              <strong className="checkout-amount">
                {checkout.currency} {checkout.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              <span className="checkout-currency-note">Pay the exact amount shown in PHP.</span>
            </div>

            <div className={`checkout-status ${presentation?.className}`} role="status">
              {presentation?.icon}
              <span>{presentation?.label}</span>
            </div>
            {checkout.statusCheckUnavailable && !terminal && (
              <p className="checkout-status-note">You can still scan the QR, but keep this page open while status updates reconnect. Do not submit a second payment.</p>
            )}

            {checkout.status === "EXECUTED" || checkout.status === "MANUALLY_PAID" ? (
              <div className="checkout-complete">
                <CheckCircle2 size={42} />
                <strong>{checkout.status === "MANUALLY_PAID" ? "The merchant has verified and confirmed your payment." : "Thank you. Your payment is confirmed."}</strong>
                <span>You may close this page.</span>
              </div>
            ) : checkout.status === "EXPIRED" ? (
              <div className="checkout-expired">Ask the merchant for a new payment request.</div>
            ) : checkout.status === "CANCELED" || checkout.status === "REJECTED" ? (
              <div className="checkout-expired">This payment request is no longer active. Ask the merchant for help.</div>
            ) : (
              <QrPaymentDisplay value={checkout.qrCode} />
            )}

            {!terminal && (
              <div className="checkout-instructions">
                <strong>How to pay</strong>
                <ol>
                  <li>Open your bank or supported payment app.</li>
                  <li>Choose QR payment and scan the code above.</li>
                  <li>Confirm the PHP amount before completing payment.</li>
                </ol>
                <p>Pay this QR only once. DRPAY will update this page when SwiftPay confirms payment.</p>
              </div>
            )}

            <div className="checkout-reference">
              <span>Payment reference</span>
              <button type="button" onClick={() => void copyReference()} aria-label="Copy payment reference">
                <code>{checkout.referenceNo}</code>
                {referenceCopied ? "Copied" : <Copy size={15} />}
              </button>
            </div>
            {error && checkout && <p className="checkout-inline-error">{error}</p>}
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
        <span>Payments are processed through SwiftPay QR Ph.</span>
        <nav aria-label="Legal and support">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </nav>
      </footer>
    </main>
  );
}

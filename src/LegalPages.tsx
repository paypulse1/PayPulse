import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Mail,
  ShieldCheck,
} from "lucide-react"
import "./legal-pages.css"
import { APP_ROUTES, LEGAL_ROUTE_ALIASES } from "./lib/routes"
import PayPulseLogo from "./PayPulseLogo"

type LegalPageKind = "privacy" | "terms" | "contact"

export const supportEmail = "support@denpay.cc"
const lastUpdated = "October 23, 2026"

function LegalBrand() {
  return (
    <a className="legal-brand" href={APP_ROUTES.home} aria-label="PayPulse home">
      <PayPulseLogo />
      <strong>PayPulse</strong>
    </a>
  )
}

function LegalPage({ page }: { page: LegalPageKind }) {
  const titles = {
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    contact: "Contact Us",
  }
  const title = titles[page]
  const PageIcon =
    page === "privacy" ? ShieldCheck : page === "terms" ? FileText : Mail

  return (
    <main className="legal-page">
      <nav className="legal-nav" aria-label="Main navigation">
        <LegalBrand />
        <a className="legal-sign-in" href={APP_ROUTES.merchantSignIn}>
          Merchant sign-in <ArrowRight size={15} />
        </a>
      </nav>

      <div className="legal-content">
        <a className="legal-back-link" href={APP_ROUTES.home}>
          <ArrowLeft size={15} /> PayPulse home
        </a>
        <header className="legal-heading">
          <span className="legal-heading-icon">
            <PageIcon size={22} aria-hidden="true" />
          </span>
          <div>
            <span className="legal-eyebrow">
              DRL TECHS. COMPUTER SOFTWARE TRADING
            </span>
            <h1>{title}</h1>
          </div>
        </header>
        <article className={`legal-document legal-document-${page}`}>
          {page === "privacy" && (
            <>
              <p className="legal-updated">Last updated: {lastUpdated}</p>
              <p>
                This Privacy Policy describes how DRL TECHS. COMPUTER SOFTWARE
                TRADING (“PayPulse,” “we,” “us,” or “our”) handles personal
                information in the PayPulse merchant workspace and hosted payment
                checkout. We process personal information in accordance with
                applicable Philippine privacy laws, including the Data Privacy
                Act of 2012.
              </p>

              <h2>Information we handle</h2>
              <p>Depending on how you use PayPulse, information may include:</p>
              <ul>
                <li>
                  Merchant account details, such as email address, account and
                  device-verification details, and security preferences.
                </li>
                <li>
                  Payment and transfer details, including amounts, references,
                  status, recipient or payee name, bank or wallet destination,
                  and account details you submit.
                </li>
                <li>
                  Checkout information supplied by merchants and payers to
                  create or complete a payment request. A payer or payee
                  provides requested information voluntarily when choosing to
                  use a checkout or payment flow.
                </li>
                <li>
                  Technical information needed to operate the service, such as
                  session and device identifiers, locally stored preferences,
                  and push-notification tokens if you enable notifications.
                </li>
                <li>
                  Business verification information, including registration
                  details, beneficial-owner contact and identity details, date
                  of birth, and documents you upload for KYB review.
                </li>
                <li>
                  Merchant integration settings, including webhook and callback
                  URLs, event preferences, API key hashes, and delivery status.
                </li>
                <li>
                  Messages and details you choose to send when contacting
                  support.
                </li>
              </ul>

              <h2>How we use information</h2>
              <p>
                We use this information to operate merchant accounts and
                checkouts; review business and beneficial-owner verification;
                send configured payment event notifications; submit, display,
                and reconcile payment or transfer activity through the
                configured backend and payment providers; protect accounts and
                prevent misuse; provide support; and meet applicable legal
                obligations.
              </p>

              <h2>Service providers and sharing</h2>
              <p>
                Information necessary for a transaction may be shared with the
                configured PayPulse backend, SwiftPay, and the relevant bank,
                wallet, or payment network to provide and confirm that
                transaction. KYB document files are stored in the configured
                private Cloudflare R2 bucket and are made available to
                authorized PayPulse team members for verification. When merchants
                configure webhook or callback URLs, selected transaction event
                details are sent to those destinations. We may also disclose
                information where required by law or necessary to protect users,
                the service, or our legal rights. Those providers may handle
                information under their own terms and privacy notices.
              </p>

              <h2>Storage, security, and retention</h2>
              <p>
                Some session and preference data is stored in your browser or
                device. Optional biometric sign-in credentials are kept using
                the device’s secure credential storage; biometric matching is
                performed by the device. We use reasonable safeguards
                appropriate to the service, but no electronic system can be
                guaranteed completely secure. We retain information for as long
                as needed to operate the service, resolve disputes, and meet
                applicable legal and accounting requirements.
              </p>

              <h2>Your choices and rights</h2>
              <p>
                You may contact us to ask about access to or correction of
                personal information, or to raise a privacy concern. Where
                processing is based on consent, you may withdraw that consent,
                subject to legal and service requirements. You may also contact
                the National Privacy Commission of the Philippines about your
                rights under applicable law.
              </p>

              <h2>Contact</h2>
              <p>
                For privacy requests or questions, email{" "}
                <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Please do
                not include your MPIN, one-time verification code, or full
                payment credentials in your message.
              </p>
            </>
          )}

          {page === "terms" && (
            <>
              <p className="legal-updated">Last updated: {lastUpdated}</p>
              <p>
                These Terms of Service apply to your access to and use of the
                PayPulse merchant workspace and hosted payment checkout operated by
                DRL TECHS. COMPUTER SOFTWARE TRADING (“PayPulse,” “we,” “us,” or
                “our”). By using the service, you agree to these terms and
                applicable Philippine law.
              </p>

              <h2>Accounts and acceptable use</h2>
              <p>
                Provide accurate information, keep your sign-in details and MPIN
                confidential, and promptly report suspected unauthorized access.
                You are responsible for activity authorized through your
                account. Do not use PayPulse for unlawful transactions,
                impersonation, fraud, or to submit information without the
                relevant person’s authority.
              </p>

              <h2>Payments and transfers</h2>
              <p>
                PayPulse provides tools to create payment requests, display
                transaction activity, and initiate supported transfers. Payment
                and transfer services depend on third-party providers, banks,
                wallets, and networks. Availability, processing time, status
                updates, and completion are subject to those providers and their
                terms. Review the recipient, destination, amount, and fees
                before confirming an instruction. A submitted or
                provider-accepted transaction may not be reversible.
              </p>
              <p>
                Information requested from a payer or payee is provided
                voluntarily as part of their decision to use the payment flow.
                Merchants are responsible for the accuracy and lawful use of
                information they submit and for providing appropriate notices to
                their customers.
              </p>

              <h2>Fraud and responsibility</h2>
              <p>
                Users must promptly report suspected fraud to their bank or
                payment provider and to PayPulse. To the extent permitted by
                Philippine law, PayPulse is not responsible for losses caused by
                fraudulent activity involving a payer or payee, except where the
                loss results from our own breach of these terms or liability
                that cannot legally be excluded. Nothing in these terms removes
                rights or remedies that cannot be waived under applicable law.
              </p>

              <h2>Service availability and changes</h2>
              <p>
                We may update, suspend, or discontinue parts of the service to
                maintain security, comply with law, or make operational changes.
                We do not guarantee uninterrupted access or that a payment
                provider will accept or complete a transaction.
              </p>

              <h2>Privacy</h2>
              <p>
                Our handling of personal information is described in the{" "}
                <a href={APP_ROUTES.privacy}>Privacy Policy</a>. Third-party
                providers may also apply their own terms and privacy notices.
              </p>

              <h2>Governing law</h2>
              <p>
                These terms are governed by the laws of the Republic of the
                Philippines, subject to mandatory consumer, privacy, and other
                protections that apply to you.
              </p>

              <h2>Contact</h2>
              <p>
                Questions about these terms? Email{" "}
                <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
              </p>
            </>
          )}

          {page === "contact" && (
            <>
              <p className="legal-updated">
                DRL TECHS. COMPUTER SOFTWARE TRADING · Philippines
              </p>
              <p>
                Contact PayPulse support for help with your merchant account,
                payment requests, transfers, or privacy questions.
              </p>
              <a className="legal-contact-card" href={`mailto:${supportEmail}`}>
                <span>
                  <Mail size={19} />
                </span>
                <span>
                  <small>Email support</small>
                  <strong>{supportEmail}</strong>
                </span>
                <ArrowRight size={17} />
              </a>
              <h2>When reporting a payment issue</h2>
              <p>
                Include the transaction reference and current status so we can
                investigate. Do not send your MPIN, password, one-time
                verification code, or full bank or wallet credentials by email.
              </p>
              <h2>Suspected fraud or unauthorized payment</h2>
              <p>
                Contact your bank or payment provider immediately as well as
                PayPulse. Keep relevant payment references and messages for their
                review.
              </p>
              <p>
                For information about how we handle personal information, read
                our <a href={APP_ROUTES.privacy}>Privacy Policy</a>. For service
                conditions, see our{" "}
                <a href={APP_ROUTES.terms}>Terms of Service</a>.
              </p>
            </>
          )}
        </article>
      </div>

      <footer className="legal-footer">
        <LegalBrand />
        <nav aria-label="Legal">
          <a href={APP_ROUTES.privacy}>Privacy Policy</a>
          <a href={APP_ROUTES.terms}>Terms of Service</a>
          <a href={APP_ROUTES.contact}>Contact Us</a>
        </nav>
        <span>
          © {new Date().getFullYear()} DRL TECHS. COMPUTER SOFTWARE TRADING
        </span>
      </footer>
    </main>
  )
}

export function getLegalPage(pathname: string): LegalPageKind | null {
  const route = pathname.replace(/\/+$/, "") || "/"
  if (LEGAL_ROUTE_ALIASES.privacy.includes(route)) return "privacy"
  if (LEGAL_ROUTE_ALIASES.terms.includes(route)) return "terms"
  if (LEGAL_ROUTE_ALIASES.contact.includes(route)) return "contact"
  return null
}

export default LegalPage

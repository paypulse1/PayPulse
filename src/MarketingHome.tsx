import { useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleDollarSign,
  ClipboardList,
  LockKeyhole,
  Menu,
  Smartphone,
  X,
} from "lucide-react"
import "./marketing-home.css"
import "./marketing-navigation.css"
import { APP_ROUTES } from "./lib/routes"

const APK_DOWNLOAD_URL = APP_ROUTES.androidDownload

const paymentChannels = [
  {
    name: "QRPH",
    logo: "/bank-logos/qrph.svg",
    description: "Collect through supported bank and e-wallet apps.",
  },
  {
    name: "InstaPay",
    logo: "/bank-logos/instapay.png",
    description: "Send supported bank transfers in real time.",
  },
  {
    name: "PESONet",
    logo: "/bank-logos/pesonet.png",
    description: "Send supported bank transfers through PESONet.",
  },
]

const capabilities = [
  {
    number: "01",
    title: "Keep activity in view",
    description:
      "Review balances, receipts, and payment activity from one merchant workspace.",
    icon: ClipboardList,
  },
  {
    number: "02",
    title: "Give customers a clear path",
    description:
      "Create payment links and hosted checkout experiences for your business.",
    icon: CircleDollarSign,
  },
  {
    number: "03",
    title: "Work from your phone",
    description:
      "Use the DRPAY Android app to stay close to your merchant operations.",
    icon: Smartphone,
  },
]

const onboardingSteps = [
  {
    number: "01",
    title: "Set up your account",
    description:
      "Create a merchant workspace and provide your business details.",
  },
  {
    number: "02",
    title: "Configure your payment flow",
    description:
      "Choose the payment tools and methods available for your account.",
  },
  {
    number: "03",
    title: "Manage activity",
    description:
      "Follow payment status and review your merchant activity in DRPAY.",
  },
]

export default function MarketingHome() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <main className="drpay-home" id="top">
      <a className="drpay-skip-link" href="#drpay-content">
        Skip to main content
      </a>
      <header className="drpay-header">
        <nav
          className="drpay-nav"
          aria-label="Main navigation"
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsMobileMenuOpen(false)
          }}
        >
          <a className="drpay-brand" href="#top" aria-label="DRPAY home">
            <img className="drpay-brand-mark" src="/drpay-mark.svg" alt="" />
            <span>DRPAY</span>
          </a>
          <div className="drpay-nav-links">
            <a href="#capabilities">Platform</a>
            <a href="#channels">Payment methods</a>
            <a href="#how">Getting started</a>
          </div>
          <div className="drpay-nav-actions">
            <a className="drpay-login" href={APP_ROUTES.merchantSignIn}>
              Log in
            </a>
            <a
              className="drpay-button drpay-button-small"
              href={APK_DOWNLOAD_URL}
            >
              Get the app <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <button
            className="drpay-mobile-menu-toggle"
            type="button"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="drpay-mobile-menu"
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
          >
            {isMobileMenuOpen ? (
              <X size={19} aria-hidden="true" />
            ) : (
              <Menu size={19} aria-hidden="true" />
            )}
          </button>
          <div
            className="drpay-mobile-menu"
            id="drpay-mobile-menu"
            hidden={!isMobileMenuOpen}
          >
            <div className="drpay-nav-links">
              <a href="#capabilities" onClick={() => setIsMobileMenuOpen(false)}>
                Platform
              </a>
              <a href="#channels" onClick={() => setIsMobileMenuOpen(false)}>
                Payment methods
              </a>
              <a href="#how" onClick={() => setIsMobileMenuOpen(false)}>
                Getting started
              </a>
            </div>
            <div className="drpay-nav-actions">
              <a
                className="drpay-login"
                href={APP_ROUTES.merchantSignIn}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Log in
              </a>
              <a
                className="drpay-button drpay-button-small"
                href={APK_DOWNLOAD_URL}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Get the app <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
        </nav>
      </header>

      <section
        className="drpay-hero"
        id="drpay-content"
        tabIndex={-1}
        aria-labelledby="drpay-hero-title"
      >
        <div className="drpay-hero-copy">
          <p className="drpay-eyebrow">
            <span className="drpay-pulse" aria-hidden="true" />A merchant
            workspace for the way you work
          </p>
          <h1 id="drpay-hero-title">
            Payments,
            <br />
            <span>made clearer.</span>
          </h1>
          <p className="drpay-hero-text">
            Collect, track, and manage business payments with one focused
            workspace for your day-to-day operations.
          </p>
          <div className="drpay-hero-actions">
            <a className="drpay-button" href={APP_ROUTES.merchantSignIn}>
              Go to merchant sign in
              <ArrowRight size={17} aria-hidden="true" />
            </a>
            <a className="drpay-text-link" href="#capabilities">
              Explore DRPAY <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="drpay-hero-note">
            <LockKeyhole size={15} aria-hidden="true" />
            <span>Merchant access with verified-device sign-in</span>
          </div>
        </div>

        <div className="drpay-hero-visual">
          <div className="drpay-visual-orbit" aria-hidden="true" />
          <div className="drpay-visual-label">
            <span className="drpay-visual-label-dot" />
            YOUR MERCHANT WORKSPACE
          </div>
          <figure className="drpay-live-payout-frame">
            <img
              src="/marketing/drpay-live-payout.jpg"
              alt="Example DRPAY transaction confirmation screen"
              fetchPriority="high"
            />
            <figcaption>
              <span className="drpay-confirmation-mark">
                <Check size={14} aria-hidden="true" />
              </span>
              Example transaction confirmation
            </figcaption>
          </figure>
          <div className="drpay-visual-side-note" aria-hidden="true">
            <span>COLLECT</span>
            <span className="drpay-side-note-line" />
            <span>TRACK</span>
            <span className="drpay-side-note-line" />
            <span>MANAGE</span>
          </div>
        </div>
      </section>

      <section
        className="drpay-channel-section"
        id="channels"
        aria-labelledby="drpay-channels-title"
      >
        <div className="drpay-channel-intro">
          <p className="drpay-eyebrow">Payment methods</p>
          <h2 id="drpay-channels-title">Connected to local payment rails.</h2>
          <p>
            Explore supported collection and transfer methods for your merchant
            account.
          </p>
        </div>
        <div className="drpay-channel-list">
          {paymentChannels.map((channel, index) => (
            <article className="drpay-channel-card" key={channel.name}>
              <span className="drpay-channel-index">0{index + 1}</span>
              <span className="drpay-channel-logo">
                <img src={channel.logo} alt="" loading="lazy" />
              </span>
              <span className="drpay-channel-copy">
                <strong>{channel.name}</strong>
                <small>{channel.description}</small>
              </span>
              <ArrowRight
                className="drpay-channel-arrow"
                size={17}
                aria-hidden="true"
              />
            </article>
          ))}
        </div>
        <p className="drpay-disclaimer">
          Payment method availability depends on merchant onboarding, provider
          approval, and the receiving institution.
        </p>
      </section>

      <section
        className="drpay-capabilities"
        id="capabilities"
        aria-labelledby="drpay-capabilities-title"
      >
        <div className="drpay-section-heading">
          <div>
            <p className="drpay-eyebrow">One connected workspace</p>
            <h2 id="drpay-capabilities-title">
              Less switching.
              <br />
              <span>More perspective.</span>
            </h2>
          </div>
          <p>
            The tools you need to follow the flow of money and keep the details
            close at hand.
          </p>
        </div>
        <div className="drpay-capability-grid">
          {capabilities.map(({ number, title, description, icon: Icon }) => (
            <article className="drpay-capability-card" key={number}>
              <div className="drpay-capability-card-top">
                <span>{number}</span>
                <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="drpay-capability-rule" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section
        className="drpay-process"
        id="how"
        aria-labelledby="drpay-process-title"
      >
        <div className="drpay-process-intro">
          <p className="drpay-eyebrow">Getting started</p>
          <h2 id="drpay-process-title">
            A considered start.
            <br />
            <span>A clearer day.</span>
          </h2>
          <p>
            Set up your merchant workspace, configure the tools available to
            your account, and manage activity from one place.
          </p>
          <a className="drpay-process-link" href={APP_ROUTES.merchantSignIn}>
            Open merchant sign in <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <ol className="drpay-steps">
          {onboardingSteps.map((step) => (
            <li className="drpay-step" key={step.number}>
              <span className="drpay-step-number">{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
              <ArrowRight
                className="drpay-step-check"
                size={17}
                aria-hidden="true"
              />
            </li>
          ))}
        </ol>
      </section>

      <section
        className="drpay-security"
        id="security"
        aria-labelledby="drpay-security-title"
      >
        <span className="drpay-security-icon">
          <LockKeyhole size={23} aria-hidden="true" />
        </span>
        <div>
          <p className="drpay-eyebrow">Access with care</p>
          <h2 id="drpay-security-title">
            Your account.
            <br />
            <span>Protected at sign in.</span>
          </h2>
        </div>
        <div className="drpay-security-copy">
          <p>
            Merchant sign-in supports verified-device checks and an MPIN.
            Biometric sign-in is available on supported devices when enabled.
          </p>
          <a href={APP_ROUTES.merchantSignIn}>
            Sign in to your account <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="drpay-cta" aria-labelledby="drpay-cta-title">
        <div className="drpay-cta-art" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="drpay-eyebrow">Your next step starts here</p>
        <h2 id="drpay-cta-title">
          Make room for
          <br />
          <span>clearer payments.</span>
        </h2>
        <div className="drpay-cta-actions">
          <a
            className="drpay-button drpay-button-light"
            href={APK_DOWNLOAD_URL}
          >
            Download DRPAY for Android
            <ArrowRight size={17} aria-hidden="true" />
          </a>
          <a className="drpay-cta-login" href={APP_ROUTES.merchantSignIn}>
            Already have an account? Log in
          </a>
        </div>
      </section>

      <footer className="drpay-footer">
        <a className="drpay-brand" href="#top" aria-label="DRPAY home">
          <img className="drpay-brand-mark" src="/drpay-mark.svg" alt="" />
          <span>DRPAY</span>
        </a>
        <p>Merchant payments, made clearer.</p>
        <nav aria-label="Footer navigation">
          <a href={APP_ROUTES.privacy}>Privacy</a>
          <a href={APP_ROUTES.terms}>Terms</a>
          <a href={APP_ROUTES.contact}>Contact</a>
        </nav>
        <span className="drpay-copyright">© 2026 DRPAY</span>
      </footer>
    </main>
  )
}

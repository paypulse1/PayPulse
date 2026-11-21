import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleDollarSign,
  ClipboardList,
  LockKeyhole,
  Smartphone,
} from "lucide-react"
import { APP_ROUTES } from "../lib/routes"
import PayPulseLogo from "../PayPulseLogo"
import SupportedByLogos from "../SupportedByLogos"

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
      "Use the PayPulse Android app to stay close to your merchant operations.",
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
      "Follow payment status and review your merchant activity in PayPulse.",
  },
]

export function PaymentChannelsSection() {
  return (
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
  )
}

export function CapabilitiesSection() {
  return (
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
  )
}

export function GettingStartedSection() {
  return (
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
          Set up your merchant workspace, configure the tools available to your
          account, and manage activity from one place.
        </p>
        <a className="drpay-process-link" href={APP_ROUTES.merchantSignIn}>
          Open merchant sign-in <ArrowRight size={16} aria-hidden="true" />
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
  )
}

export function SecuritySection() {
  return (
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
  )
}

export function DownloadSection() {
  return (
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
          href={APP_ROUTES.androidLiveApk}
          download
        >
          Download PayPulse Live APK
          <ArrowRight size={17} aria-hidden="true" />
        </a>
        <a
          className="drpay-cta-login"
          href={APP_ROUTES.androidAppListing}
          target="_blank"
          rel="noopener noreferrer"
        >
          Also available on Google Play
        </a>
        <a className="drpay-cta-login" href={APP_ROUTES.merchantSignIn}>
          Already have an account? Sign in
        </a>
      </div>
    </section>
  )
}

export function MarketingFooter() {
  return (
    <footer className="drpay-footer">
      <a className="drpay-brand" href="#top" aria-label="PayPulse home">
        <PayPulseLogo
          className="drpay-brand-mark pulsepay-brand-mark"
          showName
          nameClassName="drpay-wordmark"
        />
      </a>
      <p>Merchant payments, made clearer.</p>
      <SupportedByLogos />
      <a
        className="drpay-footer-play"
        href={APP_ROUTES.androidAppListing}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download the PayPulse Android app"
      >
        <span>DOWNLOAD</span>
        <strong>Android app</strong>
        <ArrowRight size={14} aria-hidden="true" />
      </a>
      <nav aria-label="Footer navigation">
        <a href={APP_ROUTES.privacy}>Privacy</a>
        <a href={APP_ROUTES.terms}>Terms</a>
        <a href={APP_ROUTES.contact}>Contact</a>
      </nav>
    </footer>
  )
}

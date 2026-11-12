import { ArrowDown, ArrowRight, Check, LockKeyhole } from "lucide-react"
import "./marketing-home.css"
import "./marketing-navigation.css"
import { APP_ROUTES } from "./lib/routes"
import MarketingNavigation from "./marketing/MarketingNavigation"
import {
  CapabilitiesSection,
  DownloadSection,
  GettingStartedSection,
  MarketingFooter,
  PaymentChannelsSection,
  SecuritySection,
} from "./marketing/MarketingSections"

function HeroSection() {
  return (
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
            Go to merchant sign-in
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
        <div className="drpay-phone-showcase">
          <figure className="drpay-phone-frame drpay-phone-frame-banks">
            <img
              src="/IMG_20261101_183405_701.jpg"
              alt="DRPAY bank and wallet selection screen"
              loading="lazy"
            />
            <figcaption>Choose a bank or wallet</figcaption>
          </figure>
          <figure className="drpay-phone-frame drpay-phone-frame-transfer">
            <img
              src="/IMG_20261101_183405_888.jpg"
              alt="DRPAY transfer form with recipient and amount fields"
              fetchPriority="high"
            />
            <figcaption>
              <span className="drpay-confirmation-mark">
                <Check size={14} aria-hidden="true" />
              </span>
              A clear path to send
            </figcaption>
          </figure>
        </div>
        <div className="drpay-visual-side-note" aria-hidden="true">
          <span>COLLECT</span>
          <span className="drpay-side-note-line" />
          <span>TRACK</span>
          <span className="drpay-side-note-line" />
          <span>MANAGE</span>
        </div>
      </div>
    </section>
  )
}

export default function MarketingHome() {
  return (
    <main className="drpay-home" id="top">
      <a className="drpay-skip-link" href="#drpay-content">
        Skip to main content
      </a>
      <MarketingNavigation />
      <HeroSection />
      <PaymentChannelsSection />
      <CapabilitiesSection />
      <GettingStartedSection />
      <SecuritySection />
      <DownloadSection />
      <MarketingFooter />
    </main>
  )
}

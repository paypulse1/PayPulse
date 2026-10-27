import { useEffect, useRef } from "react"
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  CircleDollarSign,
  Download,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  Smartphone,
  WalletCards,
} from "lucide-react"
import "./marketing-home.css"
import LegalPage, { getLegalPage, supportEmail } from "./LegalPages"
import { APP_ROUTES } from "./lib/routes"

const apkUrl = APP_ROUTES.androidDownload

function Brand() {
  return (
    <a
      className="marketing-brand"
      href={APP_ROUTES.home}
      aria-label="DRPAY home"
    >
      <img src="/drpay-mark.png" alt="" />
      <strong>DRPAY</strong>
    </a>
  )
}

function ProductPreview() {
  return (
    <div
      className="preview-wrap"
      aria-label="Illustrative preview of the DRPAY merchant app"
    >
      <div className="preview-orbit preview-orbit-one" aria-hidden="true" />
      <div className="preview-orbit preview-orbit-two" aria-hidden="true" />
      <div className="preview-window">
        <header className="preview-header">
          <div className="preview-brand">
            <img src="/drpay-mark.png" alt="" />
            <strong>DRPAY</strong>
          </div>
          <span className="preview-status">
            <i /> MERCHANT WORKSPACE
          </span>
        </header>
        <div className="preview-main">
          <div className="preview-heading">
            <div>
              <span>MERCHANT OVERVIEW</span>
              <strong>Your payment activity</strong>
            </div>
            <span className="preview-avatar">DR</span>
          </div>
          <div className="preview-balance">
            <div className="preview-balance-top">
              <span>Available Balance</span>
              <LockKeyhole size={13} />
            </div>
            <strong>••••••••</strong>
            <div>
              <i />
              <span>Sign in to view your account</span>
            </div>
          </div>
          <div className="preview-actions">
            <div>
              <span className="preview-action-collect">
                <QrCode size={19} />
              </span>
              <strong>Collect</strong>
              <small>Payment links & QR</small>
            </div>
            <div>
              <span className="preview-action-transfer">
                <ArrowUpRight size={19} />
              </span>
              <strong>Transfer</strong>
              <small>Review before sending</small>
            </div>
            <div>
              <span className="preview-action-activity">
                <WalletCards size={19} />
              </span>
              <strong>Activity</strong>
              <small>Track every status</small>
            </div>
          </div>
          <div className="preview-activity">
            <div className="preview-activity-title">
              <strong>Recent Activity</strong>
              <span>EXAMPLE ONLY</span>
            </div>
            <div className="preview-activity-row">
              <span className="activity-icon income">
                <ArrowDownLeft size={15} />
              </span>
              <span>
                <strong>Incoming payment</strong>
                <small>QRPH collection</small>
              </span>
              <b>Received</b>
            </div>
            <div className="preview-activity-row">
              <span className="activity-icon payout">
                <ArrowUpRight size={15} />
              </span>
              <span>
                <strong>Outgoing transfer</strong>
                <small>InstaPay · PESONet</small>
              </span>
              <b>Review</b>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-note">
        <ShieldCheck size={15} />
        <span>Illustrative preview · account details stay private</span>
      </div>
    </div>
  )
}

export default function MarketingHome() {
  const legalPage = getLegalPage(window.location.pathname)
  const marketingRootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = marketingRootRef.current
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return
    const revealItems = [...root.querySelectorAll<HTMLElement>("[data-reveal]")]
    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.setAttribute("data-visible", "true"))
      return
    }

    root.classList.add("marketing-motion-ready")
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.setAttribute("data-visible", "true")
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    )
    revealItems.forEach((item) => observer.observe(item))

    return () => {
      observer.disconnect()
      root.classList.remove("marketing-motion-ready")
    }
  }, [])

  if (legalPage) return <LegalPage page={legalPage} />

  return (
    <main className="marketing-shell" ref={marketingRootRef}>
      <nav className="marketing-nav" aria-label="Main navigation">
        <Brand />
        <div className="marketing-nav-links">
          <a href={APP_ROUTES.capabilities}>Capabilities</a>
          <a href={APP_ROUTES.workflow}>How it works</a>
          <a href={APP_ROUTES.security}>Security</a>
        </div>
        <a className="nav-login" href={APP_ROUTES.merchantSignIn}>
          Merchant sign in <ArrowRight size={15} />
        </a>
      </nav>

      <section className="marketing-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="marketing-eyebrow">
            <i /> CROSS-BORDER PAYMENTS · KOREA ↔ PHILIPPINES
          </span>
          <h1 id="hero-title">
            KRW to PHP checkout, <em>with a clearer next step.</em>
          </h1>
          <p>
            Create Korean Won checkouts with a PHP reference quote and manage
            merchant collections in one place. Explore casino payment
            integrations and a planned faster USDT purchase journey for Korean
            users; in-app USDT buying is not yet connected.
          </p>
          <div className="hero-actions">
            <a className="hero-primary" href={APP_ROUTES.merchantSignIn}>
              Sign in to DRPAY <ArrowRight size={17} />
            </a>
            {apkUrl ? (
              <a className="hero-download" href={apkUrl}>
                <Download size={17} />
                Download Android app
              </a>
            ) : (
              <span
                className="hero-download unavailable"
                aria-label="Android app is not available"
              >
                <Download size={17} />
                Android app unavailable
              </span>
            )}
          </div>
          <div className="hero-assurance">
            <LockKeyhole size={15} />
            <span>
              Email-verified new devices · MPIN-protected transfers · optional
              biometrics on supported Android devices.
            </span>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section
        className="android-release-band"
        aria-labelledby="android-release-title"
        data-reveal
      >
        <div className="android-release-icon">
          <Smartphone size={23} />
        </div>
        <div className="android-release-copy">
          <span className="marketing-eyebrow">DRPAY FOR ANDROID</span>
          <h2 id="android-release-title">Your workspace, ready to go.</h2>
          <p>
            Download the latest signed Android app directly from DRPAY’s GitHub
            release. Sign in with your merchant account to get started.
          </p>
        </div>
        <div className="android-release-action">
          {apkUrl ? (
            <a className="android-release-download" href={apkUrl}>
              <Download size={16} />
              Download latest APK
            </a>
          ) : (
            <span className="android-release-download unavailable">
              <Download size={16} />
              Android app unavailable
            </span>
          )}
          <small>Android only · Always points to the latest release</small>
        </div>
      </section>

      <section
        className="workflow-strip"
        id="workflow"
        aria-labelledby="workflow-title"
        data-reveal
      >
        <div className="workflow-intro">
          <span className="marketing-eyebrow">A SIMPLE WORKFLOW</span>
          <h2 id="workflow-title">From checkout to clear next steps.</h2>
        </div>
        <div>
          <span>01</span>
          <strong>Share a checkout</strong>
          <small>
            Create a hosted payment link or QRPH checkout for your customer.
          </small>
        </div>
        <ArrowRight className="workflow-arrow" size={18} aria-hidden="true" />
        <div>
          <span>02</span>
          <strong>Track confirmation</strong>
          <small>
            Follow payment status and review confirmed collection activity.
          </small>
        </div>
        <ArrowRight className="workflow-arrow" size={18} aria-hidden="true" />
        <div>
          <span>03</span>
          <strong>Choose your next step</strong>
          <small>
            Make a provider transfer or request a floating-balance payout.
          </small>
        </div>
      </section>

      <section
        className="merchant-scenes"
        aria-labelledby="merchant-scenes-title"
        data-reveal
      >
        <div className="merchant-scenes-heading">
          <div>
            <span className="marketing-eyebrow">
              CASINO PAYMENTS · KRW TO PHP · USDT
            </span>
            <h2 id="merchant-scenes-title">
              Built for cross-border payment flows.
            </h2>
          </div>
          <p>
            Bring casino payment integration and Korean Won checkout into focus,
            with a transparent view of the USDT purchase path for Korean users.
          </p>
        </div>
        <div className="merchant-scenes-grid">
          <article className="merchant-scene-card merchant-scene-card-casino">
            <div className="merchant-scene-photo">
              <img
                src="/marketing/payment-integration.jpg"
                alt="Customer completing a mobile payment at a payment terminal"
                loading="lazy"
              />
              <span>CASINO PAYMENT INTEGRATION</span>
            </div>
            <div className="merchant-scene-copy">
              <h3>Casino payment integration</h3>
              <p>
                Connect eligible gaming checkouts with payment collection and
                status workflows. Licensing, compliance review, and processing
                partner approval are required.
              </p>
            </div>
            <a
              className="photo-credit"
              href="https://commons.wikimedia.org/wiki/File:Mobile_payment_03.JPG"
              target="_blank"
              rel="noreferrer"
            >
              HLundgaard · CC BY-SA 3.0
            </a>
            <a
              className="service-contact-link"
              href={`mailto:${supportEmail}?subject=${encodeURIComponent("Casino payment integration")}`}
            >
              Discuss an integration <ArrowRight size={14} aria-hidden="true" />
            </a>
          </article>
          <article className="merchant-scene-card merchant-scene-card-krw">
            <div className="merchant-scene-photo">
              <img
                src="/marketing/currency-exchange.jpg"
                alt="Currency exchange kiosks and international exchange-rate boards"
                loading="lazy"
              />
              <span>KOREAN WON → PHILIPPINE PESO</span>
            </div>
            <div className="merchant-scene-copy">
              <h3>KRW checkout with a PHP quote</h3>
              <p>
                Create a Korean Won checkout and review its PHP reference amount
                before sharing. The quote and final settlement follow provider
                terms.
              </p>
            </div>
            <a
              className="photo-credit"
              href="https://commons.wikimedia.org/wiki/File:Currency_exchange_machine.jpg"
              target="_blank"
              rel="noreferrer"
            >
              Tiia Monto · CC BY 4.0
            </a>
            <a
              className="service-contact-link"
              href={APP_ROUTES.merchantSignIn}
            >
              Open merchant workspace{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </article>
          <article className="merchant-scene-card merchant-scene-card-usdt">
            <div className="merchant-scene-photo">
              <img
                src="/marketing/crypto-transaction.jpg"
                alt="A hardware digital-asset wallet connected to a laptop displaying a transaction"
                loading="lazy"
              />
              <span>KRW → USDT · INTEGRATION PATH</span>
            </div>
            <div className="merchant-scene-copy">
              <h3>A faster USDT route for Korean users</h3>
              <p>
                Designed to streamline the journey from Korean Won to USDT.
                DRPAY in-app USDT buying is not yet connected; purchase speed,
                rates, and availability are not currently offered.
              </p>
            </div>
            <a
              className="photo-credit"
              href="https://commons.wikimedia.org/wiki/File:An_actual_Bitcoin_transaction_from_the_Kraken_cryptocurrency_exchange_to_a_hardware_LedgerWallet.jpg"
              target="_blank"
              rel="noreferrer"
            >
              FlippyFlink · CC BY-SA 4.0
            </a>
            <a
              className="service-contact-link"
              href={`mailto:${supportEmail}?subject=${encodeURIComponent("USDT purchase integration for Korean users")}`}
            >
              Ask about USDT integration{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </article>
        </div>
        <p className="merchant-scenes-note">
          Photos are illustrative. Casino processing requires eligibility and
          partner approval. KRW checkout is subject to provider terms. USDT
          buying is not currently available in the DRPAY app.
        </p>
      </section>

      <section
        className="market-updates"
        aria-labelledby="market-updates-title"
        data-reveal
      >
        <div className="market-updates-heading">
          <div>
            <span className="marketing-eyebrow">INDUSTRY NEWS · EVENTS</span>
            <h2 id="market-updates-title">What’s moving across the region.</h2>
          </div>
          <p>
            Dated reporting and event information from independent publishers.
            Listings checked 26 October 2026.
          </p>
        </div>
        <div className="market-updates-grid">
          <article className="market-update-card">
            <div className="market-update-meta">
              <span>PAYMENTS · NEWS</span>
              <time dateTime="2026-10-19">19 Oct 2026</time>
            </div>
            <h3>Paymentology partners with Asia United Bank</h3>
            <p>
              Paymentology says its issuing and processing platform will support
              AUB’s digital ecosystem, including HelloMoney, mobile banking, QR
              Ph, and digital transfers.
            </p>
            <a
              href="https://www.paymentology.com/newsroom/paymentology-powers-asia-united-banks-digital-payments-surge-in-the-philippines"
              target="_blank"
              rel="noreferrer"
            >
              Read Paymentology’s announcement{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </article>
          <article className="market-update-card">
            <div className="market-update-meta">
              <span>CRYPTO · NEWS</span>
              <time dateTime="2026-10-23">23 Oct 2026</time>
            </div>
            <h3>Chainlink and LG CNS sign Korean stablecoin deal</h3>
            <p>
              The Paypers reports a new partnership involving Chainlink, LG CNS,
              and a Korean stablecoin initiative.
            </p>
            <a
              href="https://thepaypers.com/cryptocurrencies/news/chainlink-lg-cns-sign-korean-stablecoin-deal"
              target="_blank"
              rel="noreferrer"
            >
              Read The Paypers report{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </article>
          <article className="market-update-card">
            <div className="market-update-meta">
              <span>ONLINE GAMING · NEWS</span>
              <time dateTime="2026-10-19">19 Oct 2026</time>
            </div>
            <h3>PAGCOR targets December launch for licensed-site app</h3>
            <p>
              Inside Asian Gaming reports that PAGCOR is targeting a December
              launch for an app to identify licensed online gambling sites.
            </p>
            <a
              href="https://news.google.com/rss/articles/CBMiuAFBVV95cUxPY2I5T1VPZnhHYkk4bGJJa3c1ZW9Mc0lXeERyWkZETWVRdkRRZ0pVOFYyVzdUQnE4dmdFY3FzbTZoSzhIbVo1SWFBM1AtYW44MVRQTTNGM3N5YjVGUnp6LXVPcWY2aXJ4OHJhUUZZeFRKTVR4TzVMdlBSVUpwRU1uNlZsUFFIbVllTi1KZXN6dnctNkNyMXJndEMwZ25zbVZqTmVzSnNkOTdEdmo2ejhSOEtiQ3luaVNH?oc=5"
              target="_blank"
              rel="noreferrer"
            >
              Read Inside Asian Gaming coverage{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </article>
          <article className="market-update-card market-event-card">
            <div className="market-update-meta">
              <span>CASINO INDUSTRY · UPCOMING EVENT</span>
              <time dateTime="2026-11-12">12–13 Nov 2026</time>
            </div>
            <h3>SPiCE International 2026 · Cebu</h3>
            <p>
              Yogonet’s event listing names Cebu as the host city for this
              casino-industry gathering. Confirm venue and registration details
              with the organizer before making plans.
            </p>
            <a
              href="https://news.google.com/rss/articles/CBMixgFBVV95cUxQWEZhdk0xT1V6UDJiWFhodm1ieFNFYnQxcl9vMDdaTDlfT2xBdmtRMjJsWGtQbEZZSjNUbzREMlhmRlc3dlFnTVF3bWl2S2xZb1ptNEdEU3hHWEtkTnF3TzN1UU9XXzU3TkZSUHRzbFJyUU8xNDJtUVJaYzFvTHdyM1AwSEtXNEtDTnE4U3hzUGU2NVVIeWdiQnJNekpJTU90N01KY01WV0JLMlpJZXJSODFVa0x2eEROZk8yZG1PNVI3V2xuMmc?oc=5"
              target="_blank"
              rel="noreferrer"
            >
              Read Yogonet’s event listing{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </article>
        </div>
        <p className="market-updates-note">
          DRPAY does not organize or endorse these third-party events or
          announcements. Follow the linked publishers for updates.
        </p>
      </section>

      <section
        className="marketing-band"
        id="capabilities"
        aria-labelledby="capabilities-title"
        data-reveal
      >
        <div className="band-heading">
          <div>
            <span className="marketing-eyebrow">THE DRPAY WORKSPACE</span>
            <h2 id="capabilities-title">The essentials, clearly connected.</h2>
          </div>
          <p>
            Keep payment requests, balances, and transaction activity close
            together—and review transfer details before you send.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature-item">
            <span className="feature-icon feature-gold">
              <QrCode size={21} />
            </span>
            <h3>Request payments</h3>
            <p>
              Create a hosted payment request and share a checkout link or QRPH
              code. Follow its status through provider confirmation.
            </p>
            <a href={APP_ROUTES.merchantSignIn}>
              Go to merchant sign in <ChevronRight size={15} />
            </a>
          </article>
          <article className="feature-item">
            <span className="feature-icon feature-blue">
              <CircleDollarSign size={21} />
            </span>
            <h3>Prepare bank transfers</h3>
            <p>
              Transfer from your merchant ledger using a supported bank rail.
              Review recipient details and approve with your MPIN.
            </p>
            <a href={APP_ROUTES.merchantSignIn}>
              Go to merchant sign in <ChevronRight size={15} />
            </a>
          </article>
          <article className="feature-item">
            <span className="feature-icon feature-navy">
              <WalletCards size={21} />
            </span>
            <h3>Review wallet activity</h3>
            <p>
              Review payment and provider-transfer activity alongside
              floating-balance requests and their statuses.
            </p>
            <a href={APP_ROUTES.merchantSignIn}>
              Go to merchant sign in <ChevronRight size={15} />
            </a>
          </article>
        </div>
      </section>

      <section
        className="security-band"
        id="security"
        aria-labelledby="security-title"
        data-reveal
      >
        <div className="security-mark">
          <BadgeCheck size={24} />
        </div>
        <div>
          <span className="marketing-eyebrow">SECURITY AT EVERY STEP</span>
          <h2 id="security-title">Your account, with deliberate checks.</h2>
        </div>
        <p>
          Verify new devices by email, sign in on trusted devices with your
          MPIN, and approve provider transfers with MPIN. Strong biometrics are
          optional on supported Android devices. Provider credentials stay on
          the backend.
        </p>
        <a href={APP_ROUTES.merchantSignIn}>
          Sign in securely <ArrowRight size={16} />
        </a>
      </section>

      <section className="closing-cta" data-reveal>
        <div>
          <span className="marketing-eyebrow">
            BUILT FOR MERCHANT WORKFLOWS
          </span>
          <h2>Make your next payment step easier to see.</h2>
        </div>
        <a
          className="hero-primary"
          href={APP_ROUTES.merchantSignIn}
        >
          Open your workspace <ArrowRight size={17} />
        </a>
      </section>

      <footer className="marketing-footer">
        <div className="footer-brand-column">
          <Brand />
          <p>
            Hosted payment requests, provider transfers, floating-balance
            requests, and account activity in one merchant workspace.
          </p>
        </div>
        <div className="footer-link-column">
          <strong>Explore</strong>
          <a href={APP_ROUTES.capabilities}>Capabilities</a>
          <a href={APP_ROUTES.workflow}>How it works</a>
          <a href={APP_ROUTES.security}>Security</a>
        </div>
        <div className="footer-link-column">
          <strong>DRPAY</strong>
          <a href={APP_ROUTES.merchantSignIn}>Merchant sign in</a>
          {apkUrl && (
            <a href={apkUrl}>
              Android app <Download size={13} />
            </a>
          )}
          <a href={APP_ROUTES.privacy}>Privacy Policy</a>
          <a href={APP_ROUTES.terms}>Terms of Service</a>
          <a href={APP_ROUTES.contact}>Contact Us</a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} DRPAY</span>
          <span>Accept payments. Keep every step in view.</span>
        </div>
      </footer>
    </main>
  )
}

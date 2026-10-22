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
  WalletCards,
} from "lucide-react";
import "./marketing-home.css";

const apkUrl = import.meta.env.VITE_ANDROID_APK_URL?.trim()
  || "https://github.com/blackhorsecn/drpay-merchant/releases/latest/download/drpay.apk";

function Brand() {
  return (
    <a className="marketing-brand" href="/" aria-label="DRPAY home">
      <img src="/drpay-mark.png" alt="" />
      <strong>DRPAY</strong>
    </a>
  );
}

function ProductPreview() {
  return (
    <div className="preview-wrap" aria-label="Illustrative preview of the DRPAY merchant app">
      <div className="preview-orbit preview-orbit-one" aria-hidden="true" />
      <div className="preview-orbit preview-orbit-two" aria-hidden="true" />
      <div className="preview-window">
        <header className="preview-header">
          <div className="preview-brand"><img src="/drpay-mark.png" alt="" /><strong>DRPAY</strong></div>
          <span className="preview-status"><i /> MERCHANT WORKSPACE</span>
        </header>
        <div className="preview-main">
          <div className="preview-heading">
            <div><span>MERCHANT OVERVIEW</span><strong>Your payment activity</strong></div>
            <span className="preview-avatar">DR</span>
          </div>
          <div className="preview-balance">
            <div className="preview-balance-top"><span>AVAILABLE BALANCE</span><LockKeyhole size={13} /></div>
            <strong>••••••••</strong>
            <div><i /><span>Sign in to view your account</span></div>
          </div>
          <div className="preview-actions">
            <div><span className="preview-action-collect"><QrCode size={19} /></span><strong>Collect</strong><small>Payment links & QR</small></div>
            <div><span className="preview-action-transfer"><ArrowUpRight size={19} /></span><strong>Transfer</strong><small>Review before sending</small></div>
            <div><span className="preview-action-activity"><WalletCards size={19} /></span><strong>Activity</strong><small>Track every status</small></div>
          </div>
          <div className="preview-activity">
            <div className="preview-activity-title"><strong>Recent activity</strong><span>EXAMPLE ONLY</span></div>
            <div className="preview-activity-row"><span className="activity-icon income"><ArrowDownLeft size={15} /></span><span><strong>Incoming payment</strong><small>QR Ph collection</small></span><b>Received</b></div>
            <div className="preview-activity-row"><span className="activity-icon payout"><ArrowUpRight size={15} /></span><span><strong>Outgoing transfer</strong><small>InstaPay · PESONet</small></span><b>Review</b></div>
          </div>
        </div>
      </div>
      <div className="preview-note"><ShieldCheck size={15} /><span>Illustrative preview · account details stay private</span></div>
    </div>
  );
}

export default function MarketingHome() {
  return (
    <main className="marketing-shell">
      <nav className="marketing-nav" aria-label="Main navigation">
        <Brand />
        <div className="marketing-nav-links">
          <a href="#capabilities">Capabilities</a>
          <a href="#workflow">How it works</a>
          <a href="#balances">Balances</a>
          <a href="#security">Security</a>
        </div>
        <a className="nav-login" href="/app">Merchant sign in <ArrowRight size={15} /></a>
      </nav>

      <section className="marketing-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="marketing-eyebrow"><i /> MERCHANT PAYMENTS, IN ONE WORKSPACE</span>
          <h1 id="hero-title">Accept payments. Keep every step <em>in view.</em></h1>
          <p>Create hosted payment links and QR Ph checkouts, track provider-confirmed activity, and understand your balances in one merchant workspace.</p>
          <div className="hero-actions">
            <a className="hero-primary" href="/app">Open merchant workspace <ArrowRight size={17} /></a>
            {apkUrl ? (
              <a className="hero-download" href={apkUrl}><Download size={17} />Get the Android app</a>
            ) : (
              <span className="hero-download unavailable" aria-label="Android app is not available"><Download size={17} />Android app unavailable</span>
            )}
          </div>
          <div className="hero-assurance"><LockKeyhole size={15} /><span>Email-verified new devices · MPIN-protected transfers · optional biometrics on supported Android devices.</span></div>
        </div>
        <ProductPreview />
      </section>

      <section className="workflow-strip" id="workflow" aria-labelledby="workflow-title">
        <div className="workflow-intro"><span className="marketing-eyebrow">A SIMPLE WORKFLOW</span><h2 id="workflow-title">From checkout to clear next steps.</h2></div>
        <div><span>01</span><strong>Share a checkout</strong><small>Create a hosted payment link or QR Ph checkout for your customer.</small></div>
        <ArrowRight className="workflow-arrow" size={18} aria-hidden="true" />
        <div><span>02</span><strong>Track confirmation</strong><small>Follow payment status and review confirmed collection activity.</small></div>
        <ArrowRight className="workflow-arrow" size={18} aria-hidden="true" />
        <div><span>03</span><strong>Choose your next step</strong><small>Make a provider transfer or request a floating-balance payout.</small></div>
      </section>

      <section className="marketing-band" id="capabilities" aria-labelledby="capabilities-title">
        <div className="band-heading">
          <div><span className="marketing-eyebrow">THE DRPAY WORKSPACE</span><h2 id="capabilities-title">The essentials, clearly connected.</h2></div>
          <p>Keep payment requests, balances, and transaction activity close together—and review transfer details before you send.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-item">
            <span className="feature-icon feature-gold"><QrCode size={21} /></span>
            <h3>Request payments</h3>
            <p>Create a hosted payment request and share a checkout link or QR Ph code. Follow its status through provider confirmation.</p>
            <a href="/app">Go to merchant sign in <ChevronRight size={15} /></a>
          </article>
          <article className="feature-item">
            <span className="feature-icon feature-blue"><CircleDollarSign size={21} /></span>
            <h3>Prepare bank transfers</h3>
            <p>Transfer from your SwiftPay available balance using a supported bank rail. Review recipient details and approve with your MPIN.</p>
            <a href="/app">Go to merchant sign in <ChevronRight size={15} /></a>
          </article>
          <article className="feature-item">
            <span className="feature-icon feature-navy"><WalletCards size={21} /></span>
            <h3>Review wallet activity</h3>
            <p>Review payment and provider-transfer activity alongside floating-balance requests and their statuses.</p>
            <a href="/app">Go to merchant sign in <ChevronRight size={15} /></a>
          </article>
        </div>
      </section>

      <section className="funds-band" id="balances" aria-labelledby="balances-title">
        <div className="funds-heading">
          <span className="marketing-eyebrow">BALANCES, WITHOUT THE GUESSWORK</span>
          <h2 id="balances-title">Two balances. Two different transfer paths.</h2>
          <p>DRPAY keeps your provider balance separate from your floating balance, so you can see which funds each action uses.</p>
        </div>
        <div className="funds-grid">
          <article className="funds-card">
            <span className="funds-card-label">PROVIDER ACCOUNT</span>
            <h3>SwiftPay available balance</h3>
            <p>Use the Transfer flow to send to a supported bank or wallet through an available provider rail. Review the recipient and authorize with your MPIN.</p>
          </article>
          <article className="funds-card funds-card-highlight">
            <span className="funds-card-label">DRPAY FLOATING BALANCE</span>
            <h3>Request a reviewed payout</h3>
            <p>Successful collections are credited net of the configured collection fee. Request a transfer to your saved account; pending requests reserve the payout and fixed fee while an admin reviews them.</p>
          </article>
        </div>
        <p className="funds-disclaimer">A floating-balance request is not an instant bank transfer. When approved, the payout is arranged manually outside the app. Its status and any configured transfer fee are shown in your workspace.</p>
      </section>

      <section className="security-band" id="security" aria-labelledby="security-title">
        <div className="security-mark"><BadgeCheck size={24} /></div>
        <div><span className="marketing-eyebrow">SECURITY AT EVERY STEP</span><h2 id="security-title">Your account, with deliberate checks.</h2></div>
        <p>Verify new devices by email, sign in on trusted devices with your MPIN, and approve provider transfers with MPIN. Strong biometrics are optional on supported Android devices. Provider credentials stay on the backend.</p>
        <a href="/app">Sign in securely <ArrowRight size={16} /></a>
      </section>

      <section className="closing-cta">
        <div><span className="marketing-eyebrow">BUILT FOR MERCHANT WORKFLOWS</span><h2>Make your next payment step easier to see.</h2></div>
        <a className="hero-primary" href="/app">Open your workspace <ArrowRight size={17} /></a>
      </section>

      <footer className="marketing-footer">
        <div className="footer-brand-column">
          <Brand />
          <p>Hosted payment requests, provider transfers, floating-balance requests, and account activity in one merchant workspace.</p>
        </div>
        <div className="footer-link-column">
          <strong>Explore</strong>
          <a href="#capabilities">Capabilities</a>
          <a href="#workflow">How it works</a>
          <a href="#balances">Balances</a>
          <a href="#security">Security</a>
        </div>
        <div className="footer-link-column">
          <strong>DRPAY</strong>
          <a href="/app">Merchant sign in</a>
          {apkUrl && <a href={apkUrl}>Android app <Download size={13} /></a>}
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} DRPAY</span>
          <span>Accept payments. Keep every step in view.</span>
        </div>
      </footer>
    </main>
  );
}

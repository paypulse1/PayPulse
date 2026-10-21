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

const apkUrl = import.meta.env.VITE_ANDROID_APK_URL?.trim();

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
    <div className="preview-wrap" aria-label="Preview of the DRPAY merchant app">
      <div className="preview-window">
        <header className="preview-header">
          <div className="preview-brand"><img src="/drpay-mark.png" alt="" /><strong>DRPAY</strong></div>
          <span className="preview-status"><i /> MERCHANT WORKSPACE</span>
        </header>
        <div className="preview-main">
          <div className="preview-heading">
            <div><span>YOUR BUSINESS</span><strong>Money movement</strong></div>
            <span className="preview-avatar">DR</span>
          </div>
          <div className="preview-balance">
            <span>WALLET OVERVIEW</span>
            <strong>••••••••</strong>
            <div><i /><span>Balance shown after secure sign in</span></div>
          </div>
          <div className="preview-actions">
            <div><span><QrCode size={19} /></span><strong>Collect</strong></div>
            <div><span><ArrowUpRight size={19} /></span><strong>Transfer</strong></div>
            <div><span><WalletCards size={19} /></span><strong>Activity</strong></div>
          </div>
          <div className="preview-activity">
            <div className="preview-activity-title"><strong>Transaction status</strong><span>PRODUCT PREVIEW</span></div>
            <div className="preview-activity-row"><span className="activity-icon income"><ArrowDownLeft size={15} /></span><span><strong>Collection flow</strong><small>Checkout creation example</small></span><b>Example</b></div>
            <div className="preview-activity-row"><span className="activity-icon payout"><ArrowUpRight size={15} /></span><span><strong>Bank transfer</strong><small>Status reconciliation example</small></span><b>Example</b></div>
          </div>
        </div>
      </div>
      <div className="preview-note"><ShieldCheck size={15} /><span>Private by design. Your account data stays behind sign-in.</span></div>
    </div>
  );
}

export default function MarketingHome() {
  return (
    <main className="marketing-shell">
      <nav className="marketing-nav" aria-label="Main navigation">
        <Brand />
        <div className="marketing-nav-links">
          <a href="#tools">Tools</a>
          <a href="#security">Security</a>
        </div>
        <a className="nav-login" href="/app">Merchant sign in <ArrowRight size={15} /></a>
      </nav>

      <section className="marketing-hero">
        <div className="hero-copy">
          <span className="marketing-eyebrow"><i /> MERCHANT PAYMENTS, MADE CLEAR</span>
          <h1>Make money movement feel <em>simple.</em></h1>
          <p>One focused workspace for merchant collections, bank transfers, and payment activity. Built to help you stay on top of every step.</p>
          <div className="hero-actions">
            <a className="hero-primary" href="/app">Open merchant app <ArrowRight size={17} /></a>
            {apkUrl ? (
              <a className="hero-download" href={apkUrl} download="DRPAY.apk"><Download size={17} />Download Android APK</a>
            ) : (
              <span className="hero-download unavailable" aria-label="Android APK is not configured"><Download size={17} />APK file not added</span>
            )}
          </div>
          <div className="hero-assurance"><LockKeyhole size={15} /><span>Secure sign-in · Private merchant workspace</span></div>
        </div>
        <ProductPreview />
      </section>

      <section className="marketing-band" id="tools">
        <div className="band-heading">
          <span className="marketing-eyebrow">A BETTER DAILY RHYTHM</span>
          <h2>Everything important, in view.</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-item">
            <span className="feature-icon feature-coral"><QrCode size={21} /></span>
            <h3>Collect with confidence</h3>
            <p>Create payment requests and share a hosted checkout with your customers.</p>
            <a href="/app">Payment collection <ChevronRight size={15} /></a>
          </article>
          <article className="feature-item">
            <span className="feature-icon feature-green"><CircleDollarSign size={21} /></span>
            <h3>Move funds deliberately</h3>
            <p>Prepare bank payouts with recipient details and a clear review before submission.</p>
            <a href="/app">Bank transfers <ChevronRight size={15} /></a>
          </article>
          <article className="feature-item">
            <span className="feature-icon feature-yellow"><WalletCards size={21} /></span>
            <h3>Keep activity together</h3>
            <p>Follow payment and transfer status from one merchant workspace.</p>
            <a href="/app">View activity <ChevronRight size={15} /></a>
          </article>
        </div>
      </section>

      <section className="security-band" id="security">
        <div className="security-mark"><BadgeCheck size={24} /></div>
        <div><span className="marketing-eyebrow">SECURE INTEGRATION BOUNDARY</span><h2>Your business details deserve a private place.</h2></div>
        <p>Live checkout, wallet data, and transfers require a secured merchant backend. SwiftPay access keys and signing secrets must stay server-side, never in the browser or APK.</p>
        <a href="/app">Go to merchant sign in <ArrowRight size={16} /></a>
      </section>

      <footer className="marketing-footer">
        <Brand />
        <span>Merchant payments and account tools</span>
        <a href="/app">Merchant sign in</a>
      </footer>
    </main>
  );
}

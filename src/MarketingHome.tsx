import React from 'react';
import './marketing-home.css';
import './marketing-brand.css';
import { APP_ROUTES } from './lib/routes';

const APK_DOWNLOAD_URL = 'https://github.com/blackhorsecn/drpay-merchant/releases/latest/download/drpay.apk';

const features = [
  { icon: '↗', title: 'Collect payments faster', text: 'Accept transfers and payment requests with a merchant workspace designed for momentum.' },
  { icon: '▣', title: 'Know every transaction', text: 'Keep balances, receipts, and transfer activity visible in one calm, focused dashboard.' },
  { icon: '✓', title: 'Built for daily operations', text: 'Move from payment received to reconciliation without losing the context that matters.' },
];

const steps = [
  ['01', 'Create your workspace', 'Set up your merchant profile in minutes.'],
  ['02', 'Connect your flow', 'Configure the payment methods your business already uses.'],
  ['03', 'Start moving money', 'Track activity and keep customers updated from one place.'],
];

const supportedChannels = [
  {
    name: 'QRPH',
    logo: '/bank-logos/qrph.svg',
    description: 'Collect payments through supported bank and e-wallet apps.',
  },
  {
    name: 'InstaPay',
    logo: '/bank-logos/instapay.png',
    description: 'Send supported merchant bank transfers in real time.',
  },
  {
    name: 'PESONet',
    logo: '/bank-logos/pesonet.png',
    description: 'Send supported merchant bank transfers through PESONet.',
  },
];

export default function MarketingHome() {
  return (
    <main className="drpay-home">
      <div className="drpay-noise" />
      <nav className="drpay-nav">
      <a className="drpay-brand" href="#top" aria-label="DRPay home"><img className="drpay-brand-mark" src="/drpay-mark.svg" alt="" /><span>DRPAY</span></a>
        <div className="drpay-nav-links"><a href="#why">Why DRPay</a><a href="#how">How it works</a><a href="#security">Security</a></div>
        <div className="drpay-nav-actions"><a className="drpay-login" href={APP_ROUTES.merchantSignIn}>Log in</a><a className="drpay-button drpay-button-small" href={APK_DOWNLOAD_URL}>Download APK <span>↗</span></a></div>
      </nav>

      <section id="top" className="drpay-hero">
        <div className="drpay-hero-copy">
          <p className="drpay-eyebrow"><span className="drpay-pulse" /> The smarter merchant workspace</p>
          <h1>Payments that keep your business <em>moving.</em></h1>
          <p className="drpay-hero-text">DRPay gives growing businesses a clearer way to collect, track, and manage money, so every transaction feels simple from start to finish.</p>
          <div className="drpay-hero-actions"><a className="drpay-button" href={APK_DOWNLOAD_URL}>Download the Android app <span>↗</span></a><a className="drpay-text-link" href="#how">See how it works <span>↓</span></a></div>
          <div className="drpay-proof"><div className="drpay-avatars"><span>AM</span><span>JD</span><span>LK</span><span>+</span></div><span>Trusted by teams that move fast</span></div>
        </div>
        <div className="drpay-hero-art">
          <figure className="drpay-live-payout-frame">
            <img
              src="/marketing/drpay-live-payout.jpg"
              alt="DRPAY confirmation showing an outgoing transfer completed; transaction details are omitted."
            />
            <figcaption>Live transaction confirmation in DRPAY</figcaption>
          </figure>
        </div>
      </section>

      <section id="payments" className="drpay-payments" aria-labelledby="drpay-payments-title">
        <div className="drpay-payments-heading">
          <p className="drpay-eyebrow">Supported payment channels</p>
          <h2 id="drpay-payments-title">Built around trusted local rails.</h2>
          <p>Availability depends on your merchant account and the receiving institution.</p>
        </div>
        <div className="drpay-payment-channel-grid">
          {supportedChannels.map((channel) => (
            <article className="drpay-payment-channel" key={channel.name}>
              <span className="drpay-payment-channel-logo">
                <img src={channel.logo} alt="" />
              </span>
              <div>
                <h3>{channel.name}</h3>
                <p>{channel.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="gaming-integration"
        className="drpay-gaming-integration"
        aria-labelledby="drpay-gaming-title"
      >
        <div className="drpay-gaming-copy">
          <p className="drpay-eyebrow">Merchant payment integration</p>
          <h2 id="drpay-gaming-title">
            Payment flows for online gaming businesses.
          </h2>
          <p>
            Present QRPH collection options and hosted checkout links within a
            customer deposit journey. Payment methods depend on merchant
            onboarding, provider approval, and applicable requirements.
          </p>
          <div className="drpay-gaming-capabilities">
            <span>Hosted payment links</span>
            <span>QRPH collections</span>
            <span>Payment status tracking</span>
          </div>
          <small>
            The deposit screen is an illustrative merchant-provided example.
            Displayed third-party names and marks do not imply endorsement or
            partnership.
          </small>
        </div>
        <div className="drpay-gaming-visuals">
          <figure className="drpay-gaming-screenshot">
            <img
              src="/marketing/online-casino-deposit-example.jpg"
              alt="Example online gaming deposit screen with e-wallet, online banking, and USDT options"
              loading="lazy"
            />
            <figcaption>Example customer deposit experience</figcaption>
          </figure>
          <div className="drpay-gaming-photo-stack">
            <img
              src="/marketing/casino-roulette.jpg"
              alt="Roulette wheel representing online gaming"
              loading="lazy"
            />
            <img
              src="/marketing/payment-integration.jpg"
              alt="Customer using a payment terminal"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <section id="why" className="drpay-section drpay-features"><div className="drpay-section-heading"><p className="drpay-eyebrow">A better way to operate</p><h2>Everything your payments need.<br /><em>Nothing they don't.</em></h2></div><div className="drpay-feature-grid">{features.map((feature) => <article className="drpay-feature" key={feature.title}><span className="drpay-feature-icon">{feature.icon}</span><h3>{feature.title}</h3><p>{feature.text}</p><a href={APK_DOWNLOAD_URL}>Get the app <span>↗</span></a></article>)}</div></section>

      <section id="how" className="drpay-section drpay-process"><div className="drpay-process-intro"><p className="drpay-eyebrow">Simple by design</p><h2>From first payment<br /><em>to full control.</em></h2><p>Less friction for you. More confidence for your customers.</p></div><div className="drpay-steps">{steps.map(([number, title, text]) => <div className="drpay-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></section>

      <section id="security" className="drpay-security"><div><p className="drpay-eyebrow">Confidence included</p><h2>Your business deserves<br /><em>a steadier foundation.</em></h2></div><div className="drpay-security-copy"><p>Every detail in DRPay is designed to help you operate with clarity, from the first customer payment to the final reconciliation.</p><div className="drpay-security-points"><span>↗ Secure by design</span><span>↗ Always in view</span><span>↗ Ready to scale</span></div></div></section>

      <section id="get-started" className="drpay-cta"><div className="drpay-cta-orb" /><p className="drpay-eyebrow">Ready when you are</p><h2>Make the next payment<br /><em>feel effortless.</em></h2><a className="drpay-button drpay-button-light" href={APK_DOWNLOAD_URL}>Download the Android app <span>↗</span></a></section>

      <footer className="drpay-footer"><a className="drpay-brand" href="#top" aria-label="DRPay home"><img className="drpay-brand-mark" src="/drpay-mark.svg" alt="" /><span>DRPAY</span></a><span>Merchant payments, made clearer.</span><a href={APK_DOWNLOAD_URL}>Android APK</a><span>© 2026 DRPay</span></footer>
    </main>
  );
}

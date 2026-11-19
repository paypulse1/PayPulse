import { Mail, RefreshCw, Wrench } from "lucide-react"

export default function MaintenanceScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f1f4f9] px-5 py-12 text-[#142944]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-40 h-96 w-96 rounded-full bg-[#dce8f8] opacity-70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 -right-32 h-112 w-112 rounded-full bg-[#f8f1df] opacity-80 blur-3xl"
      />

      <section
        aria-labelledby="maintenance-title"
        className="relative w-full max-w-xl rounded-[28px] border border-white/80 bg-white/90 p-7 shadow-[0_24px_72px_rgba(16,35,61,0.12)] backdrop-blur sm:p-11"
      >
        <header className="mb-12 flex items-center justify-between">
          <a
            href="/"
            aria-label="PayPulse home"
            className="text-lg font-extrabold tracking-[-0.06em] text-[#0c2241] no-underline"
          >
            PayPulse
          </a>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#f0e2c7] bg-[#fff9ef] px-3 py-1.5 text-xs font-bold text-[#8c6617]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d9b866]" />
            Planned maintenance
          </span>
        </header>

        <div className="mb-7 grid h-16 w-16 place-items-center rounded-2xl border border-[#dce8f8] bg-[#f2f7ff] text-[#2257a5]">
          <Wrench aria-hidden="true" size={29} strokeWidth={1.8} />
        </div>

        <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-[#2257a5]">
          We&apos;ll be right back
        </p>
        <h1
          id="maintenance-title"
          className="mb-4 text-3xl font-extrabold leading-tight tracking-[-0.045em] text-[#0c2241] sm:text-4xl"
        >
          We&apos;re making things better.
        </h1>
        <p className="mb-8 max-w-md text-sm leading-7 text-[#596b82] sm:text-base">
          PayPulse is temporarily unavailable while we carry out scheduled
          maintenance. Your account and payment information remain secure.
        </p>

        <div
          role="status"
          aria-live="polite"
          className="mb-8 flex items-start gap-3 rounded-2xl border border-[#e1e8f1] bg-[#f8fafc] p-4"
        >
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#2257a5] shadow-sm">
            <RefreshCw aria-hidden="true" size={17} />
          </span>
          <span>
            <span className="block text-sm font-bold text-[#142944]">
              Maintenance in progress
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#596b82]">
              We&apos;re working to restore service as soon as possible. Please
              check back in a little while.
            </span>
          </span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0c2241] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2257a5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2257a5]"
          >
            <RefreshCw aria-hidden="true" size={16} />
            Try again
          </button>
          <a
            href="mailto:support@drpay.ph"
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#e1e8f1] bg-white px-5 text-sm font-bold text-[#142944] no-underline transition-colors hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2257a5]"
          >
            <Mail aria-hidden="true" size={16} />
            Contact support
          </a>
        </div>

        <footer className="mt-9 border-t border-[#e1e8f1] pt-5 text-center text-xs text-[#596b82]">
          Thank you for your patience.
        </footer>
      </section>
    </main>
  )
}

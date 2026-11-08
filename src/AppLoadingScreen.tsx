export default function AppLoadingScreen({
  label = "Loading DRPAY",
  description = "Getting your merchant workspace ready…",
}: {
  label?: string
  description?: string
}) {
  return (
    <main
      className="app-loading-screen"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <div className="app-loading-content">
        <div className="app-loading-brand">
          <img src="/drpay-mark.png" alt="" />
          <strong>DRPAY</strong>
        </div>
        <span className="app-loading-spinner" aria-hidden="true" />
        <div className="app-loading-copy">
          <h1>{label}</h1>
          <p>{description}</p>
        </div>
      </div>
    </main>
  )
}

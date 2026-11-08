export default function AppLoadingScreen({
  label = "Loading DRPAY",
  description = "Getting your merchant workspace ready…",
}: {
  label?: string
  description?: string
}) {
  return (
    <main
      className="app-bootstrap"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <div className="app-bootstrap-content">
        <div className="app-bootstrap-brand">
          <img src="/drpay-mark.png" alt="" />
          <strong>DRPAY</strong>
        </div>
        <span className="app-bootstrap-spinner" aria-hidden="true" />
        <div className="app-bootstrap-copy">
          <h1>{label}</h1>
          <p>{description}</p>
        </div>
      </div>
    </main>
  )
}

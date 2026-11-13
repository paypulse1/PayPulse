import { lazy, useEffect, useState } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import AppLoadingScreen from "./AppLoadingScreen"
import MaintenanceScreen from "./MaintenanceScreen"
import { getPublicMaintenanceStatus, isBackendConfigured } from "./lib/swiftpay"

const App = lazy(() => import("./App"))

export default function MerchantEntry() {
  const [status, setStatus] =
    useState<"checking" | "ready" | "maintenance" | "error">("checking")
  const [error, setError] = useState("")
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!isBackendConfigured()) {
      setStatus("ready")
      return
    }

    let active = true
    let hasReceivedStatus = false

    async function checkMaintenanceStatus() {
      try {
        const maintenanceStatus = await getPublicMaintenanceStatus()
        if (!active) return
        hasReceivedStatus = true
        setError("")
        setStatus(maintenanceStatus.enabled ? "maintenance" : "ready")
      } catch (requestError) {
        if (!active || hasReceivedStatus) return
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not check merchant service availability.",
        )
        setStatus("error")
      }
    }

    void checkMaintenanceStatus()
    const interval = window.setInterval(() => {
      void checkMaintenanceStatus()
    }, 30_000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [retryCount])

  if (status === "checking") return <AppLoadingScreen />
  if (status === "maintenance") return <MaintenanceScreen />
  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f1f4f9] px-5 py-12 text-[#142944]">
        <section
          aria-labelledby="maintenance-check-title"
          className="w-full max-w-md rounded-[28px] border border-white bg-white p-8 text-center shadow-[0_24px_72px_rgba(16,35,61,0.12)]"
        >
          <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#fff0ed] text-[#bd4b3b]">
            <AlertCircle aria-hidden="true" size={26} />
          </span>
          <h1
            id="maintenance-check-title"
            className="mb-3 text-2xl font-extrabold tracking-[-0.04em] text-[#0c2241]"
          >
            Can&apos;t check service status
          </h1>
          <p className="mb-6 text-sm leading-6 text-[#596b82]">{error}</p>
          <button
            type="button"
            onClick={() => {
              setStatus("checking")
              setRetryCount((count) => count + 1)
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0c2241] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2257a5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2257a5]"
          >
            <RefreshCw aria-hidden="true" size={16} />
            Try again
          </button>
        </section>
      </main>
    )
  }

  return <App />
}

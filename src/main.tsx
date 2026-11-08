import { lazy, Suspense } from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { shouldShowMarketingHome } from "./lib/routes"

const App = lazy(() => import("./App"))
const MarketingHome = lazy(() => import("./MarketingHome"))

const EntryScreen = shouldShowMarketingHome(
  window.location.pathname,
  window.location.hostname,
  window.location.search,
)
  ? MarketingHome
  : App

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Suspense
    fallback={
      <div className="app-bootstrap" role="status">
        Loading DRPAY…
      </div>
    }
  >
    <EntryScreen />
  </Suspense>,
)

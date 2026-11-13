import { lazy, Suspense } from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import AppLoadingScreen from "./AppLoadingScreen"
import {
  shouldGateMerchantMaintenance,
  shouldShowMarketingHome,
} from "./lib/routes"

const App = lazy(() => import("./App"))
const MerchantEntry = lazy(() => import("./MerchantEntry"))
const MarketingHome = lazy(() => import("./MarketingHome"))
const MaintenanceScreen = lazy(() => import("./MaintenanceScreen"))

const pathname = window.location.pathname.replace(/\/+$/, "") || "/"
const isMaintenanceScreen = pathname === "/maintenance"
const isMarketingHome = shouldShowMarketingHome(
  window.location.pathname,
  window.location.hostname,
  window.location.search,
)
const isMerchantWorkspace = shouldGateMerchantMaintenance(
  window.location.pathname,
  window.location.hostname,
  window.location.search,
)
const EntryScreen = isMaintenanceScreen
  ? MaintenanceScreen
  : isMarketingHome
    ? MarketingHome
    : isMerchantWorkspace
      ? MerchantEntry
      : App

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<AppLoadingScreen />}>
    <EntryScreen />
  </Suspense>,
)

import { lazy, Suspense } from "react"
import ReactDOM from "react-dom/client"
import { Capacitor } from "@capacitor/core"
import "./index.css"
import AppLoadingScreen from "./AppLoadingScreen"
import { resolveAppRoute } from "./lib/routes"

const App = lazy(() => import("./App"))
const MerchantEntry = lazy(() => import("./MerchantEntry"))
const MarketingHome = lazy(() => import("./MarketingHome"))
const MaintenanceScreen = lazy(() => import("./MaintenanceScreen"))

const route = resolveAppRoute(window.location, Capacitor.isNativePlatform())
const EntryScreen =
  route.type === "maintenance"
    ? MaintenanceScreen
    : route.type === "marketing"
      ? MarketingHome
      : route.type === "merchant-entry"
        ? () => <MerchantEntry route={route.target} />
        : () => <App route={route} />

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<AppLoadingScreen />}>
    <EntryScreen />
  </Suspense>,
)

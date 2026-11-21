import { lazy, Suspense, useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import { Capacitor } from "@capacitor/core"
import { App as CapacitorApp } from "@capacitor/app"
import "./index.css"
import AppLoadingScreen from "./AppLoadingScreen"
import {
  resolveAppLinkRoute,
  resolveAppRoute,
  type AppRoute,
} from "./lib/routes"

const App = lazy(() => import("./App"))
const MerchantEntry = lazy(() => import("./MerchantEntry"))
const MarketingHome = lazy(() => import("./MarketingHome"))
const MaintenanceScreen = lazy(() => import("./MaintenanceScreen"))

const isNativePlatform = Capacitor.isNativePlatform()

function RouteEntry({ route }: { route: AppRoute }) {
  if (route.type === "maintenance") return <MaintenanceScreen />
  if (route.type === "marketing") return <MarketingHome />
  if (route.type === "merchant-entry")
    return <MerchantEntry route={route.target} />
  return <App route={route} />
}

function AppEntry() {
  const [route, setRoute] = useState(() =>
    resolveAppRoute(window.location, isNativePlatform),
  )

  useEffect(() => {
    if (!isNativePlatform) return

    let active = true
    let receivedAppLink = false
    let listener: Awaited<ReturnType<typeof CapacitorApp.addListener>> | null =
      null

    const listenerPromise = CapacitorApp.addListener(
      "appUrlOpen",
      ({ url }) => {
        if (!active) return
        receivedAppLink = true
        const appRoute = resolveAppLinkRoute(url)
        if (appRoute) setRoute(appRoute)
      },
    )

    void listenerPromise
      .then((registeredListener) => {
        if (active) {
          listener = registeredListener
        } else {
          void registeredListener.remove().catch((error: unknown) => {
            console.error("Could not remove the app-link listener.", error)
          })
        }
      })
      .catch((error: unknown) => {
        if (active)
          console.error("Could not register the app-link listener.", error)
      })

    void CapacitorApp.getLaunchUrl()
      .then((launchUrl) => {
        if (!active || receivedAppLink || !launchUrl?.url) return
        const appRoute = resolveAppLinkRoute(launchUrl.url)
        if (appRoute) setRoute(appRoute)
      })
      .catch((error: unknown) => {
        if (active) console.error("Could not read the app launch URL.", error)
      })

    return () => {
      active = false
      if (listener) {
        void listener.remove().catch((error: unknown) => {
          console.error("Could not remove the app-link listener.", error)
        })
      }
    }
  }, [])

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <RouteEntry route={route} />
    </Suspense>
  )
}

ReactDOM.createRoot(document.getElementById("root")!).render(<AppEntry />)

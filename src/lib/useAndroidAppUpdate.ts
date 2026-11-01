import { useEffect, useRef, useState } from "react"
import { App as CapacitorApp } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"

export type AvailableAppUpdate = {
  version: string
  downloadUrl: string
}

function compareAppVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index])
      return leftParts[index] - rightParts[index]
  }
  return 0
}

export function useAndroidAppUpdate() {
  const [updateAvailable, setUpdateAvailable] =
    useState<AvailableAppUpdate | null>(null)
  const dismissedUpdateVersionRef = useRef("")

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return
    let active = true
    let lastCheckAt = 0
    let retryTimer = 0
    let requestController: AbortController | null = null

    async function checkForUpdate() {
      if (
        !active ||
        !navigator.onLine ||
        Date.now() - lastCheckAt < 5 * 60 * 1000
      )
        return
      lastCheckAt = Date.now()
      requestController = new AbortController()
      try {
        const [appInfo, response] = await Promise.all([
          CapacitorApp.getInfo(),
          fetch(
            "https://api.github.com/repos/blackhorsecn/drpay-merchant/releases/latest",
            {
              headers: { Accept: "application/vnd.github+json" },
              cache: "no-store",
              signal: requestController.signal,
            },
          ),
        ])
        if (!response.ok)
          throw new Error(`Release check failed (${response.status}).`)
        const release = (await response.json()) as {
          tag_name?: string
          draft?: boolean
          prerelease?: boolean
          assets?: {
            name?: string
            browser_download_url?: string
          }[]
        }
        const versionMatch = /^android-v(\d+\.\d+\.\d+)$/.exec(
          release.tag_name || "",
        )
        const apk = release.assets?.find((asset) => asset.name === "drpay.apk")
        if (
          !active ||
          release.draft ||
          release.prerelease ||
          !versionMatch ||
          !apk?.browser_download_url
        )
          return
        const downloadUrl = new URL(apk.browser_download_url)
        if (
          downloadUrl.protocol !== "https:" ||
          downloadUrl.hostname !== "github.com"
        ) {
          throw new Error("The latest APK release has an invalid download URL.")
        }
        const latestVersion = versionMatch[1]
        if (
          compareAppVersions(latestVersion, appInfo.version) > 0 &&
          dismissedUpdateVersionRef.current !== latestVersion
        ) {
          setUpdateAvailable({
            version: latestVersion,
            downloadUrl: downloadUrl.toString(),
          })
        }
      } catch (checkError) {
        if (
          active &&
          !(
            checkError instanceof DOMException &&
            checkError.name === "AbortError"
          )
        ) {
          console.warn("Could not check for an Android app update", checkError)
        }
      }
    }

    const handleOnline = () => {
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => {
        lastCheckAt = 0
        void checkForUpdate()
      }, 500)
    }
    const handleOffline = () => requestController?.abort()

    void checkForUpdate()
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      active = false
      window.clearTimeout(retryTimer)
      requestController?.abort()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  function dismissUpdatePrompt() {
    if (!updateAvailable) return
    dismissedUpdateVersionRef.current = updateAvailable.version
    setUpdateAvailable(null)
  }

  return { updateAvailable, dismissUpdatePrompt }
}

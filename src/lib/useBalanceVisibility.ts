import { useCallback, useEffect, useState } from "react"
import { getSession } from "./swiftpay"

export function useBalanceVisibility() {
  const email = getSession()?.email.toLowerCase() || "default"
  const storageKey = `drpay.balance-visibility.${encodeURIComponent(email)}`
  const [preference, setPreference] = useState(() => ({
    storageKey,
    visible: localStorage.getItem(storageKey) !== "hidden",
  }))
  const balanceVisible =
    preference.storageKey === storageKey
      ? preference.visible
      : localStorage.getItem(storageKey) !== "hidden"

  useEffect(() => {
    setPreference({
      storageKey,
      visible: localStorage.getItem(storageKey) !== "hidden",
    })
  }, [storageKey])

  const toggleBalanceVisibility = useCallback(() => {
    const visible = !balanceVisible
    localStorage.setItem(storageKey, visible ? "visible" : "hidden")
    setPreference({ storageKey, visible })
  }, [balanceVisible, storageKey])

  return { balanceVisible, toggleBalanceVisibility }
}
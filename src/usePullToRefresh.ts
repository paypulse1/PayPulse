import { useCallback, useMemo, useRef, useState, type TouchEvent } from "react"

export const PULL_TO_REFRESH_THRESHOLD = 58

type UsePullToRefreshOptions = {
  disabled?: boolean
  isAtTop?: (event: TouchEvent<HTMLElement>) => boolean
  onRefresh: () => void | Promise<void>
}

function hasScrolledNestedContainer(target: EventTarget | null, root: HTMLElement) {
  let element = target instanceof Element ? target : null
  while (element && element !== root) {
    if (
      element instanceof HTMLElement &&
      ["auto", "scroll", "overlay"].includes(
        window.getComputedStyle(element).overflowY,
      ) &&
      element.scrollHeight > element.clientHeight &&
      element.scrollTop > 0
    ) {
      return true
    }
    element = element.parentElement
  }
  return false
}

export function usePullToRefresh({
  disabled = false,
  isAtTop,
  onRefresh,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const pullDistanceRef = useRef(0)
  const refreshingRef = useRef(false)
  const disabledRef = useRef(disabled)
  const isAtTopRef = useRef(isAtTop)
  const onRefreshRef = useRef(onRefresh)
  disabledRef.current = disabled
  isAtTopRef.current = isAtTop
  onRefreshRef.current = onRefresh

  const resetGesture = useCallback(() => {
    touchStartRef.current = null
    pullDistanceRef.current = 0
    setPullDistance(0)
  }, [])

  const onTouchStart = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      const root = event.currentTarget
      const atTop = isAtTopRef.current
        ? isAtTopRef.current(event)
        : root.scrollTop <= 0
      if (
        disabledRef.current ||
        refreshingRef.current ||
        event.touches.length !== 1 ||
        !atTop ||
        hasScrolledNestedContainer(event.target, root)
      ) {
        resetGesture()
        return
      }

      touchStartRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      }
    },
    [resetGesture],
  )

  const onTouchMove = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      const start = touchStartRef.current
      if (!start) return
      if (event.touches.length !== 1) {
        resetGesture()
        return
      }

      const deltaX = event.touches[0].clientX - start.x
      const deltaY = event.touches[0].clientY - start.y
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        resetGesture()
        return
      }

      const nextDistance = Math.min(84, Math.max(0, deltaY) * 0.55)
      pullDistanceRef.current = nextDistance
      setPullDistance(nextDistance)
    },
    [resetGesture],
  )

  const onTouchEnd = useCallback(() => {
    const shouldRefresh =
      !disabledRef.current &&
      !refreshingRef.current &&
      pullDistanceRef.current >= PULL_TO_REFRESH_THRESHOLD
    resetGesture()
    if (!shouldRefresh) return
    refreshingRef.current = true
    setIsRefreshing(true)
    void (async () => {
      try {
        await onRefreshRef.current()
      } finally {
        refreshingRef.current = false
        setIsRefreshing(false)
      }
    })()
  }, [resetGesture])

  const handlers = useMemo(
    () => ({
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: resetGesture,
    }),
    [onTouchEnd, onTouchMove, onTouchStart, resetGesture],
  )

  return { handlers, isRefreshing, pullDistance }
}

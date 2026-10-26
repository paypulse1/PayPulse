import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"

type AccessibleDialogProps = Omit<ComponentPropsWithoutRef<"section">, "role" | "aria-modal"> & {
  onRequestClose?: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const activeDialogs: HTMLElement[] = []

export default function AccessibleDialog({
  children,
  onRequestClose,
  ...props
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const onRequestCloseRef = useRef(onRequestClose)

  useEffect(() => {
    onRequestCloseRef.current = onRequestClose
  }, [onRequestClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    activeDialogs.push(dialog)
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          !element.matches(":disabled") &&
          !element.closest('[aria-hidden="true"]') &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== "hidden",
      )

    const focusableElements = getFocusableElements()
    const initialFocus = focusableElements[0] || dialog
    initialFocus.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (activeDialogs[activeDialogs.length - 1] !== dialog) return

      if (event.key === "Escape" && onRequestCloseRef.current) {
        event.preventDefault()
        onRequestCloseRef.current()
        return
      }

      if (event.key !== "Tab") return
      const focusable = getFocusableElements()
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement
      if (
        event.shiftKey &&
        (activeElement === first || !dialog.contains(activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (activeElement === last || !dialog.contains(activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      const activeDialogIndex = activeDialogs.lastIndexOf(dialog)
      if (activeDialogIndex >= 0) activeDialogs.splice(activeDialogIndex, 1)
      if (
        previousFocus?.isConnected &&
        (document.activeElement === document.body ||
          dialog.contains(document.activeElement))
      ) {
        previousFocus.focus()
      }
    }
  }, [])

  return (
    <section
      {...props}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      {children}
    </section>
  )
}

import { useState } from "react"
import { Capacitor } from "@capacitor/core"
import { AlertCircle, Download, LoaderCircle, Share2 } from "lucide-react"
import { Button } from "./AppPrimitives"
import {
  downloadTransferReceiptImage,
  shareTransferReceiptImage,
  type TransferReceiptData,
} from "./lib/transferReceipt"

type ReceiptAction = "download" | "share"

export default function TransferReceiptActions({
  receipt,
  className = "",
}: {
  receipt: TransferReceiptData
  className?: string
}) {
  const [busyAction, setBusyAction] = useState<ReceiptAction | null>(null)
  const [error, setError] = useState("")
  const native = Capacitor.isNativePlatform()

  async function runAction(action: ReceiptAction) {
    setBusyAction(action)
    setError("")
    try {
      if (action === "download") {
        await downloadTransferReceiptImage(receipt)
      } else {
        await shareTransferReceiptImage(receipt)
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : action === "download"
            ? "Could not download the transfer receipt image."
            : "Could not share the transfer receipt image.",
      )
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className={className}>
      <Button
        variant="secondary"
        icon={
          busyAction === "download" ? (
            <LoaderCircle size={15} className="spin" />
          ) : native ? (
            <Share2 size={15} />
          ) : (
            <Download size={15} />
          )
        }
        onClick={() => void runAction("download")}
        disabled={busyAction !== null}
      >
        {busyAction === "download"
          ? native
            ? "Opening options…"
            : "Preparing receipt…"
          : native
            ? "Save or share receipt"
            : "Download receipt"}
      </Button>
      {!native && (
        <Button
          variant="secondary"
          icon={
            busyAction === "share" ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Share2 size={15} />
            )
          }
          onClick={() => void runAction("share")}
          disabled={busyAction !== null}
        >
          {busyAction === "share" ? "Preparing receipt…" : "Share receipt"}
        </Button>
      )}
      {error && (
        <div className="inline-error" role="alert">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
    </div>
  )
}

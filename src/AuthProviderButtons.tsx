import { useEffect, useRef, useState } from "react"
import { AlertCircle, LoaderCircle } from "lucide-react"
import { Button } from "./AppPrimitives"
import type { GoogleAuthChallenge, TelegramAuthChallenge } from "./lib/swiftpay"

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            nonce: string
            callback: (response: { credential?: string }) => void
          }) => void
          renderButton: (
            element: HTMLElement,
            options: {
              theme: "outline"
              size: "large"
              text: "continue_with"
              shape: "rectangular"
              width: number
            },
          ) => void
        }
      }
    }
    Telegram?: {
      Login?: {
        auth: (
          options: {
            client_id: number
            scope: string[]
            nonce: string
            lang: string
          },
          callback: (response: { id_token?: string; error?: string }) => void,
        ) => void
      }
    }
  }
}

const scriptLoads = new Map<string, Promise<void>>()

function loadProviderScript(url: string) {
  const cached = scriptLoads.get(url)
  if (cached) return cached
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = url
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      scriptLoads.delete(url)
      reject(new Error("Could not load the sign-in provider. Try again."))
    }
    document.head.append(script)
  })
  scriptLoads.set(url, promise)
  return promise
}

export function GoogleIdentityButton({
  clientId,
  disabled = false,
  createChallenge,
  onCredential,
  onError,
}: {
  clientId: string
  disabled?: boolean
  createChallenge: () => Promise<GoogleAuthChallenge>
  onCredential: (challengeId: string, credential: string) => Promise<void>
  onError: (message: string) => void
}) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const challengeRef = useRef<GoogleAuthChallenge | null>(null)
  const credentialHandlerRef = useRef(onCredential)
  const errorHandlerRef = useRef(onError)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    credentialHandlerRef.current = onCredential
    errorHandlerRef.current = onError
  }, [onCredential, onError])

  useEffect(() => {
    let active = true
    async function renderButton() {
      const challenge = await createChallenge()
      if (!active || !buttonRef.current || !window.google) return
      challengeRef.current = challenge
      buttonRef.current.replaceChildren()
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: challenge.nonce,
        callback: ({ credential }) => {
          if (!credential) {
            errorHandlerRef.current(
              "Google did not return a sign-in credential.",
            )
            return
          }
          const currentChallenge = challengeRef.current
          if (!currentChallenge) {
            errorHandlerRef.current("Google sign-in expired. Try again.")
            return
          }
          void credentialHandlerRef
            .current(currentChallenge.challengeId, credential)
            .catch((requestError: unknown) => {
              errorHandlerRef.current(
                requestError instanceof Error
                  ? requestError.message
                  : "Google sign-in failed.",
              )
            })
            .finally(() => {
              void renderButton().catch((requestError: unknown) => {
                if (active) {
                  setUnavailable(true)
                  errorHandlerRef.current(
                    requestError instanceof Error
                      ? requestError.message
                      : "Google sign-in is unavailable right now.",
                  )
                }
              })
            })
        },
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 300,
      })
    }

    void loadProviderScript("https://accounts.google.com/gsi/client")
      .then(renderButton)
      .catch((requestError: unknown) => {
        if (active) {
          setUnavailable(true)
          errorHandlerRef.current(
            requestError instanceof Error
              ? requestError.message
              : "Google sign-in is unavailable right now.",
          )
        }
      })
    return () => {
      active = false
    }
  }, [clientId, createChallenge])

  if (!clientId) return null
  return (
    <div className={`auth-provider-control ${disabled ? "is-disabled" : ""}`}>
      {unavailable ? (
        <p className="auth-provider-error" role="status">
          <AlertCircle size={14} /> Google sign-in is unavailable right now.
        </p>
      ) : (
        <div ref={buttonRef} aria-label="Continue with Google" />
      )}
    </div>
  )
}

export function TelegramIdentityButton({
  clientId,
  disabled = false,
  createChallenge,
  onToken,
  onError,
}: {
  clientId: string
  disabled?: boolean
  createChallenge: () => Promise<TelegramAuthChallenge>
  onToken: (challengeId: string, idToken: string) => Promise<void>
  onError: (message: string) => void
}) {
  const [loadingScript, setLoadingScript] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)
  const errorHandlerRef = useRef(onError)

  useEffect(() => {
    errorHandlerRef.current = onError
  }, [onError])

  useEffect(() => {
    let active = true
    setLoadingScript(true)
    void loadProviderScript("https://oauth.telegram.org/js/telegram-login.js?3")
      .then(() => {
        if (active) setScriptReady(true)
      })
      .catch(() => {
        if (active)
          errorHandlerRef.current("Telegram sign-in is unavailable right now.")
      })
      .finally(() => {
        if (active) setLoadingScript(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function signIn() {
    const auth = window.Telegram?.Login?.auth
    if (!auth) {
      onError("Telegram sign-in is unavailable right now.")
      return
    }
    setBusy(true)
    try {
      const challenge = await createChallenge()
      auth(
        {
          client_id: Number(challenge.clientId || clientId),
          scope: ["openid"],
          nonce: challenge.nonce,
          lang: "en",
        },
        (response) => {
          if (response.error || !response.id_token) {
            setBusy(false)
            onError("Telegram sign-in was not completed. Try again.")
            return
          }
          void onToken(challenge.challengeId, response.id_token)
            .catch((requestError: unknown) => {
              onError(
                requestError instanceof Error
                  ? requestError.message
                  : "Telegram sign-in failed.",
              )
            })
            .finally(() => setBusy(false))
        },
      )
    } catch (requestError) {
      setBusy(false)
      onError(
        requestError instanceof Error
          ? requestError.message
          : "Telegram sign-in failed.",
      )
    }
  }

  if (!clientId) return null
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled || busy || !scriptReady || loadingScript}
        onClick={() => void signIn()}
        icon={
          busy || loadingScript ? (
            <LoaderCircle className="spin" size={17} />
          ) : undefined
        }
      >
        {busy ? "Waiting for Telegram…" : "Continue with Telegram"}
      </Button>
    </>
  )
}

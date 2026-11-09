import { useEffect, useRef, useState } from "react"
import { AlertCircle, LoaderCircle } from "lucide-react"
import { Button } from "./AppPrimitives"
import type { GoogleAuthChallenge, TelegramAuthChallenge } from "./lib/swiftpay"

type TelegramAuthResponse = {
  id_token?: string
  error?: string
}

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
          callback: (response: TelegramAuthResponse) => void,
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

export function GoogleProviderIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" />
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.68-.06-1.33-.17-1.96H12v3.71h5.38a4.6 4.6 0 0 1-2 3.02v2.42h3.24c1.9-1.75 2.98-4.33 2.98-7.19Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.44l-3.24-2.42c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.75-5.59-4.1H3.06v2.5A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 14a6.02 6.02 0 0 1 0-4V7.5H3.06a10 10 0 0 0 0 9L6.4 14Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.9c1.47 0 2.8.5 3.84 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.94 5.5l3.35 2.5C7.2 7.65 9.4 5.9 12 5.9Z"
      />
    </svg>
  )
}

export function TelegramProviderIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10.5" />
      <path d="m5.5 11.6 12.8-5-3.7 11.1-3.2-4.1-2.5 2 .3-3.4 6.1-3.8-7.1 3.1-2.7.1Z" />
    </svg>
  )
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
          ) : (
            <TelegramProviderIcon />
          )
        }
      >
        {busy ? "Waiting for Telegram…" : "Continue with Telegram"}
      </Button>
    </>
  )
}

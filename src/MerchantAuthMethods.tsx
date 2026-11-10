import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Fingerprint, LoaderCircle } from "lucide-react"
import { Capacitor } from "@capacitor/core"
import { browserSupportsPasskeys } from "@simplewebauthn/browser"
import { Button } from "./AppPrimitives"
import {
  getAuthProviderConfig,
  getMerchantAuthMethods,
  createGoogleLinkChallenge,
  linkGoogleIdentity,
  linkTelegramIdentity,
  createTelegramLinkChallenge,
  registerMerchantPasskey,
  removeMerchantPasskey,
  unlinkMerchantAuthMethod,
  type AuthProviderConfig,
  type MerchantAuthMethods as MerchantAuthMethodsState,
} from "./lib/swiftpay"
import {
  GoogleProviderIcon,
  GoogleIdentityButton,
  TelegramProviderIcon,
  TelegramIdentityButton,
} from "./AuthProviderButtons"

export default function MerchantAuthMethods() {
  const [config, setConfig] = useState<AuthProviderConfig | null>(null)
  const [methods, setMethods] = useState<MerchantAuthMethodsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [configError, setConfigError] = useState("")
  const [notice, setNotice] = useState("")
  const [passkeysSupported, setPasskeysSupported] = useState(false)

  const refresh = useCallback(async () => {
    setMethods(null)
    const [providerConfigResult, authMethodsResult] = await Promise.allSettled([
      getAuthProviderConfig(),
      getMerchantAuthMethods(),
    ])
    if (providerConfigResult.status === "fulfilled") {
      setConfig(providerConfigResult.value)
      setConfigError("")
    } else {
      setConfig(null)
      setConfigError(
        providerConfigResult.reason instanceof Error
          ? providerConfigResult.reason.message
          : "Provider settings are temporarily unavailable.",
      )
    }
    if (authMethodsResult.status === "rejected") throw authMethodsResult.reason
    setMethods(authMethodsResult.value)
  }, [])

  useEffect(() => {
    let active = true
    void browserSupportsPasskeys()
      .then((supported) => {
        if (active) setPasskeysSupported(supported)
      })
      .catch(() => {
        if (active) setPasskeysSupported(false)
      })
    void refresh()
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load linked sign-in methods.",
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [refresh])

  async function runAction(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
      setNotice(message)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update linked sign-in methods.",
      )
      setBusy(false)
      return
    }
    try {
      await refresh()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? `Change saved, but sign-in methods could not be refreshed: ${requestError.message}`
          : "Change saved, but sign-in methods could not be refreshed.",
      )
    } finally {
      setBusy(false)
    }
  }

  const nativePlatform = Capacitor.isNativePlatform()
  if (loading)
    return (
      <div className="profile-sheet-state" role="status">
        <LoaderCircle className="spin" size={16} />
        Loading sign-in methods…
      </div>
    )

  return (
    <section
      className="merchant-auth-methods"
      aria-label="Linked sign-in methods"
    >
      <div className="profile-info-intro">
        <strong>Linked sign-in methods</strong>
        <p>
          Link a method to this signed-in account. Provider sign-in never
          automatically merges accounts.
        </p>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          <AlertCircle size={15} />
          {error}
        </div>
      )}
      {notice && (
        <p className="profile-sheet-state" role="status">
          {notice}
        </p>
      )}
      {configError && (
        <p className="profile-info-note" role="status">
          {configError}
        </p>
      )}
      {nativePlatform && (
        <p className="profile-info-note">
          Google and Telegram linking are available on the DRPAY merchant web
          portal. Passkeys can be linked here when supported by this device.
        </p>
      )}
      {!nativePlatform && (
        <>
          {config?.google && config.googleClientId && methods ? (
            <div className="merchant-auth-method-row">
              <span className="merchant-auth-method-icon merchant-auth-method-google">
                <GoogleProviderIcon size={20} />
              </span>
              <div>
                <strong>Google</strong>
                <small>
                  {methods?.google ? "Linked to this account" : "Not linked"}
                </small>
              </div>
              {methods?.google ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      () => unlinkMerchantAuthMethod("google"),
                      "Google sign-in unlinked.",
                    )
                  }
                >
                  Unlink
                </Button>
              ) : (
                <GoogleIdentityButton
                  clientId={config.googleClientId}
                  disabled={busy}
                  createChallenge={createGoogleLinkChallenge}
                  onCredential={(challengeId, credential) =>
                    runAction(
                      () => linkGoogleIdentity(challengeId, credential),
                      "Google sign-in linked.",
                    )
                  }
                  onError={setError}
                />
              )}
            </div>
          ) : (
            config && (
              <p className="profile-info-note">
                Google linking will be available when the provider is
                configured.
              </p>
            )
          )}
          {config?.telegram && config.telegramClientId && methods ? (
            <div className="merchant-auth-method-row">
              <span className="merchant-auth-method-icon merchant-auth-method-telegram">
                <TelegramProviderIcon size={20} />
              </span>
              <div>
                <strong>Telegram</strong>
                <small>
                  {methods?.telegram ? "Linked to this account" : "Not linked"}
                </small>
              </div>
              {methods?.telegram ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      () => unlinkMerchantAuthMethod("telegram"),
                      "Telegram sign-in unlinked.",
                    )
                  }
                >
                  Unlink
                </Button>
              ) : (
                <TelegramIdentityButton
                  clientId={config.telegramClientId}
                  disabled={busy}
                  createChallenge={createTelegramLinkChallenge}
                  onToken={(challengeId, idToken) =>
                    runAction(
                      () => linkTelegramIdentity(challengeId, idToken),
                      "Telegram sign-in linked.",
                    )
                  }
                  onError={setError}
                />
              )}
            </div>
          ) : (
            config && (
              <p className="profile-info-note">
                Telegram linking will be available when the provider is
                configured.
              </p>
            )
          )}
        </>
      )}
      {config?.passkeys && methods && passkeysSupported && (
        <div className="merchant-passkeys">
          <div className="merchant-auth-method-row">
            <span className="merchant-auth-method-icon merchant-auth-method-passkey">
              <Fingerprint size={18} />
            </span>
            <div>
              <strong>Passkeys</strong>
              <small>
                {methods.passkeys.length
                  ? `${methods.passkeys.length} passkey${
                      methods.passkeys.length === 1 ? "" : "s"
                    } linked`
                  : "No passkeys linked"}
              </small>
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runAction(
                  registerMerchantPasskey,
                  "Passkey linked to this account.",
                )
              }
              icon={
                busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Fingerprint size={15} />
                )
              }
            >
              Add passkey
            </Button>
          </div>
          {methods.passkeys.map((passkey, index) => (
            <div className="merchant-passkey-item" key={passkey.id}>
              <span>
                Passkey {index + 1} ·{" "}
                {new Date(passkey.createdAt).toLocaleDateString()}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    () => removeMerchantPasskey(passkey.id),
                    "Passkey removed.",
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {config?.passkeys && methods && !passkeysSupported && (
        <p className="profile-info-note">
          Passkeys are not supported by this device or browser. Use an
          up-to-date browser on a secure connection to add or sign in with a
          passkey.
        </p>
      )}
    </section>
  )
}

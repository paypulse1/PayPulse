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
  const [notice, setNotice] = useState("")
  const [passkeysSupported, setPasskeysSupported] = useState(false)

  const refresh = useCallback(async () => {
    setError("")
    const [providerConfig, authMethods] = await Promise.all([
      getAuthProviderConfig(),
      getMerchantAuthMethods(),
    ])
    setConfig(providerConfig)
    setMethods(authMethods)
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
      await refresh()
      setNotice(message)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update linked sign-in methods.",
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
      {nativePlatform ? (
        <p className="profile-info-note">
          Google, Telegram, and passkey linking are available on the DRPAY
          merchant web portal. Device biometrics remain available in this app.
        </p>
      ) : (
        <>
          {config?.google && config.googleClientId ? (
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
            <p className="profile-info-note">
              Google linking will be available when the provider is configured.
            </p>
          )}
          {config?.telegram && config.telegramClientId ? (
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
            <p className="profile-info-note">
              Telegram linking will be available when the provider is
              configured.
            </p>
          )}
          {config?.passkeys && passkeysSupported && (
            <div className="merchant-passkeys">
              <div className="merchant-auth-method-row">
                <span className="merchant-auth-method-icon merchant-auth-method-passkey">
                  <Fingerprint size={18} />
                </span>
                <div>
                  <strong>Passkeys</strong>
                  <small>
                    {methods?.passkeys.length
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
              {methods?.passkeys.map((passkey, index) => (
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
          {config?.passkeys && !passkeysSupported && (
            <p className="profile-info-note">
              Passkeys are not supported by this browser. Use an up-to-date
              browser on a secure connection to add or sign in with a passkey.
            </p>
          )}
        </>
      )}
    </section>
  )
}

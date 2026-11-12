import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "./AppPrimitives";
import { APP_ROUTES } from "./lib/routes";
import {
  createMerchantApiKey,
  deleteMerchantWebhook,
  getApiBaseUrl,
  getMerchantApiKeys,
  getMerchantKyb,
  getMerchantWebhook,
  getMerchantWebhookDeliveries,
  retryMerchantWebhookDelivery,
  revokeMerchantApiKey,
  saveMerchantKybProfile,
  saveMerchantWebhook,
  type KybProfile,
  type MerchantApiKey,
  type MerchantWebhookSettings,
  startSumsubKybVerification,
  type SumsubKybStatus,
  type WebhookDelivery,
} from "./lib/swiftpay";
import MerchantApiDocumentation, {
  type PaymentEnvironment,
} from "./MerchantApiDocumentation";

const initialKyb = {
  legalBusinessName: "",
  registrationNumber: "",
  businessType: "",
  country: "Philippines",
  businessAddress: "",
  ownerFullName: "",
  ownerDateOfBirth: "",
  ownerNationality: "",
  ownerEmail: "",
  ownerPhone: "",
};

const webhookEvents = [
  ["payment.succeeded", "Payment succeeded"],
  ["payment.failed", "Payment failed"],
  ["disbursement.succeeded", "Disbursement succeeded"],
  ["disbursement.failed", "Disbursement failed"],
] as const;

const sumsubStatusLabels: Record<SumsubKybStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "Waiting for Sumsub review",
  ON_HOLD: "On hold",
  RESUBMISSION_REQUIRED: "More information required",
  APPROVED: "Provider checks passed — awaiting DRPAY review",
  REJECTED: "Provider verification not approved",
}

export function KybSetupPanel({ refreshVersion }: { refreshVersion: number }) {
  const [profile, setProfile] = useState(initialKyb)
  const [status, setStatus] = useState<KybProfile["status"] | "">("")
  const [sumsubReviewStatus, setSumsubReviewStatus] =
    useState<SumsubKybStatus>("NOT_STARTED")
  const [reviewNotes, setReviewNotes] = useState("")
  const [profileSaved, setProfileSaved] = useState(false)
  const [consent, setConsent] = useState(false)
  const [sdkVisible, setSdkVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const sdkContainerRef = useRef<HTMLDivElement | null>(null)
  const sdkInstanceRef = useRef<import("@sumsub/websdk").SnsWebSdk | null>(null)

  useEffect(() => {
    let active = true
    getMerchantKyb()
      .then(({ profile: kybProfile }) => {
        if (!active) return
        if (kybProfile) {
          setProfile({
            legalBusinessName: kybProfile.legalBusinessName,
            registrationNumber: kybProfile.registrationNumber,
            businessType: kybProfile.businessType,
            country: kybProfile.country,
            businessAddress: kybProfile.businessAddress,
            ownerFullName: kybProfile.ownerFullName,
            ownerDateOfBirth: kybProfile.ownerDateOfBirth,
            ownerNationality: kybProfile.ownerNationality,
            ownerEmail: kybProfile.ownerEmail,
            ownerPhone: kybProfile.ownerPhone,
          })
          setStatus(kybProfile.status)
          setSumsubReviewStatus(kybProfile.sumsubReviewStatus)
          setReviewNotes(kybProfile.reviewNotes || "")
          setProfileSaved(true)
        } else {
          setProfileSaved(false)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your KYB application.",
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      sdkInstanceRef.current?.destroy()
      sdkInstanceRef.current = null
    }
  }, [refreshVersion])

  function updateField(field: keyof typeof initialKyb, value: string) {
    setProfile((current) => ({ ...current, [field]: value }))
    setProfileSaved(false)
    setConsent(false)
  }

  async function refreshKybStatus() {
    setError("")
    try {
      const { profile: kybProfile } = await getMerchantKyb()
      if (!kybProfile) return
      setStatus(kybProfile.status)
      setSumsubReviewStatus(kybProfile.sumsubReviewStatus)
      setReviewNotes(kybProfile.reviewNotes || "")
      setNotice("Verification status refreshed.")
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh the verification status.",
      )
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setBusy("profile")
    setError("")
    setNotice("")
    try {
      const result = await saveMerchantKybProfile(profile)
      setStatus(result.status)
      setSumsubReviewStatus("NOT_STARTED")
      setReviewNotes("")
      setProfileSaved(true)
      setConsent(false)
      setNotice("Business and owner details saved. Continue with Sumsub verification.")
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save your KYB details.",
      )
    } finally {
      setBusy("")
    }
  }

  async function startVerification() {
    if (!consent) {
      setError("Please review and accept the verification consent first.")
      return
    }
    if (!profileSaved) {
      setError("Save your business and beneficial-owner details first.")
      return
    }
    setBusy("sumsub")
    setError("")
    setNotice("")
    try {
      const { accessToken, sumsubReviewStatus: providerStatus } =
        await startSumsubKybVerification(true)
      setSumsubReviewStatus(providerStatus)
      const { default: snsWebSdk } = await import("@sumsub/websdk")
      sdkInstanceRef.current?.destroy()
      const instance = snsWebSdk
        .init(accessToken, async () => {
          const refreshed = await startSumsubKybVerification(true)
          return refreshed.accessToken
        })
        .withConf({ lang: "en", theme: "light" })
        .withOptions({ addViewportTag: false, adaptIframeHeight: true })
        .on("idCheck.onApplicantSubmitted", () => {
          setNotice(
            "Your verification was submitted to Sumsub. Refresh the status for the latest result.",
          )
        })
        .on("idCheck.onError", () => {
          setError(
            "Sumsub verification could not continue. Please retry or contact DRPAY support.",
          )
        })
        .build()
      sdkInstanceRef.current = instance
      setSdkVisible(true)
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      if (!sdkContainerRef.current) {
        throw new Error("The Sumsub verification panel could not be opened.")
      }
      instance.launch(sdkContainerRef.current)
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Could not start Sumsub verification.",
      )
    } finally {
      setBusy("")
    }
  }

  function closeVerification() {
    sdkInstanceRef.current?.destroy()
    sdkInstanceRef.current = null
    setSdkVisible(false)
  }

  if (loading) return <p className="profile-sheet-state">Loading KYB application…</p>

  const providerResultIsFinal = ["APPROVED", "REJECTED"].includes(
    sumsubReviewStatus,
  )
  const profileLocked = providerResultIsFinal || status === "APPROVED"

  return (
    <div className="merchant-setup">
      {status && (
        <div className={`kyb-status status-${status.toLowerCase()}`}>
          <strong>DRPAY review: {status.replace("_", " ")}</strong>
          {reviewNotes && <span>{reviewNotes}</span>}
        </div>
      )}
      <p className="profile-info-note">
        Enter your business and beneficial-owner details, then complete the
        secure Sumsub business-verification flow.
      </p>
      <form className="setup-form" onSubmit={(event) => void saveProfile(event)}>
        <label>
          Legal business name
          <input
            value={profile.legalBusinessName}
            onChange={(event) =>
              updateField("legalBusinessName", event.target.value)
            }
            disabled={profileLocked}
            required
            maxLength={200}
          />
        </label>
        <label>
          Registration number
          <input
            value={profile.registrationNumber}
            onChange={(event) =>
              updateField("registrationNumber", event.target.value)
            }
            disabled={profileLocked}
            required
            maxLength={200}
          />
        </label>
        <label>
          Business type
          <input
            value={profile.businessType}
            onChange={(event) => updateField("businessType", event.target.value)}
            disabled={profileLocked}
            placeholder="Corporation, partnership, sole proprietor"
            required
            maxLength={200}
          />
        </label>
        <label>
          Country
          <input
            value={profile.country}
            onChange={(event) => updateField("country", event.target.value)}
            disabled={profileLocked}
            required
            maxLength={200}
          />
        </label>
        <label className="setup-form-wide">
          Registered business address
          <textarea
            value={profile.businessAddress}
            onChange={(event) =>
              updateField("businessAddress", event.target.value)
            }
            disabled={profileLocked}
            required
            maxLength={200}
            rows={2}
          />
        </label>
        <label>
          Beneficial owner full name
          <input
            value={profile.ownerFullName}
            onChange={(event) =>
              updateField("ownerFullName", event.target.value)
            }
            disabled={profileLocked}
            required
            maxLength={200}
          />
        </label>
        <label>
          Date of birth
          <input
            type="date"
            value={profile.ownerDateOfBirth}
            onChange={(event) =>
              updateField("ownerDateOfBirth", event.target.value)
            }
            disabled={profileLocked}
            required
          />
        </label>
        <label>
          Owner nationality
          <input
            value={profile.ownerNationality}
            onChange={(event) =>
              updateField("ownerNationality", event.target.value)
            }
            disabled={profileLocked}
            required
            maxLength={200}
          />
        </label>
        <label>
          Owner email
          <input
            type="email"
            value={profile.ownerEmail}
            onChange={(event) => updateField("ownerEmail", event.target.value)}
            disabled={profileLocked}
            required
            maxLength={200}
          />
        </label>
        <label>
          Owner phone
          <input
            type="tel"
            value={profile.ownerPhone}
            onChange={(event) => updateField("ownerPhone", event.target.value)}
            disabled={profileLocked}
            required
            maxLength={200}
          />
        </label>
        <Button
          type="submit"
          disabled={
            busy !== "" ||
            profileSaved ||
            profileLocked
          }
        >
          {busy === "profile" ? "Saving…" : "Save business details"}
        </Button>
      </form>
      <section className="sumsub-verification" aria-label="Sumsub verification">
        <div className="sumsub-verification-heading">
          <strong>Sumsub business verification</strong>
          <span
            className={`kyb-status status-${sumsubReviewStatus.toLowerCase()}`}
            role="status"
          >
            {sumsubStatusLabels[sumsubReviewStatus]}
          </span>
        </div>
        <p>
          Sumsub collects required company and owner documents, performs
          configured registry and screening checks, and can request identity
          document capture with selfie liveness. The exact checks depend on the
          KYB level enabled for DRPAY.
        </p>
        <label className="sumsub-consent">
          <input
            type="checkbox"
            checked={consent}
            disabled={providerResultIsFinal || status === "APPROVED"}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            I consent to DRPAY and Sumsub processing the business, beneficial
            owner, identity-document, and biometric information required for
            KYB. See the{" "}
            <a href={APP_ROUTES.privacy} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        <div className="sumsub-verification-actions">
          <Button
            disabled={
              busy !== "" ||
              !profileSaved ||
              !consent ||
              status === "APPROVED" ||
              providerResultIsFinal
            }
            onClick={() => void startVerification()}
          >
            {busy === "sumsub"
              ? "Connecting to Sumsub…"
              : sumsubReviewStatus === "RESUBMISSION_REQUIRED"
                ? "Continue verification"
                : sumsubReviewStatus === "IN_PROGRESS"
                  ? "Resume verification"
                  : "Start verification"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== ""}
            onClick={() => void refreshKybStatus()}
          >
            Refresh status
          </Button>
          {sdkVisible && (
            <Button variant="secondary" onClick={closeVerification}>
              Close verification
            </Button>
          )}
        </div>
        <div
          ref={sdkContainerRef}
          className="sumsub-sdk-container"
          hidden={!sdkVisible}
        />
        {sumsubReviewStatus === "APPROVED" && (
          <p className="sumsub-approval-note">
            Sumsub checks passed. DRPAY will review the application separately;
            e-wallet access is enabled only after DRPAY approval and account
            activation.
          </p>
        )}
      </section>
      {error && (
        <p className="setup-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="setup-notice" role="status">
          {notice}
        </p>
      )}
      {status === "APPROVED" && (
        <p className="profile-info-note">
          Your KYB application has been approved. Contact DRPAY support to
          update your verified information.
        </p>
      )}
    </div>
  )
}

export function DeveloperSetupPanel({ refreshVersion }: { refreshVersion: number }) {
  const [keys, setKeys] = useState<MerchantApiKey[]>([]);
  const [webhook, setWebhook] = useState<MerchantWebhookSettings | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState(["read"]);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [events, setEvents] = useState(["payment.succeeded"]);
  const [newKey, setNewKey] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const failures: string[] = [];
    setError("");
    const captureFailure = (section: string, loadError: unknown) => {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "The request could not be completed.";
      failures.push(`${section}: ${message}`);
    };
    void Promise.all([
      getMerchantApiKeys()
        .then((nextKeys) => {
          if (active) setKeys(nextKeys);
        })
        .catch((loadError: unknown) => captureFailure("API keys", loadError)),
      getMerchantWebhook()
        .then((nextWebhook) => {
          if (!active) return;
          setWebhook(nextWebhook);
          if (nextWebhook) {
            setEndpointUrl(nextWebhook.endpointUrl);
            setCallbackUrl(nextWebhook.callbackUrl || "");
            setEvents(nextWebhook.events);
          }
        })
        .catch((loadError: unknown) =>
          captureFailure("Webhook settings", loadError),
        ),
      getMerchantWebhookDeliveries()
        .then((nextDeliveries) => {
          if (active) setDeliveries(nextDeliveries);
        })
        .catch((loadError: unknown) =>
          captureFailure("Webhook delivery history", loadError),
        ),
    ]).then(() => {
      if (active && failures.length) {
        setError(`Could not load ${failures.join("; ")}.`);
      }
    });
    return () => { active = false; };
  }, [refreshVersion]);

  async function addKey(event: FormEvent) {
    event.preventDefault();
    setBusy("key");
    setError("");
    setNewKey("");
    try {
      const created = await createMerchantApiKey({ name: keyName, scopes: keyScopes });
      setKeys((current) => [created, ...current]);
      setNewKey(created.key || "");
      setKeyName("");
      setNotice("API key created. Copy and store it now; it cannot be viewed again.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the API key.");
    } finally {
      setBusy("");
    }
  }

  async function revokeKey(id: string) {
    setBusy(id);
    setError("");
    try {
      await revokeMerchantApiKey(id);
      setKeys((current) => current.map((key) => key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key));
      setNotice("API key revoked.");
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke the API key.");
    } finally {
      setBusy("");
    }
  }

  async function saveWebhook(event: FormEvent) {
    event.preventDefault();
    setBusy("webhook");
    setError("");
    setSigningSecret("");
    try {
      const saved = await saveMerchantWebhook({ endpointUrl, callbackUrl, events });
      setWebhook(saved);
      setSigningSecret(saved.signingSecret || "");
      setNotice("Webhook saved. Copy the new signing secret now; saving again rotates it.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the webhook.");
    } finally {
      setBusy("");
    }
  }

  async function removeWebhook() {
    setBusy("delete-webhook");
    setError("");
    try {
      await deleteMerchantWebhook();
      setWebhook(null);
      setEndpointUrl("");
      setCallbackUrl("");
      setNotice("Webhook configuration deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the webhook.");
    } finally {
      setBusy("");
    }
  }

  async function retryDelivery(id: string) {
    setBusy(id);
    setError("");
    try {
      await retryMerchantWebhookDelivery(id);
      setDeliveries((current) =>
        current.map((delivery) =>
          delivery.id === id
            ? { ...delivery, attempts: 0, lastError: null, nextAttemptAt: new Date().toISOString() }
            : delivery,
        ),
      );
      setNotice("Webhook delivery queued for retry.");
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Could not retry the webhook delivery.");
    } finally {
      setBusy("");
    }
  }

  function toggleValue(values: string[], value: string, update: (next: string[]) => void) {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return (
    <div className="merchant-setup developer-settings">
      {error && <p className="setup-error" role="alert">{error}</p>}
      {notice && <p className="setup-notice" role="status">{notice}</p>}
      <div className="profile-info-intro"><strong>API keys</strong><p>Use the generated key as a Bearer token. Keys are shown once, stored only as hashes, and can be revoked immediately.</p></div>
      <form className="setup-form" onSubmit={(event) => void addKey(event)}>
        <label className="setup-form-wide">Key name<input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="Production checkout server" required maxLength={80} /></label>
        <fieldset className="setup-checks setup-form-wide"><legend>Permissions</legend>
          {["read", "payments:write"].map((scope) => <label key={scope}><input type="checkbox" checked={keyScopes.includes(scope)} onChange={() => toggleValue(keyScopes, scope, setKeyScopes)} />{scope === "read" ? "Read wallet and payment status" : "Create payment links"}</label>)}
        </fieldset>
        <Button type="submit" disabled={busy !== "" || keyScopes.length === 0}>{busy === "key" ? "Creating…" : "Generate API key"}</Button>
      </form>
      {newKey && <div className="setup-secret"><strong>Copy this API key now</strong><code>{newKey}</code></div>}
      <div className="setup-key-list">
        {keys.map((key) => <div className="setup-key-row" key={key.id}><span><strong>{key.name}</strong><small>{key.keyPrefix}… · {key.scopes.join(", ")} · {key.revokedAt ? "revoked" : key.lastUsedAt ? `used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "not used"}</small></span>{!key.revokedAt && <button className="setup-link-button danger" type="button" disabled={busy !== ""} onClick={() => void revokeKey(key.id)}>{busy === key.id ? "Revoking…" : "Revoke"}</button>}</div>)}
      </div>

      <div className="profile-info-intro"><strong>Webhook and callback</strong><p>Only public HTTPS URLs are accepted. Events use HMAC-SHA256 in the DRPAY-Signature header and retry with exponential backoff up to eight attempts.</p></div>
      <form className="setup-form" onSubmit={(event) => void saveWebhook(event)}>
        <label className="setup-form-wide">Webhook endpoint URL<input type="url" value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} placeholder="https://example.com/webhooks/drpay" required /></label>
        <label className="setup-form-wide">Callback URL (optional)<input type="url" value={callbackUrl} onChange={(event) => setCallbackUrl(event.target.value)} placeholder="https://example.com/payment-callback" /></label>
        <fieldset className="setup-checks setup-form-wide"><legend>Events</legend>
          {webhookEvents.map(([eventName, label]) => <label key={eventName}><input type="checkbox" checked={events.includes(eventName)} onChange={() => toggleValue(events, eventName, setEvents)} />{label}</label>)}
        </fieldset>
        <Button type="submit" disabled={busy !== "" || events.length === 0}>{busy === "webhook" ? "Saving…" : "Save webhook settings"}</Button>
        {webhook && <Button variant="secondary" disabled={busy !== ""} onClick={() => void removeWebhook()}>{busy === "delete-webhook" ? "Deleting…" : "Delete webhook"}</Button>}
      </form>
      <div className="profile-info-intro">
        <strong>Recent webhook deliveries</strong>
        <p>Delivery history is limited to the latest 50 events. Failed deliveries retry automatically up to eight attempts.</p>
      </div>
      {deliveries.length ? (
        <div className="setup-key-list">
          {deliveries.map((delivery) => (
            <div className="setup-key-row" key={delivery.id}>
              <span>
                <strong>{delivery.eventType} · {delivery.deliveredAt ? "Delivered" : delivery.attempts >= 8 ? "Needs attention" : "Retrying"}</strong>
                <small>
                  {new Date(delivery.createdAt).toLocaleString()} · {delivery.attemptHistory.length} total attempt{delivery.attemptHistory.length === 1 ? "" : "s"} · resource {delivery.resourceId}
                </small>
                <small>
                  {delivery.deliveredAt
                    ? `Delivered ${new Date(delivery.deliveredAt).toLocaleString()}`
                    : delivery.lastAttemptAt
                      ? `Last attempt ${new Date(delivery.lastAttemptAt).toLocaleString()}`
                      : `Next attempt ${new Date(delivery.nextAttemptAt).toLocaleString()}`}
                </small>
                {delivery.attemptHistory.slice(-3).map((attempt, index) => (
                  <small key={`${delivery.id}-${attempt.attemptedAt}-${index}`}>
                    {new Date(attempt.attemptedAt).toLocaleString()} ·{" "}
                    {attempt.delivered
                      ? "Delivered"
                      : attempt.error || "Delivery failed"}
                  </small>
                ))}
                {delivery.lastError && <small>{delivery.lastError}</small>}
              </span>
              {!delivery.deliveredAt && delivery.attempts >= 8 && (
                <button
                  className="setup-link-button"
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => void retryDelivery(delivery.id)}
                >
                  {busy === delivery.id ? "Queueing…" : "Retry"}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="profile-info-note">No webhook events have been queued yet.</p>
      )}
      {signingSecret && <div className="setup-secret"><strong>Copy this signing secret now</strong><code>{signingSecret}</code></div>}
      <p className="profile-info-note"><a href="/postman/DRPAY-Merchant-API.postman_collection.json" download>Download the Postman collection</a> · API base URL: <code>{getApiBaseUrl()}</code></p>
    </div>
  );
}

export function DeveloperCenter({
  refreshVersion,
  apiBaseUrl,
  paymentEnvironment,
}: {
  refreshVersion: number;
  apiBaseUrl: string;
  paymentEnvironment: PaymentEnvironment;
}) {
  const [activeTab, setActiveTab] = useState<"access" | "guide">("access");

  return (
    <div className="developer-center">
      <div className="developer-center-intro">
        <strong>Developer hub</strong>
        <p>Manage your API credentials and webhooks, or follow the integration guide.</p>
      </div>
      <nav className="developer-center-tabs" aria-label="Developer tools">
        <button
          id="developer-access-tab"
          className="developer-center-tab"
          type="button"
          aria-pressed={activeTab === "access"}
          aria-controls="developer-access-panel"
          onClick={() => setActiveTab("access")}
        >
          API access
        </button>
        <button
          id="developer-guide-tab"
          className="developer-center-tab"
          type="button"
          aria-pressed={activeTab === "guide"}
          aria-controls="developer-guide-panel"
          onClick={() => setActiveTab("guide")}
        >
          Integration guide
        </button>
      </nav>
      <div
        id="developer-access-panel"
        className="developer-center-panel"
        aria-label="API access"
        hidden={activeTab !== "access"}
      >
        <DeveloperSetupPanel refreshVersion={refreshVersion} />
      </div>
      <div
        id="developer-guide-panel"
        className="developer-center-panel"
        aria-label="Integration guide"
        hidden={activeTab !== "guide"}
      >
        <MerchantApiDocumentation
          apiBaseUrl={apiBaseUrl}
          paymentEnvironment={paymentEnvironment}
        />
      </div>
    </div>
  );
}

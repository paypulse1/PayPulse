import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
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
  uploadKybDocument,
  type KybDocument,
  type KybProfile,
  type MerchantApiKey,
  type MerchantWebhookSettings,
  type WebhookDelivery,
} from "./lib/swiftpay";

function Button({
  children,
  type = "button",
  variant = "primary",
  disabled,
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return <button className={`button button-${variant}`} type={type} disabled={disabled} onClick={onClick}>{children}</button>;
}

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

const documentTypes = [
  ["business_registration", "Business registration certificate"],
  ["identity_front", "Owner identity document — front"],
  ["identity_back", "Owner identity document — back"],
  ["proof_of_address", "Business address proof"],
] as const;

const webhookEvents = [
  ["payment.succeeded", "Payment succeeded"],
  ["payment.failed", "Payment failed"],
  ["disbursement.succeeded", "Disbursement succeeded"],
  ["disbursement.failed", "Disbursement failed"],
] as const;

export function KybSetupPanel({ refreshVersion }: { refreshVersion: number }) {
  const [profile, setProfile] = useState(initialKyb);
  const [status, setStatus] = useState<KybProfile["status"] | "">("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [documents, setDocuments] = useState<KybDocument[]>([]);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getMerchantKyb().then((result) => {
      if (!active) return;
      if (result.profile) {
        const { status: nextStatus, reviewNotes: notes, ...values } = result.profile;
        setProfile(values);
        setStatus(nextStatus);
        setReviewNotes(notes || "");
      }
      setDocuments(result.documents);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your KYB application.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshVersion]);

  function updateField(field: keyof typeof initialKyb, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy("profile");
    setError("");
    setNotice("");
    try {
      const result = await saveMerchantKybProfile(profile);
      setStatus(result.status);
      setReviewNotes("");
      setNotice("KYB details saved. Upload the required documents to complete your application.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your KYB details.");
    } finally {
      setBusy("");
    }
  }

  async function uploadDocument(documentType: string) {
    const file = files[documentType];
    if (!file) return;
    setBusy(documentType);
    setError("");
    setNotice("");
    try {
      await uploadKybDocument(documentType, file);
      const result = await getMerchantKyb();
      setDocuments(result.documents);
      setStatus(result.profile?.status || "PENDING");
      setFiles((current) => ({ ...current, [documentType]: undefined }));
      setNotice("Document uploaded securely.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the KYB document.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <p className="profile-sheet-state">Loading KYB application…</p>;

  return (
    <div className="merchant-setup">
      {status && <div className={`kyb-status status-${status.toLowerCase()}`}><strong>{status.replace("_", " ")}</strong>{reviewNotes && <span>{reviewNotes}</span>}</div>}
      <p className="profile-info-note">Provide your registered business details and beneficial owner information.</p>
      <form className="setup-form" onSubmit={(event) => void saveProfile(event)}>
        <label>Legal business name<input value={profile.legalBusinessName} onChange={(event) => updateField("legalBusinessName", event.target.value)} required maxLength={200} /></label>
        <label>Registration number<input value={profile.registrationNumber} onChange={(event) => updateField("registrationNumber", event.target.value)} required maxLength={200} /></label>
        <label>Business type<input value={profile.businessType} onChange={(event) => updateField("businessType", event.target.value)} placeholder="Corporation, partnership, sole proprietor" required maxLength={200} /></label>
        <label>Country<input value={profile.country} onChange={(event) => updateField("country", event.target.value)} required maxLength={200} /></label>
        <label className="setup-form-wide">Registered business address<textarea value={profile.businessAddress} onChange={(event) => updateField("businessAddress", event.target.value)} required maxLength={200} rows={2} /></label>
        <label>Beneficial owner full name<input value={profile.ownerFullName} onChange={(event) => updateField("ownerFullName", event.target.value)} required maxLength={200} /></label>
        <label>Date of birth<input type="date" value={profile.ownerDateOfBirth} onChange={(event) => updateField("ownerDateOfBirth", event.target.value)} required /></label>
        <label>Owner nationality<input value={profile.ownerNationality} onChange={(event) => updateField("ownerNationality", event.target.value)} required maxLength={200} /></label>
        <label>Owner email<input type="email" value={profile.ownerEmail} onChange={(event) => updateField("ownerEmail", event.target.value)} required maxLength={200} /></label>
        <label>Owner phone<input type="tel" value={profile.ownerPhone} onChange={(event) => updateField("ownerPhone", event.target.value)} required maxLength={200} /></label>
        <Button type="submit" disabled={busy !== "" || status === "APPROVED"}>{busy === "profile" ? "Saving…" : "Save KYB details"}</Button>
      </form>
      <div className="setup-documents">
        <h3>Documents</h3>
        <p className="profile-info-note">Registration and both owner identity sides are required. Address proof is optional. PDF, JPEG, or PNG · maximum 10 MB each.</p>
        {documentTypes.map(([documentType, label]) => {
          const existing = documents.find((document) => document.documentType === documentType);
          return (
            <div className="setup-document-row" key={documentType}>
              <div><strong>{label}</strong><small>{existing ? `Uploaded: ${existing.fileName}` : "Not uploaded"}</small></div>
              <label className="setup-file-button">
                {files[documentType] ? "Change file" : existing ? "Replace" : "Choose file"}
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  disabled={status === "APPROVED"}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setFiles((current) => ({ ...current, [documentType]: event.target.files?.[0] }))}
                />
              </label>
              {files[documentType] && <button className="setup-link-button" type="button" disabled={busy !== ""} onClick={() => void uploadDocument(documentType)}>{busy === documentType ? "Uploading…" : "Upload"}</button>}
            </div>
          );
        })}
      </div>
      {error && <p className="setup-error" role="alert">{error}</p>}
      {notice && <p className="setup-notice" role="status">{notice}</p>}
      {status === "APPROVED" && <p className="profile-info-note">Your KYB application has been approved. Contact DRPAY support to update your verified information.</p>}
    </div>
  );
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

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Landmark } from "lucide-react";
import { AppLauncher } from "@capacitor/app-launcher";
import { Capacitor } from "@capacitor/core";
import type { InstitutionBrand } from "./lib/swiftpay";
import { getInstitutionLogoAsset } from "./lib/institutionLogos";
import {
  getPaymentInstitutionAppName,
  getPaymentInstitutionDeepLink,
} from "./lib/paymentInstitutionLinks";

export function InstitutionLogo({ institution, className = "" }: { institution: InstitutionBrand; className?: string }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState("");
  const fallbackLogoUrl = getInstitutionLogoAsset(institution.code, institution.name);
  const logoUrl = fallbackLogoUrl || institution.logoUrl;
  const nextLogoUrl = fallbackLogoUrl && institution.logoUrl !== fallbackLogoUrl
    ? institution.logoUrl
    : undefined;

  useEffect(() => {
    setFailedLogoUrl("");
  }, [logoUrl, nextLogoUrl]);

  if (logoUrl && failedLogoUrl !== logoUrl) {
    return (
      <img
        className={className}
        src={logoUrl}
        alt={`${institution.name} logo`}
        onError={() => setFailedLogoUrl(logoUrl)}
      />
    );
  }
  if (nextLogoUrl && failedLogoUrl !== nextLogoUrl) {
    return (
      <img
        className={className}
        src={nextLogoUrl}
        alt={`${institution.name} logo`}
        onError={() => setFailedLogoUrl(nextLogoUrl)}
      />
    );
  }

  return (
    <span className={`${className} institution-logo-unavailable`} role="img" aria-label={`Logo unavailable for ${institution.name}`}>
      <Landmark size={16} aria-hidden="true" />
    </span>
  );
}

export default function QrPaymentDisplay({ value, institution, showBirLogo = false, showBrandNotes = true }: { value?: string; institution?: InstitutionBrand; showBirLogo?: boolean; showBrandNotes?: boolean }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [launchError, setLaunchError] = useState("");
  const institutionDeepLink = institution
    ? getPaymentInstitutionDeepLink(institution, value)
    : undefined;
  const launchFailureMessage = institution
    ? `Could not open ${getPaymentInstitutionAppName(institution)}. Scan this QR code with the app on another device.`
    : "";

  useEffect(() => {
    setLaunchError("");
  }, [institutionDeepLink]);

  useEffect(() => {
    let active = true;
    setImage("");
    setError("");
    if (!value) {
      setError("The QR payload is unavailable for this checkout.");
      return () => { active = false; };
    }
    QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 4,
      color: { dark: "#071429", light: "#ffffff" },
    }).then((svg) => {
      if (active) setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    }).catch(() => {
      if (active) setError("The QR could not be rendered. Create a new checkout.");
    });
    return () => { active = false; };
  }, [value]);

  if (error) return <p className="checkout-qr-error" role="alert">{error}</p>;
  if (!image) return <p className="checkout-qr-loading" role="status">Preparing scannable QR…</p>;

  return (
    <div className="qr-payment-display">
      {institution && (
        <div className="qr-brand-label">
          <InstitutionLogo institution={institution} className="qr-brand-logo" />
          <span>Payment method: <strong>{getPaymentInstitutionAppName(institution)}</strong></span>
        </div>
      )}
      <div className="qr-preview-frame">
        <img className="qr-preview" src={image} alt="Scan this QRPH payment code" />
        {showBirLogo && (
          <img
            className="qr-bir-logo"
            src="/checkout-badges/bir-seal.png"
            alt="Bureau of Internal Revenue seal"
          />
        )}
      </div>
      {institution && institutionDeepLink ? (
        <div className="qr-app-actions">
          <a
            className="button button-secondary"
            href={institutionDeepLink}
            onClick={(event) => {
              if (!Capacitor.isNativePlatform()) return;
              event.preventDefault();
              setLaunchError("");
              void AppLauncher.openUrl({ url: institutionDeepLink })
                .then(({ completed }) => {
                  if (!completed) setLaunchError(launchFailureMessage);
                })
                .catch(() => setLaunchError(launchFailureMessage));
            }}
          >
            {getPaymentInstitutionAppName(institution) === "GCash"
              ? "Pay with GCash"
              : `Open ${getPaymentInstitutionAppName(institution)} to scan`}
          </a>
          {launchError && <p className="qr-brand-note" role="alert">{launchError}</p>}
          {showBrandNotes && (
            <p className="qr-brand-note">
              If this link is unavailable, scan the QR with {getPaymentInstitutionAppName(institution)} on another device.
            </p>
          )}
        </div>
      ) : institution &&
        getPaymentInstitutionAppName(institution) === "GCash" &&
        showBrandNotes ? (
        <p className="qr-brand-note">
          Open GCash on another device and scan this QR to pay.
        </p>
      ) : null}
    </div>
  );
}

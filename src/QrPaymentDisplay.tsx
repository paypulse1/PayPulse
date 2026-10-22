import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Landmark } from "lucide-react";
import type { InstitutionBrand } from "./lib/swiftpay";
import { getInstitutionLogoAsset } from "./lib/institutionLogos";

export function InstitutionLogo({ institution, className = "" }: { institution: InstitutionBrand; className?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (institution.code === "CARD_MAYA") {
    return (
      <span className={`${className} institution-card-network-logos`} role="img" aria-label="Visa, Mastercard, and JCB">
        <img src="/bank-logos/visa.png" alt="" />
        <img src="/bank-logos/mastercard.png" alt="" />
        <img src="/bank-logos/jcb.png" alt="" />
      </span>
    );
  }

  const logoUrl = getInstitutionLogoAsset(institution.code, institution.name) || institution.logoUrl;
  if (logoUrl && !imageFailed) {
    return <img className={className} src={logoUrl} alt={`${institution.name} logo`} onError={() => setImageFailed(true)} />;
  }

  return (
    <span className={`${className} institution-logo-unavailable`} role="img" aria-label={`Logo unavailable for ${institution.name}`}>
      <Landmark size={16} aria-hidden="true" />
    </span>
  );
}

export default function QrPaymentDisplay({ value, institution }: { value?: string; institution?: InstitutionBrand }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");

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
          <span>Paying with <strong>{institution.name}</strong></span>
        </div>
      )}
      <img className="qr-preview" src={image} alt="Scan this QR Ph payment code" />
      {institution && (
        <p className="qr-brand-note">
          The selected app and logo are for display only. QR Ph routing and app support are determined by SwiftPay.
        </p>
      )}
    </div>
  );
}

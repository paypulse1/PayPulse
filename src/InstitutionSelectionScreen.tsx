import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronRight, LoaderCircle, Search } from "lucide-react";
import { getPaymentInstitutions, type PaymentInstitution } from "./lib/swiftpay";
import { InstitutionLogo } from "./QrPaymentDisplay";

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    UNIVERSAL: "Bank",
    RURAL: "Rural bank",
    CARD: "Debit or credit card",
    QR: "QR payment",
    BNPL: "Buy now, pay later",
    EWALLET: "E-wallet",
    PAWNSHOP: "Pawnshop",
  };
  return labels[category] || "Payment institution";
}

export default function InstitutionSelectionScreen({
  onBack,
  onConfirm,
  busy = false,
  submissionError = "",
}: {
  onBack: () => void;
  onConfirm: (institution: PaymentInstitution) => void;
  busy?: boolean;
  submissionError?: string;
}) {
  const [institutions, setInstitutions] = useState<PaymentInstitution[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadInstitutions() {
    setLoading(true);
    setError("");
    try {
      setInstitutions(await getPaymentInstitutions());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load SwiftPay institutions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInstitutions();
  }, []);

  const filteredInstitutions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return institutions;
    return institutions.filter((institution) =>
      `${institution.name} ${institution.code}`.toLowerCase().includes(normalizedQuery),
    );
  }, [institutions, query]);

  const selectedInstitution = institutions.find((institution) => institution.code === selectedCode);

  return (
    <section className="institution-selection" aria-labelledby="institution-selection-title">
      <button type="button" className="institution-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>
      <span className="eyebrow">PAYMENT APP</span>
      <h3 id="institution-selection-title">Which bank or wallet will the customer use?</h3>
      <p className="institution-selection-note">
        Choose a logo to show with the QR. The list comes from SwiftPay’s institution directory.
        This selection is for display only; SwiftPay routes the QR Ph payment, and app support can vary.
      </p>
      {submissionError && <div className="inline-error" role="alert"><AlertCircle size={15} />{submissionError}</div>}
      <label className="institution-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search banks and wallets"
          aria-label="Search SwiftPay institutions"
        />
      </label>
      {loading ? (
        <div className="institution-list-state" role="status"><LoaderCircle className="spin" size={18} />Loading institutions…</div>
      ) : error ? (
        <div className="institution-list-state institution-list-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => void loadInstitutions()}>Retry</button>
        </div>
      ) : (
        <div className="institution-selection-list" role="listbox" aria-label="SwiftPay institutions">
          {filteredInstitutions.length ? filteredInstitutions.map((institution) => (
            <button
              type="button"
              role="option"
              aria-selected={institution.code === selectedCode}
              className="institution-selection-option"
              key={institution.code}
              onClick={() => setSelectedCode(institution.code)}
            >
              <InstitutionLogo institution={institution} className="institution-selection-logo" />
              <span className="institution-option-copy">
                <strong>{institution.name}</strong>
                <small>{categoryLabel(institution.category)}</small>
              </span>
              <span className="institution-option-check">{institution.code === selectedCode ? "Selected" : <ChevronRight size={16} />}</span>
            </button>
          )) : <p className="institution-list-state">No institutions match that search.</p>}
        </div>
      )}
      <button
        type="button"
        className="button button-primary institution-continue"
        disabled={!selectedInstitution || loading || busy}
        onClick={() => selectedInstitution && onConfirm(selectedInstitution)}
      >
        {busy ? "Creating QR…" : `Continue with ${selectedInstitution?.name || "selected institution"}`}
      </button>
    </section>
  );
}

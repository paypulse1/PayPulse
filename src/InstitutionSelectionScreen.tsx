import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronRight, LoaderCircle, Search } from "lucide-react";
import { getPaymentInstitutions, type PaymentInstitution } from "./lib/swiftpay";
import { InstitutionLogo } from "./QrPaymentDisplay";

const koreanQrApps: PaymentInstitution[] = [
  { code: "KR_KAKAOPAY", name: "Kakao Pay", category: "QR" },
  { code: "KR_NAVERPAY", name: "Naver Pay", category: "QR" },
  { code: "KR_TOSS", name: "Toss Pay", category: "QR" },
];

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
  showKoreanQrApps = false,
  busy = false,
  submissionError = "",
}: {
  onBack: () => void;
  onConfirm: (institution: PaymentInstitution) => void;
  showKoreanQrApps?: boolean;
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
    const options = [...(showKoreanQrApps ? koreanQrApps : []), ...institutions];
    if (!normalizedQuery) return options;
    return options.filter((institution) =>
      `${institution.name} ${institution.code}`.toLowerCase().includes(normalizedQuery),
    );
  }, [institutions, query, showKoreanQrApps]);

  const selectedInstitution = [...(showKoreanQrApps ? koreanQrApps : []), ...institutions].find((institution) => institution.code === selectedCode);
  const filteredKoreanApps = filteredInstitutions.filter((institution) => institution.code.startsWith("KR_"));
  const filteredSwiftPayInstitutions = filteredInstitutions.filter((institution) => !institution.code.startsWith("KR_"));

  function renderOptions(options: PaymentInstitution[]) {
    return options.map((institution) => (
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
          <small>{institution.code.startsWith("KR_") ? "Korean QR payment app" : categoryLabel(institution.category)}</small>
        </span>
        <span className="institution-option-check">{institution.code === selectedCode ? "Selected" : <ChevronRight size={16} />}</span>
      </button>
    ));
  }

  return (
    <section className="institution-selection" aria-labelledby="institution-selection-title">
      <button type="button" className="institution-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>
      <span className="eyebrow">MANUAL BANK TRANSFER</span>
      <h3 id="institution-selection-title">Which bank or wallet should appear with the QR?</h3>
      <p className="institution-selection-note">
        Choose the institution logo to display with the QR.
      </p>
      {submissionError && <div className="inline-error" role="alert"><AlertCircle size={15} />{submissionError}</div>}
      <label className="institution-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search banks, wallets, and apps"
          aria-label="Search payment institutions and apps"
        />
      </label>
      {loading && !showKoreanQrApps ? (
        <div className="institution-list-state" role="status"><LoaderCircle className="spin" size={18} />Loading institutions…</div>
      ) : error ? (
        <>
          <div className="institution-list-state institution-list-error" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => void loadInstitutions()}>Retry</button>
          </div>
          {showKoreanQrApps && filteredKoreanApps.length > 0 && (
            <div className="institution-selection-list" role="listbox" aria-label="Korean QR payment apps">
              <div role="group" aria-label="Korean QR payment apps">
                <p className="institution-group-title">Korean QR payment apps</p>
                {renderOptions(filteredKoreanApps)}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {loading && <div className="institution-list-state" role="status"><LoaderCircle className="spin" size={18} />Loading SwiftPay institutions…</div>}
          <div
            className="institution-selection-list"
            role="listbox"
            aria-label={showKoreanQrApps ? "Korean QR apps and SwiftPay institutions" : "SwiftPay institutions"}
          >
            {filteredInstitutions.length ? (
              <>
                {filteredKoreanApps.length > 0 && (
                  <div role="group" aria-label="Korean QR payment apps">
                    <p className="institution-group-title">Korean QR payment apps</p>
                    {renderOptions(filteredKoreanApps)}
                  </div>
                )}
                {filteredSwiftPayInstitutions.length > 0 && (
                  <div role="group" aria-label="SwiftPay institutions">
                    <p className="institution-group-title">SwiftPay institutions</p>
                    {renderOptions(filteredSwiftPayInstitutions)}
                  </div>
                )}
              </>
            ) : <p className="institution-list-state">No institutions match that search.</p>}
          </div>
        </>
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

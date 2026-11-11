import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronRight, LoaderCircle, Search } from "lucide-react";
import {
  getPaymentInstitutions,
  VIRTUAL_ACCOUNT_INSTITUTION_CODE,
  type PaymentInstitution,
} from "./lib/swiftpay";
import {
  getPaymentInstitutionAppName,
  getPaymentInstitutionDeepLink,
} from "./lib/paymentInstitutionLinks";
import { InstitutionLogo } from "./QrPaymentDisplay";

const virtualAccountInstitution: PaymentInstitution = {
  code: VIRTUAL_ACCOUNT_INSTITUTION_CODE,
  name: "Virtual Account",
  category: "VIRTUAL_ACCOUNT",
};

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
    VIRTUAL_ACCOUNT: "QRPH and InstaPay bank transfer",
  };
  return labels[category] || "Payment institution";
}

function institutionLabel(institution: PaymentInstitution) {
  return getPaymentInstitutionAppName(institution)
}

function institutionCategoryLabel(institution: PaymentInstitution) {
  const label = institution.code.trim().toUpperCase() === "ALIPAY"
    ? "Alipay+ · QR payment"
    : institution.code.startsWith("KR_")
    ? "Korean QR payment app"
    : categoryLabel(institution.category)
  return getPaymentInstitutionDeepLink(institution)
    ? `${label} · App link available`
    : label
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
    const supportedInstitutions = [...institutions].sort((a, b) => {
      if (a.code.trim().toUpperCase() === "ALIPAY") return -1
      if (b.code.trim().toUpperCase() === "ALIPAY") return 1
      return 0
    })
    const options = [
      ...(showKoreanQrApps ? koreanQrApps : []),
      virtualAccountInstitution,
      ...supportedInstitutions,
    ];
    if (!normalizedQuery) return options;
    return options.filter((institution) =>
      `${institutionLabel(institution)} ${institution.name} ${institution.code}`.toLowerCase().includes(normalizedQuery),
    );
  }, [institutions, query, showKoreanQrApps]);

  const selectedInstitution = [
    ...(showKoreanQrApps ? koreanQrApps : []),
    virtualAccountInstitution,
    ...institutions,
  ].find((institution) => institution.code === selectedCode);
  const filteredKoreanApps = filteredInstitutions.filter((institution) => institution.code.startsWith("KR_"));
  const filteredVirtualAccount = filteredInstitutions.filter(
    (institution) => institution.code === virtualAccountInstitution.code,
  );
  const filteredSwiftPayInstitutions = filteredInstitutions.filter(
    (institution) =>
      !institution.code.startsWith("KR_") &&
      institution.code !== virtualAccountInstitution.code,
  );

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
          <strong>{institutionLabel(institution)}</strong>
          <small>{institutionCategoryLabel(institution)}</small>
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
      <span className="eyebrow">PAYMENT METHOD</span>
      <h3 id="institution-selection-title">Which payment method should appear with the QR?</h3>
      <p className="institution-selection-note">
        Choose a bank or wallet, or use the Virtual Account details generated for this QR.
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
      {error ? (
        <>
          <div className="institution-list-state institution-list-error" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => void loadInstitutions()}>Retry</button>
          </div>
          {(filteredVirtualAccount.length > 0 || filteredKoreanApps.length > 0) && (
            <div className="institution-selection-list" role="listbox" aria-label="Available payment methods">
              {filteredVirtualAccount.length > 0 && (
                <div role="group" aria-label="Virtual Account">
                  <p className="institution-group-title">Virtual Account</p>
                  {renderOptions(filteredVirtualAccount)}
                </div>
              )}
              {showKoreanQrApps && filteredKoreanApps.length > 0 && (
                <div role="group" aria-label="Korean QR payment apps">
                  <p className="institution-group-title">Korean QR payment apps</p>
                  {renderOptions(filteredKoreanApps)}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {loading && <div className="institution-list-state" role="status"><LoaderCircle className="spin" size={18} />Loading SwiftPay institutions…</div>}
          <div
            className="institution-selection-list"
            role="listbox"
            aria-label="Payment methods and SwiftPay institutions"
          >
            {filteredInstitutions.length ? (
              <>
                {filteredKoreanApps.length > 0 && (
                  <div role="group" aria-label="Korean QR payment apps">
                    <p className="institution-group-title">Korean QR payment apps</p>
                    {renderOptions(filteredKoreanApps)}
                  </div>
                )}
                {filteredVirtualAccount.length > 0 && (
                  <div role="group" aria-label="Virtual Account">
                    <p className="institution-group-title">Virtual Account</p>
                    {renderOptions(filteredVirtualAccount)}
                  </div>
                )}
                {filteredSwiftPayInstitutions.length > 0 && (
                  <div role="group" aria-label="SwiftPay institutions">
                    <p className="institution-group-title">
                      {filteredSwiftPayInstitutions.some(
                        (institution) =>
                          institution.code.trim().toUpperCase() === "ALIPAY",
                      )
                        ? "Alipay+ and SwiftPay institutions"
                        : "SwiftPay institutions"}
                    </p>
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
        disabled={
          !selectedInstitution ||
          (loading &&
            selectedInstitution.code !== VIRTUAL_ACCOUNT_INSTITUTION_CODE) ||
          busy
        }
        onClick={() => selectedInstitution && onConfirm(selectedInstitution)}
      >
        {busy ? "Creating QR…" : `Continue with ${selectedInstitution?.name || "selected payment method"}`}
      </button>
    </section>
  );
}

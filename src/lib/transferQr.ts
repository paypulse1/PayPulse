export type TransferQrDetails = {
  bank: string;
  accountNumber: string;
  fullName?: string;
  amount?: number;
  channel?: "INSTAPAY" | "PESONET";
};

export type MerchantQrDetails = {
  merchantName?: string;
  merchantId?: string;
  amount?: number;
  currency?: string;
  city?: string;
  reference?: string;
};

export type ScannedQrPayload =
  | { type: "p2p"; transfer: TransferQrDetails }
  | { type: "p2m"; merchant: MerchantQrDetails };

const qrPhP2pGui = "com.p2pqrpay";
const qrPhP2mGuis = new Set(["com.p2mqrpay", "ph.ppmi.p2m", "com.qrph.p2m"]);
const currencyNames: Record<string, string> = { "608": "PHP" };
const aliases = {
  bank: ["bank", "bankname", "bankcode", "institution", "institutioncode", "destinationbank"],
  accountNumber: ["account", "accountnumber", "accountno", "recipientaccount", "recipientaccountnumber"],
  fullName: ["name", "fullname", "beneficiary", "beneficiaryname", "recipient", "recipientname"],
  amount: ["amount", "transferamount"],
  channel: ["channel", "rail"],
} as const;

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z]/g, "");
}

function findValue(record: Record<string, unknown>, keys: readonly string[]) {
  for (const [key, value] of Object.entries(record)) {
    if (keys.includes(normalizeKey(key)) && (typeof value === "string" || typeof value === "number")) {
      return String(value).trim();
    }
  }
}

function parseRecord(record: Record<string, unknown>): TransferQrDetails | undefined {
  const nested = ["transfer", "recipient", "beneficiary", "data"].flatMap((key) => {
    const value = record[key];
    return value && typeof value === "object" && !Array.isArray(value)
      ? [value as Record<string, unknown>]
      : [];
  });
  const source = { ...record, ...Object.assign({}, ...nested) };
  const bank = findValue(source, aliases.bank);
  const accountNumber = findValue(source, aliases.accountNumber);
  const fullName = findValue(source, aliases.fullName);
  if (!bank || !accountNumber) return undefined;

  const rawAmount = findValue(source, aliases.amount);
  const amount = rawAmount ? Number(rawAmount.replace(/,/g, "")) : undefined;
  const rawChannel = findValue(source, aliases.channel)?.toUpperCase();
  return {
    bank,
    accountNumber,
    ...(fullName ? { fullName } : {}),
    ...(amount !== undefined && Number.isFinite(amount) && amount > 0 ? { amount } : {}),
    ...(rawChannel === "INSTAPAY" || rawChannel === "PESONET" ? { channel: rawChannel } : {}),
  };
}

function parseEmvTlv(payload: string): Map<string, string> | undefined {
  const fields = new Map<string, string>();
  let offset = 0;
  while (offset < payload.length) {
    if (offset + 4 > payload.length) return undefined;
    const tag = payload.slice(offset, offset + 2);
    const lengthValue = payload.slice(offset + 2, offset + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthValue)) return undefined;
    const length = Number(lengthValue);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > payload.length) return undefined;
    fields.set(tag, payload.slice(valueStart, valueEnd));
    offset = valueEnd;
  }
  return fields;
}

function parseQrPh(payload: string): ScannedQrPayload | undefined {
  const fields = parseEmvTlv(payload);
  if (!fields) return undefined;
  const accountTemplates = [...fields.entries()]
    .filter(([tag]) => Number(tag) >= 26 && Number(tag) <= 51)
    .map(([, value]) => parseEmvTlv(value));
  const p2pTemplate = accountTemplates.find((candidate) => candidate?.get("00")?.toLowerCase() === qrPhP2pGui);
  if (p2pTemplate) {
    const bank = p2pTemplate.get("01")?.trim().toUpperCase();
    const accountNumber = ["04", "03", "02", "05"]
      .map((tag) => p2pTemplate.get(tag)?.trim())
      .find((value) => value && /^\d{6,24}$/.test(value));
    if (!bank || !accountNumber) return undefined;

    const rawAmount = fields.get("54");
    const amount = rawAmount ? Number(rawAmount) : undefined;
    const fullName = fields.get("59")?.trim();
    return {
      type: "p2p",
      transfer: {
        bank,
        accountNumber,
        ...(fullName ? { fullName } : {}),
        ...(amount !== undefined && Number.isFinite(amount) && amount > 0 ? { amount } : {}),
      },
    };
  }

  const p2mTemplate = accountTemplates.find((candidate) => {
    const gui = candidate?.get("00")?.toLowerCase();
    return Boolean(gui && qrPhP2mGuis.has(gui));
  }) || (
    fields.get("58") === "PH"
    && fields.has("52")
    && fields.has("59")
    ? accountTemplates.find((candidate) => Boolean(candidate?.get("00")))
    : undefined
  );
  if (!p2mTemplate) return undefined;

  const nestedAdditionalData = parseEmvTlv(fields.get("62") || "");
  const rawAmount = fields.get("54");
  const amount = rawAmount ? Number(rawAmount) : undefined;
  const merchantId = ["02", "01", "03"]
    .map((tag) => p2mTemplate.get(tag)?.trim())
    .find(Boolean);
  const merchantName = fields.get("59")?.trim();
  const currencyCode = fields.get("53");
  const city = fields.get("60")?.trim();
  const reference = nestedAdditionalData?.get("05")?.trim();
  return {
    type: "p2m",
    merchant: {
      ...(merchantName ? { merchantName } : {}),
      ...(merchantId ? { merchantId } : {}),
      ...(amount !== undefined && Number.isFinite(amount) && amount > 0 ? { amount } : {}),
      ...(currencyCode ? { currency: currencyNames[currencyCode] || currencyCode } : {}),
      ...(city ? { city } : {}),
      ...(reference ? { reference } : {}),
    },
  };
}

export function parseScannedQr(payload: string): ScannedQrPayload | undefined {
  const qrPhDetails = parseQrPh(payload.trim());
  if (qrPhDetails) return qrPhDetails;

  try {
    const value: unknown = JSON.parse(payload);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const details = parseRecord(value as Record<string, unknown>);
      return details ? { type: "p2p", transfer: details } : undefined;
    }
  } catch {
    // Try URL query parameters below.
  }

  try {
    const url = new URL(payload);
    const details = parseRecord(Object.fromEntries(url.searchParams.entries()));
    return details ? { type: "p2p", transfer: details } : undefined;
  } catch {
    return undefined;
  }
}

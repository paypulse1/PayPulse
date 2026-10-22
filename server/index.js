import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { SignJWT, jwtVerify } from "jose";
import pg from "pg";

const { Pool } = pg;
const app = express();
const clientBuildDirectory = fileURLToPath(new URL("../dist", import.meta.url));
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "24kb" }));

const frontendOrigin = process.env.DRPAY_FRONTEND_ORIGIN;
const allowedOrigins = new Set([
  frontendOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://localhost",
  "capacitor://localhost",
].filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error("Origin is not allowed");
    error.status = 403;
    return callback(error);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  maxAge: 600,
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const authEmail = process.env.DRPAY_MERCHANT_EMAIL?.trim().toLowerCase();
const authPassword = process.env.DRPAY_MERCHANT_PASSWORD;
const superAdminEmail = process.env.DRPAY_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const superAdminPassword = process.env.DRPAY_SUPER_ADMIN_PASSWORD;
const passwordSalt = process.env.DRPAY_PASSWORD_SALT;
const jwtSecretValue = process.env.DRPAY_JWT_SECRET;
const jwtSecret = jwtSecretValue ? new TextEncoder().encode(jwtSecretValue) : null;
const swiftPayAccessKey = process.env.SWIFTPAY_ACCESS_KEY;
const swiftPaySecretKey = process.env.SWIFTPAY_SECRET_KEY;
const swiftPayEnvironment = process.env.SWIFTPAY_ENV || "sandbox";
const liveMoneyAcknowledgement = process.env.SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED;
const swiftPayBaseUrl = swiftPayEnvironment === "production"
  ? "https://api.pay.live.swiftpay.ph/api"
  : "https://api.pay.sandbox.live.swiftpay.ph/api";
const maxTransferAmount = Number(process.env.DRPAY_MAX_TRANSFER_PHP || "100000");
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
const paymentLinkLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const transferLimiter = rateLimit({ windowMs: 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });
const publicCheckoutLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false });
const publicQrImageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
const institutionCache = new Map();
let liveKrwPhpRateCache = null;

function requiredEnvironment() {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!authEmail) missing.push("DRPAY_MERCHANT_EMAIL");
  if (!authPassword || authPassword.length < 16) missing.push("DRPAY_MERCHANT_PASSWORD (16+ characters)");
  if (!superAdminEmail) missing.push("DRPAY_SUPER_ADMIN_EMAIL");
  if (!superAdminPassword || superAdminPassword.length < 16) missing.push("DRPAY_SUPER_ADMIN_PASSWORD (16+ characters)");
  if (!passwordSalt || passwordSalt.length < 32) missing.push("DRPAY_PASSWORD_SALT (32+ characters)");
  if (!jwtSecretValue || jwtSecretValue.length < 32) missing.push("DRPAY_JWT_SECRET (32+ characters)");
  if (!swiftPayAccessKey) missing.push("SWIFTPAY_ACCESS_KEY");
  if (!swiftPaySecretKey) missing.push("SWIFTPAY_SECRET_KEY");
  if (!frontendOrigin) missing.push("DRPAY_FRONTEND_ORIGIN");
  if (!Number.isFinite(maxTransferAmount) || maxTransferAmount <= 0) missing.push("DRPAY_MAX_TRANSFER_PHP");
  if (!["sandbox", "production"].includes(swiftPayEnvironment)) missing.push("SWIFTPAY_ENV (sandbox or production)");
  if (swiftPayEnvironment === "production" && liveMoneyAcknowledgement !== "I_UNDERSTAND_REAL_MONEY") {
    missing.push("SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY");
  }
  return missing;
}

function passwordMatchesWithSalt(candidate, expectedPassword, salt) {
  const expected = scryptSync(expectedPassword, salt, 64);
  const actual = scryptSync(candidate, salt, 64);
  return timingSafeEqual(expected, actual);
}

function passwordHash(password, salt = randomBytes(32).toString("hex")) {
  return { passwordSalt: salt, passwordHash: scryptSync(password, salt, 64).toString("hex") };
}

function matchesPasswordHash(candidate, salt, expectedHash) {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = scryptSync(candidate, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_accounts (
      email TEXT PRIMARY KEY,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payment_links (
      id UUID PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      reference_no TEXT NOT NULL UNIQUE,
      code TEXT UNIQUE,
      title TEXT NOT NULL,
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'PHP',
      payment_url TEXT,
      checkout_type TEXT NOT NULL DEFAULT 'PAYMENT_LINK',
      payment_token TEXT,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS disbursements (
      id UUID PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      merchant_reference_no TEXT NOT NULL UNIQUE,
      swiftpay_id UUID UNIQUE,
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      channel TEXT NOT NULL CHECK (channel IN ('INSTAPAY', 'PESONET')),
      institution_code TEXT NOT NULL,
      request_fingerprint TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payment_links_created_at_idx ON payment_links (created_at DESC);
    CREATE INDEX IF NOT EXISTS disbursements_created_at_idx ON disbursements (created_at DESC);
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS checkout_type TEXT NOT NULL DEFAULT 'PAYMENT_LINK';
    ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS payment_token TEXT;
    ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS disbursements_active_fingerprint_idx
      ON disbursements (request_fingerprint)
      WHERE status IN ('REQUESTING', 'PENDING', 'OUTCOME_UNKNOWN');
  `);
  if (authEmail && authPassword && passwordSalt) {
    const seededPassword = passwordHash(authPassword, passwordSalt);
    await pool.query(
      `INSERT INTO merchant_accounts (email, password_salt, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [authEmail, seededPassword.passwordSalt, seededPassword.passwordHash],
    );
  }
  if (process.env.DRPAY_KRW_TO_PHP_RATE !== undefined) {
    const configuredRate = Number(process.env.DRPAY_KRW_TO_PHP_RATE);
    if (Number.isFinite(configuredRate) && configuredRate > 0) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ('krw_to_php_rate', $1)
         ON CONFLICT (setting_key) DO NOTHING`,
        [String(configuredRate)],
      );
    }
  }
}

async function swiftPayFetch(path, { method = "GET", body, headers = {}, timeoutMs = 12_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${swiftPayBaseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const error = new Error(`SwiftPay request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return { data, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function swiftPayRequest(path, options = {}) {
  const authorization = Buffer.from(`${swiftPayAccessKey}:${swiftPaySecretKey}`).toString("base64");
  return swiftPayFetch(path, {
    ...options,
    headers: { Authorization: `Basic ${authorization}`, ...options.headers },
  });
}

async function swiftPayPaymentRequest(path, paymentToken) {
  return swiftPayFetch(path, { headers: { "X-Swiftpay-Payment-Token": paymentToken } });
}

async function swiftPaySignedRequest(path, payload) {
  const canonicalPayload = Object.entries(payload)
    .filter(([key, value]) => key.startsWith("x_") && value !== null && value !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}${value}`)
    .join("");
  const signature = createHmac("sha256", swiftPaySecretKey).update(canonicalPayload, "utf8").digest("hex");
  return swiftPayFetch(path, { method: "POST", body: { ...payload, signature } });
}

function validPaymentStatus(value) {
  return ["PENDING", "EXECUTED", "CANCELED", "REJECTED", "EXPIRED"].includes(value);
}

function paymentStatusFromResponse(data) {
  const status = typeof data === "string" ? data : data?.status || data?.paymentStatus;
  if (!validPaymentStatus(status)) throw new Error("SwiftPay returned an invalid payment status.");
  return status;
}

async function requireMerchant(req, res, next) {
  const match = /^Bearer (.+)$/.exec(req.get("authorization") || "");
  if (!match || !jwtSecret) return res.status(401).json({ error: "Sign in is required." });
  let payload;
  try {
    ({ payload } = await jwtVerify(match[1], jwtSecret, { algorithms: ["HS256"] }));
  } catch {
    return res.status(401).json({ error: "Your session has expired. Sign in again." });
  }
  if (typeof payload.sub !== "string" || payload.role !== "merchant") {
    return res.status(401).json({ error: "Your session has expired. Sign in again." });
  }
  const account = await pool.query(
    "SELECT active FROM merchant_accounts WHERE email = $1",
    [payload.sub],
  );
  if (!account.rows[0]?.active) return res.status(401).json({ error: "This merchant account is disabled." });
  req.merchantEmail = payload.sub;
  return next();
}

async function requireSuperAdmin(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  if (!match || !jwtSecret) return res.status(401).json({ error: "Super-admin sign-in is required." });
  try {
    const { payload } = await jwtVerify(match[1], jwtSecret, { algorithms: ["HS256"] });
    if (payload.sub !== superAdminEmail || payload.role !== "super_admin") throw new Error("Invalid admin session");
    req.adminEmail = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ error: "Your admin session has expired. Sign in again." });
  }
}

app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", paymentEnvironment: swiftPayEnvironment });
  } catch {
    return res.status(503).json({ status: "unavailable" });
  }
});

app.post("/v1/auth/login", loginLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password.length < 1 || password.length > 256) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  let role;
  if (email === superAdminEmail && superAdminPassword && passwordSalt && passwordMatchesWithSalt(password, superAdminPassword, passwordSalt)) {
    role = "super_admin";
  } else {
    const account = await pool.query(
      "SELECT email, password_salt, password_hash FROM merchant_accounts WHERE email = $1 AND active = TRUE",
      [email],
    );
    const user = account.rows[0];
    if (!user || !matchesPasswordHash(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    role = "merchant";
  }
  const expiresInSeconds = role === "super_admin" ? 60 * 60 : 8 * 60 * 60;
  const accessToken = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(role === "super_admin" ? "1h" : "8h")
    .sign(jwtSecret);
  return res.json({ accessToken, expiresInSeconds, email, role });
});

app.use("/v1/admin", requireSuperAdmin);

app.get("/v1/admin/settings", async (_req, res) => {
  const result = await pool.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1)",
    [["krw_to_php_rate", "usdt_address", "usdt_network"]],
  );
  const settings = Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));
  const rate = settings.krw_to_php_rate === undefined ? null : Number(settings.krw_to_php_rate);
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
    return res.status(503).json({ error: "The configured KRW/PHP exchange rate is invalid." });
  }
  return res.json({
    krwToPhpRate: rate,
    usdtAddress: settings.usdt_address || "",
    usdtNetwork: settings.usdt_network || "",
  });
});

app.put("/v1/admin/settings", async (req, res) => {
  const rawRate = req.body?.krwToPhpRate;
  const rate = rawRate === null || rawRate === "" ? null : Number(rawRate);
  const usdtAddress = typeof req.body?.usdtAddress === "string" ? req.body.usdtAddress.trim() : "";
  const usdtNetwork = typeof req.body?.usdtNetwork === "string" ? req.body.usdtNetwork.trim() : "";
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || rate > 1000)) {
    return res.status(400).json({ error: "KRW/PHP rate must be greater than zero and no more than 1000." });
  }
  if ((usdtAddress && !usdtNetwork) || (!usdtAddress && usdtNetwork)) {
    return res.status(400).json({ error: "Set both the USDT address and its network, or leave both empty." });
  }
  if (usdtAddress.length > 256 || usdtNetwork.length > 64) {
    return res.status(400).json({ error: "USDT address or network is too long." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const entries = [
      ["krw_to_php_rate", rate === null ? null : String(rate)],
      ["usdt_address", usdtAddress || null],
      ["usdt_network", usdtNetwork || null],
    ];
    for (const [key, value] of entries) {
      if (value === null) {
        await client.query("DELETE FROM system_settings WHERE setting_key = $1", [key]);
      } else {
        await client.query(
          `INSERT INTO system_settings (setting_key, setting_value)
           VALUES ($1, $2)
           ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
          [key, value],
        );
      }
    }
    await client.query("COMMIT");
    return res.json({
      krwToPhpRate: rate,
      usdtAddress,
      usdtNetwork,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.get("/v1/admin/merchants", async (_req, res) => {
  const result = await pool.query(
    `SELECT email, active, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM merchant_accounts ORDER BY created_at ASC`,
  );
  return res.json(result.rows);
});

app.post("/v1/admin/merchants", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid merchant email address." });
  }
  if (password.length < 16 || password.length > 256) {
    return res.status(400).json({ error: "Merchant passwords must be 16–256 characters." });
  }
  const credentials = passwordHash(password);
  try {
    const result = await pool.query(
      `INSERT INTO merchant_accounts (email, password_salt, password_hash)
       VALUES ($1, $2, $3)
       RETURNING email, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [email, credentials.passwordSalt, credentials.passwordHash],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "A merchant account with that email already exists." });
    throw error;
  }
});

app.patch("/v1/admin/merchants/:email", async (req, res) => {
  const email = typeof req.params.email === "string" ? req.params.email.trim().toLowerCase() : "";
  const hasActive = typeof req.body?.active === "boolean";
  const hasPassword = typeof req.body?.password === "string";
  if (!hasActive && !hasPassword) return res.status(400).json({ error: "Provide an active state or a replacement password." });
  if (hasPassword && (req.body.password.length < 16 || req.body.password.length > 256)) {
    return res.status(400).json({ error: "Merchant passwords must be 16–256 characters." });
  }
  const credentials = hasPassword ? passwordHash(req.body.password) : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(84172031)");
    const account = await client.query("SELECT email FROM merchant_accounts WHERE email = $1", [email]);
    if (!account.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Merchant account not found." });
    }
    if (req.body.active === false) {
      const remaining = await client.query(
        "SELECT COUNT(*)::int AS count FROM merchant_accounts WHERE active = TRUE AND email <> $1",
        [email],
      );
      if (remaining.rows[0].count === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "The last active merchant account cannot be disabled." });
      }
    }
    const result = await client.query(
      `UPDATE merchant_accounts SET
         active = CASE WHEN $2::boolean IS NULL THEN active ELSE $2 END,
         password_salt = COALESCE($3, password_salt),
         password_hash = COALESCE($4, password_hash),
         updated_at = NOW()
       WHERE email = $1
       RETURNING email, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [email, hasActive ? req.body.active : null, credentials?.passwordSalt || null, credentials?.passwordHash || null],
    );
    await client.query("COMMIT");
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.get("/v1/public/checkout/:code/qr.png", publicQrImageLimiter, async (req, res) => {
  const code = req.params.code;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(code)) return res.status(404).json({ error: "Checkout not found." });
  const record = await pool.query("SELECT payment_token FROM payment_links WHERE code = $1 AND checkout_type = 'DIRECT_QRPH'", [code]);
  const paymentToken = record.rows[0]?.payment_token;
  if (!paymentToken) return res.status(404).json({ error: "Checkout not found." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${swiftPayBaseUrl}/payments/qrph/image`, {
      signal: controller.signal,
      headers: { Accept: "image/png", "X-Swiftpay-Payment-Token": paymentToken },
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) {
      console.error("SwiftPay QR image request failed", response.status);
      return res.status(503).json({ error: "The payment QR is temporarily unavailable." });
    }
    const image = Buffer.from(await response.arrayBuffer());
    if (!image.length || image.length > 5 * 1024 * 1024) {
      console.error("SwiftPay returned an invalid QR image.");
      return res.status(503).json({ error: "The payment QR is temporarily unavailable." });
    }
    return res.set({
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=30",
      "X-Content-Type-Options": "nosniff",
    }).send(image);
  } catch (error) {
    console.error("SwiftPay QR image request failed", error.name === "AbortError" ? "timeout" : error.message);
    return res.status(503).json({ error: "The payment QR is temporarily unavailable." });
  } finally {
    clearTimeout(timeout);
  }
});

app.get("/v1/public/checkout/:code", publicCheckoutLimiter, async (req, res) => {
  const code = req.params.code;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(code)) return res.status(404).json({ error: "Checkout not found." });
  const record = await pool.query(
    `SELECT code, title, reference_no, amount::float8 AS amount, currency, status, payment_token
     FROM payment_links WHERE code = $1 AND checkout_type = 'DIRECT_QRPH'`,
    [code],
  );
  const row = record.rows[0];
  if (!row?.payment_token) return res.status(404).json({ error: "Checkout not found." });

  let status = row.status;
  let statusCheckUnavailable = false;
  if (!["EXECUTED", "CANCELED", "REJECTED", "EXPIRED"].includes(status)) {
    try {
      const { data } = await swiftPayPaymentRequest("/payments/status", row.payment_token);
      status = paymentStatusFromResponse(data);
      await pool.query("UPDATE payment_links SET status = $1, updated_at = NOW() WHERE code = $2", [status, code]);
    } catch (error) {
      statusCheckUnavailable = true;
      console.error("Checkout payment status lookup failed", error.status || "network error");
    }
  }

  return res.set("Cache-Control", "no-store").json({
    title: row.title,
    referenceNo: row.reference_no,
    amount: row.amount,
    currency: row.currency,
    status,
    statusCheckUnavailable,
    qrImageUrl: new URL(`/v1/public/checkout/${code}/qr.png`, frontendOrigin).toString(),
  });
});

app.use("/v1", requireMerchant);

app.get("/v1/exchange-rates/krw-php", async (_req, res) => {
  const result = await pool.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'krw_to_php_rate'",
  );
  const configuredRate = result.rows[0]?.setting_value;
  if (configuredRate !== undefined) {
    const rate = Number(configuredRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(503).json({ error: "The configured KRW/PHP exchange-rate override is invalid." });
    }
    return res.json({
      baseCurrency: "KRW",
      quoteCurrency: "PHP",
      rate,
      date: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
      source: "Super-admin configured rate",
    });
  }

  if (liveKrwPhpRateCache && Date.now() - liveKrwPhpRateCache.fetchedAt < 60 * 60 * 1000) {
    return res.json(liveKrwPhpRateCache.quote);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/KRW", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Exchange-rate service returned ${response.status}.`);
    const data = await response.json();
    const rate = Number(data?.rates?.PHP);
    const updatedAt = typeof data?.time_last_update_utc === "string"
      ? new Date(data.time_last_update_utc)
      : null;
    if (data?.result !== "success" || data?.base_code !== "KRW" || !Number.isFinite(rate) || rate <= 0 || !updatedAt || Number.isNaN(updatedAt.getTime())) {
      throw new Error("Exchange-rate service returned invalid KRW/PHP data.");
    }
    const quote = {
      baseCurrency: "KRW",
      quoteCurrency: "PHP",
      rate,
      date: updatedAt.toISOString().slice(0, 10),
      updatedAt: updatedAt.toISOString(),
      source: "ExchangeRate-API reference rate",
    };
    liveKrwPhpRateCache = { quote, fetchedAt: Date.now() };
    return res.json(quote);
  } catch (error) {
    console.error("KRW/PHP live exchange-rate lookup failed", error.name === "AbortError" ? "timeout" : error.message);
    return res.status(503).json({ error: "The live KRW/PHP reference rate is temporarily unavailable." });
  } finally {
    clearTimeout(timeout);
  }
});

app.get("/v1/wallet/balance", async (_req, res) => {
  try {
    const { data } = await swiftPayRequest("/disbursements/account");
    return res.json({ balance: Number(data.balance), accountNumber: data.number, walletMode: "pooled", paymentEnvironment: swiftPayEnvironment });
  } catch (error) {
    console.error("Wallet balance lookup failed", error.status || "network error");
    return res.status(error.status === 401 ? 502 : 503).json({ error: "Merchant wallet is temporarily unavailable." });
  }
});

app.get("/v1/disbursement-institutions", async (req, res) => {
  const channel = req.query.channel;
  if (channel && !["INSTAPAY", "PESONET"].includes(channel)) return res.status(400).json({ error: "Unsupported transfer rail." });
  const cacheKey = channel || "all";
  const cached = institutionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.items);
  try {
    const query = channel ? `?channel=${encodeURIComponent(channel)}` : "";
    const { data } = await swiftPayRequest(`/disbursements/institutions${query}`);
    institutionCache.set(cacheKey, { items: data, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return res.json(data);
  } catch (error) {
    console.error("Institution lookup failed", error.status || "network error");
    return res.status(503).json({ error: "Transfer institutions are temporarily unavailable." });
  }
});

async function reconcilePending() {
  const [links, transfers] = await Promise.all([
    pool.query("SELECT id, code, payment_token FROM payment_links WHERE status IN ('CREATING', 'ACTIVE', 'PENDING') AND code IS NOT NULL ORDER BY created_at DESC LIMIT 10"),
    pool.query("SELECT id, swiftpay_id, merchant_reference_no FROM disbursements WHERE status IN ('REQUESTING', 'PENDING', 'OUTCOME_UNKNOWN') ORDER BY created_at DESC LIMIT 10"),
  ]);
  await Promise.allSettled([
    ...links.rows.map(async (row) => {
      let status;
      if (row.payment_token) {
        const { data } = await swiftPayPaymentRequest("/payments/status", row.payment_token);
        status = paymentStatusFromResponse(data);
      } else {
        const { data } = await swiftPayRequest(`/payments/links/${encodeURIComponent(row.code)}`);
        status = data.linkStatus || "ACTIVE";
      }
      await pool.query("UPDATE payment_links SET status = $1, updated_at = NOW() WHERE id = $2", [status, row.id]);
    }),
    ...transfers.rows.map(async (row) => {
      let data;
      if (row.swiftpay_id) {
        ({ data } = await swiftPayRequest(`/disbursements/${encodeURIComponent(row.swiftpay_id)}`));
      } else {
        const query = new URLSearchParams({ merchantReferenceNo: row.merchant_reference_no, pageSize: "1" });
        const result = await swiftPayRequest(`/disbursements?${query}`);
        data = result.data?.result?.find((item) => item.merchantReferenceNo === row.merchant_reference_no);
        if (!data) return;
      }
      await pool.query("UPDATE disbursements SET swiftpay_id = $1, status = $2, error_message = $3, updated_at = NOW() WHERE id = $4", [data.id, data.status, data.errorMessage || null, row.id]);
    }),
  ]);
}

app.get("/v1/wallet/activity", async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  try {
    await reconcilePending();
    const { rows } = await pool.query(`
      SELECT id::text, reference_no AS "referenceNo", title AS description,
        CASE WHEN payment_token IS NULL THEN 'Payment link' ELSE 'QR Ph checkout' END AS channel,
        status, amount::float8 AS amount,
        created_at AS "createdAt", 'PAYMENT_LINK' AS "transactionType"
      FROM payment_links
      UNION ALL
      SELECT id::text, merchant_reference_no AS "referenceNo", institution_code AS description,
        channel, status, -amount::float8 AS amount,
        created_at AS "createdAt", 'DISBURSEMENT' AS "transactionType"
      FROM disbursements
      ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return res.json(rows);
  } catch (error) {
    console.error("Wallet activity lookup failed", error.status || "database error");
    return res.status(503).json({ error: "Wallet activity is temporarily unavailable." });
  }
});

function validIdempotencyKey(value) {
  return typeof value === "string" && value.length >= 16 && value.length <= 100 && /^[a-zA-Z0-9._:-]+$/.test(value);
}

app.post("/v1/payment-links", paymentLinkLimiter, async (req, res) => {
  const submittedAmount = Number(req.body?.amount);
  const amount = Number.isFinite(submittedAmount) ? Math.round(submittedAmount * 100) / 100 : Number.NaN;
  const title = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 100) : "";
  const idempotencyKey = req.get("Idempotency-Key");
  if (!validIdempotencyKey(idempotencyKey)) return res.status(400).json({ error: "A valid Idempotency-Key header is required." });
  if (!Number.isFinite(amount) || Math.abs(submittedAmount - amount) > 1e-7 || amount <= 0 || amount > 1_000_000 || !title) return res.status(400).json({ error: "Enter a description and a valid PHP amount with no more than two decimal places." });

  const existing = await pool.query("SELECT * FROM payment_links WHERE idempotency_key = $1", [idempotencyKey]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.payment_url) return res.json({ id: row.id, code: row.code, paymentUrl: row.payment_url, status: row.status, amount: Number(row.amount), currency: row.currency });
    return res.status(409).json({ error: "The checkout outcome is unknown. Check wallet activity before retrying." });
  }

  const id = randomUUID();
  const referenceNo = `DRP-${randomUUID()}`;
  const code = randomBytes(32).toString("base64url");
  try {
    await pool.query(`INSERT INTO payment_links (id, idempotency_key, reference_no, code, title, amount, checkout_type, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'DIRECT_QRPH', 'CREATING')`, [id, idempotencyKey, referenceNo, code, title, amount]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "The checkout outcome is unknown. Check wallet activity before retrying." });
    throw error;
  }

  try {
    const { data } = await swiftPaySignedRequest("/bootstrap/qrph?type=P2M", {
      x_access_key: swiftPayAccessKey,
      x_amount: amount.toFixed(2),
      x_currency: "PHP",
      x_reference_no: referenceNo,
      reject_qrph_duplicated_payments: true,
    });
    if (typeof data?.paymentId !== "string" || !data.paymentId || typeof data.qrCode !== "string" || !data.qrCode) {
      throw new Error("SwiftPay returned an incomplete QR payment.");
    }
    const status = data.paymentStatus || "PENDING";
    if (!validPaymentStatus(status)) throw new Error("SwiftPay returned an invalid initial payment status.");
    const checkoutUrl = new URL(`/checkout/${code}`, frontendOrigin).toString();
    const actualAmount = Number(data.amount ?? amount);
    if (!Number.isFinite(actualAmount) || actualAmount <= 0) throw new Error("SwiftPay returned an invalid payment amount.");
    await pool.query(
      "UPDATE payment_links SET payment_token = $1, payment_url = $2, status = $3, amount = $4, updated_at = NOW() WHERE id = $5",
      [data.paymentId, checkoutUrl, status, actualAmount, id],
    );
    return res.status(201).json({ id, code, paymentUrl: checkoutUrl, status, amount: actualAmount, currency: "PHP" });
  } catch (error) {
    const isAmbiguous = !error.status || error.status >= 500;
    await pool.query("UPDATE payment_links SET status = $1, updated_at = NOW() WHERE id = $2", [isAmbiguous ? "OUTCOME_UNKNOWN" : "FAILED", id]);
    console.error("SwiftPay QR checkout creation failed", error.status || "network error");
    return res.status(isAmbiguous ? 503 : 502).json({ error: isAmbiguous ? "The checkout outcome is unknown. Check wallet activity before retrying." : "SwiftPay could not create the QR checkout." });
  }
});

app.get("/v1/payment-links/:code", async (req, res) => {
  const record = await pool.query("SELECT * FROM payment_links WHERE code = $1", [req.params.code]);
  if (!record.rowCount) return res.status(404).json({ error: "Payment link not found." });
  try {
    if (record.rows[0].payment_token) {
      const { data } = await swiftPayPaymentRequest("/payments/status", record.rows[0].payment_token);
      const status = paymentStatusFromResponse(data);
      await pool.query("UPDATE payment_links SET status = $1, updated_at = NOW() WHERE id = $2", [status, record.rows[0].id]);
      return res.json({
        code: record.rows[0].code,
        paymentUrl: record.rows[0].payment_url,
        status,
        amount: Number(record.rows[0].amount),
        currency: record.rows[0].currency,
        referenceNo: record.rows[0].reference_no,
      });
    }
    const { data } = await swiftPayRequest(`/payments/links/${encodeURIComponent(req.params.code)}`);
    const status = data.linkStatus || record.rows[0].status;
    await pool.query("UPDATE payment_links SET status = $1, updated_at = NOW() WHERE id = $2", [status, record.rows[0].id]);
    return res.json({ code: data.code, paymentUrl: data.paymentUrl, status, amount: Number(data.amount), currency: data.currency, referenceNo: data.referenceNo });
  } catch (error) {
    console.error("Payment-link status lookup failed", error.status || "network error");
    return res.status(503).json({ error: "Payment status is temporarily unavailable." });
  }
});

app.post("/v1/disbursements", transferLimiter, async (req, res) => {
  const submittedAmount = Number(req.body?.amount);
  const amount = Number.isFinite(submittedAmount) ? Math.round(submittedAmount * 100) / 100 : Number.NaN;
  const channel = req.body?.channel;
  const institutionCode = typeof req.body?.institutionCode === "string" ? req.body.institutionCode.trim() : "";
  const accountNumber = typeof req.body?.accountNumber === "string" ? req.body.accountNumber.replace(/\s/g, "") : "";
  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  const remarks = typeof req.body?.remarks === "string" ? req.body.remarks.trim().slice(0, 200) : "";
  const idempotencyKey = req.get("Idempotency-Key");
  if (!validIdempotencyKey(idempotencyKey)) return res.status(400).json({ error: "A valid Idempotency-Key header is required." });
  if (!Number.isFinite(amount) || Math.abs(submittedAmount - amount) > 1e-7 || amount <= 0 || amount > maxTransferAmount) return res.status(400).json({ error: `Transfer amount must be greater than zero, no more than PHP ${maxTransferAmount.toLocaleString("en-PH")}, and have no more than two decimal places.` });
  if (!["INSTAPAY", "PESONET"].includes(channel) || !institutionCode || institutionCode.length > 16) return res.status(400).json({ error: "Choose a valid bank and transfer rail." });
  if (!/^[0-9]{5,64}$/.test(accountNumber) || !fullName || fullName.length > 128) return res.status(400).json({ error: "Check the recipient name and account number." });

  const existing = await pool.query("SELECT * FROM disbursements WHERE idempotency_key = $1", [idempotencyKey]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    const outcomeUnknown = ["REQUESTING", "OUTCOME_UNKNOWN"].includes(row.status);
    return res.json({ id: row.swiftpay_id, referenceNo: row.merchant_reference_no, status: outcomeUnknown ? "OUTCOME_UNKNOWN" : row.status, outcomeUnknown, message: row.error_message });
  }

  const institutions = institutionCache.get(channel);
  let selectedInstitution = institutions?.expiresAt > Date.now() ? institutions.items.find((item) => item.code === institutionCode) : null;
  if (!selectedInstitution) {
    try {
      const { data } = await swiftPayRequest(`/disbursements/institutions?channel=${channel}`);
      institutionCache.set(channel, { items: data, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
      selectedInstitution = data.find((item) => item.code === institutionCode);
    } catch {
      return res.status(503).json({ error: "Could not verify the selected institution. Try again later." });
    }
  }
  if (!selectedInstitution) return res.status(400).json({ error: "That institution is not enabled for the selected transfer rail." });

  const requestFingerprint = createHmac("sha256", jwtSecretValue)
    .update(JSON.stringify([amount.toFixed(2), channel, institutionCode, accountNumber, fullName.toLowerCase()]))
    .digest("hex");
  const activeRequest = await pool.query(`SELECT merchant_reference_no, status FROM disbursements
    WHERE request_fingerprint = $1 AND status IN ('REQUESTING', 'PENDING', 'OUTCOME_UNKNOWN') LIMIT 1`, [requestFingerprint]);
  if (activeRequest.rowCount) return res.status(409).json({ error: `A matching transfer is already ${activeRequest.rows[0].status.toLowerCase()}. Check wallet activity before creating another.` });

  const id = randomUUID();
  const merchantReferenceNo = `DRP-${randomUUID()}`;
  try {
    await pool.query(`INSERT INTO disbursements (id, idempotency_key, merchant_reference_no, amount, channel, institution_code, request_fingerprint, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'REQUESTING')`, [id, idempotencyKey, merchantReferenceNo, amount, channel, institutionCode, requestFingerprint]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "A matching transfer is already being processed. Check wallet activity before retrying." });
    throw error;
  }

  try {
    const { data } = await swiftPayRequest("/disbursements/send", {
      method: "POST",
      body: {
        merchantReferenceNo,
        channel,
        type: "P2P",
        institutionCode,
        creditInformation: { amount, ...(remarks ? { remarks } : {}) },
        recipientInformation: { accountNumber, fullName },
      },
    });
    if (!data?.id) throw new Error("SwiftPay returned no disbursement id.");
    const status = typeof data.status === "string" ? data.status.toUpperCase() : "PENDING";
    const failed = ["REJECTED", "ERROR", "FAILED", "CANCELED", "CANCELLED"].includes(status);
    const settled = ["EXECUTED", "SUCCESS", "COMPLETED"].includes(status);
    const message = failed
      ? data.errorMessage || "SwiftPay rejected the transfer."
      : settled
        ? "SwiftPay confirmed the transfer as settled."
        : "Provider accepted the transfer; settlement is not yet confirmed.";
    await pool.query("UPDATE disbursements SET swiftpay_id = $1, status = $2, error_message = $3, updated_at = NOW() WHERE id = $4", [data.id, status, failed ? message : null, id]);
    return res.status(202).json({ id: data.id, referenceNo: merchantReferenceNo, status, message });
  } catch (error) {
    const isAmbiguous = !error.status || error.status >= 500;
    const status = isAmbiguous ? "OUTCOME_UNKNOWN" : "REJECTED";
    const message = isAmbiguous ? "Transfer outcome is unknown. Do not retry until it is reconciled." : "SwiftPay rejected the transfer request.";
    await pool.query("UPDATE disbursements SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3", [status, message, id]);
    console.error("SwiftPay disbursement request failed", error.status || "network error");
    return res.status(isAmbiguous ? 503 : 502).json({ referenceNo: merchantReferenceNo, status, outcomeUnknown: isAmbiguous, message });
  }
});

app.use(express.static(clientBuildDirectory));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path === "/v1" || req.path.startsWith("/v1/") || req.path === "/healthz") return next();
  return res.sendFile(join(clientBuildDirectory, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error("API request failed", error.status || error.code || "unexpected error");
  if (res.headersSent) return;
  return res.status(500).json({ error: "The request could not be completed." });
});

async function start() {
  const missing = requiredEnvironment();
  if (missing.length) throw new Error(`Missing or invalid server configuration: ${missing.join(", ")}`);
  await initializeDatabase();
  const port = Number(process.env.PORT || 10000);
  app.listen(port, "0.0.0.0", () => console.log(`DRPAY API listening on ${port} (${swiftPayEnvironment})`));
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
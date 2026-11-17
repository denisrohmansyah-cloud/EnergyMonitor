require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const { rateLimit } = require("express-rate-limit");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const API_PREFIX = "/api";
const COOKIE_NAME = "em_session";
const SESSION_TTL_SECONDS = Math.max(300, Number(process.env.SESSION_TTL_SECONDS || 7200));
const DEVICE_OFFLINE_AFTER_SECONDS = Math.max(60, Number(process.env.DEVICE_OFFLINE_AFTER_SECONDS || 180));

const SESSION_SECRET = String(process.env.SESSION_SECRET || "");
const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || "");
const APPS_SCRIPT_URL = String(process.env.APPS_SCRIPT_URL || "");
const APPS_SCRIPT_API_KEY = String(process.env.APPS_SCRIPT_API_KEY || "");

const allowedOrigins = String(process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    try { return new URL(value).origin; }
    catch { throw new Error("FRONTEND_ORIGINS berisi origin yang tidak valid: " + value); }
  });

const cookieSameSite = String(process.env.COOKIE_SAME_SITE || (IS_PRODUCTION ? "none" : "lax")).toLowerCase();
const cookieSecure = process.env.COOKIE_SECURE
  ? String(process.env.COOKIE_SECURE).toLowerCase() === "true"
  : IS_PRODUCTION;

function validateConfig() {
  const missing = [];
  if (SESSION_SECRET.length < 32) missing.push("SESSION_SECRET (minimum 32 karakter)");
  if (ADMIN_API_KEY.length < 32) missing.push("ADMIN_API_KEY (minimum 32 karakter)");
  if (!APPS_SCRIPT_URL) missing.push("APPS_SCRIPT_URL");
  if (!/^https:\/\//i.test(APPS_SCRIPT_URL)) missing.push("APPS_SCRIPT_URL harus menggunakan HTTPS");
  if (APPS_SCRIPT_API_KEY.length < 32) missing.push("APPS_SCRIPT_API_KEY (minimum 32 karakter)");
  if (allowedOrigins.length === 0) missing.push("FRONTEND_ORIGINS");
  if (!["lax", "strict", "none"].includes(cookieSameSite)) missing.push("COOKIE_SAME_SITE harus lax, strict, atau none");
  if (cookieSameSite === "none" && !cookieSecure) missing.push("COOKIE_SECURE=true diperlukan untuk SameSite=None");
  if (missing.length) {
    throw new Error("Konfigurasi backend belum lengkap: " + missing.join(", "));
  }
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function makeCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000
  };
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

function verifySession(token) {
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, suppliedSignature] = parts;
  const expectedSignature = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  if (!timingSafeEqualString(suppliedSignature, expectedSignature)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || !payload.customerId || !payload.username || !payload.exp) return null;
  if (Date.now() >= Number(payload.exp)) return null;
  return payload;
}

function createSession(customerId, username) {
  const now = Date.now();
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const payload = {
    customerId,
    username,
    csrfToken,
    iat: now,
    exp: now + SESSION_TTL_SECONDS * 1000
  };
  return { token: signSession(payload), payload };
}

function requireSession(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const session = verifySession(token);
  if (!session) {
    return res.status(401).json({ ok: false, message: "Sesi tidak ditemukan atau telah berakhir. Silakan login kembali." });
  }
  req.auth = session;
  next();
}

function requireCsrf(req, res, next) {
  const provided = req.get("x-csrf-token");
  if (!provided || !timingSafeEqualString(provided, req.auth.csrfToken)) {
    return res.status(403).json({ ok: false, message: "Token CSRF tidak valid." });
  }
  next();
}

function requireAdmin(req, res, next) {
  const provided = req.get("x-admin-api-key");
  if (!provided || !timingSafeEqualString(provided, ADMIN_API_KEY)) {
    return res.status(401).json({ ok: false, message: "Admin API key tidak valid." });
  }
  next();
}

function requireAllowedBrowserOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) {
    return res.status(403).json({ ok: false, message: "Origin browser tidak diizinkan." });
  }
  next();
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    const error = new Error("Username harus 3-32 karakter dan hanya menggunakan huruf, angka, titik, garis bawah, atau tanda hubung.");
    error.status = 400;
    throw error;
  }
  return username;
}

function requiredText(value, label, maxLength = 160) {
  const result = String(value == null ? "" : value).trim();
  if (!result) {
    const error = new Error(label + " wajib diisi.");
    error.status = 400;
    throw error;
  }
  if (result.length > maxLength) {
    const error = new Error(label + " terlalu panjang.");
    error.status = 400;
    throw error;
  }
  return result;
}

async function sheetsRequest(action, data = {}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8", "Accept": "application/json" },
    body: JSON.stringify({ action, apiKey: APPS_SCRIPT_API_KEY, ...data }),
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Respons Google Apps Script tidak berupa JSON. Pastikan URL Web App /exec benar dan akses deployment diatur untuk backend.");
  }

  if (!response.ok || payload.ok !== true) {
    const message = payload && payload.error ? payload.error : "Permintaan ke Google Sheets gagal.";
    const error = new Error(message);
    error.status = response.status >= 400 ? response.status : 502;
    throw error;
  }

  return payload.data;
}

function mapMeasurement(row) {
  if (!row) return null;
  return {
    measurementId: row.measurement_id || row.measurementId || "",
    deviceId: row.device_id || row.deviceId || "",
    time: row.measured_at || row.measuredAt || null,
    voltage: Number(row.voltage_v ?? row.voltage ?? 0),
    current: Number(row.current_a ?? row.current ?? 0),
    power: Number(row.active_power_w ?? row.activePower ?? row.power ?? 0),
    energy: Number(row.energy_kwh ?? row.energy ?? 0),
    frequency: Number(row.frequency_hz ?? row.frequency ?? 0),
    pf: Number(row.power_factor ?? row.powerFactor ?? row.pf ?? 0),
    apparentPower: row.apparent_power_va ?? row.apparentPower ?? null,
    reactivePower: row.reactive_power_var ?? row.reactivePower ?? null,
    temperature: row.temperature_c ?? row.temperature ?? null,
    humidity: row.humidity_pct ?? row.humidity ?? null,
    rssi: row.rssi_dbm ?? row.rssi ?? null
  };
}

function mapDashboard(raw, csrfToken) {
  if (!raw || !raw.customer) {
    const error = new Error("Profil pelanggan tidak ditemukan.");
    error.status = 404;
    throw error;
  }

  const customer = raw.customer;
  const rawDevice = raw.device;
  const latest = mapMeasurement(raw.latestMeasurement);
  let device = null;

  if (rawDevice) {
    const lastSeen = rawDevice.last_seen ? new Date(rawDevice.last_seen) : null;
    let status = String(rawDevice.status || "OFFLINE").toLowerCase();

    if (!lastSeen || Number.isNaN(lastSeen.getTime()) ||
        Date.now() - lastSeen.getTime() > DEVICE_OFFLINE_AFTER_SECONDS * 1000) {
      status = "offline";
    } else {
      status = "online";
    }

    device = {
      device_id: rawDevice.device_id,
      device_name: rawDevice.device_name,
      device_type: rawDevice.device_type,
      location: rawDevice.location,
      status,
      last_seen: lastSeen ? lastSeen.toISOString() : null,
      voltage: latest ? latest.voltage : 0,
      current: latest ? latest.current : 0,
      power: latest ? latest.power : 0,
      energy_total: latest ? latest.energy : 0,
      frequency: latest ? latest.frequency : 0,
      power_factor: latest ? latest.pf : 0,
      temperature: latest ? latest.temperature : null,
      humidity: latest ? latest.humidity : null,
      rssi: latest ? latest.rssi : null
    };
  }

  return {
    customer: {
      customer_id: customer.customer_id,
      username: customer.username,
      full_name: customer.full_name,
      email: customer.email || "",
      status: customer.status,
      location: customer.location || "",
      tariff_per_kwh: Number(customer.tariff_per_kwh || 0)
    },
    device,
    latestMeasurement: latest,
    energyTodayKwh: Number(raw.energyTodayKwh || 0),
    csrfToken
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const allowedOriginsSet = new Set(allowedOrigins);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOriginsSet.has(origin)) return callback(null, true);
    return callback(new Error("CORS: origin tidak diizinkan."));
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "X-CSRF-Token", "X-Admin-API-Key"],
  maxAge: 600
};

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { ok: false, message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

app.use(API_PREFIX, generalLimiter);

app.get(API_PREFIX + "/health", (req, res) => {
  res.json({ ok: true, service: "Energy Monitor API", version: "1.0.0" });
});

/* Customer authentication */
app.post(API_PREFIX + "/auth/login", loginLimiter, requireAllowedBrowserOrigin, asyncRoute(async (req, res) => {
  const username = normalizeUsername(req.body && req.body.username);
  const password = String((req.body && req.body.password) || "");

  if (!password || password.length > 200) {
    return res.status(400).json({ ok: false, message: "Password wajib diisi." });
  }

  const record = await sheetsRequest("getCustomerAuthByUsername", { username });
  if (!record || String(record.status || "").toUpperCase() !== "ACTIVE" ||
      !record.passwordHash || !await bcrypt.compare(password, record.passwordHash)) {
    return res.status(401).json({ ok: false, message: "Username atau password tidak valid." });
  }

  const { token, payload } = createSession(record.customerId, record.username);
  res.cookie(COOKIE_NAME, token, makeCookieOptions());

  res.json({
    ok: true,
    message: "Login berhasil.",
    csrfToken: payload.csrfToken
  });
}));

app.get(API_PREFIX + "/auth/me", requireSession, asyncRoute(async (req, res) => {
  const raw = await sheetsRequest("getCustomerDashboard", { customerId: req.auth.customerId });
  const user = mapDashboard(raw, req.auth.csrfToken);
  res.json({ ok: true, user });
}));

app.post(API_PREFIX + "/auth/logout", requireSession, requireCsrf, requireAllowedBrowserOrigin, (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: "/"
  });
  res.json({ ok: true, message: "Logout berhasil." });
});

/* Authenticated customer data. Customer ID is always taken from the signed session. */
app.get(API_PREFIX + "/dashboard", requireSession, asyncRoute(async (req, res) => {
  const raw = await sheetsRequest("getCustomerDashboard", { customerId: req.auth.customerId });
  const data = mapDashboard(raw, undefined);
  res.json({ ok: true, data });
}));

app.get(API_PREFIX + "/history", requireSession, asyncRoute(async (req, res) => {
  const limit = Math.min(12000, Math.max(1, Number.parseInt(req.query.limit || "100", 10) || 100));
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  const raw = await sheetsRequest("getMeasurementHistory", {
    customerId: req.auth.customerId,
    limit,
    from,
    to
  });

  res.json({
    ok: true,
    data: {
      deviceId: raw.deviceId || null,
      count: raw.count || 0,
      records: Array.isArray(raw.records) ? raw.records.map(mapMeasurement) : []
    }
  });
}));

/* Admin-only provisioning endpoints. Admin key is never sent to customer pages. */
app.post(API_PREFIX + "/admin/customers", requireAdmin, asyncRoute(async (req, res) => {
  const username = normalizeUsername(req.body && req.body.username);
  const password = String((req.body && req.body.password) || "");
  if (password.length < 10 || password.length > 200) {
    return res.status(400).json({ ok: false, message: "Password pelanggan harus 10-200 karakter." });
  }

  const fullName = requiredText(req.body && req.body.fullName, "Nama lengkap", 120);
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: "Format email tidak valid." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const data = await sheetsRequest("createCustomer", {
    username,
    fullName,
    email,
    passwordHash,
    location: String(req.body.location || "").slice(0, 160),
    tariffPerKwh: Number(req.body.tariffPerKwh || 0)
  });

  res.status(201).json({ ok: true, data });
}));

app.post(API_PREFIX + "/admin/customers/:customerId/device", requireAdmin, asyncRoute(async (req, res) => {
  const customerId = requiredText(req.params.customerId, "customerId", 80);
  const data = await sheetsRequest("createDevice", {
    customerId,
    deviceName: String(req.body.deviceName || "Energy Monitor").slice(0, 120),
    deviceType: String(req.body.deviceType || "ESP32 + Sensor Energi").slice(0, 120),
    location: String(req.body.location || "").slice(0, 160)
  });
  res.status(201).json({ ok: true, data });
}));

app.get(API_PREFIX + "/admin/customers", requireAdmin, asyncRoute(async (req, res) => {
  const data = await sheetsRequest("listCustomers");
  res.json({ ok: true, data });
}));

app.get(API_PREFIX + "/admin/devices", requireAdmin, asyncRoute(async (req, res) => {
  const data = await sheetsRequest("listDevices");
  res.json({ ok: true, data });
}));

app.post(API_PREFIX + "/admin/customers/:customerId/tariff", requireAdmin, asyncRoute(async (req, res) => {
  const customerId = requiredText(req.params.customerId, "customerId", 80);
  const tariffPerKwh = Number(req.body.tariffPerKwh);
  if (!Number.isFinite(tariffPerKwh) || tariffPerKwh < 0) {
    return res.status(400).json({ ok: false, message: "Tarif listrik tidak valid." });
  }
  const data = await sheetsRequest("updateCustomerTariff", { customerId, tariffPerKwh });
  res.json({ ok: true, data });
}));

/* ESP32 ingestion. The raw device token is verified by Apps Script against its stored hash. */
app.post(API_PREFIX + "/device/measurements", asyncRoute(async (req, res) => {
  const body = req.body || {};
  const required = ["deviceId", "deviceToken", "voltage", "current", "activePower", "energy", "frequency", "powerFactor"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({ ok: false, message: "Field " + field + " wajib diisi." });
    }
  }

  const data = await sheetsRequest("ingestMeasurement", {
    deviceId: requiredText(body.deviceId, "deviceId", 80),
    deviceToken: requiredText(body.deviceToken, "deviceToken", 200),
    measuredAt: body.measuredAt,
    voltage: body.voltage,
    current: body.current,
    activePower: body.activePower,
    energy: body.energy,
    frequency: body.frequency,
    powerFactor: body.powerFactor,
    apparentPower: body.apparentPower,
    reactivePower: body.reactivePower,
    temperature: body.temperature,
    humidity: body.humidity,
    rssi: body.rssi
  });

  res.status(201).json({ ok: true, data });
}));

app.use((req, res) => {
  res.status(404).json({ ok: false, message: "Endpoint tidak ditemukan." });
});

app.use((error, req, res, next) => {
  console.error(error && error.stack ? error.stack : error);
  const status = Number(error.status) || (String(error.message || "").startsWith("CORS:") ? 403 : 500);
  const message = status >= 500
    ? "Terjadi kesalahan pada server. Periksa log backend."
    : error.message;
  res.status(status).json({ ok: false, message });
});

if (require.main === module) {
  try {
    validateConfig();
    app.listen(PORT, () => {
      console.log("Energy Monitor API running on port " + PORT);
      console.log("Allowed frontend origins: " + allowedOrigins.join(", "));
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { app, validateConfig, mapDashboard, mapMeasurement, sheetsRequest };

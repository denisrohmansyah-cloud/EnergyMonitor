/**
 * ENERGY MONITOR - GOOGLE SHEETS DATA LAYER
 * Spreadsheet ID berasal dari spreadsheet yang diberikan pemilik proyek.
 *
 * Tab yang dibuat:
 * 1. Customers
 * 2. Devices
 * 3. Measurements
 * 4. Settings
 *
 * Penting:
 * - Jalankan setupEnergyMonitorDatabase() satu kali dari Apps Script Editor.
 * - Jalankan configureBackendApiKey() untuk menyimpan shared secret backend.
 * - Password pelanggan harus di-hash di backend (Argon2id/bcrypt), bukan di sini.
 * - Endpoint admin/backend membutuhkan apiKey.
 * - Endpoint ingestMeasurement memakai token unik milik perangkat.
 */

const EM_CONFIG = Object.freeze({
  SPREADSHEET_ID: "1syMXmoiHI3Z5qEqowWQeNwCziRbpHM8cDssWxY7maUQ",
  SHEETS: {
    CUSTOMERS: "Customers",
    DEVICES: "Devices",
    MEASUREMENTS: "Measurements",
    SETTINGS: "Settings"
  },
  HEADERS: {
    Customers: [
      "customer_id",
      "username",
      "full_name",
      "email",
      "password_hash",
      "status",
      "location",
      "tariff_per_kwh",
      "created_at",
      "updated_at"
    ],
    Devices: [
      "device_id",
      "customer_id",
      "device_name",
      "device_type",
      "location",
      "device_token_hash",
      "status",
      "last_seen",
      "created_at",
      "updated_at"
    ],
    Measurements: [
      "measurement_id",
      "device_id",
      "measured_at",
      "voltage_v",
      "current_a",
      "active_power_w",
      "energy_kwh",
      "frequency_hz",
      "power_factor",
      "apparent_power_va",
      "reactive_power_var",
      "temperature_c",
      "humidity_pct",
      "rssi_dbm",
      "created_at"
    ],
    Settings: [
      "setting_key",
      "setting_value",
      "description",
      "updated_at"
    ]
  },
  DEFAULT_SETTINGS: [
    ["currency", "IDR", "Mata uang sistem"],
    ["timezone", "Asia/Jakarta", "Zona waktu sistem"],
    ["measurement_interval_seconds", "60", "Interval pengiriman/pembaruan data dalam detik"],
    ["max_devices_per_customer", "1", "Maksimal perangkat aktif untuk setiap pelanggan"],
    ["device_offline_after_seconds", "180", "Perangkat dianggap offline jika tidak mengirim data selama batas waktu ini"],
    ["default_tariff_per_kwh", "0", "Tarif default. Atur tarif sebenarnya per pelanggan."]
  ],
  MAX_HISTORY_LIMIT: 12000
});


/* -------------------------------------------------------------------------- */
/* MENU & DATABASE INITIALIZATION                                             */
/* -------------------------------------------------------------------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Energy Monitor")
    .addItem("Siapkan Database", "setupEnergyMonitorDatabase")
    .addItem("Tes Koneksi Database", "testDatabaseConnection")
    .addSeparator()
    .addItem("Tambah Pelanggan", "createCustomerFromEditor")
    .addItem("Aktifkan Akun & Reset Password", "repairCustomerAccountFromEditor")
    .addItem("Hubungkan Perangkat", "assignDeviceToCustomerFromEditor")
    .addToUi();
}

/**
 * Membuat tab dan header database tanpa menghapus data yang sudah ada.
 * Aman dijalankan ulang.
 */
function setupEnergyMonitorDatabase() {
  const ss = SpreadsheetApp.openById(EM_CONFIG.SPREADSHEET_ID);

  Object.keys(EM_CONFIG.HEADERS).forEach(function(sheetName) {
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      // Gunakan Sheet1 yang masih kosong sebagai Customers jika memungkinkan.
      const defaultSheet = ss.getSheetByName("Sheet1");
      if (
        sheetName === EM_CONFIG.SHEETS.CUSTOMERS &&
        defaultSheet &&
        defaultSheet.getLastRow() === 0
      ) {
        defaultSheet.setName(sheetName);
        sheet = defaultSheet;
      } else {
        sheet = ss.insertSheet(sheetName);
      }
    }

    const headers = EM_CONFIG.HEADERS[sheetName];
    const lastRow = sheet.getLastRow();

    if (lastRow === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      let existing = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getDisplayValues()[0]
        .map(function(value) { return String(value || "").trim(); });

      // Safe migration from the previous Customers schema (without username).
      if (
        sheetName === EM_CONFIG.SHEETS.CUSTOMERS &&
        existing[0] === "customer_id" &&
        existing.indexOf("username") === -1
      ) {
        const oldHeaders = [
          "customer_id", "full_name", "email", "password_hash", "status",
          "location", "tariff_per_kwh", "created_at", "updated_at"
        ];
        const isLegacySchema = oldHeaders.every(function(header, index) {
          return existing[index] === header;
        });

        if (isLegacySchema) {
          sheet.insertColumnAfter(1);
          sheet.getRange(1, 2).setValue("username");
          existing = sheet.getRange(1, 1, 1, sheet.getLastColumn())
            .getDisplayValues()[0]
            .map(function(value) { return String(value || "").trim(); });
        }
      }

      const matches = headers.every(function(header, index) {
        return String(existing[index] || "").trim() === header;
      });

      if (!matches) {
        throw new Error(
          "Header tab " + sheetName +
          " tidak sesuai. Tidak ada data yang ditimpa. Periksa baris pertama tab tersebut."
        );
      }
    }

    formatHeader_(sheet, headers.length);
  });

  initializeDefaultSettings_();
  SpreadsheetApp.flush();

  const message = "Database Energy Monitor berhasil disiapkan.";
  Logger.log(message);
  return { ok: true, message: message, spreadsheetUrl: ss.getUrl() };
}

function formatHeader_(sheet, columnCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground("#14283b")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setWrap(true);
  sheet.setRowHeight(1, 32);
  sheet.autoResizeColumns(1, columnCount);
}

function initializeDefaultSettings_() {
  const sheet = getSheet_(EM_CONFIG.SHEETS.SETTINGS);
  const existing = getObjects_(sheet);
  const existingKeys = {};
  existing.forEach(function(row) {
    existingKeys[String(row.setting_key)] = true;
  });

  const now = new Date();
  const rowsToAdd = EM_CONFIG.DEFAULT_SETTINGS
    .filter(function(row) {
      return !existingKeys[row[0]];
    })
    .map(function(row) {
      return {
        setting_key: row[0],
        setting_value: row[1],
        description: row[2],
        updated_at: now
      };
    });

  if (rowsToAdd.length) {
    appendObjects_(sheet, rowsToAdd);
  }
}

function testDatabaseConnection() {
  const ss = SpreadsheetApp.openById(EM_CONFIG.SPREADSHEET_ID);
  const result = {
    ok: true,
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    sheets: ss.getSheets().map(function(sheet) {
      return {
        name: sheet.getName(),
        rows: sheet.getLastRow(),
        columns: sheet.getLastColumn()
      };
    })
  };

  Logger.log(JSON.stringify(result));
  return result;
}


/* -------------------------------------------------------------------------- */
/* BACKEND API KEY                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Jalankan dari Apps Script Editor atau menu Energy Monitor.
 * Masukkan secret acak minimal 32 karakter yang sama dengan BACKEND_API_KEY
 * pada environment backend Node.js.
 */
function configureBackendApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Konfigurasi Backend API Key",
    "Masukkan secret acak minimal 32 karakter. Simpan nilai yang sama di environment backend sebagai BACKEND_API_KEY.",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return { ok: false, message: "Konfigurasi dibatalkan." };
  }

  const secret = String(response.getResponseText() || "").trim();
  if (secret.length < 32) {
    ui.alert("API key ditolak", "API key harus minimal 32 karakter.", ui.ButtonSet.OK);
    return { ok: false, message: "API key terlalu pendek." };
  }

  PropertiesService.getScriptProperties().setProperty("BACKEND_API_KEY", secret);
  ui.alert(
    "Berhasil",
    "Backend API Key tersimpan di Script Properties. Masukkan nilai yang sama ke environment backend.",
    ui.ButtonSet.OK
  );
  return { ok: true, message: "Backend API Key berhasil disimpan." };
}

function requireBackendApiKey_(providedKey) {
  const storedKey = PropertiesService.getScriptProperties().getProperty("BACKEND_API_KEY");
  if (!storedKey) {
    throw new Error("Backend API Key belum dikonfigurasi oleh administrator.");
  }
  if (!providedKey || !constantTimeEquals_(String(providedKey), storedKey)) {
    throw new Error("Unauthorized: API key tidak valid.");
  }
}

function constantTimeEquals_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}


/* -------------------------------------------------------------------------- */
/* WEB APP ENTRY POINT                                                        */
/* -------------------------------------------------------------------------- */

function doGet() {
  return jsonOutput_({
    ok: true,
    service: "Energy Monitor Sheets API",
    version: "1.0.0",
    message: "API aktif. Gunakan POST untuk operasi yang diizinkan."
  });
}

function doPost(e) {
  // Public GitHub Pages portal submits a normal HTML form to avoid CORS
  // preflight limitations in Apps Script Web Apps.
  if (e && e.parameter && e.parameter.em_payload) {
    const origin = String(e.parameter.em_origin || "");
    if (!isPortalOriginAllowed_(origin)) {
      return HtmlService.createHtmlOutput("Origin tidak diizinkan.");
    }
    return handlePortalFormRequest_(e.parameter.em_payload, origin);
  }

  try {
    const payload = parseRequestBody_(e);
    const action = String(payload.action || "").trim();

    if (!action) {
      throw new Error("Parameter action wajib diisi.");
    }

    let result;

    // Endpoint ingest hanya menerima device token khusus perangkat.
    if (action === "ingestMeasurement") {
      result = ingestMeasurement_(payload);
      return jsonOutput_({ ok: true, data: result });
    }

    // Semua operasi administratif dan pembacaan data pelanggan harus
    // dipanggil oleh backend tepercaya menggunakan API key.
    requireBackendApiKey_(payload.apiKey);

    switch (action) {
      case "getCustomerAuthByUsername":
        result = getCustomerAuthByUsername_(payload.username);
        break;

      case "createCustomer":
        result = createCustomer_(payload);
        break;

      case "createDevice":
        result = createDevice_(payload);
        break;

      case "getCustomerDashboard":
        result = getCustomerDashboard_(payload.customerId);
        break;

      case "getMeasurementHistory":
        result = getMeasurementHistory_(payload);
        break;

      case "listCustomers":
        result = listCustomers_();
        break;

      case "listDevices":
        result = listDevices_();
        break;

      case "updateCustomerTariff":
        result = updateCustomerTariff_(payload);
        break;

      default:
        throw new Error("Action tidak dikenal: " + action);
    }

    return jsonOutput_({ ok: true, data: result });

  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonOutput_({
      ok: false,
      error: error && error.message ? error.message : "Terjadi kesalahan."
    });
  }
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Body JSON tidak ditemukan.");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("Format body harus JSON yang valid.");
  }
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


/* -------------------------------------------------------------------------- */
/* CUSTOMER MANAGEMENT                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Payload backend:
 * {
 *   action: "createCustomer",
 *   apiKey: "...",
 *   username: "pelanggan01",
 *   fullName: "Nama Pelanggan",
 *   email: "opsional@email.com",
 *   passwordHash: "<argon2id/bcrypt hash dari backend>",
 *   location: "Lokasi",
 *   tariffPerKwh: 0
 * }
 *
 * Password asli tidak pernah disimpan di Google Sheets.
 */
function createCustomer_(payload) {
  const fullName = requiredString_(payload.fullName, "fullName");
  const username = requiredString_(payload.username, "username").toLowerCase();
  const email = String(payload.email || "").trim().toLowerCase();
  const passwordHash = requiredString_(payload.passwordHash, "passwordHash");

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username harus 3-32 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Format email tidak valid.");
  }

  if (passwordHash.length < 20) {
    throw new Error("passwordHash tidak valid. Hash password di backend menggunakan Argon2id atau bcrypt.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(EM_CONFIG.SHEETS.CUSTOMERS);
    const existing = getObjects_(sheet);

    if (existing.some(function(row) {
      return String(row.username || "").toLowerCase() === username;
    })) {
      throw new Error("Username sudah digunakan.");
    }

    if (email && existing.some(function(row) {
      return String(row.email || "").toLowerCase() === email;
    })) {
      throw new Error("Email sudah terdaftar.");
    }

    const customerId = "CUS-" + Utilities.getUuid().replace(/-/g, "").substring(0, 10).toUpperCase();
    const now = new Date();
    const tariff = payload.tariffPerKwh === undefined ? 0 : numberValue_(payload.tariffPerKwh, "tariffPerKwh");

    appendObjects_(sheet, [{
      customer_id: customerId,
      username: username,
      full_name: fullName,
      email: email,
      password_hash: passwordHash,
      status: "ACTIVE",
      location: String(payload.location || ""),
      tariff_per_kwh: tariff,
      created_at: now,
      updated_at: now
    }]);

    return {
      customerId: customerId,
      username: username,
      email: email,
      status: "ACTIVE",
      message: "Pelanggan berhasil dibuat. Belum ada perangkat yang ditautkan."
    };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Lookup hash password berdasarkan username.
 * Fungsi ini hanya boleh dipanggil backend tepercaya dengan BACKEND_API_KEY.
 * Jangan pernah mengembalikan password_hash melalui endpoint publik.
 */
function getCustomerAuthByUsername_(username) {
  username = requiredString_(username, "username").toLowerCase();

  const customer = findObject_(
    EM_CONFIG.SHEETS.CUSTOMERS,
    "username",
    username
  );

  if (!customer) return null;

  return {
    customerId: customer.customer_id,
    username: customer.username,
    passwordHash: customer.password_hash,
    status: customer.status
  };
}


/* -------------------------------------------------------------------------- */
/* DEVICE MANAGEMENT                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Menghasilkan satu device token baru dan menyimpan hash-nya.
 * Token asli hanya dikembalikan sekali untuk provisioning perangkat ESP32.
 * Satu customer hanya boleh memiliki satu perangkat.
 */
function createDevice_(payload) {
  const customerId = requiredString_(payload.customerId, "customerId");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const customer = findObject_(EM_CONFIG.SHEETS.CUSTOMERS, "customer_id", customerId);
    if (!customer || String(customer.status).toUpperCase() !== "ACTIVE") {
      throw new Error("Pelanggan tidak ditemukan atau tidak aktif.");
    }

    const devices = getObjects_(getSheet_(EM_CONFIG.SHEETS.DEVICES));
    const alreadyAssigned = devices.some(function(device) {
      return String(device.customer_id) === customerId;
    });

    if (alreadyAssigned) {
      throw new Error("Pelanggan ini sudah memiliki perangkat. Satu pelanggan hanya boleh memiliki satu alat.");
    }

    const deviceId = "EM-" + Utilities.getUuid().replace(/-/g, "").substring(0, 10).toUpperCase();
    const deviceToken = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    const now = new Date();

    appendObjects_(getSheet_(EM_CONFIG.SHEETS.DEVICES), [{
      device_id: deviceId,
      customer_id: customerId,
      device_name: String(payload.deviceName || "Energy Monitor"),
      device_type: String(payload.deviceType || "ESP32 + Sensor Energi"),
      location: String(payload.location || customer.location || ""),
      device_token_hash: sha256Hex_(deviceToken),
      status: "OFFLINE",
      last_seen: "",
      created_at: now,
      updated_at: now
    }]);

    return {
      deviceId: deviceId,
      customerId: customerId,
      deviceToken: deviceToken,
      warning: "Simpan deviceToken ke firmware ESP32 dengan aman. Token asli tidak disimpan di spreadsheet dan tidak dapat ditampilkan kembali."
    };
  } finally {
    lock.releaseLock();
  }
}


/* -------------------------------------------------------------------------- */
/* DEVICE MEASUREMENT INGESTION                                               */
/* -------------------------------------------------------------------------- */

/**
 * Payload ESP32:
 * {
 *   action: "ingestMeasurement",
 *   deviceId: "EM-...",
 *   deviceToken: "...",
 *   measuredAt: "2026-11-15T07:00:00Z",
 *   voltage: 220.5,
 *   current: 1.25,
 *   activePower: 275.0,
 *   energy: 12.345,
 *   frequency: 50.0,
 *   powerFactor: 0.98,
 *   apparentPower: 280.6,     // opsional
 *   reactivePower: 55.0,      // opsional
 *   temperature: 29.5,        // opsional
 *   humidity: 65.0,           // opsional
 *   rssi: -62                 // opsional
 * }
 */
function ingestMeasurement_(payload) {
  const deviceId = requiredString_(payload.deviceId, "deviceId");
  const deviceToken = requiredString_(payload.deviceToken, "deviceToken");
  const device = findObject_(EM_CONFIG.SHEETS.DEVICES, "device_id", deviceId);

  if (!device || !constantTimeEquals_(sha256Hex_(deviceToken), String(device.device_token_hash || ""))) {
    throw new Error("Device authentication failed.");
  }

  const measuredAt = payload.measuredAt ? new Date(payload.measuredAt) : new Date();
  if (isNaN(measuredAt.getTime())) {
    throw new Error("Format measuredAt tidak valid.");
  }

  const measurement = {
    measurement_id: Utilities.getUuid(),
    device_id: deviceId,
    measured_at: measuredAt,
    voltage_v: numberValue_(payload.voltage, "voltage"),
    current_a: numberValue_(payload.current, "current"),
    active_power_w: numberValue_(payload.activePower, "activePower"),
    energy_kwh: numberValue_(payload.energy, "energy"),
    frequency_hz: numberValue_(payload.frequency, "frequency"),
    power_factor: numberValue_(payload.powerFactor, "powerFactor"),
    apparent_power_va: optionalNumber_(payload.apparentPower),
    reactive_power_var: optionalNumber_(payload.reactivePower),
    temperature_c: optionalNumber_(payload.temperature),
    humidity_pct: optionalNumber_(payload.humidity),
    rssi_dbm: optionalNumber_(payload.rssi),
    created_at: new Date()
  };

  if (measurement.voltage_v < 0 || measurement.current_a < 0 ||
      measurement.active_power_w < 0 || measurement.energy_kwh < 0 ||
      measurement.frequency_hz < 0) {
    throw new Error("Nilai pengukuran listrik tidak boleh negatif.");
  }

  if (measurement.power_factor < 0 || measurement.power_factor > 1) {
    throw new Error("Power factor harus berada pada rentang 0 sampai 1.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendObjects_(getSheet_(EM_CONFIG.SHEETS.MEASUREMENTS), [measurement]);
    updateObjectByKey_(
      EM_CONFIG.SHEETS.DEVICES,
      "device_id",
      deviceId,
      {
        status: "ONLINE",
        last_seen: measuredAt,
        updated_at: new Date()
      }
    );
  } finally {
    lock.releaseLock();
  }

  return {
    measurementId: measurement.measurement_id,
    deviceId: deviceId,
    measuredAt: measuredAt,
    message: "Pengukuran berhasil disimpan."
  };
}


/* -------------------------------------------------------------------------- */
/* CUSTOMER DASHBOARD & HISTORY                                               */
/* -------------------------------------------------------------------------- */

function getCustomerDashboard_(customerId) {
  customerId = requiredString_(customerId, "customerId");

  const customer = findObject_(EM_CONFIG.SHEETS.CUSTOMERS, "customer_id", customerId);
  if (!customer || String(customer.status).toUpperCase() !== "ACTIVE") {
    throw new Error("Pelanggan tidak ditemukan atau tidak aktif.");
  }

  const devices = getObjects_(getSheet_(EM_CONFIG.SHEETS.DEVICES));
  const customerDevices = devices.filter(function(device) {
    return String(device.customer_id) === customerId;
  });

  if (customerDevices.length > 1) {
    throw new Error("Konflik data: akun pelanggan memiliki lebih dari satu perangkat.");
  }

  const device = customerDevices.length ? customerDevices[0] : null;
  const summary = device
    ? getDeviceMeasurementSummary_(device.device_id, 7)
    : { latestMeasurement: null, energyDaily: [], energyHourly: [] };

  let deviceStatus = "OFFLINE";
  if (device && device.last_seen) {
    const lastSeenTime = new Date(device.last_seen).getTime();
    const offlineAfterSeconds = Number(getSettingValue_("device_offline_after_seconds", 180));
    if (
      isFinite(lastSeenTime) &&
      lastSeenTime > 0 &&
      Date.now() - lastSeenTime <= Math.max(60, offlineAfterSeconds) * 1000
    ) {
      deviceStatus = "ONLINE";
    }
  }

  return {
    customer: {
      customer_id: customer.customer_id,
      username: customer.username,
      full_name: customer.full_name,
      email: customer.email,
      status: customer.status,
      location: customer.location,
      tariff_per_kwh: Number(customer.tariff_per_kwh || 0)
    },
    device: device ? {
      device_id: device.device_id,
      device_name: device.device_name,
      device_type: device.device_type,
      location: device.location,
      status: deviceStatus,
      last_seen: device.last_seen
    } : null,
    latestMeasurement: summary.latestMeasurement,
    energyTodayKwh: summary.energyDaily.length
      ? summary.energyDaily[summary.energyDaily.length - 1].energy_kwh
      : 0,
    energyDaily: summary.energyDaily,
    energyHourly: summary.energyHourly
  };
}

/**
 * Reads the measurement tab once and calculates seven-day and 24-hour energy
 * deltas from cumulative meter values. This avoids downloading thousands of
 * records to the customer browser for charts.
 */
function getSettingValue_(settingKey, fallbackValue) {
  const setting = findObject_(
    EM_CONFIG.SHEETS.SETTINGS,
    "setting_key",
    settingKey
  );
  return setting ? setting.setting_value : fallbackValue;
}

function getDeviceMeasurementSummary_(deviceId, numberOfDays) {
  const rows = getObjects_(getSheet_(EM_CONFIG.SHEETS.MEASUREMENTS))
    .filter(function(row) {
      return String(row.device_id) === String(deviceId);
    })
    .sort(function(a, b) {
      return new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime();
    });

  if (!rows.length) {
    return { latestMeasurement: null, energyDaily: [], energyHourly: [] };
  }

  const latestMeasurement = rows[rows.length - 1];
  const todayKeyForRange = Utilities.formatDate(
    new Date(),
    "Asia/Jakarta",
    "yyyy-MM-dd"
  );
  const todayParts = todayKeyForRange.split("-").map(Number);
  const todayUtc = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const days = [];

  for (let offset = numberOfDays - 1; offset >= 0; offset--) {
    // Use UTC arithmetic so day keys remain correct regardless of
    // the Apps Script project's configured timezone.
    const date = new Date(todayUtc - offset * 24 * 60 * 60 * 1000);
    days.push({
      date: date,
      key: Utilities.formatDate(date, "Asia/Jakarta", "yyyy-MM-dd")
    });
  }

  const energyDaily = days.map(function(day) {
    const readings = rows.filter(function(row) {
      return Utilities.formatDate(
        new Date(row.measured_at),
        "Asia/Jakarta",
        "yyyy-MM-dd"
      ) === day.key;
    });

    if (!readings.length) {
      return { date: day.key, energy_kwh: 0 };
    }

    const firstTime = new Date(readings[0].measured_at).getTime();
    let previousReading = null;

    for (let index = 0; index < rows.length; index++) {
      const readingTime = new Date(rows[index].measured_at).getTime();
      if (readingTime < firstTime) previousReading = rows[index];
      else break;
    }

    const startEnergy = previousReading
      ? Number(previousReading.energy_kwh || 0)
      : Number(readings[0].energy_kwh || 0);
    const endEnergy = Number(readings[readings.length - 1].energy_kwh || 0);

    return {
      date: day.key,
      energy_kwh: Math.max(0, endEnergy - startEnergy)
    };
  });

  const todayKey = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
  const energyHourly = Array(24).fill(0);

  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const current = rows[index];
    const currentDate = new Date(current.measured_at);
    const currentKey = Utilities.formatDate(currentDate, "Asia/Jakarta", "yyyy-MM-dd");

    if (currentKey !== todayKey) continue;

    const delta = Number(current.energy_kwh || 0) - Number(previous.energy_kwh || 0);
    if (delta >= 0) {
      const hour = Number(Utilities.formatDate(currentDate, "Asia/Jakarta", "H"));
      energyHourly[hour] += delta;
    }
  }

  return {
    latestMeasurement: latestMeasurement,
    energyDaily: energyDaily,
    energyHourly: energyHourly
  };
}
function getLatestMeasurement_(deviceId) {
  const rows = getObjects_(getSheet_(EM_CONFIG.SHEETS.MEASUREMENTS));
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].device_id) === String(deviceId)) {
      return rows[i];
    }
  }
  return null;
}

function getMeasurementHistory_(payload) {
  const customerId = requiredString_(payload.customerId, "customerId");
  const customerDevices = getObjects_(getSheet_(EM_CONFIG.SHEETS.DEVICES))
    .filter(function(row) {
      return String(row.customer_id) === customerId;
    });

  if (customerDevices.length > 1) {
    throw new Error("Konflik data: akun pelanggan memiliki lebih dari satu perangkat.");
  }

  const device = customerDevices.length ? customerDevices[0] : null;
  if (!device) {
    return { customerId: customerId, deviceId: null, records: [] };
  }

  const limitInput = Number(payload.limit || 100);
  const limit = Math.min(
    EM_CONFIG.MAX_HISTORY_LIMIT,
    Math.max(1, Math.floor(isFinite(limitInput) ? limitInput : 100))
  );

  const fromDate = payload.from ? new Date(payload.from) : null;
  const toDate = payload.to ? new Date(payload.to) : null;

  if (fromDate && isNaN(fromDate.getTime())) throw new Error("Tanggal from tidak valid.");
  if (toDate && isNaN(toDate.getTime())) throw new Error("Tanggal to tidak valid.");

  const rows = getObjects_(getSheet_(EM_CONFIG.SHEETS.MEASUREMENTS))
    .filter(function(row) {
      if (String(row.device_id) !== String(device.device_id)) return false;
      const measuredAt = new Date(row.measured_at);
      if (fromDate && measuredAt < fromDate) return false;
      if (toDate && measuredAt > toDate) return false;
      return true;
    })
    .slice(-limit)
    .reverse();

  return {
    customerId: customerId,
    deviceId: device.device_id,
    count: rows.length,
    records: rows
  };
}


/* -------------------------------------------------------------------------- */
/* ADMIN / BACKEND READ & UPDATE                                               */
/* -------------------------------------------------------------------------- */

function listCustomers_() {
  return getObjects_(getSheet_(EM_CONFIG.SHEETS.CUSTOMERS)).map(function(row) {
    return {
      customer_id: row.customer_id,
      username: row.username,
      full_name: row.full_name,
      email: row.email,
      status: row.status,
      location: row.location,
      tariff_per_kwh: row.tariff_per_kwh,
      created_at: row.created_at
    };
  });
}

function listDevices_() {
  return getObjects_(getSheet_(EM_CONFIG.SHEETS.DEVICES)).map(function(row) {
    return {
      device_id: row.device_id,
      customer_id: row.customer_id,
      device_name: row.device_name,
      device_type: row.device_type,
      location: row.location,
      status: row.status,
      last_seen: row.last_seen
    };
  });
}

function updateCustomerTariff_(payload) {
  const customerId = requiredString_(payload.customerId, "customerId");
  const tariff = numberValue_(payload.tariffPerKwh, "tariffPerKwh");
  if (tariff < 0) throw new Error("Tarif tidak boleh negatif.");

  const customer = findObject_(EM_CONFIG.SHEETS.CUSTOMERS, "customer_id", customerId);
  if (!customer) throw new Error("Pelanggan tidak ditemukan.");

  updateObjectByKey_(
    EM_CONFIG.SHEETS.CUSTOMERS,
    "customer_id",
    customerId,
    { tariff_per_kwh: tariff, updated_at: new Date() }
  );

  return { customerId: customerId, tariffPerKwh: tariff };
}


/* -------------------------------------------------------------------------- */
/* SPREADSHEET HELPERS                                                        */
/* -------------------------------------------------------------------------- */

function getSpreadsheet_() {
  return SpreadsheetApp.openById(EM_CONFIG.SPREADSHEET_ID);
}

function getSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Tab " + sheetName + " belum ada. Jalankan setupEnergyMonitorDatabase().");
  }
  return sheet;
}

function getObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values.shift().map(function(header) {
    return String(header);
  });

  return values
    .filter(function(row) {
      return row.some(function(value) {
        return value !== "" && value !== null;
      });
    })
    .map(function(row) {
      const object = {};
      headers.forEach(function(header, index) {
        if (header) object[header] = row[index];
      });
      return object;
    });
}

function findObject_(sheetName, keyName, keyValue) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const keyIndex = headers.indexOf(keyName);
  if (keyIndex < 0) throw new Error("Kolom " + keyName + " tidak ditemukan di " + sheetName + ".");

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][keyIndex]) === String(keyValue)) {
      const result = { __row: i + 2 };
      headers.forEach(function(header, index) {
        result[String(header)] = values[i][index];
      });
      return result;
    }
  }
  return null;
}

function appendObjects_(sheet, objects) {
  if (!objects || !objects.length) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(String);

  const rows = objects.map(function(object) {
    return headers.map(function(header) {
      return object[header] === undefined ? "" : object[header];
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function updateObjectByKey_(sheetName, keyName, keyValue, changes) {
  const sheet = getSheet_(sheetName);
  const found = findObject_(sheetName, keyName, keyValue);
  if (!found) throw new Error("Data tidak ditemukan untuk diperbarui.");

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(String);

  Object.keys(changes).forEach(function(field) {
    const columnIndex = headers.indexOf(field);
    if (columnIndex < 0) throw new Error("Kolom " + field + " tidak ditemukan.");
    sheet.getRange(found.__row, columnIndex + 1).setValue(changes[field]);
  });
}


/* -------------------------------------------------------------------------- */
/* VALIDATION & CRYPTO                                                        */
/* -------------------------------------------------------------------------- */

function requiredString_(value, fieldName) {
  const result = String(value === undefined || value === null ? "" : value).trim();
  if (!result) throw new Error(fieldName + " wajib diisi.");
  return result;
}

function numberValue_(value, fieldName) {
  if (value === undefined || value === null || value === "" || !isFinite(Number(value))) {
    throw new Error(fieldName + " harus berupa angka.");
  }
  return Number(value);
}

function optionalNumber_(value) {
  if (value === undefined || value === null || value === "") return "";
  if (!isFinite(Number(value))) throw new Error("Parameter opsional harus berupa angka.");
  return Number(value);
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    const normalized = (byte + 256) % 256;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}


/* -------------------------------------------------------------------------- */
/* GITHUB PAGES CUSTOMER PORTAL API                                           */
/* -------------------------------------------------------------------------- */

/**
 * The GitHub Pages browser sends an ordinary HTML form POST containing
 * em_payload. This avoids a CORS preflight request.
 *
 * Request body (inside the em_payload form field):
 * {
 *   "requestId": "random-correlation-id",
 *   "action": "login | dashboard | history | logout",
 *   "username": "...",
 *   "password": "...",
 *   "sessionToken": "..."
 * }
 */
function isPortalOriginAllowed_(origin) {
  const allowed = [
    "https://denisrohmansyah-cloud.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000"
  ];
  return allowed.indexOf(String(origin || "")) !== -1;
}

function handlePortalFormRequest_(rawPayload, targetOrigin) {
  let requestId = "";
  let result;

  try {
    const request = JSON.parse(String(rawPayload || "{}"));
    requestId = String(request.requestId || "");
    if (!requestId || requestId.length > 120) {
      throw new Error("Request ID tidak valid.");
    }

    result = {
      ok: true,
      data: dispatchPortalAction_(request)
    };
  } catch (error) {
    result = {
      ok: false,
      message: error && error.message ? error.message : "Permintaan tidak dapat diproses."
    };
  }

  return portalPostMessageHtml_(requestId, result, targetOrigin);
}

/**
 * Return a minimal HTML page inside the hidden iframe and post the response
 * to its parent GitHub Pages window. The parent verifies both iframe source
 * and the one-time request ID before accepting a response.
 */
function portalPostMessageHtml_(requestId, result, targetOrigin) {
  const message = {
    channel: "ENERGY_MONITOR_PORTAL",
    requestId: requestId,
    result: result
  };
  const safeJson = JSON.stringify(message)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  const safeOrigin = JSON.stringify(String(targetOrigin || ""));
  const html =
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>window.parent.postMessage(' + safeJson + ', ' + safeOrigin + ');</script>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function dispatchPortalAction_(request) {
  const action = requiredString_(request.action, "action");

  switch (action) {
    case "ping":
      return {
        service: "Energy Monitor Portal API",
        status: "online",
        timestamp: new Date().toISOString()
      };

    case "login":
      return portalLogin_(request.username, request.password);

    case "dashboard": {
      const session = requirePortalSession_(request.sessionToken);
      return getCustomerDashboard_(session.customerId);
    }

    case "history": {
      const session = requirePortalSession_(request.sessionToken);
      return getMeasurementHistory_({
        customerId: session.customerId,
        limit: request.limit || 1000,
        from: request.from,
        to: request.to
      });
    }

    case "logout":
      return portalLogout_(request.sessionToken);

    default:
      throw new Error("Action portal tidak dikenal.");
  }
}

/* ------------------------- Password and sessions ------------------------- */

const PORTAL_AUTH_CONFIG = Object.freeze({
  PASSWORD_ITERATIONS: 120000,
  SESSION_TTL_SECONDS: 7200,
  LOGIN_MAX_ATTEMPTS: 8,
  LOGIN_LOCK_SECONDS: 600
});

/**
 * Password format:
 * pbkdf2_sha256$iterations$salt$derivedKey
 *
 * A random pepper lives in Script Properties, not in the Google Sheet.
 * This is the Apps Script-only login scheme for this GitHub Pages deployment.
 */
function getOrCreatePasswordPepper_() {
  const properties = PropertiesService.getScriptProperties();
  let pepper = properties.getProperty("PORTAL_PASSWORD_PEPPER");

  if (!pepper) {
    pepper = Utilities.getUuid().replace(/-/g, "") +
      Utilities.getUuid().replace(/-/g, "");
    properties.setProperty("PORTAL_PASSWORD_PEPPER", pepper);
  }

  return pepper;
}

function createPortalPasswordHash_(password) {
  password = String(password || "");
  if (password.length < 10 || password.length > 200) {
    throw new Error("Password pelanggan harus 10-200 karakter.");
  }

  const salt = Utilities.getUuid().replace(/-/g, "") +
    Utilities.getUuid().replace(/-/g, "");
  const iterations = PORTAL_AUTH_CONFIG.PASSWORD_ITERATIONS;
  const derivedKey = pbkdf2HmacSha256_(
    password,
    salt,
    iterations,
    getOrCreatePasswordPepper_()
  );

  return "pbkdf2_sha256$" + iterations + "$" + salt + "$" + derivedKey;
}

function verifyPortalPassword_(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];

  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 300000 ||
      !salt || !/^[a-f0-9]{64}$/i.test(expected)) {
    return false;
  }

  const actual = pbkdf2HmacSha256_(
    String(password || ""),
    salt,
    iterations,
    getOrCreatePasswordPepper_()
  );

  return constantTimeEquals_(actual, expected);
}

/**
 * PBKDF2-HMAC-SHA256, one 32-byte block.
 * HMAC is computed by Apps Script Utilities, not by a custom hash routine.
 */
function pbkdf2HmacSha256_(password, salt, iterations, pepper) {
  const passwordBytes = Utilities.newBlob(
    String(password) + "\u0000" + String(pepper)
  ).getBytes();

  const saltBytes = Utilities.newBlob(String(salt)).getBytes();
  const blockOne = saltBytes.concat([0, 0, 0, 1]);

  let u = Utilities.computeHmacSha256Signature(blockOne, passwordBytes);
  const derived = u.slice();

  for (let iteration = 1; iteration < iterations; iteration++) {
    u = Utilities.computeHmacSha256Signature(u, passwordBytes);

    for (let byteIndex = 0; byteIndex < derived.length; byteIndex++) {
      derived[byteIndex] = derived[byteIndex] ^ u[byteIndex];
    }
  }

  return bytesToHex_(derived);
}

function bytesToHex_(bytes) {
  return bytes.map(function(value) {
    const normalized = (value + 256) % 256;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function portalLogin_(username, password) {
  username = requiredString_(username, "username").toLowerCase();
  password = String(password || "");

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username atau password tidak valid.");
  }
  if (!password || password.length > 200) {
    throw new Error("Username atau password tidak valid.");
  }

  const cache = CacheService.getScriptCache();
  const attemptsKey = "em_login_attempts_" + sha256Hex_(username);
  const attempts = Number(cache.get(attemptsKey) || 0);

  if (attempts >= PORTAL_AUTH_CONFIG.LOGIN_MAX_ATTEMPTS) {
    throw new Error("Terlalu banyak percobaan login. Coba lagi dalam 10 menit.");
  }

  const customer = findObject_(
    EM_CONFIG.SHEETS.CUSTOMERS,
    "username",
    username
  );

  const isValid = customer &&
    String(customer.status || "").toUpperCase() === "ACTIVE" &&
    verifyPortalPassword_(password, customer.password_hash);

  if (!isValid) {
    cache.put(
      attemptsKey,
      String(attempts + 1),
      PORTAL_AUTH_CONFIG.LOGIN_LOCK_SECONDS
    );
    throw new Error("Username atau password tidak valid.");
  }

  cache.remove(attemptsKey);

  const token = Utilities.getUuid().replace(/-/g, "") +
    Utilities.getUuid().replace(/-/g, "");
  const session = {
    customerId: String(customer.customer_id),
    username: String(customer.username),
    expiresAt: Date.now() + PORTAL_AUTH_CONFIG.SESSION_TTL_SECONDS * 1000
  };

  cache.put(
    "em_portal_session_" + sha256Hex_(token),
    JSON.stringify(session),
    PORTAL_AUTH_CONFIG.SESSION_TTL_SECONDS
  );

  return {
    sessionToken: token,
    expiresIn: PORTAL_AUTH_CONFIG.SESSION_TTL_SECONDS,
    customer: {
      customer_id: customer.customer_id,
      username: customer.username,
      full_name: customer.full_name
    }
  };
}

function requirePortalSession_(sessionToken) {
  sessionToken = requiredString_(sessionToken, "sessionToken");
  if (sessionToken.length > 200) throw new Error("Sesi tidak valid.");

  const key = "em_portal_session_" + sha256Hex_(sessionToken);
  const stored = CacheService.getScriptCache().get(key);
  if (!stored) throw new Error("Sesi berakhir. Silakan login kembali.");

  let session;
  try {
    session = JSON.parse(stored);
  } catch (error) {
    CacheService.getScriptCache().remove(key);
    throw new Error("Sesi tidak valid.");
  }

  if (!session.customerId || Date.now() >= Number(session.expiresAt || 0)) {
    CacheService.getScriptCache().remove(key);
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }

  return session;
}

function portalLogout_(sessionToken) {
  sessionToken = requiredString_(sessionToken, "sessionToken");
  CacheService.getScriptCache().remove(
    "em_portal_session_" + sha256Hex_(sessionToken)
  );
  return { message: "Logout berhasil." };
}


/* ----------------------- Admin account provisioning ---------------------- */

/**
 * Jalankan dari Apps Script Editor atau menu Energy Monitor.
 * Password tidak ditampilkan kembali dan hanya hash PBKDF2 yang disimpan.
 */
function createCustomerFromEditor() {
  const ui = SpreadsheetApp.getUi();

  const usernameResponse = ui.prompt(
    "Tambah Pelanggan",
    "Masukkan username (3-32 karakter, huruf kecil, angka, titik, _ atau -).",
    ui.ButtonSet.OK_CANCEL
  );
  if (usernameResponse.getSelectedButton() !== ui.Button.OK) return;

  const username = String(usernameResponse.getResponseText() || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    ui.alert("Username tidak valid.");
    return;
  }

  const nameResponse = ui.prompt("Nama Pelanggan", "Masukkan nama lengkap pelanggan.", ui.ButtonSet.OK_CANCEL);
  if (nameResponse.getSelectedButton() !== ui.Button.OK) return;
  const fullName = requiredString_(nameResponse.getResponseText(), "Nama pelanggan");

  const emailResponse = ui.prompt("Email Kontak", "Masukkan email (opsional).", ui.ButtonSet.OK_CANCEL);
  if (emailResponse.getSelectedButton() !== ui.Button.OK) return;
  const email = String(emailResponse.getResponseText() || "").trim().toLowerCase();

  const locationResponse = ui.prompt("Lokasi", "Masukkan lokasi pemasangan.", ui.ButtonSet.OK_CANCEL);
  if (locationResponse.getSelectedButton() !== ui.Button.OK) return;
  const location = String(locationResponse.getResponseText() || "").trim();

  const tariffResponse = ui.prompt("Tarif Listrik", "Masukkan tarif per kWh dalam Rupiah (contoh 1444.70).", ui.ButtonSet.OK_CANCEL);
  if (tariffResponse.getSelectedButton() !== ui.Button.OK) return;
  const tariff = Number(tariffResponse.getResponseText());
  if (!isFinite(tariff) || tariff < 0) {
    ui.alert("Tarif listrik tidak valid.");
    return;
  }

  const passwordResponse = ui.prompt(
    "Password Pelanggan",
    "Masukkan password awal minimal 10 karakter. Berikan password ini kepada pelanggan melalui saluran terpisah.",
    ui.ButtonSet.OK_CANCEL
  );
  if (passwordResponse.getSelectedButton() !== ui.Button.OK) return;
  const password = String(passwordResponse.getResponseText() || "");
  if (password.length < 10 || password.length > 200) {
    ui.alert("Password harus 10-200 karakter.");
    return;
  }

  const sheet = getSheet_(EM_CONFIG.SHEETS.CUSTOMERS);
  const rows = getObjects_(sheet);
  if (rows.some(function(row) {
    return String(row.username || "").toLowerCase() === username;
  })) {
    ui.alert("Username sudah digunakan.");
    return;
  }

  if (email && rows.some(function(row) {
    return String(row.email || "").toLowerCase() === email;
  })) {
    ui.alert("Email sudah digunakan.");
    return;
  }

  const customerId = "CUS-" + Utilities.getUuid().replace(/-/g, "").substring(0, 10).toUpperCase();
  const now = new Date();

  appendObjects_(sheet, [{
    customer_id: customerId,
    username: username,
    full_name: fullName,
    email: email,
    password_hash: createPortalPasswordHash_(password),
    status: "ACTIVE",
    location: location,
    tariff_per_kwh: tariff,
    created_at: now,
    updated_at: now
  }]);

  ui.alert(
    "Pelanggan berhasil dibuat",
    "Customer ID: " + customerId + "\nUsername: " + username + "\nSatu perangkat dapat ditautkan melalui menu Energy Monitor.",
    ui.ButtonSet.OK
  );
}

/**
 * Memperbaiki akun pelanggan lama yang dibuat secara manual di Google Sheets.
 * - Menemukan akun berdasarkan username.
 * - Mengubah status menjadi ACTIVE.
 * - Mengganti nilai password_hash lama (termasuk plaintext) dengan PBKDF2.
 * - Tidak mengubah customer_id, username, nama, email, lokasi, atau tarif.
 *
 * Jalankan dari menu Energy Monitor. Jangan ketik password ke sel spreadsheet.
 */
function repairCustomerAccountFromEditor() {
  const ui = SpreadsheetApp.getUi();

  const usernameResponse = ui.prompt(
    "Aktifkan Akun & Reset Password",
    "Masukkan username persis seperti pada tab Customers.",
    ui.ButtonSet.OK_CANCEL
  );
  if (usernameResponse.getSelectedButton() !== ui.Button.OK) return;

  const username = String(usernameResponse.getResponseText() || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    ui.alert("Username tidak valid.");
    return;
  }

  const customer = findObject_(EM_CONFIG.SHEETS.CUSTOMERS, "username", username);
  if (!customer) {
    ui.alert("Akun tidak ditemukan", "Tidak ada pelanggan dengan username tersebut.", ui.ButtonSet.OK);
    return;
  }

  const passwordResponse = ui.prompt(
    "Password Baru",
    "Masukkan password baru minimal 10 karakter. Password akan di-hash sebelum disimpan.",
    ui.ButtonSet.OK_CANCEL
  );
  if (passwordResponse.getSelectedButton() !== ui.Button.OK) return;

  const newPassword = String(passwordResponse.getResponseText() || "");
  if (newPassword.length < 10 || newPassword.length > 200) {
    ui.alert("Password harus 10-200 karakter.");
    return;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Re-check under lock so the operation does not update a stale row.
    const latestCustomer = findObject_(EM_CONFIG.SHEETS.CUSTOMERS, "username", username);
    if (!latestCustomer) throw new Error("Akun pelanggan tidak lagi ditemukan.");

    updateObjectByKey_(
      EM_CONFIG.SHEETS.CUSTOMERS,
      "customer_id",
      latestCustomer.customer_id,
      {
        password_hash: createPortalPasswordHash_(newPassword),
        status: "ACTIVE",
        updated_at: new Date()
      }
    );
  } finally {
    lock.releaseLock();
  }

  ui.alert(
    "Akun berhasil diperbaiki",
    "Username: " + username +
    "\nCustomer ID: " + customer.customer_id +
    "\nStatus: ACTIVE" +
    "\nPassword telah disimpan dalam bentuk hash. Nilai password asli tidak disimpan di spreadsheet.",
    ui.ButtonSet.OK
  );
}

/**
 * Membuat tepat satu alat untuk pelanggan. Device token ditampilkan satu kali.
 */
function assignDeviceToCustomerFromEditor() {
  const ui = SpreadsheetApp.getUi();

  const customerResponse = ui.prompt(
    "Hubungkan Perangkat",
    "Masukkan Customer ID, misalnya CUS-XXXXXXXXXX.",
    ui.ButtonSet.OK_CANCEL
  );
  if (customerResponse.getSelectedButton() !== ui.Button.OK) return;

  const nameResponse = ui.prompt("Nama Perangkat", "Masukkan nama alat.", ui.ButtonSet.OK_CANCEL);
  if (nameResponse.getSelectedButton() !== ui.Button.OK) return;

  const typeResponse = ui.prompt("Jenis Perangkat", "Contoh: ESP32 + Sensor Energi.", ui.ButtonSet.OK_CANCEL);
  if (typeResponse.getSelectedButton() !== ui.Button.OK) return;

  const locationResponse = ui.prompt("Lokasi Perangkat", "Masukkan lokasi alat.", ui.ButtonSet.OK_CANCEL);
  if (locationResponse.getSelectedButton() !== ui.Button.OK) return;

  const created = createDevice_({
    customerId: String(customerResponse.getResponseText() || "").trim(),
    deviceName: String(nameResponse.getResponseText() || "").trim(),
    deviceType: String(typeResponse.getResponseText() || "").trim(),
    location: String(locationResponse.getResponseText() || "").trim()
  });

  ui.alert(
    "Perangkat berhasil ditautkan",
    "Device ID: " + created.deviceId +
    "\nCustomer ID: " + created.customerId +
    "\n\nDEVICE TOKEN (salin sekarang ke firmware ESP32):\n" + created.deviceToken +
    "\n\nToken tidak dapat ditampilkan ulang.",
    ui.ButtonSet.OK
  );
}

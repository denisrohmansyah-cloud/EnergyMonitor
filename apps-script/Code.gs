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
    .addItem("Atur API Key Backend", "configureBackendApiKey")
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
  const latest = device ? getLatestMeasurement_(device.device_id) : null;
  const energyTodayKwh = device ? getTodayEnergyForDevice_(device.device_id) : 0;

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
      status: device.status,
      last_seen: device.last_seen
    } : null,
    latestMeasurement: latest,
    energyTodayKwh: energyTodayKwh
  };
}

/**
 * Menghitung konsumsi hari ini dari selisih meter energi kumulatif.
 * Jika belum ada pembacaan sebelum hari ini, baseline memakai pembacaan
 * pertama hari ini sehingga nilai awal tidak dianggap sebagai konsumsi hari ini.
 */
function getTodayEnergyForDevice_(deviceId) {
  const rows = getObjects_(getSheet_(EM_CONFIG.SHEETS.MEASUREMENTS))
    .filter(function(row) {
      return String(row.device_id) === String(deviceId);
    })
    .sort(function(a, b) {
      return new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime();
    });

  if (!rows.length) return 0;

  const todayKey = Utilities.formatDate(
    new Date(),
    "Asia/Jakarta",
    "yyyy-MM-dd"
  );

  const todayRows = rows.filter(function(row) {
    return Utilities.formatDate(
      new Date(row.measured_at),
      "Asia/Jakarta",
      "yyyy-MM-dd"
    ) === todayKey;
  });

  if (!todayRows.length) return 0;

  const firstToday = Number(todayRows[0].energy_kwh || 0);
  const latestToday = Number(todayRows[todayRows.length - 1].energy_kwh || 0);

  return Math.max(0, latestToday - firstToday);
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
  const device = findObject_(EM_CONFIG.SHEETS.DEVICES, "customer_id", customerId);

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

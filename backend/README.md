# Energy Monitor Backend

Node.js + Express API for the Energy Monitor customer portal. Customer/device/measurement records remain in Google Sheets through the Apps Script data layer. This backend stores no copy of customer measurement data.

## Requirements

- Node.js 20 or newer
- Google Apps Script Web App deployed from `apps-script/Code.gs`
- The Google Sheet initialized with `setupEnergyMonitorDatabase()`
- Backend API key saved by Apps Script menu **Energy Monitor → Atur API Key Backend**

## Install locally

```bash
cd backend
npm install
cp .env.example .env
```

Fill all values in `.env`, then run:

```bash
npm run check
npm start
```

Health check: `GET http://localhost:3000/api/health`.

## Configure environment

- `FRONTEND_ORIGINS`: exact browser origin(s), comma separated.
- `SESSION_SECRET`: random secret, minimum 32 characters.
- `APPS_SCRIPT_URL`: deployed Apps Script Web App URL ending in `/exec`. The currently supplied deployment URL is:

  `https://script.google.com/macros/s/AKfycbzDZeJOBeWnavV33PAafw112D6HHv020XZMLd1Cs6pFSQT2ViIisZJKDHtir-Gn9QgVnw/exec`

  Change it if you create a new Apps Script deployment.
- `APPS_SCRIPT_API_KEY`: must match the Script Property value configured in Apps Script.
- `ADMIN_API_KEY`: separate random admin secret.
- `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none` when using HTTPS from GitHub Pages on a different site.

Do not commit `.env`. Keep the API keys and session secret in the hosting provider's environment-variable settings.

## Authentication flow

1. Customer enters username and password in the GitHub Pages login.
2. Backend fetches the username's password hash from Apps Script using the server-only API key.
3. Backend verifies the password with bcrypt.
4. Backend sets a signed, HttpOnly session cookie.
5. `GET /api/auth/me` verifies the cookie and returns only the customer's own profile, assigned single device, latest reading, and CSRF token.
6. Dashboard and history endpoints derive the customer ID from that signed session. The browser cannot choose a customer ID to read.

The session cookie has a limited lifetime from `SESSION_TTL_SECONDS`. Logout clears the browser cookie. A stolen signed cookie remains valid until expiry, so use HTTPS and a modest lifetime; rotate `SESSION_SECRET` to invalidate all sessions.

## Admin API

All admin endpoints require the header `X-Admin-API-Key` equal to `ADMIN_API_KEY`.

Create a customer:

```http
POST /api/admin/customers
X-Admin-API-Key: <admin secret>
Content-Type: application/json

{
  "username": "pelanggan01",
  "password": "use-a-strong-unique-password",
  "fullName": "Nama Pelanggan",
  "email": "opsional@example.com",
  "location": "Lokasi pemasangan",
  "tariffPerKwh": 1444.7
}
```

Create the customer's one device:

```http
POST /api/admin/customers/CUS-XXXXXXXXXX/device
X-Admin-API-Key: <admin secret>
Content-Type: application/json

{
  "deviceName": "Energy Meter Rumah",
  "deviceType": "ESP32 + Sensor Energi",
  "location": "Rumah"
}
```

The response contains a one-time `deviceToken`. Save it to that ESP32's firmware securely. The token's hash, not the raw token, is stored in Google Sheets.

## ESP32 measurement payload

Send to `POST /api/device/measurements` over HTTPS:

```json
{
  "deviceId": "EM-XXXXXXXXXX",
  "deviceToken": "<one-time-provisioned-device-token>",
  "measuredAt": "2026-11-17T08:00:00+07:00",
  "voltage": 220.5,
  "current": 1.25,
  "activePower": 275,
  "energy": 12.345,
  "frequency": 50,
  "powerFactor": 0.98,
  "temperature": 29.5,
  "humidity": 65,
  "rssi": -62
}
```

Required electrical values are voltage, current, activePower, energy, frequency, and powerFactor. Temperature, humidity, and RSSI are optional.

## Deployment notes

Deploy this backend to a Node.js hosting service with HTTPS and persistent environment variables. Set `FRONTEND_ORIGINS` to the exact GitHub Pages origin and `COOKIE_SECURE=true`. For cross-site access, set `COOKIE_SAME_SITE=none`; browsers may restrict third-party cookies. For reliable customer login, a custom domain for the frontend and API under the same registrable domain is recommended.

GitHub Pages is static hosting and cannot run this API. Do not publish this backend's `.env` file or expose the Apps Script API key in frontend code.

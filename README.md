# Energy Monitor — Portal Pelanggan

Portal monitoring energi listrik untuk pelanggan. Setiap akun pelanggan dipasangkan dengan tepat satu alat monitoring. Dashboard hanya dapat dibuka setelah autentikasi berhasil melalui backend API.

## Status proyek

**Frontend v1.2 — login UI dan route guard disiapkan.** Dashboard sekarang mengarahkan pengguna yang belum memiliki sesi ke halaman login. Namun autentikasi belum bisa digunakan sampai backend API tersedia dan dikonfigurasi. Tidak ada akun demo atau password yang ditanam di frontend.

## Google Sheets database (Apps Script)

The Google Apps Script data layer is located at [`apps-script/Code.gs`](apps-script/Code.gs). It targets the owner's Google Sheets file and creates the following tabs when you run `setupEnergyMonitorDatabase()`:

- `Customers`
- `Devices`
- `Measurements`
- `Settings`

To install it, open the spreadsheet, select **Extensions → Apps Script**, replace the editor's `Code.gs` contents with the repository file, save, and run `setupEnergyMonitorDatabase()` once. Review and authorize the requested spreadsheet permissions. Re-running setup preserves rows and refuses to overwrite unexpected header structures.

Then use the spreadsheet's **Energy Monitor → Atur API Key Backend** menu to store a long random shared key in Script Properties. Deploy Apps Script as a **Web app**, executing as the owner. The Node.js backend will call this data API with the key; never place that key in frontend JavaScript or share it with customers.

The Apps Script file is the Sheets data layer, not the customer login server. Customer login/session endpoints (`/auth/login`, `/auth/me`, `/auth/logout`) still belong to the Node.js backend. Login uses username and password; email is optional contact information. The backend must enforce authorization and always derive the customer/device scope from the authenticated session.

## File utama

```text
EnergyMonitor/
├── index.html
├── login.html
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   ├── auth-guard.js
│   ├── login.js
│   └── app.js
└── README.md
```

## Konfigurasi API

Edit `js/config.js` dan isi `API_BASE_URL` dengan URL backend API, termasuk prefix `/api`.

Contoh:

```js
window.ENERGY_MONITOR_CONFIG = {
  API_BASE_URL: "https://api.domain-anda.com/api"
};
```

Jangan masukkan password, API secret, token privat, atau kredensial database ke file frontend.

## Kontrak endpoint autentikasi yang dibutuhkan

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/auth/login` | Memvalidasi username dan password, lalu membuat sesi |
| GET | `/auth/me` | Mengembalikan profil pengguna dan satu perangkat yang ditautkan |
| POST | `/auth/logout` | Menghapus sesi login |

Login mengirim JSON `{ "username": "...", "password": "..." }`. Username bersifat unik dan tidak peka huruf besar/kecil; karakter yang diperbolehkan adalah huruf, angka, titik, garis bawah, dan tanda hubung (3-32 karakter). Email tetap dapat disimpan sebagai kontak, tetapi tidak digunakan untuk login. Server sebaiknya mengembalikan cookie sesi dengan atribut `HttpOnly; Secure; SameSite=None` bila frontend dan backend berada pada origin berbeda. Endpoint yang memakai cookie harus menerapkan perlindungan CSRF yang sesuai.

Endpoint `/auth/me` diharapkan mengembalikan data seperti:

```json
{
  "user": {
    "customer_id": "CUS-0001",
    "username": "pelanggan01",
    "full_name": "Nama Pelanggan",
    "email": "pelanggan@example.com",
    "location": "Instalasi Utama",
    "tariff_per_kwh": 1444.7,
    "device": {
      "device_id": "EM-001",
      "device_name": "Energy Meter",
      "device_type": "ESP32 + Sensor Energi",
      "location": "Instalasi Utama",
      "status": "online",
      "voltage": 220.8,
      "current": 2.34,
      "power": 510.7,
      "energy_today": 3.284,
      "energy_total": 184.296,
      "frequency": 50.02,
      "power_factor": 0.99,
      "last_seen": "2026-11-15T07:00:00Z"
    }
  }
}
```

## Keamanan akses pelanggan

- Satu akun pelanggan hanya dipasangkan dengan satu alat.
- Relasi akun dan perangkat harus disimpan di database.
- Backend wajib mengambil customer ID dari sesi login, bukan mempercayai ID yang dikirim browser.
- Semua endpoint data pengukuran wajib memfilter berdasarkan perangkat milik pengguna yang sedang login.
- Password disimpan dalam bentuk hash yang kuat di backend, bukan teks biasa.
- Endpoint login perlu rate limiting dan validasi input.
- CORS backend harus mengizinkan origin GitHub Pages yang tepat dan credentials; jangan gunakan wildcard origin bersama cookies.

**Penting:** route guard di frontend hanya mengatur navigasi. Ia bukan mekanisme keamanan data. Perlindungan sebenarnya harus diberlakukan di backend pada setiap endpoint privat. GitHub Pages hanya meng-host file statis dan tidak menjalankan autentikasi server-side.

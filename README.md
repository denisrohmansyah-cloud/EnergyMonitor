# Energy Monitor — Portal Pelanggan

Energy Monitor adalah website pemantauan energi listrik untuk pelanggan. Satu akun pelanggan dipasangkan dengan tepat satu alat monitoring ESP32. Setiap pelanggan hanya dapat melihat data alat yang tertaut ke akunnya.

## Arsitektur proyek

- Frontend: HTML, CSS, JavaScript, di-host melalui GitHub Pages.
- Backend: Node.js + Express, bertugas memvalidasi login, membuat sesi, dan mengatur akses data.
- Database: Google Sheets melalui Google Apps Script.
- Perangkat: ESP32 + sensor energi; interval pengiriman yang direncanakan adalah 60 detik.

~~~text
Pelanggan
  |
  v
GitHub Pages (login + dashboard)
  | HTTPS + HttpOnly session cookie
  v
Node.js / Express API
  | server-side API key
  v
Google Apps Script
  |
  v
Google Sheets
  +-- Customers
  +-- Devices
  +-- Measurements
  +-- Settings

ESP32 -- HTTPS + device token --> Node.js API --> Apps Script --> Measurements
~~~

## Struktur repository

~~~text
EnergyMonitor/
|-- index.html
|-- login.html
|-- css/
|   |-- style.css
|-- js/
|   |-- app.js
|   |-- auth-guard.js
|   |-- config.js
|   |-- login.js
|-- apps-script/
|   |-- Code.gs
|-- backend/
    |-- .env.example
    |-- .gitignore
    |-- package.json
    |-- README.md
    |-- src/
        |-- server.js
~~~

## Status implementasi

- [x] Frontend portal pelanggan untuk satu alat per akun.
- [x] Login username dan password pada frontend.
- [x] Route guard dashboard dan tombol logout.
- [x] Google Sheets schema: Customers, Devices, Measurements, Settings.
- [x] Apps Script: membuat pelanggan/perangkat, mencari hash username, menerima pengukuran, mengambil dashboard dan riwayat.
- [x] Backend Node.js: login bcrypt, sesi bertanda tangan dalam cookie HttpOnly, endpoint dashboard/history, admin provisioning, endpoint ingest ESP32.
- [x] Frontend dashboard menggunakan API dan tidak lagi menghasilkan data simulasi.
- [ ] Jalankan/migrasikan Apps Script di spreadsheet dan deploy Web App versi terbaru.
- [ ] Deploy backend Node.js pada hosting HTTPS dan isi environment variables.
- [ ] Isi URL backend pada js/config.js.
- [ ] Buat akun pelanggan dan kaitkan satu perangkat ESP32.
- [ ] Uji login, pemisahan data pelanggan, dan pengiriman data perangkat.

## 1. Google Sheets dan Apps Script

Spreadsheet yang digunakan:

[Energy Monitor Google Sheets](https://docs.google.com/spreadsheets/d/1syMXmoiHI3Z5qEqowWQeNwCziRbpHM8cDssWxY7maUQ/edit)

1. Buka Extensions → Apps Script.
2. Salin isi apps-script/Code.gs ke editor Apps Script.
3. Simpan, pilih fungsi setupEnergyMonitorDatabase, lalu tekan Run dan berikan izin.
4. Jalankan menu Energy Monitor → Atur API Key Backend dan masukkan random secret minimal 32 karakter.
5. Pilih Deploy → Manage deployments → Edit atau buat deployment baru.
6. Pilih tipe Web app, execute as Me, lalu atur akses agar backend dapat memanggilnya. Salin URL yang berakhiran /exec.
7. Simpan URL tersebut sebagai APPS_SCRIPT_URL dan secret yang sama sebagai APPS_SCRIPT_API_KEY pada environment backend.

Jika Apps Script sudah pernah di-deploy, perubahan Code.gs perlu dipublikasikan sebagai versi deployment baru agar endpoint getCustomerAuthByUsername dan ringkasan energi harian ikut aktif.

## 2. Backend Node.js

Baca backend/README.md.

Ringkasan langkah:

~~~bash
cd backend
npm install
cp .env.example .env
npm run check
npm start
~~~

Atur environment variables pada .env. Jangan commit file tersebut.

Endpoint penting:

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | /api/auth/login | Login username/password |
| GET | /api/auth/me | Verifikasi sesi pelanggan |
| POST | /api/auth/logout | Logout |
| GET | /api/dashboard | Snapshot alat pelanggan |
| GET | /api/history | Riwayat alat pelanggan |
| POST | /api/admin/customers | Admin membuat akun |
| POST | /api/admin/customers/:id/device | Admin mengaitkan satu alat |
| POST | /api/device/measurements | ESP32 mengirim pengukuran |

## 3. GitHub Pages dan frontend

Aktifkan GitHub Pages melalui Settings → Pages → Deploy from a branch → main → /(root).

Setelah backend online dengan HTTPS, ubah js/config.js:

~~~js
window.ENERGY_MONITOR_CONFIG = {
  API_BASE_URL: "https://URL-BACKEND-ANDA/api"
};
~~~

Origin frontend untuk CORS adalah:

~~~text
https://denisrohmansyah-cloud.github.io
~~~

Jika backend dan GitHub Pages berada pada site berbeda, cookie perlu Secure=true dan SameSite=None. Sebagian browser membatasi third-party cookies; untuk layanan pelanggan produksi, gunakan custom domain sehingga frontend dan API berada di bawah site yang sama bila memungkinkan.

## 4. Keamanan dan pembatasan data

- Password pelanggan di-hash menggunakan bcrypt pada backend.
- API key Apps Script dan admin key hanya berada di environment backend.
- Sesi pelanggan menggunakan cookie HttpOnly bertanda tangan dan berumur terbatas.
- ID pelanggan untuk endpoint dashboard/history selalu diambil dari sesi, bukan dari input browser.
- Google Sheets membatasi satu perangkat untuk setiap customer.
- Device token dibuat saat provisioning; hanya hash token yang disimpan di Sheets.
- Setiap endpoint pengukuran memverifikasi device token.
- HTTPS wajib digunakan untuk deployment publik.

Catatan: signed cookie yang dicuri tetap berlaku sampai masa kedaluwarsanya berakhir. Gunakan HTTPS, masa sesi pendek, dan rotasi SESSION_SECRET untuk membatalkan seluruh sesi. Untuk pencabutan sesi individual, tambahkan session store server-side.

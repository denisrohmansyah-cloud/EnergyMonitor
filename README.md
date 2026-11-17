# Energy Monitor — GitHub Pages + Google Apps Script

Website monitoring energi listrik untuk pelanggan. Seluruh source code dikelola di GitHub, frontend dipublikasikan lewat GitHub Pages, Apps Script menjadi backend/API, dan Google Sheets menjadi database. Tidak membutuhkan Node.js server, VPS, Render, atau Railway.

Setiap akun pelanggan hanya terhubung ke **satu perangkat ESP32**. Dashboard dan riwayat selalu dibatasi berdasarkan sesi pelanggan.

## Arsitektur

~~~text
Pelanggan
   |
   v
GitHub Pages
Login + Dashboard + Analitik + Riwayat
   |
   | form POST tersembunyi ke iframe
   | postMessage untuk respons
   v
Google Apps Script Web App (Code.gs)
Autentikasi + Session Cache + API
   |
   v
Google Sheets
Customers | Devices | Measurements | Settings

ESP32 -- HTTPS POST + device token --> Apps Script --> Measurements
~~~

Komunikasi browser menggunakan form POST ke iframe dan pesan balasan dari Apps Script. Pola ini menghindari kebutuhan CORS preflight biasa. Apps Script membatasi origin portal ke GitHub Pages proyek ini dan alamat localhost untuk pengembangan.

## Repository files

~~~text
EnergyMonitor/
|-- index.html
|-- login.html
|-- css/
|   |-- style.css
|-- js/
|   |-- config.js
|   |-- portal-api.js
|   |-- auth-guard.js
|   |-- login.js
|   |-- app.js
|-- apps-script/
|   |-- Code.gs
|-- README.md
~~~

## Google Sheets

Database: [Energy Monitor Spreadsheet](https://docs.google.com/spreadsheets/d/1syMXmoiHI3Z5qEqowWQeNwCziRbpHM8cDssWxY7maUQ/edit)

Empat tab database:
- Customers: customer_id, username, full_name, email, password_hash, status, location, tariff_per_kwh, created_at, updated_at.
- Devices: identitas perangkat, customer_id, device token hash, status, dan last_seen.
- Measurements: nilai pengukuran dan timestamp.
- Settings: interval, timezone, mata uang, dan konfigurasi.

## Setup Apps Script

1. Buka spreadsheet di atas.
2. Pilih **Extensions → Apps Script**.
3. Salin seluruh isi apps-script/Code.gs ke editor Code.gs.
4. Simpan project.
5. Jalankan setupEnergyMonitorDatabase() satu kali (atau ulangi dengan aman untuk memastikan kolom username tersedia). Berikan izin akses Google Sheets.
6. Muat ulang spreadsheet agar menu **Energy Monitor** tampil.
7. Deploy → **New deployment** → pilih **Web app**.
8. **Execute as:** Me.
9. **Who has access:** Anyone.
10. Deploy dan salin URL yang berakhiran /exec.

Apps Script deployment yang saat ini sudah diberikan untuk proyek:

~~~text
https://script.google.com/macros/s/AKfycbzDZeJOBeWnavV33PAafw112D6HHv020XZMLd1Cs6pFSQT2ViIisZJKDHtir-Gn9QgVnw/exec
~~~

Setelah perubahan Code.gs, buka **Deploy → Manage deployments → Edit → New version → Deploy**. URL /exec yang sama dapat dipertahankan bila deployment yang sama diedit.

## Membuat akun pelanggan

Di Google Sheets, gunakan menu **Energy Monitor → Tambah Pelanggan**. Isi username, nama, email opsional, lokasi, tarif, dan password awal. Password disimpan sebagai hash PBKDF2-SHA256 dengan salt dan pepper Script Properties; password asli tidak ditulis ke sheet.

Setelah pelanggan dibuat, gunakan **Energy Monitor → Hubungkan Perangkat**. Masukkan Customer ID lalu identitas alat. Script menghasilkan Device ID dan device token. **Salin device token saat dialog muncul** dan pasang ke firmware ESP32. Token aslinya tidak disimpan di sheet; hanya hash-nya yang disimpan. Satu pelanggan tidak bisa diberi perangkat kedua.

Berikan username dan password awal melalui saluran terpisah kepada pelanggan. Jangan menulis password pada kolom sheet atau repository.

## GitHub Pages

Aktifkan **Settings → Pages → Deploy from a branch → main → /(root)**.

URL website:

~~~text
https://denisrohmansyah-cloud.github.io/EnergyMonitor/
~~~

URL Apps Script sudah ditulis di js/config.js. URL tersebut bukan rahasia. Jangan pernah menaruh password, device token, atau API secret pada frontend.

## Integrasi ESP32

ESP32 mengirim data dengan HTTP POST JSON ke Apps Script /exec:

~~~json
{
  "action": "ingestMeasurement",
  "deviceId": "EM-DEVICE-ID",
  "deviceToken": "DEVICE_TOKEN_DARI_MENU",
  "measuredAt": "2026-11-17T09:00:00+07:00",
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
~~~

Kolom voltage, current, activePower, energy, frequency, dan powerFactor wajib diisi. Temperature, humidity, dan RSSI opsional. Interval yang direncanakan: 60 detik.

## Fitur portal

- Login username dan password.
- Dashboard satu alat untuk satu pelanggan.
- Real-time snapshot berdasarkan pengukuran terakhir.
- Grafik energi harian dan 7 hari (agregasi dilakukan Apps Script).
- Riwayat pengukuran terakhir hingga 1.000 catatan.
- Ekspor riwayat CSV.
- Logout dan sesi portal dengan batas waktu 2 jam.
- Status perangkat offline berdasarkan waktu pengukuran terakhir.

## Keamanan dan batasan

- Sesi disimpan dalam CacheService Apps Script dan token sisi browser berada di sessionStorage (hilang saat tab ditutup). Cache Google dapat menghapus data sebelum TTL; pelanggan mungkin perlu login lagi.
- Karena token sesi dapat diakses JavaScript halaman, hindari script pihak ketiga yang tidak dipercaya dan jangan menambahkan HTML tak tepercaya. Proteksi XSS sangat penting.
- Apps Script Web App harus dapat diakses untuk memproses login; password tetap diverifikasi di server Apps Script dan disimpan sebagai hash, bukan teks biasa.
- Rate limiting login diterapkan per username. Untuk penggunaan skala besar/risiko tinggi, gunakan penyedia autentikasi khusus dan database server-side.
- Device token hanya diberikan satu kali ketika perangkat dibuat dan harus dirahasiakan di firmware.
- Jangan membagikan API key opsional Apps Script atau device token melalui chat publik / repository.
- Pengguna harus login sebelum dashboard bisa diakses.

## Status implementasi

- [x] Frontend GitHub Pages.
- [x] Direct portal bridge GitHub Pages ↔ Apps Script.
- [x] Login username/password dan sesi pelanggan.
- [x] Pembatasan satu perangkat per pelanggan.
- [x] Dashboard, analitik, dan riwayat memakai data Google Sheets.
- [x] Alur admin Apps Script untuk membuat pelanggan dan memasangkan perangkat.
- [ ] Tempel Code.gs terbaru ke project Apps Script dan deploy versi terbaru.
- [ ] Uji login dari halaman GitHub Pages.
- [ ] Buat akun pelanggan pertama.
- [ ] Pasang device token pada ESP32 dan uji pengiriman pengukuran.

# Energy Monitor

Dashboard monitoring energi listrik berbasis web untuk banyak perangkat ESP32. Proyek ini berdiri sendiri dan tidak terhubung dengan sistem kWh-Ku.

## Status proyek

**Frontend v1.0 — mode demonstrasi.** Data pada dashboard saat ini dibuat secara simulasi di browser. Belum ada koneksi ke perangkat ESP32, API, atau database.

## Fitur frontend

- Dashboard gabungan untuk banyak perangkat.
- Parameter tegangan (V), arus (A), daya aktif (W), energi (kWh), frekuensi (Hz), dan power factor.
- Halaman monitoring per perangkat.
- Grafik konsumsi energi.
- Riwayat data dan ekspor CSV.
- Daftar perangkat dan penambahan perangkat simulasi.
- Pengaturan tarif listrik dan interval pembaruan.
- Tampilan responsif desktop dan ponsel.

## Struktur proyek

```text
EnergyMonitor/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
└── README.md
```

## Menjalankan secara lokal

Buka `index.html` di browser, atau jalankan server statis dari root repository:

```bash
python -m http.server 8000
```

Kemudian buka `http://localhost:8000`.

## Publikasi dengan GitHub Pages

1. Buka **Settings → Pages** pada repository.
2. Pada **Build and deployment**, pilih **Deploy from a branch**.
3. Pilih branch `main` dan folder `/ (root)`.
4. Klik **Save**.
5. Tunggu proses deployment selesai. URL website akan ditampilkan pada halaman Pages.

## Rencana arsitektur integrasi perangkat

Frontend GitHub Pages bersifat statis. Untuk menerima data dari beberapa ESP32, tahap backend perlu menyediakan API HTTPS dan database yang dapat diakses melalui internet.

Rencana alur data:

```text
ESP32 + sensor
     │ HTTPS / MQTT
     ▼
Backend API / MQTT Broker
     │
     ▼
Database
     │ REST API
     ▼
Energy Monitor (GitHub Pages)
```

Interval tampilan yang dipilih saat ini adalah 60 detik. Ketika terintegrasi, interval pengiriman sensor dan interval penyegaran dashboard sebaiknya diatur terpisah agar perangkat tidak mengirim data berlebihan.

**Catatan keamanan:** jangan menaruh API secret, token, kata sandi Wi-Fi, atau kredensial database pada JavaScript frontend atau repository publik.

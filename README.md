# Energy Monitor — Portal Pelanggan

Frontend portal monitoring energi listrik untuk pelanggan. **Setiap akun pelanggan dipasangkan dengan tepat satu alat monitoring.** Banyak pelanggan dapat menggunakan platform yang sama, tetapi setiap pelanggan hanya dapat melihat data dari alat yang ditautkan ke akunnya.

## Status saat ini

**Frontend v1.1 — demonstrasi UI.** Nilai kelistrikan dan profil pelanggan pada versi ini masih berupa data simulasi di browser. Login, autentikasi, pemetaan akun-ke-perangkat, backend API, dan database belum diimplementasikan.

## Konsep akses pelanggan

- Satu akun pelanggan memiliki satu alat monitoring.
- Pelanggan hanya melihat dashboard, data real-time, analitik, dan riwayat alat miliknya.
- Tidak tersedia menu untuk memilih, menambah, atau mengelola banyak alat dari sisi pelanggan.
- Pengaitan akun pelanggan dengan device ID dilakukan oleh backend/admin, bukan oleh JavaScript frontend.

## Fitur frontend

- Dashboard khusus pelanggan.
- Status dan identitas satu alat yang ditautkan ke akun.
- Parameter tegangan, arus, daya aktif, energi, frekuensi, dan power factor.
- Estimasi biaya berdasarkan tarif yang ditetapkan sistem.
- Grafik konsumsi energi.
- Riwayat pengukuran dan ekspor CSV.
- Profil pelanggan.
- Layout responsif untuk desktop dan ponsel.

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

Buka `index.html` di browser atau jalankan:

```bash
python -m http.server 8000
```

Kemudian buka `http://localhost:8000`.

## Publikasi GitHub Pages

Pada repository, buka **Settings → Pages**, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu klik **Save**.

## Arsitektur produksi yang disarankan

```text
Pelanggan A ─ Akun A ─ Device EM-A
                         │
Pelanggan B ─ Akun B ─ Device EM-B
                         │
ESP32 + sensor ─ HTTPS/MQTT ─ Backend API ─ Database
                                      │
                          autentikasi + otorisasi
                                      │
                          GitHub Pages frontend
```

Backend harus memvalidasi sesi pengguna dan mengambil `device_id` yang terikat pada akun dari database. Jangan mempercayai `customer_id` atau `device_id` yang dikirim bebas oleh browser. Setiap endpoint pembacaan data wajib memfilter berdasarkan akun yang sedang login agar pelanggan tidak dapat mengakses data pelanggan lain.

GitHub Pages hanya meng-host frontend statis; jangan menyimpan password, token rahasia, atau kredensial database di file JavaScript publik. Autentikasi dan pemisahan data wajib dilakukan di backend.

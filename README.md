# Energy Monitor — Portal Pelanggan

Portal monitoring energi listrik untuk pelanggan. Setiap akun pelanggan dipasangkan dengan tepat satu alat monitoring. Dashboard hanya dapat dibuka setelah autentikasi berhasil melalui backend API.

## Status proyek

**Frontend v1.2 — login UI dan route guard disiapkan.** Dashboard sekarang mengarahkan pengguna yang belum memiliki sesi ke halaman login. Namun autentikasi belum bisa digunakan sampai backend API tersedia dan dikonfigurasi. Tidak ada akun demo atau password yang ditanam di frontend.

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
| POST | `/auth/login` | Memvalidasi email dan password, lalu membuat sesi |
| GET | `/auth/me` | Mengembalikan profil pengguna dan satu perangkat yang ditautkan |
| POST | `/auth/logout` | Menghapus sesi login |

Login mengirim JSON `{ "email": "...", "password": "..." }`. Server sebaiknya mengembalikan cookie sesi dengan atribut `HttpOnly; Secure; SameSite=None` bila frontend dan backend berada pada origin berbeda. Endpoint yang memakai cookie harus menerapkan perlindungan CSRF yang sesuai.

Endpoint `/auth/me` diharapkan mengembalikan data seperti:

```json
{
  "user": {
    "customer_id": "CUS-0001",
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

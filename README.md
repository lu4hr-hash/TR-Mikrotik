<!-- MADE BY AI: -->
<!-- 1. Gemini 3.8 Flash (High) -->
<!-- 2. Claude Sonnet 4.6 (Thinking) -->
<!-- 3. Claude Opus 4.6 Thinking -->
<!-- 4. GPT OSS 120B (Medium) -->

# MikroTik REST API Web Dashboard

Aplikasi Web Dashboard modern untuk manajemen dan monitoring router **MikroTik RouterOS v7** melalui **REST API** menggunakan backend **Python (Flask)** serta antarmuka web modern dengan gaya **Glassmorphism (Transparan, Modern, dan Ergonomis)**.

Project ini dibuat untuk memenuhi ketentuan Tugas Rancang mata kuliah **Dasar Pemrograman Jaringan**.

---

## ✨ Fitur & Keunggulan

### 1. Kerangka Halaman Web (HTML)
- **Web Login**: Form login terintegrasi untuk autentikasi kredensial MikroTik (IP/Host, Port REST API, SSL Toggle, Username, Password) serta opsi **Mode Simulasi / Demo Lab** (sangat berguna jika router fisik belum terhubung saat presentasi/pengujian).
- **Web Dashboard**:
  - Kartu indikator real-time: Beban CPU (%), Utilisasi Memori RAM (MB & %), Ruang Penyimpanan Storage HDD (MB & %), dan Jumlah Interface Aktif / Total.
  - Grafik tren bandwidth traffic real-time (*Download Rx vs Upload Tx*).
  - Spesifikasi lengkap hardware & sistem (Identity, Model RouterBoard, Serial Number, Versi RouterOS, Uptime, Arsitektur CPU).
  - Tabel ringkasan cepat status interface jaringan.
- **Web Monitoring**:
  - *Traffic & Bandwidth*: Gauge visual kecepatan transfer per-interface (Rx/Tx Mbps atau Kbps).
  - *CPU & Memory History*: Grafik riwayat utilisasi CPU dan RAM seiring waktu (Chart.js).
  - *Active Connections*: Pemantauan koneksi firewall yang sedang aktif melewati router (TCP state, Protocol, Src/Dst IP & Port, Bytes).
  - *DHCP Leases Monitor*: Pemantauan real-time klien yang mendapatkan IP otomatis dari router.
  - *Router System Logs*: Stream log sistem MikroTik dengan fitur live filter dan pencarian instan.
- **Web Konfigurasi & Fitur Umum MikroTik**:
  - *IP Address Manager*: Menampilkan daftar IP, menambah alamat IP baru pada interface tertentu beserta komentar, dan menghapus IP.
  - *Interface Manager*: Melihat detail MAC address, MTU, status running, serta saklar (toggle) untuk mengaktifkan atau menonaktifkan interface.
  - *DHCP Server & IP Pool*: Pengelolaan DHCP server dan pembuatan IP Pool rentang alamat dinamis.
  - *DNS Settings*: Konfigurasi server DNS (misal: Cloudflare `1.1.1.1`, Google `8.8.8.8`), pengaturan *allow-remote-requests*, dan monitoring kapasitas cache DNS.
  - *Firewall Filter & NAT*: Pembuatan aturan Filter (input, forward, output) dan NAT (masquerade, dst-nat / port forwarding) serta penghapusan rule.
  - *System & Power Controls*: Pengubahan nama *Identity* router dan tombol konfirmasi *Reboot / Restart* router.
- **Hotspot & WiFi**:
  - Pemantauan pengguna hotspot yang sedang aktif (*Active Users*).
  - Manajemen akun pengguna voucher hotspot (*User Accounts*).

### 2. Desain Antarmuka (CSS)
- **Tema Terang Kristal (Light Mode)**: Menggunakan canvas kristal iridescent yang bersih (`#f8fafc` & `#f1f5f9`) dengan kontras tinggi midnight slate (`#0f172a`), nyaman dipandang lama dan tidak membuat mata lelah.
- **Transparan & Glass (Glassmorphism)**: Efek frosted crystal glass `backdrop-filter: blur(24px) saturate(190%)` dengan transparansi elegan pada seluruh kartu, tabel, modal, dan navbar.
- **Hologram (Iridescent Prismatic)**: Aksen kilau prisma spektral pada specular rim cards, active navigation, hologram glow badge, dan tombol gradien holografik.

### 3. Responsivitas & Dinamis (JavaScript)
- **Mendukung Semua Perangkat**: Tampilan otomatis menyesuaikan layar **Smartphone, PC, Laptop, Tablet, maupun iPad**.
- **Metode CRUD Penuh (Web Konfigurasi)**: Mendukung operasi **Create (Tambah)**, **Read (Tampil)**, **Update (Edit)**, dan **Delete (Hapus)** pada IP Address, DHCP Lease, IP Pool, Firewall Filter, Firewall NAT, dan Hotspot User dengan modal dialog interaktif.
- **Mobile Friendly**: Dilengkapi navigasi bawah (*Bottom Navigation Bar*) dan *off-canvas drawer* pada smartphone, serta tata letak multi-kolom fleksibel pada desktop.
- **Dinamis & Real-time**: Didukung **Chart.js** untuk grafik interaktif, pembaruan data otomatis (*live polling*) dengan opsi jeda atau interval 2s / 5s / 10s, dan notifikasi *toast* interaktif.

### 4. Komunikasi MikroTik via REST API (Python)
- Backend menggunakan **Python Flask** yang bertindak sebagai jembatan aman (*proxy client*) menuju endpoint REST API MikroTik RouterOS v7 (`/rest/...`).
- Penanganan otomatis sertifikat SSL (*self-signed certificate bypass*).
- Dilengkapi **Realistic Mock Simulator** otomatis saat memilih Mode Demo untuk demonstrasi tanpa kendala jaringan.

---

## 📋 Persyaratan Sistem

1. **Python 3.9+** terpasang di komputer.
2. **MikroTik RouterOS versi 7.1 atau yang lebih baru** (Fitur REST API resmi diperkenalkan pada RouterOS v7).

---

## 🛠️ Persiapan pada Router MikroTik

Pastikan layanan web REST API pada router Anda sudah aktif. Anda dapat mengaktifkannya melalui Winbox (*IP -> Services*) atau via Terminal MikroTik:

```routeros
# Aktifkan layanan REST API melalui HTTPS (Port 443)
/ip service enable www-ssl

# Atau jika ingin menggunakan HTTP biasa (Port 80)
/ip service enable www
```

*Catatan: Pastikan komputer Anda satu segmen jaringan (dapat melakukan ping) ke IP MikroTik.*

---

## 🚀 Cara Menjalankan

### Cara 1: Menggunakan Script Cepat (Windows)
Cukup klik dua kali pada file:
```
run.bat
```

### Cara 2: Manual via Terminal / PowerShell
1. Buka Terminal pada folder project ini:
   ```powershell
   # Install dependensi yang dibutuhkan
   pip install -r requirements.txt
   ```
2. Jalankan aplikasi web:
   ```powershell
   python app.py
   ```
3. Buka peramban (browser) Anda di:
   ```
   http://127.0.0.1:5000
   ```

---

## 💡 Cara Penggunaan

1. **Halaman Login**:
   - Masukkan **IP Router** (misal: `192.168.88.1`).
   - Masukkan **Port REST API** (`443` untuk HTTPS atau `80` untuk HTTP).
   - Masukkan **Username** dan **Password** admin MikroTik Anda.
   - *Tips*: Jika Anda sedang tidak terhubung langsung ke router fisik, centang **Mode Simulasi / Demo Lab** untuk langsung mencoba seluruh fitur dashboard dengan data interaktif.
   - Klik **Masuk Dashboard**.
2. **Navigasi**:
   - Gunakan sidebar di sebelah kiri (atau bottom navigation di smartphone) untuk berpindah antara menu **Dashboard**, **Monitoring**, **Konfigurasi**, dan **Hotspot**.
   - Atur kecepatan refresh data di pojok kanan atas (*Refresh 2s, 5s, 10s, atau Jeda*).
3. **Konfigurasi**:
   - Anda dapat menambah IP, menyalakan/mematikan interface, membuat NAT rule, atau mengatur DNS langsung dari antarmuka web.

---

## 📂 Struktur Direktori Proyek

```
TR Mikrotik/
│
├── app.py                      # Server Flask & Controller REST API
├── mikrotik_client.py          # Wrapper REST Client RouterOS v7 + Lab Mock Simulator
├── requirements.txt            # Dependensi Python (Flask, Requests, Urllib3)
├── run.bat                     # Script instan 1-klik untuk Windows
├── README.md                   # Dokumentasi lengkap
│
├── static/
│   ├── css/
│   │   └── style.css           # Glassmorphism, Modern, Ergonomis & Responsif CSS
│   └── js/
│       ├── api.js              # Modul komunikasi REST API client
│       └── app.js              # State UI, Chart.js Real-time, Polling & Event Handler
│
└── templates/
    └── index.html              # Kerangka Web HTML (Login, Dashboard, Monitoring, Config, Hotspot)
```

---

## 🎓 Informasi Akademik
- **Mata Kuliah**: Dasar Pemrograman Jaringan
- **Topik**: Tugas Rancang (TR) MikroTik REST API Web Dashboard

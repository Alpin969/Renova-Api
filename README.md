# RENOVA API

REST API backend untuk aplikasi RENOVA — sistem pemesanan dan manajemen laundry.
Implementasi backend ini disalin dari project **LaundryKu** tanpa mengubah
alur bisnis, struktur database, autentikasi, maupun aturan hak akses;
yang berubah hanya identitas/branding ke RENOVA.

## Teknologi

| Bagian | Dipakai |
|---|---|
| Runtime | Node.js 18 atau lebih baru |
| Framework | Express 5 |
| Database | PostgreSQL (Aiven) lewat driver `pg` |
| Bahasa | JavaScript CommonJS (`require`) |
| Autentikasi | JWT (`jsonwebtoken`) + hash password (`bcryptjs`) |
| Upload foto | `multer` |
| Keamanan | `helmet`, `cors`, `express-rate-limit` |

## Struktur folder

```text
Renova_Api/
├── server.js               # Titik masuk aplikasi
├── package.json
├── .env.example            # Contoh variabel environment (tanpa kredensial asli)
├── certs/.gitkeep          # Folder sertifikat CA (isi ca.pem tidak di-commit)
├── database/schema.sql     # Skema tabel users, services, orders
├── scripts/
│   ├── create-admin.js          # Membuat/menaikkan akun ADMIN
│   ├── tambah-kolom-pembayaran.js  # Menambah kolom pembayaran (aman diulang)
│   └── bersihkan-data-uji.js    # Membersihkan data uji (@laundryku.test)
└── src/
    ├── app.js              # Penyusunan aplikasi Express
    ├── config/             # env.js, database.js (pool PostgreSQL + SSL)
    ├── routes/             # health, auth, services, orders
    ├── controllers/        # auth, services, orders
    ├── middleware/         # auth, upload, notFound, errorHandler
    └── utils/              # jwt, validate, AppError, pgError
```

## Instalasi

```bash
npm install
```

## Konfigurasi environment

Salin `.env.example` menjadi `.env`, lalu isi nilainya. Berkas `.env`
**tidak pernah masuk Git** (lihat `.gitignore`).

| Variabel | Keterangan |
|---|---|
| `PORT` | Port server, contoh `3000` |
| `DB_HOST` | Host PostgreSQL Aiven |
| `DB_PORT` | Port PostgreSQL Aiven |
| `DB_NAME` | Nama database, contoh `renova` |
| `DB_USER` | User database, umumnya `avnadmin` |
| `DB_PASSWORD` | Kata sandi database |
| `DB_SSL_CA` | Lokasi CA Certificate Aiven, contoh `./certs/ca.pem` |
| `JWT_SECRET` | Kunci rahasia penanda tangan token |
| `JWT_EXPIRES_IN` | Masa berlaku token, contoh `1d` |

Dua berkas berikut **tidak pernah masuk Git**:

- `.env` — berisi kredensial database dan kunci JWT.
- `certs/ca.pem` — CA Certificate dari Aiven (minta ke pemilik database,
  jangan menyalin dari project lain ke repository).

Membuat `JWT_SECRET` acak yang kuat:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> Catatan: konfigurasi awal mengarah ke database kosong (`DB_NAME=renova`).
> Isi kredensial database RENOVA sendiri — jangan memakai database LaundryKu.

## Menjalankan server

```bash
npm start
```

Mode pengembangan (restart otomatis):

```bash
npm run dev
```

Server berjalan di `http://localhost:3000`.

## Struktur database

Skema ada di `database/schema.sql` dan berisi tiga tabel: `users`, `services`,
`orders`. Untuk menerapkannya ke database kosong:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

Berkas itu aman dijalankan berulang, termasuk pada database yang sudah berisi
data. Tabel dibuat bila belum ada, kolom pembayaran (`payment_method`,
`payment_status`, `paid_at`) ditambahkan bila belum ada, dan bagian
pemeriksaan di akhir berkas hanya membaca.

## Membuat akun admin

Registrasi lewat API hanya bisa membuat akun CUSTOMER. Itu disengaja: kalau
role boleh dikirim dari body permintaan, siapa pun bisa mendaftar sebagai
ADMIN. Akun admin dibuat lewat skrip:

```bash
npm run create-admin -- "Nama Admin" admin@renova.test "KataSandi123"
```

Kalau email tersebut sudah terdaftar, akunnya dinaikkan menjadi ADMIN dan
kata sandinya diperbarui.

## Daftar endpoint REST API

### Publik (tanpa login)

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/` | Memastikan API berjalan |
| GET | `/api/health` | Kondisi server |
| GET | `/api/health/db` | Uji koneksi database |
| POST | `/api/auth/register` | Daftar akun baru (role CUSTOMER) |
| POST | `/api/auth/login` | Masuk dan dapatkan token |
| GET | `/api/services` | Daftar layanan (bisa `?search=`) |
| GET | `/api/services/:id` | Detail satu layanan |

### Perlu login

Sertakan header `Authorization: Bearer <token>`.

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/auth/me` | Data akun yang sedang masuk |
| PATCH | `/api/auth/me` | Ubah nama dan/atau kata sandi sendiri |
| POST | `/api/orders` | Buat pesanan (khusus CUSTOMER), boleh menyertakan `payment_method` |
| GET | `/api/orders` | Daftar pesanan (bisa `?status=` dan `?limit=`) |
| GET | `/api/orders/:id` | Detail pesanan |
| PATCH | `/api/orders/:id/batal` | Batalkan pesanan |
| PATCH | `/api/orders/:id/foto` | Unggah foto (`multipart/form-data`, field `photo`) |
| DELETE | `/api/orders/:id/foto` | Hapus foto pesanan |

Customer hanya melihat pesanannya sendiri. Admin melihat semua pesanan.

### Khusus ADMIN

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/services` | Tambah layanan |
| PUT | `/api/services/:id` | Ubah layanan |
| DELETE | `/api/services/:id` | Hapus layanan |
| PATCH | `/api/orders/:id/status` | Ubah status pesanan |
| PATCH | `/api/orders/:id/berat-asli` | Isi berat asli, harga akhir dihitung otomatis |
| PATCH | `/api/orders/:id/bayar` | Konfirmasi pembayaran tunai sudah diterima |

Metode pembayaran: `CASH`, `QRIS`, `BANK_TRANSFER`, `EWALLET`. Tunai dicatat
`UNPAID` sampai admin mengonfirmasinya lewat `/bayar`, sedangkan metode lain
langsung dicatat `PAID` saat pesanan dibuat karena pembayarannya masih
simulasi.

## Contoh request dan response

Register:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Budi","email":"budi@mail.com","password":"KataSandi123"}'
```

```json
{
  "success": true,
  "message": "Registrasi berhasil. Simpan token ini untuk mengakses API.",
  "data": {
    "user": { "id": 1, "name": "Budi", "email": "budi@mail.com", "role": "CUSTOMER" },
    "token": "<jwt>"
  }
}
```

Buat pesanan (perlu login):

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"service_id":1,"estimated_weight":2.5,"payment_method":"QRIS"}'
```

Response yang gagal:

```json
{
  "success": false,
  "message": "Penjelasan yang bisa dibaca pengguna",
  "error": "KODE_ERROR"
}
```

Kode HTTP yang dipakai: `200` berhasil, `201` data dibuat, `400` data tidak
sesuai aturan, `401` belum login atau token tidak sah, `403` tidak punya hak,
`404` data tidak ada, `409` bentrok dengan keadaan data saat ini,
`429` terlalu banyak percobaan, `500` kesalahan server, `503` database belum
siap.

## Autentikasi dan role

- Password disimpan sebagai hash bcrypt, tidak pernah sebagai teks biasa.
- `password_hash` tidak pernah ikut dikirim ke client.
- Token JWT berisi id dan role; datanya dibaca ulang dari database pada setiap
  permintaan, jadi akun yang dihapus langsung tidak bisa dipakai lagi.
- Role `CUSTOMER`: membuat dan melihat pesanannya sendiri, membatalkan
  pesanannya selama masih `PENDING_CONFIRMATION`/`CONFIRMED`.
- Role `ADMIN`: mengelola layanan, mengubah status dan berat asli pesanan,
  mengonfirmasi pembayaran tunai, membatalkan pesanan siapa pun sebelum selesai.

## Alur status pesanan

```text
PENDING_CONFIRMATION -> CONFIRMED -> WASHING -> READY_FOR_PICKUP -> COMPLETED
        |                                    |
        +--------------> CANCELLED <---------+
```

Pesanan hanya bisa menjadi `COMPLETED` setelah berat asli diisi dan
pembayaran lunas.

## Menjalankan pengujian

Project ini belum memiliki suite test otomatis. Pengujian dilakukan manual:

1. `GET /` dan `GET /api/health` — server hidup.
2. `GET /api/health/db` — `200` bila database terhubung, `503` bila belum.
3. Register → login → `GET /api/auth/me` memakai token.
4. CRUD layanan sebagai ADMIN; pastikan CUSTOMER mendapat `403`.
5. Buat pesanan sebagai CUSTOMER, ubah status dan isi berat asli sebagai ADMIN.
6. Unggah/hapus foto pesanan (`multipart/form-data`, field `photo`, maks 2 MB).

Jangan memakai database produksi untuk pengujian. Uji hapus hanya pada data uji.

## Branch GitHub

Repository: `https://github.com/Alpin969/Renova-Api.git`

- `main` — kode yang sudah diperiksa dan lolos pengujian. Jangan kembangkan
  langsung di sini.
- `feature/backend` — branch kerja: penyalinan, penyesuaian konfigurasi,
  pemeriksaan, dan pengujian dilakukan di sini, lalu di-merge ke `main`
  setelah semuanya hijau.

## Catatan keamanan

- Semua query memakai parameter (`$1`, `$2`), sehingga aman dari SQL Injection.
- Koneksi database memakai SSL dengan CA Certificate dan
  `rejectUnauthorized: true`.
- Endpoint register dan login dibatasi 20 percobaan per 15 menit per alamat IP.
- Nama berkas foto dibuat acak oleh server; nama dari pengguna tidak dipakai.

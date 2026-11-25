// Memuat environment variable dari file backend/.env dan menyusunnya menjadi
// satu objek konfigurasi.
//
// Konfigurasi dibaca sekali saat aplikasi dijalankan (bukan setiap ada request),
// supaya kesalahan seperti PORT yang bukan angka langsung terlihat di awal.
const path = require('path');
const dotenv = require('dotenv');

// __dirname = backend/src/config, jadi '../../.env' = backend/.env
// Path ditulis absolut agar .env tetap terbaca walaupun server dijalankan
// dari folder lain.
const ENV_FILE_PATH = path.resolve(__dirname, '../../.env');

const loadResult = dotenv.config({ path: ENV_FILE_PATH, quiet: true });

if (loadResult.error) {
  console.warn(
    `[config] Berkas .env tidak ditemukan di ${ENV_FILE_PATH}. ` +
      'Salin .env.example menjadi .env lalu isi nilainya.'
  );
}

// parseInt selalu mengembalikan NaN bila nilainya tidak masuk akal,
// sehingga nilai cadangan lebih aman daripada angka yang salah.
function toNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3000),

  db: {
    host: process.env.DB_HOST || '',
    port: toNumber(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    sslCa: process.env.DB_SSL_CA || '',
  },

  // Belum dipakai pada tahap ini. Disiapkan agar endpoint login
  // pada tahap berikutnya tinggal membaca dari sini.
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
};

module.exports = env;

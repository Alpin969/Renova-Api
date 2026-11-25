// Koneksi PostgreSQL (Aiven) menggunakan connection pool dari package "pg".
//
// Aturan penting yang dipakai berkas ini:
// 1. Semua kredensial dibaca dari environment (.env), tidak pernah ditulis di kode.
// 2. Koneksi WAJIB memakai SSL dengan CA Certificate dari Aiven dan
//    rejectUnauthorized: true, supaya sertifikat server benar-benar diverifikasi.
// 3. Satu Pool dibuat sekali untuk seluruh umur proses, bukan per request.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const env = require('./env');

// Nilai contoh pada .env.example diawali "YOUR_" (mis. YOUR_AIVEN_HOST).
// Nilai seperti itu belum diisi pengguna, jadi dianggap belum dikonfigurasi.
const PLACEHOLDER_PREFIX = 'YOUR_';

// Query pembanding untuk menguji koneksi (dipakai GET /api/health/db).
const CONNECTION_CHECK_QUERY =
  'SELECT current_database() AS database, current_user AS username, NOW() AS server_time;';

// DB_SSL_CA ditulis relatif terhadap folder backend ("./certs/ca.pem"),
// sedangkan berkas ini berada di backend/src/config, jadi perlu dua tingkat ke atas.
const caFilePath = env.db.sslCa
  ? path.resolve(__dirname, '../../', env.db.sslCa)
  : '';

function isPlaceholder(value) {
  return value.trim().toUpperCase().startsWith(PLACEHOLDER_PREFIX);
}

// Mengumpulkan nama variabel yang masih kosong / belum diisi.
// Yang dikumpulkan hanya NAMA variabel, bukan nilainya, dan tanpa path berkas
// di server — daftar ini ikut dikirim ke response HTTP.
function findMissingSettings() {
  const missing = [];

  if (!env.db.host || isPlaceholder(env.db.host)) missing.push('DB_HOST');
  if (!env.db.name || isPlaceholder(env.db.name)) missing.push('DB_NAME');
  if (!env.db.user || isPlaceholder(env.db.user)) missing.push('DB_USER');
  if (!env.db.password || isPlaceholder(env.db.password)) missing.push('DB_PASSWORD');

  // DB_SSL_CA dianggap siap hanya bila sudah diisi DAN berkasnya benar-benar ada.
  // Tanpa pemeriksaan berkas, server akan gagal start saat mencoba membacanya.
  const caReady =
    Boolean(env.db.sslCa) && !isPlaceholder(env.db.sslCa) && fs.existsSync(caFilePath);

  if (!caReady) missing.push('DB_SSL_CA');

  return missing;
}

// Keterangan tambahan KHUSUS untuk log di server: bila DB_SSL_CA sudah diisi
// tetapi berkas CA-nya tidak ada, pengguna perlu tahu path yang dicari.
// Path lokal tidak pernah dikirim ke response HTTP.
function caTroubleshootingNote() {
  if (!env.db.sslCa || isPlaceholder(env.db.sslCa)) return '';
  if (fs.existsSync(caFilePath)) return '';
  return ` Berkas CA untuk DB_SSL_CA tidak ditemukan di ${caFilePath}.`;
}

const missingSettings = findMissingSettings();
const isConfigured = missingSettings.length === 0;

// Error khusus supaya pemanggil bisa membedakan "belum diisi" dari "gagal konek".
class DatabaseNotConfiguredError extends Error {
  constructor(missing) {
    super(`Konfigurasi database belum lengkap: ${missing.join(', ')}`);
    this.name = 'DatabaseNotConfiguredError';
    this.code = 'DATABASE_NOT_CONFIGURED';
    this.missingSettings = missing;
  }
}

let pool = null;

if (isConfigured) {
  pool = new Pool({
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    user: env.db.user,
    password: env.db.password,
    // Sertifikat Aiven diverifikasi sungguhan (bukan rejectUnauthorized: false).
    ssl: {
      ca: fs.readFileSync(caFilePath, 'utf8'),
      rejectUnauthorized: true,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    // Tanpa batas ini, query bisa menggantung selamanya bila server tidak merespons.
    connectionTimeoutMillis: 10000,
  });

  // Koneksi idle yang mati (mis. diputus jaringan) harus ditangani,
  // kalau tidak proses Node akan berhenti dengan error yang membingungkan.
  pool.on('error', (error) => {
    console.error('[db] Koneksi idle bermasalah:', error.message);
  });
} else {
  console.warn(
    `[db] Konfigurasi PostgreSQL belum lengkap: ${missingSettings.join(', ')}.` +
      caTroubleshootingNote() +
      ' Server tetap berjalan, tetapi endpoint yang memakai database akan menjawab HTTP 503.'
  );
}

// Selalu memakai parameterized query ($1, $2, ...) agar aman dari SQL Injection.
async function query(text, params) {
  if (!pool) {
    throw new DatabaseNotConfiguredError(missingSettings);
  }
  return pool.query(text, params);
}

// Mengembalikan satu baris berisi database, username, dan waktu server.
async function ping() {
  const result = await query(CONNECTION_CHECK_QUERY);
  return result.rows[0];
}

// Informasi status konfigurasi, tanpa pernah membocorkan nilai kredensial.
function getDatabaseStatus() {
  return {
    configured: isConfigured,
    missingSettings,
    ssl: isConfigured ? 'TLS dengan verifikasi CA (rejectUnauthorized: true)' : 'belum aktif',
  };
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  query,
  ping,
  getDatabaseStatus,
  closePool,
  DatabaseNotConfiguredError,
};

// Kumpulan pemeriksa data masukan sederhana.
//
// Semua fungsi di sini MELEMPAR AppError bila data tidak sesuai, sehingga
// controller tidak perlu menulis if-else berlapis. Errornya kemudian
// ditangkap centralized error handler di src/middleware/errorHandler.js.
const AppError = require('./AppError');

// Dianggap belum diisi: undefined, null, atau teks kosong/spasi.
function kosong(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

// Memastikan nilai berupa teks, lalu dipangkas spasi di awal/akhir.
function asString(value, field, opsi = {}) {
  const { min = 1, max = 255 } = opsi;

  if (typeof value !== 'string') {
    throw AppError.badRequest(`Kolom "${field}" harus berupa teks.`);
  }

  const hasil = value.trim();

  if (hasil.length < min) {
    throw AppError.badRequest(`Kolom "${field}" minimal ${min} karakter.`);
  }
  if (hasil.length > max) {
    throw AppError.badRequest(`Kolom "${field}" maksimal ${max} karakter.`);
  }

  return hasil;
}

// Email selalu disimpan dalam huruf kecil, supaya "Budi@mail.com" dan
// "budi@mail.com" dianggap sama. Database juga punya unique index pada
// LOWER(email), jadi aturan ini sejalan dengan skema.
function asEmail(value, field = 'email') {
  const hasil = asString(value, field, { min: 3, max: 100 });

  // Pola sederhana: ada teks, tanda @, teks, titik, dan domain.
  const pola = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pola.test(hasil)) {
    throw AppError.badRequest(`Kolom "${field}" bukan alamat email yang valid.`);
  }

  return hasil.toLowerCase();
}

// Angka biasa (boleh pecahan). Menerima number maupun teks angka,
// karena nilai dari query string selalu berupa teks.
function asNumber(value, field, opsi = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, label = null } = opsi;

  if (kosong(value)) {
    throw AppError.badRequest(`Kolom "${field}" wajib diisi.`);
  }

  const hasil = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(hasil)) {
    throw AppError.badRequest(`Kolom "${field}" harus berupa angka.`);
  }
  if (hasil < min) {
    throw AppError.badRequest(`Kolom "${field}" minimal ${label || min}.`);
  }
  if (hasil > max) {
    throw AppError.badRequest(`Kolom "${field}" maksimal ${label || max}.`);
  }

  return hasil;
}

// Bilangan bulat, dipakai untuk id.
function asInteger(value, field, opsi = {}) {
  const hasil = asNumber(value, field, opsi);

  if (!Number.isInteger(hasil)) {
    throw AppError.badRequest(`Kolom "${field}" harus berupa bilangan bulat.`);
  }

  return hasil;
}

// Nilai yang harus salah satu dari daftar tertentu, mis. role atau status.
function asEnum(value, field, daftar) {
  if (typeof value !== 'string' || !daftar.includes(value)) {
    throw AppError.badRequest(`Kolom "${field}" harus salah satu dari: ${daftar.join(', ')}.`);
  }

  return value;
}

// Id pada URL (:id) selalu berupa teks, jadi dikonversi sekaligus diperiksa.
// Batas atasnya mengikuti tipe kolom INTEGER di PostgreSQL.
function asId(value, field = 'id') {
  return asInteger(value, field, { min: 1, max: 2147483647 });
}

// Hanya memakai nilai yang benar-benar dikirim, untuk keperluan update
// sebagian (PATCH). Bila field tidak ada di body, hasilnya undefined.
function opsional(pemeta, key) {
  return pemeta === undefined || pemeta === null ? undefined : pemeta[key];
}

module.exports = {
  kosong,
  asString,
  asEmail,
  asNumber,
  asInteger,
  asEnum,
  asId,
  opsional,
};

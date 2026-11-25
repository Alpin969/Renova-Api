// Penerjemah kode error PostgreSQL menjadi pesan yang ramah pengguna.
//
// Tanpa ini, error database mentah seperti
//   "duplicate key value violates unique constraint \"uq_users_email_lower\""
// akan ikut terkirim ke client: membingungkan pengguna dan membocorkan
// nama tabel serta constraint.
//
// Daftar kode resmi PostgreSQL:
//   https://www.postgresql.org/docs/current/errcodes-appendix.html
const AppError = require('./AppError');

const PETA_KODE = {
  // unique_violation
  23505: () =>
    AppError.conflict('Data tersebut sudah ada.', 'DUPLICATE_VALUE'),

  // foreign_key_violation
  23503: () =>
    AppError.conflict(
      'Data ini masih dipakai oleh data lain, sehingga belum bisa diubah atau dihapus.',
      'FOREIGN_KEY_VIOLATION'
    ),

  // restrict_violation - kode yang dipakai PostgreSQL untuk pelanggaran
  // ON DELETE RESTRICT. Tanpa pemetaan ini, penghapusan data yang masih
  // dipakai menjawab HTTP 500 dan kode mentahnya ikut terkirim ke client.
  '23001': () =>
    AppError.conflict(
      'Data ini masih dipakai oleh data lain, sehingga belum bisa dihapus.',
      'DATA_IN_USE'
    ),

  // not_null_violation
  23502: () =>
    AppError.badRequest('Ada kolom wajib yang belum diisi.', 'MISSING_VALUE'),

  // check_violation
  23514: () =>
    AppError.badRequest(
      'Data yang dikirim melanggar aturan database.',
      'CONSTRAINT_VIOLATION'
    ),

  // invalid_text_representation, mis. "abc" dikirim untuk kolom angka
  '22P02': () =>
    AppError.badRequest('Format data tidak sesuai.', 'INVALID_INPUT'),

  // numeric_value_out_of_range
  '22003': () =>
    AppError.badRequest('Nilai angka terlalu besar atau terlalu kecil.', 'NUMBER_OUT_OF_RANGE'),
};

// Mengembalikan AppError bila kodenya dikenali, atau null bila bukan.
function terjemahkan(error) {
  if (!error || typeof error.code !== 'string') return null;

  const buat = PETA_KODE[error.code];
  if (!buat) return null;

  return buat(error);
}

// Pesan khusus untuk constraint tertentu, supaya pengguna tahu persis
// bagian mana yang salah.
//
// PENTING: kunci di bawah harus SAMA PERSIS dengan nama constraint di
// database (lihat database/schema.sql). Bila namanya tidak cocok,
// pesan khusus ini tidak akan pernah muncul dan pengguna hanya menerima
// pesan umum dari PETA_KODE di atas.
const PESAN_CONSTRAINT = {
  // users
  uq_users_email_lower: 'Email tersebut sudah terdaftar.',
  chk_users_role: 'Role harus ADMIN atau CUSTOMER.',
  chk_users_name_not_empty: 'Nama tidak boleh kosong.',
  chk_users_email_not_empty: 'Email tidak boleh kosong.',

  // services
  chk_services_name_not_empty: 'Nama layanan tidak boleh kosong.',
  chk_services_price_positive: 'Harga per kg harus lebih besar dari 0.',
  chk_services_duration_not_empty: 'Durasi layanan tidak boleh kosong.',

  // orders
  chk_orders_estimated_weight_positive: 'Perkiraan berat harus lebih besar dari 0.',
  chk_orders_actual_weight_positive: 'Berat asli harus lebih besar dari 0.',
  chk_orders_price_positive: 'Harga per kg pesanan harus lebih besar dari 0.',
  chk_orders_total_and_actual_weight:
    'Berat asli dan harga akhir pesanan harus diisi bersama-sama.',
  chk_orders_status: 'Status pesanan tidak dikenali.',
  chk_orders_payment_method:
    'Metode pembayaran harus salah satu dari: CASH, QRIS, BANK_TRANSFER, EWALLET.',
  chk_orders_payment_status: 'Status pembayaran harus UNPAID atau PAID.',
  chk_orders_paid_at:
    'Waktu pembayaran hanya boleh diisi untuk pesanan yang sudah lunas.',
};

function terjemahkanDenganConstraint(error) {
  if (error && error.code === '23505' && PESAN_CONSTRAINT[error.constraint]) {
    return AppError.conflict(PESAN_CONSTRAINT[error.constraint], 'DUPLICATE_VALUE');
  }

  if (error && error.code === '23514' && PESAN_CONSTRAINT[error.constraint]) {
    return AppError.badRequest(PESAN_CONSTRAINT[error.constraint], 'CONSTRAINT_VIOLATION');
  }

  return terjemahkan(error);
}

module.exports = {
  terjemahkan,
  terjemahkanDenganConstraint,
};

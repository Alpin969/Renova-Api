// Pemeriksaan identitas pemakai API berdasarkan token JWT.
//
// Dua middleware:
//   authenticate  - memastikan permintaan membawa token yang sah, lalu
//                   menempelkan data user ke req.user.
//   requireRole   - membatasi endpoint hanya untuk role tertentu (mis. ADMIN).
//
// Urutannya selalu: authenticate dulu, baru requireRole.
const { query } = require('../config/database');
const { periksaToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
      throw AppError.unauthorized(
        'Token tidak ditemukan. Sertakan header "Authorization: Bearer <token>".',
        'TOKEN_MISSING'
      );
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw AppError.unauthorized('Token kosong.', 'TOKEN_MISSING');
    }

    let isiToken;
    try {
      isiToken = periksaToken(token);
    } catch (error) {
      // JWT_NOT_CONFIGURED harus dibedakan dari token yang memang salah.
      if (error.code === 'JWT_NOT_CONFIGURED') throw error;

      if (error.name === 'TokenExpiredError') {
        throw AppError.unauthorized(
          'Token sudah kedaluwarsa. Silakan login kembali.',
          'TOKEN_EXPIRED'
        );
      }

      throw AppError.unauthorized('Token tidak sah.', 'TOKEN_INVALID');
    }

    // Data user dibaca ulang dari database pada setiap permintaan.
    // Alasannya: kalau akun dihapus atau role-nya diubah, token lama yang
    // masih berlaku tidak bisa dipakai untuk mengakses data yang seharusnya
    // sudah tidak boleh. Token hanya menyimpan identitas, bukan hak akses.
    const hasil = await query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1;',
      [isiToken.sub]
    );

    if (hasil.rowCount === 0) {
      throw AppError.unauthorized(
        'Akun pada token ini sudah tidak ada. Silakan login kembali.',
        'ACCOUNT_NOT_FOUND'
      );
    }

    req.user = hasil.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

// Pemakaian: requireRole('ADMIN') atau requireRole('ADMIN', 'CUSTOMER').
function requireRole(...roleYangDiizinkan) {
  return function (req, res, next) {
    if (!req.user) {
      return next(
        AppError.unauthorized('Belum terautentikasi.', 'UNAUTHORIZED')
      );
    }

    if (!roleYangDiizinkan.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Endpoint ini hanya untuk role: ${roleYangDiizinkan.join(', ')}.`,
          'ROLE_NOT_ALLOWED'
        )
      );
    }

    next();
  };
}

module.exports = {
  authenticate,
  requireRole,
};

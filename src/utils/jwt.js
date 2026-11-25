// Pembuatan dan pemeriksaan token JWT.
//
// Kunci rahasia dibaca dari environment (JWT_SECRET) dan TIDAK PERNAH
// ditulis di dalam kode. Bila belum diisi, endpoint autentikasi menjawab
// HTTP 503 dengan penjelasan, bukan gagal dengan error yang membingungkan.
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const AppError = require('./AppError');

// Nilai contoh pada .env.example belum diisi, jadi dianggap belum siap.
const PLACEHOLDER = 'YOUR_SECURE_JWT_SECRET';

function siapDipakai() {
  return Boolean(env.jwt.secret) && env.jwt.secret.trim() !== PLACEHOLDER;
}

function pastikanSiap() {
  if (!siapDipakai()) {
    throw AppError.serviceUnavailable(
      'Fitur autentikasi belum aktif: isi JWT_SECRET pada berkas .env dengan nilai rahasia acak, lalu jalankan ulang server.',
      'JWT_NOT_CONFIGURED'
    );
  }
}

// Isi token sengaja sedikit saja: id user dan role.
// Data lain selalu dibaca ulang dari database saat request, sehingga
// perubahan nama/role langsung berlaku tanpa menunggu token kedaluwarsa.
function buatToken(user) {
  pastikanSiap();

  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

// Melempar error bila token tidak sah atau sudah kedaluwarsa.
function periksaToken(token) {
  pastikanSiap();
  return jwt.verify(token, env.jwt.secret);
}

module.exports = {
  siapDipakai,
  buatToken,
  periksaToken,
};

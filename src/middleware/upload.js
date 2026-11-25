// Penerimaan berkas gambar (foto pesanan) menggunakan multer.
//
// Batasan yang dipakai:
//   - hanya JPEG, PNG, dan WebP;
//   - ukuran maksimal 2 MB;
//   - satu berkas per permintaan;
//   - nama berkas dibuat acak, TIDAK memakai nama dari pengguna, sehingga
//     tidak bisa dipakai untuk menulis berkas ke luar folder uploads/.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const AppError = require('../utils/AppError');

// __dirname = backend/src/middleware, jadi '../../uploads' = backend/uploads
const FOLDER_UPLOAD = path.resolve(__dirname, '../../uploads');

// Folder dibuat sendiri saat server menyala, jadi tidak perlu ikut di-commit.
fs.mkdirSync(FOLDER_UPLOAD, { recursive: true });

const TIPE_DIIZINKAN = ['image/jpeg', 'image/png', 'image/webp'];

const EKSTENSI = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const penyimpanan = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FOLDER_UPLOAD),

  filename: (req, file, cb) => {
    // Nama berkas murni buatan server: waktu + angka acak + ekstensi
    // yang ditentukan dari tipe MIME. Nama asli dari pengguna diabaikan.
    const acak = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${acak}${EKSTENSI[file.mimetype]}`);
  },
});

function saringBerkas(req, file, cb) {
  if (!TIPE_DIIZINKAN.includes(file.mimetype)) {
    return cb(
      AppError.badRequest(
        'Format berkas harus JPEG, PNG, atau WebP.',
        'INVALID_FILE_TYPE'
      )
    );
  }

  cb(null, true);
}

const unggahFoto = multer({
  storage: penyimpanan,
  fileFilter: saringBerkas,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
});

// Menghapus berkas foto lama yang sudah tidak dipakai.
//
// Hanya berkas di dalam folder uploads/ yang boleh dihapus: nama berkas
// diambil dengan path.basename, sehingga nilai dari database tidak bisa
// dipakai untuk menghapus berkas lain, mis. "../../.env".
async function hapusFotoLama(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return;

  const namaBerkas = path.basename(photoUrl);
  const lokasi = path.join(FOLDER_UPLOAD, namaBerkas);

  // Pastikan hasil akhirnya benar-benar berada di dalam folder uploads.
  if (!lokasi.startsWith(FOLDER_UPLOAD)) return;

  try {
    await fs.promises.unlink(lokasi);
  } catch (error) {
    // Berkas sudah tidak ada -> bukan masalah, cukup diabaikan.
    // Kegagalan menghapus TIDAK boleh menggagalkan permintaan yang berhasil.
    if (error.code !== 'ENOENT') {
      console.error('[upload] Gagal menghapus foto lama:', error.message);
    }
  }
}

module.exports = {
  unggahFoto,
  hapusFotoLama,
  FOLDER_UPLOAD,
};

// Centralized error handler.
//
// Wajib punya empat parameter (err, req, res, next) supaya Express
// mengenalinya sebagai error handler. Dipasang paling akhir di app.js.
//
// Dua jenis error diperlakukan berbeda:
//   - AppError  -> kesalahan yang memang ditujukan untuk pengguna (400/401/...)
//   - Error lain -> dianggap bug server, dijawab 500 dengan pesan generik.
const multer = require('multer');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    // Response sudah terkirim sebagian, serahkan ke handler bawaan Express
    // supaya koneksi tidak menggantung.
    return next(err);
  }

  // Kesalahan unggah berkas dari multer: tetap 400, bukan 500, karena
  // penyebabnya adalah berkas yang dikirim pengguna.
  if (err instanceof multer.MulterError) {
    const pesan =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto maksimal 2 MB.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Hanya satu foto yang boleh diunggah, dengan nama field "photo".'
          : 'Berkas foto tidak bisa diterima.';

    console.error('[error]', req.method, req.originalUrl, '-> 400 (multer:', err.code + ')');

    return res.status(400).json({
      success: false,
      message: pesan,
      error: err.code,
    });
  }

  const statusCode = err.statusCode || err.status || 500;

  // Stack lengkap hanya masuk ke log server, tidak pernah ke response HTTP.
  console.error(
    '[error]',
    req.method,
    req.originalUrl,
    '->',
    statusCode,
    '\n',
    err.stack || err.message
  );

  const body = {
    success: false,
    message:
      statusCode === 500
        ? 'Terjadi kesalahan pada server.'
        : err.message || 'Permintaan tidak dapat diproses.',
    error: err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
  };

  // Stack trace TIDAK pernah dikirim ke client, karena bisa memuat path server,
  // nama tabel, atau isi query. Detailnya hanya masuk ke log server di atas.
  res.status(statusCode).json(body);
}

module.exports = errorHandler;

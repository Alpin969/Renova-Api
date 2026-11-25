// Menangani semua URL yang tidak terdaftar.
// Dipasang setelah seluruh route, jadi hanya terpanggil bila tidak ada
// route yang cocok.
function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
    error: 'NOT_FOUND',
  });
}

module.exports = notFound;

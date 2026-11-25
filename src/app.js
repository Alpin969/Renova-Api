// Menyusun aplikasi Express: keamanan, parser, route, lalu handler error.
// Berkas ini hanya membuat aplikasi; menjalankannya ada di server.js.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const servicesRoutes = require('./routes/services.routes');
const ordersRoutes = require('./routes/orders.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { FOLDER_UPLOAD } = require('./middleware/upload');

const app = express();

// Menyembunyikan header "X-Powered-By: Express" dari response.
app.disable('x-powered-by');

// Helmet menambah header keamanan standar pada setiap response.
app.use(helmet());

// CORS: pada tahap pengembangan website admin dan aplikasi Flutter boleh
// mengakses API dari mana saja. Batasi origin-nya saat sudah di-deploy.
app.use(cors());

// Parser JSON dengan batas ukuran agar body raksasa tidak dihabiskan di memori.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Express 5 meninggalkan req.body sebagai undefined bila tidak ada body
// yang dikirim. Disamakan menjadi objek kosong supaya controller tidak
// perlu memeriksa satu per satu, dan kesalahan pengguna tidak berubah
// menjadi error 500.
app.use((req, res, next) => {
  if (req.body === undefined || req.body === null) req.body = {};
  next();
});

// GET /
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'RENOVA REST API is running',
  });
});

// Berkas foto pesanan yang sudah diunggah.
//
// Cross-Origin-Resource-Policy dibuat "cross-origin" khusus folder ini,
// supaya gambar tetap bisa ditampilkan website admin maupun aplikasi Flutter
// yang berasal dari alamat berbeda. Aturan bawaan Helmet (same-origin) akan
// memblokirnya di browser.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(FOLDER_UPLOAD, {
    dotfiles: 'deny',
    index: false,
    maxAge: '1d',
  })
);

// Endpoint pemeriksaan kondisi server dan database.
app.use('/api/health', healthRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/orders', ordersRoutes);

// URL tidak dikenal -> 404, lalu error lain -> error handler.
app.use(notFound);
app.use(errorHandler);

module.exports = app;

// Endpoint pemeriksaan kondisi server dan koneksi database.
// Dipasang di app.js pada prefix "/api/health".
const express = require('express');

const env = require('../config/env');
const { ping, getDatabaseStatus } = require('../config/database');

const router = express.Router();

// GET /api/health
// Menjawab walau konfigurasi database belum diisi, karena fungsinya
// memastikan server Express memang hidup.
router.get('/', (req, res) => {
  const database = getDatabaseStatus();

  res.status(200).json({
    success: true,
    message: 'RENOVA API is healthy',
    data: {
      status: 'ok',
      environment: env.nodeEnv,
      uptime_seconds: Number(process.uptime().toFixed(2)),
      server_time: new Date().toISOString(),
      database: database.configured ? 'configured' : 'not_configured',
    },
  });
});

// GET /api/health/db
// Menguji koneksi PostgreSQL dengan query sederhana.
router.get('/db', async (req, res) => {
  const database = getDatabaseStatus();

  if (!database.configured) {
    return res.status(503).json({
      success: false,
      message:
        'Koneksi database belum dapat diuji karena konfigurasi pada .env belum lengkap. ' +
        'Isi variabel berikut lalu jalankan ulang server.',
      error: 'DATABASE_NOT_CONFIGURED',
      // Hanya nama variabel yang dilaporkan, bukan nilainya.
      missing_settings: database.missingSettings,
    });
  }

  try {
    const result = await ping();

    return res.status(200).json({
      success: true,
      message: 'Koneksi PostgreSQL berhasil.',
      data: {
        database: result.database,
        username: result.username,
        server_time: result.server_time,
        ssl: database.ssl,
      },
    });
  } catch (error) {
    // Detail error asli hanya dicatat di log server, tidak dikirim ke client.
    console.error('[health] Uji koneksi database gagal:', error.code || '', error.message);

    return res.status(503).json({
      success: false,
      message:
        'Koneksi ke database gagal. Periksa kembali host, kredensial, dan CA Certificate Aiven.',
      error: 'DATABASE_UNAVAILABLE',
    });
  }
});

module.exports = router;

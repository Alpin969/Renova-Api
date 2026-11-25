// Titik masuk aplikasi LaundryKu Backend.
// Jalankan dengan: npm start (atau npm run dev untuk nodemon)
const app = require('./src/app');
const env = require('./src/config/env');
const { getDatabaseStatus, closePool } = require('./src/config/database');

const server = app.listen(env.port, () => {
  const database = getDatabaseStatus();

  console.log('==========================================');
  console.log('  RENOVA REST API');
  console.log('==========================================');
  console.log(`  Mode        : ${env.nodeEnv}`);
  console.log(`  Server      : http://localhost:${env.port}`);
  console.log(`  Database    : ${database.configured ? 'terkonfigurasi' : 'belum terkonfigurasi'}`);
  console.log('------------------------------------------');
  console.log('  Publik');
  console.log('    GET    /');
  console.log('    GET    /api/health');
  console.log('    GET    /api/health/db');
  console.log('    POST   /api/auth/register');
  console.log('    POST   /api/auth/login');
  console.log('    GET    /api/services');
  console.log('    GET    /api/services/:id');
  console.log('  Perlu login');
  console.log('    GET    /api/auth/me');
  console.log('    POST   /api/orders');
  console.log('    GET    /api/orders');
  console.log('    GET    /api/orders/:id');
  console.log('    PATCH  /api/orders/:id/batal');
  console.log('    PATCH  /api/orders/:id/foto');
  console.log('  Khusus ADMIN');
  console.log('    POST   /api/services');
  console.log('    PUT    /api/services/:id');
  console.log('    DELETE /api/services/:id');
  console.log('    PATCH  /api/orders/:id/status');
  console.log('    PATCH  /api/orders/:id/berat-asli');
  console.log('==========================================');
});

// Menutup server dengan rapi: hentikan request masuk, tutup pool database,
// lalu keluar. Tanpa ini, koneksi ke PostgreSQL bisa tertinggal terbuka.
let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[server] Menerima sinyal ${signal}, menutup server...`);

  // Jaring pengaman: kalau penutupan memakan waktu lebih dari 10 detik,
  // proses tetap dihentikan agar server tidak menggantung.
  const forceExitTimer = setTimeout(() => {
    console.error('[server] Penutupan terlalu lama, proses dihentikan paksa.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  server.close(async () => {
    try {
      await closePool();
      console.log('[server] Koneksi database ditutup.');
    } catch (error) {
      console.error('[server] Gagal menutup koneksi database:', error.message);
    }

    clearTimeout(forceExitTimer);
    console.log('[server] Server berhenti. Sampai jumpa.');
    process.exit(0);
  });

  // Koneksi keep-alive yang sudah tidak dipakai langsung diputus
  // agar server.close() tidak menunggu sia-sia.
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Error di luar alur request tetap dicatat, lalu proses dibiarkan berhenti
// (di-deploy nanti proses akan otomatis dinyalakan ulang).
process.on('unhandledRejection', (reason) => {
  console.error('[server] Promise yang tidak tertangani:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('[server] Exception yang tidak tertangani:', error);
  shutdown('uncaughtException');
});

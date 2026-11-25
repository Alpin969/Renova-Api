// Endpoint pesanan laundry.
//
// Seluruh endpoint di sini memerlukan login. Pembatasan tambahan
// (pesanan milik siapa, role apa) diperiksa di dalam controller,
// karena butuh membaca data pesanannya terlebih dahulu.
const express = require('express');

const ordersController = require('../controllers/orders.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { unggahFoto } = require('../middleware/upload');

const router = express.Router();

// Semua endpoint pesanan wajib login.
router.use(authenticate);

// Customer membuat pesanan; admin memprosesnya lewat endpoint di bawah.
router.post('/', requireRole('CUSTOMER'), ordersController.buat);

// Customer otomatis hanya melihat pesanannya sendiri (disaring di controller).
router.get('/', ordersController.daftar);
router.get('/:id', ordersController.detail);

// Tugas admin memproses pesanan.
router.patch('/:id/status', requireRole('ADMIN'), ordersController.ubahStatus);
router.patch('/:id/berat-asli', requireRole('ADMIN'), ordersController.isiBeratAsli);

// Admin mengonfirmasi uang tunai sudah diterima. Metode pembayaran lain
// langsung dianggap lunas saat pesanan dibuat, jadi tidak melewati endpoint ini.
router.patch('/:id/bayar', requireRole('ADMIN'), ordersController.konfirmasiBayar);

// Pembatalan bisa dilakukan customer (pesanan sendiri) maupun admin.
router.patch('/:id/batal', ordersController.batalkan);

// unggahFoto mengurai multipart/form-data dengan nama field "photo".
router.patch('/:id/foto', unggahFoto.single('photo'), ordersController.unggahFoto);

// Menghapus foto pesanan. Pemilik pesanan maupun admin boleh melakukannya,
// sama seperti aturan pengunggahan foto di atas.
router.delete('/:id/foto', ordersController.hapusFoto);

module.exports = router;

// Endpoint layanan laundry.
//
// Melihat layanan terbuka untuk umum; menambah/mengubah/menghapus hanya ADMIN.
const express = require('express');

const servicesController = require('../controllers/services.controller');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Terbuka tanpa login: aplikasi mobile perlu menampilkan daftar layanan
// dan harganya sebelum pengguna mendaftar.
router.get('/', servicesController.daftar);
router.get('/:id', servicesController.detail);

// Hanya ADMIN yang boleh mengubah data layanan.
router.post('/', authenticate, requireRole('ADMIN'), servicesController.buat);
router.put('/:id', authenticate, requireRole('ADMIN'), servicesController.ubah);
router.delete('/:id', authenticate, requireRole('ADMIN'), servicesController.hapus);

module.exports = router;

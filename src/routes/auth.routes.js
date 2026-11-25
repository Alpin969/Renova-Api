// Endpoint autentikasi: register, login, dan data akun yang sedang masuk.
//
// Endpoint register dan login dibatasi jumlah percobaannya per alamat IP.
// Tanpa itu, halaman login bisa dipakai untuk menebak kata sandi berkali-kali
// tanpa hambatan.
const express = require('express');
const { rateLimit } = require('express-rate-limit');

const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// 20 percobaan dalam 15 menit. Angka ini longgar untuk manusia (yang salah
// mengetik beberapa kali) tetapi terlalu sempit untuk menebak otomatis.
const batasPercobaanAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message:
        'Terlalu banyak percobaan. Tunggu sekitar 15 menit sebelum mencoba lagi.',
      error: 'TOO_MANY_REQUESTS',
    });
  },
});

router.post('/register', batasPercobaanAuth, authController.register);
router.post('/login', batasPercobaanAuth, authController.login);
router.get('/me', authenticate, authController.me);

// Mengubah nama dan/atau kata sandi akun yang sedang masuk. Dibatasi
// percobaannya karena penggantian kata sandi memeriksa kata sandi lama.
router.patch('/me', batasPercobaanAuth, authenticate, authController.ubahProfil);

module.exports = router;

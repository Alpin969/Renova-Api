// Pesanan laundry (orders).
//
// Hak akses:
//   - CUSTOMER hanya melihat dan mengubah pesanannya sendiri.
//   - ADMIN melihat semua pesanan dan bertugas memprosesnya.
//
// Aturan penting: harga per kg pesanan DISALIN saat pesanan dibuat
// (kolom orders.price_per_kg). Jadi kalau admin mengubah harga layanan
// besok, total pesanan lama tidak ikut berubah.
const { query } = require('../config/database');
const AppError = require('../utils/AppError');
const { asNumber, asId, asEnum, kosong } = require('../utils/validate');
const { terjemahkanDenganConstraint } = require('../utils/pgError');
const { hapusFotoLama } = require('../middleware/upload');

// Enam status pesanan sesuai rancangan SRS LaundryKu.
const STATUS = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'WASHING',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'CANCELLED',
];

// Perpindahan status yang diizinkan. Alurnya maju satu arah, dan pesanan
// bisa dibatalkan selama belum selesai.
//
// Aturan tambahan di luar SRS (mudah diubah bila tidak sesuai):
// pesanan hanya boleh menjadi COMPLETED setelah berat asli diisi, karena
// tanpa itu harga akhir pesanan belum diketahui.
const TRANSISI = {
  PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['WASHING', 'CANCELLED'],
  WASHING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Status yang dianggap sudah final dan tidak bisa diubah lagi.
const STATUS_FINAL = ['COMPLETED', 'CANCELLED'];

// Metode pembayaran yang diterima. Tunai baru dianggap lunas setelah admin
// mengonfirmasi uangnya diterima; metode lain dianggap berhasil seketika
// karena pembayarannya masih simulasi pada tahap ini.
const METODE_PEMBAYARAN = ['CASH', 'QRIS', 'BANK_TRANSFER', 'EWALLET'];

// Batas jumlah baris yang boleh diminta sekali ambil.
const LIMIT_DEFAULT = 50;
const LIMIT_MAKS = 100;

// Daftar kolom pesanan yang dikirim ke client, sudah digabung dengan nama
// layanan dan nama pemesan supaya client tidak perlu meminta dua kali.
const SELECT_PESANAN = `
  SELECT o.id,
         o.user_id,
         u.name  AS customer_name,
         u.email AS customer_email,
         o.service_id,
         s.name  AS service_name,
         s.duration AS service_duration,
         o.estimated_weight,
         o.actual_weight,
         o.price_per_kg,
         o.total_price,
         o.status,
         o.photo_url,
         o.created_at,
         o.payment_method,
         o.payment_status,
         o.paid_at
    FROM orders o
    JOIN users u    ON u.id = o.user_id
    JOIN services s ON s.id = o.service_id`;

function ambilLimit(req) {
  return kosong(req.query.limit)
    ? LIMIT_DEFAULT
    : asNumber(req.query.limit, 'limit', { min: 1, max: LIMIT_MAKS });
}

function ambilOffset(req) {
  return kosong(req.query.offset)
    ? 0
    : asNumber(req.query.offset, 'offset', { min: 0, max: 1000000 });
}

// Mengambil satu pesanan, sekaligus memastikan pemakainya berhak melihatnya.
async function ambilPesananYangBolehDilihat(id, user) {
  const hasil = await query(`${SELECT_PESANAN} WHERE o.id = $1;`, [id]);

  if (hasil.rowCount === 0) {
    throw AppError.notFound(`Pesanan dengan id ${id} tidak ditemukan.`);
  }

  const pesanan = hasil.rows[0];

  // Customer lain tidak boleh tahu pesanan ini ada, jadi jawabannya 404
  // (bukan 403) supaya keberadaan pesanan tidak ikut terbocor.
  if (user.role !== 'ADMIN' && pesanan.user_id !== user.id) {
    throw AppError.notFound(`Pesanan dengan id ${id} tidak ditemukan.`);
  }

  return pesanan;
}

// POST /api/orders  (CUSTOMER)
async function buat(req, res) {
  const serviceId = asId(req.body.service_id, 'service_id');
  const estimasi = asNumber(req.body.estimated_weight, 'estimated_weight', {
    min: 0.01,
    max: 999999,
  });

  // Metode pembayaran boleh belum diisi oleh pemanggil lama. Aplikasi mobile
  // selalu mengirimnya lewat halaman pembayaran.
  const metode = kosong(req.body.payment_method)
    ? null
    : asEnum(req.body.payment_method, 'payment_method', METODE_PEMBAYARAN);

  // Tunai baru lunas setelah admin mengonfirmasi uangnya diterima. Metode
  // lain langsung dianggap lunas karena pembayarannya masih simulasi.
  const statusBayar =
    metode === null ? null : metode === 'CASH' ? 'UNPAID' : 'PAID';

  // Harga diambil langsung dari tabel services di dalam satu pernyataan SQL.
  // Dengan begitu harga tidak bisa dipalsukan lewat body permintaan, dan
  // tidak ada celah waktu antara "membaca harga" dan "menyimpan pesanan".
  const hasil = await query(
    `INSERT INTO orders (user_id, service_id, estimated_weight, price_per_kg, status,
                         payment_method, payment_status, paid_at)
     SELECT $1, s.id, $2, s.price_per_kg, 'PENDING_CONFIRMATION',
            $4::text, $5::text,
            CASE WHEN $5::text = 'PAID' THEN NOW() ELSE NULL END
       FROM services s
      WHERE s.id = $3
     RETURNING id, user_id, service_id, estimated_weight, actual_weight,
               price_per_kg, total_price, status, photo_url, created_at,
               payment_method, payment_status, paid_at;`,
    [req.user.id, estimasi, serviceId, metode, statusBayar]
  );

  if (hasil.rowCount === 0) {
    throw AppError.notFound(`Layanan dengan id ${serviceId} tidak ditemukan.`);
  }

  res.status(201).json({
    success: true,
    message:
      statusBayar === 'PAID'
        ? 'Pesanan berhasil dibuat dan pembayarannya diterima.'
        : 'Pesanan berhasil dibuat dan menunggu konfirmasi admin.',
    data: hasil.rows[0],
  });
}

// GET /api/orders
// CUSTOMER otomatis hanya melihat pesanannya sendiri.
// ADMIN melihat semua, dan boleh menyaring: ?status=WASHING & ?limit= & ?offset=
async function daftar(req, res) {
  const kondisi = [];
  const nilai = [];

  if (req.user.role !== 'ADMIN') {
    nilai.push(req.user.id);
    kondisi.push(`o.user_id = $${nilai.length}`);
  }

  if (!kosong(req.query.status)) {
    const status = asEnum(req.query.status, 'status', STATUS);
    nilai.push(status);
    kondisi.push(`o.status = $${nilai.length}`);
  }

  const limit = ambilLimit(req);
  const offset = ambilOffset(req);
  nilai.push(limit);
  const posisiLimit = nilai.length;
  nilai.push(offset);
  const posisiOffset = nilai.length;

  const klausa = kondisi.length ? `WHERE ${kondisi.join(' AND ')}` : '';

  const hasil = await query(
    `${SELECT_PESANAN}
     ${klausa}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $${posisiLimit} OFFSET $${posisiOffset};`,
    nilai
  );

  res.status(200).json({
    success: true,
    message: 'Daftar pesanan berhasil diambil.',
    data: hasil.rows,
    meta: {
      limit,
      offset,
      jumlah: hasil.rowCount,
    },
  });
}

// GET /api/orders/:id
async function detail(req, res) {
  const id = asId(req.params.id);
  const pesanan = await ambilPesananYangBolehDilihat(id, req.user);

  res.status(200).json({
    success: true,
    message: 'Detail pesanan berhasil diambil.',
    data: pesanan,
  });
}

// PATCH /api/orders/:id/status  (ADMIN)
async function ubahStatus(req, res) {
  const id = asId(req.params.id);
  const statusBaru = asEnum(req.body.status, 'status', STATUS);

  const hasilLama = await query(
    `SELECT id, status, actual_weight, payment_method, payment_status
       FROM orders WHERE id = $1;`,
    [id]
  );

  if (hasilLama.rowCount === 0) {
    throw AppError.notFound(`Pesanan dengan id ${id} tidak ditemukan.`);
  }

  const sekarang = hasilLama.rows[0];

  if (sekarang.status === statusBaru) {
    throw AppError.conflict(
      `Pesanan ini sudah berstatus ${statusBaru}.`,
      'STATUS_SAMA'
    );
  }

  if (!TRANSISI[sekarang.status].includes(statusBaru)) {
    const lanjutan = TRANSISI[sekarang.status];
    const keterangan = lanjutan.length
      ? `Status berikutnya yang boleh: ${lanjutan.join(', ')}.`
      : 'Pesanan pada status ini sudah final dan tidak bisa diubah lagi.';

    throw AppError.conflict(
      `Status tidak bisa diubah dari ${sekarang.status} ke ${statusBaru}. ${keterangan}`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  // Harga akhir harus sudah diketahui sebelum pesanan dinyatakan selesai.
  if (statusBaru === 'COMPLETED' && sekarang.actual_weight === null) {
    throw AppError.conflict(
      'Berat asli pesanan belum diisi, sehingga harga akhir belum diketahui. ' +
        'Isi berat asli terlebih dahulu sebelum menyelesaikan pesanan.',
      'ACTUAL_WEIGHT_REQUIRED'
    );
  }

  // Pakaian diserahkan setelah dibayar, jadi pesanan yang sudah mencatat
  // metode pembayaran tidak boleh diselesaikan selagi belum lunas. Pesanan
  // lama yang belum mencatat metode pembayaran tidak ikut dihalangi.
  if (
    statusBaru === 'COMPLETED' &&
    sekarang.payment_method !== null &&
    sekarang.payment_status !== 'PAID'
  ) {
    throw AppError.conflict(
      'Pembayaran pesanan ini belum lunas. Konfirmasi pembayarannya lebih ' +
        'dahulu sebelum menyelesaikan pesanan.',
      'PAYMENT_REQUIRED'
    );
  }

  // Syarat "status = $3" membuat perubahan ini aman bila dua admin menekan
  // tombol bersamaan: yang kalah tidak akan menimpa perubahan yang menang.
  const hasil = await query(
    `UPDATE orders
        SET status = $1
      WHERE id = $2 AND status = $3
      RETURNING id;`,
    [statusBaru, id, sekarang.status]
  );

  if (hasil.rowCount === 0) {
    throw AppError.conflict(
      'Status pesanan baru saja diubah oleh permintaan lain. Muat ulang data lalu coba lagi.',
      'STATUS_CHANGED'
    );
  }

  const pesanan = await ambilPesananYangBolehDilihat(id, req.user);

  res.status(200).json({
    success: true,
    message: `Status pesanan berhasil diubah menjadi ${statusBaru}.`,
    data: pesanan,
  });
}

// PATCH /api/orders/:id/berat-asli  (ADMIN)
// Mengisi berat asli, sekaligus menghitung harga akhir di database.
async function isiBeratAsli(req, res) {
  const id = asId(req.params.id);
  const berat = asNumber(req.body.actual_weight, 'actual_weight', {
    min: 0.01,
    max: 999999,
  });

  // Perhitungan dilakukan di dalam SQL memakai harga milik pesanan itu
  // sendiri, lalu dibulatkan ke 2 angka di belakang koma sesuai tipe kolom
  // NUMERIC(12,2). Ini menghindari pembulatan yang berbeda-beda di JavaScript.
  const hasil = await query(
    `UPDATE orders
        SET actual_weight = $1,
            total_price   = ROUND($1::numeric * price_per_kg, 2)
      WHERE id = $2
        AND status <> ALL($3::text[])
      RETURNING id;`,
    [berat, id, STATUS_FINAL]
  );

  if (hasil.rowCount === 0) {
    const ada = await query('SELECT status FROM orders WHERE id = $1;', [id]);

    if (ada.rowCount === 0) {
      throw AppError.notFound(`Pesanan dengan id ${id} tidak ditemukan.`);
    }

    throw AppError.conflict(
      `Berat asli tidak bisa diubah karena pesanan sudah berstatus ${ada.rows[0].status}.`,
      'ORDER_FINAL'
    );
  }

  const pesanan = await ambilPesananYangBolehDilihat(id, req.user);

  res.status(200).json({
    success: true,
    message: 'Berat asli dan harga akhir pesanan berhasil disimpan.',
    data: pesanan,
  });
}

// PATCH /api/orders/:id/bayar  (ADMIN)
// Menandai pembayaran pesanan sudah diterima. Dipakai untuk pembayaran tunai,
// yang uangnya baru benar-benar diterima saat pakaian diambil.
//
// Metode pembayaran tidak ikut diubah di sini: pesanan lama bisa saja belum
// mencatat metodenya, dan menebaknya sebagai tunai berarti menulis data yang
// tidak pernah dipilih pelanggan.
async function konfirmasiBayar(req, res) {
  const id = asId(req.params.id);

  const hasilLama = await query(
    'SELECT id, payment_status FROM orders WHERE id = $1;',
    [id]
  );

  if (hasilLama.rowCount === 0) {
    throw AppError.notFound(`Pesanan dengan id ${id} tidak ditemukan.`);
  }

  if (hasilLama.rows[0].payment_status === 'PAID') {
    throw AppError.conflict(
      'Pembayaran pesanan ini sudah dikonfirmasi sebelumnya.',
      'PAYMENT_ALREADY_PAID'
    );
  }

  // Syarat statusnya membuat konfirmasi ganda dari dua admin tidak saling
  // menimpa: yang kalah mendapat pesan bahwa pembayarannya sudah lunas.
  const hasil = await query(
    `UPDATE orders
        SET payment_status = 'PAID',
            paid_at = NOW()
      WHERE id = $1
        AND payment_status IS DISTINCT FROM 'PAID'
      RETURNING id;`,
    [id]
  );

  if (hasil.rowCount === 0) {
    throw AppError.conflict(
      'Pembayaran pesanan ini sudah dikonfirmasi sebelumnya.',
      'PAYMENT_ALREADY_PAID'
    );
  }

  const pesanan = await ambilPesananYangBolehDilihat(id, req.user);

  res.status(200).json({
    success: true,
    message: 'Pembayaran pesanan berhasil dikonfirmasi.',
    data: pesanan,
  });
}

// PATCH /api/orders/:id/batal
// Customer membatalkan pesanannya sendiri; admin boleh membatalkan pesanan siapa pun.
async function batalkan(req, res) {
  const id = asId(req.params.id);
  const pesanan = await ambilPesananYangBolehDilihat(id, req.user);

  if (STATUS_FINAL.includes(pesanan.status)) {
    throw AppError.conflict(
      `Pesanan ini sudah ${pesanan.status} dan tidak bisa dibatalkan lagi.`,
      'ORDER_FINAL'
    );
  }

  // Customer hanya boleh membatalkan sebelum proses pencucian dimulai.
  const bolehDibatalkanCustomer = ['PENDING_CONFIRMATION', 'CONFIRMED'];
  if (req.user.role !== 'ADMIN' && !bolehDibatalkanCustomer.includes(pesanan.status)) {
    throw AppError.forbidden(
      `Pesanan yang sudah berstatus ${pesanan.status} tidak bisa dibatalkan sendiri. ` +
        'Hubungi admin untuk membatalkannya.',
      'CANCEL_NOT_ALLOWED'
    );
  }

  const hasil = await query(
    `UPDATE orders
        SET status = 'CANCELLED'
      WHERE id = $1 AND status = $2
      RETURNING id;`,
    [id, pesanan.status]
  );

  if (hasil.rowCount === 0) {
    throw AppError.conflict(
      'Pesanan baru saja berubah oleh permintaan lain. Muat ulang data lalu coba lagi.',
      'STATUS_CHANGED'
    );
  }

  const pesananTerbaru = await ambilPesananYangBolehDilihat(id, req.user);

  res.status(200).json({
    success: true,
    message: 'Pesanan berhasil dibatalkan.',
    data: pesananTerbaru,
  });
}

// PATCH /api/orders/:id/foto  (multipart/form-data, field: "photo")
// Pemilik pesanan atau admin boleh mengunggah foto pesanan.
async function unggahFoto(req, res) {
  const id = asId(req.params.id);

  // Dipastikan dulu bahwa pemakainya memang berhak atas pesanan ini,
  // SEBELUM berkas dianggap tersimpan. Kalau tidak berhak, berkas yang
  // terlanjur ditulis akan dihapus lagi supaya tidak menumpuk.
  const pesanan = await ambilPesananYangBolehDilihat(id, req.user);

  if (!req.file) {
    throw AppError.badRequest(
      'Berkas foto belum dikirim. Kirim sebagai multipart/form-data dengan nama field "photo".',
      'FILE_REQUIRED'
    );
  }

  const photoUrl = `/uploads/${req.file.filename}`;

  const hasil = await query(
    'UPDATE orders SET photo_url = $1 WHERE id = $2 RETURNING id;',
    [photoUrl, id]
  );

  if (hasil.rowCount === 0) {
    await hapusFotoLama(photoUrl);
    throw AppError.notFound(`Pesanan dengan id ${id} tidak ditemukan.`);
  }

  // Foto lama dibersihkan setelah foto baru benar-benar tersimpan.
  await hapusFotoLama(pesanan.photo_url);

  const pesananTerbaru = await ambilPesananYangBolehDilihat(id, req.user);

  res.status(200).json({
    success: true,
    message: 'Foto pesanan berhasil diunggah.',
    data: pesananTerbaru,
  });
}

// DELETE /api/orders/:id/foto
// Menghapus foto pesanan. Pemilik pesanan maupun admin boleh melakukannya,
// sama seperti aturan pada pengunggahan foto.
async function hapusFoto(req, res) {
  const id = asId(req.params.id);

  // Dipastikan dulu bahwa pemakainya berhak atas pesanan ini.
  const pesanan = await ambilPesananYangBolehDilihat(id, req.user);

  if (!pesanan.photo_url) {
    throw AppError.notFound(
      'Pesanan ini tidak punya foto yang bisa dihapus.',
      'FILE_NOT_FOUND'
    );
  }

  const hasil = await query(
    'UPDATE orders SET photo_url = NULL WHERE id = $1 RETURNING id;',
    [id]
  );

  if (hasil.rowCount === 0) {
    throw AppError.notFound(`Pesanan dengan id ${id} tidak ditemukan.`);
  }

  // Berkasnya dibuang setelah kolomnya benar-benar kosong.
  await hapusFotoLama(pesanan.photo_url);

  const pesananTerbaru = await ambilPesananYangBolehDilihat(id, req.user);

  res.status(200).json({
    success: true,
    message: 'Foto pesanan berhasil dihapus.',
    data: pesananTerbaru,
  });
}

module.exports = {
  buat,
  daftar,
  detail,
  ubahStatus,
  isiBeratAsli,
  konfirmasiBayar,
  batalkan,
  unggahFoto,
  hapusFoto,
  STATUS,
  TRANSISI,
};

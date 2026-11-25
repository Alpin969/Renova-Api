// CRUD layanan laundry (services).
//
// Hak akses:
//   - Melihat daftar/detail layanan: TERBUKA, tanpa login, karena aplikasi
//     mobile perlu menampilkannya sebelum pengguna mendaftar.
//   - Menambah, mengubah, menghapus: hanya ADMIN.
const { query } = require('../config/database');
const AppError = require('../utils/AppError');
const { asString, asNumber, asId, kosong } = require('../utils/validate');
const { terjemahkanDenganConstraint } = require('../utils/pgError');

const KOLOM = 'id, name, description, price_per_kg, duration, created_at';

// GET /api/services
// Mendukung pencarian sederhana: /api/services?search=cuc
async function daftar(req, res) {
  const kondisi = [];
  const nilai = [];

  if (!kosong(req.query.search)) {
    const kataKunci = asString(req.query.search, 'search', { min: 1, max: 100 });
    nilai.push(`%${kataKunci}%`);
    kondisi.push(
      `(name ILIKE $${nilai.length} OR COALESCE(description, '') ILIKE $${nilai.length})`
    );
  }

  const klausa = kondisi.length ? `WHERE ${kondisi.join(' AND ')}` : '';

  const hasil = await query(
    `SELECT ${KOLOM}
       FROM services
       ${klausa}
      ORDER BY name ASC, id ASC;`,
    nilai
  );

  res.status(200).json({
    success: true,
    message: 'Daftar layanan berhasil diambil.',
    data: hasil.rows,
  });
}

// GET /api/services/:id
async function detail(req, res) {
  const id = asId(req.params.id);

  const hasil = await query(
    `SELECT ${KOLOM} FROM services WHERE id = $1;`,
    [id]
  );

  if (hasil.rowCount === 0) {
    throw AppError.notFound(`Layanan dengan id ${id} tidak ditemukan.`);
  }

  res.status(200).json({
    success: true,
    message: 'Detail layanan berhasil diambil.',
    data: hasil.rows[0],
  });
}

// POST /api/services  (ADMIN)
async function buat(req, res) {
  const nama = asString(req.body.name, 'name', { min: 1, max: 100 });
  const durasi = asString(req.body.duration, 'duration', { min: 1, max: 50 });
  const harga = asNumber(req.body.price_per_kg, 'price_per_kg', {
    min: 0.01,
    max: 99999999,
  });

  // description boleh dikosongkan.
  const deskripsi = kosong(req.body.description)
    ? null
    : asString(req.body.description, 'description', { min: 1, max: 2000 });

  const hasil = await query(
    `INSERT INTO services (name, description, price_per_kg, duration)
     VALUES ($1, $2, $3, $4)
     RETURNING ${KOLOM};`,
    [nama, deskripsi, harga, durasi]
  );

  res.status(201).json({
    success: true,
    message: 'Layanan berhasil ditambahkan.',
    data: hasil.rows[0],
  });
}

// PUT /api/services/:id  (ADMIN)
// Field yang tidak dikirim akan tetap memakai nilai lama.
async function ubah(req, res) {
  const id = asId(req.params.id);

  const hasilLama = await query(
    `SELECT ${KOLOM} FROM services WHERE id = $1;`,
    [id]
  );

  if (hasilLama.rowCount === 0) {
    throw AppError.notFound(`Layanan dengan id ${id} tidak ditemukan.`);
  }

  const lama = hasilLama.rows[0];

  const nama =
    req.body.name === undefined
      ? lama.name
      : asString(req.body.name, 'name', { min: 1, max: 100 });

  const durasi =
    req.body.duration === undefined
      ? lama.duration
      : asString(req.body.duration, 'duration', { min: 1, max: 50 });

  const harga =
    req.body.price_per_kg === undefined
      ? lama.price_per_kg
      : asNumber(req.body.price_per_kg, 'price_per_kg', {
          min: 0.01,
          max: 99999999,
        });

  // description boleh dikirim sebagai null / "" untuk mengosongkan.
  let deskripsi = lama.description;
  if (req.body.description !== undefined) {
    deskripsi = kosong(req.body.description)
      ? null
      : asString(req.body.description, 'description', { min: 1, max: 2000 });
  }

  const hasil = await query(
    `UPDATE services
        SET name = $1, description = $2, price_per_kg = $3, duration = $4
      WHERE id = $5
      RETURNING ${KOLOM};`,
    [nama, deskripsi, harga, durasi, id]
  );

  res.status(200).json({
    success: true,
    message: 'Layanan berhasil diperbarui.',
    data: hasil.rows[0],
  });
}

// DELETE /api/services/:id  (ADMIN)
async function hapus(req, res) {
  const id = asId(req.params.id);

  let hasil;
  try {
    hasil = await query('DELETE FROM services WHERE id = $1 RETURNING id, name;', [id]);
  } catch (error) {
    // Layanan yang sudah dipakai pada pesanan tidak boleh dihapus, karena
    // foreign key memakai ON DELETE RESTRICT. Kasus ini dijelaskan apa adanya
    // supaya admin tahu kenapa gagal, bukan sekadar "terjadi kesalahan".
    //
    // Dua kode harus diperiksa: 23503 (foreign_key_violation) dan 23001
    // (restrict_violation). PostgreSQL memakai 23001 untuk pelanggaran
    // ON DELETE RESTRICT, dan sebelumnya kode itu tidak ikut diperiksa
    // sehingga permintaan ini menjawab HTTP 500 dengan kode mentah.
    if (error.code === '23503' || error.code === '23001') {
      throw AppError.conflict(
        'Layanan ini tidak bisa dihapus karena masih dipakai pada pesanan. ' +
          'Ubah atau batalkan pesanan tersebut terlebih dahulu.',
        'SERVICE_IN_USE'
      );
    }

    const appError = terjemahkanDenganConstraint(error);
    if (appError) throw appError;
    throw error;
  }

  if (hasil.rowCount === 0) {
    throw AppError.notFound(`Layanan dengan id ${id} tidak ditemukan.`);
  }

  res.status(200).json({
    success: true,
    message: `Layanan "${hasil.rows[0].name}" berhasil dihapus.`,
    data: { id: hasil.rows[0].id },
  });
}

module.exports = {
  daftar,
  detail,
  buat,
  ubah,
  hapus,
};

// Membersihkan data yang ditinggalkan pengujian otomatis.
//
// Pengujian integrasi di project Flutter (test/api_integration_test.dart)
// membuat layanan berawalan "[UJI MOBILE]" beserta pesanan dan akunnya di
// database yang sama dengan aplikasi. Selama tidak dibersihkan, nama-nama itu
// ikut tampil di pilihan layanan aplikasi.
//
// Skrip ini menghapus data tersebut tanpa menyentuh data sungguhan:
//   - akun  : email berakhiran @laundryku.test, kecuali yang dipertahankan
//   - layanan: nama berawalan "[UJI" atau "[PROBE"
//   - pesanan: hanya pesanan milik akun uji
//   - foto   : hanya berkas di uploads yang tidak dipakai pesanan mana pun
//
// Cara pakai:
//   node scripts/bersihkan-data-uji.js            hapus
//   node scripts/bersihkan-data-uji.js --lihat    hanya melihat, tidak menghapus
//
// Menjalankan tanpa argumen dan tanpa hapus apa pun itu tidak berbahaya:
// bila tidak ada data uji, skrip hanya melaporkan bahwa tidak ada.
const fs = require('fs');
const path = require('path');

const { query, closePool } = require('../src/config/database');

// Akun yang memang dipakai aplikasi, bukan akun uji.
const EMAIL_DIPERTAHANKAN = ['admin@laundryku.test'];

const FOLDER_UPLOAD = path.resolve(__dirname, '../uploads');

const hanyaMelihat = process.argv.includes('--lihat');

// Data uji dikenali dari pola yang konsisten dipakai berkas pengujian.
const SYARAT_AKUN_UJI = `LOWER(email) LIKE '%@laundryku.test'
   AND NOT (LOWER(email) = ANY($1::text[]))`;
const SYARAT_LAYANAN_UJI = `(name LIKE '[UJI%' OR name LIKE '[PROBE%')`;

async function hitung(sql, params = []) {
  const hasil = await query(sql, params);
  return hasil.rows[0].n;
}

async function main() {
  console.log(
    hanyaMelihat
      ? 'MODE LIHAT SAJA — tidak ada yang dihapus.\n'
      : 'Menghapus data uji...\n'
  );

  const jumlah = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE ${SYARAT_AKUN_UJI}) AS akun,
       (SELECT COUNT(*)::int FROM services WHERE ${SYARAT_LAYANAN_UJI}) AS layanan,
       (SELECT COUNT(*)::int FROM orders o
          JOIN users u ON u.id = o.user_id
         WHERE ${SYARAT_AKUN_UJI.replace(/email/g, 'u.email')}) AS pesanan`,
    [EMAIL_DIPERTAHANKAN]
  );

  const { akun, layanan, pesanan } = jumlah.rows[0];
  console.log(`akun uji    : ${akun}`);
  console.log(`layanan uji : ${layanan}`);
  console.log(`pesanan uji : ${pesanan}`);

  if (akun === 0 && layanan === 0 && pesanan === 0) {
    console.log('\nTidak ada data uji yang perlu dibersihkan.');
  } else if (hanyaMelihat) {
    const contoh = await query(
      `SELECT name FROM services WHERE ${SYARAT_LAYANAN_UJI} ORDER BY id LIMIT 10`
    );
    if (contoh.rows.length > 0) {
      console.log('\nlayanan yang akan dihapus:');
      for (const l of contoh.rows) console.log(`  - ${l.name}`);
    }
    console.log('\nJalankan tanpa --lihat untuk menghapusnya.');
  } else {
    await query('BEGIN');
    try {
      // Pesanan dihapus lebih dulu: kunci asing orders -> services dan
      // orders -> users memakai ON DELETE RESTRICT, jadi keduanya akan
      // menolak penghapusan selama pesanannya masih ada.
      const hapusPesanan = await query(
        `DELETE FROM orders o
          USING users u
          WHERE o.user_id = u.id AND ${SYARAT_AKUN_UJI}`,
        [EMAIL_DIPERTAHANKAN]
      );

      const hapusLayanan = await query(
        `DELETE FROM services s
          WHERE ${SYARAT_LAYANAN_UJI}
            AND NOT EXISTS (
              SELECT 1 FROM orders o WHERE o.service_id = s.id
            )`
      );

      const hapusAkun = await query(
        `DELETE FROM users u
          WHERE ${SYARAT_AKUN_UJI}
            AND NOT EXISTS (
              SELECT 1 FROM orders o WHERE o.user_id = u.id
            )`,
        [EMAIL_DIPERTAHANKAN]
      );

      await query('COMMIT');
      console.log(
        `\nterhapus: pesanan=${hapusPesanan.rowCount} ` +
          `layanan=${hapusLayanan.rowCount} akun=${hapusAkun.rowCount}`
      );
    } catch (kesalahan) {
      await query('ROLLBACK');
      throw kesalahan;
    }
  }

  // Foto yatim: berkasnya ada di folder uploads, tetapi tidak ada pesanan
  // yang menunjuknya. Foto milik pesanan yang masih ada tidak pernah dihapus.
  if (fs.existsSync(FOLDER_UPLOAD)) {
    const dipakai = await query(
      `SELECT photo_url FROM orders WHERE photo_url IS NOT NULL`
    );
    const namaDipakai = new Set(
      dipakai.rows.map((b) => path.basename(b.photo_url))
    );

    const berkas = fs
      .readdirSync(FOLDER_UPLOAD)
      .filter((nama) => !nama.startsWith('.'));
    const yatim = berkas.filter((nama) => !namaDipakai.has(nama));

    console.log(`\nfoto di uploads     : ${berkas.length}`);
    console.log(`foto masih dipakai  : ${berkas.length - yatim.length}`);
    console.log(`foto yatim          : ${yatim.length}`);

    if (yatim.length > 0 && !hanyaMelihat) {
      for (const nama of yatim) {
        fs.unlinkSync(path.join(FOLDER_UPLOAD, nama));
      }
      console.log(`foto yatim dihapus  : ${yatim.length}`);
    }
  }

  const sisa = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users) AS pengguna,
       (SELECT COUNT(*)::int FROM services) AS layanan,
       (SELECT COUNT(*)::int FROM orders) AS pesanan`
  );
  console.log('\n=== ISI DATABASE SEKARANG ===');
  console.log(
    `pengguna=${sisa.rows[0].pengguna} layanan=${sisa.rows[0].layanan} ` +
      `pesanan=${sisa.rows[0].pesanan}`
  );
}

main()
  .catch((error) => {
    console.log('GAGAL:', error.code || error.name, '-', error.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());

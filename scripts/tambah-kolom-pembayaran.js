// Menambahkan kolom pembayaran pada tabel orders.
//
// Cara pakai:
//   node scripts/tambah-kolom-pembayaran.js
//
// Seluruh perubahannya bersifat menambah (tidak menghapus atau mengubah data
// yang sudah ada) dan memakai IF NOT EXISTS, jadi aman dijalankan berulang.
const { query, closePool } = require('../src/config/database');

const LANGKAH = [
  {
    nama: 'kolom payment_method',
    sql: `ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);`,
  },
  {
    nama: 'kolom payment_status',
    sql: `ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20);`,
  },
  {
    nama: 'kolom paid_at',
    sql: `ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;`,
  },
  {
    nama: 'batasan payment_method',
    sql: `ALTER TABLE orders
            DROP CONSTRAINT IF EXISTS chk_orders_payment_method;
          ALTER TABLE orders
            ADD CONSTRAINT chk_orders_payment_method
            CHECK (
              payment_method IS NULL
              OR payment_method IN ('CASH', 'QRIS', 'BANK_TRANSFER', 'EWALLET')
            );`,
  },
  {
    nama: 'batasan payment_status',
    sql: `ALTER TABLE orders
            DROP CONSTRAINT IF EXISTS chk_orders_payment_status;
          ALTER TABLE orders
            ADD CONSTRAINT chk_orders_payment_status
            CHECK (
              payment_status IS NULL
              OR payment_status IN ('UNPAID', 'PAID')
            );`,
  },
  {
    nama: 'batasan paid_at',
    // Waktu pembayaran hanya boleh terisi bila statusnya memang sudah lunas.
    // Pesanan lama yang belum mencatat pembayaran (ketiganya NULL) tetap sah.
    sql: `ALTER TABLE orders
            DROP CONSTRAINT IF EXISTS chk_orders_paid_at;
          ALTER TABLE orders
            ADD CONSTRAINT chk_orders_paid_at
            CHECK (
              (payment_status IS NULL AND paid_at IS NULL)
              OR (payment_status = 'UNPAID' AND paid_at IS NULL)
              OR (payment_status = 'PAID' AND paid_at IS NOT NULL)
            );`,
  },
  {
    nama: 'indeks pembayaran belum lunas',
    // Admin mencari pesanan yang pembayarannya belum dikonfirmasi.
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_payment_status
            ON orders (payment_status, created_at DESC);`,
  },
];

async function main() {
  await query('BEGIN;');

  try {
    for (const langkah of LANGKAH) {
      await query(langkah.sql);
      console.log(`[ok] ${langkah.nama}`);
    }
    await query('COMMIT;');
  } catch (kesalahan) {
    await query('ROLLBACK;');
    throw kesalahan;
  }

  const hasil = await query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'orders'
        AND column_name IN ('payment_method', 'payment_status', 'paid_at')
      ORDER BY column_name;`
  );

  console.log('\nKolom pembayaran pada tabel orders:');
  for (const baris of hasil.rows) {
    console.log(
      `  ${baris.column_name} (${baris.data_type}, ` +
        `${baris.is_nullable === 'YES' ? 'boleh kosong' : 'wajib diisi'})`
    );
  }

  const pesanan = await query(
    `SELECT COUNT(*)::int AS jumlah,
            COUNT(payment_status)::int AS tercatat
       FROM orders;`
  );

  console.log(
    `\nPesanan: ${pesanan.rows[0].jumlah} baris, ` +
      `${pesanan.rows[0].tercatat} sudah mencatat status pembayaran.`
  );
}

main()
  .catch((kesalahan) => {
    console.error('\nGagal menambah kolom pembayaran:', kesalahan.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());

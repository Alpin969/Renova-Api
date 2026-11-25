// Membuat atau mengubah akun ADMIN.
//
// Registrasi lewat API hanya bisa membuat akun CUSTOMER, dan itu memang
// disengaja: kalau role boleh dikirim dari body permintaan, siapa pun
// bisa mendaftarkan dirinya sebagai admin. Jadi akun admin pertama harus
// dibuat lewat skrip ini, yang dijalankan langsung di server.
//
// Cara pakai:
//   node scripts/create-admin.js "Nama Admin" admin@laundryku.test "KataSandi123"
//
// Bila email tersebut sudah terdaftar, akunnya dinaikkan menjadi ADMIN
// dan kata sandinya diperbarui.
const bcrypt = require('bcryptjs');

const { query, closePool } = require('../src/config/database');
const { asString, asEmail } = require('../src/utils/validate');

const PUTARAN_BCRYPT = 10;

async function main() {
  const [namaMentah, emailMentah, passwordMentah] = process.argv.slice(2);

  if (!namaMentah || !emailMentah || !passwordMentah) {
    console.log('Cara pakai:');
    console.log('  node scripts/create-admin.js "Nama Admin" admin@laundryku.test "KataSandi123"');
    process.exitCode = 1;
    return;
  }

  // Memakai pemeriksa yang sama dengan API, supaya aturannya konsisten.
  const nama = asString(namaMentah, 'name', { min: 1, max: 100 });
  const email = asEmail(emailMentah, 'email');
  const password = asString(passwordMentah, 'password', { min: 8, max: 72 });

  const passwordHash = await bcrypt.hash(password, PUTARAN_BCRYPT);

  const hasil = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (LOWER(email))
     DO UPDATE SET name = EXCLUDED.name,
                   password_hash = EXCLUDED.password_hash,
                   role = 'ADMIN'
     RETURNING id, name, email, role, created_at;`,
    [nama, email, passwordHash]
  );

  const user = hasil.rows[0];

  console.log('Akun ADMIN siap dipakai:');
  console.log(`  id    : ${user.id}`);
  console.log(`  nama  : ${user.name}`);
  console.log(`  email : ${user.email}`);
  console.log(`  role  : ${user.role}`);
  console.log('');
  console.log('Silakan login lewat POST /api/auth/login memakai email dan kata sandi tersebut.');
}

main()
  .catch((error) => {
    console.log('GAGAL:', error.code || error.name, '-', error.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());

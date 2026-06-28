// Set password semua murid = nama + "123".
// Jalankan sekali setelah migration_student_auth.sql:
//   node scripts/seedStudentPasswords.js
// Aman dijalankan ulang (idempotent) — password selalu diselaraskan dengan nama terbaru.
// ponytail: update satu per satu; murid se-TPA jumlahnya kecil, batch upsert overkill.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabaseClient');

(async () => {
    if (!supabase) {
        console.error('Supabase belum terkonfigurasi (cek SUPABASE_URL / SUPABASE_KEY di .env).');
        process.exit(1);
    }

    const { data: students, error } = await supabase.from('students').select('id, name');
    if (error) {
        console.error('Gagal ambil daftar murid:', error.message);
        process.exit(1);
    }

    let ok = 0, fail = 0;
    for (const s of students) {
        const password = `${s.name}123`;
        const { error: upErr } = await supabase
            .from('students')
            .update({ password })
            .eq('id', s.id);
        if (upErr) { fail++; console.error(`  x ${s.name}: ${upErr.message}`); }
        else ok++;
    }

    console.log(`Selesai. Berhasil: ${ok}, Gagal: ${fail}, Total: ${students.length}`);
    process.exit(fail ? 1 : 0);
})();

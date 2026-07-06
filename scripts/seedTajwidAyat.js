// Seed teks Uthmani juz amma (surah 90 Al-Balad s/d 114 An-Nas) ke tabel tajwid_ayat.
// Sumber: api.alquran.cloud edition quran-uthmani (sudah lengkap harakat fathah berdiri & tanda mad).
// Jalankan: node scripts/seedTajwidAyat.js   (butuh tabel tajwid_ayat sudah ada + SUPABASE_KEY di .env)
//
// Catatan: API menyelipkan Basmalah (4 kata) di depan ayat 1 tiap surah -> dibuang.
// words = pemecahan kata polos [{t}]; tag mad TIDAK di sini (nanti di reference guru, Fase B).
require('dotenv').config();
const https = require('https');
const supabase = require('../config/supabaseClient');

const FROM = 90, TO = 114; // Al-Balad .. An-Nas

const get = (u) => new Promise((res, rej) => {
    https.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
    if (!supabase) { console.error('Supabase belum terkonfigurasi (.env).'); process.exit(1); }
    const rows = [];
    for (let n = FROM; n <= TO; n++) {
        const j = await get(`https://api.alquran.cloud/v1/surah/${n}/quran-uthmani`);
        const s = j.data;
        const key = slug(s.englishName);
        s.ayahs.forEach(a => {
            let words = a.text.trim().split(/\s+/);
            if (a.numberInSurah === 1) words = words.slice(4); // buang Basmalah
            const arabic = words.join(' ');
            rows.push({
                surah_key: key, surah_name: s.englishName, surah_order: n,
                ayah_no: a.numberInSurah, arabic, words: words.map(t => ({ t })),
            });
        });
        console.log(`  ${n} ${s.englishName}: ${s.ayahs.length} ayat`);
    }
    // upsert batch (ganti teks kalau sudah ada, tag mad di tabel lain jadi aman)
    const { error } = await supabase.from('tajwid_ayat')
        .upsert(rows, { onConflict: 'surah_key,ayah_no' });
    if (error) { console.error('Gagal upsert:', error.message); process.exit(1); }
    console.log(`✅ ${rows.length} ayat ter-seed (surah ${FROM}–${TO}).`);
    process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

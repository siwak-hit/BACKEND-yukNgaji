// Cek rumus nilai ujian lisan. Jalankan: node scripts/testOralScore.js
const assert = require('assert');
const { _scoreOne: score } = require('../controller/oralController');

// Selesai cepat: <= separuh durasi selalu 100.
assert.strictEqual(score('early', 0, 30), 100);
assert.strictEqual(score('early', 15, 30), 100);
// Lewat separuh: turun linear sampai 75 saat mepet habis.
assert.strictEqual(score('early', 21, 30), 90);   // ratio .7  -> 100 - 50*.2
assert.strictEqual(score('early', 30, 30), 75);   // ratio 1   -> 75
// Waktu habis.
assert.strictEqual(score('timeout_done', 30, 30), 50);
assert.strictEqual(score('timeout_undone', 30, 30), 20);
// Menyerah: 0, tak peduli sudah berapa detik jalan.
assert.strictEqual(score('pass', 5, 30), 0);
assert.strictEqual(score('pass', 0, 30), 0);
// Durasi aneh tidak bikin NaN / bagi nol (durasi 0 dianggap habis terpakai, bukan NaN).
assert.strictEqual(score('early', 5, 0), 75);
assert.strictEqual(score('early', -3, 30), 100);

// Nilai akhir = rata-rata skor perintah.
const details = [score('early', 10, 30), score('timeout_done', 30, 30), score('timeout_undone', 20, 20)];
assert.strictEqual(Math.round(details.reduce((a, b) => a + b, 0) / details.length), 57);

// Bonus ke nilai ujian tulis: +20% nilai lisan, maks 100.
const withBonus = (tulis, lisan) => Math.min(100, Math.round(tulis + lisan * 0.2));
assert.strictEqual(withBonus(70, 100), 90);
assert.strictEqual(withBonus(70, 80), 86);
assert.strictEqual(withBonus(95, 100), 100);

console.log('OK: rumus nilai ujian lisan & bonus 20% sesuai.');

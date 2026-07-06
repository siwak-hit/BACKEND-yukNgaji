const axios = require('axios');

// =========================================================
// 1) STT: audio -> teks + timestamp per-kata (Groq Whisper-large-v3)
// =========================================================
async function transcribe(buffer, filename = 'audio.webm') {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY belum di-set di .env');

    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('language', 'ar');

    const res = await axios.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        form,
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, maxBodyLength: Infinity, timeout: 60000 }
    );
    const words = (res.data.words || []).map(w => ({ text: w.word, start: w.start, end: w.end, dur: +((w.end - w.start)).toFixed(3) }));
    return { text: res.data.text, words };
}

// =========================================================
// Normalisasi TEMPO (bukan baseline 2-kata yg goyah):
//   tempo = Σdurasi kata NON-graded siswa ÷ Σdurasi kata NON-graded rujukan.
//   Pakai semua kata "normal" → stabil, tahan noise timestamp kata pendek.
// Hanya mad PANJANG (graded:true) yang dinilai; mad thobi'i (graded:false) di-skip.
// =========================================================
// =========================================================
// Usul tag mad DETERMINISTIK dari teks Uthmani (bukan LLM — llama ngasal utk tajwid).
// Tanda mad "bendera" = U+0653 (ٓ maddah) / U+0622 (آ) nempel persis di mad wajib/jaiz/lazim.
// Klasifikasi: maddah diikuti hamza (dlm kata) = Wajib Muttasil; selain itu = Jaiz/Panjang.
// Guru tetap validasi/edit. mad thobi'i & aridh TIDAK diusulkan (ditambah manual guru bila perlu).
// =========================================================
const RE_MADDAH = /[ٓآ]/;
const RE_HAMZA = /[ءأإؤئ]/;
function suggestMad(words) {
    return words.map(w => {
        const t = w.t || w;
        const chars = [...t];
        const idx = chars.findIndex(c => RE_MADDAH.test(c));
        if (idx === -1) return { t };
        const after = chars.slice(idx + 1).join('');
        const mad = RE_HAMZA.test(after)
            ? { name: 'Mad Wajib Muttasil', graded: true, type: 'twoSided' }
            : { name: 'Mad Jaiz / Panjang', graded: true, type: 'twoSided' };
        return { t, mad };
    });
}

function isGraded(w) { return w.mad && w.mad.graded; }

function sumNonGraded(contentWords, durs) {
    return contentWords.reduce((s, w, i) => s + (isGraded(w) ? 0 : (durs[i] || 0)), 0);
}

// dipakai saat guru merekam rujukan: simpan durasi mentah tiap kata (index-aligned)
function extractProfile(contentWords, groqWords, transcript) {
    return {
        durs: groqWords.map(w => +(w.dur).toFixed(3)),
        transcript,
        at: new Date().toISOString(),
        wordMismatch: groqWords.length !== contentWords.length,
    };
}

function scoreOne(rel, oneSided) {
    if (rel < 0.5) return { s: 0, txt: 'Kurang panjang (dipotong)' };
    if (rel < 0.85) return { s: Math.round((rel - 0.5) / 0.35 * 100), txt: 'Agak kurang' };
    if (oneSided) return { s: 100, txt: 'Pas ✓' };            // mad aridh: lebih panjang tetap OK
    if (rel <= 1.2) return { s: 100, txt: 'Pas ✓' };
    return { s: Math.max(0, Math.round(100 - (rel - 1.2) * 150)), txt: 'Kelewat panjang' };
}

function scoreReading(refProfile, contentWords, groqWords) {
    const stuDurs = groqWords.map(w => w.dur);
    const refDurs = refProfile?.durs || [];
    const stuBase = sumNonGraded(contentWords, stuDurs);
    const refBase = sumNonGraded(contentWords, refDurs);
    const tempo = refBase > 0 ? stuBase / refBase : 1;

    const details = [];
    contentWords.forEach((w, i) => {
        if (!isGraded(w)) return;
        const refDur = refDurs[i], stuDur = stuDurs[i];
        if (!refDur || !stuDur) { details.push({ i, name: w.mad.name, s: null, txt: 'tak terukur' }); return; }
        const expected = refDur * tempo;               // durasi rujukan disesuaikan tempo siswa
        const rel = stuDur / expected;                 // 1.0 = pas seperti rujukan
        const r = scoreOne(rel, w.mad.type === 'oneSided');
        details.push({ i, name: w.mad.name, s: r.s, txt: r.txt,
            stuDur: +stuDur.toFixed(2), refDur: +refDur.toFixed(2), expected: +expected.toFixed(2), rel: +rel.toFixed(2) });
    });
    const scored = details.filter(d => d.s != null);
    const total = scored.length ? Math.round(scored.reduce((a, d) => a + d.s, 0) / scored.length) : null;
    return { total, tempo: +tempo.toFixed(2), details, wordMismatch: stuDurs.length !== contentWords.length };
}

module.exports = { transcribe, extractProfile, scoreReading, suggestMad };

// ---- self-check (node service/tajwidService.js) ----
if (require.main === module) {
    // An-Nasr:1 — hanya جاء (idx1) yang di-grade (mad wajib). izaa/allah = info (graded:false).
    const content = [
        { t: 'إذا', mad: { name: 'Thobii', graded: false } },
        { t: 'جاء', mad: { name: 'Wajib', graded: true, type: 'twoSided' } },
        { t: 'نصر' },
        { t: 'الله', mad: { name: 'Thobii', graded: false } },
        { t: 'والفتح' },
    ];
    const mk = ds => ds.map(d => ({ dur: d }));
    // rujukan (bacaan bener): جاء ditahan (2.10)
    const ref = extractProfile(content, mk([1.48, 2.10, 1.51, 0.62, 1.51]));
    const good = scoreReading(ref, content, mk([1.60, 1.94, 1.03, 1.55, 1.03])); // جاء ditahan -> pas
    const bad  = scoreReading(ref, content, mk([1.10, 0.70, 1.00, 0.90, 1.00])); // جاء dipotong -> jelek
    console.log('good (جاء ditahan):', good.total, good.details.map(d => `${d.name}=${d.s}(rel${d.rel})`));
    console.log('bad  (جاء dipotong):', bad.total, bad.details.map(d => `${d.name}=${d.s}(rel${d.rel})`));
    console.assert(good.details.length === 1, 'cuma 1 mad yg di-grade (جاء), izaa/allah di-skip');
    console.assert(good.total >= 80, 'جاء ditahan harus tinggi');
    console.assert(bad.total <= 40, 'جاء dipotong harus rendah');
    console.log('self-check OK');
}

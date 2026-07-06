const tajwidService = require('../service/tajwidService');
const tajwidModel = require('../model/tajwidModel');
const { getStudentsByTeacher } = require('../model/studentModel');
const pushService = require('../service/pushService');
const crypto = require('crypto');

const avgOf = (arr) => { const v = arr.filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

// GET /api/tajwid/surahs — daftar surat (dropdown)
const listSurahs = async (req, res) => {
    try {
        res.status(200).json({ status: 'success', data: await tajwidModel.listSurahs() });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// GET /api/tajwid/surah/:key — semua ayat 1 surat
const getSurahAyat = async (req, res) => {
    try {
        res.status(200).json({ status: 'success', data: await tajwidModel.getSurahAyat(req.params.key) });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// GET /api/tajwid/ayat/:id — 1 ayat + pecahan kata
const getAyat = async (req, res) => {
    try {
        const a = await tajwidModel.getAyat(req.params.id);
        res.status(200).json({ status: 'success', data: {
            id: a.id, surah_name: a.surah_name, ayah_no: a.ayah_no, arabic: a.arabic, words: a.words,
        }});
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// --- Fase B: reference guru ---

// GET /api/tajwid/ayat/:id/suggest — usul tag mad deterministik dari teks (guru validasi)
const suggestMad = async (req, res) => {
    try {
        const ayat = await tajwidModel.getAyat(req.params.id);
        res.status(200).json({ status: 'success', words: tajwidService.suggestMad(ayat.words), arabic: ayat.arabic });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// GET /api/tajwid/surah/:key/references — rujukan guru ini utk 1 surat (tandai ayat yg sudah dirujuk)
const getSurahReferences = async (req, res) => {
    try {
        res.status(200).json({ status: 'success', data: await tajwidModel.getSurahReferences(req.params.key, req.user.username) });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// GET /api/tajwid/ayat/:id/reference — reference milik guru ini (untuk cek timpa)
const getReference = async (req, res) => {
    try {
        const ref = await tajwidModel.getReference(req.params.id, req.user.username);
        res.status(200).json({ status: 'success', reference: ref });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// DELETE /api/tajwid/ayat/:id/reference — hapus rujukan (kalau rekaman kurang pas)
const deleteReference = async (req, res) => {
    try {
        await tajwidModel.deleteReference(req.params.id, req.user.username);
        res.status(200).json({ status: 'success' });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// POST /api/tajwid/ayat/:id/reference — simpan rujukan (tag tervalidasi + audio -> durasi)
const saveReference = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ status: 'error', message: 'File audio wajib' });
        let words;
        try { words = JSON.parse(req.body.words); }
        catch { return res.status(400).json({ status: 'error', message: 'words (tag tervalidasi) tidak valid' }); }

        const { words: groqWords, text } = await tajwidService.transcribe(req.file.buffer, req.file.originalname);
        const profile = tajwidService.extractProfile(words, groqWords, text);
        await tajwidModel.saveReference(req.params.id, req.user.username, words, profile.durs, text);
        res.status(200).json({ status: 'success', durs: profile.durs, wordMismatch: profile.wordMismatch, heard: text });
    } catch (e) {
        const d = e.response?.data || e.message;
        res.status(500).json({ status: 'error', message: typeof d === 'string' ? d : JSON.stringify(d) });
    }
};

// --- Fase C: latihan siswa (link publik) ---

// POST /api/tajwid/exercises — guru bikin latihan dari 1 surat (yg sudah dirujuk)
const createExercise = async (req, res) => {
    try {
        const { surah_key, title, window_size, pertemuan } = req.body;
        if (!surah_key) return res.status(400).json({ status: 'error', message: 'surah_key wajib' });
        // pastikan ada minimal 1 ayat yg sudah dirujuk guru ini
        const refs = await tajwidModel.getSurahReferences(surah_key, req.user.username);
        if (!refs.length) return res.status(409).json({ status: 'error', message: 'Belum ada ayat yang dirujuk di surat ini.' });
        const ex = await tajwidModel.createExercise({
            token: crypto.randomBytes(6).toString('hex'),
            created_by: req.user.username,
            surah_key, title: title || null,
            pertemuan: pertemuan != null && pertemuan !== '' ? parseInt(pertemuan) : null,
            window_size: Math.max(1, Math.min(parseInt(window_size) || 3, refs.length)),
        });
        res.status(200).json({ status: 'success', exercise: ex, referenced: refs.length });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// GET /api/tajwid/exercises — daftar latihan guru
const listExercises = async (req, res) => {
    try {
        res.status(200).json({ status: 'success', data: await tajwidModel.listExercises(req.user.username) });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// GET /api/tajwid/public/:token — info latihan + daftar nama siswa + pool ayat (PUBLIK)
const getPublicExercise = async (req, res) => {
    try {
        const ex = await tajwidModel.getExerciseByToken(req.params.token);
        if (!ex || !ex.is_active) return res.status(404).json({ status: 'error', message: 'Latihan tidak ditemukan.' });
        const refs = await tajwidModel.getSurahReferences(ex.surah_key, ex.created_by);
        const refByAyat = {}; refs.forEach(r => refByAyat[r.ayat_id] = r.words);
        const ayat = await tajwidModel.getSurahAyat(ex.surah_key); // urut ayah_no
        // grup per 4 ayat; hanya grup LENGKAP (semua ayatnya dirujuk) yang dipakai
        const total = ayat.length;
        const groups = [];
        for (let i = 0; i < ayat.length; i += 4) {
            const chunk = ayat.slice(i, i + 4);
            const allRef = chunk.every(a => refByAyat[a.id]);
            const complete = total <= 4 ? allRef : (chunk.length === 4 && allRef);
            if (complete) groups.push(chunk.map(a => ({ id: a.id, ayah_no: a.ayah_no, arabic: a.arabic, words: refByAyat[a.id] })));
        }
        const students = (await getStudentsByTeacher(ex.created_by)).map(s => ({ id: s.id, name: s.name }));
        const subs = await tajwidModel.listSubmissions(ex.id);
        const submitted = [...new Set(subs.map(s => s.student_id))];
        res.status(200).json({ status: 'success', data: {
            id: ex.id, title: ex.title, surah_key: ex.surah_key, groups, students, submitted,
        }});
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// Siswa boleh rekam ulang walau sudah dinilai (khusus akun uji). Case-insensitive.
const RETRY_WHITELIST = ['john doe', 'xaviera'];
const canRetry = (name) => RETRY_WHITELIST.includes((name || '').trim().toLowerCase());

// POST /api/tajwid/public/:token/ayat/:ayatId/score — siswa baca -> skor AI, DISIMPAN (PUBLIK)
const scorePublic = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ status: 'error', message: 'File audio wajib' });
        const { student_id, student_name } = req.body;
        if (!student_id) return res.status(400).json({ status: 'error', message: 'Nama siswa belum dipilih.' });

        const ex = await tajwidModel.getExerciseByToken(req.params.token);
        if (!ex || !ex.is_active) return res.status(404).json({ status: 'error', message: 'Latihan tidak ditemukan.' });
        const ayatId = req.params.ayatId;

        // aturan rekam-ulang: kalau sudah pernah setor & bukan akun whitelist -> tolak
        const existing = await tajwidModel.findSubmission(ex.id, ayatId, student_id);
        if (existing && !canRetry(student_name)) {
            return res.status(403).json({ status: 'error', message: 'Kamu sudah menilai ayat ini dan tidak bisa mengulang.' });
        }

        const ref = await tajwidModel.getReference(ayatId, ex.created_by);
        if (!ref) return res.status(409).json({ status: 'error', message: 'Ayat ini belum punya rujukan.' });

        const { words: groqWords, text } = await tajwidService.transcribe(req.file.buffer, req.file.originalname);
        const result = tajwidService.scoreReading({ durs: ref.durs }, ref.words, groqWords);

        // Kalau jumlah kata beda dari ayat -> AI salah dengar, penilaian tak reliable.
        // Jangan kasih skor menyesatkan & jangan disimpan; suruh ulang.
        if (result.wordMismatch) {
            return res.status(200).json({ status: 'success', unclear: true, heard: text, canRetry: canRetry(student_name) });
        }

        // simpan rekaman + hasil AI
        const path = `${ex.id}/${ayatId}/${student_id}-${Date.now()}.webm`;
        let audioUrl = null;
        try { audioUrl = await tajwidModel.uploadRecording(path, req.file.buffer); }
        catch (up) { console.error('upload rekaman gagal:', up.message); } // skor tetap jalan walau upload gagal
        await tajwidModel.upsertSubmission({
            exercise_id: ex.id, ayat_id: ayatId, student_id, student_name,
            audio_url: audioUrl, ai_score: result.total, ai_detail: result.details, transcript: text,
        });

        res.status(200).json({ status: 'success', ...result, heard: text, canRetry: canRetry(student_name) });
    } catch (e) {
        const d = e.response?.data || e.message;
        res.status(500).json({ status: 'error', message: typeof d === 'string' ? d : JSON.stringify(d) });
    }
};

// GET /api/tajwid/results-all — semua setoran guru (buat drill-down pertemuan→surat→siswa)
const resultsAll = async (req, res) => {
    try {
        res.status(200).json({ status: 'success', data: await tajwidModel.getAllSubmissionsByTeacher(req.user.username) });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// GET /api/tajwid/exercises/:id/submissions — setoran siswa untuk 1 latihan (guru pemilik)
const listSubmissions = async (req, res) => {
    try {
        const ex = await tajwidModel.getExerciseById(req.params.id);
        if (!ex || ex.created_by !== req.user.username) return res.status(404).json({ status: 'error', message: 'Latihan tidak ditemukan.' });
        res.status(200).json({ status: 'success', exercise: ex, data: await tajwidModel.listSubmissions(ex.id) });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// POST /api/tajwid/submissions/:id/review — guru koreksi nilai + catatan (nilai akhir)
const reviewSubmission = async (req, res) => {
    try {
        const sub = await tajwidModel.getSubmission(req.params.id);
        if (!sub) return res.status(404).json({ status: 'error', message: 'Setoran tidak ditemukan.' });
        const ex = await tajwidModel.getExerciseById(sub.exercise_id);
        if (!ex || ex.created_by !== req.user.username) return res.status(403).json({ status: 'error', message: 'Bukan latihanmu.' });
        const { final_score, teacher_note } = req.body;
        await tajwidModel.reviewSubmission(sub.id, final_score != null ? parseInt(final_score) : null, teacher_note || null);
        res.status(200).json({ status: 'success' });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// --- Fase E: kirim nilai akhir + push notif ---

// POST /api/tajwid/exercises/:id/students/:studentId/notify — guru kirim hasil ke siswa (push)
const notifyResult = async (req, res) => {
    try {
        const ex = await tajwidModel.getExerciseById(req.params.id);
        if (!ex || ex.created_by !== req.user.username) return res.status(404).json({ status: 'error', message: 'Latihan tidak ditemukan.' });
        const subs = await tajwidModel.getStudentSubmissions(ex.id, req.params.studentId);
        if (!subs.length) return res.status(404).json({ status: 'error', message: 'Siswa ini belum menyetor.' });
        const avg = avgOf(subs.map(s => s.final_score ?? s.ai_score));
        await pushService.sendToStudent(req.params.studentId, {
            title: 'Nilai Tajwid 📖',
            body: `Nilai bacaan tajwidmu: ${avg ?? '-'}. Ketuk untuk lihat detail & catatan guru.`,
            url: `/hasil-tajwid?e=${ex.id}&s=${req.params.studentId}&from=push`,
        });
        res.status(200).json({ status: 'success', avg });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// GET /api/tajwid/public/result/:exerciseId/:studentId — detail hasil utk siswa (PUBLIK, dibuka dari notif)
const getPublicStudentResult = async (req, res) => {
    try {
        const ex = await tajwidModel.getExerciseById(req.params.exerciseId);
        if (!ex) return res.status(404).json({ status: 'error', message: 'Latihan tidak ditemukan.' });
        const subs = await tajwidModel.getStudentSubmissions(ex.id, req.params.studentId);
        if (!subs.length) return res.status(404).json({ status: 'error', message: 'Belum ada hasil.' });
        const ayat = await tajwidModel.getSurahAyat(ex.surah_key);
        const ayahNo = {}; ayat.forEach(a => ayahNo[a.id] = a.ayah_no);
        const items = subs.map(s => ({
            ayah_no: ayahNo[s.ayat_id] ?? null,
            score: s.final_score ?? s.ai_score,
            is_final: s.final_score != null,
            teacher_note: s.teacher_note,
            detail: s.ai_detail,
        })).sort((a, b) => (a.ayah_no ?? 0) - (b.ayah_no ?? 0));
        res.status(200).json({ status: 'success', data: {
            student_name: subs[0].student_name, surah_key: ex.surah_key,
            avg: avgOf(items.map(i => i.score)), items,
        }});
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
};

// prototype lama (raw transcribe) — biarin buat debug
const transcribe = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ status: 'error', message: 'File audio wajib' });
        const t0 = Date.now();
        const { text, words } = await tajwidService.transcribe(req.file.buffer, req.file.originalname);
        res.status(200).json({ status: 'success', text, words, ms: Date.now() - t0 });
    } catch (e) {
        const d = e.response?.data || e.message;
        res.status(500).json({ status: 'error', message: typeof d === 'string' ? d : JSON.stringify(d) });
    }
};

module.exports = {
    listSurahs, getSurahAyat, getAyat, suggestMad, getReference, getSurahReferences, saveReference, deleteReference,
    createExercise, listExercises, getPublicExercise, scorePublic, listSubmissions, resultsAll, reviewSubmission,
    notifyResult, getPublicStudentResult, transcribe,
};

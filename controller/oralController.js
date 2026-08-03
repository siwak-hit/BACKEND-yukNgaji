const supabase = require('../config/supabaseClient');

// ============================================================
// UJIAN LISAN v2
// Bank perintah → sesi (antrian anak) → mode ujian (timer per perintah) → nilai.
// ============================================================

const SUBJECTS = ['tajwid', 'fiqih', 'tauhid'];

// Skoring 1 perintah (skala 0-100), dihitung DI SERVER supaya tak bisa dikarang klien.
// - selesai sebelum waktu habis  : 100 kalau <= separuh durasi, turun linear sampai 75 saat mepet
// - waktu habis tapi anaknya selesai : 50 (fifty-fifty)
// - waktu habis & belum selesai      : 20
const scoreOne = (outcome, usedSeconds, durationSeconds) => {
    if (outcome === 'timeout_done') return 50;
    if (outcome === 'timeout_undone') return 20;
    const dur = Math.max(1, Number(durationSeconds) || 1);
    const ratio = Math.min(1, Math.max(0, Number(usedSeconds) || 0) / dur);
    if (ratio <= 0.5) return 100;
    return Math.round(100 - 50 * (ratio - 0.5));
};

const OUTCOME_LABEL = {
    early: 'Selesai lebih cepat',
    timeout_done: 'Pas waktu habis (selesai)',
    timeout_undone: 'Waktu habis, belum selesai',
};

// ---------------- BANK PERINTAH ----------------

const listPrompts = async (req, res) => {
    try {
        let query = supabase.from('oral_prompts')
            .select('id, subject, category, title, duration_seconds, is_active, created_at')
            .eq('created_by', req.user.username)
            .order('created_at', { ascending: false });
        if (req.query.subject) query = query.eq('subject', req.query.subject);

        const { data, error } = await query;
        if (error) throw error;
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const createPrompt = async (req, res) => {
    try {
        const { subject, category, title, duration_seconds } = req.body;
        if (!subject || !category || !title) {
            return res.status(400).json({ status: 'error', message: 'Mapel, kategori, dan teks perintah wajib diisi.' });
        }
        const dur = parseInt(duration_seconds);
        if (!dur || dur < 5 || dur > 600) {
            return res.status(400).json({ status: 'error', message: 'Durasi harus 5-600 detik.' });
        }
        const { data, error } = await supabase.from('oral_prompts').insert({
            created_by: req.user.username,
            subject: String(subject).toLowerCase(),
            category: String(category).trim(),
            title: String(title).trim(),
            duration_seconds: dur,
        }).select().single();
        if (error) throw error;
        res.status(201).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const updatePrompt = async (req, res) => {
    try {
        const { category, title, duration_seconds, is_active, subject } = req.body;
        const patch = {};
        if (subject !== undefined) patch.subject = String(subject).toLowerCase();
        if (category !== undefined) patch.category = String(category).trim();
        if (title !== undefined) patch.title = String(title).trim();
        if (is_active !== undefined) patch.is_active = !!is_active;
        if (duration_seconds !== undefined) {
            const dur = parseInt(duration_seconds);
            if (!dur || dur < 5 || dur > 600) {
                return res.status(400).json({ status: 'error', message: 'Durasi harus 5-600 detik.' });
            }
            patch.duration_seconds = dur;
        }
        const { data, error } = await supabase.from('oral_prompts')
            .update(patch).eq('id', req.params.id).eq('created_by', req.user.username)
            .select().single();
        if (error) throw error;
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Hapus banyak sekaligus (bulk action di UI). Satu request, bukan N request.
const bulkDeletePrompts = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
        if (!ids.length) return res.status(400).json({ status: 'error', message: 'Tidak ada perintah yang dipilih.' });
        const { error } = await supabase.from('oral_prompts')
            .delete().in('id', ids).eq('created_by', req.user.username);
        if (error) throw error;
        res.status(200).json({ status: 'success', message: `${ids.length} perintah dihapus.` });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const deletePrompt = async (req, res) => {
    try {
        const { error } = await supabase.from('oral_prompts')
            .delete().eq('id', req.params.id).eq('created_by', req.user.username);
        if (error) throw error;
        res.status(200).json({ status: 'success', message: 'Perintah dihapus.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// ---------------- SESI ----------------

// Status sesi diturunkan dari anaknya (tidak disimpan) — hemat tulis & selalu akurat.
const sessionStatus = (rows) => {
    const total = rows.length;
    const done = rows.filter(r => r.status === 'done').length;
    if (!total) return 'draft';
    if (done === 0) return 'draft';
    return done === total ? 'done' : 'ongoing';
};

const listSessions = async (req, res) => {
    try {
        const { data: sessions, error } = await supabase.from('oral_sessions')
            .select('id, subject, title, per_student_seconds, created_at')
            .eq('created_by', req.user.username)
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!sessions.length) return res.status(200).json({ status: 'success', data: [] });

        const { data: rows, error: rowErr } = await supabase.from('oral_session_students')
            .select('session_id, status, final_score')
            .in('session_id', sessions.map(s => s.id));
        if (rowErr) throw rowErr;

        // Nomor pertemuan = urutan sesi dalam satu mapel (sesi tertua = 1). Diturunkan,
        // bukan disimpan, biar tak perlu kolom baru; kalau ada sesi dihapus nomornya merapat.
        const counter = {};
        const meetingNo = {};
        [...sessions].reverse().forEach(s => {   // list-nya terbaru→terlama, dibalik jadi terlama dulu
            counter[s.subject] = (counter[s.subject] || 0) + 1;
            meetingNo[s.id] = counter[s.subject];
        });

        const data = sessions.map(s => {
            const mine = (rows || []).filter(r => r.session_id === s.id);
            const scores = mine.filter(r => r.status === 'done').map(r => r.final_score || 0);
            return {
                ...s,
                meeting_no: meetingNo[s.id],
                total_students: mine.length,
                done_students: scores.length,
                status: sessionStatus(mine),
                avg_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
            };
        });
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const createSession = async (req, res) => {
    try {
        const { subject, title, per_student_seconds, students } = req.body;
        if (!subject || !Array.isArray(students) || !students.length) {
            return res.status(400).json({ status: 'error', message: 'Mapel dan minimal 1 murid wajib diisi.' });
        }
        const perStudent = parseInt(per_student_seconds) || 300;

        // Validasi jatah waktu pakai durasi dari DB (bukan kiriman klien).
        const allIds = [...new Set(students.flatMap(s => s.prompt_ids || []))];
        if (!allIds.length) return res.status(400).json({ status: 'error', message: 'Setiap murid minimal punya 1 perintah.' });

        const { data: prompts, error: pErr } = await supabase.from('oral_prompts')
            .select('id, duration_seconds').eq('created_by', req.user.username).in('id', allIds);
        if (pErr) throw pErr;
        const durMap = new Map((prompts || []).map(p => [p.id, p.duration_seconds]));

        for (const s of students) {
            const ids = (s.prompt_ids || []).filter(id => durMap.has(id));
            if (!ids.length) return res.status(400).json({ status: 'error', message: 'Ada murid yang belum dipilihkan perintah.' });
            const total = ids.reduce((sum, id) => sum + durMap.get(id), 0);
            if (total > perStudent) {
                return res.status(400).json({ status: 'error', message: `Total perintah salah satu murid (${total} detik) melebihi jatah sesi (${perStudent} detik).` });
            }
        }

        const { data: session, error: sErr } = await supabase.from('oral_sessions').insert({
            created_by: req.user.username,
            subject: String(subject).toLowerCase(),
            title: (title || '').trim() || null,
            per_student_seconds: perStudent,
        }).select().single();
        if (sErr) throw sErr;

        const rows = students.map((s, i) => ({
            session_id: session.id,
            student_id: s.student_id,
            order_index: i,
            prompt_ids: (s.prompt_ids || []).filter(id => durMap.has(id)),
        }));
        const { error: rErr } = await supabase.from('oral_session_students').insert(rows);
        if (rErr) throw rErr;

        res.status(201).json({ status: 'success', data: session });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Satu payload lengkap untuk halaman ujian: sesi + antrian anak + perintah utuh.
// Sengaja digabung supaya halaman main cuma butuh 1 request lalu jalan offline-ish.
const getSessionDetail = async (req, res) => {
    try {
        const { data: session, error } = await supabase.from('oral_sessions')
            .select('id, subject, title, per_student_seconds, created_at, live_code')
            .eq('id', req.params.id).eq('created_by', req.user.username).maybeSingle();
        if (error) throw error;
        if (!session) return res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan.' });
        session.live_code = await ensureLiveCode(session);

        const { data: rows, error: rErr } = await supabase.from('oral_session_students')
            .select('id, student_id, order_index, prompt_ids, status, final_score, details, done_at')
            .eq('session_id', session.id).order('order_index', { ascending: true });
        if (rErr) throw rErr;

        const studentIds = rows.map(r => r.student_id);
        const promptIds = [...new Set(rows.flatMap(r => r.prompt_ids || []))];

        const [{ data: students }, { data: prompts }] = await Promise.all([
            studentIds.length ? supabase.from('students').select('id, name, grade').in('id', studentIds) : { data: [] },
            promptIds.length ? supabase.from('oral_prompts').select('id, category, title, duration_seconds').in('id', promptIds) : { data: [] },
        ]);
        const nameMap = new Map((students || []).map(s => [s.id, s]));
        const promptMap = new Map((prompts || []).map(p => [p.id, p]));

        const queue = rows.map(r => ({
            ...r,
            name: nameMap.get(r.student_id)?.name || 'Murid',
            grade: nameMap.get(r.student_id)?.grade || '',
            prompts: (r.prompt_ids || []).map(id => promptMap.get(id)).filter(Boolean),
        }));

        res.status(200).json({
            status: 'success',
            data: { ...session, status: sessionStatus(rows), queue },
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// ---------------- MODE 2 DEVICE (layar guru ↔ layar murid) ----------------
// Tidak ada websocket: guru MENULIS satu baris state, layar murid MEMBACA tiap detik.
// Kuncinya `startAt` distempel SERVER dan tiap balasan menyertakan `now`, jadi kedua
// device bisa mengoreksi selisih jamnya sendiri dan hitung mundurnya jalan lokal —
// polling telat sedetik pun timernya tetap sama persis.
const IDLE = { phase: 'idle' };
const makeCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// Kode dibuat saat sesi pertama kali dibuka (bukan saat dibuat) supaya sesi lama ikut kebagian.
const ensureLiveCode = async (session) => {
    if (session.live_code) return session.live_code;
    for (let i = 0; i < 3; i++) {
        const code = makeCode();
        const { error } = await supabase.from('oral_sessions')
            .update({ live_code: code }).eq('id', session.id);
        if (!error) return code;
        if (error.code !== '23505') throw error;   // 23505 = kode kembar, coba lagi
    }
    throw new Error('Gagal membuat kode layar.');
};

const pushLive = async (req, res) => {
    try {
        const state = { ...(req.body.state || {}) };
        // Distempel sekali saja: kiriman berikutnya (mis. nempel pesan/gambar) bawa startAt lama
        // supaya timer yang sedang jalan tidak ikut kereset.
        if (state.phase === 'run' && !state.startAt) state.startAt = Date.now();

        const { data, error } = await supabase.from('oral_sessions')
            .update({ live_state: state }).eq('id', req.params.id).eq('created_by', req.user.username)
            .select('id').maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan.' });

        res.status(200).json({ status: 'success', data: { state, now: Date.now() } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Publik (dipanggil layar murid yang tidak login) — kodenya acak & cuma berisi soal berjalan.
const getLive = async (req, res) => {
    try {
        const { data, error } = await supabase.from('oral_sessions')
            .select('title, subject, live_state').eq('live_code', String(req.params.code || '').toUpperCase()).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ status: 'error', message: 'Layar tidak ditemukan. Cek lagi linknya.' });

        // Foto/GIF kejutan (base64) TIDAK ikut di sini — polling tiap detik jadi berat.
        // Yang dikirim cuma penandanya; gambarnya diambil sekali lewat endpoint di bawah.
        const st = data.live_state || IDLE;
        const state = st.media?.data ? { ...st, media: { id: st.media.id, until: st.media.until } } : st;

        res.status(200).json({
            status: 'success',
            data: { title: data.title, subject: data.subject, state, now: Date.now() },
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const getLiveMedia = async (req, res) => {
    try {
        const { data, error } = await supabase.from('oral_sessions')
            .select('live_state').eq('live_code', String(req.params.code || '').toUpperCase()).maybeSingle();
        if (error) throw error;
        const media = data?.live_state?.media;
        if (!media?.data) return res.status(404).json({ status: 'error', message: 'Tidak ada gambar.' });
        res.status(200).json({ status: 'success', data: { id: media.id, data: media.data } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const bulkDeleteSessions = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
        if (!ids.length) return res.status(400).json({ status: 'error', message: 'Tidak ada sesi yang dipilih.' });

        const { data: owned } = await supabase.from('oral_sessions')
            .select('id').eq('created_by', req.user.username).in('id', ids);
        const ownedIds = (owned || []).map(s => s.id);
        if (!ownedIds.length) return res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan.' });

        await supabase.from('oral_session_students').delete().in('session_id', ownedIds);
        const { error } = await supabase.from('oral_sessions').delete().in('id', ownedIds);
        if (error) throw error;
        res.status(200).json({ status: 'success', message: `${ownedIds.length} sesi dihapus.` });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const deleteSession = async (req, res) => {
    try {
        const { data: owned } = await supabase.from('oral_sessions')
            .select('id').eq('id', req.params.id).eq('created_by', req.user.username).maybeSingle();
        if (!owned) return res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan.' });

        await supabase.from('oral_session_students').delete().eq('session_id', req.params.id);
        const { error } = await supabase.from('oral_sessions').delete().eq('id', req.params.id);
        if (error) throw error;
        res.status(200).json({ status: 'success', message: 'Sesi dihapus.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Klien cuma kirim FAKTA mentah: {prompt_id, used_seconds, outcome}. Nilainya dihitung di sini.
const submitStudentResult = async (req, res) => {
    try {
        const { id: sessionId, studentId } = req.params;
        const { items } = req.body;
        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ status: 'error', message: 'Data hasil kosong.' });
        }

        const { data: session } = await supabase.from('oral_sessions')
            .select('id, subject').eq('id', sessionId).eq('created_by', req.user.username).maybeSingle();
        if (!session) return res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan.' });

        const { data: prompts } = await supabase.from('oral_prompts')
            .select('id, category, title, duration_seconds').in('id', items.map(i => i.prompt_id));
        const promptMap = new Map((prompts || []).map(p => [p.id, p]));

        const details = items.map(i => {
            const p = promptMap.get(i.prompt_id);
            const duration = p ? p.duration_seconds : (parseInt(i.duration) || 30);
            const used = Math.min(duration, Math.max(0, Math.round(Number(i.used_seconds) || 0)));
            const outcome = ['early', 'timeout_done', 'timeout_undone'].includes(i.outcome) ? i.outcome : 'timeout_undone';
            return {
                prompt_id: i.prompt_id,
                title: p ? p.title : '(perintah dihapus)',
                category: p ? p.category : '-',
                duration, used, outcome,
                outcome_label: OUTCOME_LABEL[outcome],
                score: scoreOne(outcome, used, duration),
            };
        });
        const finalScore = Math.round(details.reduce((sum, d) => sum + d.score, 0) / details.length);

        const { data, error } = await supabase.from('oral_session_students')
            .update({ status: 'done', final_score: finalScore, details, done_at: new Date().toISOString() })
            .eq('session_id', sessionId).eq('student_id', studentId)
            .select('id, student_id, final_score, details').single();
        if (error) throw error;

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        console.error('Submit oral result error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Nilai lisan TERBARU per mapel — dipakai halaman murid & raport (bonus 20% ke nilai ujian).
const getStudentSummary = async (req, res) => {
    try {
        const { data: rows, error } = await supabase.from('oral_session_students')
            .select('final_score, done_at, details, oral_sessions!inner(subject, title, created_by)')
            .eq('student_id', req.params.studentId).eq('status', 'done')
            .eq('oral_sessions.created_by', req.user.username)
            .order('done_at', { ascending: false });
        if (error) throw error;

        const summary = {};
        const detail = {};
        SUBJECTS.forEach(s => { summary[s] = null; detail[s] = null; });
        (rows || []).forEach(r => {
            const subj = r.oral_sessions?.subject;
            if (!subj || summary[subj] !== null) return;   // sudah terisi = yang lebih baru
            summary[subj] = r.final_score;
            detail[subj] = { done_at: r.done_at, session_title: r.oral_sessions?.title || null, items: r.details || [] };
        });

        res.status(200).json({ status: 'success', data: { summary, detail } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    listPrompts, createPrompt, updatePrompt, deletePrompt, bulkDeletePrompts,
    listSessions, createSession, getSessionDetail, deleteSession, bulkDeleteSessions,
    pushLive, getLive, getLiveMedia,
    submitStudentResult, getStudentSummary,
    _scoreOne: scoreOne,   // dipakai scripts/testOralScore.js
};

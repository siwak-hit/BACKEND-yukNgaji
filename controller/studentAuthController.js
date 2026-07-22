const supabase = require('../config/supabaseClient');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pushService = require('../service/pushService');
const { JUZ_AMMA } = require('./memorizationController');

// POST /api/student/login  (publik)
// username = NAMA DEPAN (kata pertama) huruf kecil; password = namadepan + "123" huruf kecil.
// Contoh DB "Ica" -> login "ica" / "ica123". DB "Budi Santoso" -> "budi" / "budi123".
const firstName = (n) => String(n || '').trim().split(/\s+/)[0].toLowerCase();

const login = async (req, res) => {
    try {
        let { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi' });
        }
        username = String(username).trim().toLowerCase();
        password = String(password).trim();

        // ponytail: ambil semua murid lalu cocokkan nama depan; jumlah murid se-TPA kecil.
        const { data: students, error } = await supabase
            .from('students')
            .select('id, name, password');
        if (error) throw error;

        const candidates = (students || []).filter(s => firstName(s.name) === username);
        if (!candidates.length) {
            return res.status(401).json({ status: 'error', message: 'Username atau password salah' });
        }

        let student = null;
        for (const s of candidates) {
            const expected = firstName(s.name) + '123';          // skema deterministik
            if (password.toLowerCase() === expected) { student = s; break; }
            // Fallback: password custom di DB (bcrypt $2.. atau plaintext).
            if (s.password) {
                const m = s.password.startsWith('$2')
                    ? await bcrypt.compare(password, s.password)
                    : password === s.password;
                if (m) { student = s; break; }
            }
        }

        if (!student) {
            return res.status(401).json({ status: 'error', message: 'Username atau password salah' });
        }

        const token = jwt.sign(
            { student_id: student.id, role: 'student', name: student.name },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.status(200).json({
            status: 'success',
            message: 'Login berhasil',
            data: { student_id: student.id, name: student.name, token }
        });
    } catch (err) {
        console.error('Student login error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/student/reports  (token murid)
// Tolak jika murid masih punya pengaduan 'open'.
const submitReport = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });

        const { category, message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ status: 'error', message: 'Pesan tidak boleh kosong' });
        }

        const { data: open, error: openErr } = await supabase
            .from('student_reports')
            .select('id')
            .eq('student_id', student_id)
            .eq('status', 'open')
            .limit(1);
        if (openErr) throw openErr;
        if (open && open.length > 0) {
            return res.status(409).json({ status: 'error', message: 'Masih ada pengaduan yang belum ditangani guru.' });
        }

        const { data, error } = await supabase
            .from('student_reports')
            .insert([{ student_id, category: category || null, message: message.trim() }])
            .select()
            .single();
        if (error) throw error;

        return res.status(201).json({ status: 'success', data });
    } catch (err) {
        console.error('Submit report error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/reports/mine  (token murid) — riwayat + status lock
const getMyReports = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });

        const { data, error } = await supabase
            .from('student_reports')
            .select('*')
            .eq('student_id', student_id)
            .order('created_at', { ascending: true });
        if (error) throw error;

        const locked = (data || []).some(r => r.status === 'open');
        return res.status(200).json({ status: 'success', data: data || [], locked });
    } catch (err) {
        console.error('Get my reports error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/reports  (token guru) — daftar pengaduan murid bimbingannya
const getReportsForTeacher = async (req, res) => {
    try {
        const teacher = req.user.username;
        if (!teacher) return res.status(403).json({ status: 'error', message: 'Hanya untuk guru' });

        const { data, error } = await supabase
            .from('student_reports')
            .select('*, students!inner(name, grade, created_by)')
            .eq('students.created_by', teacher)
            .order('created_at', { ascending: false });
        if (error) throw error;

        return res.status(200).json({ status: 'success', data: data || [] });
    } catch (err) {
        console.error('Get teacher reports error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// PATCH /api/student/reports/:id/resolve  (token guru)
const resolveReport = async (req, res) => {
    try {
        const teacher = req.user.username;
        if (!teacher) return res.status(403).json({ status: 'error', message: 'Hanya untuk guru' });

        const { id } = req.params;
        const { data, error } = await supabase
            .from('student_reports')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        if (!data) return res.status(404).json({ status: 'error', message: 'Pengaduan tidak ditemukan' });

        return res.status(200).json({ status: 'success', data });
    } catch (err) {
        console.error('Resolve report error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/public/students  (PUBLIK) — daftar nama utk pencarian izin
const getPublicStudents = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('students')
            .select('id, name, grade')
            .order('name', { ascending: true });
        if (error) throw error;
        return res.status(200).json({ status: 'success', data: data || [] });
    } catch (err) {
        console.error('Public students error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/student/public/izin  (PUBLIK) — siswa kirim izin + alasan tanpa login
const submitPublicIzin = async (req, res) => {
    try {
        const { student_id, reason } = req.body;
        if (!student_id || !reason) {
            return res.status(400).json({ status: 'error', message: 'Nama dan alasan wajib diisi' });
        }
        // Pastikan student valid (cegah spam id ngawur).
        const { data: std, error: sErr } = await supabase.from('students').select('id').eq('id', student_id).single();
        if (sErr || !std) return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan' });

        // Maks 1 izin per hari. Cek apakah sudah ada izin sejak awal hari ini.
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const { data: todayIzin } = await supabase
            .from('student_reports')
            .select('id')
            .eq('student_id', student_id)
            .eq('category', 'Izin')
            .gte('created_at', startOfDay.toISOString())
            .limit(1);
        if (todayIzin && todayIzin.length) {
            return res.status(409).json({ status: 'error', message: 'Kamu sudah mengajukan izin hari ini. Coba lagi besok ya.' });
        }

        const { data, error } = await supabase
            .from('student_reports')
            .insert([{ student_id, category: 'Izin', message: String(reason).trim(), status: 'open' }])
            .select().single();
        if (error) throw error;
        return res.status(201).json({ status: 'success', data });
    } catch (err) {
        console.error('Public izin error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/izin/pending  (token guru) — daftar izin harian yang belum diputuskan
const getPendingIzin = async (req, res) => {
    try {
        const teacher = req.user.username;
        if (!teacher) return res.status(403).json({ status: 'error', message: 'Hanya untuk guru' });
        const { data, error } = await supabase
            .from('student_reports')
            .select('*, students!inner(name, grade, created_by)')
            .eq('category', 'Izin')
            .eq('status', 'open')
            .eq('students.created_by', teacher)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ status: 'success', data: data || [] });
    } catch (err) {
        console.error('Pending izin error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// PATCH /api/student/izin/:id/decide  (token guru) — Terima (izin) / Tolak (alpa)
// → tulis ke attendances hari ini + update status + push ke murid.
const decideIzin = async (req, res) => {
    try {
        const teacher = req.user.username;
        if (!teacher) return res.status(403).json({ status: 'error', message: 'Hanya untuk guru' });
        const { id } = req.params;
        const decision = req.body && req.body.decision; // 'accept' | 'reject'
        if (!['accept', 'reject'].includes(decision)) {
            return res.status(400).json({ status: 'error', message: 'Keputusan tidak valid' });
        }

        // Ambil izin + pastikan murid milik guru ini.
        const { data: rep, error: repErr } = await supabase
            .from('student_reports')
            .select('id, student_id, message, status, students!inner(name, created_by)')
            .eq('id', id).single();
        if (repErr || !rep) return res.status(404).json({ status: 'error', message: 'Izin tidak ditemukan' });
        if (rep.students.created_by !== teacher) return res.status(403).json({ status: 'error', message: 'Bukan murid Anda' });

        // Tulis ke kehadiran hari ini (Asia/Jakarta), merge ke baris (date, created_by).
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const { data: attRows } = await supabase
            .from('attendances').select('id, subject, present_students')
            .eq('date', today).eq('created_by', teacher).limit(1);
        const att = attRows && attRows[0];
        // Petakan alasan izin → status absensi (izin:sakit/pergi/haid/belajar/lainnya).
        const mapIzin = (msg) => {
            const m = String(msg || '').toLowerCase();
            if (m.includes('sakit')) return 'izin:sakit';
            if (m.includes('haid')) return 'izin:haid';
            if (m.includes('belajar')) return 'izin:belajar';
            if (m.includes('pergi')) return 'izin:pergi';
            return 'izin:lainnya';
        };
        const present = (att && att.present_students) || {};
        present[rep.student_id] = decision === 'accept'
            ? { status: mapIzin(rep.message), reason: rep.message || 'Izin' }
            : { status: 'alpa', reason: 'Izin ditolak' };
        const { error: upErr } = await supabase
            .from('attendances')
            .upsert({ date: today, subject: (att && att.subject) || 'Kehadiran Harian', present_students: present, created_by: teacher }, { onConflict: 'date, created_by' });
        if (upErr) throw upErr;

        // Update status izin.
        await supabase.from('student_reports')
            .update({ status: decision === 'accept' ? 'accepted' : 'rejected', resolved_at: new Date().toISOString() })
            .eq('id', id);

        // Push ke murid.
        try {
            const payload = decision === 'accept'
                ? { title: 'Izin diterima ✅', body: 'Izinmu hari ini diterima Kak Aziz.', url: '/chats?from=push' }
                : { title: 'Izin ditolak ❌', body: 'Izinmu hari ini ditolak — kamu tercatat alpha.', url: '/chats?from=push' };
            await pushService.sendToStudent(rep.student_id, payload);
        } catch (e) { console.error('Push izin decide error:', e.message); }

        return res.status(200).json({ status: 'success' });
    } catch (err) {
        console.error('Decide izin error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/push/overdue-scan  (dipanggil cron) — push "tugas lewat deadline".
// Dilindungi CRON_SECRET (header Authorization: Bearer <secret> atau ?secret=). Dedup via overdue_notifs.
const overdueScan = async (req, res) => {
    try {
        const secret = process.env.CRON_SECRET;
        const provided = (req.headers.authorization || '').replace('Bearer ', '') || req.query.secret;
        if (secret && provided !== secret) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

        const now = new Date();
        const [{ data: locks }, { data: students }, { data: done }, { data: logged }] = await Promise.all([
            supabase.from('pr_locks').select('subject, week, deadline_at, extended_students').eq('is_locked', true).not('deadline_at', 'is', null),
            supabase.from('students').select('id'),
            supabase.from('onboarding_results').select('student_id, subject, week'),
            supabase.from('overdue_notifs').select('student_id, subject, week'),
        ]);

        const overdue = (locks || []).filter(l => new Date(l.deadline_at) < now);
        const doneSet = new Set((done || []).map(d => `${d.student_id}|${d.subject}|${d.week}`));
        const loggedSet = new Set((logged || []).map(d => `${d.student_id}|${d.subject}|${d.week}`));
        const pushService = require('../service/pushService');

        const subjName = (s) => ({ tajwid: 'Tajwid', fiqih: 'Fiqih', tauhid: 'Tauhid' }[s] || s);
        let pushed = 0;

        for (const lock of overdue) {
            let ext = lock.extended_students;
            try { while (typeof ext === 'string') ext = JSON.parse(ext); } catch { ext = []; }
            if (!Array.isArray(ext)) ext = [];

            for (const s of (students || [])) {
                const key = `${s.id}|${lock.subject}|${lock.week}`;
                if (doneSet.has(key) || loggedSet.has(key)) continue;
                // Punya dispensasi aktif (until > now) → belum dianggap lewat.
                const mine = ext.find(e => (typeof e === 'object' ? e.student_id : e) === s.id);
                if (mine && mine.until && new Date(mine.until) > now) continue;

                await pushService.sendToStudent(s.id, {
                    title: 'Tugas lewat batas ⏰',
                    body: `Tugas ${subjName(lock.subject)} Pertemuan ${lock.week} sudah melebihi batas pengerjaan. Minta izin ke Kak Aziz untuk melanjutkan ya.`,
                    url: `/sistem?from=push&overdue=${lock.subject}:${lock.week}`,
                });
                await supabase.from('overdue_notifs').insert({ student_id: s.id, subject: lock.subject, week: lock.week });
                pushed++;
            }
        }
        return res.status(200).json({ status: 'success', pushed });
    } catch (err) {
        console.error('Overdue scan error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/public/izin-today  (PUBLIK) — cek apakah murid sudah izin hari ini
const getIzinToday = async (req, res) => {
    try {
        const { student_id } = req.query;
        if (!student_id) return res.status(400).json({ status: 'error', message: 'student_id wajib' });
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const { data } = await supabase
            .from('student_reports')
            .select('message, created_at')
            .eq('student_id', student_id)
            .eq('category', 'Izin')
            .gte('created_at', startOfDay.toISOString())
            .order('created_at', { ascending: false })
            .limit(1);
        const row = data && data[0];
        return res.status(200).json({ status: 'success', data: { izined: !!row, reason: row ? row.message : null } });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/me  (token murid) — profil & dompet/inventory diri sendiri
// (Endpoint /api/students/:id milik guru, di-scope created_by, jadi tak bisa dipakai murid.)
const getMyProfile = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });
        const { data, error } = await supabase
            .from('students')
            .select('id, name, grade, poin, item_double_score, item_extra_life')
            .eq('id', student_id)
            .single();
        if (error) throw error;
        return res.status(200).json({ status: 'success', data });
    } catch (err) {
        console.error('Get my profile error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/student/refund-coins  (token murid) — kembalikan koin (mis. beli waktu tapi keburu habis).
// Dibatasi maks 100 biar aman.
const refundCoins = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });
        const amount = Math.min(Number(req.body?.amount) || 0, 100);
        if (amount <= 0) return res.status(400).json({ status: 'error', message: 'Nominal tidak valid' });
        const { data: s } = await supabase.from('students').select('poin').eq('id', student_id).single();
        const newPoin = (Number(s?.poin) || 0) + amount;
        const { error } = await supabase.from('students').update({ poin: newPoin }).eq('id', student_id);
        if (error) throw error;
        return res.status(200).json({ status: 'success', data: { poin: newPoin } });
    } catch (err) {
        console.error('Refund error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/tasks  (token murid)
// PR/tugas = pr_locks(is_locked=true). Selesai = ada di onboarding_results.
// Balikin yang BELUM dikerjakan + flag telat (lewat deadline & tanpa dispensasi aktif).
const getMyTasks = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });

        // Sumber daftar tugas = ADANYA soal (tabel questions). Begitu guru selesai bikin soal utk
        // (subject, week), tugas langsung muncul ke murid — tanpa harus buka gembok dulu.
        // pr_locks kini hanya dipakai utk info deadline + dispensasi (opsional per tugas).
        const [{ data: qs, error: qErr }, { data: locks, error: lockErr }, { data: done, error: doneErr }, { data: reqs, error: reqErr }] = await Promise.all([
            supabase.from('questions').select('subject, week'),
            supabase.from('pr_locks').select('subject, week, deadline_at, extended_students'),
            supabase.from('onboarding_results').select('subject, week').eq('student_id', student_id),
            supabase.from('pr_extension_requests').select('subject, week, status').eq('student_id', student_id),
        ]);
        if (qErr) throw qErr;
        if (lockErr) throw lockErr;
        if (doneErr) throw doneErr;
        if (reqErr) throw reqErr;

        const doneSet = new Set((done || []).map(d => `${d.subject}|${d.week}`));
        const lockMap = {};
        (locks || []).forEach(l => { lockMap[`${l.subject}|${l.week}`] = l; });
        // Status izin per PR: 'granted' menang atas 'pending'.
        const izinMap = {};
        (reqs || []).forEach(r => {
            const k = `${r.subject}|${r.week}`;
            if (r.status === 'granted' || !izinMap[k]) izinMap[k] = r.status;
        });
        const now = new Date();

        // (subject, week) unik dari soal yang ADA, buang yang sudah dikerjakan.
        // ponytail: dedup di JS (questions kolomnya cuma 2, distinct-nya ringan).
        const seen = new Set();
        const pending = [];
        (qs || []).forEach(q => {
            const key = `${q.subject}|${q.week}`;
            if (seen.has(key) || doneSet.has(key)) return;
            seen.add(key);
            const l = lockMap[key] || {};
            // Dispensasi murid ini (extended_students bisa jsonb string/array).
            let ext = l.extended_students;
            try { while (typeof ext === 'string') ext = JSON.parse(ext); } catch { ext = []; }
            if (!Array.isArray(ext)) ext = [];
            const mine = ext.find(e => (typeof e === 'object' ? e.student_id : e) === student_id);
            const extUntil = mine && mine.until ? new Date(mine.until) : null;

            let late = false;
            if (l.deadline_at) {
                const dl = new Date(l.deadline_at);
                late = extUntil ? now > extUntil : now > dl;
            }
            pending.push({
                subject: q.subject, week: q.week, deadline_at: l.deadline_at || null, late,
                has_extension: !!mine,
                izin_status: izinMap[key] || 'none', // none | pending | granted | rejected
            });
        });
        pending.sort((a, b) => (a.subject).localeCompare(b.subject) || a.week - b.week);

        return res.status(200).json({ status: 'success', data: pending });
    } catch (err) {
        console.error('Get tasks error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/notifications  (token murid)
// Notif izin yang sudah DISETUJUI guru: sampai kapan, ada potongan nilai/tidak, sudah dikerjakan/belum.
const getMyNotifications = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });

        const [{ data: grants, error: gErr }, { data: locks, error: lErr }, { data: done, error: dErr }] = await Promise.all([
            supabase.from('pr_extension_requests')
                .select('subject, week, extension_until, with_penalty, responded_at')
                .eq('student_id', student_id).eq('status', 'granted')
                .order('responded_at', { ascending: false }),
            supabase.from('pr_locks').select('subject, week, extended_students'),
            supabase.from('onboarding_results').select('subject, week').eq('student_id', student_id),
        ]);
        if (gErr) throw gErr; if (lErr) throw lErr; if (dErr) throw dErr;

        const doneSet = new Set((done || []).map(d => `${d.subject}|${d.week}`));
        // Map persen potongan + batas waktu dari pr_locks.extended_students (sumber otoritatif).
        const lockMap = {};
        (locks || []).forEach(l => {
            let ext = l.extended_students;
            try { while (typeof ext === 'string') ext = JSON.parse(ext); } catch { ext = []; }
            if (!Array.isArray(ext)) ext = [];
            const mine = ext.find(e => (typeof e === 'object' ? e.student_id : e) === student_id);
            if (mine) lockMap[`${l.subject}|${l.week}`] = { until: mine.until, penalty_percent: mine.penalty_percent || 0 };
        });

        const now = new Date();
        const data = (grants || []).map(g => {
            const k = `${g.subject}|${g.week}`;
            const lm = lockMap[k] || {};
            const until = g.extension_until || lm.until || null;
            const expired = until ? now > new Date(until) : false;
            return {
                subject: g.subject, week: g.week, until,
                with_penalty: !!g.with_penalty,
                penalty_percent: lm.penalty_percent || 0,
                done: doneSet.has(k),
                expired,
                responded_at: g.responded_at,
            };
        });

        return res.status(200).json({ status: 'success', data });
    } catch (err) {
        console.error('Get notifications error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/my/memorization  (token murid) — hafalan diri sendiri (posisi terkini + riwayat)
const getMyMemorization = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });
        const [{ data: st, error: sErr }, { data: logs, error: lErr }] = await Promise.all([
            supabase.from('students').select('name, current_surah_id, current_ayah').eq('id', student_id).single(),
            supabase.from('memorization_logs').select('date, surah_name, start_ayah, end_ayah, added_ayahs')
                .eq('student_id', student_id).order('date', { ascending: false }).limit(50),
        ]);
        if (sErr) throw sErr; if (lErr) throw lErr;
        const surah = st?.current_surah_id ? JUZ_AMMA.find(s => s.id === st.current_surah_id) : null;
        return res.status(200).json({ status: 'success', data: {
            current: surah ? { surah_id: st.current_surah_id, surah_name: surah.name, ayah: st.current_ayah || 0, total_ayahs: surah.ayahs } : null,
            logs: logs || [],
        }});
    } catch (err) {
        console.error('Get my memorization error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/my/gallery  (token murid) — foto satpam (bucket satpam_faces) milik sendiri
const getMyGallery = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });
        const { data, error } = await supabase.from('satpam_logs')
            .select('photo_url, subject, week').eq('student_id', student_id);
        if (error) throw error;
        // Samakan bentuk output dgn yg dipakai frontend: {image_url, subject, week}
        const rows = (data || []).filter(r => r.photo_url).map(r => ({ image_url: r.photo_url, subject: r.subject, week: r.week }));
        return res.status(200).json({ status: 'success', data: rows });
    } catch (err) {
        console.error('Get my gallery error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/my/grades  (token murid) — nilai tiap tugas (per mapel & pertemuan).
// Semua tugas (subject,week) dari tabel questions ditampilkan; yg belum dikerjakan → score null.
const getMyGrades = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });
        const [{ data: qs, error: qErr }, { data: results, error: rErr }] = await Promise.all([
            supabase.from('questions').select('subject, week'),
            supabase.from('onboarding_results').select('subject, week, score').eq('student_id', student_id),
        ]);
        if (qErr) throw qErr; if (rErr) throw rErr;
        // Map hasil: key "subject|week" → score (bisa 0). Pakai 'in' agar 0 ≠ belum dikerjakan.
        const scoreMap = {};
        (results || []).forEach(r => { scoreMap[`${r.subject}|${r.week}`] = r.score; });
        const seen = new Set();
        const rows = [];
        (qs || []).forEach(q => {
            const key = `${q.subject}|${q.week}`;
            if (seen.has(key)) return; seen.add(key);
            rows.push({ subject: q.subject, week: q.week, score: key in scoreMap ? scoreMap[key] : null });
        });
        // Hasil yg soalnya sudah tak ada lagi tetap dimasukkan biar nilainya tak hilang.
        (results || []).forEach(r => {
            const key = `${r.subject}|${r.week}`;
            if (!seen.has(key)) { seen.add(key); rows.push({ subject: r.subject, week: r.week, score: r.score }); }
        });
        rows.sort((a, b) => String(a.subject).localeCompare(b.subject) || a.week - b.week);
        return res.status(200).json({ status: 'success', data: rows });
    } catch (err) {
        console.error('Get my grades error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/student/push/key  (publik) — VAPID public key utk subscribe
const getPushKey = (req, res) => {
    const key = pushService.getPublicKey();
    if (!key) return res.status(503).json({ status: 'error', message: 'Push belum dikonfigurasi' });
    return res.status(200).json({ status: 'success', data: { key } });
};

// POST /api/student/change-password (token murid)
const changePassword = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });

        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ status: 'error', message: 'Password lama dan baru wajib diisi' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ status: 'error', message: 'Password baru minimal 6 karakter' });
        }

        const { data: student, error: sErr } = await supabase
            .from('students')
            .select('name, password')
            .eq('id', student_id)
            .single();

        if (sErr || !student) {
            return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan' });
        }

        // Cek password lama
        const isDefaultPassword = oldPassword.toLowerCase() === (firstName(student.name) + '123');
        const isCustomPasswordMatch = student.password ? (
            student.password.startsWith('$2')
                ? await bcrypt.compare(oldPassword, student.password)
                : oldPassword === student.password
        ) : false;

        if (!isDefaultPassword && !isCustomPasswordMatch) {
            return res.status(401).json({ status: 'error', message: 'Password lama salah' });
        }

        // Buat hash untuk password baru dan update DB
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        const { error: uErr } = await supabase
            .from('students')
            .update({ password: newPasswordHash, needs_password_reset: false }) // Setelah berhasil ganti, hapus flag reset
            .eq('id', student_id);

        if (uErr) throw uErr;

        return res.status(200).json({ status: 'success', message: 'Password berhasil diubah' });
    } catch (err) {
        console.error('Change password error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/student/forgot-password-request (token murid)
const forgotPasswordRequest = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });

        const { error } = await supabase
            .from('students')
            .update({ needs_password_reset: true })
            .eq('id', student_id);

        if (error) throw error;

        return res.status(200).json({ status: 'success', message: 'Permintaan reset password telah dicatat' });
    } catch (err) {
        console.error('Forgot password request error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/student/push/subscribe  (token murid) — simpan PushSubscription device
const savePushSubscription = async (req, res) => {
    try {
        const student_id = req.user.student_id;
        if (!student_id) return res.status(403).json({ status: 'error', message: 'Hanya untuk murid' });
        const sub = req.body && req.body.subscription ? req.body.subscription : req.body;
        if (!sub || !sub.endpoint) return res.status(400).json({ status: 'error', message: 'Subscription tidak valid' });

        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({ student_id, endpoint: sub.endpoint, subscription: sub }, { onConflict: 'endpoint' });
        if (error) throw error;
        return res.status(200).json({ status: 'success' });
    } catch (err) {
        console.error('Save push sub error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = { login, submitReport, getMyReports, getReportsForTeacher, resolveReport, getMyTasks, getMyNotifications, getMyProfile, getPublicStudents, submitPublicIzin, getPushKey, savePushSubscription, getPendingIzin, decideIzin, overdueScan, getIzinToday, refundCoins, getMyMemorization, getMyGallery, getMyGrades, changePassword, forgotPasswordRequest };

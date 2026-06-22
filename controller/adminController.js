const supabase = require('../config/supabaseClient');
// const bcrypt = require('bcrypt'); // Uncomment ini jika password di database Anda di-hash pakai bcrypt

// Semua tabel di database — dipakai untuk BACKUP PENUH (snapshot) sebelum reset.
const ALL_TABLES = [
    'users', 'students', 'todos', 'onboarding_results', 'questions', 'consultations',
    'raports', 'attendances', 'memorization_logs', 'exams', 'exam_questions', 'exam_results',
    'student_gallery', 'gamification_logs', 'pr_locks', 'satpam_logs', 'pr_notifications',
    'pr_extension_requests', 'app_settings', 'app_feedbacks', 'oral_exam_templates',
    'oral_exam_sections', 'oral_exam_items', 'oral_understanding_prompts', 'oral_exam_sessions',
    'oral_exam_session_students', 'oral_exam_results', 'oral_exam_result_items',
    'exam_retake_permissions', 'daily_challenge_sentences', 'daily_challenge_logs',
    'daily_challenge_progress', 'digital_rewards_purchases', 'coin_transfers'
];

// Tabel transaksional yang BOLEH dikosongkan saat reset tahun ajaran.
// Urutan PENTING: anak (child/FK) didahulukan sebelum induknya agar tidak kena
// pelanggaran foreign key. Akun (users), nama siswa (students), dan MATERI
// (questions, exams, exam_questions, oral_exam_templates/sections/items,
// daily_challenge_sentences, app_settings) sengaja TIDAK termasuk.
const RESETTABLE_ORDER = [
    'oral_exam_result_items',
    'oral_exam_results',
    'oral_exam_session_students',
    'oral_exam_sessions',
    'exam_retake_permissions',
    'exam_results',
    'daily_challenge_progress',
    'daily_challenge_logs',
    'digital_rewards_purchases',
    'coin_transfers',
    'gamification_logs',
    'pr_extension_requests',
    'pr_notifications',
    'satpam_logs',
    'pr_locks',
    'onboarding_results',
    'memorization_logs',
    'consultations',
    'raports',
    'todos',
    'attendances',
    'student_gallery',
    'app_feedbacks'
];
const RESETTABLE_SET = new Set(RESETTABLE_ORDER);

// Field progres siswa yang direset (nama/grade/akun tetap aman).
const STUDENT_PROGRESS_RESET = {
    has_infaq_can: false,
    last_can_received_at: null,
    current_surah_id: null,
    current_ayah: 0,
    poin: 0,
    item_double_score: 0,
    item_serang: 0,
    item_perisai: 0,
    item_extra_life: 0,
    has_claimed_bonus: false,
    is_shield_active: false,
    shield_activated_at: null,
    is_bullied: false
};

const factoryReset = async (req, res) => {
    try {
        const { password, mode, tables, reset_student_progress } = req.body;
        const username = req.user.username; // Didapat dari authMiddleware JWT

        // 1. Ambil & verifikasi password akun
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('password')
            .eq('username', username)
            .single();

        if (userErr || !user) {
            return res.status(404).json({ status: "error", message: "Akun tidak ditemukan." });
        }

        // Password text biasa. (Kalau di-hash bcrypt: bcrypt.compareSync(password, user.password))
        if (password !== user.password) {
            return res.status(403).json({ status: "error", message: "Password salah! Akses Ditolak." });
        }

        // 2. Tentukan target tabel yang akan dikosongkan
        let targets;
        if (mode === 'manual') {
            targets = Array.isArray(tables) ? tables.filter(t => RESETTABLE_SET.has(t)) : [];
        } else {
            // 'auto' (default): semua tabel transaksional
            targets = [...RESETTABLE_ORDER];
        }
        // Pertahankan urutan FK-safe
        const orderedTargets = RESETTABLE_ORDER.filter(t => targets.includes(t));

        const doStudentProgress = mode === 'auto' || reset_student_progress === true;

        // 3. BACKUP PENUH semua tabel (snapshot) — selalu lengkap walau yg di-reset sebagian
        const backupData = { timestamp: new Date().toISOString(), data: {} };
        for (const t of ALL_TABLES) {
            const { data } = await supabase.from(t).select('*');
            backupData.data[t] = data || [];
        }

        // 4. Eksekusi pengosongan tabel (urut anak → induk biar aman FK)
        for (const t of orderedTargets) {
            const { error: delErr } = await supabase.from(t).delete().not('id', 'is', null);
            if (delErr) throw new Error(`Gagal mengosongkan tabel ${t}: ${delErr.message}`);
        }

        // 5. Reset progres siswa (nama tetap aman)
        if (doStudentProgress) {
            await supabase.from('students').update(STUDENT_PROGRESS_RESET).not('id', 'is', null);
        }

        res.status(200).json({
            status: "success",
            backup: backupData,
            reset_tables: orderedTargets,
            reset_student_progress: doStudentProgress
        });
    } catch (error) {
        console.error("Reset Error:", error);
        res.status(500).json({ status: "error", message: error.message || "Terjadi kesalahan internal server." });
    }
};

module.exports = { factoryReset };

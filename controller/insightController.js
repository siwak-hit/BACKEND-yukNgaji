const onboardingModel = require('../model/onboardingModel');
const supabase = require('../config/supabaseClient');

const getClassInsights = async (req, res) => {
    try {
        const allData = await onboardingModel.getAllOnboardingResults();

        if (!allData || allData.length === 0) {
            return res.status(200).json({ status: "success", message: "Belum ada data kelas" });
        }

        // [PERBAIKAN BUG LOGIKA] Kelompokkan nilai terbaru PER SISWA & PER MAPEL
        const latestMap = new Map();
        allData.forEach(entry => {
            const key = `${entry.student_id}_${entry.subject}`;
            if (!latestMap.has(key) || entry.week > latestMap.get(key).week) {
                latestMap.set(key, entry);
            }
        });

        const latestData = Array.from(latestMap.values());

        let totalTajwid = 0, countTajwid = 0, weakTajwidCount = 0;
        let totalFiqih = 0, countFiqih = 0, weakFiqihCount = 0;
        let totalTauhid = 0, countTauhid = 0, weakTauhidCount = 0;

        latestData.forEach(entry => {
            if (entry.subject === 'tajwid') {
                totalTajwid += entry.score; countTajwid++;
                if (entry.score < 70) weakTajwidCount++;
            } else if (entry.subject === 'fiqih') {
                totalFiqih += entry.score; countFiqih++;
                if (entry.score < 70) weakFiqihCount++;
            } else if (entry.subject === 'tauhid') {
                totalTauhid += entry.score; countTauhid++;
                if (entry.score < 70) weakTauhidCount++;
            }
        });

        const avgTajwid = countTajwid > 0 ? Math.round(totalTajwid / countTajwid) : 0;
        const avgFiqih = countFiqih > 0 ? Math.round(totalFiqih / countFiqih) : 0;
        const avgTauhid = countTauhid > 0 ? Math.round(totalTauhid / countTauhid) : 0;

        const weaknesses = [
            { subject: "Tajwid", count: weakTajwidCount, avg: avgTajwid },
            { subject: "Fiqih", count: weakFiqihCount, avg: avgFiqih },
            { subject: "Tauhid", count: weakTauhidCount, avg: avgTauhid }
        ];

        weaknesses.sort((a, b) => b.count - a.count || a.avg - b.avg);
        const topWeakness = weaknesses[0];

        res.status(200).json({
            status: "success",
            data: {
                most_common_weakness: topWeakness.subject,
                students_struggling: topWeakness.count,
                recommended_action: `Ulangi materi dasar ${topWeakness.subject} ke seluruh kelas sebelum melanjutkan ke materi baru`,
                average_score: { tajwid: avgTajwid, fiqih: avgFiqih, tauhid: avgTauhid }
            }
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getGlobalDashboard = async (req, res) => {
    try {
        // [PERBAIKAN] Tidak lagi menghitung TODO, diganti dengan Celengan Aktif dan Total Ujian
        const [studentsRes, infaqRes, examsRes] = await Promise.all([
            supabase.from('students').select('*', { count: 'exact', head: true }),
            supabase.from('students').select('*', { count: 'exact', head: true }).eq('has_infaq_can', true),
            supabase.from('exams').select('*', { count: 'exact', head: true })
        ]);

        if (studentsRes.error) throw studentsRes.error;
        if (infaqRes.error) throw infaqRes.error;
        if (examsRes.error) throw examsRes.error;

        res.status(200).json({
            status: "success",
            data: {
                total_students: studentsRes.count || 0,
                active_infaq: infaqRes.count || 0,
                total_exams: examsRes.count || 0
            }
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getFilters = async (req, res) => {
    try {
        // Ambil semua kombinasi soal yang ada di kurikulum
        const { data, error } = await supabase
            .from('questions')
            .select('subject, week');

        if (error) throw error;

        const subjects = [...new Set(data.map(item => item.subject))].filter(Boolean);
        const weeks = [...new Set(data.map(item => item.week))].filter(Boolean).sort((a, b) => a - b);

        // Cari tahu tugas apa saja yang "Valid/Tersedia"
        const available_tasks = [];
        const seen = new Set();
        data.forEach(q => {
            const key = `${q.subject}-${q.week}`;
            if (!seen.has(key)) {
                seen.add(key);
                available_tasks.push({ subject: q.subject, week: q.week });
            }
        });

        res.status(200).json({
            status: "success",
            data: { subjects, weeks, available_tasks } // available_tasks dikirim ke frontend
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { getClassInsights, getGlobalDashboard, getFilters };
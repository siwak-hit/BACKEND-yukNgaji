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

const getExamMissingStatus = async (req, res) => {
    try {
        const username = req.user.username;
        const { subject = '' } = req.query;

        // 1. Ambil semua murid milik guru
        let studentsQuery = supabase
            .from('students')
            .select('id, name, grade, created_by')
            .eq('created_by', username)
            .order('name', { ascending: true });

        const { data: students, error: studentsErr } = await studentsQuery;

        if (studentsErr) throw studentsErr;

        // 2. Ambil ujian aktif milik guru
        let examsQuery = supabase
            .from('exams')
            .select('id, title, subject, is_active, created_by')
            .eq('created_by', username)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (subject) {
            examsQuery = examsQuery.eq('subject', subject);
        }

        const { data: exams, error: examsErr } = await examsQuery;

        if (examsErr) throw examsErr;

        const examIds = (exams || []).map(exam => exam.id);

        if (examIds.length === 0) {
            return res.status(200).json({
                status: "success",
                data: {
                    subject,
                    total_missing_students: 0,
                    exams: [],
                    students: []
                }
            });
        }

        // 3. Ambil hasil ujian untuk exam aktif tersebut
        const { data: results, error: resultsErr } = await supabase
            .from('exam_results')
            .select('student_id, exam_id')
            .in('exam_id', examIds);

        if (resultsErr) throw resultsErr;

        const doneSet = new Set(
            (results || []).map(r => `${r.student_id}_${r.exam_id}`)
        );

        // 4. Hitung ujian yang belum dikerjakan per siswa
        const missingStudents = (students || [])
            .map(student => {
                const missing_exams = (exams || []).filter(exam => {
                    return !doneSet.has(`${student.id}_${exam.id}`);
                });

                return {
                    id: student.id,
                    name: student.name,
                    grade: student.grade,
                    missing_count: missing_exams.length,
                    missing_exams: missing_exams.map(exam => ({
                        id: exam.id,
                        title: exam.title,
                        subject: exam.subject
                    }))
                };
            })
            .filter(student => student.missing_count > 0);

        return res.status(200).json({
            status: "success",
            data: {
                subject,
                total_missing_students: missingStudents.length,
                exams: exams || [],
                students: missingStudents
            }
        });

    } catch (error) {
        console.error("Get Exam Missing Status Error:", error);
        return res.status(500).json({
            status: "error",
            message: error.message || "Gagal mengambil data tunggakan ujian."
        });
    }
};

module.exports = { getClassInsights, getGlobalDashboard, getFilters, getExamMissingStatus };

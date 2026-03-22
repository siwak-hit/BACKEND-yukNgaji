const onboardingModel = require('../model/onboardingModel');
const supabase = require('../config/supabaseClient');

const getClassInsights = async (req, res) => {
    try {
        const allData = await onboardingModel.getAllOnboardingResults();

        if (!allData || allData.length === 0) {
            return res.status(200).json({ status: "success", message: "Belum ada data kelas" });
        }

        // 1. Isolate only the LATEST data for each student
        const latestPerStudentMap = new Map();
        allData.forEach(entry => {
            if (!latestPerStudentMap.has(entry.student_id)) {
                latestPerStudentMap.set(entry.student_id, entry);
            } else {
                const existing = latestPerStudentMap.get(entry.student_id);
                if (entry.week > existing.week) {
                    latestPerStudentMap.set(entry.student_id, entry);
                }
            }
        });

        const latestData = Array.from(latestPerStudentMap.values());
        const totalStudents = latestData.length;

        // 2. Aggregate Scores
        let totalTajwid = 0;
        let totalFiqih = 0;
        let totalTauhid = 0;

        let weakTajwidCount = 0;
        let weakFiqihCount = 0;
        let weakTauhidCount = 0;

        latestData.forEach(student => {
            totalTajwid += student.tajwid_score;
            totalFiqih += student.fiqih_score;
            totalTauhid += student.tauhid_score;

            if (student.tajwid_score < 70) weakTajwidCount++;
            if (student.fiqih_score < 70) weakFiqihCount++;
            if (student.tauhid_score < 70) weakTauhidCount++;
        });

        const avgTajwid = Math.round(totalTajwid / totalStudents);
        const avgFiqih = Math.round(totalFiqih / totalStudents);
        const avgTauhid = Math.round(totalTauhid / totalStudents);

        // 3. Detect Most Common Weakness
        const weaknesses = [
            { subject: "Tajwid", count: weakTajwidCount, avg: avgTajwid },
            { subject: "Fiqih", count: weakFiqihCount, avg: avgFiqih },
            { subject: "Tauhid", count: weakTauhidCount, avg: avgTauhid }
        ];

        // Sort by most struggling students, then by lowest average score
        weaknesses.sort((a, b) => b.count - a.count || a.avg - b.avg);
        const topWeakness = weaknesses[0];

        // 4. Format Output
        const insightResponse = {
            most_common_weakness: topWeakness.subject,
            students_struggling: topWeakness.count,
            recommended_action: `Ulangi materi dasar ${topWeakness.subject} ke seluruh kelas sebelum melanjutkan ke materi baru`,
            average_score: {
                tajwid: avgTajwid,
                fiqih: avgFiqih,
                tauhid: avgTauhid
            }
        };

        res.status(200).json({
            status: "success",
            data: insightResponse
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /api/insights/dashboard
const getGlobalDashboard = async (req, res) => {
    try {
        // Eksekusi 3 query count secara paralel agar response API lebih cepat
        const [studentsRes, todosRes, consultationsRes] = await Promise.all([
            supabase.from('students').select('*', { count: 'exact', head: true }),
            supabase.from('todos').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('consultations').select('*', { count: 'exact', head: true }).eq('is_read', false)
        ]);

        // Cek jika ada error dari salah satu query
        if (studentsRes.error) throw studentsRes.error;
        if (todosRes.error) throw todosRes.error;
        if (consultationsRes.error) throw consultationsRes.error;

        res.status(200).json({
            status: "success",
            data: {
                total_students: studentsRes.count || 0,
                pending_tasks: todosRes.count || 0,
                unread_messages: consultationsRes.count || 0
            }
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { getClassInsights, getGlobalDashboard };
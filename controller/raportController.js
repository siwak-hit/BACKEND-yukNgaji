const supabase = require('../config/supabaseClient');

// POST /api/raports/generate-note
const generateNote = (req, res) => {
    try {
        const { studentName, academic, behavior } = req.body;

        // Fungsi pembantu untuk mengubah huruf menjadi angka (A=4, B=3, C=2, D=1)
        const getScore = (grade) => ({'A': 4, 'B': 3, 'C': 2, 'D': 1}[grade] || 2);

        // Rata-rata Akademik
        const acdScores = [academic.tajwid, academic.fiqih, academic.tauhid, academic.quran].map(getScore);
        const avgAcd = acdScores.reduce((a, b) => a + b, 0) / acdScores.length;

        // Rata-rata Sosial/Kepribadian
        const bhvScores = [behavior.kedisiplinan, behavior.akhlak, behavior.keaktifan].map(getScore);
        const avgBhv = bhvScores.reduce((a, b) => a + b, 0) / bhvScores.length;

        // A. PUJIAN & APRESIASI UMUM
        let pointA = `Alhamdulillah, segala puji bagi Allah. Kami sangat bersyukur atas semangat ananda ${studentName} dalam mengikuti kegiatan belajar ngaji sejauh ini.`;
        if (avgAcd >= 3.5 && avgBhv >= 3.5) {
            pointA += ` Ananda menunjukkan prestasi yang sangat luar biasa, baik dari sisi keilmuan maupun adabnya yang mulia.`;
        } else if (avgAcd >= 3 || avgBhv >= 3) {
            pointA += ` Ananda menunjukkan perkembangan yang baik dan membanggakan dari waktu ke waktu.`;
        }

        // B. KRITIK & SARAN AKADEMIK
        let pointB = `Terkait pemahaman materi pelajaran (Tajwid, Fiqih, Tauhid, dan Hafalan Al-Quran), `;
        if (avgAcd >= 3.5) {
            pointB += `ananda sangat cepat menangkap pelajaran. Pertahankan hafalan dan ketelitian bacaannya ya!`;
        } else if (avgAcd >= 2.5) {
            pointB += `ananda sudah cukup baik, namun masih perlu ditingkatkan sedikit murojaah-nya agar lebih lancar dan kuat hafalannya.`;
        } else {
            pointB += `ananda masih membutuhkan bimbingan ekstra. Jangan pantang menyerah untuk terus mengulang pelajaran dari dasar ya.`;
        }

        // C. KRITIK & SARAN SOSIAL/KEPRIBADIAN
        let pointC = `Dari segi kepribadian dan adab di kelas, `;
        if (avgBhv >= 3.5) {
            pointC += `masya Allah, ananda sangat sopan, rajin, dan aktif. Menjadi contoh yang sangat baik bagi teman-temannya.`;
        } else if (avgBhv >= 2.5) {
            pointC += `ananda anak yang baik, meski terkadang masih perlu diingatkan untuk lebih tenang dan fokus saat ustadz/ustadzah sedang menerangkan.`;
        } else {
            pointC += `ananda perlu banyak dilatih untuk lebih tertib, memperhatikan adab berbicara, dan tidak banyak bercanda saat majelis sedang berlangsung.`;
        }

        // D. PESAN UNTUK ORANG TUA
        let pointD = `Kami memohon kerjasama Ayah/Bunda di rumah untuk terus mendampingi ananda mengulang pelajaran dan menanamkan adab islami sehari-hari. Semoga ananda ${studentName} menjadi anak yang sholeh/sholehah, ahli ilmu, dan penyejuk hati keluarga. Aamiin.`;

        // Gabungkan 4 poin tersebut dengan 2 enter (baris baru)
        const finalNote = `${pointA}\n\n${pointB}\n\n${pointC}\n\n${pointD}`;

        res.status(200).json({ status: "success", data: finalNote });
    } catch (error) {
        console.error("Generate Note Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// POST /api/raports
const saveRaport = async (req, res) => {
    try {
        // Tangkap 'id' dari frontend (kalau null berarti baru, kalau ada berarti edit)
        const { id, student_id, academic_grades, behavior_grades, teacher_note } = req.body;
        const created_by = req.user.username;

        let result;

        if (id) {
            // MODE EDIT (UPDATE)
            result = await supabase
                .from('raports')
                .update({ academic_grades, behavior_grades, teacher_note })
                .eq('id', id)
                .select()
                .single();
        } else {
            // MODE BUAT BARU (INSERT)
            result = await supabase
                .from('raports')
                .insert([{ student_id, created_by, academic_grades, behavior_grades, teacher_note }])
                .select()
                .single();
        }

        if (result.error) throw result.error;
        res.status(id ? 200 : 201).json({ status: "success", data: result.data });
    } catch (error) {
        console.error("Save Raport Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { generateNote, saveRaport };
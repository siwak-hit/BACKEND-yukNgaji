const supabase = require('../config/supabaseClient');

// POST /api/raports/generate-note
const generateNote = (req, res) => {
    try {
        const { studentName, avgScore } = req.body;
        
        let note = "";
        if (avgScore >= 85) {
            note = `Alhamdulillah, pencapaian ananda ${studentName} sangat memuaskan. Tingkat pemahaman dan kedisiplinannya patut diacungi jempol. Mohon Ayah/Bunda terus mempertahankan kebiasaan baik ini di rumah agar ananda semakin istiqomah.`;
        } else if (avgScore >= 70) {
            note = `Perkembangan ananda ${studentName} sudah cukup baik. Ananda mulai memahami materi yang diajarkan. Mohon bantuan Ayah/Bunda untuk lebih sering mengajak ananda murojaah (mengulang hafalan) di rumah agar hasilnya lebih maksimal.`;
        } else {
            note = `Saat ini ananda ${studentName} masih membutuhkan bimbingan ekstra dalam memahami materi dan fokus di kelas. Kami sangat memohon kerjasama Ayah/Bunda untuk mendampingi ananda belajar di rumah agar ananda bisa mengejar ketertinggalannya dengan semangat.`;
        }

        res.status(200).json({ status: "success", data: note });
    } catch (error) {
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
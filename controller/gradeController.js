const supabase = require('../config/supabaseClient');

const saveManualGrade = async (req, res) => {
    const { student_id, subject, score, with_penalty } = req.body;
    const username = req.user.username;

    if (!student_id || !subject || score === undefined) {
        return res.status(400).json({ status: "error", message: "Data tidak lengkap." });
    }

    try {
        let finalScore = parseInt(score);
        if (with_penalty) {
            finalScore = Math.floor(finalScore * 0.9);
        }

        // Cari exam dummy atau buat jika belum ada, untuk menampung nilai manual
        let { data: dummyExam, error: findError } = await supabase
            .from('exams')
            .select('id')
            .eq('created_by', username)
            .eq('subject', subject)
            .eq('title', 'Nilai Manual Cetak')
            .maybeSingle();

        if (findError) throw findError;

        if (!dummyExam) {
            const { data: newDummyExam, error: createError } = await supabase
                .from('exams')
                .insert({
                    title: 'Nilai Manual Cetak',
                    subject: subject,
                    created_by: username,
                    is_active: false,
                    is_daring: false
                })
                .select('id')
                .single();
            if (createError) throw createError;
            dummyExam = newDummyExam;
        }

        const exam_id = dummyExam.id;

        // Upsert nilai ke exam_results
        const { data, error } = await supabase
            .from('exam_results')
            .upsert({
                student_id: student_id,
                exam_id: exam_id,
                subject: subject,
                score: finalScore,
                is_manual: true // Tandai sebagai nilai manual
            }, {
                onConflict: 'student_id, exam_id'
            })
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({ status: "success", message: "Nilai manual berhasil disimpan.", data: { final_score: finalScore } });

    } catch (error) {
        console.error("Save Manual Grade Error:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { saveManualGrade };

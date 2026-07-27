const supabase = require('../config/supabaseClient');

const saveManualGrade = async (req, res) => {
    const { student_id, subject, score, with_penalty, week, mark_completed, is_graded } = req.body;
    const username = req.user.username;

    if (!student_id || !subject || score === undefined) {
        return res.status(400).json({ status: "error", message: "Data tidak lengkap." });
    }

    try {
        let finalScore = parseInt(score);
        if (with_penalty) finalScore = Math.floor(finalScore * 0.9);
        const graded = is_graded !== false; // false = baru dicetak, belum dinilai guru

        // Nilai rapor (exam_results) hanya ditulis kalau memang dinilai —
        // cetak soal saja jangan mencetak nilai palsu ke rapor.
        if (graded) {
            // Cari atau buat exam dummy per-week jika ada week
            const examTitle = week ? `Nilai Manual Cetak Mg-${week}` : 'Nilai Manual Cetak';

            let { data: dummyExam, error: findError } = await supabase
                .from('exams')
                .select('id')
                .eq('created_by', username)
                .eq('subject', subject)
                .eq('title', examTitle)
                .maybeSingle();

            if (findError) throw findError;

            if (!dummyExam) {
                const { data: newDummyExam, error: createError } = await supabase
                    .from('exams')
                    .insert({
                        title: examTitle,
                        subject,
                        created_by: username,
                        is_active: false,
                        is_daring: false
                    })
                    .select('id')
                    .single();
                if (createError) throw createError;
                dummyExam = newDummyExam;
            }

            const { error } = await supabase
                .from('exam_results')
                .upsert({
                    student_id,
                    exam_id: dummyExam.id,
                    subject,
                    score: finalScore
                }, { onConflict: 'student_id, exam_id' })
                .select()
                .single();

            if (error) throw error;
        }

        // Tandai pertemuan selesai di onboarding_results jika diminta.
        // is_graded=false → hanya "sudah dicetak" (belum dinilai guru); default true = dinilai.
        if (mark_completed && week) {
            const weekInt = parseInt(week);
            const { data: existing } = await supabase
                .from('onboarding_results')
                .select('id, is_graded')
                .eq('student_id', student_id)
                .eq('subject', subject)
                .eq('week', weekInt)
                .maybeSingle();

            if (existing) {
                // Cetak ulang jangan menimpa nilai yang sudah diinput guru.
                if (graded || !existing.is_graded) {
                    await supabase.from('onboarding_results')
                        .update({ score: finalScore, is_graded: graded || existing.is_graded })
                        .eq('id', existing.id);
                }
            } else {
                await supabase.from('onboarding_results')
                    .insert({ student_id, subject, week: weekInt, score: finalScore, is_graded: graded });
            }
        }

        res.status(200).json({ status: "success", message: "Nilai manual berhasil disimpan.", data: { final_score: finalScore } });

    } catch (error) {
        console.error("Save Manual Grade Error:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { saveManualGrade };

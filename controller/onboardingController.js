const supabase = require('../config/supabaseClient');
const onboardingModel = require('../model/onboardingModel');

// 1. TAMBAH BANYAK SOAL SEKALIGUS
const saveParsedQuestions = async (req, res) => {
    try {
        const { subject, week, questions } = req.body;
        if (!subject || !week || !questions) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap" });
        }

        const formattedQuestions = questions.map(q => {
            // [MODIFIKASI]: Jika tipe soal urutan dan correct_answer berupa array, jadikan string JSON
            let finalCorrectAnswer = q.correct_answer;
            if (q.type === 'urutan' && Array.isArray(q.correct_answer)) {
                finalCorrectAnswer = JSON.stringify(q.correct_answer);
            }

            return {
                subject,
                week: parseInt(week),
                type: q.type || 'pilgan', 
                question: q.question,
                options: q.options,
                correct_answer: finalCorrectAnswer, // Simpan text/string
                difficulty_level: q.difficulty_level || 'sedang',
                image_url: q.image_url ? q.image_url.trim() : null
            };
        });

        const { data, error } = await supabase.from('questions').insert(formattedQuestions).select('id');
        if (error) throw error;

        res.status(201).json({ status: "success", data });
    } catch (error) {
        console.error("Save Questions Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 2. UPDATE 1 SOAL SAAT DIEDIT
const updateQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, question, options, correct_answer, difficulty_level, image_url } = req.body;

        // [MODIFIKASI]: Handle format jawaban untuk soal tipe urutan
        let finalCorrectAnswer = correct_answer;
        if (type === 'urutan' && Array.isArray(correct_answer)) {
            finalCorrectAnswer = JSON.stringify(correct_answer);
        }

        const { data, error } = await supabase
            .from('questions')
            .update({ 
                type: type || 'pilgan', 
                question, 
                options, 
                correct_answer: finalCorrectAnswer, 
                difficulty_level,
                image_url: image_url ? image_url.trim() : null
            })
            .eq('id', id)
            .select('id')
            .single();

        if (error) throw error;
        res.status(200).json({ status: "success", data });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 3. DELETE 1 SOAL
const deleteQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('questions').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 4. AMBIL SOAL UNTUK FRONTEND (Sesi Pengerjaan / Bank Soal)
const getQuestions = async (req, res) => {
    try {
        const { subject } = req.params;
        const { week } = req.query; 

        // [PERBAIKAN KUNCI]: Tambahkan image_url di dalam select!
        let query = supabase.from('questions')
            .select('id, subject, week, question, options, correct_answer, difficulty_level, type, image_url')
            .eq('subject', subject)
            .order('week', { ascending: true });

        if (week) query = query.eq('week', week);

        const { data, error } = await query;
        if (error) throw error;

        // Jika tidak ada week spesifik, kelompokkan berdasarkan week (Untuk Accordion Bank Soal)
        if (!week) {
            const grouped = {};
            data.forEach(q => {
                if (!grouped[q.week]) grouped[q.week] = [];
                grouped[q.week].push(q);
            });
            return res.status(200).json({ status: "success", data: grouped });
        }

        res.status(200).json({ status: "success", data });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 5. GET SUMMARY UNTUK INFO "TARGET PERTEMUAN" DI BANK SOAL
const getQuestionsSummary = async (req, res) => {
    try {
        const { data, error } = await supabase.from('questions').select('subject, week');
        if (error) throw error;

        const summary = { tajwid: { maxWeek: 0, gaps: [], allWeeks: [] }, fiqih: { maxWeek: 0, gaps: [], allWeeks: [] }, tauhid: { maxWeek: 0, gaps: [], allWeeks: [] } };
        
        if (data) {
            ['tajwid', 'fiqih', 'tauhid'].forEach(subj => {
                const subjData = data.filter(q => q.subject === subj);
                const weeks = [...new Set(subjData.map(q => q.week))].sort((a,b) => a-b);
                if (weeks.length > 0) {
                    const maxWeek = Math.max(...weeks);
                    const gaps = [];
                    for(let i=1; i<maxWeek; i++) { if(!weeks.includes(i)) gaps.push(i); }
                    summary[subj] = { maxWeek, gaps, allWeeks: weeks };
                }
            });
        }
        res.status(200).json({ status: "success", data: summary });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 6. CEK MINGGU KE BERAPA SAJA YANG SUDAH ADA SOALNYA
const getAvailableWeeks = async (req, res) => {
    try {
        const { subject } = req.params;
        const { data, error } = await supabase.from('questions').select('week').eq('subject', subject);
        if (error) throw error;
        const weeks = [...new Set(data.map(d => d.week))].sort((a,b) => a-b);
        res.status(200).json({ status: "success", data: weeks });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 7. CEK SIAPA SAJA SISWA YANG SUDAH MENGERJAKAN DI MINGGU TERSEBUT
const getCompletionStatus = async (req, res) => {
    try {
        const { subject, week } = req.query;
        const { data, error } = await supabase.from('onboarding_results').select('student_id').eq('subject', subject).eq('week', week);
        if (error) throw error;
        const studentIds = data.map(d => d.student_id);
        res.status(200).json({ status: "success", data: studentIds });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 8. SIMPAN NILAI JAWABAN SISWA
const submitAndGradeAnswers = async (req, res) => {
    try {
        // [BARU] Tangkap is_double_score dari FE
        const { student_id, subject, week, student_answers, is_double_score } = req.body;

        if (!student_id || !subject || !week || !student_answers) {
            return res.status(400).json({ status: "error", message: "Data pengerjaan tidak lengkap." });
        }

        const questionIds = student_answers.map(ans => ans.question_id);

        const { data: dbQuestions, error: qError } = await supabase
            .from('questions')
            .select('id, correct_answer, type')
            .in('id', questionIds);

        if (qError) throw qError;

        // 1. Hitung Nilai Mentah / Asli
        let correctCount = 0;
        student_answers.forEach(studentAns => {
            const match = dbQuestions.find(q => q.id === studentAns.question_id);
            if (match) {
                if (match.type === 'urutan') {
                    const studentAnsString = Array.isArray(studentAns.answer) ? JSON.stringify(studentAns.answer) : studentAns.answer;
                    if (studentAnsString === match.correct_answer) correctCount++;
                } else {
                    if (match.correct_answer.toUpperCase() === String(studentAns.answer).toUpperCase()) correctCount++;
                }
            }
        });

        const totalSoal = student_answers.length;
        const rawScore = totalSoal > 0 ? Math.round((correctCount / totalSoal) * 100) : 0;
        
        // 2. Ambil data dompet & inventory siswa dari DB
        const { data: studentInfo } = await supabase
            .from('students')
            .select('poin, item_double_score')
            .eq('id', student_id)
            .single();

        let finalScore = rawScore;
        let isItemUsed = false;

        // 3. Terapkan Sihir Double Poin (JIKA DIA MEMINTA & JIKA DIA BENARAN PUNYA DI DB)
        if (is_double_score && studentInfo && studentInfo.item_double_score > 0) {
            isItemUsed = true;
            if (finalScore < 30) finalScore += 20;
            else if (finalScore < 50) finalScore += 15;
            else if (finalScore < 70) finalScore += 10;
            else if (finalScore < 100) finalScore += 5;
            
            if (finalScore > 100) finalScore = 100; // Cap maksimal
        }

        let category = 'C';
        if (finalScore >= 80) category = 'A';
        else if (finalScore >= 60) category = 'B';

        // 4. Update Saldo Uang dan Kurangi Item jika dipakai
        if (studentInfo) {
            let newPoin = studentInfo.poin + finalScore; // Poin dompet bertambah sebanyak nilai akhir
            let newDoubleCount = studentInfo.item_double_score;
            
            if (isItemUsed) {
                newDoubleCount -= 1; // Konsumsi item di Database
            }

            await supabase.from('students')
                .update({ poin: newPoin, item_double_score: newDoubleCount })
                .eq('id', student_id);
        }

        // 5. Simpan Hasil Ujian Permanen (dengan Final Score)
        const { error: resultError } = await supabase
            .from('onboarding_results')
            .insert([{
                student_id,
                subject,
                week: parseInt(week),
                score: finalScore, // Nilai yang disimpan adalah yang sudah di-buff!
                category,
                student_answers, 
                notes: isItemUsed ? "Koreksi Sihir ✨ (Double Poin Aktif)" : "Koreksi otomatis oleh sistem"
            }]);

        if (resultError) throw resultError;

        res.status(201).json({ status: "success", message: "Jawaban berhasil dikirim dan dinilai." });

    } catch (error) {
        console.error("Auto-Grade Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 9. ENDPOINT LEGACY (Menjaga agar Router tidak error jika memanggil fungsi ini)
const submitOnboarding = async (req, res) => res.status(200).json({ status: "success" });
// 10. AMBIL DATA PROGRESS UNTUK GRAFIK SISWA
const getStudentProgress = async (req, res) => {
    try {
        const studentId = req.params.id;
        
        // Ambil riwayat nilai siswa
        const { data: progressData, error } = await supabase
            .from('onboarding_results')
            .select('id, week, subject, score')
            .eq('student_id', studentId)
            .order('week', { ascending: true });

        if (error) throw error;

        // Kelompokkan data per mapel agar Frontend (Chart.js) bisa membacanya
        const groupedProgress = {
            tajwid: (progressData || []).filter(item => item.subject && item.subject.trim().toLowerCase() === 'tajwid'),
            fiqih: (progressData || []).filter(item => item.subject && item.subject.trim().toLowerCase() === 'fiqih'),
            tauhid: (progressData || []).filter(item => item.subject && item.subject.trim().toLowerCase() === 'tauhid')
        };

        res.status(200).json({ status: "success", data: groupedProgress });
    } catch (error) {
        console.error("Get Progress Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getReviewData = async (req, res) => {
    try {
        const { id, subject, week } = req.params;
        
        if (!id || !subject || !week) {
            return res.status(400).json({ status: "error", message: "Parameter tidak lengkap." });
        }

        const data = await onboardingModel.getStudentReview(id, subject, parseInt(week));
        
        res.status(200).json({ status: "success", data });
    } catch (error) {
        console.error("Get Review Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 11. FITUR EXTRA LIFE: Perbaiki Jawaban Salah
const retryWrongAnswers = async (req, res) => {
    try {
        const { student_id, result_id, fixed_answers } = req.body;

        // 1. Cek kepemilikan item Extra Life
        const { data: student, error: studentErr } = await supabase
            .from('students').select('item_extra_life').eq('id', student_id).single();
        
        if (studentErr || student.item_extra_life <= 0) {
            return res.status(400).json({ status: "error", message: "Kamu tidak memiliki item Extra Life!" });
        }

        // 2. Ambil hasil ujian sebelumnya
        const { data: pastResult, error: resultErr } = await supabase
            .from('onboarding_results').select('*').eq('id', result_id).single();
            
        if (resultErr) throw resultErr;

        let updatedAnswers = pastResult.student_answers;

        // 3. Timpa jawaban lama dengan jawaban perbaikan dari frontend
        fixed_answers.forEach(fix => {
            const index = updatedAnswers.findIndex(ans => ans.question_id === fix.question_id);
            if (index !== -1) updatedAnswers[index].answer = fix.answer;
        });

        // 4. Lakukan penilaian ulang (mirip dengan logika grading biasa)
        const questionIds = updatedAnswers.map(ans => ans.question_id);
        const { data: dbQuestions } = await supabase.from('questions').select('id, correct_answer, type').in('id', questionIds);
        
        let correctCount = 0;
        updatedAnswers.forEach(ans => {
            const match = dbQuestions.find(q => q.id === ans.question_id);
            if (match && String(ans.answer).toUpperCase() === match.correct_answer.toUpperCase()) {
                correctCount++;
            }
        });

        const newScore = Math.round((correctCount / updatedAnswers.length) * 100);
        let newCategory = newScore >= 80 ? 'A' : (newScore >= 60 ? 'B' : 'C');

        // 5. Update hasil di DB & kurangi item Extra Life
        await supabase.from('onboarding_results').update({
            score: newScore, category: newCategory, student_answers: updatedAnswers, notes: "Dikoreksi menggunakan Extra Life"
        }).eq('id', result_id);

        await supabase.from('students').update({
            item_extra_life: student.item_extra_life - 1
        }).eq('id', student_id);

        res.status(200).json({ status: "success", message: "Nilai berhasil diperbarui!", newScore });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = {
    saveParsedQuestions,
    updateQuestion,
    deleteQuestion,
    getQuestions,
    getQuestionsSummary,
    getAvailableWeeks,
    getCompletionStatus,
    submitAndGradeAnswers,
    submitOnboarding,
    getStudentProgress,
    getReviewData,
    retryWrongAnswers
};
const supabase = require('../config/supabaseClient');

// 1. TAMBAH BANYAK SOAL SEKALIGUS (Dari Upload TXT atau Input Manual)
const saveParsedQuestions = async (req, res) => {
    try {
        const { subject, week, questions } = req.body;
        if (!subject || !week || !questions) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap" });
        }

        // [PERBAIKAN KUNCI]: Pastikan kolom 'type' ikut ditangkap dan disimpan!
        const formattedQuestions = questions.map(q => ({
            subject,
            week: parseInt(week),
            type: q.type || 'pilgan', 
            question: q.question,
            options: q.options,
            correct_answer: q.correct_answer,
            difficulty_level: q.difficulty_level || 'sedang'
        }));

        const { data, error } = await supabase.from('questions').insert(formattedQuestions).select('id');
        if (error) throw error;

        res.status(201).json({ status: "success", data });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 2. UPDATE 1 SOAL SAAT DIEDIT
const updateQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        // [PERBAIKAN KUNCI]: Pastikan 'type' diambil dari body request
        const { type, question, options, correct_answer, difficulty_level } = req.body;

        const { data, error } = await supabase
            .from('questions')
            .update({ 
                type: type || 'pilgan', 
                question, 
                options, 
                correct_answer, 
                difficulty_level 
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

        // [PERBAIKAN KUNCI]: Lakukan "SELECT type" agar Frontend tahu jenis soalnya!
        let query = supabase.from('questions')
            .select('id, subject, week, question, options, correct_answer, difficulty_level, type')
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
        const { student_id, subject, week, student_answers } = req.body;
        if (!student_id || !subject || !week) return res.status(400).json({ status: "error", message: "Data tidak lengkap" });

        const { data: questions, error: qErr } = await supabase.from('questions').select('id, correct_answer').eq('subject', subject).eq('week', week);
        if (qErr) throw qErr;

        let correctCount = 0;
        const totalQuestions = questions.length;
        
        if (totalQuestions > 0 && student_answers) {
            student_answers.forEach(ans => {
                const q = questions.find(q => q.id === ans.question_id);
                if (q && q.correct_answer.toUpperCase() === ans.answer.toUpperCase()) correctCount++;
            });
        }
        
        const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
        const category = score >= 80 ? 'A' : score >= 60 ? 'B' : 'C';

        // Cek apakah siswa sudah pernah mengerjakan? Jika sudah, Update. Jika belum, Insert.
        const { data: existing } = await supabase.from('onboarding_results').select('id').eq('student_id', student_id).eq('subject', subject).eq('week', week).single();

        if (existing) {
            await supabase.from('onboarding_results').update({ score, category }).eq('id', existing.id);
        } else {
            await supabase.from('onboarding_results').insert([{ student_id, subject, week, score, category }]);
        }

        res.status(200).json({ status: "success", score, category });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 9. ENDPOINT LEGACY (Menjaga agar Router tidak error jika memanggil fungsi ini)
const submitOnboarding = async (req, res) => res.status(200).json({ status: "success" });
// 9. AMBIL DATA PROGRESS UNTUK GRAFIK SISWA
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
    getStudentProgress
};
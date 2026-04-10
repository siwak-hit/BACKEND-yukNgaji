const onboardingModel = require('../model/onboardingModel');
const todoModel = require('../model/todoModel');
const questionModel = require('../model/questionModel');
const supabase = require('../config/supabaseClient');


const calculateScore = (answersArray) => {
    if (!answersArray || answersArray.length === 0) return 0;
    const correctCount = answersArray.filter(answer => answer === true || answer === 'true').length;
    return Math.round((correctCount / answersArray.length) * 100);
};

const getTajwidCategory = (score) => {
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    return 'C';
};

const processOnboardingData = async (student_id, subject, answersArray, notes = "") => {
    const pastResults = await onboardingModel.getStudentProgressBySubject(student_id, subject);
    const currentWeek = pastResults.length > 0 ? pastResults[pastResults.length - 1].week + 1 : 1;

    const score = calculateScore(answersArray);
    const category = subject === 'tajwid' ? getTajwidCategory(score) : null;

    const savedResult = await onboardingModel.saveResult({
        student_id, subject, week: currentWeek, score, category, notes
    });

    const generatedTodos = [];

    if (score < 60) {
        generatedTodos.push({
            student_id, week: currentWeek, 
            title: `Pendalaman Dasar ${subject.toUpperCase()}`,
            description: `Beri materi tambahan atau PR khusus untuk bab ${subject} minggu ini.`,
            status: "pending"
        });
    } else if (score < 80) {
        generatedTodos.push({
            student_id, week: currentWeek, 
            title: `Sesi Tanya Jawab ${subject.toUpperCase()}`,
            description: `Lakukan mini kuis atau diskusi lisan untuk memantapkan pemahaman.`,
            status: "pending"
        });
    }

    if (generatedTodos.length > 0) {
        await todoModel.createTodos(generatedTodos);
    }

    return { savedResult, generatedTodos };
};

const saveParsedQuestions = async (req, res) => {
    try {
        const { subject, questions, week } = req.body; 

        if (!subject || !questions || !week) {
            return res.status(400).json({ 
                status: "error", 
                message: "Subject, Soal, dan Minggu wajib diisi" 
            });
        }

        const finalQuestions = questions.map(q => ({
            subject: subject,
            week: parseInt(week),
            difficulty_level: (q.difficulty_level || 'sedang').toLowerCase(),
            question: q.question,
            options: q.options,
            correct_answer: q.correct_answer.toUpperCase()
        }));

        const { data, error } = await supabase
            .from('questions')
            .insert(finalQuestions);

        if (error) throw error;

        res.status(201).json({ status: "success", message: "Berhasil simpan soal" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const submitOnboarding = async (req, res) => {
    try {
        const { student_id, subject, answers, notes } = req.body;
        if (!student_id || !subject || !answers) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap" });
        }
        const data = await processOnboardingData(student_id, subject, answers, notes);
        res.status(201).json({ status: "success", data });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getStudentProgress = async (req, res) => {
    try {
        const studentId = req.params.id.trim(); // Pastikan ID bersih
        const progressData = await onboardingModel.getStudentProgress(studentId);

        if (!progressData || progressData.length === 0) {
            return res.status(200).json({ 
                status: "success", 
                data: { tajwid: [], fiqih: [], tauhid: [] } 
            });
        }

        // PERBAIKAN: Tambahkan .trim() sebelum .toLowerCase()
        const groupedProgress = {
            tajwid: progressData.filter(item => item.subject && item.subject.trim().toLowerCase() === 'tajwid'),
            fiqih: progressData.filter(item => item.subject && item.subject.trim().toLowerCase() === 'fiqih'),
            tauhid: progressData.filter(item => item.subject && item.subject.trim().toLowerCase() === 'tauhid')
        };

        res.status(200).json({ status: "success", data: groupedProgress });
    } catch (error) {
        console.error("Get Progress Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// ============================================================
// GET /api/onboarding/questions/:subject
//
// PERUBAHAN: Response sekarang dikelompokkan by subject → week
// Format baru:
// {
//   status: "success",
//   total_questions: 15,
//   data: {
//     tajwid: {
//       1: [ ...soal minggu 1 ],
//       2: [ ...soal minggu 2 ],
//     }
//   }
// }
//
// Mode Guru (tanpa week & student_id): grouped format
// Mode Ujian (dengan week & student_id): flat array adaptif (tidak berubah)
// ============================================================
// ============================================================
// GET /api/onboarding/questions/:subject
// ============================================================
const getQuestions = async (req, res) => {
    try {
        const { subject } = req.params;
        const { week, student_id } = req.query;

        // ==========================================================
        // 1. MODE GURU — Grouped by subject → week
        // ==========================================================
        if (!week && !student_id) {
            const { data, error } = await supabase
                .from('questions')
                .select('id, question, options, correct_answer, week, difficulty_level, subject')
                .eq('subject', subject)
                .order('week', { ascending: true })
                .order('created_at', { ascending: true });

            if (error) throw error;

            const grouped = {};
            data.forEach(q => {
                const w = q.week;
                if (!grouped[w]) grouped[w] = [];
                grouped[w].push(q);
            });

            return res.status(200).json({
                status: "success",
                total_questions: data.length,
                data: grouped
            });
        }

        // ==========================================================
        // 2. MODE UJIAN SANTRI (Logic Adaptif yang Sempurna)
        // ==========================================================
        if (!week || !student_id) {
            return res.status(400).json({ 
                status: "error", 
                message: "Week dan student_id diperlukan untuk mode adaptif" 
            });
        }

        const targetWeek = parseInt(week);
        let targetDifficulty = null; // PERBAIKAN: Kosongkan dulu untuk pertemuan 1

        // Tentukan Level Adaptif HANYA jika Pertemuan > 1
        if (targetWeek > 1) {
            targetDifficulty = 'sedang'; // Default aman jika tidak ada riwayat
            const prevWeek = targetWeek - 1;
            
            const { data: pastResults, error: pastError } = await supabase
                .from('onboarding_results')
                .select('score')
                .eq('student_id', student_id)
                .eq('subject', subject)
                .eq('week', prevWeek);

            if (pastError) console.error("Gagal cek riwayat:", pastError.message);

            if (pastResults && pastResults.length > 0) {
                const prevScore = pastResults[0].score;
                if (prevScore < 60) targetDifficulty = 'mudah';
                else if (prevScore <= 80) targetDifficulty = 'sedang';
                else targetDifficulty = 'sulit';
            }
        }

        // AMBIL SEMUA SOAL di minggu tersebut dari Database
        const { data: allQuestions, error: qError } = await supabase
            .from('questions')
            .select('id, question, options, correct_answer, difficulty_level')
            .eq('subject', subject)
            .eq('week', targetWeek);

        if (qError) throw qError;

        let finalQuestions = allQuestions; // Default: Semua soal dikirim untuk Pertemuan 1

        // Saring soal HANYA jika targetDifficulty terisi (Pertemuan 2 ke atas)
        if (targetDifficulty) {
            finalQuestions = allQuestions.filter(q => q.difficulty_level === targetDifficulty);

            // Fallback: Jika soal di level tsb kurang dari 3, kembalikan ke campuran semua soal
            if (finalQuestions.length < 3) {
                finalQuestions = allQuestions; 
            }
        }

        res.status(200).json({
            status: "success",
            adaptive_level: targetDifficulty || 'mix_all', // mix_all untuk pertemuan 1
            total_questions: finalQuestions.length,
            data: finalQuestions 
        });

    } catch (error) {
        console.error("Get Questions Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// ============================================================
// GET /api/onboarding/questions/summary
//
// BARU: Deteksi max week + gap (bolong) per mapel
// Response:
// {
//   tajwid: { maxWeek: 7, gaps: [4, 6], allWeeks: [1,2,3,5,7] },
//   fiqih:  { maxWeek: 3, gaps: [],     allWeeks: [1,2,3] },
//   tauhid: { maxWeek: 0, gaps: [],     allWeeks: [] }
// }
// ============================================================
const getQuestionsSummary = async (req, res) => {
    try {
        const subjects = ['tajwid', 'fiqih', 'tauhid'];

        const { data, error } = await supabase
            .from('questions')
            .select('subject, week')
            .in('subject', subjects);

        if (error) throw error;

        const result = {};

        for (const subject of subjects) {
            // Ambil semua week unik untuk mapel ini, urutkan ascending
            const weeks = [...new Set(
                data
                    .filter(q => q.subject === subject)
                    .map(q => q.week)
            )].sort((a, b) => a - b);

            const maxWeek = weeks.length > 0 ? Math.max(...weeks) : 0;

            // Deteksi gap: angka 1 s.d. maxWeek yang tidak ada di weeks
            const gaps = [];
            for (let i = 1; i <= maxWeek; i++) {
                if (!weeks.includes(i)) gaps.push(i);
            }

            result[subject] = {
                maxWeek,
                gaps,
                allWeeks: weeks
            };
        }

        res.status(200).json({ status: "success", data: result });
    } catch (error) {
        console.error("Get Questions Summary Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// ============================================================
// PUT /api/onboarding/questions/:id
// Edit satu soal (question, options, correct_answer, difficulty_level)
// ============================================================
const updateQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { question, options, correct_answer, difficulty_level } = req.body;

        if (!question || !options || !correct_answer) {
            return res.status(400).json({ status: "error", message: "question, options, dan correct_answer wajib diisi." });
        }

        const { data, error } = await supabase
            .from('questions')
            .update({
                question,
                options,
                correct_answer: correct_answer.toUpperCase(),
                difficulty_level: (difficulty_level || 'sedang').toLowerCase()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ status: "error", message: "Soal tidak ditemukan." });

        res.status(200).json({ status: "success", data });
    } catch (error) {
        console.error("Update Question Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// ============================================================
// DELETE /api/onboarding/questions/:id
// Hapus satu soal berdasarkan id
// ============================================================
const deleteQuestion = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('questions')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({ status: "success", message: "Soal berhasil dihapus." });
    } catch (error) {
        console.error("Delete Question Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getAvailableWeeks = async (req, res) => {
    try {
        const { subject } = req.params;

        const { data, error } = await supabase
            .from('questions')
            .select('week')
            .eq('subject', subject)
            .order('week', { ascending: true });

        if (error) throw error;

        const weeks = [...new Set(data.map(item => item.week))];

        res.status(200).json({
            status: "success",
            data: weeks
        });
    } catch (error) {
        console.error("Error Get Weeks:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getCompletionStatus = async (req, res) => {
    try {
        const { subject, week } = req.query;

        if (!subject || !week) {
            return res.status(400).json({ status: "error", message: "Subject dan Week diperlukan" });
        }

        const { data, error } = await supabase
            .from('onboarding_results')
            .select('student_id')
            .eq('subject', subject)
            .eq('week', parseInt(week));

        if (error) {
            console.error("Supabase Error:", error.message);
            return res.status(200).json({ status: "success", data: [] });
        }

        const finishedIds = data.map(item => item.student_id);

        res.status(200).json({
            status: "success",
            data: finishedIds
        });
    } catch (error) {
        console.error("Internal Error /status:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const submitAndGradeAnswers = async (req, res) => {
    try {
        const { student_id, subject, week, student_answers } = req.body;

        if (!student_id || !subject || !week || !student_answers) {
            return res.status(400).json({ status: "error", message: "Data pengerjaan tidak lengkap." });
        }

        const questionIds = student_answers.map(ans => ans.question_id);

        const { data: dbQuestions, error: qError } = await supabase
            .from('questions')
            .select('id, correct_answer')
            .in('id', questionIds);

        if (qError) throw qError;

        let correctCount = 0;
        student_answers.forEach(studentAns => {
            const match = dbQuestions.find(q => q.id === studentAns.question_id);
            if (match && match.correct_answer.toUpperCase() === studentAns.answer.toUpperCase()) {
                correctCount++;
            }
        });

        const totalSoal = student_answers.length;
        const score = totalSoal > 0 ? Math.round((correctCount / totalSoal) * 100) : 0;
        
        let category = 'C';
        if (score >= 80) category = 'A';
        else if (score >= 60) category = 'B';

        const { error: resultError } = await supabase
            .from('onboarding_results')
            .insert([{
                student_id,
                subject,
                week: parseInt(week),
                score,
                category,
                notes: "Koreksi otomatis oleh sistem"
            }]);

        if (resultError) throw resultError;

        const generatedTodos = [];
        if (score < 60) {
            generatedTodos.push({
                student_id,
                title: `Pendalaman Dasar ${subject.toUpperCase()}`,
                description: `Beri materi tambahan atau PR khusus untuk bab ${subject} minggu ini karena skor di bawah standar.`,
                status: "pending",
                week: parseInt(week)
            });
        } else if (score < 80) {
            generatedTodos.push({
                student_id,
                title: `Sesi Tanya Jawab ${subject.toUpperCase()}`,
                description: `Lakukan mini kuis lisan untuk memantapkan pemahaman mapel ${subject}.`,
                status: "pending",
                week: parseInt(week)
            });
        } else {
            generatedTodos.push({
                student_id,
                title: `Pengayaan ${subject.toUpperCase()}`,
                description: `Berikan tantangan lanjutan atau jadikan tutor sebaya untuk teman-temannya.`,
                status: "pending",
                week: parseInt(week)
            });
        }

        if (generatedTodos.length > 0) {
            const { error: todoError } = await supabase
                .from('todos')
                .insert(generatedTodos);
                
            if (todoError) console.error("Gagal buat Todo:", todoError.message);
        }

        res.status(201).json({ 
            status: "success", 
            message: "Jawaban berhasil dikirim dan disembunyikan dalam sistem." 
        });

    } catch (error) {
        console.error("Auto-Grade Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { 
    saveParsedQuestions, 
    submitOnboarding, 
    getStudentProgress, 
    getQuestions,
    getQuestionsSummary,   // BARU
    updateQuestion,        // BARU
    deleteQuestion,        // BARU
    getCompletionStatus,
    submitAndGradeAnswers,
    getAvailableWeeks
};
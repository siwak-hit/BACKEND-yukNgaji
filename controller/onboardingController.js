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

    // Logika Todo Sederhana (Sesuai diskusi terbaru)
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

// --- FUNGSI BARU UNTUK SAVE JSON DARI BANK SOAL ---
const saveParsedQuestions = async (req, res) => {
    try {
        // Hapus difficulty_level dari destructuring utama
        const { subject, questions, week } = req.body; 

        if (!subject || !questions || !week) {
            return res.status(400).json({ 
                status: "error", 
                message: "Subject, Soal, dan Minggu wajib diisi" 
            });
        }

        // Ambil difficulty_level dari properti masing-masing soal (q)
        const finalQuestions = questions.map(q => ({
            subject: subject,
            week: parseInt(week),
            difficulty_level: (q.difficulty_level || 'sedang').toLowerCase(), // <--- Ambil per soal
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

// --- FUNGSI LAINNYA ---

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
        const studentId = req.params.id;
        const progressData = await onboardingModel.getStudentProgress(studentId);

        if (!progressData || progressData.length === 0) {
            return res.status(200).json({ status: "success", data: null });
        }

        const groupedProgress = {
            tajwid: progressData.filter(item => item.subject === 'tajwid'),
            fiqih: progressData.filter(item => item.subject === 'fiqih'),
            tauhid: progressData.filter(item => item.subject === 'tauhid')
        };

        res.status(200).json({ status: "success", data: groupedProgress });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /api/onboarding/questions/:subject
const getQuestions = async (req, res) => {
    try {
        const { subject } = req.params;
        const { week, student_id } = req.query;

        // ==========================================================
        // 1. MODE GURU / BANK SOAL (Bypass untuk Riwayat)
        // Jika tidak ada week dan student_id, berikan SEMUA soal mapel tersebut
        // ==========================================================
        if (!week && !student_id) {
            const { data, error } = await supabase
                .from('questions')
                .select('id, question, options, correct_answer, week, difficulty_level')
                .eq('subject', subject)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return res.status(200).json({
                status: "success",
                total_questions: data.length,
                data: data
            });
        }

        // ==========================================================
        // 2. MODE UJIAN SANTRI (Logic Adaptif)
        // Jika ada week, maka WAJIB ada student_id juga
        // ==========================================================
        if (!week || !student_id) {
            return res.status(400).json({ 
                status: "error", 
                message: "Week dan student_id diperlukan untuk mode adaptif" 
            });
        }

        const targetWeek = parseInt(week);
        let targetDifficulty = 'sedang'; 

        // LOGIKA ADAPTIF (Sama seperti sebelumnya)
        if (targetWeek > 1) {
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

        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select('id, question, options, correct_answer')
            .eq('subject', subject)
            .eq('week', targetWeek)
            .eq('difficulty_level', targetDifficulty);

        if (qError) throw qError;

        // Acak dan batasi soal
        const shuffledQuestions = questions
            .sort(() => 0.5 - Math.random())
            .slice(0, 5); 

        res.status(200).json({
            status: "success",
            adaptive_level: targetDifficulty,
            total_questions: shuffledQuestions.length,
            data: shuffledQuestions
        });

    } catch (error) {
        console.error("Get Questions Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /api/onboarding/available-weeks/:subject
const getAvailableWeeks = async (req, res) => {
    try {
        const { subject } = req.params;

        // Ambil data week yang unik dari tabel QUESTIONS
        const { data, error } = await supabase
            .from('questions') // <--- Arahkan ke tabel master soal
            .select('week')
            .eq('subject', subject)
            .order('week', { ascending: true });

        if (error) throw error;

        // Ambil angka week saja dan hilangkan duplikat
        const weeks = [...new Set(data.map(item => item.week))];

        res.status(200).json({
            status: "success",
            data: weeks // Contoh: [1] jika baru ada soal week 1
        });
    } catch (error) {
        console.error("Error Get Weeks:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /api/onboarding/status?subject=...&week=...
const getCompletionStatus = async (req, res) => {
    try {
        const { subject, week } = req.query;

        if (!subject || !week) {
            return res.status(400).json({ status: "error", message: "Subject dan Week diperlukan" });
        }

        // Ambil data dari tabel onboarding_results (Gunakan nama lengkap sesuai skema kamu)
        const { data, error } = await supabase
            .from('onboarding_results') // <--- HARUS PERSIS SAMA DENGAN DI DB
            .select('student_id')
            .eq('subject', subject)
            .eq('week', parseInt(week));

        if (error) {
            console.error("Supabase Error:", error.message);
            // Jika tabel kosong/error, kirim array kosong agar FE tidak crash
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

// POST /api/onboarding/submit-grade
const submitAndGradeAnswers = async (req, res) => {
    try {
        const { student_id, subject, week, student_answers } = req.body;

        if (!student_id || !subject || !week || !student_answers) {
            return res.status(400).json({ status: "error", message: "Data pengerjaan tidak lengkap." });
        }

        // 1. AMBIL KUNCI JAWABAN DARI DB
        // Kita hanya mengambil kunci untuk soal-soal yang dikerjakan murid saja
        const questionIds = student_answers.map(ans => ans.question_id);

        const { data: dbQuestions, error: qError } = await supabase
            .from('questions')
            .select('id, correct_answer')
            .in('id', questionIds); // Cuma ambil soal yang ID-nya ada di array

        if (qError) throw qError;

        // 2. KOREKSI OTOMATIS
        let correctCount = 0;
        student_answers.forEach(studentAns => {
            const match = dbQuestions.find(q => q.id === studentAns.question_id);
            // Bandingkan jawaban murid dengan kunci (dibuat Uppercase agar kebal typo/case)
            if (match && match.correct_answer.toUpperCase() === studentAns.answer.toUpperCase()) {
                correctCount++;
            }
        });

        // 3. HITUNG SKOR & KATEGORI
        const totalSoal = student_answers.length;
        const score = totalSoal > 0 ? Math.round((correctCount / totalSoal) * 100) : 0;
        
        let category = 'C';
        if (score >= 80) category = 'A';
        else if (score >= 60) category = 'B';

        console.log(`Santri ${student_id} mendapat skor ${score} (${category}) di ${subject} Week ${week}`);

        // 4. SIMPAN KE TABEL onboarding_results
        const { error: resultError } = await supabase
            .from('onboarding_results') // Sesuai dengan skema kamu
            .insert([{
                student_id,
                subject,
                week: parseInt(week),
                score,
                category,
                notes: "Koreksi otomatis oleh sistem"
            }]);

        if (resultError) throw resultError;

        // 5. AUTO-GENERATE TODO BERDASARKAN SKOR
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
            // Jika nilainya A (80+), kasih todo pengayaan
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
                .from('todos') // Sesuai dengan skema kamu
                .insert(generatedTodos);
                
            if (todoError) console.error("Gagal buat Todo:", todoError.message);
        }

        // 6. KIRIM RESPONSE KE FE (Tanpa menampilkan skor)
        res.status(201).json({ 
            status: "success", 
            message: "Jawaban berhasil dikirim dan disembunyikan dalam sistem." 
        });

    } catch (error) {
        console.error("Auto-Grade Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// Jangan lupa tambahkan getAvailableWeeks ke module.exports
module.exports = { 
    saveParsedQuestions, 
    submitOnboarding, 
    getStudentProgress, 
    getQuestions,
    getCompletionStatus,
    submitAndGradeAnswers,
    getAvailableWeeks // <--- Tambahkan ini
};
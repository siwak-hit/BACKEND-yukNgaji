const examModel = require('../model/examModel');
const supabase = require('../config/supabaseClient'); // <-- KITA PANGGIL SUPABASE LANGSUNG DI SINI

// 1. Buat Wrapper Ujian Baru (Draft Awal)
const createNewExam = async (req, res) => {
    try {
        const { title, subject, duration_minutes } = req.body;
        const username = req.user.username;

        if (!title || !subject) return res.status(400).json({ status: "error", message: "Judul dan Mapel wajib diisi." });

        const newExam = await examModel.createExam({
            title,
            subject,
            duration_minutes: duration_minutes || 60,
            is_active: false, // Default draft
            created_by: username
        });

        res.status(201).json({ status: "success", data: newExam });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 2. Ambil Semua Daftar Ujian (Untuk Halaman Bank Soal)
const getExams = async (req, res) => {
    try {
        const exams = await examModel.getExamsByTeacher(req.user.username);
        res.status(200).json({ status: "success", data: exams });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 3. Ambil Detail 1 Ujian + Soalnya (Untuk Halaman Editor / Simulasi)
const getExamDetails = async (req, res) => {
    try {
        const examId = req.params.id;
        const examDetail = await examModel.getExamDetail(examId);
        res.status(200).json({ status: "success", data: examDetail });
    } catch (error) {
        console.error("Get Exam Detail Error:", error);
        // [PERBAIKAN] Tampilkan error.message aslinya agar gampang di-debug!
        res.status(500).json({ status: "error", message: error.message || "Gagal mengambil data ujian." });
    }
};

// [BARU] 3.5 Ambil Detail Ujian KHUSUS MURID (Tanpa Kunci Jawaban & Cek Deadline)
const getPlayExamDetails = async (req, res) => {
    try {
        const examId = req.params.id;
        const examDetail = await examModel.getExamDetail(examId);

        // 1. Cek apakah ujian aktif
        if (!examDetail.is_active) {
            return res.status(403).json({ status: "error", message: "Ujian ini belum diterbitkan atau sudah ditutup oleh Ustadz." });
        }

        // 2. Cek Deadline jika ini ujian Daring (PR)
        if (examDetail.is_daring && examDetail.deadline_at) {
            const now = new Date();
            const deadline = new Date(examDetail.deadline_at);
            if (now > deadline) {
                return res.status(403).json({ status: "error", message: "Waktu ujian Daring/PR ini sudah habis!" });
            }
        }

        // 3. SEMBUNYIKAN KUNCI JAWABAN (Keamanan Anti-Inspect Element)
        const sanitizedQuestions = examDetail.questions.map(q => {
            const { correct_answer, ...safeQuestion } = q;
            
            // [UPDATE] Berikan petunjuk ke frontend berapa kotak input yang harus dirender untuk tipe isian
            if (q.question_type === 'fill_in_blanks') {
                try {
                    const parsedAns = JSON.parse(correct_answer);
                    safeQuestion.blank_count = Array.isArray(parsedAns) ? parsedAns.length : 1;
                } catch(e) {
                    safeQuestion.blank_count = 1;
                }
            }
            return safeQuestion;
        });

        examDetail.questions = sanitizedQuestions;

        res.status(200).json({ status: "success", data: examDetail });
    } catch (error) {
        console.error("Get Play Exam Error:", error);
        res.status(500).json({ status: "error", message: error.message || "Gagal memuat ujian." });
    }
};

// 4. Simpan Soal dari Exam Builder & Terbitkan (Publish)
const saveAndPublishExam = async (req, res) => {
    try {
        const examId = req.params.id;
        // [FIX] Ambil is_daring dan deadline_at dari body
        const { title, duration_minutes, is_active, is_daring, deadline_at, questions } = req.body;

        if (is_active && (!questions || questions.length < 10)) {
            return res.status(400).json({ status: "error", message: "Ujian tidak bisa diterbitkan. Minimal 10 soal!" });
        }

        // [FIX] Masukkan is_daring dan deadline_at ke update
        await examModel.updateExam(examId, {
            title: title,
            duration_minutes: duration_minutes,
            is_active: is_active,
            is_daring: is_daring || false,
            deadline_at: is_daring ? deadline_at : null
        });

        const savedQuestions = await examModel.saveExamQuestions(examId, questions);
        res.status(200).json({ status: "success", message: "Berhasil disimpan!", data: savedQuestions });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 5. Hapus Ujian
const removeExam = async (req, res) => {
    try {
        await examModel.deleteExam(req.params.id);
        res.status(200).json({ status: "success", message: "Ujian berhasil dihapus." });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 6. Menerima Hasil Ujian dari Siswa & Koreksi Otomatis
const submitExamResult = async (req, res) => {
    try {
        const examId = req.params.id;
        // [FIX] Kita ganti 'score' jadi 'student_answers'
        const { student_id, subject, student_answers, capture_base64 } = req.body;

        if (!student_id || !student_answers || !Array.isArray(student_answers)) {
            return res.status(400).json({ status: "error", message: "Data jawaban tidak lengkap." });
        }

        let capture_url = null;

        // PROSES UPLOAD FOTO KAMERA (Jika Ada)
        if (capture_base64) {
            try {
                const base64Data = capture_base64.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const fileName = `capture_${examId}_${student_id}_${Date.now()}.jpg`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('exam_captures')
                    .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

                if (!uploadError) {
                    const { data: publicUrlData } = supabase.storage.from('exam_captures').getPublicUrl(fileName);
                    if (publicUrlData) capture_url = publicUrlData.publicUrl;
                }
            } catch (err) { console.error("Gagal memproses foto kamera:", err); }
        }

        // ===============================================================
        // [BARU] SISTEM KOREKSI OTOMATIS DI BACKEND
        // ===============================================================
        const { data: dbQuestions, error: qErr } = await supabase
            .from('exam_questions')
            // [UPDATE] Wajib panggil question_type
            .select('id, question_type, correct_answer')
            .eq('exam_id', examId);
            
        if (qErr) throw qErr;

        let correctCount = 0;
        student_answers.forEach(studentAns => {
            const match = dbQuestions.find(q => q.id === studentAns.question_id);
            if (match) {
                // CEK TIPE SOAL (Asumsi kamu sudah tambah kolom question_type)
                if (Array.isArray(studentAns.answer)) {
                    const correctArr = JSON.parse(match.correct_answer);
                    const isAllMatch = studentAns.answer.every((val, idx) => 
                        String(val).trim().toLowerCase() === String(correctArr[idx]).trim().toLowerCase()
                    );
                    if (isAllMatch) correctCount++;
                } else {
                    if (String(match.correct_answer).toUpperCase() === String(studentAns.answer).toUpperCase()) {
                        correctCount++;
                    }
                }
            }
        });

        const totalSoal = dbQuestions.length || 1; // Cegah bagi 0
        const calculatedScore = Math.round((correctCount / totalSoal) * 100);
        // ===============================================================

        // Cek apakah siswa sudah pernah mengerjakan ujian ini
        const { data: existing } = await supabase
            .from('exam_results')
            .select('id, capture_url')
            .eq('exam_id', examId)
            .eq('student_id', student_id)
            .single();

        if (existing) {
            await supabase.from('exam_results')
                .update({ 
                    score: calculatedScore, 
                    student_answers: student_answers, // Simpan histori jawaban anak
                    capture_url: capture_url || existing.capture_url, 
                    created_at: new Date().toISOString() 
                })
                .eq('id', existing.id);
        } else {
            await supabase.from('exam_results')
                .insert([{ 
                    student_id, 
                    exam_id: examId, 
                    subject, 
                    score: calculatedScore, 
                    student_answers: student_answers, // Simpan histori jawaban anak
                    capture_url 
                }]);
        }

        // [FITUR BARU] CEK EASTER EGG (APAKAH SEMUA UJIAN AKTIF SUDAH SELESAI?)
        const { count: totalActiveExams } = await supabase
            .from('exams')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        const { data: studentResults } = await supabase
            .from('exam_results')
            .select('exam_id')
            .eq('student_id', student_id);

        const uniqueStudentExams = new Set(studentResults.map(r => r.exam_id)).size;
        const isAllCompleted = uniqueStudentExams >= totalActiveExams;

        res.status(200).json({ 
            status: "success", 
            message: "Nilai dan foto ujian berhasil disimpan.",
            score: calculatedScore, // Kirim balik nilainya ke Frontend buat dimunculin
            is_all_completed: isAllCompleted 
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 7. Ambil Nilai Ujian Siswa Spesifik
const getStudentExamResults = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exam_results')
            .select('*')
            .eq('student_id', req.params.studentId);
            
        if (error) throw error;
        res.status(200).json({ status: "success", data: data || [] });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 8. Ambil Data Siapa Saja yang Sudah Mengerjakan Ujian Tertentu
const getExamResultsByExam = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exam_results')
            .select('student_id, score')
            .eq('exam_id', req.params.id);
            
        if (error) throw error;
        res.status(200).json({ status: "success", data: data || [] });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// =========================================================
// RUTE PUBLIK (LOBBY & LOGIN DARING)
// =========================================================
const getPublicExamLobby = async (req, res) => {
    try {
        const examId = req.params.id;
        // Sementara kembalikan pesan sukses agar server tidak crash
        // Nanti logikanya bisa diisi untuk ambil detail ujian tanpa token
        res.status(200).json({ status: "success", message: "Lobby publik berhasil diakses." });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const studentExamLogin = async (req, res) => {
    try {
        // Sementara kembalikan pesan sukses agar server tidak crash
        // Nanti logikanya bisa diisi untuk validasi murid dan cetak token JWT
        res.status(200).json({ status: "success", message: "Login murid berhasil." });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const buyExamTime = async (req, res) => {
    try {
        const { student_id, cost, minutes } = req.body;

        if (!student_id || !cost || !minutes) {
            return res.status(400).json({ status: "error", message: "Data pembelian tidak lengkap." });
        }

        // 1. Cek saldo poin siswa 
        const { data: student, error: fetchErr } = await supabase
            .from('students')
            .select('name, poin')
            .eq('id', student_id)
            .single();

        if (fetchErr || !student) return res.status(404).json({ status: "error", message: "Siswa tidak ditemukan." });

        // 2. Validasi saldo 
        if (Number(student.poin) < cost) {
            return res.status(400).json({ status: "error", message: "Poin tidak mencukupi untuk membeli waktu." });
        }

        // 3. Potong poin di database 
        const newPoin = Number(student.poin) - cost;
        const { error: updateErr } = await supabase
            .from('students')
            .update({ poin: newPoin })
            .eq('id', student_id);

        if (updateErr) throw updateErr;

        // 4. Catat ke Gamification Logs agar riwayatnya jelas 
        await supabase.from('gamification_logs').insert([{
            actor_id: student_id,
            action_type: 'buy_time',
            point_change: -cost,
            attacker_name: student.name,
            metadata: { mins_added: minutes, context: 'exam_session' },
            is_read: true
        }]);

        res.status(200).json({ 
            status: "success", 
            message: `Berhasil menambah ${minutes} menit.`,
            data: { new_poin: newPoin } 
        });

    } catch (error) {
        console.error("Error Buy Time:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = {
    createNewExam,
    getExams,
    getExamDetails,
    saveAndPublishExam,
    removeExam,
    submitExamResult,
    getStudentExamResults,
    getExamResultsByExam,
    getPlayExamDetails,
    getPublicExamLobby, 
    studentExamLogin,
    buyExamTime    
};
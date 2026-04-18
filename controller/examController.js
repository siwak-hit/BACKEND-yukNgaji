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

// 4. Simpan Soal dari Exam Builder & Terbitkan (Publish)
const saveAndPublishExam = async (req, res) => {
    try {
        const examId = req.params.id;
        const { title, duration_minutes, is_active, questions } = req.body;

        // Validasi: Jika ingin diaktifkan (publish), soal harus minimal 10
        if (is_active && (!questions || questions.length < 10)) {
            return res.status(400).json({ 
                status: "error", 
                message: "Ujian tidak bisa diterbitkan. Minimal harus ada 10 soal!" 
            });
        }

        // Update pengaturan ujian
        await examModel.updateExam(examId, {
            title: title,
            duration_minutes: duration_minutes,
            is_active: is_active
        });

        // Simpan / Timpa seluruh daftar soal
        const savedQuestions = await examModel.saveExamQuestions(examId, questions);

        res.status(200).json({ 
            status: "success", 
            message: is_active ? "Ujian berhasil diterbitkan!" : "Draft ujian berhasil disimpan.",
            data: savedQuestions
        });

    } catch (error) {
        console.error("Save & Publish Error:", error);
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

// 6. Menerima Hasil Ujian dari Siswa (Beserta Foto Bukti)
const submitExamResult = async (req, res) => {
    try {
        const examId = req.params.id;
        const { student_id, subject, score, capture_base64 } = req.body;

        if (!student_id || score === undefined) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap." });
        }

        let capture_url = null;

        // PROSES UPLOAD FOTO KAMERA (Jika Ada)
        if (capture_base64) {
            try {
                // Bersihkan header base64
                const base64Data = capture_base64.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const fileName = `capture_${examId}_${student_id}_${Date.now()}.jpg`;

                // Upload ke bucket 'exam_captures'
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('exam_captures')
                    .upload(fileName, buffer, {
                        contentType: 'image/jpeg',
                        upsert: true
                    });

                if (!uploadError) {
                    const { data: publicUrlData } = supabase.storage.from('exam_captures').getPublicUrl(fileName);
                    if (publicUrlData) capture_url = publicUrlData.publicUrl;
                }
            } catch (err) {
                console.error("Gagal memproses foto kamera:", err);
            }
        }

        // Cek apakah siswa sudah pernah mengerjakan ujian ini
        const { data: existing } = await supabase
            .from('exam_results')
            .select('id, capture_url')
            .eq('exam_id', examId)
            .eq('student_id', student_id)
            .single();

        if (existing) {
            await supabase
                .from('exam_results')
                .update({ 
                    score: score, 
                    capture_url: capture_url || existing.capture_url, // Timpa foto jika ada foto baru
                    created_at: new Date().toISOString() 
                })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('exam_results')
                .insert([{ student_id, exam_id: examId, subject, score, capture_url }]);
        }

        res.status(200).json({ status: "success", message: "Nilai dan foto ujian berhasil disimpan." });
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

module.exports = {
    createNewExam,
    getExams,
    getExamDetails,
    saveAndPublishExam,
    removeExam,
    submitExamResult,
    getStudentExamResults,
    getExamResultsByExam
};
const examModel = require('../model/examModel');
const supabase = require('../config/supabaseClient');

const REQUIRED_FINAL_SUBJECTS = ['tajwid', 'fiqih', 'tauhid'];

const normalizeSubject = (subject = '') => {
    return String(subject).trim().toLowerCase();
};

const createNewExam = async (req, res) => {
    try {
        const { title, subject, duration_minutes } = req.body;
        const username = req.user.username;
        if (!title || !subject) return res.status(400).json({ status: "error", message: "Judul dan Mapel wajib diisi." });
        const newExam = await examModel.createExam({
            title,
            subject,
            duration_minutes: duration_minutes || 60,
            is_active: false,
            created_by: username
        });
        res.status(201).json({ status: "success", data: newExam });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getExams = async (req, res) => {
    try {
        const exams = await examModel.getExamsByTeacher(req.user.username);
        res.status(200).json({ status: "success", data: exams });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getExamDetails = async (req, res) => {
    try {
        const examId = req.params.id;
        const examDetail = await examModel.getExamDetail(examId);
        res.status(200).json({ status: "success", data: examDetail });
    } catch (error) {
        console.error("Get Exam Detail Error:", error);
        res.status(500).json({ status: "error", message: error.message || "Gagal mengambil data ujian." });
    }
};

const getPlayExamDetails = async (req, res) => {
    try {
        const examId = req.params.id;
        const examDetail = await examModel.getExamDetail(examId);
        if (!examDetail.is_active) {
            return res.status(403).json({ status: "error", message: "Ujian ini belum diterbitkan atau sudah ditutup oleh Ustadz." });
        }
        if (examDetail.is_daring && examDetail.deadline_at) {
            const now = new Date();
            const deadline = new Date(examDetail.deadline_at);
            if (now > deadline) {
                return res.status(403).json({ status: "error", message: "Waktu ujian Daring/PR ini sudah habis!" });
            }
        }
        const sanitizedQuestions = examDetail.questions.map(q => {
            const { correct_answer, ...safeQuestion } = q;
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

const saveAndPublishExam = async (req, res) => {
    try {
        const examId = req.params.id;
        const { title, duration_minutes, is_active, is_daring, deadline_at, questions } = req.body;
        if (is_active && (!questions || questions.length < 10)) {
            return res.status(400).json({ status: "error", message: "Ujian tidak bisa diterbitkan. Minimal 10 soal!" });
        }
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

const removeExam = async (req, res) => {
    try {
        await examModel.deleteExam(req.params.id);
        res.status(200).json({ status: "success", message: "Ujian berhasil dihapus." });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const submitExamResult = async (req, res) => {
    try {
        const examId = req.params.id;
        const { student_id, subject, student_answers, capture_base64, audio_base64 } = req.body;
        if (!student_id || !student_answers || !Array.isArray(student_answers)) {
            return res.status(400).json({ status: "error", message: "Data jawaban tidak lengkap." });
        }
        const { data: existingExamResult, error: existingExamResultErr } = await supabase
            .from('exam_results')
            .select('id, score')
            .eq('student_id', student_id)
            .eq('exam_id', examId)
            .maybeSingle();
        if (existingExamResultErr) throw existingExamResultErr;
        if (existingExamResult) {
            return res.status(400).json({ status: "error", message: "Ujian ini sudah pernah kamu kumpulkan sebelumnya." });
        }
        let latePenalty = false;
        const { data: examGate } = await supabase
            .from('exams')
            .select('is_daring, deadline_at, extended_students')
            .eq('id', examId)
            .single();
        if (examGate && examGate.is_daring && examGate.deadline_at) {
            const now = new Date();
            const deadline = new Date(examGate.deadline_at);
            let extList = examGate.extended_students;
            try { while (typeof extList === 'string') extList = JSON.parse(extList); } catch (e) {}
            if (!Array.isArray(extList)) extList = [];
            const extRecord = extList.find(ext => (typeof ext === 'object' ? ext.student_id : ext) === student_id);
            if (!extRecord) {
                if (now > deadline) {
                    return res.status(403).json({ status: "error", message: "Waktu ujian sudah habis! Minta perpanjangan waktu ke Ustadz dulu ya." });
                }
            } else {
                const extUntil = extRecord.until ? new Date(extRecord.until) : null;
                if (extUntil && now > extUntil) {
                    return res.status(403).json({ status: "error", message: "Waktu perpanjangan kamu sudah habis juga!" });
                }
                if (extRecord.penalty) latePenalty = true;
            }
        }
        let capture_url = null;
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
            } catch (err) {
                console.error("Gagal memproses foto kamera:", err);
            }
        }
        let recording_url = null;
        if (audio_base64) {
            try {
                const mimeMatch = String(audio_base64).match(/^data:(audio\/[\w.+-]+);base64,/);
                const audioMime = mimeMatch ? mimeMatch[1] : 'audio/webm';
                const ext = audioMime.includes('mp4') ? 'm4a' : (audioMime.includes('ogg') ? 'ogg' : 'webm');
                const base64Audio = String(audio_base64).replace(/^data:audio\/[\w.+-]+;base64,/, "");
                const audioBuffer = Buffer.from(base64Audio, 'base64');
                const audioFileName = `recording_${examId}_${student_id}_${Date.now()}.${ext}`;
                const { error: audioUploadError } = await supabase.storage
                    .from('exam_recordings')
                    .upload(audioFileName, audioBuffer, { contentType: audioMime, upsert: true });
                if (!audioUploadError) {
                    const { data: audioPublicUrlData } = supabase.storage.from('exam_recordings').getPublicUrl(audioFileName);
                    if (audioPublicUrlData) recording_url = audioPublicUrlData.publicUrl;
                } else {
                    console.error("Gagal upload rekaman suara:", audioUploadError.message);
                }
            } catch (err) {
                console.error("Gagal memproses rekaman suara:", err);
            }
        }
        const { data: dbQuestions, error: qErr } = await supabase
            .from('exam_questions')
            .select('id, question_type, correct_answer')
            .eq('exam_id', examId);
        if (qErr) throw qErr;
        let correctCount = 0;
        student_answers.forEach(studentAns => {
            const match = dbQuestions.find(q => q.id === studentAns.question_id);
            if (match) {
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
        const totalSoal = dbQuestions.length || 1;
        let calculatedScore = Math.round((correctCount / totalSoal) * 100);
        if (latePenalty) calculatedScore = Math.floor(calculatedScore * 0.9);
        const { data: insertedExamResult, error: insertError } = await supabase.from('exam_results')
        .insert([{
            student_id,
            exam_id: examId,
            subject,
            score: calculatedScore,
            student_answers: student_answers,
            capture_url,
            recording_url
        }])
        .select('id, student_id, exam_id, subject, score, capture_url, recording_url, created_at')
        .single();
        if (insertError) throw insertError;
        const { data: notifStudent } = await supabase
            .from('students')
            .select('name, created_by')
            .eq('id', student_id)
            .single();
        const { data: notifExam } = await supabase
            .from('exams')
            .select('title, subject, created_by')
            .eq('id', examId)
            .single();
        await supabase.from('pr_notifications').insert([{
            notif_type: 'exam',
            student_id,
            student_name: notifStudent?.name || 'Anak',
            exam_id: examId,
            result_id: insertedExamResult.id,
            subject: notifExam?.subject || subject,
            score: calculatedScore,
            title: notifExam?.title || 'Ujian',
            capture_url,
            created_by: notifExam?.created_by || notifStudent?.created_by || null
        }]);
        const { data: currentExam, error: currentExamErr } = await supabase
            .from('exams')
            .select('id, title, subject, created_by, is_active')
            .eq('id', examId)
            .single();
        if (currentExamErr) throw currentExamErr;
        let requiredExamQuery = supabase
            .from('exams')
            .select('id, title, subject')
            .eq('is_active', true)
            .in('subject', REQUIRED_FINAL_SUBJECTS);
        if (currentExam?.created_by) {
            requiredExamQuery = requiredExamQuery.eq('created_by', currentExam.created_by);
        }
        const { data: requiredExams, error: requiredErr } = await requiredExamQuery;
        if (requiredErr) throw requiredErr;
        const requiredSubjectMap = new Map();
        (requiredExams || []).forEach(exam => {
            const subjectKey = normalizeSubject(exam.subject);
            if (REQUIRED_FINAL_SUBJECTS.includes(subjectKey)) {
                requiredSubjectMap.set(subjectKey, String(exam.id));
            }
        });
        const hasAllRequiredExamsPublished = REQUIRED_FINAL_SUBJECTS.every(subject =>
            requiredSubjectMap.has(subject)
        );
        const { data: studentResults, error: studentResultsErr } = await supabase
            .from('exam_results')
            .select(`
                exam_id,
                exams (
                    id,
                    subject,
                    created_by,
                    is_active
                )
            `)
            .eq('student_id', student_id);
        if (studentResultsErr) throw studentResultsErr;
        const completedRequiredSubjects = new Set();
        (studentResults || []).forEach(result => {
            const exam = result.exams;
            if (!exam) return;
            if (currentExam?.created_by && exam.created_by !== currentExam.created_by) return;
            if (exam.is_active !== true) return;
            const subjectKey = normalizeSubject(exam.subject);
            if (REQUIRED_FINAL_SUBJECTS.includes(subjectKey)) {
                completedRequiredSubjects.add(subjectKey);
            }
        });
        const totalRequiredExams = REQUIRED_FINAL_SUBJECTS.length;
        const totalCompletedExams = completedRequiredSubjects.size;
        const isAllCompleted =
            hasAllRequiredExamsPublished &&
            REQUIRED_FINAL_SUBJECTS.every(subject => completedRequiredSubjects.has(subject));
        const leaderboardRedirect =
            `/selesai?mode=exam` +
            `&exam_id=${encodeURIComponent(examId)}` +
            `&subject=${encodeURIComponent(currentExam?.subject || subject || 'Ujian')}` +
            `&student_id=${encodeURIComponent(student_id)}`;
        const finalLeaderboardRedirect =
            `${leaderboardRedirect}&final=true&feedback_required=true`;
        return res.status(200).json({
            status: "success",
            message: "Nilai dan foto ujian berhasil disimpan.",
            score: calculatedScore,
            is_all_completed: isAllCompleted,
            data: {
                score: calculatedScore,
                is_all_completed: isAllCompleted,
                total_required_exams: totalRequiredExams,
                total_completed_exams: totalCompletedExams,
                next_redirect: leaderboardRedirect,
                after_wrapped_redirect: finalLeaderboardRedirect
            }
        });
    } catch (error) {
        console.error("Error pada submitExamResult:", error);
        return res.status(500).json({ status: "error", message: error.message });
    }
};

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

const getPublicExamLobby = async (req, res) => {
    try {
        const examId = req.params.id;
        res.status(200).json({ status: "success", message: "Lobby publik berhasil diakses." });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const studentExamLogin = async (req, res) => {
    try {
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
        const { data: student, error: fetchErr } = await supabase
            .from('students')
            .select('name, poin')
            .eq('id', student_id)
            .single();
        if (fetchErr || !student) return res.status(404).json({ status: "error", message: "Siswa tidak ditemukan." });
        if (Number(student.poin) < cost) {
            return res.status(400).json({ status: "error", message: "Poin tidak mencukupi untuk membeli waktu." });
        }
        const newPoin = Number(student.poin) - cost;
        const { error: updateErr } = await supabase
            .from('students')
            .update({ poin: newPoin })
            .eq('id', student_id);
        if (updateErr) throw updateErr;
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

const completeExamTutorial = async (req, res) => {
    try {
        const { student_id } = req.body;
        if (!student_id) {
            return res.status(400).json({ status: "error", message: "ID Siswa diperlukan." });
        }
        const { error } = await supabase
            .from('students')
            .update({ has_completed_exam_tutorial: true })
            .eq('id', student_id);
        if (error) throw error;
        res.status(200).json({ status: "success", message: "Tutorial berhasil diselesaikan." });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const createRetakePermission = async (req, res) => {
    try {
        const examId = req.params.id;
        const username = req.user.username;
        const {
            student_id,
            mode = 'extra_time',
            extra_minutes = 10,
            reason = ''
        } = req.body;
        if (!student_id) {
            return res.status(400).json({
                status: "error",
                message: "Siswa wajib dipilih."
            });
        }
        if (!['reset', 'continue', 'extra_time'].includes(mode)) {
            return res.status(400).json({
                status: "error",
                message: "Mode izin tidak valid."
            });
        }
        if (mode === 'extra_time' && (!extra_minutes || Number(extra_minutes) <= 0)) {
            return res.status(400).json({
                status: "error",
                message: "Tambahan menit wajib lebih dari 0."
            });
        }
        const { data: exam, error: examErr } = await supabase
            .from('exams')
            .select('id, title, created_by')
            .eq('id', examId)
            .single();
        if (examErr || !exam) {
            return res.status(404).json({
                status: "error",
                message: "Ujian tidak ditemukan."
            });
        }
        if (exam.created_by !== username) {
            return res.status(403).json({
                status: "error",
                message: "Kamu tidak punya akses ke ujian ini."
            });
        }
        const { data: student, error: studentErr } = await supabase
            .from('students')
            .select('id, name')
            .eq('id', student_id)
            .single();
        if (studentErr || !student) {
            return res.status(404).json({
                status: "error",
                message: "Siswa tidak ditemukan."
            });
        }
        await supabase
            .from('exam_retake_permissions')
            .update({
                is_used: true,
                used_at: new Date().toISOString(),
                reason: 'Digantikan oleh izin baru'
            })
            .eq('exam_id', examId)
            .eq('student_id', student_id)
            .eq('is_used', false);
        const { data, error } = await supabase
            .from('exam_retake_permissions')
            .insert([{
                exam_id: examId,
                student_id,
                mode,
                extra_minutes: mode === 'extra_time' ? Number(extra_minutes) : 0,
                reason,
                granted_by: username
            }])
            .select(`
                *,
                students (
                    id,
                    name
                )
            `)
            .single();
        if (error) throw error;
        return res.status(201).json({
            status: "success",
            message: "Izin ujian berhasil dibuat.",
            data
        });
    } catch (error) {
        console.error("Create Retake Permission Error:", error);
        return res.status(500).json({
            status: "error",
            message: error.message || "Gagal membuat izin ujian."
        });
    }
};

const checkRetakePermission = async (req, res) => {
    try {
        const examId = req.params.id;
        const { student_id } = req.query;
        if (!student_id) {
            return res.status(400).json({
                status: "error",
                message: "student_id wajib dikirim."
            });
        }
        const { data, error } = await supabase
            .from('exam_retake_permissions')
            .select('*')
            .eq('exam_id', examId)
            .eq('student_id', student_id)
            .eq('is_used', false)
            .order('granted_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return res.status(200).json({
            status: "success",
            data: data || null
        });
    } catch (error) {
        console.error("Check Retake Permission Error:", error);
        return res.status(500).json({
            status: "error",
            message: error.message || "Gagal mengecek izin ujian."
        });
    }
};

const markRetakePermissionUsed = async (req, res) => {
    try {
        const examId = req.params.id;
        const { permission_id, student_id } = req.body;
        if (!permission_id || !student_id) {
            return res.status(400).json({
                status: "error",
                message: "permission_id dan student_id wajib dikirim."
            });
        }
        const { data, error } = await supabase
            .from('exam_retake_permissions')
            .update({
                is_used: true,
                used_at: new Date().toISOString()
            })
            .eq('id', permission_id)
            .eq('exam_id', examId)
            .eq('student_id', student_id)
            .select()
            .single();
        if (error) throw error;
        return res.status(200).json({
            status: "success",
            message: "Izin ujian sudah dipakai.",
            data
        });
    } catch (error) {
        console.error("Mark Retake Permission Used Error:", error);
        return res.status(500).json({
            status: "error",
            message: error.message || "Gagal memakai izin ujian."
        });
    }
};

const grantExamExtension = async (req, res) => {
    try {
        const examId = req.params.id;
        const username = req.user.username;
        const { student_id, extension_until, with_penalty } = req.body;
        if (!student_id || !extension_until) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap." });
        }
        const { data: exam, error: examErr } = await supabase
            .from('exams')
            .select('id, created_by, extended_students')
            .eq('id', examId)
            .single();
        if (examErr || !exam) return res.status(404).json({ status: "error", message: "Ujian tidak ditemukan." });
        if (exam.created_by !== username) return res.status(403).json({ status: "error", message: "Kamu tidak punya akses ke ujian ini." });
        let extended = exam.extended_students || [];
        try { while (typeof extended === 'string') extended = JSON.parse(extended); } catch (e) {}
        if (!Array.isArray(extended)) extended = [];
        extended = extended.filter(ext => (typeof ext === 'object' ? ext.student_id : ext) !== student_id);
        extended.push({ student_id, until: extension_until, penalty: !!with_penalty });
        const { error: updErr } = await supabase
            .from('exams')
            .update({ extended_students: extended })
            .eq('id', examId);
        if (updErr) throw updErr;
        res.status(200).json({ status: "success", message: "Perpanjangan diberikan!" });
    } catch (error) {
        console.error("Grant Exam Extension Error:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getQuestionsForPrint = async (req, res) => {
    try {
        const { subject, week, limit = 20, category, includeImages } = req.query;
        if (!subject) {
            return res.status(400).json({ status: "error", message: "Subject is required." });
        }
        let query = supabase
            .from('questions')
            .select('*')
            .in('type', ['pilgan', 'tf', 'drag'])
            .eq('subject', subject);
        if (week && week !== 'gabungan') {
            query = query.eq('week', week);
        }
        if (category && category !== 'campuran') {
            query = query.eq('difficulty_level', category);
        }
        const { data: questions, error } = await query.limit(Number(limit));
        if (error) throw error;
        const processedQuestions = questions.map(q => {
            let processed = { ...q };
            if (processed.type === 'drag') {
                processed.type = 'pilgan';
                const correctKeys = processed.correct_answer.split(',');
                const newOptions = {};
                correctKeys.forEach((key, index) => {
                    newOptions[String.fromCharCode(65 + index)] = processed.options[key];
                });
                processed.options = newOptions;
                processed.correct_answer = 'A';
            }
            if (includeImages === 'false') {
                delete processed.image_url;
            }
            return processed;
        });
        const shuffled = processedQuestions.sort(() => 0.5 - Math.random());
        res.status(200).json(shuffled);
    } catch (error) {
        console.error("Error getting questions for print:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const buyExamHint = async (req, res) => {
    try {
        const { student_id, cost = 50, exam_id, question_id } = req.body;
        if (!student_id || !cost || !exam_id || !question_id) {
            return res.status(400).json({
                status: "error",
                message: "Data pembelian clue tidak lengkap."
            });
        }
        const { data: student, error: fetchErr } = await supabase
            .from('students')
            .select('name, poin')
            .eq('id', student_id)
            .single();
        if (fetchErr || !student) {
            return res.status(404).json({
                status: "error",
                message: "Siswa tidak ditemukan."
            });
        }
        if (Number(student.poin) < Number(cost)) {
            return res.status(400).json({
                status: "error",
                message: "Poin tidak mencukupi untuk membuka clue."
            });
        }
        const newPoin = Number(student.poin) - Number(cost);
        const { error: updateErr } = await supabase
            .from('students')
            .update({ poin: newPoin })
            .eq('id', student_id);
        if (updateErr) throw updateErr;
        await supabase.from('gamification_logs').insert([{
            actor_id: student_id,
            action_type: 'buy_hint',
            point_change: -Number(cost),
            metadata: {
                exam_id,
                question_id,
                context: 'exam_hint'
            },
            is_read: true
        }]);
        return res.status(200).json({
            status: "success",
            message: "Clue berhasil dibuka.",
            data: {
                new_poin: newPoin
            }
        });
    } catch (error) {
        console.error("Error Buy Hint:", error);
        return res.status(500).json({
            status: "error",
            message: error.message || "Gagal membeli clue."
        });
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
    buyExamTime,
    completeExamTutorial,
    createRetakePermission,
    checkRetakePermission,
    buyExamHint,
    markRetakePermissionUsed,
    grantExamExtension,
    getQuestionsForPrint
};
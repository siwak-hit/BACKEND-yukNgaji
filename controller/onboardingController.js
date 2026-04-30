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
        const { student_id, subject, week, student_answers, is_double_score, is_extra_life_used, is_pr, time_taken } = req.body;

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
            .select('poin, item_double_score, item_extra_life') // <-- Tambah item_extra_life di sini
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
            let newPoin = studentInfo.poin + finalScore;
            let newDoubleCount = studentInfo.item_double_score;
            let newExtraLifeCount = studentInfo.item_extra_life;
            
            if (isItemUsed) newDoubleCount -= 1; // Kurangi Double Score
            
            // [PERBAIKAN]: Kurangi Extra Life di DB jika dipakai
            if (is_extra_life_used && newExtraLifeCount > 0) {
                newExtraLifeCount -= 1;
            }

            await supabase.from('students')
                .update({ 
                    poin: newPoin, 
                    item_double_score: newDoubleCount,
                    item_extra_life: newExtraLifeCount
                })
                .eq('id', student_id);
        }

        // 5. Simpan Hasil Ujian Permanen (dengan Final Score)
        const { error: resultError } = await supabase
            .from('onboarding_results')
            .insert([{
                student_id,
                subject,
                week: parseInt(week),
                score: finalScore, 
                category,
                student_answers, 
                notes: isItemUsed ? "Koreksi Sihir ✨ (Double Poin Aktif)" : "Koreksi otomatis oleh sistem",
                is_pr: is_pr || false,
                time_taken: time_taken || 0
            }]);

        if (resultError) throw resultError;

        // =========================================================
        // --- LOGIKA PEMUSNAHAN PERISAI MASSAL (LANGKAH 5) ---
        // =========================================================
        // 1. Ambil nama ustadz (created_by) dari siswa yang sedang submit
        const { data: currentStudentData } = await supabase
            .from('students')
            .select('created_by')
            .eq('id', student_id)
            .single();

        if (currentStudentData && currentStudentData.created_by) {
            const teacherUsername = currentStudentData.created_by;

            // 2. Ambil daftar murid reguler di kelas tersebut (Abaikan akun Testing)
            const { data: regularStudents } = await supabase
                .from('students')
                .select('id')
                .eq('created_by', teacherUsername)
                .not('name', 'ilike', '%john doe%')
                .not('name', 'ilike', '%xaveria%');

            if (regularStudents && regularStudents.length > 0) {
                const regularIds = regularStudents.map(s => s.id);

                // 3. Cek siapa saja yang sudah mengerjakan mapel & week ini
                const { data: submitted } = await supabase
                    .from('onboarding_results')
                    .select('student_id')
                    .eq('subject', subject)
                    .eq('week', week)
                    .in('student_id', regularIds);

                const submittedIds = new Set((submitted || []).map(r => r.student_id));

                // 4. Jika semua murid reguler sudah ngerjain, KELAS SELESAI!
                if (regularIds.every(id => submittedIds.has(id))) {
                    // MATIKAN SEMUA PERISAI DI KELAS TERSEBUT
                    await supabase
                        .from('students')
                        .update({ is_shield_active: false })
                        .eq('created_by', teacherUsername);
                }
            }
        }
        // =========================================================

        res.status(201).json({ status: "success", message: "Jawaban berhasil dikirim dan dinilai." });
    } catch (error) {
        console.error("Auto-Grade Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getPRLeaderboard = async (req, res) => {
    try {
        const { subject, week } = req.query;

        // 1. Ambil SEMUA hasil di mapel & minggu ini (Hapus filter .eq('is_pr', true))
        // [UPDATE] Tambahkan 'is_pr' ke dalam list .select()
        const { data: results, error } = await supabase
            .from('onboarding_results')
            .select('student_id, score, created_at, time_taken, is_pr') 
            .eq('subject', subject)
            .eq('week', week);

        if (error) throw error;
        if (!results || results.length === 0) return res.status(200).json({ status: 'success', data: [] });

        const { data: students } = await supabase.from('students').select('id, name');

        // 2. Sortir waktu submit untuk fitur "Early Bird" (Siapa Cepat)
        const sortedBySubmit = [...results].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        // 3. Kalkulasi Poin Komposit
        const leaderboard = results.map(r => {
            const student = students.find(s => s.id === r.student_id);
            const rawScore = r.score || 0;
            const timeTaken = r.time_taken || 180; // Default 3 menit

            // A. Bobot Nilai (80%) -> Max 80 Poin
            const scorePoin = (rawScore / 100) * 80;

            // B. Bobot Waktu (10%) -> Max 10 Poin (Makin cepet makin gede)
            const maxTime = subject === 'tajwid' ? 105 : 180; 
            let timePoin = ((maxTime - timeTaken) / maxTime) * 10;
            if (timePoin < 0) timePoin = 0;

            // C. Bobot Early Bird (10%) -> Anak pertama yg ngumpulin dpt 10, kedua 9, dst.
            const submitRank = sortedBySubmit.findIndex(x => x.student_id === r.student_id);
            const earlyPoin = Math.max(0, 10 - submitRank);

            const compositeScore = (scorePoin + timePoin + earlyPoin).toFixed(1);

            return {
                student_id: r.student_id,
                name: student ? student.name.split(' ')[0] : 'Unknown', // Ambil nama panggilan
                raw_score: rawScore,
                time_taken: timeTaken,
                composite_score: parseFloat(compositeScore),
                is_pr: r.is_pr || false // <--- [BARU] Lempar status PR ke Frontend
            };
        });

        // Urutkan dari poin tertinggi ke terendah
        leaderboard.sort((a, b) => b.composite_score - a.composite_score);

        res.status(200).json({ status: 'success', data: leaderboard });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
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

const getQuestionsSummaryAll = async (req, res) => {
    try {
        // Hanya fetch 'subject' dan 'week' untuk menghemat bandwidth server & memory
        const { data, error } = await supabase.from('questions').select('subject, week');
        if (error) throw error;

        // Ekspektasi Format: { "1": { "tajwid": 9, "fiqih": 5, "tauhid": 4 }, "2": { ... } }
        const summary = {};
        
        if (data) {
            data.forEach(q => {
                const w = q.week;
                const s = q.subject;
                
                // Jika minggu ini belum ada di object summary, inisialisasi
                if (!summary[w]) {
                    summary[w] = { tajwid: 0, fiqih: 0, tauhid: 0 };
                }
                
                // Tambahkan hitungan soal untuk mapel tersebut
                if (summary[w][s] !== undefined) {
                    summary[w][s]++;
                } else {
                    summary[w][s] = 1; // Jaga-jaga jika ada mapel lain
                }
            });
        }
        
        res.status(200).json({ status: "success", data: summary });
    } catch (error) {
        console.error("Get Summary All Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// =======================================================
// FITUR GEMBOK PR
// =======================================================
const togglePRLock = async (req, res) => {
    try {
        const { subject, week, is_locked } = req.body;
        if (is_locked) {
            // Kalau digembok, simpan/timpa ke database
            const { error } = await supabase.from('pr_locks').upsert(
                { subject, week: parseInt(week) }, 
                { onConflict: 'subject, week' }
            );
            if (error) throw error;
        } else {
            // Kalau gembok dibuka, hapus dari database
            const { error } = await supabase.from('pr_locks').delete().match({ subject, week: parseInt(week) });
            if (error) throw error;
        }
        res.status(200).json({ status: 'success', message: 'Status PR diperbarui' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

const getPRLocks = async (req, res) => {
    try {
        const { subject } = req.params;
        const { data, error } = await supabase.from('pr_locks').select('week').eq('subject', subject);
        if (error) throw error;
        
        // Return array [1, 3] (misal minggu 1 dan 3 digembok)
        res.status(200).json({ status: 'success', data: data.map(d => d.week) });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// =======================================================
// FITUR UPLOAD FOTO SATPAM
// =======================================================
const uploadSatpamPhoto = async (req, res) => {
    try {
        // [UPDATE] Tangkap student_name dari Frontend
        const { student_id, student_name, subject, week, image } = req.body;
        if (!student_id || !image) return res.status(400).json({ status: "error", message: "Data tidak lengkap" });

        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        // [UPDATE] Format penamaan file sesuai request
        // Hapus spasi dan karakter aneh dari nama biar URL-nya nggak rusak
        const safeName = student_name ? student_name.replace(/[^a-zA-Z0-9]/g, '_') : 'Siswa';
        const fileName = `PR_${safeName}_Pert_${week}_${student_id}.jpg`;

        // Upload Buffer ke Supabase Storage
        const { error: uploadErr } = await supabase.storage.from('satpam_faces').upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
        });
        // Ubah throw error-nya biar jelas
        if (uploadErr) throw new Error(`[STORAGE ERROR] ${uploadErr.message}`);

        const { data: publicUrlData } = supabase.storage.from('satpam_faces').getPublicUrl(fileName);
        const publicUrl = publicUrlData.publicUrl;

        const { error: dbError } = await supabase.from('satpam_logs').insert([{
            student_id, subject, week: parseInt(week), photo_url: publicUrl
        }]);
        // Ubah throw error-nya biar jelas
        if (dbError) throw new Error(`[DATABASE ERROR] ${dbError.message}`);

        res.status(200).json({ status: "success", data: { url: publicUrl } });
    } catch (error) {
        console.error("Upload Satpam Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = {
    saveParsedQuestions,
    updateQuestion,
    deleteQuestion,
    getQuestions,
    getQuestionsSummary,
    getQuestionsSummaryAll,
    getAvailableWeeks,
    getCompletionStatus,
    submitAndGradeAnswers,
    submitOnboarding,
    getStudentProgress,
    getReviewData,
    retryWrongAnswers,
    getPRLeaderboard,
    togglePRLock,
    getPRLocks,
    uploadSatpamPhoto
};
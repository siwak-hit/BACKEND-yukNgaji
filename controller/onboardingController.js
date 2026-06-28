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
        const { student_id, subject, week, student_answers, is_double_score, is_extra_life_used, is_pr, time_taken } = req.body;

        if (!student_id || !subject || !week || !student_answers) {
            return res.status(400).json({ status: "error", message: "Data pengerjaan tidak lengkap." });
        }

        // =======================================================
        // [FIX BUG DOUBLE SUBMIT] Cek apakah udah pernah ngumpulin
        // =======================================================
        const { data: existingSubmit } = await supabase
            .from('onboarding_results')
            .select('id')
            .eq('student_id', student_id)
            .eq('subject', subject)
            .eq('week', parseInt(week))
            .single();

        // Kalau udah ada datanya, langsung tolak request-nya biar gak dobel!
        if (existingSubmit) {
            return res.status(400).json({ status: "error", message: "Tugas ini sudah pernah kamu kumpulkan sebelumnya!" });
        }
        // =======================================================

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
        let notesArr = [];
        // [2.6] Lacak potongan nilai telat biar bisa ditampilkan di modal hasil murid.
        let penaltyApplied = false;
        let penaltyDeducted = 0;
        let penaltyPct = 0; // percent actual yang dipakai (bisa 10/15/20% dst)

        // 3. Terapkan Sihir Double Poin (JIKA DIA MEMINTA & JIKA DIA BENARAN PUNYA DI DB)
        if (is_double_score && studentInfo && studentInfo.item_double_score > 0) {
            isItemUsed = true;
            if (finalScore < 30) finalScore += 20;
            else if (finalScore < 50) finalScore += 15;
            else if (finalScore < 70) finalScore += 10;
            else if (finalScore < 100) finalScore += 5;

            if (finalScore > 100) finalScore = 100; // Cap maksimal
        }

        // =======================================================
        // [PR] Cek deadline & dispensasi SEBELUM nilai + koin disimpan.
        // (Sebelumnya pengecekan ada di bawah SETELAH insert, sehingga
        //  potongan nilai tidak pernah benar-benar tersimpan — itu bug.)
        // =======================================================
        if (is_pr) {
            const { data: prLock } = await supabase
                .from('pr_locks')
                .select('deadline_at, extended_students')
                .eq('subject', subject)
                .eq('week', week)
                .single();

            if (prLock && prLock.deadline_at) {
                const now = new Date();
                const originalDeadline = new Date(prLock.deadline_at);

                let extList = prLock.extended_students;
                try { while (typeof extList === 'string') extList = JSON.parse(extList); } catch (e) {}
                if (!Array.isArray(extList)) extList = [];

                const extRecord = extList.find(ext => (typeof ext === 'object' ? ext.student_id : ext) === student_id);

                if (!extRecord) {
                    // Tidak punya dispensasi → wajib di dalam deadline normal
                    if (now > originalDeadline) {
                        return res.status(403).json({ status: "error", message: "Waktu PR habis! Minta perpanjangan waktu ke Ustadz dulu ya." });
                    }
                } else {
                    // Punya dispensasi → cek batas dispensasinya
                    const extUntil = extRecord.until ? new Date(extRecord.until) : null;
                    if (extUntil && now > extUntil) {
                        return res.status(403).json({ status: "error", message: "Waktu dispensasi kamu sudah habis juga!" });
                    }
                    // Denda telat HANYA jika guru memilih "potong nilai" saat menyetujui
                    if (extRecord.penalty) {
                        // Gunakan penalty_percent dari extRecord (10/15/20% dst), fallback 10%
                        penaltyPct = typeof extRecord.penalty_percent === 'number' ? extRecord.penalty_percent : 10;
                        const beforePenalty = finalScore;
                        finalScore = Math.floor(finalScore * (1 - penaltyPct / 100));
                        penaltyApplied = true;
                        penaltyDeducted = beforePenalty - finalScore;
                        notesArr.push(`⚠️ Denda Terlambat (Dispensasi): Nilai dipotong ${penaltyPct}%`);
                    }
                }
            }
        }

        let category = 'C';
        if (finalScore >= 80) category = 'A';
        else if (finalScore >= 60) category = 'B';
        const coinMultiplier = req.body.coin_multiplier || 1;
        // Koin reward = nilai akhir × pengganda (hanya >1 kalau benar-benar pakai Double/Triple Koin).
        // (Bonus tetap +75 dihapus karena membuat koin terasa "dobel" padahal user tak beli item.)
        const poinRewardDikalikan = finalScore * coinMultiplier;

        // 4. Update Saldo Uang dan Kurangi Item jika dipakai
        if (studentInfo) {
            let newPoin = studentInfo.poin + poinRewardDikalikan;
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
                notes: (() => {
                    const arr = [...notesArr];
                    if (isItemUsed) arr.unshift("Koreksi Sihir ✨ (Double Poin Aktif)");
                    return arr.length ? arr.join(' • ') : "Koreksi otomatis oleh sistem";
                })(),
                is_pr: is_pr || false,
                time_taken: time_taken || 0
            }]);

        if (resultError) throw resultError;

        // [Gap 1] Hapus checkpoint server karena tugas sudah selesai dikumpulkan.
        try {
            await supabase.from('pr_drafts')
                .delete()
                .eq('student_id', student_id)
                .eq('subject', subject)
                .eq('week', parseInt(week));
        } catch (e) { /* abaikan: kegagalan hapus draft tidak boleh menggagalkan submit */ }

        // [BARU] 6. Buat Notifikasi jika ini adalah PR
        if (is_pr) {
            // Ambil nama anak dari info DB (karena dari body cuma student_id)
            // Note: studentInfo sudah di-query di langkah sebelumnya, kita manfaatkan saja.
            let studentNameStr = "Anak";

            // Query nama kalau studentInfo cuma ambil poin & item
            const { data: stdNameData } = await supabase
                .from('students').select('name').eq('id', student_id).single();
            if(stdNameData) studentNameStr = stdNameData.name;

            // Insert Notif
            if (is_pr) {
                let studentNameStr = "Anak";
                let teacherUsername = null;

                const { data: stdNameData } = await supabase
                    .from('students')
                    .select('name, created_by')
                    .eq('id', student_id)
                    .single();

                if (stdNameData) {
                    studentNameStr = stdNameData.name;
                    teacherUsername = stdNameData.created_by;
                }

                await supabase.from('pr_notifications').insert([{
                    notif_type: 'pr',
                    student_id,
                    student_name: studentNameStr,
                    subject,
                    week: parseInt(week),
                    score: finalScore,
                    title: `PR ${subject} Pertemuan ${week}`,
                    created_by: teacherUsername
                }]);
            }
        }

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

        // [2.6] Kembalikan rincian nilai + penalti supaya modal hasil murid akurat
        // (sebelumnya client menampilkan nilai versinya sendiri tanpa potongan 10%).
        res.status(201).json({
            status: "success",
            message: "Jawaban berhasil dikirim dan dinilai.",
            data: {
                raw_score: rawScore,
                final_score: finalScore,
                penalty_applied: penaltyApplied,
                penalty_deducted: penaltyDeducted,
                penalty_percent: penaltyPct,
                notes: notesArr
            }
        });
    } catch (error) {
        console.error("Auto-Grade Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getPRLeaderboard = async (req, res) => {
    try {
        // Ambil semua parameter yang dibutuhkan dari query
        const { subject, week, mode, exam_id } = req.query;

        // ===============================================================
        // MODE 1: EXAM (Dari Patch Baru)
        // ===============================================================
        if (mode === 'exam') {
            if (!exam_id) {
                return res.status(400).json({
                    status: 'error',
                    message: 'exam_id wajib dikirim untuk leaderboard mode exam.'
                });
            }

            const { data: examData, error: examErr } = await supabase
                .from('exams')
                .select('id, title, subject, duration_minutes')
                .eq('id', exam_id)
                .single();

            if (examErr) throw examErr;

            const { data: results, error: resultErr } = await supabase
                .from('exam_results')
                .select('student_id, score, created_at')
                .eq('exam_id', exam_id);

            if (resultErr) throw resultErr;

            if (!results || results.length === 0) {
                return res.status(200).json({
                    status: 'success',
                    mode: 'exam',
                    meta: examData,
                    data: []
                });
            }

            const studentIds = results.map(r => r.student_id);

            const { data: students, error: studentsErr } = await supabase
                .from('students')
                .select('id, name')
                .in('id', studentIds)
                .not('name', 'ilike', '%john doe%')
                .not('name', 'ilike', '%xaviera%')
                .not('name', 'ilike', '%xaveria%');

            const allowedStudentIds = new Set((students || []).map(s => String(s.id)));
            const filteredResults = (results || []).filter(r => allowedStudentIds.has(String(r.student_id)));

            if (studentsErr) throw studentsErr;

            const sortedBySubmit = [...filteredResults].sort(
                (a, b) => new Date(a.created_at) - new Date(b.created_at)
            );

            const leaderboard = filteredResults.map(r => {
                const student = students.find(s => String(s.id) === String(r.student_id));
                const rawScore = Number(r.score || 0);

                // Karena exam_results belum punya time_taken,
                // composite sementara = nilai 90% + urutan submit 10%.
                const scorePoin = (rawScore / 100) * 90;

                const submitRank = sortedBySubmit.findIndex(
                    x => String(x.student_id) === String(r.student_id)
                );

                const earlyPoin = Math.max(0, 10 - submitRank);
                const compositeScore = Number((scorePoin + earlyPoin).toFixed(1));

                return {
                    student_id: r.student_id,
                    name: student ? student.name.split(' ')[0] : 'Unknown',
                    raw_score: rawScore,
                    time_taken: '-',
                    composite_score: compositeScore,
                    is_pr: false
                };
            });

            leaderboard.sort((a, b) => b.composite_score - a.composite_score);

            return res.status(200).json({
                status: 'success',
                mode: 'exam',
                meta: examData,
                data: leaderboard
            });
        }

        // ===============================================================
        // MODE 2: DEFAULT / PR (Kode Lama)
        // ===============================================================
        else {
            // 1. Ambil SEMUA hasil di mapel & minggu ini (Hapus filter .eq('is_pr', true))
            // [UPDATE] Tambahkan 'is_pr' ke dalam list .select()
            const { data: results, error } = await supabase
                .from('onboarding_results')
                .select('student_id, score, created_at, time_taken, is_pr')
                .eq('subject', subject)
                .eq('week', week);

            if (error) throw error;
            if (!results || results.length === 0) return res.status(200).json({ status: 'success', data: [] });

            const { data: students } = await supabase
                .from('students')
                .select('id, name')
                .not('name', 'ilike', '%john doe%')
                .not('name', 'ilike', '%xaviera%')
                .not('name', 'ilike', '%xaveria%');

            const allowedStudentIds = new Set((students || []).map(s => String(s.id)));
            const filteredResults = (results || []).filter(r => allowedStudentIds.has(String(r.student_id)));

            // 2. Sortir waktu submit untuk fitur "Early Bird" (Siapa Cepat)
            const sortedBySubmit = [...filteredResults].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // 3. Kalkulasi Poin Komposit
            const leaderboard = filteredResults.map(r => {
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

            return res.status(200).json({ status: 'success', data: leaderboard });
        }

    } catch (err) {
        console.error("Error pada getPRLeaderboard:", err);
        return res.status(500).json({ status: 'error', message: err.message });
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
        const { subject, week, is_locked, deadline_at, duration_minutes } = req.body;

        // Susun payload upsert. deadline_at & duration hanya ditimpa kalau dikirim,
        // biar toggle gembok (tanpa kirim deadline) gak menghapus deadline lama.
        const payload = { subject, week, is_locked };
        if (deadline_at !== undefined) payload.deadline_at = deadline_at || null;

        // [2.1] Durasi manual per tugas (menit -> detik). Kosong/0 = pakai default.
        if (duration_minutes !== undefined) {
            const mins = parseFloat(duration_minutes);
            payload.duration_seconds = (!isNaN(mins) && mins > 0) ? Math.round(mins * 60) : null;
        }

        const { error } = await supabase.from('pr_locks').upsert(payload, { onConflict: 'subject, week' });

        if (error) throw error;
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const grantExtension = async (req, res) => {
    try {
        const { subject, week, student_id, extension_until } = req.body;

        const { data: pr } = await supabase.from('pr_locks').select('extended_students').eq('subject', subject).eq('week', week).single();
        let extended = pr?.extended_students || [];

        // Bersihkan data lama jika anak ini pernah dikasih dispensasi
        extended = extended.filter(ext => typeof ext === 'object' ? ext.student_id !== student_id : ext !== student_id);

        // Masukkan objek dispensasi baru (ID + Deadline + flag potong nilai)
        extended.push({ student_id, until: extension_until, penalty: !!req.body.with_penalty });

        await supabase.from('pr_locks').update({ extended_students: extended }).eq('subject', subject).eq('week', week);
        try {
            await require('../service/pushService').sendToStudent(student_id, {
                title: 'Izin disetujui ✅',
                body: `Kak Aziz memberi izin untuk ${subject} Pertemuan ${week}. Kamu sudah bisa mengerjakan!`,
                url: '/sistem?from=push',
            });
        } catch (e) { console.error('Push grant error:', e.message); }
        res.status(200).json({ status: 'success', message: 'Dispensasi diberikan!' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =======================================================
// FITUR PERMINTAAN PERPANJANGAN WAKTU PR (DISPENSASI)
// =======================================================

// [MURID] Mengajukan permintaan perpanjangan + alasan telat
// kind: 'late' (telat deadline) | 'extra_time' (nambah waktu di tengah)
const requestExtension = async (req, res) => {
    try {
        const { student_id, subject, week, reason } = req.body;
        const kind = req.body.kind === 'extra_time' ? 'extra_time' : 'late';
        if (!student_id || !subject || !week) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap." });
        }

        // Ambil nama & guru pemilik (created_by) dari data murid
        const { data: std } = await supabase
            .from('students')
            .select('name, created_by')
            .eq('id', student_id)
            .single();

        if (!std) return res.status(404).json({ status: "error", message: "Murid tidak ditemukan." });

        // [2.7] Permohonan hanya SEKALI per PR. Ambil request terakhir (status apa pun).
        const { data: prevRows } = await supabase
            .from('pr_extension_requests')
            .select('id, status')
            .eq('student_id', student_id)
            .eq('subject', subject)
            .eq('week', parseInt(week))
            .order('created_at', { ascending: false })
            .limit(1);

        const existing = prevRows && prevRows[0];

        if (existing && existing.status === 'pending') {
            // Masih pending → cukup perbarui alasan/kind (bukan dianggap permohonan baru).
            await supabase
                .from('pr_extension_requests')
                .update({ reason: reason || null, kind, created_at: new Date().toISOString() })
                .eq('id', existing.id);
            return res.status(200).json({ status: "success", message: "Permintaan diperbarui." });
        }
        // Kalau sudah pernah granted atau tidak ada → buat permohonan baru.
        // Siswa boleh minta perpanjangan lagi; potongan nilai bertambah setiap kali (dihitung saat guru approve).

        const { error } = await supabase.from('pr_extension_requests').insert([{
            student_id,
            student_name: std.name || 'Anak',
            subject,
            week: parseInt(week),
            reason: reason || null,
            kind,
            status: 'pending',
            created_by: std.created_by || null
        }]);

        if (error) throw error;
        res.status(201).json({ status: "success", message: "Permintaan perpanjangan terkirim." });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// [MURID] Cek status permohonan miliknya sendiri untuk PR ini (utk enforce sekali pakai)
const getMyExtensionRequest = async (req, res) => {
    try {
        const { student_id, subject, week } = req.query;
        if (!student_id || !subject || !week) {
            return res.status(400).json({ status: "error", message: "Parameter tidak lengkap." });
        }
        const { data } = await supabase
            .from('pr_extension_requests')
            .select('id, status, kind, with_penalty, extension_until, is_used, reason, created_at')
            .eq('student_id', student_id)
            .eq('subject', subject)
            .eq('week', parseInt(week))
            .order('created_at', { ascending: false })
            .limit(1);

        res.status(200).json({ status: "success", data: (data && data[0]) || null });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// =======================================================
// CHECKPOINT PR LINTAS-DEVICE (pr_drafts)
// =======================================================
// [MURID] Ambil checkpoint pengerjaan PR dari server (utk lanjut di HP lain)
const getPRDraft = async (req, res) => {
    try {
        const { student_id, subject, week } = req.query;
        if (!student_id || !subject || !week) {
            return res.status(400).json({ status: "error", message: "Parameter tidak lengkap." });
        }
        const { data, error } = await supabase
            .from('pr_drafts')
            .select('question_ids, answers, current_index, session_end, updated_at')
            .eq('student_id', student_id)
            .eq('subject', subject)
            .eq('week', parseInt(week))
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        res.status(200).json({ status: "success", data: data || null });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// [MURID] Simpan/timpa checkpoint (autosave berkala dari fill.astro)
const savePRDraft = async (req, res) => {
    try {
        const { student_id, subject, week, question_ids, answers, current_index, session_end } = req.body;
        if (!student_id || !subject || !week) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap." });
        }
        const { error } = await supabase
            .from('pr_drafts')
            .upsert({
                student_id,
                subject,
                week: parseInt(week),
                question_ids: Array.isArray(question_ids) ? question_ids : [],
                answers: answers || {},
                current_index: Number.isInteger(current_index) ? current_index : 0,
                session_end: session_end || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'student_id, subject, week' });

        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// [GURU] Ambil daftar permintaan perpanjangan yang masih pending
const getExtensionRequests = async (req, res) => {
    try {
        const username = req.user.username;
        const { data, error } = await supabase
            .from('pr_extension_requests')
            .select('*')
            .eq('created_by', username)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Tambahkan grant_count per siswa per PR (untuk indikator warna di UI guru)
        const rows = data || [];
        const uniqueKeys = [...new Set(rows.map(r => `${r.student_id}|${r.subject}|${r.week}`))];
        const grantCountMap = {};
        await Promise.all(uniqueKeys.map(async key => {
            const [sid, subj, wk] = key.split('|');
            const { count } = await supabase
                .from('pr_extension_requests')
                .select('*', { count: 'exact', head: true })
                .eq('student_id', sid)
                .eq('subject', subj)
                .eq('week', parseInt(wk))
                .eq('status', 'granted');
            grantCountMap[key] = count || 0;
        }));
        const dataWithCounts = rows.map(r => ({
            ...r,
            grant_count: grantCountMap[`${r.student_id}|${r.subject}|${r.week}`] || 0,
            next_penalty_percent: 10 + ((grantCountMap[`${r.student_id}|${r.subject}|${r.week}`] || 0) * 5)
        }));

        res.status(200).json({ status: "success", data: dataWithCounts });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// [GURU] Setujui permintaan: beri dispensasi (durasi pilihan guru) + opsi potong nilai
const respondExtension = async (req, res) => {
    try {
        const username = req.user.username;
        const { request_id, extension_until, with_penalty } = req.body;
        if (!request_id || !extension_until) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap." });
        }

        // Ambil request & pastikan milik guru ini
        const { data: reqData, error: reqErr } = await supabase
            .from('pr_extension_requests')
            .select('*')
            .eq('id', request_id)
            .eq('created_by', username)
            .single();

        if (reqErr || !reqData) {
            return res.status(404).json({ status: "error", message: "Permintaan tidak ditemukan." });
        }

        const { subject, week, student_id } = reqData;

        // Hitung berapa kali siswa sudah pernah di-grant untuk PR ini
        // penalty_percent: 10% pertama, +5% setiap pemberian berikutnya (15%, 20%, dst)
        const { count: grantCount } = await supabase
            .from('pr_extension_requests')
            .select('*', { count: 'exact', head: true })
            .eq('student_id', student_id)
            .eq('subject', subject)
            .eq('week', week)
            .eq('status', 'granted');
        const penaltyPercent = 10 + ((grantCount || 0) * 5);

        // Ambil dispensasi yang sudah ada (kalau baris pr_locks-nya ada)
        const { data: pr } = await supabase
            .from('pr_locks')
            .select('extended_students')
            .eq('subject', subject)
            .eq('week', week)
            .single();

        let extended = pr?.extended_students || [];
        try { while (typeof extended === 'string') extended = JSON.parse(extended); } catch (e) {}
        if (!Array.isArray(extended)) extended = [];

        // Hapus dispensasi lama anak ini, lalu masukkan yang baru (+flag penalty + persen denda)
        extended = extended.filter(ext => (typeof ext === 'object' ? ext.student_id : ext) !== student_id);
        extended.push({ student_id, until: extension_until, penalty: !!with_penalty, penalty_percent: with_penalty ? penaltyPercent : 0 });

        // upsert: buat baris pr_locks kalau belum ada; deadline_at tidak ikut diubah
        await supabase
            .from('pr_locks')
            .upsert({ subject, week, is_locked: true, extended_students: extended }, { onConflict: 'subject, week' });

        // Tandai request sudah ditangani
        await supabase
            .from('pr_extension_requests')
            .update({ status: 'granted', with_penalty: !!with_penalty, extension_until, responded_at: new Date().toISOString() })
            .eq('id', request_id);

        // Push notif ke murid: izin disetujui → sudah boleh mengerjakan.
        try {
            await require('../service/pushService').sendToStudent(student_id, {
                title: 'Izin disetujui ✅',
                body: `Kak Aziz menyetujui izinmu untuk ${subject} Pertemuan ${week}. Kamu sudah bisa mengerjakan!`,
                url: '/sistem?from=push',
            });
        } catch (e) { console.error('Push grant error:', e.message); }

        res.status(200).json({ status: "success", message: "Dispensasi diberikan!" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getPRLocks = async (req, res) => {
    try {
        const { subject } = req.params;
        // [FIX] Tambahkan pengecekan .eq('is_locked', true)
        const { data, error } = await supabase
            .from('pr_locks')
            .select('week')
            .eq('subject', subject)
            .eq('is_locked', true);

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

        // [FIX BUG FOTO SATPAM SAMA] Nama file WAJIB mengandung subject juga.
        // Dulu: PR_<nama>_Pert_<week>_<id>.jpg → 2 PR mapel beda di minggu yang sama
        // menghasilkan nama file SAMA → upsert menimpa file → foto_url kedua PR jadi
        // sama (foto A ke-override foto B). Sekarang per (mapel, minggu, siswa).
        const safeName = student_name ? student_name.replace(/[^a-zA-Z0-9]/g, '_') : 'Siswa';
        const safeSubject = subject ? String(subject).replace(/[^a-zA-Z0-9]/g, '_') : 'mapel';
        const fileName = `PR_${safeName}_${safeSubject}_Pert_${week}_${student_id}.jpg`;

        // Upload Buffer ke Supabase Storage
        const { error: uploadErr } = await supabase.storage.from('satpam_faces').upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
        });
        // Ubah throw error-nya biar jelas
        if (uploadErr) throw new Error(`[STORAGE ERROR] ${uploadErr.message}`);

        const { data: publicUrlData } = supabase.storage.from('satpam_faces').getPublicUrl(fileName);
        const publicUrl = publicUrlData.publicUrl;

        // [FIX] Hapus log lama utk PR yang sama dulu (cegah baris ganda menumpuk +
        // bikin checkSatpamStatus.single() error 500), lalu masukkan yang baru.
        await supabase.from('satpam_logs')
            .delete()
            .eq('student_id', student_id)
            .eq('subject', subject)
            .eq('week', parseInt(week));

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

// =======================================================
// AMBIL DETAIL DEADLINE DAN DISPENSASI PR
// =======================================================
const getPRLockDetail = async (req, res) => {
    try {
        const { subject, week } = req.query;

        if (!subject || !week) {
            return res.status(400).json({ status: "error", message: "Subject dan week wajib diisi" });
        }

        // [FIX BUG "Gagal memverifikasi waktu"] Jangan pakai .single().
        // .single() melempar error 500 kalau baris pr_locks utk (subject, week) ada lebih
        // dari satu (duplikat bisa muncul kalau constraint UNIQUE(subject, week) belum ada).
        // Ambil semua baris yang cocok, lalu pilih yang terbaru biar fail-safe.
        const { data: rows, error } = await supabase
            .from('pr_locks')
            .select('deadline_at, extended_students, duration_seconds, created_at')
            .eq('subject', subject)
            .eq('week', parseInt(week))
            .order('created_at', { ascending: false });

        if (error) throw error;

        const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
        res.status(200).json({ status: 'success', data });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// Fungsi untuk Guru memberi koin manual ke murid
const transferRewardCoin = async (req, res) => {
    try {
        const { student_id, amount } = req.body;

        if (!student_id || !amount || amount <= 0) {
            return res.status(400).json({ status: "error", message: "Data tidak valid" });
        }

        // 1. Ambil data poin murid saat ini
        const { data: student, error: stdErr } = await supabase
            .from('students')
            .select('poin')
            .eq('id', student_id)
            .single();

        if (stdErr) throw stdErr;

        const newPoin = (student.poin || 0) + amount;

        // 2. Tambahkan poin ke database murid
        await supabase
            .from('students')
            .update({ poin: newPoin })
            .eq('id', student_id);

        // 3. Catat di history biar muncul di menu "Riwayat Poin" milik anak
        await supabase
            .from('gamification_logs')
            .insert([{
                target_id: student_id,
                action_type: 'teacher_reward',
                point_change: amount,
                metadata: {
                    title: `Mendapat bonus <strong>${amount} poin</strong> dari Ustadz! (Reward Keaktifan)`,
                    icon: '🎁'
                }
            }]);

        res.status(200).json({ status: "success", message: "Reward terkirim" });
    } catch (error) {
        console.error("Transfer Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// =======================================================
// CEK APAKAH SISWA SUDAH PERNAH FOTO SATPAM
// =======================================================
const checkSatpamStatus = async (req, res) => {
    try {
        const { student_id, subject, week } = req.query;

        if (!student_id || !subject || !week) {
            return res.status(400).json({ status: "error", message: "Parameter tidak lengkap" });
        }

        // [FIX] Jangan pakai .single() (error 500 kalau ada baris ganda). Pakai limit(1).
        const { data, error } = await supabase
            .from('satpam_logs')
            .select('id')
            .eq('student_id', student_id)
            .eq('subject', subject)
            .eq('week', parseInt(week))
            .limit(1);

        if (error) throw error;

        const isScanned = Array.isArray(data) && data.length > 0;
        res.status(200).json({ status: 'success', isScanned });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =======================================================
// CEK STATUS MAINTENANCE SYSTEM (GET)
// =======================================================
const getSystemStatus = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('is_maintenance')
            .eq('id', 1)
            .single();

        if (error) throw error;

        res.status(200).json({
            status: 'success',
            data: { is_maintenance: data.is_maintenance }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =======================================================
// UBAH SAKLAR MAINTENANCE SYSTEM (POST)
// =======================================================
const updateSystemStatus = async (req, res) => {
    try {
        const { is_maintenance } = req.body;

        if (is_maintenance === undefined) {
            return res.status(400).json({ status: "error", message: "Parameter is_maintenance wajib diisi" });
        }

        const { error } = await supabase
            .from('app_settings')
            .update({ is_maintenance: is_maintenance })
            .eq('id', 1);

        if (error) throw error;

        res.status(200).json({ status: "success", message: "Status sistem berhasil diperbarui" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// =======================================================
// [BARU] FITUR TANYA TEMAN (Ambil data teman yang udah selesai)
// =======================================================
const getPeerHelp = async (req, res) => {
    try {
        const { subject, week, student_id } = req.query;
        if (!subject || !week || !student_id) {
            return res.status(400).json({ status: "error", message: "Parameter tidak lengkap." });
        }

        // 1. Ambil semua hasil dari murid lain untuk subject & week ini
        const { data: results, error } = await supabase
            .from('onboarding_results')
            .select('student_id, student_answers')
            .eq('subject', subject)
            .eq('week', week)
            .neq('student_id', student_id); // Jangan ambil jawaban sendiri!

        if (error) throw error;
        if (!results || results.length === 0) {
            return res.status(200).json({ status: "success", data: [] });
        }

        // 2. Ambil data nama murid (hanya yang sudah ngerjain)
        const peerIds = results.map(r => r.student_id);
        const { data: students, error: stdErr } = await supabase
            .from('students')
            .select('id, name')
            .in('id', peerIds);

        if (stdErr) throw stdErr;

        // 3. Format data menjadi array flat biar frontend gampang nyocokkinnya
        let peerAnswers = [];
        results.forEach(r => {
            const student = students.find(s => s.id === r.student_id);
            const studentName = student ? student.name.split(' ')[0] : 'Teman'; // Ambil nama panggilan aja

            if (r.student_answers && Array.isArray(r.student_answers)) {
                r.student_answers.forEach(ans => {
                    peerAnswers.push({
                        student_name: studentName,
                        question_id: ans.question_id,
                        answer: ans.answer
                    });
                });
            }
        });

        res.status(200).json({ status: "success", data: peerAnswers });
    } catch (error) {
        console.error("Peer Help Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// [BARU] CEK STATUS BULLY, RESET, DAN CARI PELAKUNYA LEWAT ACTOR_ID
const checkAndResetBully = async (req, res) => {
    try {
        const { student_id } = req.query;

        // 1. Ambil status is_bullied korban saat ini
        const { data: student, error } = await supabase
            .from('students')
            .select('is_bullied, name')
            .eq('id', student_id)
            .single();

        if (error || !student) throw new Error("Murid tidak ditemukan");

        // 2. Jika sedang dibully, jalankan pelacakan!
        if (student.is_bullied === true) {

            // Segera reset status di DB biar animasinya gak jalan berkali-kali
            await supabase
                .from('students')
                .update({ is_bullied: false })
                .eq('id', student_id);

            // [FIX PALING JITU] Cari tau ID pelaku dari log serangan terbaru
            const { data: log } = await supabase
                .from('gamification_logs')
                .select('actor_id')
                .eq('target_id', student_id)
                .eq('action_type', 'bully')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            let attackerName = "Seseorang";

            // Jika ketemu ID pelakunya, cari nama aslinya di tabel students!
            if (log && log.actor_id) {
                const { data: actor } = await supabase
                    .from('students')
                    .select('name')
                    .eq('id', log.actor_id)
                    .single();

                if (actor && actor.name) {
                    attackerName = actor.name.split(' ')[0]; // Ambil nama panggilannya aja
                }
            }

            // Beritahu frontend untuk jalanin aksi dan kirim nama asli pelakunya
            return res.status(200).json({ status: "success", trigger_bully: true, attacker_name: attackerName });
        }

        res.status(200).json({ status: "success", trigger_bully: false });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
};

const uploadQuestionImage = async (req, res) => {
    try {
        // Cek apakah ada file yang dikirim
        if (!req.file) {
            return res.status(400).json({ status: "error", message: "Tidak ada file gambar yang dikirim." });
        }

        const file = req.file;

        // Bikin nama file unik biar gak bentrok kalau ada guru yang upload nama filenya sama
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `soal_${Date.now()}_${Math.round(Math.random() * 1000)}.${fileExtension}`;

        // 1. Upload file fisik ke bucket 'question_images'
        const { data, error } = await supabase.storage
            .from('question_images')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false // Jangan timpa file yang ada
            });

        if (error) throw error;

        // 2. Dapatkan URL Publiknya
        const { data: publicUrlData } = supabase.storage
            .from('question_images')
            .getPublicUrl(fileName);

        // 3. Kembalikan URL publik ke Frontend
        res.status(200).json({
            status: "success",
            message: "Gambar berhasil diupload",
            data: { url: publicUrlData.publicUrl }
        });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const submitAppFeedback = async (req, res) => {
    try {
        const {
            student_id,
            exam_id,
            comfort_rating,
            difficulty_rating,
            favorite_part,
            hardest_part,
            suggestion,
            message,
            source
        } = req.body;

        if (!student_id) {
            return res.status(400).json({
                status: "error",
                message: "student_id wajib dikirim."
            });
        }

        const payload = {
            student_id,
            exam_id: exam_id || null,
            comfort_rating: comfort_rating ? parseInt(comfort_rating) : null,
            difficulty_rating: difficulty_rating ? parseInt(difficulty_rating) : null,
            favorite_part: favorite_part || null,
            hardest_part: hardest_part || null,
            suggestion: suggestion || null,
            message: message || null,
            source: source || 'exam_final'
        };

        const { data, error } = await supabase
            .from('app_feedbacks')
            .upsert([payload], {
                onConflict: 'student_id,exam_id'
            })
            .select('id')
            .single();

        if (error) throw error;

        return res.status(201).json({
            status: "success",
            message: "Feedback berhasil disimpan.",
            data
        });
    } catch (error) {
        console.error("Submit App Feedback Error:", error);
        return res.status(500).json({
            status: "error",
            message: error.message || "Gagal menyimpan feedback."
        });
    }
};

// Jangan lupa update module.exports di paling bawah:
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
    uploadSatpamPhoto,
    grantExtension,
    requestExtension,
    getExtensionRequests,
    getMyExtensionRequest,
    getPRDraft,
    savePRDraft,
    respondExtension,
    getPRLockDetail,
    checkSatpamStatus,
    transferRewardCoin,
    getSystemStatus,
    updateSystemStatus,
    getPeerHelp,
    checkAndResetBully,
    uploadQuestionImage,
    submitAppFeedback
};

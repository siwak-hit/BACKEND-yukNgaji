const supabase = require('../config/supabaseClient');

const getOralExamTemplates = async (req, res) => {
    try {
        const username = req.user.username;

        const { data, error } = await supabase
            .from('oral_exam_templates')
            .select('*')
            .or(`created_by.eq.${username},created_by.is.null`)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json({ status: 'success', data: data || [] });
    } catch (error) {
        console.error('Get Oral Templates Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const getOralExamDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const username = req.user.username;

        const { data: template, error: templateErr } = await supabase
            .from('oral_exam_templates')
            .select('*')
            .eq('id', id)
            .or(`created_by.eq.${username},created_by.is.null`)
            .single();

        if (templateErr) throw templateErr;

        const { data: sections, error: sectionErr } = await supabase
            .from('oral_exam_sections')
            .select(`
                id,
                title,
                min_required,
                sort_order,
                oral_exam_items (
                    id,
                    title,
                    short_label,
                    description,
                    sort_order
                )
            `)
            .eq('template_id', id)
            .order('sort_order', { ascending: true });

        if (sectionErr) throw sectionErr;

        const safeSections = (sections || []).map(section => ({
            ...section,
            oral_exam_items: (section.oral_exam_items || []).sort((a, b) => {
                return (a.sort_order || 0) - (b.sort_order || 0);
            })
        }));

        const { data: students, error: studentsErr } = await supabase
            .from('students')
            .select('id, name, grade')
            .eq('created_by', username)
            .order('name', { ascending: true });

        if (studentsErr) throw studentsErr;

        const { data: results, error: resultsErr } = await supabase
            .from('oral_exam_results')
            .select('id, student_id, final_score, memorization_score, understanding_score, status, submitted_at')
            .eq('template_id', id);

        if (resultsErr) throw resultsErr;

        const studentsWithStatus = (students || []).map(student => {
            const result = (results || []).find(r => String(r.student_id) === String(student.id));

            return {
                ...student,
                oral_result: result || null,
                oral_status: result?.status || 'not_tested'
            };
        });

        res.status(200).json({
            status: 'success',
            data: {
                template,
                sections: safeSections,
                students: studentsWithStatus,
                summary: {
                    total_students: studentsWithStatus.length,
                    tested_students: studentsWithStatus.filter(s => s.oral_result).length,
                    not_tested_students: studentsWithStatus.filter(s => !s.oral_result).length
                }
            }
        });
    } catch (error) {
        console.error('Get Oral Detail Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const createOralExamSession = async (req, res) => {
    try {
        const { id } = req.params;
        const username = req.user.username;

        const { data: template, error: templateErr } = await supabase
            .from('oral_exam_templates')
            .select('*')
            .eq('id', id)
            .or(`created_by.eq.${username},created_by.is.null`)
            .single();

        if (templateErr) throw templateErr;

        const targetDurationSeconds = (template.target_session_minutes || 10) * 60;

        const { count: sessionCount, error: countErr } = await supabase
            .from('oral_exam_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('template_id', id);

        if (countErr) throw countErr;

        const sessionNumber = (sessionCount || 0) + 1;

        const { data: session, error: sessionErr } = await supabase
            .from('oral_exam_sessions')
            .insert([{
                template_id: id,
                subject: template.subject,
                session_name: `Sesi ${sessionNumber}`,
                target_duration_seconds: targetDurationSeconds,
                started_at: null,
                ended_at: null,
                status: 'draft',
                tested_by: username
            }])
            .select('*')
            .single();

        if (sessionErr) throw sessionErr;

        return res.status(201).json({
            status: 'success',
            message: 'Draft sesi berhasil dibuat.',
            data: { session }
        });
    } catch (error) {
        console.error('Create Oral Session Error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal membuat sesi evaluasi.'
        });
    }
};

const getOralExamSessionDetail = async (req, res) => {
    try {
        const { id, sessionId } = req.params;
        const username = req.user.username;

        // 1. Ambil template
        const { data: template, error: templateErr } = await supabase
            .from('oral_exam_templates')
            .select('*')
            .eq('id', id)
            .or(`created_by.eq.${username},created_by.is.null`)
            .single();

        if (templateErr) throw templateErr;

        // 2. Ambil session
        const { data: session, error: sessionErr } = await supabase
            .from('oral_exam_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('template_id', id)
            .single();

        if (sessionErr) throw sessionErr;

        // 3. Ambil sections + items
        const { data: sections, error: sectionErr } = await supabase
            .from('oral_exam_sections')
            .select(`
                id,
                title,
                min_required,
                sort_order,
                oral_exam_items (
                    id,
                    title,
                    short_label,
                    description,
                    sort_order
                )
            `)
            .eq('template_id', id)
            .order('sort_order', { ascending: true });

        if (sectionErr) throw sectionErr;

        const safeSections = (sections || []).map(section => ({
            ...section,
            oral_exam_items: (section.oral_exam_items || []).sort((a, b) => {
                return (a.sort_order || 0) - (b.sort_order || 0);
            })
        }));

        // 4. Ambil peserta session
        const { data: participants, error: participantErr } = await supabase
            .from('oral_exam_session_students')
            .select(`
                id,
                order_index,
                student_id,
                students (
                    id,
                    name,
                    grade
                )
            `)
            .eq('session_id', sessionId)
            .order('order_index', { ascending: true });

        if (participantErr) throw participantErr;

        const { data: prompts, error: promptErr } = await supabase
            .from('oral_understanding_prompts')
            .select('id, prompt, expected_keywords')
            .eq('template_id', id)
            .order('sort_order', { ascending: true });

        if (promptErr) throw promptErr;

        const students = (participants || []).map(p => ({
            session_student_id: p.id,
            order_index: p.order_index,
            ...p.students
        }));

        // ================= KODE BARU DIMULAI DI SINI =================

        // 5. Ambil semua siswa yang dibuat oleh user ini
        const { data: allStudents, error: allStudentsErr } = await supabase
            .from('students')
            .select('id, name, grade')
            .eq('created_by', username)
            .order('name', { ascending: true });

        if (allStudentsErr) throw allStudentsErr;

        // 6. Ambil hasil ujian yang sudah ada untuk template ini
        const { data: existingResults, error: existingResultsErr } = await supabase
            .from('oral_exam_results')
            .select('student_id')
            .eq('template_id', id);

        if (existingResultsErr) throw existingResultsErr;

        // Bikin list ID siswa yang sudah diuji
        const testedStudentIds = new Set(
            (existingResults || []).map(r => String(r.student_id))
        );

        // Bikin list ID siswa yang sudah masuk ke dalam session ini
        const sessionStudentIds = new Set(
            students.map(s => String(s.id))
        );

        // Filter: Hanya ambil siswa yang belum diuji DAN belum masuk ke session ini
        const availableStudents = (allStudents || []).filter(student => {
            const sid = String(student.id);
            return !testedStudentIds.has(sid) && !sessionStudentIds.has(sid);
        });

        // ================= KODE BARU SELESAI =================

        // 7. Return response (Sudah ditambahkan available_students)
        return res.status(200).json({
            status: 'success',
            data: {
                template,
                session,
                sections: safeSections,
                students,
                available_students: availableStudents,
                understanding_prompts: prompts // <-- Penambahan di sini
            }
        });
    } catch (error) {
        console.error('Get Oral Session Detail Error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal memuat sesi evaluasi.'
        });
    }
};

const startOralExamSession = async (req, res) => {
    try {
        const { id, sessionId } = req.params;
        const username = req.user.username;
        const { student_ids = [] } = req.body;

        if (!Array.isArray(student_ids) || student_ids.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Pilih minimal 1 siswa untuk memulai sesi.'
            });
        }

        if (student_ids.length > 5) {
            return res.status(400).json({
                status: 'error',
                message: 'Maksimal 5 siswa dalam 1 sesi.'
            });
        }

        const { data: template, error: templateErr } = await supabase
            .from('oral_exam_templates')
            .select('*')
            .eq('id', id)
            .or(`created_by.eq.${username},created_by.is.null`)
            .single();

        if (templateErr) throw templateErr;

        const { data: session, error: sessionErr } = await supabase
            .from('oral_exam_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('template_id', id)
            .single();

        if (sessionErr) throw sessionErr;

        if (session.status !== 'draft') {
            return res.status(400).json({
                status: 'error',
                message: 'Sesi ini sudah pernah dimulai.'
            });
        }

        const { data: existingResults, error: existingErr } = await supabase
            .from('oral_exam_results')
            .select('student_id')
            .eq('template_id', id);

        if (existingErr) throw existingErr;

        const testedStudentIds = new Set(
            (existingResults || []).map(r => String(r.student_id))
        );

        const cleanStudentIds = student_ids
            .map(String)
            .filter(studentId => !testedStudentIds.has(studentId));

        if (cleanStudentIds.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Siswa yang dipilih sudah pernah diuji.'
            });
        }

        await supabase
            .from('oral_exam_session_students')
            .delete()
            .eq('session_id', sessionId);

        const participantRows = cleanStudentIds.map((studentId, index) => ({
            session_id: sessionId,
            student_id: studentId,
            order_index: index + 1
        }));

        const { error: participantErr } = await supabase
            .from('oral_exam_session_students')
            .insert(participantRows);

        if (participantErr) throw participantErr;

        const { data: updatedSession, error: updateErr } = await supabase
            .from('oral_exam_sessions')
            .update({
                status: 'active',
                started_at: new Date().toISOString()
            })
            .eq('id', sessionId)
            .select('*')
            .single();

        if (updateErr) throw updateErr;

        return res.status(200).json({
            status: 'success',
            message: 'Sesi real berhasil dimulai.',
            data: { session: updatedSession }
        });
    } catch (error) {
        console.error('Start Oral Session Error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal memulai sesi.'
        });
    }
};

const submitOralExamSessionResults = async (req, res) => {
    try {
        const { id, sessionId } = req.params;
        const username = req.user.username;
        const { results = [] } = req.body;

        if (!Array.isArray(results) || results.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Data hasil evaluasi kosong.'
            });
        }

        const { data: template, error: templateErr } = await supabase
            .from('oral_exam_templates')
            .select('*')
            .eq('id', id)
            .or(`created_by.eq.${username},created_by.is.null`)
            .single();

        if (templateErr) throw templateErr;

        const { data: session, error: sessionErr } = await supabase
            .from('oral_exam_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('template_id', id)
            .single();

        if (sessionErr) throw sessionErr;

        const { data: participants, error: participantErr } = await supabase
            .from('oral_exam_session_students')
            .select('student_id')
            .eq('session_id', sessionId);

        if (participantErr) throw participantErr;

        const allowedStudentIds = new Set(
            (participants || []).map(p => String(p.student_id))
        );

        const safeResults = results.filter(r => {
            return allowedStudentIds.has(String(r.student_id));
        });

        if (safeResults.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Tidak ada siswa valid dalam sesi ini.'
            });
        }

        const resultRows = safeResults.map(r => ({
            session_id: sessionId,
            template_id: id,
            student_id: r.student_id,
            subject: template.subject,

            memorization_score: Number(r.memorization_score || 0),
            understanding_score: Number(r.understanding_score || 0),
            final_score: Number(r.final_score || 0),

            understanding_level_used: r.understanding_level_used || null,
            understanding_prompt_id: r.understanding_prompt_id || null,
            understanding_rating: Number(r.understanding_rating || 0),

            status: r.status || 'draft',
            notes: r.notes || null,
            duration_seconds: Number(r.duration_seconds || 0),
            tested_by: username,
            submitted_at: new Date().toISOString()
        }));

        const { data: savedResults, error: saveErr } = await supabase
            .from('oral_exam_results')
            .upsert(resultRows, {
                onConflict: 'student_id,template_id'
            })
            .select('id, student_id');

        if (saveErr) throw saveErr;

        const savedResultMap = new Map(
            (savedResults || []).map(r => [String(r.student_id), r.id])
        );

        const resultIds = (savedResults || []).map(r => r.id);

        if (resultIds.length > 0) {
            const { error: deleteItemsErr } = await supabase
                .from('oral_exam_result_items')
                .delete()
                .in('result_id', resultIds);

            if (deleteItemsErr) throw deleteItemsErr;
        }

        const itemRows = [];

        safeResults.forEach(r => {
            const resultId = savedResultMap.get(String(r.student_id));
            if (!resultId) return;

            (r.items || []).forEach(item => {
                itemRows.push({
                    result_id: resultId,
                    item_id: item.item_id,
                    score: Number(item.score || 0),
                    note: item.note || null
                });
            });
        });

        if (itemRows.length > 0) {
            const { error: itemErr } = await supabase
                .from('oral_exam_result_items')
                .insert(itemRows);

            if (itemErr) throw itemErr;
        }

        const { error: updateSessionErr } = await supabase
            .from('oral_exam_sessions')
            .update({
                status: 'completed',
                ended_at: new Date().toISOString()
            })
            .eq('id', sessionId);

        if (updateSessionErr) throw updateSessionErr;

        return res.status(200).json({
            status: 'success',
            message: 'Hasil evaluasi berhasil disimpan.',
            data: {
                saved_count: savedResults.length
            }
        });
    } catch (error) {
        console.error('Submit Oral Results Error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal menyimpan hasil evaluasi.'
        });
    }
};

const getStudentOralExamSummary = async (req, res) => {
    try {
        const { studentId } = req.params;
        const username = req.user.username;

        // Pastikan siswa milik guru yang sedang login
        const { data: student, error: studentErr } = await supabase
            .from('students')
            .select('id, name, created_by')
            .eq('id', studentId)
            .eq('created_by', username)
            .single();

        if (studentErr || !student) {
            return res.status(404).json({
                status: 'error',
                message: 'Siswa tidak ditemukan atau bukan milik Anda.'
            });
        }

        const { data: results, error } = await supabase
            .from('oral_exam_results')
            .select('subject, final_score, memorization_score, understanding_score, status, submitted_at')
            .eq('student_id', studentId)
            .order('submitted_at', { ascending: false });

        if (error) throw error;

        const summary = {
            tajwid: null,
            fiqih: null,
            tauhid: null
        };

        const detail = {
            tajwid: null,
            fiqih: null,
            tauhid: null
        };

        (results || []).forEach(result => {
            const subject = String(result.subject || '').toLowerCase();

            // Ambil hasil terbaru per mapel saja
            if (summary[subject] === null && ['tajwid', 'fiqih', 'tauhid'].includes(subject)) {
                summary[subject] = Number(result.final_score || 0);
                detail[subject] = {
                    final_score: Number(result.final_score || 0),
                    memorization_score: Number(result.memorization_score || 0),
                    understanding_score: Number(result.understanding_score || 0),
                    status: result.status,
                    submitted_at: result.submitted_at
                };
            }
        });

        return res.status(200).json({
            status: 'success',
            data: {
                summary,
                detail
            }
        });
    } catch (error) {
        console.error('Get Student Oral Summary Error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal mengambil nilai ujian hafalan.'
        });
    }
};

module.exports = {
    getOralExamTemplates,
    getOralExamDetail,
    createOralExamSession,
    getOralExamSessionDetail,
    startOralExamSession,
    submitOralExamSessionResults,
    getStudentOralExamSummary
};

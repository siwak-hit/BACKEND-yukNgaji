const supabase = require('../config/supabaseClient');

const createExam = async (examData) => {
    const { data, error } = await supabase.from('exams').insert([examData]).select().single();
    if (error) throw error;
    return data;
};

// Exam "boneka" yang dibuat gradeController.saveManualGrade cuma wadah exam_results
// buat nilai manual/cetak — bukan ujian beneran, jadi jangan muncul di daftar "Pilih Ujian".
const DUMMY_EXAM_PREFIX = 'Nilai Manual Cetak';

// [OPTIMASI] Hanya ambil data inti untuk list tabel (Tanpa narik semua text panjang)
const getExamsByTeacher = async (username) => {
    const { data, error } = await supabase
        .from('exams')
        // [FIX] Tambahkan is_daring & deadline_at
        .select('id, title, subject, duration_minutes, is_active, created_at, is_daring, deadline_at')
        .eq('created_by', username)
        .not('title', 'ilike', `${DUMMY_EXAM_PREFIX}%`)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

// [PERBAIKAN] Hapus difficulty_level dari Select karena tidak ada di schema exam_questions
const getExamDetail = async (examId) => {
    const { data: exam, error: examErr } = await supabase
        .from('exams')
        .select('id, title, subject, duration_minutes, is_active, is_daring, deadline_at, extended_students')
        .eq('id', examId)
        .single();
    if (examErr) throw examErr;

    const { data: questions, error: qErr } = await supabase
        .from('exam_questions')
        // [UPDATE] Tambahkan question_type ke dalam select
        .select('id, question_type, question, options, correct_answer, hint, image_url') 
        .eq('exam_id', examId)
        .order('created_at', { ascending: true });
    if (qErr) throw qErr;

    return { ...exam, questions: questions || [] };
};

const updateExam = async (examId, updateData) => {
    const { data, error } = await supabase.from('exams').update(updateData).eq('id', examId).select('id').single();
    if (error) throw error;
    return data;
};

const saveExamQuestions = async (examId, questionsArray) => {
    await supabase.from('exam_questions').delete().eq('exam_id', examId);
    if (questionsArray && questionsArray.length > 0) {
        const formattedQuestions = questionsArray.map(q => ({
            exam_id: examId, 
            // [UPDATE] Masukkan question_type
            question_type: q.question_type || 'multiple_choice',
            question: q.question, 
            options: q.options || {}, 
            // [UPDATE] Jika jawaban berupa Array (isian berurut), ubah jadi JSON String
            correct_answer: Array.isArray(q.correct_answer) ? JSON.stringify(q.correct_answer) : q.correct_answer,
            hint: q.hint || null, 
            image_url: q.image_url || null
        }));
        const { data, error } = await supabase.from('exam_questions').insert(formattedQuestions).select('id');
        if (error) throw error;
        return data;
    }
    return [];
};

// FK ke exams tidak pakai ON DELETE CASCADE, jadi anak-anaknya dihapus duluan.
// Tanpa ini delete selalu 500 (FK violation) & ujian tetap nongol di UI.
const EXAM_CHILD_TABLES = ['exam_questions', 'exam_results', 'exam_retake_permissions', 'pr_notifications', 'app_feedbacks'];

const deleteExam = async (examId) => {
    for (const table of EXAM_CHILD_TABLES) {
        const { error } = await supabase.from(table).delete().eq('exam_id', examId);
        if (error) throw error;
    }
    const { error } = await supabase.from('exams').delete().eq('id', examId);
    if (error) throw error;
    return true;
};

module.exports = { createExam, getExamsByTeacher, getExamDetail, updateExam, saveExamQuestions, deleteExam };
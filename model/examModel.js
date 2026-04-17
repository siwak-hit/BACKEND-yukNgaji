const supabase = require('../config/supabaseClient');

const createExam = async (examData) => {
    const { data, error } = await supabase.from('exams').insert([examData]).select().single();
    if (error) throw error;
    return data;
};

// [OPTIMASI] Hanya ambil data inti untuk list tabel (Tanpa narik semua text panjang)
const getExamsByTeacher = async (username) => {
    const { data, error } = await supabase
        .from('exams')
        .select('id, title, subject, duration_minutes, is_active, created_at') 
        .eq('created_by', username)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

// [OPTIMASI] Ambil detail ujian sekaligus daftar soal-soalnya secara spesifik
const getExamDetail = async (examId) => {
    const { data: exam, error: examErr } = await supabase
        .from('exams')
        .select('id, title, subject, duration_minutes, is_active') 
        .eq('id', examId)
        .single();
    if (examErr) throw examErr;

    const { data: questions, error: qErr } = await supabase
        .from('exam_questions')
        .select('id, question, options, correct_answer, hint, image_url, difficulty_level')
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
            exam_id: examId, question: q.question, options: q.options, correct_answer: q.correct_answer,
            hint: q.hint || null, image_url: q.image_url || null, difficulty_level: q.difficulty_level || 'sedang'
        }));
        const { data, error } = await supabase.from('exam_questions').insert(formattedQuestions).select('id');
        if (error) throw error;
        return data;
    }
    return [];
};

const deleteExam = async (examId) => {
    const { error } = await supabase.from('exams').delete().eq('id', examId);
    if (error) throw error;
    return true;
};

module.exports = { createExam, getExamsByTeacher, getExamDetail, updateExam, saveExamQuestions, deleteExam };
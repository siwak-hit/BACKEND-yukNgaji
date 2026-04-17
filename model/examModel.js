const supabase = require('../config/supabaseClient');

// Simpan / Buat Ujian Baru
const createExam = async (examData) => {
    const { data, error } = await supabase
        .from('exams')
        .insert([examData])
        .select()
        .single();
    if (error) throw error;
    return data;
};

// Ambil semua daftar Ujian
const getExamsByTeacher = async (username) => {
    const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('created_by', username)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

// Ambil detail ujian sekaligus daftar soal-soalnya
const getExamDetail = async (examId) => {
    // Ambil info ujian
    const { data: exam, error: examErr } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();
    if (examErr) throw examErr;

    // Ambil daftar soalnya
    const { data: questions, error: qErr } = await supabase
        .from('exam_questions')
        .select('*')
        .eq('exam_id', examId)
        .order('created_at', { ascending: true });
    if (qErr) throw qErr;

    return { ...exam, questions: questions || [] };
};

// Update status atau pengaturan Ujian
const updateExam = async (examId, updateData) => {
    const { data, error } = await supabase
        .from('exams')
        .update(updateData)
        .eq('id', examId)
        .select()
        .single();
    if (error) throw error;
    return data;
};

// Simpan banyak soal sekaligus (Bulk Upsert / Insert)
const saveExamQuestions = async (examId, questionsArray) => {
    // Hapus soal lama untuk memastikan sinkronisasi sempurna dengan frontend builder
    await supabase.from('exam_questions').delete().eq('exam_id', examId);

    if (questionsArray && questionsArray.length > 0) {
        // Beri exam_id ke setiap soal
        const formattedQuestions = questionsArray.map(q => ({
            exam_id: examId,
            question: q.question,
            options: q.options,
            correct_answer: q.correct_answer,
            hint: q.hint || null,
            image_url: q.image_url || null
        }));

        const { data, error } = await supabase
            .from('exam_questions')
            .insert(formattedQuestions)
            .select();
        
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

module.exports = {
    createExam,
    getExamsByTeacher,
    getExamDetail,
    updateExam,
    saveExamQuestions,
    deleteExam
};
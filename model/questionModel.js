const supabase = require('../config/supabaseClient');

const insertQuestions = async (questionsArray) => {
    if (questionsArray.length === 0) return [];
    
    const { data, error } = await supabase
        .from('questions')
        .insert(questionsArray)
        .select('id'); // [OPTIMASI] Hanya kembalikan ID untuk menghemat bandwidth
        
    if (error) throw error;
    return data;
};

// Opsional: untuk FE nampilin soal ke siswa (di consultations/fill.astro)
const getQuestionsBySubject = async (subject) => {
    const { data, error } = await supabase
        .from('questions')
        .select('id, question, options, type') // [OPTIMASI] Tambahkan 'type', dan TETAP SEMBUNYIKAN correct_answer
        .eq('subject', subject);
        
    if (error) throw error;
    return data;
};

module.exports = { insertQuestions, getQuestionsBySubject };
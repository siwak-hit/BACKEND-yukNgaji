const supabase = require('../config/supabaseClient');

const insertQuestions = async (questionsArray) => {
    if (questionsArray.length === 0) return [];
    
    const { data, error } = await supabase
        .from('questions')
        .insert(questionsArray)
        .select();
        
    if (error) throw error;
    return data;
};

// Opsional: untuk FE nampilin soal ke siswa
const getQuestionsBySubject = async (subject) => {
    const { data, error } = await supabase
        .from('questions')
        .select('id, question, options') // Sengaja gak return kunci jawaban biar gak dicontek via Inspect Element FE
        .eq('subject', subject);
        
    if (error) throw error;
    return data;
};

module.exports = { insertQuestions, getQuestionsBySubject };
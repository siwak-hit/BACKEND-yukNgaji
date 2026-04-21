const supabase = require('../config/supabaseClient');

const getStudentProgress = async (studentId) => {
    const { data, error } = await supabase
        .from('onboarding_results')
        .select('id, week, subject, score') // [OPTIMASI]
        .eq('student_id', studentId)
        .order('week', { ascending: true });
    if (error) throw error;
    return data;
};

const saveResult = async (onboardingData) => {
    const { data, error } = await supabase.from('onboarding_results').insert([onboardingData]).select('id').single();
    if (error) throw error;
    return data;
};

const getAllOnboardingResults = async () => {
    const { data, error } = await supabase
        .from('onboarding_results')
        .select('student_id, subject, week, score') // [OPTIMASI]
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

const getStudentProgressBySubject = async (studentId, subject) => {
    const { data, error } = await supabase
        .from('onboarding_results')
        .select('week, score') // [OPTIMASI]
        .eq('student_id', studentId)
        .eq('subject', subject) 
        .order('week', { ascending: true }); 
    if (error) throw error;
    return data;
};

const getStudentReview = async (studentId, subject, week) => {
    // 1. Ambil data hasil ujian siswa (termasuk student_answers)
    const { data: resultData, error: resultErr } = await supabase
        .from('onboarding_results')
        .select('score, category, student_answers, notes')
        .eq('student_id', studentId)
        .eq('subject', subject)
        .eq('week', week)
        .single();
        
    if (resultErr) throw resultErr;

    // 2. Ambil soal aslinya untuk disandingkan
    const { data: questionsData, error: qErr } = await supabase
        .from('questions')
        .select('id, question, options, correct_answer, type')
        .eq('subject', subject)
        .eq('week', week);

    if (qErr) throw qErr;

    return { result: resultData, questions: questionsData };
};

module.exports = { getStudentProgress, saveResult, getAllOnboardingResults, getStudentProgressBySubject, getStudentReview };
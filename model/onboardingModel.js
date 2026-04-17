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

module.exports = { getStudentProgress, saveResult, getAllOnboardingResults, getStudentProgressBySubject };
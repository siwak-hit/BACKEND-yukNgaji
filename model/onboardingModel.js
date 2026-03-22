const supabase = require('../config/supabaseClient');

const getStudentProgress = async (studentId) => {
    const { data, error } = await supabase
        .from('onboarding_results')
        .select('*')
        .eq('student_id', studentId)
        .order('week', { ascending: true });
        
    if (error) throw error;
    return data;
};

const saveResult = async (onboardingData) => {
    const { data, error } = await supabase
        .from('onboarding_results')
        .insert([onboardingData])
        .select()
        .single();
        
    if (error) throw error;
    return data;
};

// Add this new function at the bottom
const getAllOnboardingResults = async () => {
    const { data, error } = await supabase
        .from('onboarding_results')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    return data;
};

const getStudentProgressBySubject = async (studentId, subject) => {
    const { data, error } = await supabase
        .from('onboarding_results')
        .select('*')
        .eq('student_id', studentId)
        .eq('subject', subject) // Hanya ambil data mapel yang sesuai
        .order('week', { ascending: true }); // Urutkan dari minggu pertama sampai terakhir
        
    if (error) throw error;
    return data;
};

module.exports = { 
    getStudentProgress, 
    saveResult, 
    getAllOnboardingResults, // Export the new function
    getStudentProgressBySubject
};
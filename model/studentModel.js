const supabase = require('../config/supabaseClient');

const createStudent = async (studentData) => {
    const { data, error } = await supabase.from('students').insert([studentData]).select('id').single();
    if (error) throw error;
    return data;
};

// [OPTIMASI] List Siswa / Anak tidak butuh tanggal buat dll
const getStudentsByTeacher = async (teacherUsername) => {
    const { data, error } = await supabase
        .from('students')
        .select('id, name, grade, current_surah_id, current_ayah, has_infaq_can') 
        .eq('created_by', teacherUsername)
        .order('name', { ascending: true }); // Diurutkan abjad agar rapi
    if (error) throw error;
    return data;
};

// [OPTIMASI] Ambil kolom spesifik
const getStudentById = async (id, teacherUsername) => {
    const { data, error } = await supabase
        .from('students')
        .select('id, name, grade, current_surah_id, current_ayah, has_infaq_can, last_can_received_at')
        .eq('id', id)
        .eq('created_by', teacherUsername)
        .single();
    if (error && error.code !== 'PGRST116') throw error; 
    return data;
};

const updateStudent = async (id, teacherUsername, updateData) => {
    const { data, error } = await supabase.from('students').update(updateData).eq('id', id).eq('created_by', teacherUsername).select('id').single();
    if (error) throw error;
    return data;
};

const deleteStudent = async (id, teacherUsername) => {
    const { error } = await supabase.from('students').delete().eq('id', id).eq('created_by', teacherUsername);
    if (error) throw error;
    return true;
};

module.exports = { createStudent, getStudentsByTeacher, getStudentById, updateStudent, deleteStudent };
const supabase = require('../config/supabaseClient');

const createStudent = async (studentData) => {
    const { data, error } = await supabase
        .from('students')
        .insert([studentData])
        .select()
        .single();
    if (error) throw error;
    return data;
};

const getStudentsByTeacher = async (teacherUsername) => {
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('created_by', teacherUsername)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

const getStudentById = async (id, teacherUsername) => {
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('id', id)
        .eq('created_by', teacherUsername)
        .single();
    if (error && error.code !== 'PGRST116') throw error; // Ignore "no rows returned" error
    return data;
};

const updateStudent = async (id, teacherUsername, updateData) => {
    const { data, error } = await supabase
        .from('students')
        .update(updateData)
        .eq('id', id)
        .eq('created_by', teacherUsername)
        .select()
        .single();
    if (error) throw error;
    return data;
};

const deleteStudent = async (id, teacherUsername) => {
    const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', id)
        .eq('created_by', teacherUsername);
    if (error) throw error;
    return true;
};

module.exports = {
    createStudent,
    getStudentsByTeacher,
    getStudentById,
    updateStudent,
    deleteStudent
};
const supabase = require('../config/supabaseClient');

const createTodos = async (todosArray) => {
    if (todosArray.length === 0) return [];
    const { data, error } = await supabase.from('todos').insert(todosArray).select('id');
    if (error) throw error;
    return data;
};

// [OPTIMASI] 
const getTodosByStudent = async (studentId) => {
    const { data, error } = await supabase
        .from('todos')
        .select('id, title, description, status, week') // Dibuang created_at & student_id (karena udah tau)
        .eq('student_id', studentId)
        .order('week', { ascending: false })
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

module.exports = { createTodos, getTodosByStudent };
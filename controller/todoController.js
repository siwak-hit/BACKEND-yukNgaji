const todoModel = require('../model/todoModel');
const supabase = require('../config/supabaseClient');


// GET /students/:id/todos
const getStudentTodos = async (req, res) => {
    try {
        const studentId = req.params.id;
        const todos = await todoModel.getTodosByStudent(studentId);
        
        res.status(200).json({
            status: "success",
            data: todos
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// PUT /api/todos/:id
const updateTodo = async (req, res) => {
    try {
        const { id } = req.params; // Pastikan ambil id dari params
        const { status, title, description } = req.body;

        const { data, error } = await supabase
            .from('todos')
            .update({ status, title, description })
            .eq('id', id)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ message: "Todo tidak ditemukan" });

        res.status(200).json({ status: "success", data: data[0] });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { getStudentTodos, updateTodo };
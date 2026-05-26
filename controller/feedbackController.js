const supabase = require('../config/supabaseClient');

const getFeedbacks = async (req, res) => {
    try {
        const username = req.user.username; // Guru yang sedang login

        // Ambil feedback hanya dari murid yang dibuat oleh guru ini
        const { data, error } = await supabase
            .from('app_feedbacks')
            .select(`
                *,
                students!inner (name, grade, created_by),
                exams (title)
            `)
            .eq('students.created_by', username)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json({
            status: 'success',
            data: data || []
        });
    } catch (error) {
        console.error('Get Feedbacks Error:', error.message);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal memuat data feedback.'
        });
    }
};

module.exports = { getFeedbacks };

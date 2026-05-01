const { supabase } = require('../config/supabaseClient');

const getNotifs = async (req, res) => {
    try {
        const { data, error } = await supabase.from('pr_notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50); // Ambil 50 notif terbaru aja biar ringan
        if (error) throw error;
        res.status(200).json({ status: 'success', data });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

const deleteNotif = async (req, res) => {
    try {
        const { error } = await supabase.from('pr_notifications').delete().eq('id', req.params.id);
        if (error) throw error;
        res.status(200).json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

const clearAllNotifs = async (req, res) => {
    try {
        // Hapus semua data yang ID-nya tidak null (alias hapus semua)
        const { error } = await supabase.from('pr_notifications').delete().not('id', 'is', null);
        if (error) throw error;
        res.status(200).json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = { getNotifs, deleteNotif, clearAllNotifs };
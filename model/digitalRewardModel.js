// Sesuaikan import ini dengan file konfigurasi Supabase di project kamu
const supabase = require('../config/supabaseClient');

const getUnlockedMedia = async (studentId) => {
    const { data, error } = await supabase
        .from('digital_rewards_purchases')
        .select('item_filename')
        .eq('student_id', studentId);

    if (error) throw error;
    return data.map(row => row.item_filename);
};

const purchaseMedia = async (studentId, filename, type, cost) => {
    // Memanggil fungsi RPC yang baru saja kita buat di Supabase SQL Editor
    const { data, error } = await supabase.rpc('purchase_digital_reward', {
        p_student_id: studentId,
        p_item_filename: filename,
        p_item_type: type,
        p_cost: cost
    });

    if (error) {
        // Tangkap error duplikat (sudah dibeli)
        if (error.code === '23505') {
            throw new Error('Media ini sudah dibeli sebelumnya');
        }
        // Tangkap error custom dari fungsi RPC (misal: Koin tidak cukup)
        throw new Error(error.message);
    }

    // Data akan berisi sisa koin (v_new_poin) dari return function
    return data;
};

module.exports = { getUnlockedMedia, purchaseMedia };

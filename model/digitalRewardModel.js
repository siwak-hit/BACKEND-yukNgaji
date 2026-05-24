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

const transferCoin = async (senderId, receiverId, amount, note) => {
    const { data, error } = await supabase.rpc('transfer_digital_coins', {
        p_sender_id: senderId,
        p_receiver_id: receiverId,
        p_amount: amount,
        p_note: note // Kirim note ke Supabase
    });
    if (error) throw new Error(error.message);
    return data;
};

const claimGameReward = async (studentId, amount) => {
    const { data, error } = await supabase.rpc('add_digital_coins', {
        p_student_id: studentId,
        p_amount: amount
    });
    if (error) throw new Error(error.message);
    return data; // Mengembalikan poin terbaru
};

const getPendingTransfers = async (receiverId) => {
    const { data, error } = await supabase
        .from('coin_transfers')
        // Ambil kolom transfer_type tambahan
        .select('id, amount, note, transfer_type, sender:students!sender_id(name)')
        .eq('receiver_id', receiverId)
        .eq('is_notified', false);

    if (error) throw error;
    return data;
};

const markTransfersAsNotified = async (receiverId) => {
    // Mengubah status seluruh transferan masuk menjadi sudah dinotifikasi (TRUE)
    const { error } = await supabase
        .from('coin_transfers')
        .update({ is_notified: true })
        .eq('receiver_id', receiverId)
        .eq('is_notified', false);

    if (error) throw error;
    return true;
};

const saveGachaRameanWin = async (spinnerId, winnerId, amount) => {
    // 1. Tambahkan koin secara riil ke akun teman yang menang gacha
    const { data, error: rpcErr } = await supabase.rpc('add_digital_coins', {
        p_student_id: winnerId,
        p_amount: amount
    });
    if (rpcErr) throw rpcErr;

    // 2. Catat log notifikasi dengan tipe 'gacha'
    const { error: logErr } = await supabase
        .from('coin_transfers')
        .insert({
            sender_id: spinnerId,
            receiver_id: winnerId,
            amount: amount,
            transfer_type: 'gacha',
            note: 'Menang adu nasib gacha ramean!'
        });
    if (logErr) throw logErr;

    return data;
};

// Pastikan fungsi baru didaftarkan di module.exports:
module.exports = {
    getUnlockedMedia, purchaseMedia, transferCoin, claimGameReward,
    getPendingTransfers, markTransfersAsNotified, saveGachaRameanWin
};

const rewardModel = require('../model/digitalRewardModel');

const fetchUnlocked = async (req, res) => {
    try {
        const { studentId } = req.params;
        const items = await rewardModel.getUnlockedMedia(studentId);
        res.json({ status: 'success', data: items });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};


const buyMedia = async (req, res) => {
    try {
        const { student_id, filename, type, cost } = req.body;

        // UPDATE: Validasi harga sesuai tipe item baru
        let validCost = 0;
        if (type === 'photo') validCost = 150;
        else if (type === 'video') validCost = 700;
        else if (type === 'ability') validCost = 500;
        else if (type === 'game') validCost = 800;

        if (cost !== validCost) return res.status(400).json({ status: 'error', message: 'Harga tidak valid' });

        const newPoin = await rewardModel.purchaseMedia(student_id, filename, type, validCost);
        res.json({ status: 'success', data: { new_poin: newPoin } });
    } catch (error) {
        if (error.code === '23505') return res.status(400).json({ status: 'error', message: 'Item ini sudah dibeli sebelumnya' });
        res.status(400).json({ status: 'error', message: error.message });
    }
};

const executeTransfer = async (req, res) => {
    try {
        // Ambil 'note' dari body
        const { sender_id, receiver_id, amount, note } = req.body;
        if (amount <= 0) throw new Error('Jumlah transfer tidak valid');
        if (sender_id === receiver_id) throw new Error('Tidak bisa transfer ke diri sendiri');

        // Set default text jika user tidak mengisi catatan
        const finalNote = (note && note.trim() !== '') ? note.trim() : 'ini terima hadiah dari aku';

        // Lempar finalNote ke model
        const newPoin = await rewardModel.transferCoin(sender_id, receiver_id, amount, finalNote);
        res.json({ status: 'success', data: { new_poin: newPoin } });
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
};

const executeGameWin = async (req, res) => {
    try {
        const { student_id, reward_amount } = req.body;

        // Langsung lempar ke model, baik itu minus (bayar spin), nol (zonk), atau positif (menang).
        // Fungsi rpc 'add_digital_coins' di Supabase sudah sangat pintar,
        // jika ditambah minus otomatis berkurang, jika ditambah nol otomatis tidak berubah.
        const newPoin = await rewardModel.claimGameReward(student_id, reward_amount);

        res.json({ status: 'success', data: { new_poin: newPoin } });
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
};

const fetchTransferNotifications = async (req, res) => {
    try {
        const { studentId } = req.params;
        const notifications = await rewardModel.getPendingTransfers(studentId);
        res.json({ status: 'success', data: notifications });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const clearTransferNotifications = async (req, res) => {
    try {
        const { studentId } = req.params;
        await rewardModel.markTransfersAsNotified(studentId);
        res.json({ status: 'success', message: 'Notifikasi berhasil dibersihkan' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const executeGachaRameanWin = async (req, res) => {
    try {
        const { spinner_id, winner_id, reward_amount } = req.body;

        if (spinner_id === winner_id) {
            // Jika diri sendiri yang memenangkan putaran gacha
            const newPoin = await rewardModel.claimGameReward(spinner_id, reward_amount);
            return res.json({ status: 'success', data: { new_poin: newPoin, self_win: true } });
        } else {
            // Jika teman kelompok yang memenangkan hadiah koin gacha
            await rewardModel.saveGachaRameanWin(spinner_id, winner_id, reward_amount);
            return res.json({ status: 'success', data: { self_win: false } });
        }
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
};

// Daftarkan di module.exports:
module.exports = {
    fetchUnlocked, buyMedia, executeTransfer, executeGameWin,
    fetchTransferNotifications, clearTransferNotifications, executeGachaRameanWin
};

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

        // Validasi harga dari server untuk keamanan
        const validCost = type === 'photo' ? 150 : 700;
        if (cost !== validCost) return res.status(400).json({ status: 'error', message: 'Harga tidak valid' });

        const newPoin = await rewardModel.purchaseMedia(student_id, filename, type, validCost);
        res.json({ status: 'success', data: { new_poin: newPoin } });
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({ status: 'error', message: 'Media ini sudah dibeli sebelumnya' });
        }
        res.status(400).json({ status: 'error', message: error.message });
    }
};

module.exports = { fetchUnlocked, buyMedia };

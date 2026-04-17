const supabase = require('../config/supabaseClient');
// const bcrypt = require('bcrypt'); // Uncomment ini jika password di database Anda di-hash pakai bcrypt

const factoryReset = async (req, res) => {
    try {
        const { password } = req.body;
        const username = req.user.username; // Didapat dari authMiddleware JWT

        // 1. Ambil password asli dari database
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('password')
            .eq('username', username)
            .single();

        if (userErr || !user) {
            return res.status(404).json({ status: "error", message: "Akun tidak ditemukan." });
        }

        // 2. Verifikasi Password 
        // Jika password di DB Anda menggunakan text biasa:
        const isPasswordMatch = (password === user.password);
        
        // Jika password di DB Anda di-hash menggunakan bcrypt, GANTI baris di atas dengan ini:
        // const isPasswordMatch = bcrypt.compareSync(password, user.password);

        if (!isPasswordMatch) {
            return res.status(403).json({ status: "error", message: "Password salah! Akses Ditolak." });
        }

        // 3. Backup Data
        const tables = ['attendances', 'consultations', 'memorization_logs', 'onboarding_results', 'raports', 'todos'];
        const backupData = {
            timestamp: new Date().toISOString(),
            data: {}
        };

        for (const t of tables) {
            const { data } = await supabase.from(t).select('*');
            backupData.data[t] = data || [];
        }

        // 4. Eksekusi Hapus Transaksi
        await Promise.all(tables.map(t => supabase.from(t).delete().not('id', 'is', null)));

        // 5. Reset Progress Siswa (Nama Siswa Tetap Aman)
        await supabase.from('students').update({
            has_infaq_can: false,
            last_can_received_at: null,
            current_surah_id: null,
            current_ayah: 0
        }).not('id', 'is', null);

        res.status(200).json({ status: "success", backup: backupData });
    } catch (error) {
        console.error("Reset Error:", error);
        res.status(500).json({ status: "error", message: "Terjadi kesalahan internal server." });
    }
};

module.exports = { factoryReset };
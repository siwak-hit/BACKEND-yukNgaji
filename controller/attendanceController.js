const supabase = require('../config/supabaseClient');

// Helper untuk format tanggal YYYY-MM-DD sesuai zona waktu Bekasi (WIB)
const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

// GET /api/attendances/today-status
const getTodayStatus = async (req, res) => {
    try {
        const today = getTodayStr();
        const username = req.user.username;

        const { data, error } = await supabase
            .from('attendances')
            .select('id')
            .eq('date', today)
            .eq('created_by', username);

        if (error) throw error;

        // Cek apakah data ada isinya
        const isDone = data && data.length > 0;

        // --- PERBAIKAN DI SINI ---
        // 1. Ambil string waktu saat ini di Jakarta
        const jakartaTimeStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
        // 2. Jadikan objek Date, lalu ambil angka harinya (0 = Minggu, 1 = Senin, ... 6 = Sabtu)
        const dayOfWeek = new Date(jakartaTimeStr).getDay(); 

        // 1=Senin(Tajwid), 2=Selasa(Fiqih), 3=Rabu(Tauhid), 5=Jumat(Hafalan). 0,4,6=Sunnah
        const mandatoryDays = [1, 2, 3, 5];
        const isMandatory = mandatoryDays.includes(dayOfWeek);

        res.status(200).json({ 
            status: "success", 
            isDone: isDone, 
            isMandatory: isMandatory,
            todayDate: today
        });
    } catch (error) {
        console.error("Get Today Status Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /api/attendances (Ambil semua absensi bulan ini)
const getAttendances = async (req, res) => {
    try {
        const username = req.user.username;
        const { data, error } = await supabase
            .from('attendances')
            .select('*')
            .eq('created_by', username);

        if (error) throw error;
        res.status(200).json({ status: "success", data: data || [] });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// POST /api/attendances (Upsert Absensi)
const saveAttendance = async (req, res) => {
    try {
        const { date, subject, present_students } = req.body;
        const username = req.user.username;

        // 1. Validasi Keamanan: Pastikan present_students adalah Object JSON yang valid
        if (!present_students || typeof present_students !== 'object' || Array.isArray(present_students)) {
            return res.status(400).json({ 
                status: "error", 
                message: "Format data kehadiran tidak valid. Harus berupa Object Map." 
            });
        }

        // 2. Simpan ke Database (Supabase otomatis mengkonversi Object JS ke JSONB)
        const { data, error } = await supabase
            .from('attendances')
            .upsert({ 
                date, 
                subject, 
                present_students, // Sekarang berisi format: { "id_santri": { status: "hadir", reason: "" } }
                created_by: username 
            }, { onConflict: 'date, created_by' })
            .select()
            .single();

        if (error) {
            console.error("Supabase Error (Save Attendance):", error.message);
            throw error;
        }

        res.status(200).json({ status: "success", data });
    } catch (error) {
        console.error("Save Attendance Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { getTodayStatus, getAttendances, saveAttendance };
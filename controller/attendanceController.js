const supabase = require('../config/supabaseClient');

const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

const getTodayStatus = async (req, res) => {
    try {
        const today = getTodayStr();
        const username = req.user.username;

        const { data, error } = await supabase
            .from('attendances')
            .select('id') // [OPTIMASI]
            .eq('date', today)
            .eq('created_by', username);

        if (error) throw error;

        const isDone = data && data.length > 0;
        const jakartaTimeStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
        const dayOfWeek = new Date(jakartaTimeStr).getDay(); 

        const mandatoryDays = [1, 2, 3, 5];
        const isMandatory = mandatoryDays.includes(dayOfWeek);

        res.status(200).json({ status: "success", isDone: isDone, isMandatory: isMandatory, todayDate: today });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getAttendances = async (req, res) => {
    try {
        const username = req.user.username;
        const { data, error } = await supabase
            .from('attendances')
            .select('id, date, subject, present_students') // [OPTIMASI]
            .eq('created_by', username);

        if (error) throw error;
        res.status(200).json({ status: "success", data: data || [] });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const saveAttendance = async (req, res) => {
    try {
        const { date, subject, present_students } = req.body;
        const username = req.user.username;

        if (!present_students || typeof present_students !== 'object' || Array.isArray(present_students)) {
            return res.status(400).json({ status: "error", message: "Format data kehadiran tidak valid." });
        }

        const { data, error } = await supabase
            .from('attendances')
            .upsert({ date, subject, present_students, created_by: username }, { onConflict: 'date, created_by' })
            .select('id') // [OPTIMASI] Hanya kembalikan ID setelah simpan
            .single();

        if (error) throw error;
        res.status(200).json({ status: "success", data });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { getTodayStatus, getAttendances, saveAttendance };
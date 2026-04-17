const supabase = require('../config/supabaseClient');

const JUZ_AMMA = [
    { id: 1, name: "An-Nas", ayahs: 6 },
    { id: 2, name: "Al-Falaq", ayahs: 5 },
    { id: 3, name: "Al-Ikhlas", ayahs: 4 },
    { id: 4, name: "Al-Masad", ayahs: 5 },
    { id: 5, name: "An-Nasr", ayahs: 3 },
    { id: 6, name: "Al-Kafirun", ayahs: 6 },
    { id: 7, name: "Al-Kausar", ayahs: 3 },
    { id: 8, name: "Al-Ma'un", ayahs: 7 },
    { id: 9, name: "Quraisy", ayahs: 4 },
    { id: 10, name: "Al-Fil", ayahs: 5 },
    { id: 11, name: "Al-Humazah", ayahs: 9 },
    { id: 12, name: "Al-'Asr", ayahs: 3 },
    { id: 13, name: "At-Takasur", ayahs: 8 },
    { id: 14, name: "Al-Qari'ah", ayahs: 11 },
    { id: 15, name: "Al-'Adiyat", ayahs: 11 },
    { id: 16, name: "Az-Zalzalah", ayahs: 8 },
    { id: 17, name: "Al-Bayyinah", ayahs: 8 },
    { id: 18, name: "Al-Qadr", ayahs: 5 },
    { id: 19, name: "Al-'Alaq", ayahs: 19 },
    { id: 20, name: "At-Tin", ayahs: 8 },
    { id: 21, name: "Al-Insyirah", ayahs: 8 },
    { id: 22, name: "Ad-Duha", ayahs: 11 },
    { id: 23, name: "Al-Lail", ayahs: 21 },
    { id: 24, name: "Asy-Syams", ayahs: 15 },
    { id: 25, name: "Al-Balad", ayahs: 20 },
    { id: 26, name: "Al-Fajr", ayahs: 30 },
    { id: 27, name: "Al-Gasyiyah", ayahs: 26 },
    { id: 28, name: "Al-A'la", ayahs: 19 },
    { id: 29, name: "At-Tariq", ayahs: 17 },
    { id: 30, name: "Al-Buruj", ayahs: 22 },
    { id: 31, name: "Al-Insyiqaq", ayahs: 25 },
    { id: 32, name: "Al-Mutaffifin", ayahs: 36 },
    { id: 33, name: "Al-Infitar", ayahs: 19 },
    { id: 34, name: "At-Takwir", ayahs: 29 },
    { id: 35, name: "Abasa", ayahs: 42 },
    { id: 36, name: "An-Nazi'at", ayahs: 46 },
    { id: 37, name: "An-Naba'", ayahs: 40 }
];

const getSurah = (id) => JUZ_AMMA.find(s => s.id === id) || null;

const logMemorization = async (req, res) => {
    try {
        const { student_id, added_ayahs } = req.body;
        if (!student_id || added_ayahs === undefined || added_ayahs === 0) return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });

        const { data: student, error: stdErr } = await supabase.from('students').select('id, name, current_surah_id, current_ayah').eq('id', student_id).single();
        if (stdErr || !student) throw new Error('Siswa tidak ditemukan.');
        if (student.current_surah_id === null) return res.status(400).json({ status: 'error', message: 'Onboarding belum dilakukan.' });

        let surahId = student.current_surah_id;
        let ayah = student.current_ayah;
        let surah = getSurah(surahId);
        let prevSurahName = surah.name;
        let promoted = false, demoted = false, nextSurahName = null;

        let newAyah = ayah + added_ayahs;
        let newSurahId = surahId;

        if (added_ayahs > 0) {
            const maxSetor = surah.ayahs - ayah;
            if (added_ayahs > maxSetor) return res.status(400).json({ status: 'error', message: 'Maksimal setor melebihi batas ayat.' });

            if (newAyah >= surah.ayahs) {
                const nextSurah = getSurah(surahId + 1);
                if (nextSurah) {
                    newSurahId = nextSurah.id; newAyah = 0; promoted = true; nextSurahName = nextSurah.name;
                } else {
                    newSurahId = surahId; newAyah = surah.ayahs; promoted = true; nextSurahName = 'KHATAM JUZ AMMA 🎉';
                }
            }
        }

        if (added_ayahs < 0) {
            if (newAyah <= 0) {
                const prevSurah = getSurah(surahId - 1);
                if (prevSurah) {
                    newSurahId = prevSurah.id; newAyah = prevSurah.ayahs + newAyah;
                    if (newAyah < 0) newAyah = 0;
                    demoted = true; nextSurahName = prevSurah.name;
                } else {
                    newSurahId = surahId; newAyah = 0; demoted = true; nextSurahName = surah.name;
                }
            }
        }

        const { error: updateErr } = await supabase.from('students').update({ current_surah_id: newSurahId, current_ayah: newAyah }).eq('id', student_id);
        if (updateErr) throw updateErr;

        const todayDate = new Date().toISOString().split('T')[0];
        const logSurah = getSurah(surahId); 
        const logEndAyah = added_ayahs > 0 ? Math.min(ayah + added_ayahs, logSurah.ayahs) : newAyah;

        await supabase.from('memorization_logs').upsert(
            { student_id, date: todayDate, surah_name: logSurah.name, start_ayah: added_ayahs > 0 ? ayah + 1 : logEndAyah, end_ayah: logEndAyah, added_ayahs },
            { onConflict: 'student_id,date,surah_name' }
        );

        res.status(200).json({ status: 'success', data: { current_surah_id: newSurahId, current_ayah: newAyah, promoted, demoted, prev_surah: prevSurahName, next_surah: nextSurahName }});
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const setCheckpoint = async (req, res) => {
    try {
        const { current_surah_id, current_ayah } = req.body;
        const { data, error } = await supabase.from('students').update({ current_surah_id: parseInt(current_surah_id), current_ayah: parseInt(current_ayah) }).eq('id', req.params.id).select('current_surah_id, current_ayah').single();
        if (error) throw error;
        res.status(200).json({ status: 'success', data });
    } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

const updateCheckpoint = async (req, res) => {
    try {
        const { current_surah_id, current_ayah } = req.body;
        const { data, error } = await supabase.from('students').update({ current_surah_id: parseInt(current_surah_id), current_ayah: parseInt(current_ayah) }).eq('id', req.params.id).select('current_surah_id, current_ayah').single();
        if (error) throw error;
        res.status(200).json({ status: 'success', data });
    } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

const resetCheckpoint = async (req, res) => {
    try {
        const { error } = await supabase.from('students').update({ current_surah_id: null, current_ayah: 0 }).eq('id', req.params.id);
        if (error) throw error;
        res.status(200).json({ status: 'success', message: 'Data hafalan direset.' });
    } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

const getMemorizationLogs = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('memorization_logs')
            .select('id, date, surah_name, start_ayah, end_ayah, added_ayahs') // [OPTIMASI]
            .eq('student_id', req.params.id)
            .order('date', { ascending: false })
            .limit(parseInt(req.query.limit || 30));

        if (error) throw error;
        res.status(200).json({ status: 'success', data: data || [] });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = { logMemorization, setCheckpoint, updateCheckpoint, resetCheckpoint, getMemorizationLogs };
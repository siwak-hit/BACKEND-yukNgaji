const supabase = require('../config/supabaseClient');

const getTodayDate = () => {
    return new Date().toISOString().slice(0, 10);
};

const normalizeText = (text = '') => {
    return String(text)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
};

const getBaseReward = (level, eventCoinBase = 5) => {
    const base = Number(eventCoinBase) || 5;
    return level <= 5 ? base : base + 5;
};

const getComboReward = (timeTakenSeconds) => {
    if (timeTakenSeconds <= 10) return 15;
    if (timeTakenSeconds <= 15) return 10;
    return 0;
};

const getDailyChallengeState = async (req, res) => {
    try {
        // Terima client_date dari query
        const { student_id, preview, client_date } = req.query;
        const isPreview = preview === 'true';

        if (!student_id && !isPreview) {
            return res.status(400).json({ status: 'error', message: 'student_id wajib dikirim.' });
        }

        // Gunakan client_date jika ada, jika tidak fallback ke server date
        const today = client_date || getTodayDate();

        if (isPreview) {
            return res.status(200).json({
                status: 'success',
                data: {
                    is_preview: true,
                    challenge_date: today,
                    current_level: 1,
                    completed_levels: [],
                    total_coins_earned: 0,
                    total_combo_earned: 0,
                    student: {
                        id: 'preview_mode',
                        name: 'Mode Simulasi',
                        poin: 9999
                    }
                }
            });
        }

        const { data: student, error: studentErr } = await supabase
            .from('students')
            .select('id, name, poin')
            .eq('id', student_id)
            .single();

        if (studentErr || !student) {
            return res.status(404).json({
                status: 'error',
                message: 'Siswa tidak ditemukan.'
            });
        }

        let { data: progress, error: progressErr } = await supabase
            .from('daily_challenge_progress')
            .select('*')
            .eq('student_id', student_id)
            .eq('challenge_date', today)
            .maybeSingle();

        if (progressErr) throw progressErr;

        if (!progress) {
            const { data: inserted, error: insertErr } = await supabase
                .from('daily_challenge_progress')
                .insert([{
                    student_id,
                    challenge_date: today,
                    current_level: 1,
                    completed_levels: [],
                    total_coins_earned: 0,
                    total_combo_earned: 0
                }])
                .select('*')
                .single();

            if (insertErr) throw insertErr;
            progress = inserted;
        }

        return res.status(200).json({
            status: 'success',
            data: {
                is_preview: false,
                challenge_date: today,
                current_level: progress.current_level,
                completed_levels: progress.completed_levels || [],
                total_coins_earned: progress.total_coins_earned || 0,
                total_combo_earned: progress.total_combo_earned || 0,
                student
            }
        });

    } catch (error) {
        console.error('Get Daily Challenge State Error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal mengambil data daily challenge.'
        });
    }
};

const submitDailyChallengeLevel = async (req, res) => {
    try {
        // 1. Tambahkan event_coin di sini
        const {
            student_id, level, sentence_id, typed_text, time_taken_seconds, preview = false, client_date, event_coin
        } = req.body;

        const isPreview = preview === true;

        if (!isPreview && !student_id) {
            return res.status(400).json({ status: 'error', message: 'student_id wajib dikirim.' });
        }

        if (!level || level < 1 || level > 10 || !sentence_id || !typed_text) {
            return res.status(400).json({
                status: 'error',
                message: 'Data level tidak lengkap.'
            });
        }

        const { data: sentence, error: sentenceErr } = await supabase
            .from('daily_challenge_sentences')
            .select('*')
            .eq('id', sentence_id)
            .single();

        if (sentenceErr || !sentence) {
            return res.status(404).json({
                status: 'error',
                message: 'Kalimat challenge tidak ditemukan.'
            });
        }

        // Variabel ini bernama isCorrect (bukan is_correct)
        const isCorrect = normalizeText(typed_text) === normalizeText(sentence.sentence);

        if (!isCorrect) {
            return res.status(400).json({
                status: 'error',
                message: 'Teks belum sama persis dengan tantangan.',
                data: { is_correct: false }
            });
        }

        const today = client_date || getTodayDate();

        // 2. Langsung masukkan event_coin ke fungsi getBaseReward (Tidak perlu is_correct lagi)
        const baseReward = getBaseReward(Number(level), event_coin);
        const comboMultiplier = getComboMultiplier(Number(time_taken_seconds || 999));

        // Kalkulasi total
        const totalReward = baseReward * comboMultiplier;
        const comboReward = totalReward - baseReward;

        if (isPreview) {
            return res.status(200).json({
                status: 'success',
                data: {
                    is_preview: true,
                    is_rewarded: true,
                    base_reward: baseReward,
                    combo_multiplier: comboMultiplier, // Kirim multiplier ke frontend untuk UI
                    combo_reward: comboReward,
                    total_reward: totalReward,
                    next_level: Number(level) < 10 ? Number(level) + 1 : 10,
                    is_daily_completed: Number(level) >= 10,
                    new_poin: 9999
                }
            });
        }

        // Cek apakah level ini sudah pernah dikerjakan hari ini
        const { data: existingLog } = await supabase
            .from('daily_challenge_logs')
            .select('*')
            .eq('student_id', student_id)
            .eq('challenge_date', today)
            .eq('level', Number(level))
            .maybeSingle();

        const isAlreadyRewarded = !!existingLog;

        let finalReward = isAlreadyRewarded ? 0 : totalReward;
        let finalBaseReward = isAlreadyRewarded ? 0 : baseReward;
        let finalComboReward = isAlreadyRewarded ? 0 : comboReward;

        if (!isAlreadyRewarded) {
            const { data: student, error: studentErr } = await supabase
                .from('students')
                .select('poin')
                .eq('id', student_id)
                .single();

            if (studentErr || !student) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Siswa tidak ditemukan.'
                });
            }

            const newPoin = Number(student.poin || 0) + finalReward;

            const { error: updateCoinErr } = await supabase
                .from('students')
                .update({ poin: newPoin })
                .eq('id', student_id);

            if (updateCoinErr) throw updateCoinErr;

            await supabase.from('daily_challenge_logs').insert([{
                student_id,
                challenge_date: today,
                level: Number(level),
                subject: sentence.subject,
                sentence_id,
                typed_text,
                is_correct: true,
                base_reward: finalBaseReward,
                combo_reward: finalComboReward,
                total_reward: finalReward,
                time_taken_seconds: Number(time_taken_seconds || 0),
                is_rewarded: true
            }]);

            const { data: progress } = await supabase
                .from('daily_challenge_progress')
                .select('*')
                .eq('student_id', student_id)
                .eq('challenge_date', today)
                .maybeSingle();

            const oldCompleted = progress?.completed_levels || [];
            const completedSet = new Set([...oldCompleted, Number(level)]);
            const completedLevels = Array.from(completedSet).sort((a, b) => a - b);
            const nextLevel = Number(level) < 10 ? Number(level) + 1 : 10;

            await supabase
                .from('daily_challenge_progress')
                .upsert({
                    student_id,
                    challenge_date: today,
                    current_level: nextLevel,
                    completed_levels: completedLevels,
                    total_coins_earned: Number(progress?.total_coins_earned || 0) + finalReward,
                    total_combo_earned: Number(progress?.total_combo_earned || 0) + finalComboReward,
                    last_played_at: new Date().toISOString()
                }, {
                    onConflict: 'student_id,challenge_date'
                });

            return res.status(200).json({
                status: 'success',
                data: {
                    is_rewarded: true,
                    base_reward: finalBaseReward,
                    combo_reward: finalComboReward,
                    total_reward: finalReward,
                    next_level: nextLevel,
                    is_daily_completed: Number(level) >= 10,
                    new_poin: newPoin
                }
            });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                is_rewarded: false,
                base_reward: 0,
                combo_reward: 0,
                total_reward: 0,
                next_level: Number(level) < 10 ? Number(level) + 1 : 10,
                is_daily_completed: Number(level) >= 10,
                new_poin: null,
                message: 'Level ini sudah pernah dimainkan hari ini, jadi tidak mendapat koin lagi.'
            }
        });

    } catch (error) {
        console.error('Submit Daily Challenge Level Error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal submit daily challenge.'
        });
    }
};

const getDailyChallengeSentence = async (req, res) => {
    try {
        const { level = 1 } = req.query;
        const lvl = Number(level);

        const { data, error } = await supabase
            .from('daily_challenge_sentences')
            .select('id, subject, sentence')
            .eq('is_active', true)
            .lte('level_min', lvl)
            .gte('level_max', lvl);

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Belum ada kalimat untuk level ini.'
            });
        }

        const randomItem = data[Math.floor(Math.random() * data.length)];

        return res.status(200).json({
            status: 'success',
            data: randomItem
        });

    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Gagal mengambil kalimat challenge.'
        });
    }
};

const getComboMultiplier = (timeTakenSeconds) => {
    if (timeTakenSeconds <= 10) return 4; // Dibawah 10 detik = Koin x4
    if (timeTakenSeconds <= 20) return 3; // Dibawah 20 detik = Koin x3
    if (timeTakenSeconds <= 30) return 2; // Dibawah 30 detik = Koin x2
    return 1; // Santai (Lebih dari 30 detik) = Koin x1 (Tidak dikali/Normal)
};

module.exports = {
    getDailyChallengeState,
    submitDailyChallengeLevel,
    getDailyChallengeSentence,
    getComboMultiplier
};

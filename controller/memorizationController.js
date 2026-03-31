const supabase = require('../config/supabaseClient');

// ============================================================
// KAMUS DATA JUZ AMMA (SSOT — sama persis dengan frontend)
// Urutan: An-Naba' (id=1) → An-Nas (id=37)
// ============================================================
const JUZ_AMMA = [
  { id:1,  name:"An-Naba'",    ayahs:40 },
  { id:2,  name:"An-Nazi'at",  ayahs:46 },
  { id:3,  name:"Abasa",       ayahs:42 },
  { id:4,  name:"At-Takwir",   ayahs:29 },
  { id:5,  name:"Al-Infitar",  ayahs:19 },
  { id:6,  name:"Al-Mutaffifin", ayahs:36 },
  { id:7,  name:"Al-Insyiqaq", ayahs:25 },
  { id:8,  name:"Al-Buruj",    ayahs:22 },
  { id:9,  name:"At-Tariq",    ayahs:17 },
  { id:10, name:"Al-A'la",     ayahs:19 },
  { id:11, name:"Al-Gasyiyah", ayahs:26 },
  { id:12, name:"Al-Fajr",     ayahs:30 },
  { id:13, name:"Al-Balad",    ayahs:20 },
  { id:14, name:"Asy-Syams",   ayahs:15 },
  { id:15, name:"Al-Lail",     ayahs:21 },
  { id:16, name:"Ad-Duha",     ayahs:11 },
  { id:17, name:"Al-Insyirah", ayahs:8  },
  { id:18, name:"At-Tin",      ayahs:8  },
  { id:19, name:"Al-'Alaq",    ayahs:19 },
  { id:20, name:"Al-Qadr",     ayahs:5  },
  { id:21, name:"Al-Bayyinah", ayahs:8  },
  { id:22, name:"Az-Zalzalah", ayahs:8  },
  { id:23, name:"Al-'Adiyat",  ayahs:11 },
  { id:24, name:"Al-Qari'ah",  ayahs:11 },
  { id:25, name:"At-Takasur",  ayahs:8  },
  { id:26, name:"Al-'Asr",     ayahs:3  },
  { id:27, name:"Al-Humazah",  ayahs:9  },
  { id:28, name:"Al-Fil",      ayahs:5  },
  { id:29, name:"Quraisy",     ayahs:4  },
  { id:30, name:"Al-Ma'un",    ayahs:7  },
  { id:31, name:"Al-Kausar",   ayahs:3  },
  { id:32, name:"Al-Kafirun",  ayahs:6  },
  { id:33, name:"An-Nasr",     ayahs:3  },
  { id:34, name:"Al-Masad",    ayahs:5  },
  { id:35, name:"Al-Ikhlas",   ayahs:4  },
  { id:36, name:"Al-Falaq",    ayahs:5  },
  { id:37, name:"An-Nas",      ayahs:6  },
];

const getSurah = (id) => JUZ_AMMA.find(s => s.id === id) || null;

// ============================================================
// POST /api/memorization
// Body: { student_id, added_ayahs }
//   added_ayahs > 0  → maju (setor hafalan)
//   added_ayahs < 0  → mundur (koreksi lupa)
//
// Logika Auto-Promote / Auto-Demote:
//   MAJU  : jika current_ayah + added >= total_ayat → naik surat
//   MUNDUR: jika current_ayah + added <= 0         → turun surat
// ============================================================
const logMemorization = async (req, res) => {
    try {
        const { student_id, added_ayahs } = req.body;

        if (!student_id || added_ayahs === undefined || added_ayahs === 0) {
            return res.status(400).json({ status: 'error', message: 'student_id dan added_ayahs (bukan 0) wajib diisi.' });
        }

        // 1. Ambil checkpoint siswa saat ini
        const { data: student, error: stdErr } = await supabase
            .from('students')
            .select('id, name, current_surah_id, current_ayah')
            .eq('id', student_id)
            .single();

        if (stdErr || !student) throw new Error('Siswa tidak ditemukan.');
        if (student.current_surah_id === null) {
            return res.status(400).json({ status: 'error', message: 'Onboarding belum dilakukan. Set posisi awal terlebih dahulu.' });
        }

        let surahId  = student.current_surah_id;
        let ayah     = student.current_ayah;
        let surah    = getSurah(surahId);
        if (!surah) throw new Error(`Surat id=${surahId} tidak ditemukan di kamus.`);

        const prevSurahName = surah.name;
        let promoted  = false; // naik surat
        let demoted   = false; // turun surat
        let nextSurahName = null;

        // 2. Hitung posisi baru
        let newAyah   = ayah + added_ayahs;
        let newSurahId = surahId;

        // ── MAJU ──────────────────────────────────────────────
        if (added_ayahs > 0) {
            // Validasi: tidak boleh maju melebihi sisa ayat saat ini
            // (frontend sudah disable tombolnya, ini safety net backend)
            const maxSetor = surah.ayahs - ayah;
            if (added_ayahs > maxSetor) {
                return res.status(400).json({
                    status: 'error',
                    message: `Maksimal setor ${maxSetor} ayat untuk surat ${surah.name} (sisa ${maxSetor} ayat).`
                });
            }

            if (newAyah >= surah.ayahs) {
                // Tamat surat ini
                const nextSurah = getSurah(surahId + 1);
                if (nextSurah) {
                    // Naik ke surat berikutnya, mulai dari ayat 0
                    newSurahId    = nextSurah.id;
                    newAyah       = 0;
                    promoted      = true;
                    nextSurahName = nextSurah.name;
                } else {
                    // Sudah khatam Juz Amma seluruhnya
                    newSurahId    = surahId;
                    newAyah       = surah.ayahs; // tetap di ujung
                    promoted      = true;
                    nextSurahName = 'KHATAM JUZ AMMA 🎉';
                }
            }
        }

        // ── MUNDUR ────────────────────────────────────────────
        if (added_ayahs < 0) {
            if (newAyah <= 0) {
                // Perlu turun ke surat sebelumnya
                const prevSurah = getSurah(surahId - 1);
                if (prevSurah) {
                    newSurahId = prevSurah.id;
                    // Posisi = total ayat surat sebelumnya + sisa negatif
                    // Contoh: mundur 3 dari ayat 1 di surat X
                    //   newAyah = 1 - 3 = -2  → posisi di surat prev = prevSurah.ayahs - 2
                    newAyah = prevSurah.ayahs + newAyah; // newAyah sudah negatif
                    if (newAyah < 0) newAyah = 0; // batas bawah ayat 0
                    demoted = true;
                    nextSurahName = prevSurah.name;
                } else {
                    // Sudah di surat pertama, tidak bisa turun lagi
                    newSurahId = surahId;
                    newAyah    = 0;
                    demoted    = true;
                    nextSurahName = surah.name;
                }
            }
        }

        // 3. Update checkpoint siswa
        const { error: updateErr } = await supabase
            .from('students')
            .update({ current_surah_id: newSurahId, current_ayah: newAyah })
            .eq('id', student_id);

        if (updateErr) throw updateErr;

        // 4. Catat ke memorization_logs (hanya untuk setor maju, bukan mundur)
        //    Mundur dicatat sebagai koreksi dengan added_ayahs negatif
        const todayDate  = new Date().toISOString().split('T')[0];
        const logSurah   = getSurah(surahId); // surat tempat setor terjadi
        const logEndAyah = added_ayahs > 0
            ? Math.min(ayah + added_ayahs, logSurah.ayahs)
            : newAyah;

        // Upsert: jika hari ini sudah ada log untuk surat yg sama, update rentang ayatnya
        const { error: logErr } = await supabase
            .from('memorization_logs')
            .upsert(
                {
                    student_id,
                    date:        todayDate,
                    surah_name:  logSurah.name,
                    start_ayah:  added_ayahs > 0 ? ayah + 1 : logEndAyah,
                    end_ayah:    logEndAyah,
                    added_ayahs: added_ayahs,
                },
                { onConflict: 'student_id,date,surah_name' }
            );

        if (logErr) {
            // Log gagal tidak fatal — checkpoint tetap tersimpan
            console.error('Memorization log upsert error (non-fatal):', logErr.message);
        }

        // 5. Response
        res.status(200).json({
            status: 'success',
            data: {
                current_surah_id: newSurahId,
                current_ayah:     newAyah,
                promoted,
                demoted,
                prev_surah:       prevSurahName,
                next_surah:       nextSurahName,
            }
        });

    } catch (error) {
        console.error('logMemorization Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// ============================================================
// POST /api/students/:id/checkpoint
// Onboarding pertama kali — set posisi awal siswa
// Body: { current_surah_id, current_ayah }
// ============================================================
const setCheckpoint = async (req, res) => {
    try {
        const { id } = req.params;
        const { current_surah_id, current_ayah } = req.body;

        if (!current_surah_id || current_ayah === undefined) {
            return res.status(400).json({ status: 'error', message: 'current_surah_id dan current_ayah wajib diisi.' });
        }

        const surah = getSurah(parseInt(current_surah_id));
        if (!surah) {
            return res.status(400).json({ status: 'error', message: 'Surat tidak valid.' });
        }
        if (current_ayah < 0 || current_ayah > surah.ayahs) {
            return res.status(400).json({ status: 'error', message: `Ayat harus antara 0–${surah.ayahs} untuk ${surah.name}.` });
        }

        const { data, error } = await supabase
            .from('students')
            .update({ current_surah_id: parseInt(current_surah_id), current_ayah: parseInt(current_ayah) })
            .eq('id', id)
            .select('current_surah_id, current_ayah')
            .single();

        if (error) throw error;

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        console.error('setCheckpoint Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// ============================================================
// PUT /api/students/:id/checkpoint
// Teacher Override — edit manual posisi kapan saja
// Body: { current_surah_id, current_ayah }
// (Logic sama dengan setCheckpoint, endpoint berbeda untuk
//  kejelasan semantik: POST = onboarding, PUT = override)
// ============================================================
const updateCheckpoint = async (req, res) => {
    try {
        const { id } = req.params;
        const { current_surah_id, current_ayah } = req.body;

        if (!current_surah_id || current_ayah === undefined) {
            return res.status(400).json({ status: 'error', message: 'current_surah_id dan current_ayah wajib diisi.' });
        }

        const surah = getSurah(parseInt(current_surah_id));
        if (!surah) {
            return res.status(400).json({ status: 'error', message: 'Surat tidak valid.' });
        }
        if (current_ayah < 0 || current_ayah > surah.ayahs) {
            return res.status(400).json({ status: 'error', message: `Ayat harus antara 0–${surah.ayahs} untuk ${surah.name}.` });
        }

        const { data, error } = await supabase
            .from('students')
            .update({ current_surah_id: parseInt(current_surah_id), current_ayah: parseInt(current_ayah) })
            .eq('id', id)
            .select('current_surah_id, current_ayah')
            .single();

        if (error) throw error;

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        console.error('updateCheckpoint Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// ============================================================
// DELETE /api/students/:id/checkpoint
// Reset Onboarding — kembalikan ke null agar onboarding ulang
// ============================================================
const resetCheckpoint = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('students')
            .update({ current_surah_id: null, current_ayah: 0 })
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({ status: 'success', message: 'Data hafalan berhasil direset.' });
    } catch (error) {
        console.error('resetCheckpoint Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// ============================================================
// GET /api/students/:id/memorization-logs
// Ambil riwayat log hafalan siswa (opsional, untuk history)
// ============================================================
const getMemorizationLogs = async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 30 } = req.query;

        const { data, error } = await supabase
            .from('memorization_logs')
            .select('*')
            .eq('student_id', id)
            .order('date', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;

        res.status(200).json({ status: 'success', data: data || [] });
    } catch (error) {
        console.error('getMemorizationLogs Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    logMemorization,
    setCheckpoint,
    updateCheckpoint,
    resetCheckpoint,
    getMemorizationLogs,
};
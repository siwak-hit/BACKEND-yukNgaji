const studentModel = require('../model/studentModel');
const supabase = require('../config/supabaseClient');
const bcrypt = require('bcrypt');


// POST /students
const addStudent = async (req, res) => {
    try {
        const { name, grade, age } = req.body;
        const teacherUsername = req.user.username;

        if (!name || !grade) {
            return res.status(400).json({ status: "error", message: "Nama dan kelas wajib diisi" });
        }

        const newStudent = await studentModel.createStudent({
            name,
            grade,
            age,
            created_by: teacherUsername
        });

        res.status(201).json({ status: "success", message: "Siswa berhasil ditambahkan", data: newStudent });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /students
const getAllStudents = async (req, res) => {
    try {
        const teacherUsername = req.user.username;
        const students = await studentModel.getStudentsByTeacher(teacherUsername);

        res.status(200).json({ status: "success", data: students });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /students/:id
const getStudent = async (req, res) => {
    try {
        const student = await studentModel.getStudentById(req.params.id, req.user.username);

        if (!student) {
            return res.status(404).json({ status: "error", message: "Siswa tidak ditemukan atau Anda tidak memiliki akses" });
        }

        // --- LAZY RESET PERISAI (MIDNIGHT RESET) ---
        if (student.is_shield_active && student.shield_activated_at) {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
            const shieldDateStr = new Date(student.shield_activated_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

            // Jika tanggal aktifnya bukan hari ini (sudah ganti hari)
            if (todayStr !== shieldDateStr) {
                student.is_shield_active = false;
                student.shield_activated_at = null;
                // Matikan di database
                await supabase.from('students').update({
                    is_shield_active: false,
                    shield_activated_at: null
                }).eq('id', student.id);
            }
        }
        // -------------------------------------------

        res.status(200).json({ status: "success", data: student });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// PUT /students/:id
const updateStudentInfo = async (req, res) => {
    try {
        const { name, grade, age } = req.body;

        const existingStudent = await studentModel.getStudentById(req.params.id, req.user.username);
        if (!existingStudent) {
            return res.status(404).json({ status: "error", message: "Siswa tidak ditemukan atau Anda tidak memiliki akses" });
        }

        const updatedStudent = await studentModel.updateStudent(req.params.id, req.user.username, { name, grade, age });
        res.status(200).json({ status: "success", message: "Data siswa diperbarui", data: updatedStudent });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// DELETE /students/:id
const removeStudent = async (req, res) => {
    try {
        const existingStudent = await studentModel.getStudentById(req.params.id, req.user.username);
        if (!existingStudent) {
            return res.status(404).json({ status: "error", message: "Siswa tidak ditemukan atau Anda tidak memiliki akses" });
        }

        await studentModel.deleteStudent(req.params.id, req.user.username);
        res.status(200).json({ status: "success", message: "Siswa berhasil dihapus" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /api/students/:id/consultations
const getStudentConsultations = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('consultations')
            .select('*')
            .eq('student_id', id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase Error (Consultations):", error.message);
            throw error;
        }

        res.status(200).json({
            status: "success",
            data: data || []
        });
    } catch (error) {
        console.error("Get Consultations Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /api/students/:id/raports
const getStudentRaports = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('raports')
            .select('*')
            .eq('student_id', id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json({
            status: "success",
            data: data || []
        });
    } catch (error) {
        console.error("Get Raports Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// GET /api/students/:id/attendance
const getStudentAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const username = req.user.username;

        const { data: attendances, error } = await supabase
            .from('attendances')
            .select('date, present_students')
            .eq('created_by', username);

        if (error) throw error;

        let hadir = 0;
        let izin = 0;
        let alpa = 0;
        let todayStatus = null;
        const izinDates = [];
        const alpaDates = [];

        const mandatoryDays = [1, 2, 3, 5];

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        attendances.forEach(att => {
            const studentAtt = att.present_students[id];

            if (!studentAtt) return;

            const status = studentAtt.status;
            const dow = new Date(att.date).getDay();
            const isMandatory = mandatoryDays.includes(dow);

            if (att.date === todayStr) {
                todayStatus = status;
            }

            if (status === 'hadir') {
                hadir++;
            } else if (isMandatory) {
                if (status.startsWith('izin')) {
                    izin++;
                    izinDates.push({ date: att.date, status });
                } else if (status === 'alpa') {
                    alpa++;
                    alpaDates.push({ date: att.date, status });
                }
            }
        });

        const totalValidDays = hadir + izin + alpa;
        let performance = "100%";

        if (totalValidDays > 0) {
            performance = Math.round((hadir / totalValidDays) * 100) + "%";
        }

        res.status(200).json({
            status: "success",
            data: {
                stats: { hadir, izin, alpa },
                detail: { izinDates, alpaDates },
                todayStatus,
                performance
            }
        });

    } catch (error) {
        console.error("Get Student Attendance Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

const toggleInfaqCan = async (req, res) => {
    try {
        const { id } = req.params;
        const { has_infaq_can } = req.body;

        let updateData = { has_infaq_can };
        if (has_infaq_can) {
            updateData.last_can_received_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('students')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.status(200).json({ status: "success", data });
    } catch (error) {
        console.error("Toggle Kaleng Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};


const getStudentLagStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const subjects = ['tajwid', 'fiqih', 'tauhid'];

        // 1. Max week kelas per mapel (dari tabel questions)
        const { data: classWeekData, error: cwErr } = await supabase
            .from('questions')
            .select('subject, week')
            .in('subject', subjects);

        if (cwErr) throw cwErr;

        // 2. Semua hasil anak untuk mapel-mapel ini
        const { data: studentWeekData, error: swErr } = await supabase
            .from('onboarding_results')
            .select('subject, week')
            .eq('student_id', id)
            .in('subject', subjects);

        if (swErr) throw swErr;

        const result = {};

        for (const subject of subjects) {
            // Max week kelas untuk mapel ini
            const classWeeks = classWeekData
                .filter(q => q.subject === subject)
                .map(q => q.week);
            const classWeek = classWeeks.length > 0 ? Math.max(...classWeeks) : 0;

            // Max week yang sudah dikerjakan anak
            const studentWeeks = studentWeekData
                .filter(r => r.subject === subject)
                .map(r => r.week);
            const studentWeek = studentWeeks.length > 0 ? Math.max(...studentWeeks) : 0;

            const isLagging = classWeek > 0 && studentWeek < classWeek;

            // Hitung week mana saja yang terlewat (belum dikerjakan anak)
            const doneWeeks = new Set(studentWeeks);
            const missedWeeks = [];
            for (let w = 1; w <= classWeek; w++) {
                if (!doneWeeks.has(w)) missedWeeks.push(w);
            }

            result[subject] = {
                classWeek,
                studentWeek,
                isLagging,
                missedWeeks
            };
        }

        res.status(200).json({ status: "success", data: result });
    } catch (error) {
        console.error("Get Student Lag Status Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// ============================================================
// FITUR GALERI & HAPUS FOTO
// ============================================================

// 1. Ambil Foto Gaya Bebas
const getStudentGallery = async (req, res) => {
    try {
        const { data, error } = await supabase.from('student_gallery').select('*').eq('student_id', req.params.id).order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ status: "success", data: data || [] });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 2. Upload Foto Gaya Bebas dari PhotoBooth (Menggunakan Multer Buffer)
const uploadGalleryPhoto = async (req, res) => {
    try {
        const { id } = req.params;

        // Tangkap file dari multer (req.file)
        if (!req.file) return res.status(400).json({ message: "Foto kosong" });

        const buffer = req.file.buffer;
        const fileName = `gallery_${id}_${Date.now()}.jpg`;

        // Upload ke bucket 'gallery_captures' Supabase
        const { error: uploadError } = await supabase.storage.from('gallery_captures').upload(fileName, buffer, {
            contentType: req.file.mimetype,
            upsert: true
        });
        if (uploadError) throw uploadError;

        // Ambil Public URL
        const { data: publicUrlData } = supabase.storage.from('gallery_captures').getPublicUrl(fileName);
        const capture_url = publicUrlData.publicUrl;

        // Simpan link-nya ke database
        await supabase.from('student_gallery').insert([{ student_id: id, image_url: capture_url }]);

        res.status(200).json({ status: "success", message: "Foto galeri tersimpan" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 3. Hapus Foto Sakti (Storage + DB) dengan Password Admin Dinamis
const deleteStudentPhoto = async (req, res) => {
    try {
        const { id, type, url, password } = req.body;
        const username = req.user.username; // Mengambil username guru yang sedang login dari token

        // 1. Ambil data password guru dari tabel 'users'
        const { data: adminData, error: adminErr } = await supabase
            .from('users')
            .select('password')
            .eq('username', username)
            .single();

        if (adminErr || !adminData) {
            return res.status(403).json({ status: "error", message: "Akun admin tidak ditemukan!" });
        }

        // 2. Bandingkan kecocokan password
        let isMatch = false;
        // Cek apakah password di DB menggunakan enkripsi bcrypt (biasanya diawali $2b$ atau $2a$)
        if (adminData.password.startsWith('$2')) {
            isMatch = await bcrypt.compare(password, adminData.password);
        } else {
            // Fallback: Jika di database password Ustadz masih berupa teks biasa (belum di-hash)
            isMatch = (password === adminData.password);
        }

        if (!isMatch) {
            return res.status(403).json({ status: "error", message: "Password Admin Salah!" });
        }

        // A. HAPUS DARI STORAGE SUPABASE (Otomatis deteksi bucket dari URL)
        try {
            const parts = url.split('/public/');
            if (parts.length === 2) {
                const pathParts = parts[1].split('/');
                const bucket = pathParts[0];
                const filePath = pathParts.slice(1).join('/');
                await supabase.storage.from(bucket).remove([filePath]);
            }
        } catch (e) {
            console.log("Storage delete error (diabaikan):", e.message);
        }

        // B. HAPUS/PUTIHKAN DARI DATABASE SESUAI SUMBERNYA
        if (type === 'consultation') {
            await supabase.from('consultations').update({ image_url: null }).eq('id', id);
        } else if (type === 'exam') {
            await supabase.from('exam_results').update({ capture_url: null }).eq('id', id);
        } else if (type === 'gallery') {
            await supabase.from('student_gallery').delete().eq('id', id);
        }

        res.status(200).json({ status: "success", message: "Foto berhasil dimusnahkan" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 4. Radar Pencari Foto Terbaru untuk Raport
const getLatestStudentPhoto = async (req, res) => {
    try {
        const studentId = req.params.id;

        // Tarik 1 foto terbaru dari masing-masing 3 sumber
        const [galRes, exmRes, cnsRes] = await Promise.all([
            supabase.from('student_gallery').select('image_url, created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1),
            supabase.from('exam_results').select('capture_url, created_at').eq('student_id', studentId).not('capture_url', 'is', null).order('created_at', { ascending: false }).limit(1),
            supabase.from('consultations').select('image_url, created_at').eq('student_id', studentId).not('image_url', 'is', null).order('created_at', { ascending: false }).limit(1)
        ]);

        let allPhotos = [];

        if (galRes.data && galRes.data.length > 0) allPhotos.push({ url: galRes.data[0].image_url, date: new Date(galRes.data[0].created_at) });
        if (exmRes.data && exmRes.data.length > 0) allPhotos.push({ url: exmRes.data[0].capture_url, date: new Date(exmRes.data[0].created_at) });
        if (cnsRes.data && cnsRes.data.length > 0) allPhotos.push({ url: cnsRes.data[0].image_url, date: new Date(cnsRes.data[0].created_at) });

        // Jika anak ini sama sekali belum pernah difoto
        if (allPhotos.length === 0) {
            return res.status(200).json({ status: "success", data: null });
        }

        // Urutkan, ambil yang paling baru (paling update)
        allPhotos.sort((a, b) => b.date - a.date);

        // Kirim 1 link foto pemenangnya
        res.status(200).json({ status: "success", data: allPhotos[0].url });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getStudentsWithStats = async (req, res) => {
    try {
        const username = req.user.username;

        // 1. Ambil data dasar murid
        const { data: students, error: err1 } = await supabase.from('students')
            .select('id, name, grade').eq('created_by', username);
        if (err1) throw err1;
        if (!students || students.length === 0) return res.status(200).json({ status: "success", data: [] });

        const studentIds = students.map(s => s.id);

        // 2. Ambil SEMUA nilai TUGAS (onboarding)
        const { data: progress } = await supabase.from('onboarding_results')
            .select('student_id, subject, score, week')
            .in('student_id', studentIds);

        // [BARU] 3. Ambil SEMUA data UJIAN AKHIR
        const { data: exams } = await supabase.from('exam_results')
            .select('student_id, subject')
            .in('student_id', studentIds);

        // 4. Ambil SEMUA absen sekaligus
        const { data: attendances } = await supabase.from('attendances')
            .select('date, present_students').eq('created_by', username);

        // 5. Ambil SEMUA foto konsultasi
        const { data: photos } = await supabase.from('consultations')
            .select('student_id, image_url').not('image_url', 'is', null).in('student_id', studentIds);

        // 6. Olah & Gabungkan di memory server
        const enriched = students.map(s => {
            const sProg = (progress || []).filter(p => p.student_id === s.id);
            const tajwid = sProg.filter(p => p.subject === 'tajwid');
            const fiqih = sProg.filter(p => p.subject === 'fiqih');
            const tauhid = sProg.filter(p => p.subject === 'tauhid');

            const t_avg = tajwid.length ? Math.round(tajwid.reduce((a,b)=>a+b.score,0)/tajwid.length) : 0;
            const f_avg = fiqih.length ? Math.round(fiqih.reduce((a,b)=>a+b.score,0)/fiqih.length) : 0;
            const th_avg = tauhid.length ? Math.round(tauhid.reduce((a,b)=>a+b.score,0)/tauhid.length) : 0;
            const finalScore = Math.round((t_avg + f_avg + th_avg) / 3) || 0;

            // [BARU] Cek apakah murid ini sudah ngerjain ke-3 ujian akhir
            const sExams = (exams || []).filter(e => e.student_id === s.id);
            const is_exam_completed =
                sExams.some(e => e.subject === 'tajwid') &&
                sExams.some(e => e.subject === 'fiqih') &&
                sExams.some(e => e.subject === 'tauhid');

            let hadir = 0;
            (attendances || []).forEach(att => {
                if (att.present_students && att.present_students[s.id] && att.present_students[s.id].status === 'hadir') hadir++;
            });

            const latestPhoto = (photos || []).find(p => p.student_id === s.id)?.image_url || null;
            const completed_tasks = sProg.map(p => ({ subject: p.subject, week: p.week }));

            return {
                ...s,
                t_avg,
                f_avg,
                th_avg,
                finalScore,
                hadir,
                photo_url: latestPhoto,
                completed_tasks,
                is_exam_completed // <--- Flag ini yang akan dibaca Frontend
            };
        });

        res.status(200).json({ status: "success", data: enriched });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// ===============================================
// FUNGSI BARU: AMBIL RIWAYAT POIN & GAMIFIKASI
// ===============================================
const getPointHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 10, days = 'all' } = req.query;

        let query = supabase.from('gamification_logs').select('*').or(`actor_id.eq.${id},target_id.eq.${id}`);
        if (days !== 'all') {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - parseInt(days));
            query = query.gte('created_at', dateLimit.toISOString());
        }

        const { data: logs, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const allStudents = await studentModel.getStudentsByTeacher(req.user.username);
        const history = [];

        if (logs) {
            logs.forEach(log => {
                let title = ""; let isPositive = true; let pts = ""; let icon = "💰";
                const itemDate = new Date(log.created_at);

                // MAPPING DESKRIPSI BERDASARKAN TIPE AKSI
                // MAPPING DESKRIPSI BERDASARKAN TIPE AKSI
                if (log.action_type === 'beli_item' || log.action_type.startsWith('beli_item')) {
                    let itemName = "Item Toko";

                    // [HACK]: Tebak nama item dari jumlah poin yang terpotong (karena harga tiap item unik)
                    const price = Math.abs(log.point_change);
                    if (price === 50) itemName = 'Sihir Double Poin ✨';
                    else if (price === 75) itemName = 'Perisai 🛡️';
                    else if (price === 100) itemName = 'Pedang Serang ⚔️';
                    else if (price === 150) itemName = 'Extra Life 💖';

                    // Jaga-jaga kalau lu tetep pake format action_type: 'beli_item_perisai' di data baru
                    if (log.action_type.includes('perisai')) itemName = 'Perisai 🛡️';
                    else if (log.action_type.includes('serang')) itemName = 'Pedang Serang ⚔️';
                    else if (log.action_type.includes('double_score')) itemName = 'Sihir Double Poin ✨';
                    else if (log.action_type.includes('extra_life')) itemName = 'Extra Life 💖';

                    title = `Kamu membeli item <strong>${itemName}</strong>`;
                    isPositive = false;
                    pts = `-${price}`;
                    icon = '🛍️';
                }
                else if (log.action_type === 'serang_berhasil') {
                    if (log.actor_id === id) {
                        const t = allStudents?.find(s => s.id === log.target_id);
                        title = `Pedang Tajam! Kamu berhasil mencuri poin dari <strong>${t ? t.name : 'Teman'}</strong> ⚔️`;
                        isPositive = true; pts = `+${log.point_change}`; icon = '🔥';
                    } else {
                        const a = allStudents?.find(s => s.id === log.actor_id);
                        title = `Aduh! Poinmu diambil <strong>${a ? a.name : 'Seseorang'}</strong> sebanyak <strong>${log.point_change}</strong>! 😱`;
                        isPositive = false; pts = `-${log.point_change}`; icon = '💔';
                    }
                }
                else if (log.action_type === 'serang_ditahan') {
                    const a = allStudents?.find(s => s.id === log.actor_id);
                    title = `Perisai Aktif! Serangan <strong>${a ? a.name : 'Seseorang'}</strong> berhasil ditahan. Aman! 🛡️`;
                    isPositive = true; pts = "0"; icon = '🛡️';
                }
                else if (log.action_type === 'tugas_selesai' || log.action_type === 'onboarding_result') {
                    const subject = log.metadata?.subject || "Tugas";
                    const week = log.metadata?.week || "?";
                    title = `Hore! Kamu dapat poin dari tugas <strong>${subject} Mg-${week}</strong>`;
                    isPositive = true; pts = `+${log.point_change}`; icon = '⭐';
                }
                else if (log.action_type === 'bonus_welcome') {
                    title = `Bonus modal awal khusus buat kamu! 🎁`;
                    isPositive = true; pts = `+${log.point_change}`; icon = '🎁';
                }

                if (title) {
                    history.push({ id: log.id, date: itemDate, title, points: pts, isPositive, icon });
                }
            });
        }

        res.status(200).json({ status: "success", data: history.slice(0, parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const getSatpamLogs = async (req, res) => {
    try {
        const { id } = req.params;
        // [FIX] Tambahkan subject dan week di dalam select!
        const { data, error } = await supabase
            .from('satpam_logs')
            .select('photo_url, subject, week')
            .eq('student_id', id);

        if (error) throw error;
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// ===============================================
// FUNGSI BARU: AMBIL FOTO DARI UJIAN
// ===============================================
const getExamCaptures = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('exam_results')
            .select('capture_url, created_at')
            .eq('student_id', id)
            .not('capture_url', 'is', null) // Hanya ambil yang ada fotonya
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json({ status: 'success', data: data || [] });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    addStudent,
    getAllStudents,
    getStudent,
    updateStudentInfo,
    removeStudent,
    getStudentRaports,
    getStudentConsultations,
    getStudentAttendance,
    toggleInfaqCan,
    getStudentLagStatus,
    getStudentGallery,
    uploadGalleryPhoto,
    deleteStudentPhoto,
    getLatestStudentPhoto,
    getStudentsWithStats,
    getPointHistory,
    getSatpamLogs,
    getExamCaptures
};

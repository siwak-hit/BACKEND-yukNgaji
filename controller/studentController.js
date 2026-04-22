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

// 2. Upload Foto Gaya Bebas dari PhotoBooth
const uploadGalleryPhoto = async (req, res) => {
    try {
        const { id } = req.params;
        const { image_base64 } = req.body;
        if (!image_base64) return res.status(400).json({ message: "Foto kosong" });

        const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `gallery_${id}_${Date.now()}.jpg`;

        // Upload ke bucket 'gallery_captures'
        const { error: uploadError } = await supabase.storage.from('gallery_captures').upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('gallery_captures').getPublicUrl(fileName);
        const capture_url = publicUrlData.publicUrl;

        // Simpan ke database
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
    getLatestStudentPhoto
};
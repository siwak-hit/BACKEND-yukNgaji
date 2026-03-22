const studentModel = require('../model/studentModel');
const supabase = require('../config/supabaseClient');


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
        
        // First check if student exists and belongs to teacher
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
            .order('created_at', { ascending: false }); // Urutkan dari yang terbaru

        if (error) {
            console.error("Supabase Error (Consultations):", error.message);
            throw error;
        }

        res.status(200).json({
            status: "success",
            data: data || [] // Kembalikan array kosong jika belum ada data
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
            .order('created_at', { ascending: false }); // Urutkan dari yang terbaru

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

        // Ambil semua riwayat absensi dari guru ini
        const { data, error } = await supabase
            .from('attendances')
            .select('*')
            .eq('created_by', username)
            .order('date', { ascending: true });

        if (error) throw error;

        let stats = { hadir: 0, izin: 0, alpa: 0 };
        let todayStatus = null; // null = Belum Absen
        
        const jakartaTimeStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
        const todayStr = new Date(jakartaTimeStr).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        data.forEach(record => {
            const isToday = record.date === todayStr;
            let status = 'alpa'; // Default jika record ada tapi nama anak ga di-ceklis

            // Cek kompatibilitas (bisa Array model lama, bisa Object model baru)
            if (Array.isArray(record.present_students)) {
                if (record.present_students.includes(id)) status = 'hadir';
            } else if (record.present_students && record.present_students[id]) {
                status = record.present_students[id].status || 'hadir';
            }

            // Hitung statistik
            if (status === 'hadir') stats.hadir++;
            else if (status.startsWith('izin')) stats.izin++;
            else stats.alpa++; // Termasuk 'alpa' eksplisit maupun tidak diabsen

            // Set status khusus hari ini
            if (isToday) todayStatus = status;
        });

        const total = stats.hadir + stats.izin + stats.alpa;
        const hadirRate = total > 0 ? (stats.hadir / total) * 100 : 0;
        
        let performance = 'Belum Ada Data';
        if (total > 0) {
            if (hadirRate >= 80) performance = 'Sangat Rajin & Disiplin';
            else if (hadirRate >= 60) performance = 'Cukup Baik';
            else performance = 'Kurang Disiplin (Banyak Alpa/Izin)';
        }

        res.status(200).json({
            status: "success",
            data: { stats, todayStatus, performance, total }
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

        // Jika kaleng diberikan (true), catat tanggalnya. Jika dikembalikan (false), biarkan tanggal terakhirnya utuh untuk acuan hitung mundur.
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


module.exports = { 
    addStudent, 
    getAllStudents, 
    getStudent, 
    updateStudentInfo, 
    removeStudent,
    getStudentRaports, 
    getStudentConsultations,
    getStudentAttendance,
    toggleInfaqCan
 };
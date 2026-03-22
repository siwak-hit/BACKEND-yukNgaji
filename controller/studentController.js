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

        // 1. Ambil semua riwayat absensi yang pernah dibuat oleh guru ini
        const { data: attendances, error } = await supabase
            .from('attendances')
            .select('date, present_students')
            .eq('created_by', username);

        if (error) throw error;

        // 2. Siapkan variabel perhitungan
        let hadir = 0;
        let izin = 0;
        let alpa = 0;
        let todayStatus = null;
        
        // Aturan Hari Wajib: 1=Senin, 2=Selasa, 3=Rabu, 5=Jumat. (0, 4, 6 = Sunnah)
        const mandatoryDays = [1, 2, 3, 5]; 
        
        // Ambil tanggal hari ini versi Jakarta (YYYY-MM-DD)
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        // 3. Looping semua data absensi untuk menghitung statistik anak ini
        attendances.forEach(att => {
            const studentAtt = att.present_students[id];
            
            // Jika anak ini tidak ada di daftar absen hari itu, lewati
            if (!studentAtt) return; 

            const status = studentAtt.status;
            // Ambil angka hari dari tanggal absen (0 = Minggu, 1 = Senin, dst)
            const dow = new Date(att.date).getDay();
            const isMandatory = mandatoryDays.includes(dow);

            // Set status hari ini jika tanggalnya cocok
            if (att.date === todayStr) {
                todayStatus = status;
            }

            // --- LOGIKA SUNNAH & WAJIB ---
            if (status === 'hadir') {
                // Jika HADIR, mau hari wajib atau sunnah, TETAP DIHITUNG! (Bonus)
                hadir++;
            } else if (isMandatory) {
                // Jika TIDAK HADIR, HANYA dihitung kalau itu hari WAJIB
                if (status.startsWith('izin')) {
                    izin++;
                } else if (status === 'alpa') {
                    alpa++;
                }
            }
            // Jika statusnya izin/alpa TAPI hari Sunnah, sistem akan mengabaikannya (tidak ditambahkan)
        });

        // 4. Hitung persentase performa kehadiran
        const totalValidDays = hadir + izin + alpa;
        let performance = "100%"; // Default jika belum ada absen
        
        if (totalValidDays > 0) {
            performance = Math.round((hadir / totalValidDays) * 100) + "%";
        }

        res.status(200).json({
            status: "success",
            data: {
                stats: { hadir, izin, alpa },
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
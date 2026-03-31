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

// ============================================================
// GET /api/students/:id/lag-status
//
// BARU: Deteksi apakah anak tertinggal dari kelas.
//
// Logika:
//   1. Ambil max week per mapel di tabel questions
//      → "Current Week Kelas" (berapa pertemuan yang sudah ada soalnya)
//   2. Ambil max week yang sudah dikerjakan anak di onboarding_results
//      → "Student Week"
//   3. Jika Student Week < Current Week Kelas → anak tertinggal
//
// Response:
// {
//   status: "success",
//   data: {
//     tajwid: { classWeek: 7, studentWeek: 5, isLagging: true,  missedWeeks: [6, 7] },
//     fiqih:  { classWeek: 7, studentWeek: 7, isLagging: false, missedWeeks: [] },
//     tauhid: { classWeek: 5, studentWeek: 0, isLagging: true,  missedWeeks: [1,2,3,4,5] },
//   }
// }
// ============================================================
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
    getStudentLagStatus   // BARU
};
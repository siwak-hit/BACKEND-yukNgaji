const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const studentController = require('../controller/studentController');
const onboardingController = require('../controller/onboardingController');
const todoController = require('../controller/todoController');
const { verifyToken } = require('../middleware/authMiddleware');
const { getStudentLagStatus } = require('../controller/studentController');
const {
    logMemorization,
    setCheckpoint,
    updateCheckpoint,
    resetCheckpoint,
    getMemorizationLogs,
    logMurojaah
} = require('../controller/memorizationController');

router.use(verifyToken);

// Core student CRUD
router.get('/stats/enriched', verifyToken, studentController.getStudentsWithStats);
router.post('/', studentController.addStudent);
router.get('/', studentController.getAllStudents);
router.get('/:id', studentController.getStudent);
router.put('/:id', studentController.updateStudentInfo);
router.post('/:id/reset-password', studentController.resetPassword);
router.delete('/:id', studentController.removeStudent);

// New Progress and Todo endpoints
router.get('/:id/progress', onboardingController.getStudentProgress);
router.get('/:id/todos', todoController.getStudentTodos);
router.get('/:id/consultations', studentController.getStudentConsultations);
router.get('/:id/review/:subject/:week', verifyToken, onboardingController.getReviewData);

// Raports & Attendance
router.get('/:id/raports', studentController.getStudentRaports);
router.get('/:id/attendance', studentController.getStudentAttendance);

router.patch('/:id/infaq-can', verifyToken, studentController.toggleInfaqCan);

// Infaq Can Reminder
router.post('/:id/remind-infaq', verifyToken, studentController.sendInfaqReminder);

// Hafalan log
router.post('/:id/memorization', verifyToken, logMemorization);

// Checkpoint student
router.post('/:id/checkpoint',   verifyToken, setCheckpoint);    // onboarding
router.put('/:id/checkpoint',    verifyToken, updateCheckpoint);  // edit manual
router.delete('/:id/checkpoint', verifyToken, resetCheckpoint);   // reset

// [PERBAIKAN KUNCI 1]: Pastikan TIDAK ADA kata "/students" di depan, karena sudah otomatis masuk dari index.js
router.get('/:id/memorization-logs', verifyToken, getMemorizationLogs);

// [PERBAIKAN KUNCI 2]: Pastikan rutenya benar-benar '/:id/lag-status' agar terhubung ke Frontend
router.get('/:id/lag-status', verifyToken, getStudentLagStatus);


router.get('/:id/gallery', verifyToken, studentController.getStudentGallery);
router.post('/:id/upload-photo', verifyToken, upload.single('image'), studentController.uploadGalleryPhoto);
router.post('/gallery/delete-photo', verifyToken, studentController.deleteStudentPhoto);

router.get('/:id/latest-photo', verifyToken, studentController.getLatestStudentPhoto);
// Tambahkan baris ini
router.get('/:id/point-history', verifyToken, studentController.getPointHistory);
router.get('/:id/satpam-logs', studentController.getSatpamLogs);
router.get('/:id/exam-captures', verifyToken, studentController.getExamCaptures);
router.get('/:id/exam-recordings', verifyToken, studentController.getExamRecordings);
router.post('/:id/verify-pin', verifyToken, studentController.verifyStudentPin);
router.put('/:id/attendance', verifyToken, studentController.updateStudentAttendanceStatus);

router.post('/:id/change-password', verifyToken, studentController.changeStudentPassword);

router.post('/:id/murojaah', logMurojaah);
// (Push subscription murid disimpan lewat /api/student/push/subscribe — lihat studentAuthRouter)

module.exports = router;

const express = require('express');
const router = express.Router();
const studentController = require('../controller/studentController');
const onboardingController = require('../controller/onboardingController');
const todoController = require('../controller/todoController');
const authMiddleware = require('../middleware/authMiddleware');
const { getStudentLagStatus } = require('../controller/studentController');
const {
    logMemorization,
    setCheckpoint,
    updateCheckpoint,
    resetCheckpoint,
    getMemorizationLogs,
} = require('../controller/memorizationController');

router.use(authMiddleware);

// Core student CRUD
router.post('/', studentController.addStudent);
router.get('/', studentController.getAllStudents);
router.get('/:id', studentController.getStudent);
router.put('/:id', studentController.updateStudentInfo);
router.delete('/:id', studentController.removeStudent);

// New Progress and Todo endpoints
router.get('/:id/progress', onboardingController.getStudentProgress);
router.get('/:id/todos', todoController.getStudentTodos);
router.get('/:id/consultations', studentController.getStudentConsultations);
router.get('/:id/review/:subject/:week', authMiddleware, onboardingController.getReviewData);

// Raports & Attendance
router.get('/:id/raports', studentController.getStudentRaports);
router.get('/:id/attendance', studentController.getStudentAttendance);

router.patch('/:id/infaq-can', authMiddleware, studentController.toggleInfaqCan);

// Hafalan log
router.post('/:id/memorization', authMiddleware, logMemorization);

// Checkpoint student
router.post('/:id/checkpoint',   authMiddleware, setCheckpoint);    // onboarding
router.put('/:id/checkpoint',    authMiddleware, updateCheckpoint);  // edit manual
router.delete('/:id/checkpoint', authMiddleware, resetCheckpoint);   // reset

// [PERBAIKAN KUNCI 1]: Pastikan TIDAK ADA kata "/students" di depan, karena sudah otomatis masuk dari index.js
router.get('/:id/memorization-logs', authMiddleware, getMemorizationLogs);

// [PERBAIKAN KUNCI 2]: Pastikan rutenya benar-benar '/:id/lag-status' agar terhubung ke Frontend
router.get('/:id/lag-status', authMiddleware, getStudentLagStatus);

module.exports = router;
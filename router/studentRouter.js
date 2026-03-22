const express = require('express');
const router = express.Router();
const studentController = require('../controller/studentController');
const onboardingController = require('../controller/onboardingController');
const todoController = require('../controller/todoController');
const authMiddleware = require('../middleware/authMiddleware');

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

// Tambahkan di bawah rute consultations yang kemarin dibuat
router.get('/:id/raports', studentController.getStudentRaports);
router.get('/:id/attendance', studentController.getStudentAttendance);

router.patch('/:id/infaq-can', authMiddleware, studentController.toggleInfaqCan);

module.exports = router;
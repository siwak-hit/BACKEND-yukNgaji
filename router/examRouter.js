const express = require('express');
const router = express.Router();
const examController = require('../controller/examController');
const authMiddleware = require('../middleware/authMiddleware');

// Semua rute ujian wajib login
router.use(authMiddleware);

router.post('/', examController.createNewExam);
router.get('/', examController.getExams);
router.get('/:id', examController.getExamDetails);
router.put('/:id', examController.saveAndPublishExam); // Dipakai untuk update config & simpan soal bulk
router.delete('/:id', examController.removeExam);
router.post('/:id/submit', examController.submitExamResult);
router.get('/student/:studentId/results', examController.getStudentExamResults);
router.get('/:id/results', examController.getExamResultsByExam);

module.exports = router;
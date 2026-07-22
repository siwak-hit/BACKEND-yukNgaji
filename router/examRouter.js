const express = require('express');
const router = express.Router();
const examController = require('../controller/examController');
const { verifyToken } = require('../middleware/authMiddleware');

// =========================================================
// RUTE PUBLIK (TIDAK BUTUH TOKEN) - UNTUK LOBBY MURID
// =========================================================
// 1. Ambil info ujian & daftar nama murid
router.get('/public/lobby/:id', examController.getPublicExamLobby);
// 2. Kirim foto wajah & dapatkan token
router.post('/public/login', examController.studentExamLogin);

// =========================================================
// RUTE PRIVATE (WAJIB LOGIN/PUNYA TOKEN)
// =========================================================
router.use(verifyToken);

router.post('/', examController.createNewExam);
router.get('/', examController.getExams);
router.get('/play/:id', examController.getPlayExamDetails);
router.get('/student/:studentId/results', examController.getStudentExamResults);
router.post('/buy-time', examController.buyExamTime);
router.post('/buy-hint', examController.buyExamHint);
router.post('/tutorial/complete', examController.completeExamTutorial);

// [BARU] Ambil soal dari bank soal lama untuk dicetak
router.get('/questions-for-print', examController.getQuestionsForPrint);


// Perpanjangan deadline per-murid (ujian daring) — mirror PR
router.post('/:id/grant-extension', examController.grantExamExtension);

// Retake permissions
router.post('/:id/retake-permissions', examController.createRetakePermission);
router.get('/:id/retake-permissions/check', examController.checkRetakePermission);
router.post('/:id/retake-permissions/use', examController.markRetakePermissionUsed);

// Generic exam routes taruh setelah route spesifik
router.get('/:id', examController.getExamDetails);
router.put('/:id', examController.saveAndPublishExam);
router.delete('/:id', examController.removeExam);
router.post('/:id/submit', examController.submitExamResult);
router.get('/:id/results', examController.getExamResultsByExam);

module.exports = router;

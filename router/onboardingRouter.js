const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); 
const onboardingController = require('../controller/onboardingController');
const uploadController = require('../controller/uploadController'); // File yang baru diupdate
const authMiddleware = require('../middleware/authMiddleware');
const { 
    getQuestionsSummary,
    getQuestionsSummaryAll,
    updateQuestion,
    deleteQuestion,
    retryWrongAnswers
} = require('../controller/onboardingController');

router.use(authMiddleware);

// Endpoint submission nilai siswa
router.post('/', onboardingController.submitOnboarding);

// Endpoint Guru upload template TXT bank soal
router.post('/upload-template', onboardingController.saveParsedQuestions);
router.post('/submit-grade', onboardingController.submitAndGradeAnswers);

// RUTE GET PERLU DIURUTKAN DENGAN BENAR
router.get('/questions/summary',        authMiddleware, getQuestionsSummary); 
router.get('/questions/summary-all',    authMiddleware, getQuestionsSummaryAll); // <--- TAMBAHKAN BARIS INI
router.put('/questions/:id',            authMiddleware, updateQuestion);
router.delete('/questions/:id',         authMiddleware, deleteQuestion);

// Rute Dinamis Param /:subject (HARUS DI BAWAH SUMMARY)
router.get('/questions/:subject', onboardingController.getQuestions);
router.get('/available-weeks/:subject', onboardingController.getAvailableWeeks);
router.get('/status', onboardingController.getCompletionStatus);
router.post('/retry', onboardingController.retryWrongAnswers);


module.exports = router;
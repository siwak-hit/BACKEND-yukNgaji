const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); 
const onboardingController = require('../controller/onboardingController');
const uploadController = require('../controller/uploadController'); // File yang baru diupdate
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Endpoint submission nilai siswa (yang kita buat sebelumnya)
router.post('/', onboardingController.submitOnboarding);

// Endpoint BARU: Guru upload template TXT bank soal
router.post('/upload-template', onboardingController.saveParsedQuestions);
router.post('/submit-grade', onboardingController.submitAndGradeAnswers);


router.get('/questions/:subject', onboardingController.getQuestions);
router.get('/available-weeks/:subject', onboardingController.getAvailableWeeks);
router.get('/status', onboardingController.getCompletionStatus);


module.exports = router;
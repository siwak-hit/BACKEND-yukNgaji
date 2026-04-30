const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); 
const onboardingController = require('../controller/onboardingController');
// const uploadController = require('../controller/uploadController'); 

// [PERBAIKAN KUNCI]: Import generatePRLink dari authMiddleware
const { verifyToken, generatePRLink } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.post('/', onboardingController.submitOnboarding);
router.post('/upload-template', onboardingController.saveParsedQuestions);
router.post('/submit-grade', onboardingController.submitAndGradeAnswers);

router.get('/questions/summary',        onboardingController.getQuestionsSummary); 
router.get('/questions/summary-all',    onboardingController.getQuestionsSummaryAll); 
router.put('/questions/:id',            onboardingController.updateQuestion);
router.delete('/questions/:id',         onboardingController.deleteQuestion);

router.get('/questions/:subject', onboardingController.getQuestions);
router.get('/available-weeks/:subject', onboardingController.getAvailableWeeks);
router.get('/status', onboardingController.getCompletionStatus);
router.post('/retry', onboardingController.retryWrongAnswers);

// [PERBAIKAN KUNCI]: Panggil langsung generatePRLink (tanpa controller)
router.post('/generate-pr-link', generatePRLink);
router.get('/leaderboard-pr', onboardingController.getPRLeaderboard);

router.post('/pr-lock', onboardingController.togglePRLock);
router.get('/pr-locks/:subject', onboardingController.getPRLocks);

router.post('/upload-satpam', onboardingController.uploadSatpamPhoto);

module.exports = router;
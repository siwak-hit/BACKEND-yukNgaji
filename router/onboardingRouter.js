const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); 
const onboardingController = require('../controller/onboardingController');
const { verifyToken, generatePRLink } = require('../middleware/authMiddleware');

// =========================================================================
// [FIX] PUBLIC ENDPOINT (Taruh di atas verifyToken biar gak kena 401)
// =========================================================================
router.get('/system/status', onboardingController.getSystemStatus);

// =========================================================================
// MIDDLEWARE AUTENTIKASI (Semua rute di bawah ini butuh token)
// =========================================================================
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

router.post('/generate-pr-link', generatePRLink);
router.get('/leaderboard-pr', onboardingController.getPRLeaderboard);

router.post('/pr-lock', onboardingController.togglePRLock);
router.get('/pr-locks/:subject', onboardingController.getPRLocks);

router.post('/upload-satpam', onboardingController.uploadSatpamPhoto);
router.post('/pr-extension', onboardingController.grantExtension);
router.get('/pr-locks-detail', onboardingController.getPRLockDetail);

router.post('/transfer-reward', onboardingController.transferRewardCoin);
router.get('/check-satpam', onboardingController.checkSatpamStatus);

// [BARU] Endpoint POST khusus Ustadz untuk ngubah saklar maintenance
router.post('/system/status', onboardingController.updateSystemStatus);
router.get('/peer-help', onboardingController.getPeerHelp);

module.exports = router;
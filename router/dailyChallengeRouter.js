const express = require('express');
const router = express.Router();
const dailyChallengeController = require('../controller/dailyChallengeController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/state', dailyChallengeController.getDailyChallengeState);
router.post('/submit-level', dailyChallengeController.submitDailyChallengeLevel);
router.get('/sentence', dailyChallengeController.getDailyChallengeSentence);

module.exports = router;

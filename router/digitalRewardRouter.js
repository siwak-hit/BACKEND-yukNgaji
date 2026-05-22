const express = require('express');
const router = express.Router();
const rewardController = require('../controller/digitalRewardController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/unlocked/:studentId', verifyToken, rewardController.fetchUnlocked);
router.post('/buy', verifyToken, rewardController.buyMedia);

module.exports = router;

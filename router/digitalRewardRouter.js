const express = require('express');
const router = express.Router();
const rewardController = require('../controller/digitalRewardController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/unlocked/:studentId', verifyToken, rewardController.fetchUnlocked);
router.post('/buy', verifyToken, rewardController.buyMedia);

router.post('/transfer', verifyToken, rewardController.executeTransfer);
router.post('/game-win', verifyToken, rewardController.executeGameWin);

router.get('/notifications/:studentId', verifyToken, rewardController.fetchTransferNotifications);
router.post('/notifications/:studentId/clear', verifyToken, rewardController.clearTransferNotifications);
router.post('/gacha-ramean-win', verifyToken, rewardController.executeGachaRameanWin);

module.exports = router;

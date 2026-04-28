const express = require('express');
const router = express.Router();
const shopController = require('../controller/shopController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/buy', shopController.buyItem);
router.post('/use-item', shopController.useItem); // <-- [BARU] Endpoint Pakai Item
router.post('/attack', shopController.attackFriend);
router.get('/peers', shopController.getPeers); 
router.get('/notifications', shopController.getAttackNotifications);
router.post('/notifications/read', shopController.markNotificationsRead);
router.post('/claim-bonus', shopController.claimWelcomeBonus);

module.exports = router;
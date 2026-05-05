const express = require('express');
const router = express.Router();
const shopController = require('../controller/shopController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.post('/buy', shopController.buyItem);
router.post('/use-item', shopController.useItem); // <-- [BARU] Endpoint Pakai Item
router.post('/attack', shopController.attackFriend);
router.get('/peers', shopController.getPeers); 
router.get('/notifications', shopController.getAttackNotifications);
router.post('/notifications/read', shopController.markNotificationsRead);
router.post('/claim-bonus', shopController.claimWelcomeBonus);
router.post('/purchase-effect', shopController.purchaseInstantEffect);

module.exports = router;
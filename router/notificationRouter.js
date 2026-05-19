const express = require('express');
const router = express.Router();
const notifController = require('../controller/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/', notifController.getNotifs);
router.get('/:id/detail', notifController.getNotifDetail);

router.delete('/clear', notifController.clearAllNotifs);
router.delete('/:id', notifController.deleteNotif);

module.exports = router;

const express = require('express');
const router = express.Router();
const notifController = require('../controller/notificationController');

router.get('/', notifController.getNotifs);
router.delete('/clear', notifController.clearAllNotifs); // Harus di atas /:id
router.delete('/:id', notifController.deleteNotif);

module.exports = router;
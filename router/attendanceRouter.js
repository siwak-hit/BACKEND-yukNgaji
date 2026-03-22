// router/attendanceRouter.js
const express = require('express');
const router = express.Router();
const attendanceController = require('../controller/attendanceController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.get('/today-status', attendanceController.getTodayStatus);
router.get('/', attendanceController.getAttendances);
router.post('/', attendanceController.saveAttendance);

module.exports = router;
const express = require('express');
const router = express.Router();
const gradeController = require('../controller/gradeController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.post('/manual', gradeController.saveManualGrade);

module.exports = router;

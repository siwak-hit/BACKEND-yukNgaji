const express = require('express');
const router = express.Router();
const insightController = require('../controller/insightController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

// Endpoint Global Dashboard
router.get('/dashboard', insightController.getGlobalDashboard);
router.get('/class', insightController.getClassInsights);
router.get('/filters', insightController.getFilters);
router.get('/exam-missing', insightController.getExamMissingStatus);

module.exports = router;
